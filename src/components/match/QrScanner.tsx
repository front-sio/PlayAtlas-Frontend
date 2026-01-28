"use client";

import { useEffect, useRef, useState } from "react";

type QrScannerProps = {
  onScan: (value: string) => void;
  onError?: (message: string) => void;
  active?: boolean;
};

export function QrScanner({ onScan, onError, active = true }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!active) {
      setLocked(false);
      setReady(false);
    }
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let reader: any;
    let cancelled = false;

    const start = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        reader = new BrowserMultiFormatReader();
        if (!videoRef.current || cancelled) return;
        setReady(true);
        reader.decodeFromVideoDevice(null, videoRef.current, (result: any, err: any) => {
          if (result && !locked) {
            setLocked(true);
            onScan(result.getText());
          }
          if (err && err.name !== "NotFoundException" && onError) {
            onError(err.message || "Failed to scan QR");
          }
        });
      } catch (error: any) {
        if (onError) {
          onError(error?.message || "QR scanner unavailable");
        }
      }
    };

    start();

    return () => {
      cancelled = true;
      if (reader?.reset) {
        reader.reset();
      }
    };
  }, [active, locked, onError, onScan]);

  return (
    <div className="w-full">
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <video ref={videoRef} className="h-64 w-full object-cover" />
      </div>
      {!ready && (
        <p className="mt-2 text-xs text-white/60">Allow camera access to scan the QR code.</p>
      )}
    </div>
  );
}
