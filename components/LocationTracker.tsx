"use client";

import { useEffect, useRef, useCallback } from "react";
import { getPusherClient } from "../lib/pusher";
import { getDistanceMeters, getBearing, Coordinates } from "../lib/geo";
import type { Channel } from "pusher-js";

interface LocationTrackerProps {
  driverId: string;
  restaurantId: string;
  restaurantCoords?: { lat: number; lng: number };
  activeOrderIds: string[];
  phase: "en-route" | "returning" | "available";
  onReachedRestaurant?: () => void;
}

// Fallback restaurant coordinates (used only if restaurantCoords prop is missing)
const DEFAULT_RESTAURANT_COORDS: Coordinates = { lat: 22.1818, lng: 78.7618 };

// GEOFENCE_RADIUS_M: distance in meters within which a driver is considered "at restaurant"
const STATIONARY_DISTANCE_M = 2; // Less than 2m movement = stationary
const GEOFENCE_RADIUS_M = 100; // Geofence radius of 100m around restaurant

// ─── Speed-based adaptive throttle intervals (ms) ───
const INTERVAL_HIGHWAY = 3000;     // > 30 km/h  → every 3s
const INTERVAL_CITY = 5000;        // 10-30 km/h → every 5s
const INTERVAL_SLOW = 10000;       // < 10 km/h  → every 10s
const INTERVAL_STATIONARY = 60000; // not moving → every 60s (heartbeat)

function getMinInterval(
  phase: "en-route" | "returning" | "available",
  speedKmh: number,
  distanceFromLast: number
): number {
  if (phase === "en-route") {
    if (distanceFromLast < STATIONARY_DISTANCE_M) return INTERVAL_STATIONARY;
    if (speedKmh > 30) return INTERVAL_HIGHWAY;
    if (speedKmh >= 10) return INTERVAL_CITY;
    return INTERVAL_SLOW;
  }

  if (phase === "returning") {
    if (distanceFromLast < STATIONARY_DISTANCE_M) return 120000; // 2 min heartbeat when stationary
    if (speedKmh > 30) return 20000; // 20s highway
    if (speedKmh >= 10) return 30000; // 30s city
    return 45000; // 45s slow
  }

  // available phase
  if (distanceFromLast < STATIONARY_DISTANCE_M) return 180000; // 3 min heartbeat when stationary
  return 60000; // 60s when moving
}

export default function LocationTracker({
  driverId,
  restaurantId,
  restaurantCoords,
  activeOrderIds,
  phase,
  onReachedRestaurant,
}: LocationTrackerProps) {
  // Resolve restaurant coords — prop takes priority, fallback to default
  const RESTAURANT_COORDS: Coordinates = restaurantCoords && restaurantCoords.lat && restaurantCoords.lng
    ? restaurantCoords
    : DEFAULT_RESTAURANT_COORDS;
  const watchIdRef = useRef<number | null>(null);
  const lastSentPosRef = useRef<Coordinates | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const isCompletedRef = useRef<boolean>(false);
  const latestPosRef = useRef<Coordinates | null>(null);
  const latestSpeedRef = useRef<number>(0);
  const orderChannelsRef = useRef<Channel[]>([]);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSnappedRef = useRef<boolean>(false);
  const wakeLockSentinelRef = useRef<any>(null);

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
    const distanceToRestaurant = getDistanceMeters(coords, RESTAURANT_COORDS);

    let finalCoords = coords;
    let finalSpeed = speed;

    // ─── Geofencing Optimization ───
    if (phaseRef.current === "available" && distanceToRestaurant < GEOFENCE_RADIUS_M) {
      if (hasSnappedRef.current) {
        // Already snapped and broadcasted. Suppress subsequent triggers to optimize Pusher count.
        return;
      }
      // First time inside geofence: Snap to restaurant coordinates and broadcast once
      finalCoords = RESTAURANT_COORDS;
      finalSpeed = 0;
      hasSnappedRef.current = true;
      console.log("[LocationTracker] Snapping driver to restaurant geofence.");
    } else {
      // Outside geofence or not available: Resume normal tracking
      hasSnappedRef.current = false;
    }

    const distanceFromLast = lastSentPosRef.current
      ? getDistanceMeters(lastSentPosRef.current, finalCoords)
      : Infinity;
    const timeSinceLast = now - lastSentTimeRef.current;

    // Smart adaptive throttle: skip if too soon based on current speed/phase
    const minInterval = getMinInterval(phaseRef.current, finalSpeed, distanceFromLast);
    if (timeSinceLast < minInterval && lastSentPosRef.current && !hasSnappedRef.current) {
      return; // Throttled — too soon to send (unless it's the first snap event)
    }

    const bearing = lastSentPosRef.current
      ? getBearing(lastSentPosRef.current, finalCoords)
      : 0;

    const payload = {
      driverId,
      lat: finalCoords.lat,
      lng: finalCoords.lng,
      bearing,
      speed: finalSpeed,
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
      lastSentPosRef.current = finalCoords;
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

    // ─── PWA Screen Wake Lock API — Keeps screen awake during duty so GPS never dies ───
    const requestWakeLock = async () => {
      if (typeof window !== "undefined" && "wakeLock" in navigator) {
        try {
          wakeLockSentinelRef.current = await (navigator as any).wakeLock.request("screen");
          console.log("[PWA WakeLock] Screen Wake Lock active for GPS tracking.");
        } catch (err) {
          console.warn("[PWA WakeLock] Screen Wake Lock request failed:", err);
        }
      }
    };

    requestWakeLock();

    // Re-acquire WakeLock if driver switches back to app
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && !wakeLockSentinelRef.current) {
        requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

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

      // Broadcast with smart throttle (function decides whether to send or skip)
      broadcastLocation(coords, speedKmh);

      // Return trip: auto-detect when within 200m of restaurant
      if (
        phaseRef.current === "returning" &&
        !isCompletedRef.current
      ) {
        const distToRestaurant = getDistanceMeters(coords, RESTAURANT_COORDS);
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

      // Release PWA Screen WakeLock
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (wakeLockSentinelRef.current) {
        wakeLockSentinelRef.current.release().catch(() => {});
        wakeLockSentinelRef.current = null;
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
