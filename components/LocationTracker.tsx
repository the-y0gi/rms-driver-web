"use client";

import { useEffect, useRef } from "react";
import api from "../lib/api";
import { getDistanceMeters, getBearing, Coordinates } from "../lib/geo";

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
  const restaurantCoordsRef = useRef<Coordinates | null>(null);
  const latestPosRef = useRef<Coordinates | null>(null);

  // Dynamic thresholds based on phase
  const distanceThreshold = phase === "en-route" ? 50 : 200; // 50m en-route, 200m returning
  const heartbeatInterval = 30000; // 30 seconds heartbeat for smooth tracking

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      console.warn("Geolocation is not supported by this browser.");
      return;
    }

    const sendLocationToServer = async (coords: Coordinates) => {
      try {
        const bearing = lastSentPosRef.current ? getBearing(lastSentPosRef.current, coords) : 0;
        await api.post(`/delivery/driver/${driverId}/location`, {
          lat: coords.lat,
          lng: coords.lng,
          bearing,
          phase,
          activeOrderIds,
        });
        
        lastSentPosRef.current = coords;
        lastSentTimeRef.current = Date.now();
        console.log(`[LocationTracker] Relayed location to server:`, coords);
      } catch (err) {
        console.error("[LocationTracker] Failed to relay location to server:", err);
      }
    };

    // Fetch initial location immediately on mount
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const currentCoords: Coordinates = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        latestPosRef.current = currentCoords;
        if (!restaurantCoordsRef.current) {
          restaurantCoordsRef.current = currentCoords;
        }
        sendLocationToServer(currentCoords);
      },
      (err) => console.warn("[LocationTracker] Initial getCurrentPosition failed:", err),
      { enableHighAccuracy: false, timeout: 5000, maximumAge: 30000 }
    );

    const handleNewLocation = (position: GeolocationPosition) => {
      const currentCoords: Coordinates = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      if (!restaurantCoordsRef.current) {
        restaurantCoordsRef.current = currentCoords;
      }
      latestPosRef.current = currentCoords;

      const distance = lastSentPosRef.current
        ? getDistanceMeters(lastSentPosRef.current, currentCoords)
        : Infinity;

      // Real-time movement trigger: If they moved more than the threshold, send immediately
      if (distance >= distanceThreshold) {
        sendLocationToServer(currentCoords);
      }

      // Return trip check: auto-stop when within 200m of restaurant
      if (phase === "returning" && !isCompletedRef.current && restaurantCoordsRef.current) {
        const distanceToRestaurant = getDistanceMeters(currentCoords, restaurantCoordsRef.current);
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
      (err) => console.warn("[LocationTracker] watchPosition error:", err),
      {
        enableHighAccuracy: false,
        timeout: 15000,
        maximumAge: 10000,
      }
    );

    // Heartbeat timer to periodically send location updates, critical for stationary drivers and new customer connections
    const heartbeatTimer = setInterval(() => {
      if (latestPosRef.current) {
        sendLocationToServer(latestPosRef.current);
      }
    }, heartbeatInterval);

    // Cleanup
    return () => {
      clearInterval(heartbeatTimer);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [driverId, restaurantId, activeOrderIds, phase, distanceThreshold, heartbeatInterval, onReachedRestaurant]);

  return null; // Invisible component
}
