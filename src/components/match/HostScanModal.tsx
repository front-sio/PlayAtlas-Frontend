"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/match/QrScanner";

type HostScanModalProps = {
  open: boolean;
  matchId: string;
  expiresAt?: string | null;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onScan: (value: string) => void;
  onRefresh: () => void;
};

export function HostScanModal({
  open,
  matchId,
  expiresAt,
  loading,
  error,
  onClose,
  onScan,
  onRefresh
}: HostScanModalProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const timeLeft = expiresAt
    ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
    : null;

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg border-white/10 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle>Scan opponent QR</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Ask your opponent to open their QR popup. Scan to verify both players are nearby.
          </p>
          <QrScanner onScan={onScan} active={open} />
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <p>Match: {matchId.slice(0, 8)}</p>
            {timeLeft !== null && <p>QR expires in: {timeLeft}s</p>}
          </div>
          {error && (
            <div className="rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Close
            </Button>
            <Button onClick={onRefresh} disabled={loading}>
              Re-issue QR
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
