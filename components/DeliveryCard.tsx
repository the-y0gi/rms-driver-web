"use client";

import React, { useState } from "react";
import { MapPin, Phone, CheckCircle, Navigation2, Package, IndianRupee } from "lucide-react";

interface OrderDetails {
  _id: string; orderNumber: string; customerName: string;
  customerPhone: string; deliveryAddress: string;
  items: string[]; total: number;
}
interface Assignment {
  _id: string; orderId: string;
  status: "assigned" | "en-route" | "delivered" | "completed";
  order: OrderDetails | null;
  customerLocation?: { lat: number; lng: number; address: string };
}
interface DeliveryCardProps {
  assignment: Assignment;
  onMarkDelivered: (assignmentId: string) => Promise<void>;
  onReachedRestaurant?: () => Promise<void>;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; accent: string }> = {
  assigned:   { label: "New",       color: "#f59e0b", accent: "#f59e0b20" },
  "en-route": { label: "En Route",  color: "#3b82f6", accent: "#3b82f620" },
  delivered:  { label: "Delivered", color: "#a855f7", accent: "#a855f720" },
  completed:  { label: "Done",      color: "#10b981", accent: "#10b98120" },
};

export default function DeliveryCard({ assignment, onMarkDelivered, onReachedRestaurant }: DeliveryCardProps) {
  const [loading, setLoading] = useState(false);
  const { order, status } = assignment;
  if (!order) return null;

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.assigned;

  const handleDeliver = async () => {
    setLoading(true);
    try { await onMarkDelivered(assignment._id); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleNavigate = () => {
    const lat = assignment.customerLocation?.lat || 22.1818;
    const lng = assignment.customerLocation?.lng || 78.7618;
    navigator.geolocation?.getCurrentPosition(
      (pos) => window.open(`https://www.google.com/maps/dir/?api=1&origin=${pos.coords.latitude},${pos.coords.longitude}&destination=${lat},${lng}`, "_blank"),
      () => window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, "_blank"),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
    );
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: "#0d0d0d", border: "1px solid #1e1e1e" }}
    >
      {/* Top accent line */}
      <div className="h-[2px]" style={{ background: cfg.color }} />

      <div className="p-4 space-y-3">

        {/* ── Order # + Status badge ── */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-white">#{order.orderNumber}</span>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
            style={{ background: cfg.accent, color: cfg.color }}
          >
            {cfg.label}
          </span>
        </div>

        {/* ── Customer + Call ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ background: "#1a1a1a" }}
            >
              {order.customerName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{order.customerName}</p>
              <p className="text-[10px] text-[#555]">{order.customerPhone}</p>
            </div>
          </div>
          {order.customerPhone && (
            <a
              href={`tel:${order.customerPhone}`}
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 active:scale-90 transition-all"
              style={{ background: "#10b98115", border: "1px solid #10b98120" }}
            >
              <Phone size={13} className="text-emerald-400" />
            </a>
          )}
        </div>

        {/* ── Address ── */}
        <div className="flex items-start gap-2">
          <MapPin size={12} className="text-[#444] mt-0.5 shrink-0" />
          <p className="text-[11px] text-[#888] leading-relaxed">{order.deliveryAddress}</p>
        </div>

        {/* ── Items ── */}
        <div className="px-3 py-2.5 rounded-xl" style={{ background: "#080808", border: "1px solid #161616" }}>
          <p className="text-[9px] text-[#444] uppercase font-semibold tracking-wide mb-1.5">
            Items ({order.items.length})
          </p>
          {order.items.map((item, i) => (
            <p key={i} className="text-[11px] text-[#666] leading-relaxed">· {item}</p>
          ))}
        </div>

        {/* ── Amount + Navigate ── */}
        <div className="flex items-center justify-between pt-0.5">
          <div className="flex items-center gap-0.5">
            <IndianRupee size={14} className="text-emerald-400" />
            <span className="text-sm font-bold text-white">{order.total.toFixed(0)}</span>
          </div>
          <button
            onClick={handleNavigate}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white active:scale-95 transition-all"
            style={{ background: "#1e40af", border: "1px solid #3b82f625" }}
          >
            <Navigation2 size={13} />
            Navigate
          </button>
        </div>

        {/* ── Action Button ── */}
        {(status === "assigned" || status === "en-route") && (
          <button
            disabled={loading}
            onClick={handleDeliver}
            className="w-full py-3 rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] transition-all"
            style={{
              background: loading ? "#111" : "#059669",
              border: "1px solid #10b98130",
            }}
          >
            {loading
              ? <><div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" /><span>Updating...</span></>
              : <><CheckCircle size={15} /><span>Mark as Delivered</span></>
            }
          </button>
        )}

        {status === "delivered" && (
          <div className="space-y-2">
            <p className="text-center text-[11px] font-semibold text-purple-400 py-2 rounded-xl" style={{ background: "#a855f710" }}>
              Delivered · Return to store
            </p>
            {onReachedRestaurant && (
              <button
                onClick={onReachedRestaurant}
                className="w-full py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
                style={{ background: "#10b98110", border: "1px solid #10b98125", color: "#10b981" }}
              >
                <CheckCircle size={15} />
                Reached Store — Go Available
              </button>
            )}
          </div>
        )}

        {status === "completed" && (
          <p className="text-center text-[11px] font-semibold text-emerald-400 py-2 rounded-xl" style={{ background: "#10b98110" }}>
            ✓ Delivery Completed
          </p>
        )}
      </div>
    </div>
  );
}
