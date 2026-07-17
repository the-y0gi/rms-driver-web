"use client";

import { useEffect, useRef, useCallback } from "react";
import { getPusherClient } from "../lib/pusher";
import { getDistanceMeters, getBearing, Coordinates } from "../lib/geo";
import type { Channel } from "pusher-js";

interface LocationTrackerProps {
  driverId: string;
  restaurantId: string;
  activeOrderIds: string[];
  phase: "en-route" | "returning";
  onReachedRestaurant?: () => void;
}

// ─── Speed-based adaptive throttle intervals (ms) ───
const INTERVAL_HIGHWAY = 3000;   // > 30 km/h  → every 3s
const INTERVAL_CITY = 5000;      // 10-30 km/h → every 5s
const INTERVAL_SLOW = 10000;     // < 10 km/h  → every 10s
const INTERVAL_STATIONARY = 60000; // not moving → every 60s (heartbeat)

const STATIONARY_DISTANCE_M = 2; // Less than 2m movement = stationary

function getMinInterval(speedKmh: number, distanceFromLast: number): number {
  // If barely moved, driver is stationary (red light, parked, etc.)
  if (distanceFromLast < STATIONARY_DISTANCE_M) return INTERVAL_STATIONARY;
  if (speedKmh > 30) return INTERVAL_HIGHWAY;
  if (speedKmh >= 10) return INTERVAL_CITY;
  return INTERVAL_SLOW;
}

