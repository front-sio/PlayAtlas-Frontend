'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canAccessAdmin, canViewTournaments, canViewWallets, canViewFinancialReports, canManageUsers } from '@/lib/permissions';
import { useSocket } from '@/hooks/useSocket';
import {
  Trophy,
  Users,
  UserPlus,
  Wallet,
  TrendingUp,
  Gamepad2,
  Activity,
  AlertCircle,
  Download
} from 'lucide-react';

export default function AdminPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    verifiedUsers: 0,
    newUsersLast7Days: 0,
    totalAgents: 0,
    activeTournaments: 0,
    totalPlayers: 0,
    activeSeasons: 0,
    pendingDeposits: 0,
    pendingCashouts: 0,
    activeSessions: 0,
    platformRevenue: 0,
    platformWalletBalance: 0,
    systemWalletBalance: 0,
    aiWalletBalance: 0,
    generalRevenue: 0,
    transactionFees: 0,
    walletCount: 0,
    totalBalance: 0,
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
      href: '/admin/payments', 
      title: 'Payments', 
      description: 'Deposits and cashouts',
      icon: Wallet,
      color: 'from-green-500 to-emerald-600',
      stat: stats.pendingDeposits + stats.pendingCashouts,
      statLabel: 'Pending'
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
      stat: `TSH ${stats.generalRevenue.toLocaleString()}`,
      statLabel: 'General'
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
      const users = data?.users || {};
      const financial = data?.financial || {};
      const tournaments = data?.tournaments || {};
      const payments = data?.payments || {};
      setStats((prev) => ({
        ...prev,
        totalUsers: users.totalUsers ?? data.totalUsers ?? prev.totalUsers,
        activeUsers: users.activeUsers ?? prev.activeUsers,
        verifiedUsers: users.verifiedUsers ?? prev.verifiedUsers,
        newUsersLast7Days: users.newUsersLast7Days ?? prev.newUsersLast7Days,
        totalAgents: data.totalAgents ?? prev.totalAgents,
        activeTournaments: tournaments.activeTournaments ?? tournaments.statusCounts?.active ?? prev.activeTournaments,
        totalPlayers: tournaments.totalPlayers ?? prev.totalPlayers,
        activeSeasons: tournaments.activeSeasons ?? prev.activeSeasons,
        pendingDeposits: payments.pendingDeposits ?? data.pendingDeposits ?? prev.pendingDeposits,
        pendingCashouts: payments.pendingCashouts ?? data.pendingCashouts ?? prev.pendingCashouts,
        activeSessions: data.activeSessions ?? prev.activeSessions,
        platformRevenue: financial.platformRevenue ?? prev.platformRevenue,
        platformWalletBalance: financial.platformWalletBalance ?? prev.platformWalletBalance,
        systemWalletBalance: financial.systemWalletBalance ?? prev.systemWalletBalance,
        aiWalletBalance: financial.aiWalletBalance ?? prev.aiWalletBalance,
        generalRevenue: financial.generalRevenue ?? prev.generalRevenue,
        transactionFees: payments.transactionFees ?? financial.transactionFees ?? prev.transactionFees,
        walletCount: financial.walletCount ?? prev.walletCount,
        totalBalance: financial.totalBalance ?? prev.totalBalance
      }));
      setStatsLoading(false);
    };

    const handlePaymentStats = (data: any) => {
      console.log('Payment stats updated:', data);
      setStats((prev) => ({
        ...prev,
        pendingDeposits: data.pendingDeposits ?? prev.pendingDeposits,
        pendingCashouts: data.pendingCashouts ?? prev.pendingCashouts,
        transactionFees: data.transactionFees ?? prev.transactionFees,
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
    if (link.href.includes('/wallets') || link.href.includes('/deposits') || link.href.includes('/cashouts') || link.href.includes('/payments')) {
      return canViewWallets(role);
    }
    if (link.href.includes('/revenue')) return canViewFinancialReports(role);
    return true; // Show games by default
  });

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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
            <p className="mt-1 text-xs text-slate-500">Registered users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Active Users</CardTitle>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.activeUsers}
            </div>
            <p className="mt-1 text-xs text-slate-500">Active accounts</p>
          </CardContent>
        </Card>
          <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-sm font-medium text-green-500'>Total Players</CardTitle>
              <Users className='h-4 w-4 text-green-900' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-slate-900'>0</div>
            <p className='mt-1 text-xs text-slate-500'>Registered now</p>
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
              <CardTitle className="text-sm font-medium text-slate-500">Tournament Players</CardTitle>
              <Users className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.totalPlayers}
            </div>
            <p className="mt-1 text-xs text-slate-500">Active seasons {stats.activeSeasons}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-sm font-medium text-green-500'>Running Seasons</CardTitle>
              <Gamepad2 className='h-4 w-4 text-slate-900' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-slate-900'>0</div>
            <p className='mt-1 text-xs text-slate-500'>Online now</p>
          </CardContent>
        </Card>
          <Card>
          <CardHeader>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-sm font-medium text-green-500'>Playing Players</CardTitle>
              <Gamepad2 className='h-4 w-4 text-slate-900' />
            </div>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-slate-900'>0</div>
            <p className='mt-1 text-xs text-slate-500'>Playing now</p>
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Pending Payments</CardTitle>
              <AlertCircle className="h-4 w-4 text-orange-500" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : stats.pendingDeposits + stats.pendingCashouts}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Deposits {stats.pendingDeposits} • Cashouts {stats.pendingCashouts}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Platform Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : `TSH ${stats.platformWalletBalance.toLocaleString()}`}
            </div>
            <p className="mt-1 text-xs text-slate-500">Platform fees + transaction fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">System Wallet</CardTitle>
              <Wallet className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : `TSH ${stats.systemWalletBalance.toLocaleString()}`}
            </div>
            <p className="mt-1 text-xs text-slate-500">Tournament entry fees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">AI Wallet Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : `TSH ${stats.aiWalletBalance.toLocaleString()}`}
            </div>
            <p className="mt-1 text-xs text-slate-500">AI winnings balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">General Revenue</CardTitle>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {statsLoading ? '—' : `TSH ${stats.generalRevenue.toLocaleString()}`}
            </div>
            <p className="mt-1 text-xs text-slate-500">Platform + system + AI</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Access Links */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-900">Quick Access</h3>
          <Button asChild>
            <a href="/play-atlas.apk" download>
              <Download className="h-4 w-4" />
              Download APK
            </a>
          </Button>
        </div>
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
