'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canAccessAdmin, canViewTournaments, canViewWallets, canViewFinancialReports, canManageUsers } from '@/lib/permissions';
import { useSocket } from '@/hooks/useSocket';
import {
  Trophy,
  Users,
  UserPlus,
  Wallet,
  DollarSign,
  TrendingUp,
  Gamepad2,
  Activity,
  AlertCircle
} from 'lucide-react';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAgents: 0,
    activeTournaments: 0,
    pendingDeposits: 0,
    pendingCashouts: 0,
    activeSessions: 0,
    platformRevenue: 0,
  });
  const [statsError, setStatsError] = useState('');
  const [statsLoading, setStatsLoading] = useState(true);
  
  // Use Socket.IO for real-time updates
  const { socket } = useSocket({ enabled: true });

  const quickLinks = [
    { 
      href: '/admin/tournaments', 
      title: 'Tournaments', 
      description: 'Create and manage tournaments',
      icon: Trophy,
      color: 'from-yellow-500 to-orange-600',
      stat: stats.activeTournaments,
      statLabel: 'Active'
    },
    { 
      href: '/admin/users', 
      title: 'Users', 
      description: 'Manage player accounts',
      icon: Users,
      color: 'from-blue-500 to-cyan-600',
      stat: stats.totalUsers,
      statLabel: 'Total Users'
    },
    { 
      href: '/admin/deposits', 
      title: 'Deposits', 
      description: 'Review pending deposits',
      icon: Wallet,
      color: 'from-green-500 to-emerald-600',
      stat: stats.pendingDeposits,
      statLabel: 'Pending Deposits'
    },
    { 
      href: '/admin/cashouts', 
      title: 'Cashouts', 
      description: 'Approve withdrawal requests',
      icon: DollarSign,
      color: 'from-purple-500 to-pink-600',
      stat: stats.pendingCashouts,
      statLabel: 'Pending Cashouts'
    },
    { 
      href: '/admin/agents', 
      title: 'Agents', 
      description: 'Manage agent accounts',
      icon: UserPlus,
      color: 'from-slate-700 to-slate-900',
      stat: stats.totalAgents,
      statLabel: 'Total Agents'
    },
    {
      href: '/admin/wallets',
      title: 'Wallets',
      description: 'Manage user and agent wallets',
      icon: Wallet,
      color: 'from-slate-600 to-slate-800',
      stat: 'Manage',
      statLabel: 'Wallets'
    },
    { 
      href: '/admin/games', 
      title: 'Game Sessions', 
      description: 'Monitor active games',
      icon: Gamepad2,
      color: 'from-indigo-500 to-purple-600',
      stat: stats.activeSessions,
      statLabel: 'Active'
    },
    {
      href: '/admin/revenue', 
      title: 'Revenue', 
      description: 'Financial reports',
      icon: TrendingUp,
      color: 'from-red-500 to-orange-600',
      stat: `TSH ${stats.platformRevenue.toLocaleString()}`,
      statLabel: 'Platform'
    },
  ];

  if (status === 'authenticated' && role && !canAccessAdmin(role)) {
    return <AccessDenied message="You do not have permission to view the admin dashboard." />;
  }

  useEffect(() => {
    if (!socket || (role && !canAccessAdmin(role))) return;
    setStatsLoading(true);
    setStatsError('');
    socket.emit('admin:dashboard:request');
  }, [socket, role]);

  // Listen for real-time Socket.IO updates
  useEffect(() => {
    if (!socket) return;

    const handleDashboardStats = (data: any) => {
      console.log('Dashboard stats updated:', data);
      setStats((prev) => ({
        ...prev,
        ...data
      }));
      setStatsLoading(false);
    };

    const handlePaymentStats = (data: any) => {
      console.log('Payment stats updated:', data);
      setStats((prev) => ({
        ...prev,
        pendingDeposits: data.pendingDeposits ?? prev.pendingDeposits,
        pendingCashouts: data.pendingCashouts ?? prev.pendingCashouts,
      }));
    };

    const handleUserStats = (data: any) => {
      console.log('User stats updated:', data);
      setStats((prev) => ({
        ...prev,
        totalUsers: data.totalUsers ?? prev.totalUsers,
        totalAgents: data.totalAgents ?? prev.totalAgents,
      }));
    };

    const handleDashboardError = (data: { message?: string }) => {
      setStatsError(data?.message || 'Failed to load dashboard stats');
      setStatsLoading(false);
    };

    socket.on('admin:dashboard:stats', handleDashboardStats);
    socket.on('admin:payment:stats', handlePaymentStats);
    socket.on('admin:user:stats', handleUserStats);
    socket.on('admin:dashboard:error', handleDashboardError);

    return () => {
      socket.off('admin:dashboard:stats', handleDashboardStats);
      socket.off('admin:payment:stats', handlePaymentStats);
      socket.off('admin:user:stats', handleUserStats);
      socket.off('admin:dashboard:error', handleDashboardError);
    };
  }, [socket]);

  // Filter quick links based on permissions
  const filteredQuickLinks = quickLinks.filter(link => {
    if (link.href.includes('/tournaments')) return canViewTournaments(role);
    if (link.href.includes('/users')) return canManageUsers(role);
    if (link.href.includes('/agents')) return canManageUsers(role);
    if (link.href.includes('/wallets') || link.href.includes('/deposits') || link.href.includes('/cashouts')) {
      return canViewWallets(role);
    }
    if (link.href.includes('/revenue')) return canViewFinancialReports(role);
    return true; // Show games by default
  });

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Total Users</CardTitle>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.totalUsers}
            </div>
            <p className="mt-1 text-xs text-slate-500">Registered players</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Active Tournaments</CardTitle>
              <Trophy className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.activeTournaments}
            </div>
            <p className="mt-1 text-xs text-slate-500">Running competitions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Pending Deposits</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.pendingDeposits}
            </div>
            <p className="mt-1 text-xs text-slate-500">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Pending Cashouts</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.pendingCashouts}
            </div>
            <p className="mt-1 text-xs text-slate-500">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Active Sessions</CardTitle>
              <Gamepad2 className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.activeSessions}
            </div>
            <p className="mt-1 text-xs text-slate-500">Live games</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access Links */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Quick Access</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredQuickLinks.map((link) => {
            const Icon = link.icon;
            return (
              <Link key={link.href} href={link.href}>
                <Card className="group transition-all hover:border-slate-200 hover:shadow-lg">
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-slate-900 transition-colors group-hover:text-slate-700">
                          {link.title}
                        </CardTitle>
                        <p className="mt-1 text-sm text-slate-500">{link.description}</p>
                      </div>
                      <div className={`p-2 rounded-lg bg-linear-to-br ${link.color}`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-slate-900">{link.stat}</span>
                      <span className="text-xs text-slate-500">{link.statLabel}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-900">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-sm text-slate-700">System started successfully</p>
              <span className="ml-auto text-xs text-slate-500">Just now</span>
            </div>
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="h-2 w-2 rounded-full bg-sky-500" />
              <p className="text-sm text-slate-700">Admin dashboard accessed</p>
              <span className="ml-auto text-xs text-slate-500">Just now</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