export default function LocationTracker({
  driverId,
  restaurantId,
  activeOrderIds,
  phase,
  onReachedRestaurant,
}: LocationTrackerProps) {
  const watchIdRef = useRef<number | null>(null);
  const lastSentPosRef = useRef<Coordinates | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const isCompletedRef = useRef<boolean>(false);
  const restaurantCoordsRef = useRef<Coordinates | null>(null);
  const latestPosRef = useRef<Coordinates | null>(null);
  const latestSpeedRef = useRef<number>(0);
  const orderChannelsRef = useRef<Channel[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Stable reference to onReachedRestaurant to avoid effect re-runs
  const onReachedRef = useRef(onReachedRestaurant);
  onReachedRef.current = onReachedRestaurant;

  // Stable references for values used in the broadcast function
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const activeOrderIdsRef = useRef(activeOrderIds);
  activeOrderIdsRef.current = activeOrderIds;

  // ─── Broadcast location via Pusher client events ───
  const broadcastLocation = useCallback((coords: Coordinates, speed: number) => {
    const now = Date.now();
    const distanceFromLast = lastSentPosRef.current
      ? getDistanceMeters(lastSentPosRef.current, coords)
      : Infinity;
    const timeSinceLast = now - lastSentTimeRef.current;

    // Smart adaptive throttle: skip if too soon based on current speed
    const minInterval = getMinInterval(speed, distanceFromLast);
    if (timeSinceLast < minInterval && lastSentPosRef.current) {
      return; // Throttled — too soon to send
    }

    const bearing = lastSentPosRef.current
      ? getBearing(lastSentPosRef.current, coords)
      : 0;

    const payload = {
      driverId,
      lat: coords.lat,
      lng: coords.lng,
      bearing,
      speed,
      phase: phaseRef.current,
      timestamp: now,
    };

    try {
      const pusher = getPusherClient();

      // 1. Trigger on restaurant channel (branch dashboard receives this)
      const restaurantChannel = pusher.channel(`private-restaurant-${restaurantId}`);
      if (restaurantChannel?.subscribed) {
        restaurantChannel.trigger("client-driver-location", payload);
      }

      // 2. Trigger on each active order channel (user tracking maps receive this)
      orderChannelsRef.current.forEach((ch) => {
        if (ch?.subscribed) {
          ch.trigger("client-driver-location", payload);
        }
      });

      // Update refs after successful broadcast
      lastSentPosRef.current = coords;
      lastSentTimeRef.current = now;
    } catch (err) {
      console.error("[LocationTracker] Failed to broadcast location:", err);
    }
  }, [driverId, restaurantId]);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      console.warn("[LocationTracker] Geolocation is not supported.");
      return;
    }

    const pusher = getPusherClient();

    // ─── Subscribe to restaurant channel (may already exist from dashboard) ───
    const restaurantChannel = pusher.subscribe(`private-restaurant-${restaurantId}`);

    // ─── Subscribe to each active order channel ───
    const orderChannels = activeOrderIds.map((orderId) =>
      pusher.subscribe(`private-order-${orderId}`)
    );
    orderChannelsRef.current = orderChannels;

    // ─── Send initial location immediately ───
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const speed = position.coords.speed
          ? position.coords.speed * 3.6 // m/s → km/h
          : 0;

        latestPosRef.current = coords;
        latestSpeedRef.current = speed;

        if (!restaurantCoordsRef.current) {
          restaurantCoordsRef.current = coords;
        }

        // Force send initial location (bypass throttle)
        lastSentTimeRef.current = 0;
        broadcastLocation(coords, speed);
      },
      (err) => console.warn("[LocationTracker] Initial position failed:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // ─── Watch position with GPS accuracy ───
    const handleNewPosition = (position: GeolocationPosition) => {
      const coords: Coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      // Speed: prefer GPS-provided speed, fallback to distance/time calculation
      let speedKmh = position.coords.speed !== null && position.coords.speed >= 0
        ? position.coords.speed * 3.6
        : 0;

      // Fallback speed calculation if GPS doesn't provide speed
      if (speedKmh === 0 && latestPosRef.current && lastSentTimeRef.current > 0) {
        const dist = getDistanceMeters(latestPosRef.current, coords);
        const timeDiffSec = (Date.now() - lastSentTimeRef.current) / 1000;
        if (timeDiffSec > 0) {
          speedKmh = (dist / timeDiffSec) * 3.6;
        }
      }

      latestPosRef.current = coords;
      latestSpeedRef.current = speedKmh;

      if (!restaurantCoordsRef.current) {
        restaurantCoordsRef.current = coords;
      }

      // Broadcast with smart throttle (function decides whether to send or skip)
      broadcastLocation(coords, speedKmh);

      // Return trip: auto-detect when within 200m of restaurant
      if (
        phaseRef.current === "returning" &&
        !isCompletedRef.current &&
        restaurantCoordsRef.current
      ) {
        const distToRestaurant = getDistanceMeters(coords, restaurantCoordsRef.current);
        if (distToRestaurant < 200) {
          isCompletedRef.current = true;
          console.log("[LocationTracker] Reached restaurant!");
          onReachedRef.current?.();
        }
      }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(
      handleNewPosition,
      (err) => console.warn("[LocationTracker] watchPosition error:", err),
      {
        enableHighAccuracy: true,  // Real GPS hardware
        timeout: 10000,
        maximumAge: 0,             // Always fresh position, no cache
      }
    );

    // ─── Heartbeat: ensures location is sent even when stationary ───
    // Also critical for new subscribers (branch reload / user opens map)
    // to receive driver position within 60 seconds max
    heartbeatRef.current = setInterval(() => {
      if (latestPosRef.current) {
        // Force send by resetting lastSentTime (bypass throttle)
        lastSentTimeRef.current = 0;
        broadcastLocation(latestPosRef.current, latestSpeedRef.current);
      }
    }, INTERVAL_STATIONARY);

    // ─── Cleanup ───
    return () => {
      // Stop GPS watching
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }

      // Stop heartbeat
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }

      // Unsubscribe from order channels only (restaurant channel stays for dashboard)
      orderChannels.forEach((ch) => {
        pusher.unsubscribe(ch.name);
      });
      orderChannelsRef.current = [];
    };
  }, [driverId, restaurantId, activeOrderIds, broadcastLocation]);

  return null; // Invisible component — only broadcasts GPS via Pusher
}
