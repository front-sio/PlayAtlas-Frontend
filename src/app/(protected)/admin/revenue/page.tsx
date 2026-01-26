'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canViewFinancialReports } from '@/lib/permissions';
import { adminApi } from '@/lib/apiService';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  Award,
  Activity,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  Wallet
} from 'lucide-react';
import Link from 'next/link';

interface DashboardStats {
  today: {
    revenue: number;
    tournamentFees: number;
    depositFees: number;
    withdrawalFees: number;
    growth: number;
  };
  yesterday: {
    revenue: number;
  };
  week: {
    revenue: number;
    dailyAverage: number;
  };
  month: {
    revenue: number;
    dailyAverage: number;
  };
  topAgents: Array<{
    agentId: string;
    agentName: string;
    revenue: number;
    commission: number;
  }>;
  topPlayers: Array<{
    playerId: string;
    username: string;
    lifetimeValue: number;
    netProfit: number;
  }>;
  realtime?: {
    platformWalletBalance: number;
    systemWalletBalance: number;
    aiWalletBalance: number;
    agentRevenue: number;
  };
  timestamp: string;
}

export default function RevenueDashboardPage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  const apiBase = getApiBaseUrl();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token || (role && !canViewFinancialReports(role))) return;
    let mounted = true;

    const loadDashboardStats = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(`${apiBase}/revenue/dashboard`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load dashboard stats');
        }

        const data = await response.json();
        
        if (mounted && data.success) {
          setStats(data.data);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard stats');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDashboardStats();
    const interval = setInterval(loadDashboardStats, 60000); // Refresh every minute

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [token, role]);

  if (status === 'authenticated' && role && !canViewFinancialReports(role)) {
    return <AccessDenied message="You do not have permission to view revenue analytics." />;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatPercentage = (value: number) => {
    const isPositive = value >= 0;
    return `${isPositive ? '+' : ''}${value.toFixed(1)}%`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-96 space-y-4">
        <Activity className="h-12 w-12 text-red-500" />
        <p className="text-slate-600">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-slate-600">No data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revenue Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Monitor platform revenue, agent performance, and player activity</p>
        </div>
        <Link
          href="/admin/revenue/platform"
          className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition flex items-center gap-2"
        >
          <Calendar className="h-4 w-4" />
          View Reports
        </Link>
      </div>

      {stats.realtime && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Platform Revenue</CardTitle>
                <Wallet className="h-4 w-4 text-slate-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats.realtime.platformWalletBalance)}
              </div>
              <p className="mt-2 text-xs text-slate-500">Fees + platform earnings</p>
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
                {formatCurrency(stats.realtime.systemWalletBalance)}
              </div>
              <p className="mt-2 text-xs text-slate-500">Tournament entry funds</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">Agent Revenue</CardTitle>
                <Users className="h-4 w-4 text-slate-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats.realtime.agentRevenue)}
              </div>
              <p className="mt-2 text-xs text-slate-500">Agent wallet totals</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-slate-500">AI Wallet</CardTitle>
                <TrendingUp className="h-4 w-4 text-slate-400" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-900">
                {formatCurrency(stats.realtime.aiWalletBalance)}
              </div>
              <p className="mt-2 text-xs text-slate-500">AI winnings balance</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quick Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Today's Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Today's Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(stats.today.revenue)}
            </div>
            <div className="mt-2 flex items-center gap-1">
              {stats.today.growth >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-emerald-500" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              )}
              <span className={`text-sm ${stats.today.growth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {formatPercentage(stats.today.growth)}
              </span>
              <span className="text-xs text-slate-500 ml-1">vs yesterday</span>
            </div>
          </CardContent>
        </Card>

        {/* Week Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">This Week</CardTitle>
              <Calendar className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(stats.week.revenue)}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Daily avg: {formatCurrency(stats.week.dailyAverage)}
            </p>
          </CardContent>
        </Card>

        {/* Month Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">This Month</CardTitle>
              <Activity className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(stats.month.revenue)}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Daily avg: {formatCurrency(stats.month.dailyAverage)}
            </p>
          </CardContent>
        </Card>

        {/* Yesterday Revenue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-slate-500">Yesterday</CardTitle>
              <TrendingUp className="h-4 w-4 text-slate-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {formatCurrency(stats.yesterday.revenue)}
            </div>
            <p className="mt-2 text-xs text-slate-500">Previous day</p>
          </CardContent>
        </Card>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Revenue Sources */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900">Today's Revenue Sources</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Tournament Fees</p>
                <p className="text-xs text-slate-500">Entry fees from tournaments</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(stats.today.tournamentFees)}
                </p>
                <p className="text-xs text-slate-500">
                  {((stats.today.tournamentFees / stats.today.revenue) * 100 || 0).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Deposit Fees</p>
                <p className="text-xs text-slate-500">Fees from deposits</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(stats.today.depositFees)}
                </p>
                <p className="text-xs text-slate-500">
                  {((stats.today.depositFees / stats.today.revenue) * 100 || 0).toFixed(1)}%
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">Withdrawal Fees</p>
                <p className="text-xs text-slate-500">Fees from withdrawals</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-slate-900">
                  {formatCurrency(stats.today.withdrawalFees)}
                </p>
                <p className="text-xs text-slate-500">
                  {((stats.today.withdrawalFees / stats.today.revenue) * 100 || 0).toFixed(1)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Navigation */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900">Analytics Sections</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Link href="/admin/revenue/platform">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer">
                <div className="p-2 rounded-lg bg-blue-100">
                  <DollarSign className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Platform Revenue</p>
                  <p className="text-xs text-slate-500">Overall platform analytics</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </div>
            </Link>

            <Link href="/admin/revenue/agents">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer">
                <div className="p-2 rounded-lg bg-purple-100">
                  <Users className="h-5 w-5 text-purple-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Agent Revenue</p>
                  <p className="text-xs text-slate-500">Agent performance metrics</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </div>
            </Link>

            <Link href="/admin/revenue/players">
              <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 hover:border-slate-300 hover:bg-slate-50 transition cursor-pointer">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <Award className="h-5 w-5 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-900">Player Revenue</p>
                  <p className="text-xs text-slate-500">Player profitability analysis</p>
                </div>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </div>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Top Performers */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Top Agents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900">Top Performing Agents</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topAgents.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No agent data available</p>
              ) : (
                stats.topAgents.map((agent, index) => (
                  <div key={agent.agentId} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{agent.agentName}</p>
                        <p className="text-xs text-slate-500">{formatCurrency(agent.commission)} commission</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(agent.revenue)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Players */}
        <Card>
          <CardHeader>
            <CardTitle className="text-slate-900">Top Value Players</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.topPlayers.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-4">No player data available</p>
              ) : (
                stats.topPlayers.map((player, index) => (
                  <div key={player.playerId} className="flex items-center justify-between p-3 rounded-lg bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-slate-200 text-slate-600 text-sm font-semibold">
                        {index + 1}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{player.username || `Player ${player.playerId.slice(0, 8)}`}</p>
                        <p className="text-xs text-slate-500">Net: {formatCurrency(player.netProfit)}</p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(player.lifetimeValue)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
