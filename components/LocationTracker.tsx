"use client";

import { useEffect, useRef } from "react";
import { getPusherClient } from "../lib/pusher";
import { getDistanceMeters, getBearing, Coordinates } from "../lib/geo";

// Medicine Hat Branch Location (matches restaurantLocation in branch frontend)
export const RESTAURANT_COORDS: Coordinates = { lat: 50.0280, lng: -110.6770 };

interface LocationTrackerProps {
  driverId: string;
  restaurantId: string;
  activeOrderIds: string[];
  phase: "en-route" | "returning";
  onReachedRestaurant?: () => void;
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

  // Dynamic thresholds based on phase
  const distanceThreshold = phase === "en-route" ? 50 : 200; // 50m en-route, 200m returning
  const heartbeatInterval = phase === "en-route" ? 30000 : 60000; // 30s en-route, 60s returning

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      return;
    }

    const pusher = getPusherClient();
    
    // Subscribe to private-restaurant-{restaurantId}
    const restaurantChannel = pusher.subscribe(`private-restaurant-${restaurantId}`);
    
    // Subscribe to each active order's private-order-{orderId} channel (en-route only)
    const orderChannels =
      phase === "en-route"
        ? activeOrderIds.map((oid) => pusher.subscribe(`private-order-${oid}`))
        : [];

    const handleNewLocation = (position: GeolocationPosition) => {
      const currentCoords: Coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      const now = Date.now();
      
      // Calculate distance from last sent position
      const distance = lastSentPosRef.current
        ? getDistanceMeters(lastSentPosRef.current, currentCoords)
        : Infinity;
        
      const timeSinceLastSend = now - lastSentTimeRef.current;

      // Smart filter: Send only if moved > distanceThreshold OR heartbeat elapsed
      if (distance >= distanceThreshold || timeSinceLastSend >= heartbeatInterval) {
        const bearing = lastSentPosRef.current
          ? getBearing(lastSentPosRef.current, currentCoords)
          : 0;

        const payload = {
          driverId,
          lat: currentCoords.lat,
          lng: currentCoords.lng,
          bearing,
          timestamp: now,
          phase,
        };

        // Broadcast P2P client-driver-location event
        // 1. Send to restaurant channel (branch dashboard)
        if (restaurantChannel.subscribed) {
          restaurantChannel.trigger("client-driver-location", payload);
        }

        // 2. Send to all active order channels (user tracking frontends)
        if (phase === "en-route") {
          orderChannels.forEach((ch) => {
            if (ch.subscribed) {
              ch.trigger("client-driver-location", payload);
            }
          });
        }

        // Update refs
        lastSentPosRef.current = currentCoords;
        lastSentTimeRef.current = now;
        console.log(`[LocationTracker] Sent location: ${JSON.stringify(payload)}`);
      }

      // Return trip check: auto-stop when within 200m of restaurant
      if (phase === "returning" && !isCompletedRef.current) {
        const distanceToRestaurant = getDistanceMeters(currentCoords, RESTAURANT_COORDS);
        if (distanceToRestaurant < 200) {
          isCompletedRef.current = true;
          console.log("[LocationTracker] Reached restaurant! Triggering onReachedRestaurant.");
          if (onReachedRestaurant) {
            onReachedRestaurant();
          }
        }
      }
    };

    // Watch position
    watchIdRef.current = navigator.geolocation.watchPosition(
      handleNewLocation,
      (err) => console.error("Geolocation error:", err),
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    // Listen for client requests to force-send location (e.g. user page opened)
    const requestLocationHandler = () => {
      // Force send immediately
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const currentCoords = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          };
          const bearing = lastSentPosRef.current ? getBearing(lastSentPosRef.current, currentCoords) : 0;
          const payload = {
            driverId,
            lat: currentCoords.lat,
            lng: currentCoords.lng,
            bearing,
            timestamp: Date.now(),
            phase,
          };
          if (restaurantChannel.subscribed) {
            restaurantChannel.trigger("client-driver-location", payload);
          }
          if (phase === "en-route") {
            orderChannels.forEach((ch) => {
              if (ch.subscribed) {
                ch.trigger("client-driver-location", payload);
              }
            });
          }
        },
        (err) => console.error("Immediate geo request failed", err),
        { enableHighAccuracy: true }
      );
    };

    // Listen on order channels for request location triggers
    if (phase === "en-route") {
      orderChannels.forEach((ch) => {
        ch.bind("client-request-location", requestLocationHandler);
      });
    }

    // Cleanup
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      
      // Unsubscribe from order channels
      if (phase === "en-route") {
        activeOrderIds.forEach((oid) => {
          pusher.unsubscribe(`private-order-${oid}`);
        });
      }
      pusher.unsubscribe(`private-restaurant-${restaurantId}`);
    };
  }, [driverId, restaurantId, activeOrderIds, phase, distanceThreshold, heartbeatInterval, onReachedRestaurant]);

  return null; // Invisible component
}
