"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useMemo, useState, useEffect } from "react";
import {
  BarChart3,
  Banknote,
  Building2,
  ClipboardList,
  Gamepad2,
  Home,
  LayoutGrid,
  LogOut,
  Menu,
  Trophy,
  Users,
  Wallet,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { Badge } from "@/components/ui/badge";
import { useSocket } from "@/hooks/useSocket";

const NAV_ITEMS = [
  { href: "/admin", label: "Overview", icon: LayoutGrid, description: "Dashboard overview and stats" },
  { href: "/admin/finance", label: "Finance", icon: Banknote, description: "Financial management" },
  { href: "/admin/payments", label: "Payments", icon: Wallet, description: "Deposits and cashouts" },
  { href: "/admin/deposits", label: "Deposits", icon: Wallet, description: "Manage deposit requests" },
  { href: "/admin/cashouts", label: "Cashouts", icon: ClipboardList, description: "Manage cashout requests" },
  { href: "/admin/wallets", label: "Wallets", icon: Wallet, description: "View and manage wallets" },
  { href: "/admin/users", label: "Users", icon: Users, description: "User and agent management" },
  { href: "/admin/clubs", label: "Clubs", icon: Building2, description: "Club management" },
  { href: "/admin/games", label: "Games", icon: Gamepad2, description: "Game session management" },
  { href: "/admin/tournaments", label: "Tournaments", icon: Trophy, description: "Tournament management" },
  { href: "/admin/revenue", label: "Revenue", icon: BarChart3, description: "Revenue and analytics" }
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pendingDeposits, setPendingDeposits] = useState(0);
  const [pendingCashouts, setPendingCashouts] = useState(0);

  const navItems = useMemo(() => NAV_ITEMS, []);

  // Use Socket.IO for real-time updates
  const { socket, isConnected } = useSocket({ enabled: true });

  // Fetch initial counts and listen for updates
  useEffect(() => {
    if (!socket) return;

    // Fetch initial counts
    const fetchInitialCounts = async () => {
      const token = (session as any)?.accessToken;
      if (!token) return;

      try {
        const response = await fetch('/api/admin/payments/stats', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setPendingDeposits(data.data?.pendingDeposits || 0);
            setPendingCashouts(data.data?.pendingCashouts || 0);
          }
        }
      } catch (error) {
        console.error('Failed to fetch initial pending counts:', error);
      }
    };

    fetchInitialCounts();

    // Listen for real-time updates
    const handlePendingUpdate = (data: { pendingDeposits?: number; pendingCashouts?: number }) => {
      console.log('Pending counts updated:', data);
      if (data.pendingDeposits !== undefined) {
        setPendingDeposits(data.pendingDeposits);
      }
      if (data.pendingCashouts !== undefined) {
        setPendingCashouts(data.pendingCashouts);
      }
    };

    const handleDepositUpdate = (data: { type: string; count: number }) => {
      if (data.type === 'pending') {
        setPendingDeposits(data.count);
      }
    };

    const handleCashoutUpdate = (data: { type: string; count: number }) => {
      if (data.type === 'pending') {
        setPendingCashouts(data.count);
      }
    };

    socket.on('admin:payment:stats', handlePendingUpdate);
    socket.on('admin:deposit:update', handleDepositUpdate);
    socket.on('admin:cashout:update', handleCashoutUpdate);

    return () => {
      socket.off('admin:payment:stats', handlePendingUpdate);
      socket.off('admin:deposit:update', handleDepositUpdate);
      socket.off('admin:cashout:update', handleCashoutUpdate);
    };
  }, [socket, session]);

  // Get current page info
  const currentPage = useMemo(() => {
    const matched = navItems.find(item => {
      if (item.href === "/admin") {
        return pathname === "/admin";
      }
      return pathname === item.href || pathname?.startsWith(item.href + "/");
    });
    return matched || navItems[0];
  }, [pathname, navItems]);

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/auth/login");
  };

  const Sidebar = (
    <aside className="flex h-full flex-col gap-6 bg-slate-950 px-5 py-6 text-slate-100">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
          <Trophy className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm uppercase tracking-wide text-emerald-200/80">Back office</p>
          <p className="text-lg font-semibold text-white">PlayAtlas</p>
        </div>
      </div>

      <nav className="space-y-1">
        <Link
          href="/dashboard"
          onClick={() => setMobileOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-purple-300 hover:bg-purple-500/10 hover:text-purple-200 transition border border-purple-500/30"
        >
          <Home className="h-4 w-4" />
          Back to Player Dashboard
        </Link>
        
        <div className="my-3 border-t border-white/10" />
        
        {navItems.map((item) => {
          const active = item.href === "/admin" 
            ? pathname === "/admin" 
            : pathname === item.href || pathname?.startsWith(item.href + "/");
          const Icon = item.icon;
          
          // Calculate badge count based on route
          let badgeCount = 0;
          if (item.href === "/admin/deposits") {
            badgeCount = pendingDeposits;
          } else if (item.href === "/admin/cashouts") {
            badgeCount = pendingCashouts;
          } else if (item.href === "/admin/payments") {
            badgeCount = pendingDeposits + pendingCashouts;
          }
          
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                active
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "text-slate-200/80 hover:bg-white/5 hover:text-white"
              }`}
            >
              <div className="flex items-center gap-3 flex-1">
                <Icon className="h-4 w-4" />
                <span className="flex-1">{item.label}</span>
                {badgeCount > 0 && (
                  <Badge className="h-5 px-1.5 text-xs bg-red-500 text-white hover:bg-red-600">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </Badge>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto rounded-lg border border-white/10 bg-white/5 p-3">
        <p className="text-xs text-slate-300/80">Signed in as</p>
        <p className="text-sm font-medium text-white">
          {session?.user?.username || session?.user?.email || "Admin"}
        </p>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSignOut}
          className="mt-3 w-full justify-start text-slate-200 hover:text-white"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </Button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      <div className="flex">
        <div className="hidden fixed top-0 left-0 h-screen w-64 lg:block z-40">{Sidebar}</div>

        <div className="flex min-h-screen flex-1 flex-col lg:ml-64">
          <header className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 py-4 backdrop-blur shadow-sm sm:px-6">
            <div className="flex min-w-0 items-center space-x-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden hover:bg-slate-100"
              >
                <Menu className="h-5 w-5 text-slate-900" />
              </Button>
              <div>
                <div className="flex items-center space-x-2">
                  <currentPage.icon className="w-5 h-5 text-slate-600" />
                  <h1 className="text-lg font-semibold text-slate-900 sm:text-xl">{currentPage.label}</h1>
                </div>
                <p className="text-sm text-slate-600">{currentPage.description}</p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <NotificationBell theme="light" />
              <div className="text-right">
                <p className="text-xs text-slate-500">Logged in as</p>
                <p className="text-sm font-medium text-slate-900">{session?.user?.username || session?.user?.email || "Admin"}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-linear-to-br from-emerald-500 to-emerald-600 text-white text-sm font-semibold">
                {(session?.user?.username || "Admin").charAt(0).toUpperCase()}
              </div>
            </div>
          </header>

          <main className="flex-1 px-4 py-6 sm:px-6">
            {children}
          </main>
        </div>
      </div>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-full max-w-sm bg-slate-950 text-slate-100 flex flex-col lg:hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <span className="text-base font-semibold text-white">Admin Menu</span>
              <Button variant="ghost" size="icon" onClick={() => setMobileOpen(false)} className="text-white hover:text-slate-200">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 px-5 py-6 overflow-y-auto">
              <nav className="space-y-1">
                <Link
                  href="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium text-purple-300 hover:bg-purple-500/10 hover:text-purple-200 transition border border-purple-500/30"
                >
                  <Home className="h-5 w-5" />
                  <span className="font-medium">Back to Player Dashboard</span>
                </Link>
                
                <div className="my-3 border-t border-white/10" />
                
                {navItems.map((item) => {
                  const active = item.href === "/admin" 
                    ? pathname === "/admin" 
                    : pathname === item.href || pathname?.startsWith(item.href + "/");
                  const Icon = item.icon;
                  
                  // Calculate badge count based on route
                  let badgeCount = 0;
                  if (item.href === "/admin/deposits") {
                    badgeCount = pendingDeposits;
                  } else if (item.href === "/admin/cashouts") {
                    badgeCount = pendingCashouts;
                  }
                  
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm transition ${
                        active
                          ? "bg-emerald-500/20 text-emerald-200"
                          : "text-white hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Icon className="h-5 w-5" />
                        <span className="font-medium flex-1">{item.label}</span>
                        {badgeCount > 0 && (
                          <Badge className="h-5 px-1.5 text-xs bg-red-500 text-white hover:bg-red-600">
                            {badgeCount > 9 ? '9+' : badgeCount}
                          </Badge>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </nav>
            </div>
            <div className="border-t border-white/10 p-5">
              <div className="rounded-lg border border-white/10 bg-white/5 p-4 mb-3">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs text-slate-300 mb-2">Signed in as</p>
                    <p className="text-sm font-medium text-white">
                      {session?.user?.username || session?.user?.email || "Admin"}
                    </p>
                  </div>
                </div>
                <Button
                  
                  size="sm"
                  onClick={handleSignOut}
                  className="w-full justify-start text-white border-white/20 hover:bg-white/10 hover:text-slate-200"
                >
                  <LogOut className="mr-2 h-4 w-4 text-white" />
                  <span className="text-white">Sign out</span>
                </Button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
