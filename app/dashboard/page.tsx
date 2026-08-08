"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "../../lib/api";
import { getPusherClient } from "../../lib/pusher";
import DeliveryCard from "../../components/DeliveryCard";
import LocationTracker from "../../components/LocationTracker";
import { LogOut, Power, Truck, RefreshCw, Compass, Zap, Activity, MapPin, Package, Download, Car } from "lucide-react";

interface Vehicle { _id: string; number: string; label: string; }
interface DriverSession {
  _id: string; driverId: string; name: string; phone: string; color: string;
  status: "available" | "on-delivery" | "returning" | "offline";
  restaurantId: string; assignedVehicle: Vehicle | null;
  token?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [driver, setDriver] = useState<DriverSession | null>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusLoading, setStatusLoading] = useState(false);
  const [hasLocationPermission, setHasLocationPermission] = useState<boolean | null>(null);
  const [restaurantCoords, setRestaurantCoords] = useState<{ lat: number; lng: number } | undefined>(undefined);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setDeferredPrompt(e); setIsInstallable(true); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") { setIsInstallable(false); setDeferredPrompt(null); }
  };

  useEffect(() => {
    if (!navigator.geolocation) { setHasLocationPermission(false); return; }
    navigator.geolocation.getCurrentPosition(
      () => setHasLocationPermission(true),
      () => setHasLocationPermission(false),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem("driver_session");
    if (!saved) { router.push("/"); return; }
    const session = JSON.parse(saved);
    setDriver(session);
    api.get(`/delivery/driver/${session._id}`).then((res) => {
      if (res.data.success && res.data.data) {
        const fresh = res.data.data;
        if (fresh.posCheckedIn === false) {
          localStorage.removeItem("driver_session");
          router.push("/?error=checked_out");
          return;
        }
        const updatedSession = { ...fresh, token: session.token || fresh.token };
        setDriver(updatedSession);
        localStorage.setItem("driver_session", JSON.stringify(updatedSession));
        const branchId = fresh.restaurantId || session.restaurantId;
        if (branchId && branchId !== "default") {
          api.get(`/branches/settings?branchId=${branchId}`).then((r) => {
            if (r.data.success && r.data.data?.mainSettings) {
              const ms = r.data.data.mainSettings;
              const lat = Number(ms.latitude), lng = Number(ms.longitude);
              if (!isNaN(lat) && !isNaN(lng) && lat !== 0) setRestaurantCoords({ lat, lng });
            }
          }).catch(() => {});
        }
      }
    }).catch(() => {});
  }, [router]);

  const fetchAssignments = useCallback(async (driverId: string) => {
    try {
      const res = await api.get(`/delivery/driver/${driverId}/assignments`);
      if (res.data.success) {
        setAssignments(res.data.data);
        setTodayCount(res.data.data.filter((a: any) => a.status === "completed").length);
      }
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!driver) return;
    fetchAssignments(driver._id);
    const pusher = getPusherClient();
    const channel = pusher.subscribe(`private-restaurant-${driver.restaurantId}`);

    const handleRefresh = () => {
      fetchAssignments(driver._id);
      api.get(`/delivery/driver/${driver._id}`).then((res) => {
        if (res.data.success && res.data.data) {
          const fresh = res.data.data;
          if (fresh.posCheckedIn === false) {
            localStorage.removeItem("driver_session");
            router.push("/?error=checked_out");
            return;
          }
          const updatedSession = { ...fresh, token: driver.token };
          setDriver(updatedSession);
          localStorage.setItem("driver_session", JSON.stringify(updatedSession));
        }
      }).catch(() => {});
    };

    channel.bind("delivery-assigned", (data: any) => {
      if (!data.driverId || data.driverId === driver._id || data.driverId === driver.driverId || data.unassigned) {
        handleRefresh();
      }
    });

    channel.bind("delivery-status-update", (data: any) => {
      if (!data.driverId || data.driverId === driver._id || data.driverId === driver.driverId) {
        handleRefresh();
      }
    });

    channel.bind("driver-status-change", (data: any) => {
      if (data.driverId === driver._id || data.driverId === driver.driverId) {
        if (data.posCheckedIn === false || data.checkedOut === true) {
          localStorage.removeItem("driver_session");
          router.push("/?error=checked_out");
        } else {
          handleRefresh();
        }
      }
    });

    return () => { pusher.unsubscribe(`private-restaurant-${driver.restaurantId}`); };
  }, [driver, fetchAssignments, router]);

  const toggleStatus = async () => {
    if (!driver || statusLoading) return;
    setStatusLoading(true);
    const newStatus: "available" | "offline" = driver.status === "offline" ? "available" : "offline";
    try {
      const res = await api.patch(`/delivery/driver/${driver._id}/status`, { status: newStatus });
      if (res.data.success) {
        const u = { ...driver, status: newStatus };
        setDriver(u);
        localStorage.setItem("driver_session", JSON.stringify(u));
      }
    } catch (err) { console.error(err); }
    finally { setStatusLoading(false); }
  };

  const handleMarkDelivered = async (assignmentId: string) => {
    try {
      const res = await api.patch(`/delivery/driver/deliver/${assignmentId}`);
      if (res.data.success && driver) {
        const u = { ...driver, status: "returning" as const };
        setDriver(u);
        localStorage.setItem("driver_session", JSON.stringify(u));
        fetchAssignments(driver._id);
      }
    } catch (err) { console.error(err); }
  };

  const handleReachedRestaurant = async () => {
    if (!driver) return;
    const ret = assignments.find((a) => a.status === "delivered");
    if (!ret) return;
    try {
      const res = await api.patch(`/delivery/driver/complete/${ret._id}`);
      if (res.data.success) {
        const u = { ...driver, status: "available" as const };
        setDriver(u);
        localStorage.setItem("driver_session", JSON.stringify(u));
        fetchAssignments(driver._id);
        setTodayCount(p => p + 1);
      }
    } catch (err) { console.error(err); }
  };

  const handleLogout = async () => {
    if (driver) { try { await api.patch(`/delivery/driver/${driver._id}/status`, { status: "offline" }); } catch {} }
    localStorage.removeItem("driver_session");
    router.push("/");
  };

  // ── GPS Error Screen ──
  if (hasLocationPermission === false) {
    return (
      <div className="min-h-screen bg-[#080808] flex flex-col items-center justify-center p-6 text-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <Compass size={24} className="text-red-400" />
        </div>
        <div>
          <p className="text-sm font-bold text-white mb-1">GPS Required</p>
          <p className="text-xs text-[#666] leading-relaxed max-w-xs">Enable location access in browser settings to use the driver app.</p>
        </div>
        <button onClick={() => window.location.reload()} className="bg-emerald-500 text-black text-xs font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 active:scale-95 transition-all">
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  // ── Loading Screen ──
  if (!driver || hasLocationPermission === null) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[#222] border-t-emerald-500 rounded-full animate-spin" />
      </div>
    );
  }

  const activeAssignments = assignments.filter((a) => a.status === "assigned" || a.status === "en-route");
  const activeOrderIds = activeAssignments.map((a) => a.orderId);
  const isTracking = driver.status !== "offline";
  const trackingPhase = driver.status === "returning" ? "returning" as const : driver.status === "available" ? "available" as const : "en-route" as const;
  const isOnline = driver.status !== "offline";

  const statusLabel: Record<string, string> = {
    available: "Active & Available",
    "on-delivery": "On Delivery",
    returning: "Returning to Store",
    offline: "Offline",
  };
  const statusDotColor: Record<string, string> = {
    available: "#10b981",
    "on-delivery": "#3b82f6",
    returning: "#a855f7",
    offline: "#444",
  };

  return (
    <div className="min-h-screen bg-[#080808] text-white" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      {isTracking && (
        <LocationTracker
          driverId={driver._id}
          restaurantId={driver.restaurantId}
          restaurantCoords={restaurantCoords}
          activeOrderIds={activeOrderIds}
          phase={trackingPhase}
          onReachedRestaurant={handleReachedRestaurant}
        />
      )}

      {/* ── HEADER ── */}
      <div className="px-4 pt-12 pb-4 border-b border-[#141414]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: driver.color || "#10b981" }}
            >
              {driver.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-[11px] text-[#555] font-medium">Driver</p>
              <p className="text-sm font-bold text-white leading-tight">{driver.name}</p>
              {driver.assignedVehicle && (
                <p className="text-[10px] text-[#444] mt-0.5">{driver.assignedVehicle.label}</p>
              )}
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl bg-[#111] border border-[#1e1e1e] text-[#555] flex items-center justify-center active:scale-90 transition-all"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 space-y-3">

        {/* ── DUTY TOGGLE ── */}
        <button
          onClick={toggleStatus}
          disabled={driver.status === "on-delivery" || driver.status === "returning" || statusLoading}
          className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background: isOnline ? "#10b981" : "#111",
            border: isOnline ? "1px solid #059669" : "1px solid #1e1e1e",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: isOnline ? "rgba(0,0,0,0.2)" : "#1a1a1a" }}
            >
              {statusLoading
                ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                : <Power size={16} className={isOnline ? "text-white" : "text-[#444]"} />
              }
            </div>
            <div className="text-left">
              <p className={`text-[10px] font-semibold ${isOnline ? "text-emerald-100/70" : "text-[#444]"}`}>
                {isOnline ? "Tap to go offline" : "Tap to start duty"}
              </p>
              <p className={`text-sm font-bold leading-tight ${isOnline ? "text-white" : "text-[#555]"}`}>
                {statusLoading ? "Updating..." : isOnline ? "On Duty" : "Off Duty"}
              </p>
            </div>
          </div>
          {/* Status dot */}
          <div className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: isOnline ? "white" : "#333",
                boxShadow: isOnline ? "0 0 6px rgba(255,255,255,0.5)" : "none",
              }}
            />
          </div>
        </button>

        {/* ── STATUS ROW ── */}
        <div
          className="flex items-center justify-between px-3.5 py-2.5 rounded-xl"
          style={{ background: "#0d0d0d", border: "1px solid #181818" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{
                background: statusDotColor[driver.status],
                boxShadow: isOnline ? `0 0 6px ${statusDotColor[driver.status]}` : "none",
              }}
            />
            <span className="text-xs text-[#888] font-medium">{statusLabel[driver.status]}</span>
          </div>
          {isOnline && (
            <span className="text-[10px] font-semibold text-emerald-400 flex items-center gap-1">
              <Zap size={10} /> GPS Live
            </span>
          )}
        </div>

        {/* ── STATS ── */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Delivered", value: String(todayCount), icon: Package },
            { label: "Active", value: String(activeAssignments.length), icon: Activity },
            { label: "GPS", value: isOnline ? "Live" : "Off", icon: MapPin },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl p-3 flex flex-col gap-1.5"
              style={{ background: "#0d0d0d", border: "1px solid #181818" }}
            >
              <Icon size={13} className="text-[#444]" />
              <p className="text-sm font-bold text-white">{value}</p>
              <p className="text-[9px] text-[#444] uppercase tracking-wide font-semibold">{label}</p>
            </div>
          ))}
        </div>

        {/* ── PWA INSTALL ── */}
        {isInstallable && (
          <div className="flex items-center justify-between px-3.5 py-3 rounded-xl" style={{ background: "#0d1f18", border: "1px solid #10b98120" }}>
            <div className="flex items-center gap-2.5">
              <Download size={14} className="text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-white">Install App</p>
                <p className="text-[10px] text-[#555]">Add to home screen</p>
              </div>
            </div>
            <button
              onClick={handleInstallPWA}
              className="bg-emerald-500 text-black text-[10px] font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all"
            >
              Install
            </button>
          </div>
        )}

        {/* ── DELIVERIES ── */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <Truck size={13} className="text-[#444]" />
              <span className="text-xs font-semibold text-[#666]">
                Assigned Deliveries
                {assignments.length > 0 && (
                  <span className="ml-1.5 bg-emerald-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">{assignments.length}</span>
                )}
              </span>
            </div>
            <button
              onClick={() => driver && fetchAssignments(driver._id)}
              className="w-7 h-7 rounded-lg bg-[#111] border border-[#1e1e1e] text-[#444] flex items-center justify-center active:scale-90 transition-all"
            >
              <RefreshCw size={12} />
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-5 h-5 border-2 border-[#1e1e1e] border-t-emerald-500 rounded-full animate-spin" />
            </div>
          ) : assignments.length === 0 ? (
            <div
              className="flex flex-col items-center justify-center py-12 rounded-2xl text-center"
              style={{ background: "#0a0a0a", border: "1px dashed #1a1a1a" }}
            >
              <Truck size={28} className="text-[#252525] mb-3" />
              <p className="text-xs font-semibold text-[#444] mb-1">No active deliveries</p>
              <p className="text-[11px] text-[#2e2e2e] max-w-[180px] leading-relaxed">
                New orders will appear here instantly.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
        </div>
      </div>
    </div>
  );
}
