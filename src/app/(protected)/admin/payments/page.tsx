'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { adminApi } from '@/lib/apiService';
import {
  DollarSign,
  Users,
  Calculator,
  Send,
  Calendar,
  Filter,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  TrendingUp
} from 'lucide-react';

interface Club {
  clubId: string;
  name: string;
}

interface Revenue {
  summary: {
    totalPlatformFees: number;
    totalEntryFees: number;
    totalAgentPool: number;
  };
  dailyRevenue: Array<{
    date: string;
    totalPlatformFees: number;
    agentPoolAmount: number;
  }>;
}

interface Earnings {
  summary: {
    totalEarnings: number;
    totalAgents: number;
    totalBasePay: number;
    totalRevenueShare: number;
    totalBonuses: number;
    totalMatches: number;
    totalAverageUptime: number;
  };
  agentSummaries: Array<{
    agentId: string;
    totalEarnings: number;
    totalMatches: number;
    averageUptime: number;
    daysWorked: number;
    pendingAmount: number;
    paidAmount: number;
  }>;
}

interface Payouts {
  summary: {
    totals: {
      amount: number;
      successful: number;
      failed: number;
      pending: number;
    };
    byMethod: Record<string, { count: number; amount: number }>;
  };
  payouts: Array<{
    transactionId: string;
    agentId: string;
    amount: number;
    method: string;
    status: string;
    createdAt: string;
    processedAt?: string;
  }>;
}

