"use client";

import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { QrCodeDisplay } from "@/components/match/QrCodeDisplay";

type OpponentQrModalProps = {
  open: boolean;
  matchId: string;
  token: string;
  bleNonce?: string;
  expiresAt: string;
  onClose: () => void;
};

export function OpponentQrModal({
  open,
  matchId,
  token,
  bleNonce,
  expiresAt,
  onClose
}: OpponentQrModalProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const payload = JSON.stringify({ token, bleNonce, matchId });
  const timeLeft = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-md border-white/10 bg-slate-950 text-white">
        <DialogHeader>
          <DialogTitle>Show this QR to your opponent</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-white/70">
            Keep Bluetooth ON. Your opponent must scan this QR to confirm you are nearby.
          </p>
          <div className="flex justify-center">
            <QrCodeDisplay value={payload} />
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            <p>Match: {matchId.slice(0, 8)}</p>
            <p>Expires in: {timeLeft}s</p>
            <p>Bluetooth: {bleNonce ? "Ready" : "Waiting"}</p>
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Hide QR
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
