'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { paymentApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { AlertCircle, CheckCircle, Clock, Filter, Search, XCircle } from 'lucide-react';

type PaymentStatus = string;

type PaymentTransaction = {
  id: string;
  type: 'deposit' | 'withdrawal' | string;
  referenceNumber?: string;
  amount?: number;
  fee?: number;
  totalAmount?: number;
  totalDeducted?: number;
  provider?: string;
  phoneNumber?: string;
  status?: PaymentStatus;
  createdAt?: string;
  completedAt?: string;
  updatedAt?: string;
  userId?: string;
  transactionMessage?: string;
  externalReference?: string;
  failureReason?: string;
};

type PaymentStats = {
  pendingDeposits: number;
  pendingCashouts: number;
  transactionFees: number;
  depositFeeTotal: number;
  withdrawalFeeTotal: number;
  totalDeposits: number;
  totalCashouts: number;
  completedDeposits: number;
  completedCashouts: number;
  failedDeposits: number;
  failedCashouts: number;
  completedDepositAmount: number;
  completedCashoutAmount: number;
  todayDepositAmount: number;
  todayCashoutAmount: number;
};

const isFinanceOfficer = (role?: string) =>
  [
    'admin',
    'super_admin',
    'superuser',
    'superadmin',
    'finance_officer',
    'finance_manager',
    'manager',
    'director',
    'staff'
  ].includes((role || '').toLowerCase());

const statusLabel = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'approved'].includes(normalized)) return 'Successful';
  if (['pending_approval'].includes(normalized)) return 'Waiting Approval';
  if (['pending_payment'].includes(normalized)) return 'Waiting Confirmation';
  if (['pending', 'processing'].includes(normalized)) return 'Processing';
  if (['rejected', 'cancelled', 'failed'].includes(normalized)) return 'Failed';
  return normalized
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ') || 'Unknown';
};

const statusBadge = (status?: string) => {
  const normalized = String(status || '').toLowerCase();
  if (['completed', 'approved'].includes(normalized)) {
    return <Badge className="bg-emerald-100 text-emerald-700">Successful</Badge>;
  }
  if (['pending_approval'].includes(normalized)) {
    return <Badge className="bg-amber-100 text-amber-700">Waiting Approval</Badge>;
  }
  if (['pending_payment'].includes(normalized)) {
    return <Badge className="bg-sky-100 text-sky-700">Waiting Confirmation</Badge>;
  }
  if (['pending', 'processing'].includes(normalized)) {
    return <Badge className="bg-slate-100 text-slate-700">Processing</Badge>;
  }
  return <Badge className="bg-rose-100 text-rose-700">Failed</Badge>;
};

const canApprove = (tx: PaymentTransaction) => {
  const normalized = String(tx.status || '').toLowerCase();
  if (tx.type === 'deposit') return normalized === 'pending_approval';
  if (tx.type === 'withdrawal') return ['pending', 'pending_approval'].includes(normalized);
  return false;
};