export default function AdminPaymentsPage() {
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken;
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedClub, setSelectedClub] = useState(searchParams.get('clubId') || '');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
    end: new Date()
  });

  // Data states
  const [clubs, setClubs] = useState<Club[]>([]);
  const [revenue, setRevenue] = useState<Revenue | null>(null);
  const [earnings, setEarnings] = useState<Earnings | null>(null);
  const [payouts, setPayouts] = useState<Payouts | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    const loadClubs = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await adminApi.getClubs(token);
        if (result.success && result.data) {
          const payload = (result.data as any)?.data || result.data;
          setClubs((payload || []) as Club[]);
          if (!selectedClub && payload?.length) {
            setSelectedClub(payload[0].clubId);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load clubs');
      } finally {
        setLoading(false);
      }
    };
    loadClubs();
  }, [token, selectedClub]);

  const fetchAllData = async () => {
    if (!selectedClub || !token) return;

    setLoading(true);
    setError(null);

    try {
      const startDate = dateRange.start.toISOString();
      const endDate = dateRange.end.toISOString();

      const [revenueRes, earningsRes, payoutsRes] = await Promise.all([
        adminApi.getClubRevenue(token, selectedClub, startDate, endDate),
        adminApi.getClubEarnings(token, selectedClub, startDate, endDate),
        adminApi.getClubPayouts(token, selectedClub, startDate, endDate)
      ]);

      if (revenueRes?.success) {
        setRevenue(revenueRes.data?.data || revenueRes.data);
      }

      if (earningsRes?.success) {
        setEarnings(earningsRes.data?.data || earningsRes.data);
      }

      if (payoutsRes?.success) {
        const payload = payoutsRes.data?.data || payoutsRes.data;
        const byStatus = payload?.summary?.byStatus || {};
        const totals = payload?.summary?.totals || {};
        setPayouts({
          summary: {
            totals: {
              amount: totals.amount || 0,
              successful: byStatus.SUCCESS?.count || 0,
              failed: byStatus.FAILED?.count || 0,
              pending: (byStatus.INITIATED?.count || 0) + (byStatus.PENDING?.count || 0)
            },
            byMethod: payload?.summary?.byMethod || {}
          },
          payouts: payload?.payouts || []
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  const handleComputeEarnings = async (date) => {
    if (!token || !selectedClub) return;
    await adminApi.computeClubEarnings(token, selectedClub, date);
    await fetchAllData();
  };

  const handleFinalizeEarnings = async (date) => {
    if (!token || !selectedClub) return;
    await adminApi.finalizeClubEarnings(token, selectedClub, date);
    await fetchAllData();
  };

  useEffect(() => {
    if (!token || !selectedClub) return;
    fetchAllData();
  }, [token, selectedClub, dateRange.start, dateRange.end]);

  const selectedClubName = clubs.find(c => c.clubId === selectedClub)?.name || 'Select Club';

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 mb-1">
                Agent Payments
              </h1>
              <p className="text-slate-600">
                Manage agent earnings, payouts, and compensation
              </p>
            </div>

            {/* Club Selector */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Select value={selectedClub} onValueChange={setSelectedClub}>
                <SelectTrigger className="w-full sm:w-56 bg-white border-slate-300 text-slate-900">
                  <SelectValue placeholder="Select Club" />
                </SelectTrigger>
                <SelectContent>
                  {clubs.map(club => (
                    <SelectItem key={club.clubId} value={club.clubId}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={fetchAllData}
                disabled={loading || !selectedClub}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {error && (
          <Card className="mb-6 border-red-200 bg-red-50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>{error}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!selectedClub ? (
          <Card className="bg-white border-slate-200 shadow-sm">
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-slate-400" />
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Select a Club</h3>
              <p className="text-slate-600">Choose a club to view payment data and manage agent earnings.</p>
            </CardContent>
          </Card>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex w-full flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm snap-x snap-mandatory no-scrollbar">
              <TabsTrigger
                value="overview"
                className="min-w-[120px] shrink-0 snap-start text-xs text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:text-sm"
              >
                <DollarSign className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="earnings"
                className="min-w-[120px] shrink-0 snap-start text-xs text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:text-sm"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Earnings
              </TabsTrigger>
              <TabsTrigger
                value="payouts"
                className="min-w-[120px] shrink-0 snap-start text-xs text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:text-sm"
              >
                <Send className="h-4 w-4 mr-2" />
                Payouts
              </TabsTrigger>
              <TabsTrigger
                value="settings"
                className="min-w-[120px] shrink-0 snap-start text-xs text-slate-600 data-[state=active]:bg-slate-900 data-[state=active]:text-white sm:text-sm"
              >
                <Users className="h-4 w-4 mr-2" />
                Settings
              </TabsTrigger>
            </TabsList>

            <div className="mt-6">
              <TabsContent value="overview" className="space-y-6">
                <OverviewTab
                  revenue={revenue}
                  earnings={earnings}
                  payouts={payouts}
                  loading={loading}
                  clubName={selectedClubName}
                />
              </TabsContent>

              <TabsContent value="earnings" className="space-y-6">
                <EarningsTab
                  earnings={earnings}
                  loading={loading}
                  onComputeEarnings={handleComputeEarnings}
                  onFinalizeEarnings={handleFinalizeEarnings}
                />
              </TabsContent>

              <TabsContent value="payouts" className="space-y-6">
                <PayoutsTab
                  payouts={payouts}
                  loading={loading}
                  onRefresh={fetchAllData}
                />
              </TabsContent>

              <TabsContent value="settings" className="space-y-6">
                <SettingsTab
                  clubId={selectedClub}
                  onConfigUpdate={fetchAllData}
                />
              </TabsContent>
            </div>
          </Tabs>
        )}
      </div>
    </div>
  );
}

// Individual tab components
function OverviewTab({ revenue, earnings, payouts, loading, clubName }) {
  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map(i => (
          <Card key={i} className="bg-white border-slate-200 shadow-sm animate-pulse">
            <CardContent className="p-6">
              <div className="h-20 bg-slate-100 rounded"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const revenueStats = revenue?.summary || {};
  const earningsStats = earnings?.summary || {};
  const payoutStats = payouts?.summary || {};

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Revenue"
          value={`${revenueStats.totalPlatformFees?.toLocaleString() || 0} TSH`}
          change="+12.5%"
          icon={<DollarSign className="h-5 w-5" />}
          trend="up"
        />
        <MetricCard
          title="Agent Earnings"
          value={`${earningsStats.totalEarnings?.toLocaleString() || 0} TSH`}
          change="+8.3%"
          icon={<Users className="h-5 w-5" />}
          trend="up"
        />
        <MetricCard
          title="Payouts Made"
          value={`${payoutStats.totals?.amount?.toLocaleString() || 0} TSH`}
          change="+15.2%"
          icon={<Send className="h-5 w-5" />}
          trend="up"
        />
        <MetricCard
          title="Active Agents"
          value={earnings?.agentSummaries?.length || 0}
          change="0%"
          icon={<Users className="h-5 w-5" />}
          trend="stable"
        />
      </div>

      {/* Agent Earnings Table */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900 flex items-center gap-2">
            <Users className="h-5 w-5" />
            Top Performing Agents
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {earnings?.agentSummaries?.map((agent, index) => (
              <div key={agent.agentId} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 bg-emerald-600 rounded-full flex items-center justify-center text-sm font-bold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Agent {agent.agentId.slice(-4)}</p>
                    <p className="text-sm text-slate-600">{agent.totalMatches} matches • {agent.averageUptime}% uptime</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{agent.totalEarnings.toLocaleString()} TSH</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-emerald-50">
                      {agent.paidAmount.toLocaleString()} paid
                    </Badge>
                    {agent.pendingAmount > 0 && (
                      <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50">
                        {agent.pendingAmount.toLocaleString()} pending
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button className="bg-slate-900 hover:bg-slate-800">
              <Calculator className="h-4 w-4 mr-2" />
              Compute Today's Earnings
            </Button>
            <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100">
              <Send className="h-4 w-4 mr-2" />
              Process Payouts
            </Button>
            <Button variant="outline" className="border-slate-300 text-slate-700 hover:bg-slate-100">
              <Download className="h-4 w-4 mr-2" />
              Export Report
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ title, value, change, icon, trend }) {
  const trendColor = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-600' : 'text-slate-500';

  return (
    <Card className="bg-white border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-600">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className={`text-sm ${trendColor}`}>{change}</p>
          </div>
          <div className="text-slate-400">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EarningsTab({ earnings, loading, onComputeEarnings, onFinalizeEarnings }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  return (
    <div className="space-y-6">
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-slate-900">Agent Earnings Management</CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-white border-slate-300 text-slate-900"
              />
              <Button onClick={() => onComputeEarnings(selectedDate)} className="bg-slate-900 hover:bg-slate-800">
                <Calculator className="h-4 w-4 mr-2" />
                Compute
              </Button>
              <Button onClick={() => onFinalizeEarnings(selectedDate)} className="bg-emerald-600 hover:bg-emerald-700">
                <CheckCircle className="h-4 w-4 mr-2" />
                Finalize
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">Detailed earnings management interface will be implemented here.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function PayoutsTab({ payouts, loading, onRefresh }) {
  return (
    <div className="space-y-6">
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900">Payout Transactions</CardTitle>
            <Button onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {payouts?.payouts?.map((payout) => (
              <div key={payout.transactionId} className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium text-slate-900">Agent {payout.agentId.slice(-4)}</p>
                  <p className="text-sm text-slate-600">{new Date(payout.createdAt).toLocaleDateString()}</p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-900">{payout.amount.toLocaleString()} TSH</p>
                  <div className="flex items-center gap-2">
                    <Badge className={`${payout.status === 'SUCCESS' ? 'bg-emerald-600 text-white' :
                      payout.status === 'PENDING' ? 'bg-amber-500 text-white' :
                        'bg-red-600 text-white'
                      }`}>
                      {payout.status}
                    </Badge>
                    <span className="text-sm text-slate-600">{payout.method}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ clubId, onConfigUpdate }) {
  return (
    <div className="space-y-6">
      <Card className="bg-white border-slate-200 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900">Payout Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-slate-600">Payout settings configuration will be implemented here.</p>
        </CardContent>
      </Card>
    </div>
  );
}
