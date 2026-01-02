"use client";

export function AccessDenied({
  message = "You don't have permission to access this section."
}: {
  message?: string;
}) {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 z-50">
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 rounded-full border-4 border-white/20 border-t-purple-500 animate-spin" />
        <p className="text-lg font-medium text-white">Loading…</p>
      </div>
    </div>
  );
}
