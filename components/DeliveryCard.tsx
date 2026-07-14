"use client";

import React, { useState } from "react";
import { MapPin, Phone, CheckCircle, Navigation, Package, DollarSign } from "lucide-react";

interface OrderItem {
  name: string;
  quantity: number;
}

interface OrderDetails {
  _id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  items: string[];
  total: number;
}

interface Assignment {
  _id: string;
  orderId: string;
  status: "assigned" | "en-route" | "delivered" | "completed";
  order: OrderDetails | null;
  customerLocation?: { lat: number; lng: number; address: string };
}

interface DeliveryCardProps {
  assignment: Assignment;
  onMarkDelivered: (assignmentId: string) => Promise<void>;
  onReachedRestaurant?: () => Promise<void>;
}

export default function DeliveryCard({ assignment, onMarkDelivered, onReachedRestaurant }: DeliveryCardProps) {
  const [loading, setLoading] = useState(false);
  const { order, status } = assignment;

  if (!order) return null;

  const handleDeliver = async () => {
    setLoading(true);
    try {
      await onMarkDelivered(assignment._id);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleNavigate = () => {
    // Standard coordinates or lookup ( Medicine Hat coordinates for mock orders or fallback )
    // In production, assignment.customerLocation will contain the exact coordinates
    const lat = assignment.customerLocation?.lat || 50.0370;
    const lng = assignment.customerLocation?.lng || -110.6600;
    
    // Open Google Maps URL
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
    window.open(url, "_blank");
  };

  const getStatusColor = () => {
    switch (status) {
      case "assigned":
      case "en-route":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "delivered":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "completed":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "assigned":
      case "en-route":
        return "En Route";
      case "delivered":
        return "Returning to Restaurant";
      case "completed":
        return "Completed";
    }
  };

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5 shadow-xl hover:shadow-2xl transition-all duration-300">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 border-b border-neutral-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-sm font-bold text-neutral-400">Order #{order.orderNumber}</span>
        </div>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${getStatusColor()}`}>
          {getStatusText()}
        </span>
      </div>

      {/* Customer Info */}
      <div className="space-y-3 mb-5">
        <div className="flex items-start gap-3">
          <MapPin className="text-neutral-500 shrink-0 mt-0.5" size={16} />
          <div>
            <p className="text-xs font-semibold text-neutral-400">Delivery Address</p>
            <p className="text-sm text-neutral-200 mt-0.5 leading-snug">{order.deliveryAddress}</p>
          </div>
        </div>

        <div className="flex items-center justify-between bg-neutral-950 p-3 rounded-xl border border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-xs font-bold text-neutral-300">
              {order.customerName.charAt(0)}
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-200">{order.customerName}</p>
              <p className="text-xs text-neutral-500">{order.customerPhone}</p>
            </div>
          </div>
          <a
            href={`tel:${order.customerPhone}`}
            className="w-8 h-8 rounded-full bg-blue-600/10 hover:bg-blue-600/20 text-blue-400 flex items-center justify-center transition-colors cursor-pointer"
          >
            <Phone size={14} />
          </a>
        </div>
      </div>

      {/* Order Items */}
      <div className="mb-5">
        <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-semibold mb-2">
          <Package size={14} />
          <span>Items Details</span>
        </div>
        <ul className="text-xs text-neutral-300 space-y-1.5 pl-5 list-disc">
          {order.items.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      </div>

      {/* Total & Navigation Button */}
      <div className="flex items-center justify-between border-t border-neutral-800 pt-4 mb-4">
        <div>
          <span className="text-xs text-neutral-500 block">Total Amount</span>
          <span className="text-lg font-black text-white flex items-center">
            <DollarSign size={16} className="text-emerald-500" />
            {order.total.toFixed(2)}
          </span>
        </div>

        <button
          onClick={handleNavigate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-xs font-bold text-white rounded-xl shadow-lg transition-all cursor-pointer"
        >
          <Navigation size={13} />
          <span>Navigate</span>
        </button>
      </div>

      {/* Primary Action Button */}
      {(status === "assigned" || status === "en-route") && (
        <button
          disabled={loading}
          onClick={handleDeliver}
          className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-800 disabled:opacity-50 active:scale-[0.98] text-sm font-bold text-white rounded-xl transition-all shadow-md shadow-emerald-900/10 flex items-center justify-center gap-2 cursor-pointer"
        >
          <CheckCircle size={16} />
          <span>{loading ? "Marking Delivered..." : "Mark as Delivered"}</span>
        </button>
      )}

      {status === "delivered" && (
        <div className="flex flex-col gap-2">
          <div className="text-center py-3 bg-purple-500/5 border border-purple-500/15 rounded-xl">
            <p className="text-xs font-semibold text-purple-400 animate-pulse">
              GPS active. Returning to restaurant...
            </p>
          </div>
          {onReachedRestaurant && (
            <button
              onClick={onReachedRestaurant}
              className="w-full py-3 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-xl text-sm font-bold shadow-md transition-all active:scale-[0.98] cursor-pointer flex justify-center items-center gap-2"
            >
              <CheckCircle size={16} />
              <span>Mark Reached Restaurant (Available)</span>
            </button>
          )}
        </div>
      )}

      {status === "completed" && (
        <div className="text-center py-3 bg-emerald-500/5 border border-emerald-500/15 rounded-xl">
          <p className="text-xs font-semibold text-emerald-400">
            Delivery Completed successfully!
          </p>
        </div>
      )}
    </div>
  );
}