export function PaymentsDashboard({ title, subtitle }: { title: string; subtitle?: string }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const token = (session as any)?.accessToken;
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [filtered, setFiltered] = useState<PaymentTransaction[]>([]);
  const [stats, setStats] = useState<PaymentStats>({
    pendingDeposits: 0,
    pendingCashouts: 0,
    transactionFees: 0,
    depositFeeTotal: 0,
    withdrawalFeeTotal: 0,
    totalDeposits: 0,
    totalCashouts: 0,
    completedDeposits: 0,
    completedCashouts: 0,
    failedDeposits: 0,
    failedCashouts: 0,
    completedDepositAmount: 0,
    completedCashoutAmount: 0,
    todayDepositAmount: 0,
    todayCashoutAmount: 0
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tab, setTab] = useState<'all' | 'deposit' | 'withdrawal'>('all');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const canView = isFinanceOfficer(role);

  const fetchStats = async () => {
    if (!token) return;
    const result = await paymentApi.getAdminPaymentStats(token);
    const payload = (result?.data as any) || {};
    setStats({
      pendingDeposits: Number(payload.pendingDeposits || 0),
      pendingCashouts: Number(payload.pendingCashouts || 0),
      transactionFees: Number(payload.transactionFees || 0),
      depositFeeTotal: Number(payload.depositFeeTotal || 0),
      withdrawalFeeTotal: Number(payload.withdrawalFeeTotal || 0),
      totalDeposits: Number(payload.totalDeposits || 0),
      totalCashouts: Number(payload.totalCashouts || 0),
      completedDeposits: Number(payload.completedDeposits || 0),
      completedCashouts: Number(payload.completedCashouts || 0),
      failedDeposits: Number(payload.failedDeposits || 0),
      failedCashouts: Number(payload.failedCashouts || 0),
      completedDepositAmount: Number(payload.completedDepositAmount || 0),
      completedCashoutAmount: Number(payload.completedCashoutAmount || 0),
      todayDepositAmount: Number(payload.todayDepositAmount || 0),
      todayCashoutAmount: Number(payload.todayCashoutAmount || 0)
    });
  };

  const fetchTransactions = async (type?: 'deposit' | 'withdrawal') => {
    if (!token) return;
    setLoading(true);
    const result = await paymentApi.getAdminTransactions(token, type, statusFilter === 'all' ? undefined : statusFilter, 100, 0);
    const payload = (result?.data as any) || {};
    const items = payload.transactions || payload.data?.transactions || payload || [];
    setTransactions(Array.isArray(items) ? items : []);
    setLoading(false);
  };

  useEffect(() => {
    if (!canView) return;
    setError('');
    fetchStats().catch((err) => {
      console.error('Failed to fetch payment stats:', err);
    });
    fetchTransactions(tab === 'all' ? undefined : tab).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load transactions');
      setLoading(false);
    });
  }, [token, tab, statusFilter, canView]);

  useEffect(() => {
    let current = transactions;
    if (statusFilter !== 'all') {
      current = current.filter((tx) => String(tx.status || '').toLowerCase() === statusFilter);
    }
    if (search.trim()) {
      const term = search.toLowerCase();
      current = current.filter((tx) =>
        `${tx.referenceNumber || ''} ${tx.userId || ''} ${tx.phoneNumber || ''} ${tx.provider || ''}`
          .toLowerCase()
          .includes(term)
      );
    }
    setFiltered(current);
  }, [transactions, search, statusFilter]);

  const handleApprove = async (tx: PaymentTransaction) => {
    if (!token || !tx.id) return;
    try {
      setProcessingId(tx.id);
      if (tx.type === 'deposit') {
        await paymentApi.approveDeposit(token, tx.id);
      } else if (tx.type === 'withdrawal') {
        await paymentApi.approveWithdrawal(token, tx.id);
      }
      await fetchStats();
      await fetchTransactions(tab === 'all' ? undefined : tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve transaction');
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (tx: PaymentTransaction) => {
    if (!token || !tx.id) return;
    try {
      setProcessingId(tx.id);
      if (tx.type === 'deposit') {
        await paymentApi.rejectDeposit(token, tx.id, 'Rejected by admin');
      } else if (tx.type === 'withdrawal') {
        await paymentApi.rejectWithdrawal(token, tx.id, 'Rejected by admin');
      }
      await fetchStats();
      await fetchTransactions(tab === 'all' ? undefined : tab);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject transaction');
    } finally {
      setProcessingId(null);
    }
  };

  if (!canView) {
    return <AccessDenied message="You do not have permission to view payments." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Today Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">TSH {stats.todayDepositAmount.toLocaleString()}</div>
            <p className="mt-1 text-xs text-slate-500">Completed today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Today Cashouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">TSH {stats.todayCashoutAmount.toLocaleString()}</div>
            <p className="mt-1 text-xs text-slate-500">Completed today</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Pending Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-semibold text-slate-900">{stats.pendingDeposits + stats.pendingCashouts}</span>
              <span className="text-xs text-slate-500">total</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Deposits {stats.pendingDeposits} • Cashouts {stats.pendingCashouts}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Fees Collected</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">TSH {stats.transactionFees.toLocaleString()}</div>
            <p className="mt-1 text-xs text-slate-500">Deposits + Cashouts</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle>Transactions</CardTitle>
            <p className="text-xs text-slate-500">Manage deposits and cashouts in one view.</p>
          </div>
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
            <div className="relative w-full md:w-64">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by user, ref, phone"
                className="pl-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded border border-input bg-background px-3 py-2 text-sm"
              >
                {['all', 'pending_approval', 'pending', 'pending_payment', 'completed', 'approved', 'failed', 'rejected', 'cancelled'].map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <Tabs value={tab} onValueChange={(value) => setTab(value as any)}>
            <TabsList className="mb-4">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="deposit">Deposits</TabsTrigger>
              <TabsTrigger value="withdrawal">Cashouts</TabsTrigger>
            </TabsList>

            <TabsContent value={tab}>
              {loading ? (
                <p className="text-sm text-slate-500">Loading transactions...</p>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-slate-500">No transactions found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="border-b text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Type</th>
                        <th className="px-3 py-2">Reference</th>
                        <th className="px-3 py-2">User</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Fee</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Created</th>
                        <th className="px-3 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((tx) => (
                        <tr key={`${tx.type}:${tx.id}`} className="border-b last:border-0">
                          <td className="px-3 py-3">
                            <Badge className={tx.type === 'deposit' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}>
                              {tx.type === 'withdrawal' ? 'Cashout' : 'Deposit'}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">{tx.referenceNumber || '—'}</td>
                          <td className="px-3 py-3">{tx.userId || '—'}</td>
                          <td className="px-3 py-3">TSH {Number(tx.amount || 0).toLocaleString()}</td>
                          <td className="px-3 py-3">TSH {Number(tx.fee || 0).toLocaleString()}</td>
                          <td className="px-3 py-3">{statusBadge(tx.status)}</td>
                          <td className="px-3 py-3">
                            {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : '—'}
                          </td>
                          <td className="px-3 py-3">
                            {canApprove(tx) ? (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  onClick={() => handleApprove(tx)}
                                  disabled={processingId === tx.id}
                                  className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                  {processingId === tx.id ? <Clock className="h-3 w-3" /> : <CheckCircle className="h-3 w-3" />}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleReject(tx)}
                                  disabled={processingId === tx.id}
                                  className="border-red-200 text-red-600 hover:bg-red-50"
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Completed Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{stats.completedDeposits}</div>
            <p className="mt-1 text-xs text-slate-500">TSH {stats.completedDepositAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Completed Cashouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-slate-900">{stats.completedCashouts}</div>
            <p className="mt-1 text-xs text-slate-500">TSH {stats.completedCashoutAmount.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Failed Deposits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              {stats.failedDeposits}
            </div>
            <p className="mt-1 text-xs text-slate-500">Total attempts: {stats.totalDeposits}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Failed Cashouts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
              <AlertCircle className="h-4 w-4 text-rose-500" />
              {stats.failedCashouts}
            </div>
            <p className="mt-1 text-xs text-slate-500">Total attempts: {stats.totalCashouts}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
