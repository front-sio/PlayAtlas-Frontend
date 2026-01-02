'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canViewFinancialReports } from '@/lib/permissions';
import {
  Calendar,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Filter,
  Loader2,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import Link from 'next/link';

interface PlatformRevenueData {
  totalRevenue: number;
  totalTournamentFees: number;
  totalDepositFees: number;
  totalWithdrawalFees: number;
  totalTransferFees: number;
  dailyAverage: number;
  trend: number;
  data: Array<{
    id: string;
    date: string;
    period: string;
    tournamentFees: number;
    depositFees: number;
    withdrawalFees: number;
    transferFees: number;
    totalRevenue: number;
  }>;
}

export default function PlatformRevenuePage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  
  const [revenueData, setRevenueData] = useState<PlatformRevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Date range filters
  const [dateRange, setDateRange] = useState<'today' | 'week' | 'month' | 'custom'>('month');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!token || (role && !canViewFinancialReports(role))) return;

    const loadRevenueData = async () => {
      setLoading(true);
      setError('');

      try {
        // Calculate date range
        const end = new Date();
        let start = new Date();

        switch (dateRange) {
          case 'today':
            start = new Date();
            break;
          case 'week':
            start.setDate(start.getDate() - 7);
            break;
          case 'month':
            start.setMonth(start.getMonth() - 1);
            break;
          case 'custom':
            if (startDate && endDate) {
              start = new Date(startDate);
              end.setTime(new Date(endDate).getTime() + 24 * 60 * 60 * 1000);
            } else {
              setError('Please select both start and end dates');
              setLoading(false);
              return;
            }
            break;
        }

        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/revenue/platform?startDate=${start.toISOString()}&endDate=${end.toISOString()}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (!response.ok) {
          throw new Error('Failed to load platform revenue data');
        }

        const data = await response.json();
        
        if (data.success) {
          setRevenueData(data.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load platform revenue data');
      } finally {
        setLoading(false);
      }
    };

    loadRevenueData();
  }, [token, role, dateRange, startDate, endDate]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-TZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const handleExport = () => {
    if (!revenueData) return;

    const csv = [
      ['Date', 'Tournament Fees', 'Deposit Fees', 'Withdrawal Fees', 'Transfer Fees', 'Total Revenue'].join(','),
      ...revenueData.data.map(row => [
        formatDate(row.date),
        row.tournamentFees.toFixed(2),
        row.depositFees.toFixed(2),
        row.withdrawalFees.toFixed(2),
        row.transferFees.toFixed(2),
        row.totalRevenue.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `platform-revenue-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (status === 'authenticated' && role && !canViewFinancialReports(role)) {
    return <AccessDenied message="You do not have permission to view platform revenue." />;
  }

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
        <TrendingDown className="h-12 w-12 text-red-500" />
        <p className="text-slate-600">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/admin/revenue" className="text-slate-500 hover:text-slate-700">
            ← Back
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Platform Revenue</h1>
            <p className="mt-1 text-sm text-slate-500">Comprehensive platform revenue analytics</p>
          </div>
        </div>
        <button
          onClick={handleExport}
          disabled={!revenueData}
          className="px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-700 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <span className="text-sm font-medium text-slate-700">Date Range:</span>
            </div>
            <div className="flex gap-2">
              {(['today', 'week', 'month', 'custom'] as const).map((range) => (
                <button
                  key={range}
                  onClick={() => setDateRange(range)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                    dateRange === range
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
            {dateRange === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <span className="text-slate-400">to</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {revenueData && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Total Revenue</CardTitle>
                  <DollarSign className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalRevenue)}
                </div>
                <div className="mt-2 flex items-center gap-1">
                  {revenueData.trend >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-red-500" />
                  )}
                  <span className={`text-sm ${revenueData.trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {revenueData.trend >= 0 ? '+' : ''}{revenueData.trend.toFixed(1)}%
                  </span>
                  <span className="text-xs text-slate-500 ml-1">trend</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Tournament Fees</CardTitle>
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalTournamentFees)}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {((revenueData.totalTournamentFees / revenueData.totalRevenue) * 100 || 0).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Deposit Fees</CardTitle>
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalDepositFees)}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {((revenueData.totalDepositFees / revenueData.totalRevenue) * 100 || 0).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Withdrawal Fees</CardTitle>
                  <TrendingDown className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalWithdrawalFees)}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {((revenueData.totalWithdrawalFees / revenueData.totalRevenue) * 100 || 0).toFixed(1)}% of total
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Daily Average</CardTitle>
                  <Calendar className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.dailyAverage)}
                </div>
                <p className="mt-2 text-xs text-slate-500">Per day</p>
              </CardContent>
            </Card>
          </div>

          {/* Revenue Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-900">Revenue Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Date</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Tournament Fees</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Deposit Fees</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Withdrawal Fees</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Transfer Fees</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Total Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.data.map((row) => (
                      <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="py-3 px-4 text-sm text-slate-900">{formatDate(row.date)}</td>
                        <td className="py-3 px-4 text-sm text-right text-slate-900">{formatCurrency(row.tournamentFees)}</td>
                        <td className="py-3 px-4 text-sm text-right text-slate-900">{formatCurrency(row.depositFees)}</td>
                        <td className="py-3 px-4 text-sm text-right text-slate-900">{formatCurrency(row.withdrawalFees)}</td>
                        <td className="py-3 px-4 text-sm text-right text-slate-900">{formatCurrency(row.transferFees)}</td>
                        <td className="py-3 px-4 text-sm text-right font-semibold text-slate-900">{formatCurrency(row.totalRevenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
