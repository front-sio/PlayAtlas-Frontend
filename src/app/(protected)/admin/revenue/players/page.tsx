'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canViewFinancialReports } from '@/lib/permissions';
import {
  Award,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Download,
  Filter,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import Link from 'next/link';

interface PlayerRevenueData {
  totalPlayers: number;
  totalWinnings: number;
  totalLosses: number;
  totalFeesPaid: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalLifetimeValue: number;
  averageLifetimeValue: number;
  topPlayers: Array<{
    playerId: string;
    username: string;
    agentId: string;
    agentName: string;
    date: string;
    period: string;
    totalWinnings: number;
    totalLosses: number;
    feesPaid: number;
    netProfit: number;
    totalDeposits: number;
    totalWithdrawals: number;
    gamesPlayed: number;
    tournamentsPlayed: number;
    lifetimeValue: number;
    profitabilityScore: number;
    currency: string;
  }>;
  pagination: {
    total: number;
    limit: number;
    offset: number;
    pages: number;
  };
}

export default function PlayerRevenuePage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  
  const [revenueData, setRevenueData] = useState<PlayerRevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters and pagination
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState<'lifetimeValue' | 'netProfit' | 'profitabilityScore'>('lifetimeValue');

  useEffect(() => {
    if (!token || (role && !canViewFinancialReports(role))) return;

    const loadPlayerRevenue = async () => {
      setLoading(true);
      setError('');

      try {
        // Default to last month
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 1);

        const url = new URL(`${process.env.NEXT_PUBLIC_API_URL}/revenue/player`);
        url.searchParams.append('startDate', start.toISOString());
        url.searchParams.append('endDate', end.toISOString());
        url.searchParams.append('limit', itemsPerPage.toString());
        url.searchParams.append('offset', (currentPage * itemsPerPage).toString());

        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load player revenue data');
        }

        const data = await response.json();
        
        if (data.success) {
          setRevenueData(data.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load player revenue data');
      } finally {
        setLoading(false);
      }
    };

    loadPlayerRevenue();
  }, [token, role, currentPage, itemsPerPage]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getProfitabilityColor = (score: number) => {
    if (score > 50) return 'text-emerald-600';
    if (score > 0) return 'text-sky-600';
    if (score > -50) return 'text-orange-600';
    return 'text-red-600';
  };

  const getProfitabilityLabel = (score: number) => {
    if (score > 50) return 'High';
    if (score > 0) return 'Positive';
    if (score > -50) return 'Negative';
    return 'High Loss';
  };

  const handleExport = () => {
    if (!revenueData) return;

    const csv = [
      ['Player Name', 'Player ID', 'Lifetime Value', 'Net Profit', 'Winnings', 'Losses', 'Fees Paid', 'Games Played', 'Profitability Score'].join(','),
      ...revenueData.topPlayers.map(player => [
        player.username || 'Unknown',
        player.playerId,
        player.lifetimeValue.toFixed(2),
        player.netProfit.toFixed(2),
        player.totalWinnings.toFixed(2),
        player.totalLosses.toFixed(2),
        player.feesPaid.toFixed(2),
        player.gamesPlayed.toString(),
        player.profitabilityScore.toFixed(2)
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `player-revenue-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (status === 'authenticated' && role && !canViewFinancialReports(role)) {
    return <AccessDenied message="You do not have permission to view player revenue." />;
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
        <TrendingUp className="h-12 w-12 text-red-500" />
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
            <h1 className="text-2xl font-bold text-slate-900">Player Revenue</h1>
            <p className="mt-1 text-sm text-slate-500">Analyze player profitability and lifetime value</p>
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

      {revenueData && (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-7">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Total Players</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {revenueData.totalPlayers}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Total Winnings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-emerald-600">
                  {formatCurrency(revenueData.totalWinnings)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Total Losses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600">
                  {formatCurrency(revenueData.totalLosses)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Fees Paid</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalFeesPaid)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Total Deposits</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalDeposits)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Total Withdrawals</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalWithdrawals)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium text-slate-500">Avg LTV</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.averageLifetimeValue)}
                </div>
                <p className="mt-2 text-xs text-slate-500">Per player</p>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">Search:</span>
                </div>
                <input
                  type="text"
                  placeholder="Search by player name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 min-w-[200px] max-w-md px-4 py-2 border border-slate-300 rounded-lg text-sm"
                />
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-slate-400" />
                  <select
                    value={itemsPerPage}
                    onChange={(e) => {
                      setItemsPerPage(Number(e.target.value));
                      setCurrentPage(0);
                    }}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  >
                    <option value={10}>10 per page</option>
                    <option value={20}>20 per page</option>
                    <option value={50}>50 per page</option>
                    <option value={100}>100 per page</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Player Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-900">Player Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Player</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Lifetime Value</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Net Profit</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Winnings</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Losses</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Fees Paid</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Games</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Profitability</th>
                    </tr>
                  </thead>
                  <tbody>
                    {revenueData.topPlayers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                          No player data available
                        </td>
                      </tr>
                    ) : (
                      revenueData.topPlayers.map((player, index) => (
                        <tr key={player.playerId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 text-sm font-semibold">
                                {index + 1}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{player.username || `Player ${player.playerId.slice(0, 8)}`}</p>
                                <p className="text-xs text-slate-500">{player.agentName ? `Agent: ${player.agentName}` : 'No agent'}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900 font-semibold">
                            {formatCurrency(player.lifetimeValue)}
                          </td>
                          <td className={`py-3 px-4 text-sm text-right font-semibold ${player.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(player.netProfit)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-emerald-600">
                            {formatCurrency(player.totalWinnings)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-red-600">
                            {formatCurrency(player.totalLosses)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900">
                            {formatCurrency(player.feesPaid)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900">
                            {player.gamesPlayed}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <span className={`font-semibold ${getProfitabilityColor(player.profitabilityScore)}`}>
                              {getProfitabilityLabel(player.profitabilityScore)}
                            </span>
                            <span className="ml-1 text-slate-500">({player.profitabilityScore.toFixed(0)})</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {revenueData.pagination.pages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <p className="text-sm text-slate-500">
                    Showing {currentPage * itemsPerPage + 1} to {Math.min((currentPage + 1) * itemsPerPage, revenueData.pagination.total)} of {revenueData.pagination.total} players
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(Math.max(0, currentPage - 1))}
                      disabled={currentPage === 0}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <span className="px-3 py-1 bg-slate-900 text-white rounded-lg text-sm">
                      {currentPage + 1} / {revenueData.pagination.pages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(Math.min(revenueData.pagination.pages - 1, currentPage + 1))}
                      disabled={currentPage === revenueData.pagination.pages - 1}
                      className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
