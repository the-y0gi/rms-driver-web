"use client";

import { useEffect, useRef } from "react";
import { getPusherClient } from "../lib/pusher";
import { getDistanceMeters, getBearing, Coordinates } from "../lib/geo";

// We will dynamically capture the first location as the restaurant location for local testing

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
  const isRestaurantSubscribed = useRef<boolean>(false);

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
    
    // Track channel subscription status to avoid "triggered before channel subscription succeeded" console errors
    const subscribedOrderChannels = new Set<string>();

    // Subscribe to each active order's private-order-{orderId} channel (en-route only)
    const orderChannels =
      phase === "en-route"
        ? activeOrderIds.map((oid) => {
            const ch = pusher.subscribe(`private-order-${oid}`);
            ch.bind("pusher:subscription_succeeded", () => {
              subscribedOrderChannels.add(oid);
              console.log(`[LocationTracker] Subscribed to order channel: ${oid}`);
              // Trigger an initial ping immediately on this order channel now that it's subscribed
              if (latestPosRef.current) {
                const currentCoords = latestPosRef.current;
                const bearing = lastSentPosRef.current ? getBearing(lastSentPosRef.current, currentCoords) : 0;
                ch.trigger("client-driver-location", {
                  driverId,
                  lat: currentCoords.lat,
                  lng: currentCoords.lng,
                  bearing,
                  timestamp: Date.now(),
                  phase,
                });
              }
            });
            return ch;
          })
        : [];

    // Fetch initial location immediately on mount so we don't have to wait for watchPosition (crucial for desktop/wifi testing)
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
        console.log("[LocationTracker] Initial position populated:", currentCoords);
        
        // If restaurant channel is already subscribed, trigger initial broadcast
        if (isRestaurantSubscribed.current) {
          requestLocationHandler();
        }
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
        // Assume the first location the driver broadcasts is the restaurant base (for local testing)
        restaurantCoordsRef.current = currentCoords;
      }

      latestPosRef.current = currentCoords;

      const now = Date.now();
      
      // Calculate distance from last sent position
      const distance = lastSentPosRef.current
        ? getDistanceMeters(lastSentPosRef.current, currentCoords)
        : Infinity;

      // Real-time movement trigger: If they moved more than the threshold, send immediately
      if (distance >= distanceThreshold) {
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
        if (isRestaurantSubscribed.current) {
          restaurantChannel.trigger("client-driver-location", payload);
        }

        if (phase === "en-route") {
          activeOrderIds.forEach((oid, idx) => {
            if (subscribedOrderChannels.has(oid) && orderChannels[idx]) {
              orderChannels[idx].trigger("client-driver-location", payload);
            }
          });
        }

        // Update refs
        lastSentPosRef.current = currentCoords;
        lastSentTimeRef.current = now;
        console.log(`[LocationTracker] Moved. Sent location: ${JSON.stringify(payload)}`);
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
        enableHighAccuracy: false, // Low accuracy is much faster/stable on desktop browsers and non-GPS testing
        timeout: 15000,
        maximumAge: 10000,
      }
    );

    const requestLocationHandler = () => {
      // Use the latest known position for instant reply instead of waiting for a new GPS fix
      if (!latestPosRef.current) return;
      
      const currentCoords = latestPosRef.current;
      const bearing = lastSentPosRef.current ? getBearing(lastSentPosRef.current, currentCoords) : 0;
      const payload = {
        driverId,
        lat: currentCoords.lat,
        lng: currentCoords.lng,
        bearing,
        timestamp: Date.now(),
        phase,
      };
      
      if (isRestaurantSubscribed.current) {
        restaurantChannel.trigger("client-driver-location", payload);
      }
      if (phase === "en-route") {
        activeOrderIds.forEach((oid, idx) => {
          if (subscribedOrderChannels.has(oid) && orderChannels[idx]) {
            orderChannels[idx].trigger("client-driver-location", payload);
          }
        });
      }
    };

    // Listen on order channels for request location triggers
    if (phase === "en-route") {
      orderChannels.forEach((ch) => {
        ch.bind("client-request-location", requestLocationHandler);
      });
    }

    // Trigger initial location ping once the restaurant channel successfully subscribes
    restaurantChannel.bind("pusher:subscription_succeeded", () => {
      isRestaurantSubscribed.current = true;
      if (latestPosRef.current) {
        requestLocationHandler();
      }
    });

    // Heartbeat timer to periodically send location updates, critical for stationary drivers (laptops/simulators)
    const heartbeatTimer = setInterval(() => {
      if (latestPosRef.current) {
        requestLocationHandler();
      }
    }, heartbeatInterval);

    // Cleanup
    return () => {
      clearInterval(heartbeatTimer);
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
