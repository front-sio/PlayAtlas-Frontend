"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Trophy, LogOut, Menu, X } from "lucide-react";
import { useMemo, useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";

const NAV = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/game", label: "Game" },
  { href: "/wallet", label: "Wallet" },
  { href: "/profile", label: "Profile" },
];

export function AppBar() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAuthed = status === "authenticated";

  const visibleNav = useMemo(() => {
    if (!isAuthed) return [];
    // Hide Admin link unless privileged. (You can expand this later.)
    const role = session?.user?.role?.toLowerCase();
    const isPrivileged = [
      "admin",
      "super_admin",
      "superuser",
      "superadmin",
      "manager",
      "director",
      "staff",
      "moderator",
      "finance_manager",
      "finance_officer",
      "tournament_manager",
      "game_manager",
      "game_master",
      "support",
    ].includes(role || "");
    const isAgent = ["agent"].includes(role || "");
    const items = [...NAV];
    if (isPrivileged) items.push({ href: "/admin", label: "Admin" });
    if (isAgent) items.push({ href: "/agent", label: "Agent" });
    return items;
  }, [isAuthed, session?.user?.role]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/auth/login");
  };

  // Hide appbar on auth routes
  if (pathname?.startsWith("/auth")) return null;

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-black/30 backdrop-blur">
      <div className="container mx-auto flex items-center justify-between px-4 py-3">
        <Link href={isAuthed ? "/dashboard" : "/"} className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-r from-cyan-500 to-purple-600">
            <Trophy className="h-5 w-5 text-white" />
          </span>
          <span className="text-lg font-semibold text-white">PlayAtlas</span>
        </Link>

        {isAuthed && (
          <nav className="hidden items-center gap-5 md:flex">
            {visibleNav.map((item) => {
              const active = pathname === item.href || pathname?.startsWith(item.href + "/");
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={
                    active
                      ? "text-white"
                      : "text-white/70 hover:text-white transition-colors"
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMobileOpen((v) => !v)}
            className="text-white md:hidden"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>

          {isAuthed ? (
            <div className="hidden items-center gap-3 md:flex">
              <NotificationBell />
              <span className="text-sm text-white/80">
                {session?.user?.username || session?.user?.email || "Player"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignOut}
                className="text-white/80 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <div className="hidden gap-2 md:flex">
              <Link href="/auth/login">
                <Button variant="ghost" size="sm" className="text-white/80 hover:text-white">
                  Sign in
                </Button>
              </Link>
              <Link href="/auth/register">
                <Button size="sm" className="bg-gradient-to-r from-purple-600 to-pink-600">
                  Create account
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-white/10 bg-black/40 md:hidden">
          <div className="container mx-auto flex flex-col gap-2 px-4 py-3">
            {isAuthed &&
              visibleNav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-2 py-2 text-white/80 hover:bg-white/10 hover:text-white"
                  onClick={() => setMobileOpen(false)}
                >
                  {item.label}
                </Link>
            ))}
            {isAuthed && (
              <div className="flex items-center justify-between px-2 py-2">
                <span className="text-sm text-white/80">
                  {session?.user?.username || session?.user?.email || "Player"}
                </span>
                <NotificationBell />
              </div>
            )}
            {isAuthed ? (
              <Button
                variant="ghost"
                className="justify-start text-white/80 hover:text-white"
                onClick={handleSignOut}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </Button>
            ) : (
              <div className="flex gap-2">
                <Link href="/auth/login" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button  className="w-full border-white/20 text-white">
                    Sign in
                  </Button>
                </Link>
                <Link href="/auth/register" className="flex-1" onClick={() => setMobileOpen(false)}>
                  <Button className="w-full bg-gradient-to-r from-purple-600 to-pink-600">
                    Sign up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
