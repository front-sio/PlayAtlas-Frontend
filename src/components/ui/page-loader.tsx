"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export function PageLoader({
  label = "Loading…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50", className)}>
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full border-4 border-white/20 border-t-purple-500 animate-spin" />
        <p className="text-lg font-medium text-white">{label}</p>
      </div>
    </div>
  );
}
