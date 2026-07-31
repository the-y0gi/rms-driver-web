"use client";

import React, { useState, useEffect, useRef } from "react";
import { X, QrCode, Camera, Upload, AlertCircle, CheckCircle2, ArrowRight, VideoOff, RefreshCw } from "lucide-react";

interface QrCodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStorePaired: (store: { branchId: string; branchName: string; branchCode: string }) => void;
}

export default function QrCodeScannerModal({
  isOpen,
  onClose,
  onStorePaired,
}: QrCodeScannerModalProps) {
  const [manualCode, setManualCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<any>(null);

  // Stop camera when modal closes
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
    } else {
      // Auto start camera when opened
      startCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const startCamera = async () => {
    setError(null);
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error("Camera API not supported in this browser.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setIsCameraActive(true);
        startLiveScanning();
      }
    } catch (err: any) {
      console.warn("Camera start error:", err);
      setIsCameraActive(false);
      setCameraError("Camera access denied or unavailable. You can upload a QR image or enter store code below.");
    }
  };

  const startLiveScanning = () => {
    if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);

    scanIntervalRef.current = setInterval(async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;

      try {
        // Native BarcodeDetector API check
        if ("BarcodeDetector" in window) {
          const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
            stopCamera();
            parseAndPairQr(barcodes[0].rawValue);
            return;
          }
        }
      } catch (e) {
        // Ignore single frame detect errors
      }
    }, 400);
  };

  const parseAndPairQr = (rawText: string) => {
    try {
      let data: any = null;
      const trimmed = rawText.trim();
      if (trimmed.startsWith("{")) {
        data = JSON.parse(trimmed);
      } else {
        data = JSON.parse(decodeURIComponent(trimmed));
      }

      if (data && (data.type === "BRANCH_PAIRING_QR" || data.branchId)) {
        const store = {
          branchId: data.branchId,
          branchName: data.branchName || data.name || "Restaurant Branch",
          branchCode: data.branchCode || data.code || "STORE",
        };
        onStorePaired(store);
        onClose();
        return;
      }
      throw new Error("Invalid Store QR code payload.");
    } catch (err) {
      setError("Invalid QR Code content. Please scan a valid Restaurant Store QR code.");
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      setError("Please enter or paste QR payload.");
      return;
    }
    setError(null);
    parseAndPairQr(manualCode);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setScanning(true);

    try {
      if (file.type.includes("text") || file.name.endsWith(".json") || file.name.endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) parseAndPairQr(content);
          setScanning(false);
        };
        reader.readAsText(file);
        return;
      }

      const decodedText = await decodeQrFromImage(file);
      parseAndPairQr(decodedText);
    } catch (err: any) {
      setError("Could not read QR code from image file. Please ensure it's a clear QR image or paste the store code.");
    } finally {
      setScanning(false);
    }
  };

  const decodeQrFromImage = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = async () => {
        try {
          if ("BarcodeDetector" in window) {
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const detected = await detector.detect(img);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              return resolve(detected[0].rawValue);
            }
          }
          fetchQrFromApi(file, resolve, reject);
        } catch (e) {
          fetchQrFromApi(file, resolve, reject);
        }
      };
      img.onerror = () => fetchQrFromApi(file, resolve, reject);
      img.src = URL.createObjectURL(file);
    });
  };

  const fetchQrFromApi = (file: File, resolve: (val: string) => void, reject: (err: any) => void) => {
    const formData = new FormData();
    formData.append("file", file);
    fetch("https://api.qrserver.com/v1/read-qr-code/", {
      method: "POST",
      body: formData,
    })
      .then((res) => res.json())
      .then((data) => {
        if (data && data[0]?.symbol[0]?.data) {
          resolve(data[0].symbol[0].data);
        } else {
          reject(new Error("No QR code found in image"));
        }
      })
      .catch((err) => reject(err));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-sm bg-[#0d0d0d] border border-[#1e1e1e] rounded-3xl p-5 shadow-2xl z-10 text-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-[#1a1a1a]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
              <QrCode size={16} />
            </div>
            <div>
              <h3 className="text-xs font-black text-white leading-tight">Scan Store QR Code</h3>
              <p className="text-[10px] text-[#555]">Pair Driver Hub with Restaurant</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg bg-[#141414] text-[#666] hover:text-white flex items-center justify-center transition-all"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-xs font-medium">
              <AlertCircle size={15} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Real Live Camera Scanner Box */}
          <div className="relative bg-[#080808] border border-[#1e1e1e] rounded-2xl overflow-hidden min-h-[220px] flex flex-col items-center justify-center">
            {/* Live Video Stream */}
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-[220px] object-cover ${isCameraActive ? "block" : "hidden"}`}
            />

            {/* Scanning Overlay Box */}
            {isCameraActive && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-44 h-44 border-2 border-emerald-400 rounded-2xl relative animate-pulse">
                  <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-emerald-400 -mt-1 -ml-1 rounded-tl" />
                  <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-emerald-400 -mt-1 -mr-1 rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-emerald-400 -mb-1 -ml-1 rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-emerald-400 -mb-1 -mr-1 rounded-br" />
                </div>
                <p className="absolute bottom-3 text-[10px] font-bold text-emerald-400 bg-black/70 px-3 py-1 rounded-full border border-emerald-500/30">
                  Align Store QR code within box
                </p>
              </div>
            )}

            {/* Camera Off / Fallback State */}
            {!isCameraActive && (
              <div className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-[#141414] border border-[#222] flex items-center justify-center text-[#555] mx-auto">
                  <Camera size={24} />
                </div>
                <div>
                  <p className="text-xs font-bold text-white">Camera Offline</p>
                  <p className="text-[10px] text-[#555] mt-0.5 leading-relaxed">
                    {cameraError || "Allow camera permissions or upload a QR image below"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={startCamera}
                  className="px-4 py-2 bg-[#1a1a1a] hover:bg-[#222] border border-[#2a2a2a] text-xs font-bold text-white rounded-xl active:scale-95 transition-all flex items-center gap-1.5 mx-auto"
                >
                  <RefreshCw size={13} />
                  <span>Start Camera Scanner</span>
                </button>
              </div>
            )}
          </div>

          {/* Action Buttons: Upload Image File */}
          <div className="flex items-center gap-2">
            <label className="flex-1 py-2.5 bg-[#141414] hover:bg-[#1a1a1a] border border-[#222] text-xs font-bold text-zinc-200 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-95">
              {scanning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span>Reading Image...</span>
                </>
              ) : (
                <>
                  <Upload size={14} className="text-emerald-400" />
                  <span>Upload QR Image / File</span>
                </>
              )}
              <input
                type="file"
                accept="image/*,.json,.txt"
                onChange={handleFileUpload}
                disabled={scanning}
                className="hidden"
              />
            </label>

            {isCameraActive && (
              <button
                type="button"
                onClick={stopCamera}
                className="px-3 py-2.5 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold rounded-xl active:scale-95 transition-all"
                title="Stop Camera"
              >
                <VideoOff size={15} />
              </button>
            )}
          </div>

          {/* Manual Store Code Form */}
          <form onSubmit={handleManualSubmit} className="space-y-1.5 pt-1 border-t border-[#181818]">
            <label className="text-[10px] font-bold text-[#555] uppercase tracking-wider block">
              Or Enter Store Code / Payload
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder='e.g. {"branchId":"..."}'
                className="flex-1 bg-[#080808] border border-[#1e1e1e] rounded-xl px-3 py-2 text-xs font-mono text-white placeholder-[#444] outline-none focus:border-emerald-500 transition-all"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1 shrink-0 active:scale-95"
              >
                <span>PAIR</span>
                <ArrowRight size={13} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
