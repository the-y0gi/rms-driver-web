"use client";

import React, { useState } from "react";
import { X, QrCode, Camera, Upload, AlertCircle, CheckCircle2, ArrowRight } from "lucide-react";

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

  if (!isOpen) return null;

  const parseAndPairQr = (rawText: string) => {
    try {
      let data: any = null;
      if (rawText.trim().startsWith("{")) {
        data = JSON.parse(rawText.trim());
      } else {
        // Try decoding URI or standard string
        data = JSON.parse(decodeURIComponent(rawText.trim()));
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
      setError("Invalid QR Code payload. Please scan a valid Store QR code or enter branch details.");
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
      // If text/json file, read directly
      if (file.type.includes("text") || file.name.endsWith(".json") || file.name.endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          if (content) {
            parseAndPairQr(content);
          }
          setScanning(false);
        };
        reader.readAsText(file);
        return;
      }

      // If PNG/JPG image file, decode QR image
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
      // 1. Try Browser Native BarcodeDetector API
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        const img = new Image();
        img.onload = async () => {
          try {
            const detector = new (window as any).BarcodeDetector({ formats: ["qr_code"] });
            const detected = await detector.detect(img);
            if (detected && detected.length > 0 && detected[0].rawValue) {
              return resolve(detected[0].rawValue);
            }
            fetchQrFromApi(file, resolve, reject);
          } catch (e) {
            fetchQrFromApi(file, resolve, reject);
          }
        };
        img.onerror = () => fetchQrFromApi(file, resolve, reject);
        img.src = URL.createObjectURL(file);
      } else {
        fetchQrFromApi(file, resolve, reject);
      }
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-neutral-950 border border-neutral-800 rounded-3xl p-6 shadow-2xl z-10 text-white animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-neutral-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-500">
              <QrCode size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white leading-snug">
                Scan Store QR Code
              </h3>
              <p className="text-xs text-neutral-400">
                Pair Driver Console with Restaurant
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-neutral-900 text-neutral-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="py-6 space-y-6">
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 bg-red-950/40 border border-red-500/30 text-red-400 rounded-2xl text-xs font-medium">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Scanner View Simulation / Instruction */}
          <div className="relative bg-neutral-900/80 border-2 border-dashed border-neutral-800 rounded-3xl p-8 text-center flex flex-col items-center justify-center space-y-3 overflow-hidden">
            <div className="w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center text-blue-400 animate-pulse">
              <Camera size={32} />
            </div>
            <div>
              <p className="text-xs font-bold text-neutral-200">Point Camera at Store QR Code</p>
              <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                Scan the QR code displayed on the Restaurant POS screen or printout.
              </p>
            </div>

            <label className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs font-bold text-white rounded-xl transition-all cursor-pointer border border-neutral-700 disabled:opacity-50">
              {scanning ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Decoding Image...</span>
                </>
              ) : (
                <>
                  <Upload size={14} />
                  <span>Select QR File / Image</span>
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
          </div>

          {/* Manual Input Fallback */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <label className="text-[11px] font-bold text-neutral-400 uppercase tracking-wider">
              Or Enter Store Code / Payload
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder='e.g. {"branchId":"...","branchName":"Downtown"}'
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-4 py-2.5 text-xs text-white placeholder-neutral-600 outline-none focus:border-blue-600 transition-all font-mono"
              />
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shrink-0"
              >
                <span>PAIR</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
