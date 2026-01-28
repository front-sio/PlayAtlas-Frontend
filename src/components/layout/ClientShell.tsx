"use client";

import { usePathname } from "next/navigation";
import { AppBar } from "@/components/layout/AppBar";

export function ClientShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuth = pathname?.startsWith("/auth");
  const isAdmin = pathname?.startsWith("/admin");
  const isGameLobby = pathname === "/game" || pathname === "/game/pc";
  const isPlayMode =
    pathname?.startsWith('/game/practice') ||
    pathname?.startsWith('/game/match') ||
    pathname?.startsWith('/play/');

  if (isAuth || isPlayMode) {
    return <>{children}</>;
  }

  if (isAdmin) {
    return <>{children}</>;
  }

  if (isGameLobby) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <AppBar />
        <main className="w-full">{children}</main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <AppBar />
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
