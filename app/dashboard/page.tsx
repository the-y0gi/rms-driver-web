"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";
import { getPusherClient } from "../../lib/pusher";
import DeliveryCard from "../../components/DeliveryCard";
import LocationTracker from "../../components/LocationTracker";
import { LogOut, Power, Truck, User, RefreshCw, Compass, CheckCircle } from "lucide-react";

interface Vehicle {
  _id: string;
  number: string;
  label: string;
}

interface DriverSession {
  _id: string;
  driverId: string;
  name: string;
  phone: string;
  color: string;
  status: "available" | "on-delivery" | "returning" | "offline";
  restaurantId: string;
  assignedVehicle: Vehicle | null;
}

export default function DashboardPage() {
  const router = useRouter();
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);

  // Check compulsory GPS
  useEffect(() => {
    if (!navigator.geolocation) {
      setHasLocationPermission(false);
      return;
    }

    const checkLocation = () => {
      navigator.geolocation.getCurrentPosition(
        () => setHasLocationPermission(true),
        (err) => {
          console.error("Compulsory Location error:", err);
          setHasLocationPermission(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    };

    checkLocation();

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' as any }).then((result) => {
        result.onchange = () => {
          if (result.state === 'granted') {
            setHasLocationPermission(true);
          } else {
            setHasLocationPermission(false);
          }
        };
      });
    }
  }, []);

  // Load driver session and sync with backend
  useEffect(() => {
    const saved = localStorage.getItem("driver_session");
    if (!saved) {
      router.push("/");
      return;
    }
    const session = JSON.parse(saved);
    setDriver(session);

    // Sync status with database to prevent reset on reload & auto-logout if checked out on POS
    api.get(`/delivery/driver/${session._id}`)
      .then((res) => {
        if (res.data.success && res.data.data) {
          const fresh = res.data.data;
          if (fresh.status === "offline" || fresh.posCheckedIn === false) {
            localStorage.removeItem("driver_session");
            router.push("/?error=checked_out");
            return;
          }
          setDriver(fresh);
          localStorage.setItem("driver_session", JSON.stringify(fresh));
        }
      })
      .catch((err) => console.error("Sync error:", err));
  }, [router]);

  // Fetch active assignments for driver
  const fetchAssignments = useCallback(async (driverId: string) => {
    try {
      const response = await api.get(`/delivery/driver/${driverId}/assignments`);
      if (response.data.success) {
        setAssignments(response.data.data);
      }
    } catch (err) {
      console.error("Error fetching assignments:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sync state on load
  useEffect(() => {
    if (!driver) return;
    fetchAssignments(driver._id);

    // Pusher real-time assignment & status listener
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`private-restaurant-${driver.restaurantId}`);

    channel.bind("delivery-assigned", (data: any) => {
      if (data.driverId === driver._id) {
        fetchAssignments(driver._id);
        setDriver((prev) => {
          if (!prev) return null;
          const updated = { ...prev, status: "on-delivery" as const };
          localStorage.setItem("driver_session", JSON.stringify(updated));
          return updated;
        });
      }
    });

    channel.bind("driver-status-changed", (data: any) => {
      if (data.driverId === driver._id && data.status === "offline") {
        localStorage.removeItem("driver_session");
        router.push("/?error=checked_out");
      }
    });

    return () => {
      pusher.unsubscribe(`private-restaurant-${driver.restaurantId}`);
    };
  }, [driver, fetchAssignments, router]);

  const toggleStatus = async () => {
    if (!driver || statusLoading) return;
    setStatusLoading(true);

    const newStatus: "available" | "offline" = driver.status === "offline" ? "available" : "offline";

    try {
      const res = await api.patch(`/delivery/driver/${driver._id}/status`, {
        status: newStatus,
      });

      if (res.data.success) {
        const updated = { ...driver, status: newStatus };
        setDriver(updated);
        localStorage.setItem("driver_session", JSON.stringify(updated));
      }
    } catch (err) {
      console.error("Error updating status:", err);
    } finally {
      setStatusLoading(false);
    }
  };

  const handleMarkDelivered = async (assignmentId: string) => {
    try {
      const res = await api.patch(`/delivery/driver/deliver/${assignmentId}`);
      if (res.data.success && driver) {
        // Update local status
        const updated = { ...driver, status: "returning" as const };
        setDriver(updated);
        localStorage.setItem("driver_session", JSON.stringify(updated));
        fetchAssignments(driver._id);
      }
    } catch (err) {
      console.error("Failed to mark delivered", err);
    }
  };

  const handleReachedRestaurant = async () => {
    if (!driver) return;
    // Find active assignment that was returning
    const returningAssignment = assignments.find((a) => a.status === "delivered");
    if (!returningAssignment) return;

    try {
      const res = await api.patch(`/delivery/driver/complete/${returningAssignment._id}`);
      if (res.data.success) {
        // Reset driver state
        const updated = { ...driver, status: "available" as const };
        setDriver(updated);
        localStorage.setItem("driver_session", JSON.stringify(updated));
        fetchAssignments(driver._id);
      }
    } catch (err) {
      console.error("Failed to complete assignment", err);
    }
  };

  const handleLogout = async () => {
    if (driver) {
      try {
        await api.patch(`/delivery/driver/${driver._id}/status`, {
          status: "offline",
        });
      } catch (err) {
        console.error(err);
      }
    }
    localStorage.removeItem("driver_session");
    router.push("/");
  };

  if (hasLocationPermission === false) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 bg-red-900/30 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4">
          <Compass size={32} />
        </div>
        <h2 className="text-xl font-black mb-2">GPS Location Required</h2>
        <p className="text-neutral-400 text-sm mb-6 max-w-sm leading-relaxed">
          The driver app strictly requires live GPS tracking to function properly. Please enable location access in your browser or device settings to continue.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold active:scale-95 transition-all shadow-lg flex items-center gap-2"
        >
          <RefreshCw size={16} />
          <span>I've enabled it, Check Again</span>
        </button>
      </div>
    );
  }

  if (!driver || hasLocationPermission === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-800 border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  // Derived state
  const activeAssignments = assignments.filter((a) => a.status === "assigned" || a.status === "en-route");
  const activeOrderIds = activeAssignments.map((a) => a.orderId);
  const isTracking = driver.status !== "offline";
  const trackingPhase = driver.status === "returning"
    ? ("returning" as const)
    : driver.status === "available"
      ? ("available" as const)
      : ("en-route" as const);

  return (
    <div className="min-h-screen bg-black text-white p-4 relative pb-24">
      {/* LocationTracker background element */}
      {isTracking && (
        <LocationTracker
          driverId={driver._id}
          restaurantId={driver.restaurantId}
          activeOrderIds={activeOrderIds}
          phase={trackingPhase}
          onReachedRestaurant={handleReachedRestaurant}
        />
      )}

      {/* Header */}
      <header className="flex items-center justify-between bg-neutral-950 border border-neutral-900 p-4 rounded-2xl mb-5 shadow-lg">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full border-2 flex items-center justify-center text-neutral-300"
            style={{ borderColor: driver.color }}
          >
            <User size={18} />
          </div>
          <div>
            <h2 className="text-sm font-black leading-none">{driver.name}</h2>
            <p className="text-[11px] text-neutral-500 mt-1 font-semibold tracking-wide uppercase">
              {driver.assignedVehicle ? `${driver.assignedVehicle.label}` : "No Vehicle"}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-9 h-9 bg-red-950/20 border border-red-500/10 text-red-500 rounded-xl flex items-center justify-center hover:bg-red-500/10 active:scale-90 transition-all cursor-pointer"
          title="Sign out"
        >
          <LogOut size={16} />
        </button>
      </header>

      {/* Online/Offline Status Panel */}
      <section className="bg-neutral-950 border border-neutral-900 p-5 rounded-2xl mb-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-xs text-neutral-500 block uppercase font-bold tracking-wide">
              Duty Status
            </span>
            <span className="text-base font-black text-neutral-200 mt-0.5 block">
              {driver.status === "offline" ? "Offline" : driver.status === "available" ? "Active / Available" : driver.status === "on-delivery" ? "On Delivery" : "Returning"}
            </span>
          </div>

          <button
            onClick={toggleStatus}
            disabled={driver.status === "on-delivery" || driver.status === "returning" || statusLoading}
            className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
              driver.status === "offline"
                ? "bg-neutral-900 border-neutral-800 text-neutral-400 hover:bg-neutral-800"
                : "bg-blue-600 border-blue-500 text-white hover:bg-blue-700"
            }`}
          >
            <Power size={13} />
            <span>{driver.status === "offline" ? "Go Online" : "Go Offline"}</span>
          </button>
        </div>

        {/* Live GPS Active Banner */}
        {/* {isTracking && (
          <div className="flex flex-col gap-3 mt-4">
            <div className="flex items-center gap-2.5 p-3.5 bg-blue-600/10 border border-blue-500/20 text-blue-400 rounded-xl text-xs font-semibold leading-relaxed">
              <Compass size={15} className="animate-spin shrink-0" />
              <span>
                {trackingPhase === "en-route"
                  ? "Live GPS tracking is active. Users are viewing your location."
                  : "Return tracking is active. Navigating back to restaurant."}
              </span>
            </div>
            
            {trackingPhase === "returning" && (
              <button
                onClick={handleReachedRestaurant}
                className="w-full bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 py-3.5 rounded-xl font-bold text-xs transition-all active:scale-[0.98] cursor-pointer shadow-md shadow-emerald-900/20 flex justify-center items-center gap-2"
              >
                <CheckCircle size={16} />
                <span>Mark Reached Restaurant (Available)</span>
              </button>
            )}
          </div>
        )} */}
      </section>

      {/* Deliveries Section */}
      <section>
        <div className="flex items-center justify-between mb-4 px-1">
          <h3 className="text-xs font-black text-neutral-400 uppercase tracking-widest flex items-center gap-1.5">
            <Truck size={14} />
            <span>Assigned Deliveries</span>
          </h3>
          <button
            onClick={() => fetchAssignments(driver._id)}
            className="text-neutral-500 hover:text-white transition-colors cursor-pointer"
          >
            <RefreshCw size={13} />
          </button>
        </div>

        {loading ? (
          <div className="text-center py-12 text-neutral-500">
            <div className="w-8 h-8 border-2 border-neutral-800 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-semibold">Loading assignments...</p>
          </div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-16 bg-neutral-950/50 border border-dashed border-neutral-800 rounded-2xl p-6 text-neutral-500">
            <Truck size={28} className="mx-auto mb-3 text-neutral-700" />
            <p className="text-xs font-bold text-neutral-400">No active deliveries</p>
            <p className="text-[11px] text-neutral-600 mt-1 max-w-[200px] mx-auto leading-normal">
              When a manager assigns a delivery, it will appear here in real-time.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <DeliveryCard
                key={assignment._id}
                assignment={assignment}
                onMarkDelivered={handleMarkDelivered}
                onReachedRestaurant={handleReachedRestaurant}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
