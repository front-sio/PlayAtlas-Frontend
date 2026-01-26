'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canViewFinancialReports } from '@/lib/permissions';
import { getApiBaseUrl } from '@/lib/apiBase';
import {
  Users,
  TrendingUp,
  DollarSign,
  Download,
  Filter,
  Loader2,
  Search
} from 'lucide-react';
import Link from 'next/link';

interface AgentRevenueData {
  totalRevenue: number;
  totalCommission: number;
  totalPlayersRegistered: number;
  totalActivePlayers: number;
  topAgents: Array<{
    agentId: string;
    userId: string;
    agentName: string;
    totalRevenue: number;
    totalCommission: number;
    playerCount: number;
  }>;
  data: Array<{
    id: string;
    agentId: string;
    userId: string;
    agentName: string;
    date: string;
    period: string;
    commissionEarned: number;
    playersRegistered: number;
    activePlayers: number;
    totalDeposits: number;
    totalWithdrawals: number;
    playerRevenue: number;
    currency: string;
  }>;
}

export default function AgentRevenuePage() {
  const { data: session, status } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  const apiBase = getApiBaseUrl();
  
  const [revenueData, setRevenueData] = useState<AgentRevenueData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);

  useEffect(() => {
    if (!token || (role && !canViewFinancialReports(role))) return;

    const loadAgentRevenue = async () => {
      setLoading(true);
      setError('');

      try {
        // Default to last month
        const end = new Date();
        const start = new Date();
        start.setMonth(start.getMonth() - 1);

        const url = new URL(`${apiBase}/revenue/agent`);
        url.searchParams.append('startDate', start.toISOString());
        url.searchParams.append('endDate', end.toISOString());
        
        const response = await fetch(url.toString(), {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });

        if (!response.ok) {
          throw new Error('Failed to load agent revenue data');
        }

        const data = await response.json();
        
        if (data.success) {
          setRevenueData(data.data);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load agent revenue data');
      } finally {
        setLoading(false);
      }
    };

    loadAgentRevenue();
  }, [token, role]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-TZ', {
      style: 'currency',
      currency: 'TZS',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredAgents = revenueData?.topAgents.filter(agent =>
    !searchTerm || agent.agentName?.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const activeAgent = activeAgentId
    ? revenueData?.topAgents.find((agent) => agent.agentId === activeAgentId) || null
    : null;

  const activeAgentHistory = activeAgentId
    ? (revenueData?.data || [])
        .filter((row) => row.agentId === activeAgentId)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    : [];

  const handleExport = () => {
    if (!revenueData) return;

    const csv = [
      ['Agent Name', 'Agent ID', 'Total Revenue', 'Commission Earned', 'Players Registered'].join(','),
      ...revenueData.topAgents.map(agent => [
        agent.agentName || 'Unknown',
        agent.agentId,
        agent.totalRevenue.toFixed(2),
        agent.totalCommission.toFixed(2),
        agent.playerCount.toString()
      ].join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-revenue-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (status === 'authenticated' && role && !canViewFinancialReports(role)) {
    return <AccessDenied message="You do not have permission to view agent revenue." />;
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
            <h1 className="text-2xl font-bold text-slate-900">Agent Revenue</h1>
            <p className="mt-1 text-sm text-slate-500">Track agent performance and commissions</p>
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
          <div className="grid gap-4 md:grid-cols-4">
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
                <p className="mt-2 text-xs text-slate-500">From agent players</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Total Commission</CardTitle>
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {formatCurrency(revenueData.totalCommission)}
                </div>
                <p className="mt-2 text-xs text-slate-500">Paid to agents</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Players Registered</CardTitle>
                  <Users className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {revenueData.totalPlayersRegistered}
                </div>
                <p className="mt-2 text-xs text-slate-500">Total players</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium text-slate-500">Active Players</CardTitle>
                  <Users className="h-4 w-4 text-slate-400" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-slate-900">
                  {revenueData.totalActivePlayers}
                </div>
                <p className="mt-2 text-xs text-slate-500">Currently active</p>
              </CardContent>
            </Card>
          </div>

          {/* Search and Filter */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">Search:</span>
                </div>
                <input
                  type="text"
                  placeholder="Search by agent name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="flex-1 min-w-[200px] px-4 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </CardContent>
          </Card>

          {/* Agent Performance Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-slate-900">Agent Performance</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="text-left py-3 px-4 text-sm font-medium text-slate-500">Agent</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Players</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Total Revenue</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Commission</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Commission %</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAgents.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                          {searchTerm ? 'No agents found matching your search' : 'No agent data available'}
                        </td>
                      </tr>
                    ) : (
                      filteredAgents.map((agent, index) => (
                        <tr key={agent.agentId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-purple-100 text-purple-600 text-sm font-semibold">
                                {index + 1}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{agent.agentName}</p>
                                <p className="text-xs text-slate-500">{agent.agentId.slice(0, 8)}</p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900">
                            {agent.playerCount}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900 font-semibold">
                            {formatCurrency(agent.totalRevenue)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900">
                            {formatCurrency(agent.totalCommission)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right text-slate-900">
                            {((agent.totalCommission / agent.totalRevenue) * 100 || 0).toFixed(1)}%
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            <button
                              onClick={() => setActiveAgentId(agent.agentId)}
                              className="text-sm font-medium text-slate-700 hover:text-slate-900"
                            >
                              View
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {activeAgent && (
            <Card>
              <CardHeader>
                <CardTitle className="text-slate-900">
                  {activeAgent.agentName || 'Agent'} Progression
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-slate-500">Monthly Revenue</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {formatCurrency(activeAgent.totalRevenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Players Registered</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {activeAgent.playerCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Commission Earned</p>
                    <p className="text-lg font-semibold text-slate-900">
                      {formatCurrency(activeAgent.totalCommission)}
                    </p>
                  </div>
                </div>

                <div className="mt-6">
                  <p className="text-sm font-medium text-slate-700">Daily Progression</p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-200">
                          <th className="text-left py-2 px-3 text-xs font-medium text-slate-500">Date</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">Revenue</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">Commission</th>
                          <th className="text-right py-2 px-3 text-xs font-medium text-slate-500">Players</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAgentHistory.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-4 text-center text-sm text-slate-500">
                              No progression data available
                            </td>
                          </tr>
                        ) : (
                          activeAgentHistory.map((row) => (
                            <tr key={row.id} className="border-b border-slate-100">
                              <td className="py-2 px-3 text-sm text-slate-700">
                                {new Date(row.date).toLocaleDateString('en-TZ', { month: 'short', day: 'numeric' })}
                              </td>
                              <td className="py-2 px-3 text-sm text-right text-slate-900">
                                {formatCurrency(row.playerRevenue)}
                              </td>
                              <td className="py-2 px-3 text-sm text-right text-slate-900">
                                {formatCurrency(row.commissionEarned)}
                              </td>
                              <td className="py-2 px-3 text-sm text-right text-slate-900">
                                {row.playersRegistered}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
