"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "../lib/api";
import { User, Lock, AlertCircle, Key, Truck, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [driverId, setDriverId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt">("prompt");

  // Check if already logged in
  useEffect(() => {
    const savedDriver = localStorage.getItem("driver_session");
    if (savedDriver) {
      router.push("/dashboard");
    }
  }, [router]);

  // Request Geolocation permission on mount to ensure smooth tracking
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setGeoPermission("granted"),
        () => setGeoPermission("denied")
      );
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverId.trim() || !password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await api.post("/delivery/driver/login", {
        driverId: driverId.trim(),
        password: password.trim(),
      });

      if (response.data.success && response.data.data) {
        localStorage.setItem("driver_session", JSON.stringify(response.data.data));
        
        // Re-request geo permission if not already granted
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            () => {
              router.push("/dashboard");
            },
            () => {
              router.push("/dashboard");
            }
          );
        } else {
          router.push("/dashboard");
        }
      } else {
        setError("Invalid response format.");
      }
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.message || "Login failed. Please verify credentials."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md bg-neutral-950 border border-neutral-900 rounded-3xl p-8 shadow-2xl relative z-10">
        {/* App Logo/Branding */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600/15 border border-blue-500/30 rounded-2xl flex items-center justify-center mx-auto text-blue-500 mb-4 animate-bounce">
            <Truck size={32} />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white leading-none">
            RMS Delivery Service
          </h1>
          <p className="text-xs text-neutral-500 mt-2 font-medium tracking-wide">
            DRIVER CONSOLE LOGIN
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-950/40 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          {geoPermission === "denied" && (
            <div className="flex items-center gap-2.5 p-3.5 bg-amber-950/40 border border-amber-500/20 text-amber-400 rounded-xl text-xs font-medium leading-relaxed">
              <AlertCircle size={15} className="shrink-0" />
              <span>
                Please enable Geolocation permissions in your browser to start tracking and receive orders.
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-400 tracking-wide uppercase">
              Driver ID
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600">
                <User size={16} />
              </span>
              <input
                type="text"
                value={driverId}
                onChange={(e) => setDriverId(e.target.value)}
                placeholder="e.g. DRV-001"
                className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-neutral-600 outline-none transition-all"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-400 tracking-wide uppercase">
              Password
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600">
                <Lock size={16} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 rounded-xl py-3.5 pl-11 pr-11 text-sm text-white placeholder-neutral-600 outline-none transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-300 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 active:scale-[0.98] disabled:bg-blue-800 disabled:opacity-50 text-sm font-bold py-4 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-2"
          >
            <Key size={16} />
            <span>{loading ? "Logging in..." : "Access Console"}</span>
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-neutral-900/80 text-center text-[10px] text-neutral-600 font-semibold tracking-wide uppercase">
          Chicken Delight © 2026
        </div>
      </div>
    </main>
  );
}
