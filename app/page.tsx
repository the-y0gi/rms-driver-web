"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "../lib/api";
import { User, Lock, AlertCircle, Key, Truck, Eye, EyeOff, QrCode, Plus, ChevronDown, Building2, ShieldAlert } from "lucide-react";
import QrCodeScannerModal from "../components/QrCodeScannerModal";

interface StoreItem {
  branchId: string;
  branchName: string;
  branchCode: string;
}

export default function LoginPage() {
  const router = useRouter();
  const [driverId, setDriverId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isCheckInRequired, setIsCheckInRequired] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [geoPermission, setGeoPermission] = useState<"granted" | "denied" | "prompt">("prompt");

  // Multi-Store State
  const [savedStores, setSavedStores] = useState<StoreItem[]>([]);
  const [activeStore, setActiveStore] = useState<StoreItem | null>(null);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isStoreDropdownOpen, setIsStoreDropdownOpen] = useState(false);

  // Load saved stores and check session on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search);
      if (urlParams.get("error") === "checked_out") {
        setIsCheckInRequired(true);
        setError("You have been checked out from the POS system. Please check-in to continue.");
      }

      const savedDriver = localStorage.getItem("driver_session");
      if (savedDriver && urlParams.get("error") !== "checked_out") {
        router.push("/dashboard");
        return;
      }

      const storesJson = localStorage.getItem("driver_saved_stores");
      if (storesJson) {
        try {
          const list: StoreItem[] = JSON.parse(storesJson);
          setSavedStores(list);
          if (list.length > 0) {
            const lastActive = localStorage.getItem("driver_active_store");
            if (lastActive) {
              const matched = list.find((s) => s.branchId === lastActive);
              setActiveStore(matched || list[0]);
            } else {
              setActiveStore(list[0]);
            }
          }
        } catch (e) {}
      }
    }
  }, [router]);

  // Request Geolocation permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => setGeoPermission("granted"),
        () => setGeoPermission("denied")
      );
    }
  }, []);

  const handleStorePaired = (newStore: StoreItem) => {
    const existingIndex = savedStores.findIndex((s) => s.branchId === newStore.branchId);
    let updatedList = [...savedStores];
    if (existingIndex >= 0) {
      updatedList[existingIndex] = newStore;
    } else {
      updatedList.push(newStore);
    }
    setSavedStores(updatedList);
    setActiveStore(newStore);
    localStorage.setItem("driver_saved_stores", JSON.stringify(updatedList));
    localStorage.setItem("driver_active_store", newStore.branchId);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeStore) {
      setError("Please pair a restaurant store by scanning its QR Code first.");
      setIsQrModalOpen(true);
      return;
    }

    if (!driverId.trim() || !password.trim()) {
      setError("Please enter Driver ID and Password.");
      return;
    }

    setLoading(true);
    setError(null);
    setIsCheckInRequired(false);

    try {
      const response = await api.post("/delivery/driver/login", {
        driverId: driverId.trim().toUpperCase(),
        password: password.trim(),
        branchId: activeStore.branchId,
      });

      if (response.data.success && response.data.data) {
        localStorage.setItem("driver_session", JSON.stringify(response.data.data));
        localStorage.setItem("driver_active_store", activeStore.branchId);

        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            () => router.push("/dashboard"),
            () => router.push("/dashboard")
          );
        } else {
          router.push("/dashboard");
        }
      } else {
        setError("Invalid response format.");
      }
    } catch (err: any) {
      console.error(err);
      if (err.response?.status === 403 || err.response?.data?.code === "CHECK_IN_REQUIRED") {
        setIsCheckInRequired(true);
        setError(err.response?.data?.message || "Please check-in first at the POS system before accessing Driver Web.");
      } else {
        setError(err.response?.data?.message || "Login failed. Please verify credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background gradients */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-blue-600/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      {/* Top Header Store Selector */}
      <header className="fixed top-0 inset-x-0 bg-neutral-950/80 backdrop-blur-md border-b border-neutral-900 px-4 py-3 z-30 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-500 flex items-center justify-center font-bold">
            <Truck size={18} />
          </div>
          <span className="text-sm font-black tracking-tight text-white hidden sm:inline">
            RMS Driver Console
          </span>
        </div>

        {/* Store Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
            className="flex items-center gap-2 px-3 py-2 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded-xl text-xs font-bold text-neutral-200 transition-all cursor-pointer"
          >
            <Building2 size={14} className="text-blue-500" />
            <span className="max-w-[140px] truncate">
              {activeStore ? activeStore.branchName : "No Store Paired"}
            </span>
            <ChevronDown size={14} className="text-neutral-500" />
          </button>

          {isStoreDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-neutral-950 border border-neutral-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1">
              <div className="text-[10px] font-bold text-neutral-500 px-3 py-1 uppercase tracking-wider">
                Paired Stores
              </div>
              {savedStores.length > 0 ? (
                savedStores.map((store) => (
                  <button
                    key={store.branchId}
                    onClick={() => {
                      setActiveStore(store);
                      localStorage.setItem("driver_active_store", store.branchId);
                      setIsStoreDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between ${
                      activeStore?.branchId === store.branchId
                        ? "bg-blue-600 text-white"
                        : "text-neutral-300 hover:bg-neutral-900"
                    }`}
                  >
                    <span className="truncate">{store.branchName}</span>
                    <span className="text-[10px] opacity-70 font-mono">{store.branchCode}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-neutral-500 italic">No stores paired yet</div>
              )}

              <div className="pt-1 border-t border-neutral-900">
                <button
                  onClick={() => {
                    setIsStoreDropdownOpen(false);
                    setIsQrModalOpen(true);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-blue-600/15 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Plus size={14} />
                  <span>Add Store (Scan QR)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-neutral-950 border border-neutral-900 rounded-3xl p-8 shadow-2xl relative z-10 mt-12">
        {/* App Logo/Branding */}
        <div className="text-center mb-6">
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

        {/* Store Pairing Status Badge */}
        {activeStore ? (
          <div className="mb-5 p-3.5 bg-blue-950/40 border border-blue-500/30 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center">
                <Building2 size={15} />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{activeStore.branchName}</div>
                <div className="text-[10px] text-neutral-400 font-mono">CODE: {activeStore.branchCode}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="text-[10.5px] font-bold text-blue-400 hover:text-blue-300 underline cursor-pointer"
            >
              Switch QR
            </button>
          </div>
        ) : (
          <div className="mb-5 p-4 bg-amber-950/40 border border-amber-500/30 rounded-2xl text-center space-y-3">
            <div className="text-xs font-bold text-amber-400">
              No Restaurant Store Paired
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Scan the Store QR code from the restaurant POS screen to pair your device.
            </p>
            <button
              type="button"
              onClick={() => setIsQrModalOpen(true)}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <QrCode size={16} />
              <span>SCAN STORE QR CODE</span>
            </button>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          {/* POS Check-In Error Card */}
          {isCheckInRequired ? (
            <div className="p-4 bg-red-950/60 border border-red-500/40 text-red-300 rounded-2xl text-xs space-y-2 animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2 font-black text-red-400 uppercase tracking-wider text-[11px]">
                <ShieldAlert size={16} />
                <span>POS CHECK-IN REQUIRED</span>
              </div>
              <p className="text-[11.5px] text-red-200 leading-relaxed font-medium">
                You must first Check-In at the restaurant POS terminal before accessing Driver Web.
              </p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-950/40 border border-red-500/20 text-red-400 rounded-xl text-xs font-semibold">
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          ) : null}

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
                onChange={(e) => setDriverId(e.target.value.toUpperCase())}
                placeholder="e.g. 001"
                className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 rounded-xl py-3.5 pl-11 pr-4 text-sm text-white placeholder-neutral-600 outline-none transition-all uppercase font-mono"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-bold text-neutral-400 tracking-wide uppercase">
              Password / PIN
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600">
                <Lock size={16} />
              </span>
              <input
                type={showPassword ? "text" : "password"}
                maxLength={4}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••"
                className="w-full bg-neutral-900/60 border border-neutral-800 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 rounded-xl py-3.5 pl-11 pr-11 text-sm text-white placeholder-neutral-600 outline-none transition-all font-mono"
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
            <span>{loading ? "Verifying..." : "Access Console"}</span>
          </button>
        </form>

        <div className="mt-8 pt-5 border-t border-neutral-900/80 text-center text-[10px] text-neutral-600 font-semibold tracking-wide uppercase">
          Chicken Delight © 2026
        </div>
      </div>

      {/* QR Code Scanner Modal */}
      <QrCodeScannerModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        onStorePaired={handleStorePaired}
      />
    </main>
  );
}
