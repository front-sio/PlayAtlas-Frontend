"use client";

import { useEffect, useState } from "react";

type QrCodeDisplayProps = {
  value: string;
  size?: number;
};

export function QrCodeDisplay({ value, size = 220 }: QrCodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string>("");

  useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        const { toDataURL } = await import("qrcode");
        const url = await toDataURL(value, { width: size, margin: 1 });
        if (active) setDataUrl(url);
      } catch {
        if (active) setDataUrl("");
      }
    };
    run();
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div className="flex h-[220px] w-[220px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-xs text-white/60">
        Generating QR…
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="Verification QR code"
      width={size}
      height={size}
      className="rounded-xl border border-white/10 bg-white/5"
    />
  );
}
