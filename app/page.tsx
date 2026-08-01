"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import api from "../lib/api";
import {
  User,
  Lock,
  AlertCircle,
  Key,
  Truck,
  Eye,
  EyeOff,
  QrCode,
  Plus,
  ChevronDown,
  Building2,
  ShieldAlert,
  Smartphone,
  ArrowRight,
  Loader2,
} from "lucide-react";
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
      if (err.response?.data?.code === "CHECK_IN_REQUIRED") {
        setIsCheckInRequired(true);
        setError(err.response?.data?.message || "Please check-in first at the POS system before accessing Driver Web.");
      } else if (err.response?.data?.code === "NOT_A_DRIVER") {
        setIsCheckInRequired(false);
        setError(err.response?.data?.message || "Access denied. Only employees registered as Drivers can log in.");
      } else {
        setIsCheckInRequired(false);
        setError(err.response?.data?.message || "Login failed. Please verify credentials.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background Glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[130px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] rounded-full bg-indigo-600/10 blur-[130px] pointer-events-none" />

      {/* Top Header Store Selector */}
      <header className="fixed top-0 inset-x-0 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-900 px-4 py-3 z-30 flex items-center justify-between max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center font-black">
            <Truck size={17} />
          </div>
          <span className="text-xs font-black tracking-wider uppercase text-zinc-200">
            Driver Hub
          </span>
        </div>

        {/* Store Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsStoreDropdownOpen(!isStoreDropdownOpen)}
            className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-xs font-bold text-zinc-200 transition-all cursor-pointer shadow-sm"
          >
            <Building2 size={13} className="text-emerald-400" />
            <span className="max-w-[130px] truncate">
              {activeStore ? activeStore.branchName : "Pair Store"}
            </span>
            <ChevronDown size={13} className="text-zinc-500" />
          </button>

          {isStoreDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-2 z-40 space-y-1">
              <div className="text-[10px] font-black text-zinc-500 px-3 py-1 uppercase tracking-widest">
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
                        ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40"
                        : "text-zinc-300 hover:bg-zinc-800"
                    }`}
                  >
                    <span className="truncate">{store.branchName}</span>
                    <span className="text-[10px] opacity-70 font-mono">{store.branchCode}</span>
                  </button>
                ))
              ) : (
                <div className="px-3 py-2 text-xs text-zinc-500 italic">No stores paired yet</div>
              )}

              <div className="pt-1 border-t border-zinc-800">
                <button
                  onClick={() => {
                    setIsStoreDropdownOpen(false);
                    setIsQrModalOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-emerald-400 hover:bg-emerald-950/30 transition-all flex items-center gap-2"
                >
                  <Plus size={14} />
                  <span>Scan Store QR Code</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <div className="w-full max-w-sm pt-16 pb-8 space-y-6">
        {/* Brand Icon & Title */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-zinc-900 border border-zinc-800 rounded-2xl flex items-center justify-center text-emerald-400 mx-auto shadow-xl shadow-emerald-950/20">
            <Truck size={28} />
          </div>
          <h1 className="text-xl font-black tracking-tight text-white uppercase">
            Driver Delivery Hub
          </h1>
          <p className="text-xs text-zinc-400 font-medium">
            {activeStore ? `Connected: ${activeStore.branchName}` : "Scan store QR code to begin"}
          </p>
        </div>

        {/* Store Active Banner / Warning */}
        {!activeStore && (
          <div className="bg-amber-500/10 border border-amber-500/25 p-4 rounded-2xl text-center space-y-3 shadow-lg">
            <div className="flex items-center justify-center gap-2 text-amber-400">
              <QrCode size={20} />
              <span className="text-xs font-black uppercase tracking-wider">Store QR Pairing Required</span>
            </div>
            <p className="text-[11px] text-amber-200/80 leading-relaxed font-medium">
              You must pair your device with a restaurant store before logging in.
            </p>
            <button
              onClick={() => setIsQrModalOpen(true)}
              className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center gap-2"
            >
              <QrCode size={16} />
              <span>Scan Restaurant QR</span>
            </button>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/25 p-3.5 rounded-2xl text-rose-300 text-xs font-semibold flex items-start gap-2.5 shadow-lg">
            <AlertCircle size={16} className="text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="leading-relaxed">{error}</p>
            </div>
          </div>
        )}

        {/* Login Form Card */}
        {activeStore && (
          <div className="bg-zinc-900/90 border border-zinc-800/80 rounded-3xl p-6 shadow-2xl space-y-5">
            {/* Active Store Badge */}
            <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-800/60 px-3.5 py-2.5 rounded-xl text-xs font-extrabold text-zinc-300">
              <div className="flex items-center gap-2 truncate">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                <span className="truncate">{activeStore.branchName}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsQrModalOpen(true)}
                className="text-[10px] text-emerald-400 hover:underline uppercase font-black shrink-0"
              >
                Change
              </button>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">
                  Driver ID / Employee ID
                </label>
                <div className="relative">
                  <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    required
                    placeholder="E.g. DRV-001"
                    value={driverId}
                    onChange={(e) => setDriverId(e.target.value.toUpperCase())}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-4 py-3 text-xs font-mono font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-all uppercase tracking-wider"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-1.5">
                  4-Digit PIN 
                </label>
                <div className="relative">
                  <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    placeholder="••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl pl-10 pr-10 py-3 text-xs font-mono font-bold text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition-all tracking-widest"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black uppercase tracking-wider rounded-xl transition-all shadow-lg shadow-emerald-950/40 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <span>Login to Duty Console</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}

        <div className="text-center space-y-1">
          <p className="text-[10px] text-zinc-500 font-semibold">
            PWA Progressive Web App
          </p>
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
