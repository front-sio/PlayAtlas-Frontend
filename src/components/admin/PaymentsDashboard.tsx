'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { paymentApi } from '@/lib/apiService';
import { notificationService } from '@/lib/notificationService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { ResponsiveTable, Column } from '@/components/admin/ResponsiveTable';
import { AlertCircle, CheckCircle, Clock, Filter, Search, XCircle } from 'lucide-react';

type PaymentStatus = string;

type PaymentTransaction = {
  id: string;
  type: 'deposit' | 'withdrawal' | 'prize' | 'entry_fee' | 'transaction_fee' | 'bonus' | 'refund' | string;
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
  description?: string;
  metadata?: any;
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
  const isPending = ['pending', 'pending_approval', 'pending_payment'].includes(normalized);
  
  // For deposits: need pending status AND transaction message from player
  if (tx.type === 'deposit') {
    return isPending && !!tx.transactionMessage;
  }
  
  // For withdrawals and other types: just need pending status
  return isPending;
};

const canReject = (tx: PaymentTransaction) => {
  const normalized = String(tx.status || '').toLowerCase();
  const isPending = ['pending', 'pending_approval', 'pending_payment'].includes(normalized);
  
  if (!isPending) return false;
  
  // For deposits: if has transaction message, can reject immediately
  // If no message, need to wait 24 hours from creation
  if (tx.type === 'deposit' && tx.createdAt) {
    // If has message from player, can reject immediately
    if (tx.transactionMessage) {
      return true;
    }
    
    // If no message, need to wait 24 hours from creation
    const createdTime = new Date(tx.createdAt).getTime();
    const currentTime = new Date().getTime();
    const hoursSinceCreated = (currentTime - createdTime) / (1000 * 60 * 60);
    return hoursSinceCreated >= 24;
  }
  
  // For other transaction types: can reject immediately
  return true;
};

const getRejectionCountdown = (tx: PaymentTransaction) => {
  if (tx.type !== 'deposit' || !tx.createdAt) return null;
  
  // If has transaction message, no countdown needed
  if (tx.transactionMessage) return null;
  
  const createdTime = new Date(tx.createdAt).getTime();
  const currentTime = new Date().getTime();
  const hoursSinceCreated = (currentTime - createdTime) / (1000 * 60 * 60);
  
  if (hoursSinceCreated >= 24) return null;
  
  const hoursRemaining = 24 - hoursSinceCreated;
  const hours = Math.floor(hoursRemaining);
  const minutes = Math.floor((hoursRemaining - hours) * 60);
  
  return { hours, minutes, total: hoursRemaining };
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
  const [tab, setTab] = useState<'all' | 'deposit' | 'withdrawal' | 'other'>('all');
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<PaymentTransaction | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedTxs, setSelectedTxs] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  
  // TID Search functionality
  const [tidSearch, setTidSearch] = useState('');
  const [tidSearchResults, setTidSearchResults] = useState<any[]>([]);
  const [tidSearchLoading, setTidSearchLoading] = useState(false);
  const [showTidSearch, setShowTidSearch] = useState(false);

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

  const fetchTransactions = async (type?: 'deposit' | 'withdrawal' | 'other') => {
    if (!token) return;
    setLoading(true);
    
    let apiType = type;
    // If 'other' is selected, don't pass type to get all transaction types
    if (type === 'other') {
      apiType = undefined;
    }
    
    const result = await paymentApi.getAdminTransactions(token, apiType, statusFilter === 'all' ? undefined : statusFilter, 100, 0);
    const payload = (result?.data as any) || {};
    let items = payload.transactions || payload.data?.transactions || payload || [];
    
    // Filter out deposits and withdrawals if 'other' tab is selected
    if (type === 'other') {
      items = items.filter((tx: PaymentTransaction) => 
        !['deposit', 'withdrawal'].includes(tx.type)
      );
    }
    
    setTransactions(Array.isArray(items) ? items : []);
    setLoading(false);
  };

  // TID search functions
  const searchByTid = async (tid: string) => {
    if (!token || !tid.trim()) return;
    
    setTidSearchLoading(true);
    setTidSearchResults([]);
    
    try {
      const result = await paymentApi.searchByTid(token, tid.trim());
      
      if (result?.success && result?.data) {
        setTidSearchResults(result.data);
      } else {
        setTidSearchResults([]);
        notificationService.showNotification({
          type: 'info',
          message: `No SMS messages found for TID: ${tid}`
        });
      }
    } catch (error) {
      console.error('TID search error:', error);
      notificationService.showNotification({
        type: 'error',
        message: 'Failed to search for TID'
      });
    } finally {
      setTidSearchLoading(false);
    }
  };

  const handleAttachToDeposit = async (messageId: string, depositId: string) => {
    if (!token) return;
    
    try {
      const result = await paymentApi.attachMessageToDeposit(token, depositId, { messageId });
      
      if (result?.success) {
        notificationService.showNotification({
          type: 'success',
          message: 'SMS message attached to deposit successfully'
        });
        
        // Refresh the search results and transactions
        if (tidSearch) {
          await searchByTid(tidSearch);
        }
        await fetchTransactions(tab === 'all' ? undefined : tab);
      }
    } catch (error) {
      console.error('Attach message error:', error);
      notificationService.showNotification({
        type: 'error',
        message: 'Failed to attach SMS message to deposit'
      });
    }
  };

  const handleApproveWithTid = async (depositId: string, tid?: string, transactionMessage?: string) => {
    if (!token) return;
    
    try {
      setProcessing(depositId);
      
      const result = await paymentApi.approveDepositWithTid(token, depositId, {
        tid,
        transactionMessage
      });
      
      if (result?.success) {
        notificationService.showNotification({
          type: 'success',
          message: 'Deposit approved with TID validation'
        });
        
        // Refresh everything
        await fetchTransactions(tab === 'all' ? undefined : tab);
        await fetchStats();
        if (tidSearch) {
          await searchByTid(tidSearch);
        }
        
        setDetailsOpen(false);
        setSelectedTx(null);
      }
    } catch (error) {
      console.error('Approve with TID error:', error);
      notificationService.showNotification({
        type: 'error',
        message: error instanceof Error ? error.message : 'Failed to approve deposit'
      });
    } finally {
      setProcessing(null);
    }
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

  const handleApprove = async (txId: string, txnMessage?: string) => {
    if (!token || !selectedTx) return;
    try {
      setProcessing(txId);
      
      if (selectedTx.type === 'deposit') {
        await paymentApi.approveDeposit(token, txId, txnMessage);
        
        // Send notification
        if (selectedTx.userId) {
          await notificationService.sendNotification({
            userId: selectedTx.userId,
            type: 'payment',
            title: 'Deposit Confirmed',
            message: txnMessage || `**${selectedTx.referenceNumber}** Confirmed. Your deposit of TZS${selectedTx.amount?.toLocaleString()}.00 has been approved and credited to your wallet.`,
            data: {
              depositId: txId,
              amount: selectedTx.amount,
              status: 'APPROVED',
              playSound: true
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
      } else if (selectedTx.type === 'withdrawal') {
        await paymentApi.approveWithdrawal(token, txId, txnMessage);
        
        // Send notification
        if (selectedTx.userId) {
          await notificationService.sendNotification({
            userId: selectedTx.userId,
            type: 'payment',
            title: 'Cashout Confirmed',
            message: txnMessage || `**${selectedTx.referenceNumber}** Confirmed. Your cashout of TZS${selectedTx.amount?.toLocaleString()}.00 has been approved and processed successfully.`,
            data: {
              withdrawalId: txId,
              amount: selectedTx.amount,
              status: 'APPROVED',
              playSound: true
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
      }
      
      await fetchStats();
      await fetchTransactions(tab === 'all' ? undefined : tab);
      setTransactionMessage(''); // Clear the message after approval
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve transaction');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (txId: string, rejectionMessage?: string) => {
    if (!token || !selectedTx) return;
    try {
      setProcessing(txId);
      
      if (selectedTx.type === 'deposit') {
        await paymentApi.rejectDeposit(token, txId, rejectionMessage || 'Rejected by admin');
        
        // Send notification
        if (selectedTx.userId) {
          await notificationService.sendNotification({
            userId: selectedTx.userId,
            type: 'payment',
            title: 'Deposit Rejected',
            message: rejectionMessage || `Your deposit request of Tsh ${selectedTx.amount?.toLocaleString()} has been rejected. Please contact support if you believe this is an error.`,
            data: {
              depositId: txId,
              amount: selectedTx.amount,
              status: 'REJECTED'
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
      } else if (selectedTx.type === 'withdrawal') {
        await paymentApi.rejectWithdrawal(token, txId, rejectionMessage || 'Rejected by admin');
        
        // Send notification  
        if (selectedTx.userId) {
          await notificationService.sendNotification({
            userId: selectedTx.userId,
            type: 'payment',
            title: 'Cashout Rejected',
            message: rejectionMessage || `Your cashout request of Tsh ${selectedTx.amount?.toLocaleString()} has been rejected. The amount has been returned to your wallet.`,
            data: {
              withdrawalId: txId,
              amount: selectedTx.amount,
              status: 'REJECTED'
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
      }
      
      await fetchStats();
      await fetchTransactions(tab === 'all' ? undefined : tab);
    } finally {
      setProcessing(null);
    }
  };

  // Bulk operations
  const toggleSelectTx = (txId: string) => {
    const newSelected = new Set(selectedTxs);
    if (newSelected.has(txId)) {
      newSelected.delete(txId);
    } else {
      newSelected.add(txId);
    }
    setSelectedTxs(newSelected);
  };

  const selectAllApprovable = () => {
    const approvableTxs = filtered.filter(tx => canApprove(tx));
    setSelectedTxs(new Set(approvableTxs.map(tx => tx.id)));
  };

  const handleBulkApprove = async () => {
    if (!token || selectedTxs.size === 0) return;
    
    setBulkProcessing(true);
    setError('');
    let successCount = 0;
    let errorCount = 0;

    for (const txId of selectedTxs) {
      try {
        const tx = transactions.find(t => t.id === txId);
        if (!tx || !canApprove(tx)) continue;

        if (tx.type === 'deposit') {
          await paymentApi.approveDeposit(token, txId, tx.transactionMessage);
        } else if (tx.type === 'withdrawal') {
          await paymentApi.approveWithdrawal(token, txId);
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to approve transaction ${txId}:`, err);
        errorCount++;
      }
    }

    setBulkProcessing(false);
    setSelectedTxs(new Set());
    
    if (errorCount > 0) {
      setError(`Bulk approval completed with errors: ${successCount} approved, ${errorCount} failed`);
    } else {
      setError('');
    }

    // Refresh data
    await fetchStats();
    await fetchTransactions(tab === 'all' ? undefined : tab);
  };

  const handleBulkReject = async () => {
    if (!token || selectedTxs.size === 0) return;
    
    setBulkProcessing(true);
    setError('');
    let successCount = 0;
    let errorCount = 0;

    for (const txId of selectedTxs) {
      try {
        const tx = transactions.find(t => t.id === txId);
        if (!tx || !canReject(tx)) continue;

        if (tx.type === 'deposit') {
          await paymentApi.rejectDeposit(token, txId, 'Bulk rejection by admin');
        } else if (tx.type === 'withdrawal') {
          await paymentApi.rejectWithdrawal(token, txId, 'Bulk rejection by admin');
        }
        successCount++;
      } catch (err) {
        console.error(`Failed to reject transaction ${txId}:`, err);
        errorCount++;
      }
    }

    setBulkProcessing(false);
    setSelectedTxs(new Set());
    
    if (errorCount > 0) {
      setError(`Bulk rejection completed with errors: ${successCount} rejected, ${errorCount} failed`);
    } else {
      setError('');
    }

    // Refresh data
    await fetchStats();
    await fetchTransactions(tab === 'all' ? undefined : tab);
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

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="flex w-full flex-col gap-3 sm:gap-2 md:w-auto md:flex-row md:items-center">
            <Button
              variant="outline"
              onClick={() => setShowTidSearch(!showTidSearch)}
              className="w-full sm:w-auto"
            >
              <Search className="w-4 h-4 mr-2" />
              {showTidSearch ? 'Hide TID Search' : 'Search by TID'}
            </Button>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1 sm:w-48 md:w-64">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by user, ref, phone"
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <select
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="flex-1 sm:flex-none rounded border border-input bg-background px-3 py-2 text-sm min-w-0"
                >
                  {['all', 'pending_approval', 'pending', 'pending_payment', 'completed', 'approved', 'failed', 'rejected', 'cancelled'].map((status) => (
                    <option key={status} value={status}>
                      {statusLabel(status)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* TID Search Panel */}
          {showTidSearch && (
            <Card className="mb-6 border-l-4 border-l-blue-500">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-blue-700">Search by Transaction ID (TID)</CardTitle>
                <p className="text-sm text-slate-600">
                  Search for SMS transaction messages using TID (e.g., MP260119.1639.R71104)
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    value={tidSearch}
                    onChange={(e) => setTidSearch(e.target.value.toUpperCase())}
                    placeholder="Enter TID (e.g., MP260119.1639.R71104)"
                    className="flex-1"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        searchByTid(tidSearch);
                      }
                    }}
                  />
                  <Button 
                    onClick={() => searchByTid(tidSearch)}
                    disabled={tidSearchLoading || !tidSearch.trim()}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {tidSearchLoading ? 'Searching...' : 'Search'}
                  </Button>
                </div>

                {/* TID Search Results */}
                {tidSearchResults.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="font-medium text-slate-900">Search Results</h4>
                    {tidSearchResults.map((message, index) => (
                      <div key={message.messageId || index} className="border rounded-lg p-4 bg-slate-50">
                        <div className="grid gap-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-medium text-slate-900">
                                TID: {message.tid}
                              </div>
                              <div className="text-sm text-slate-600">
                                Provider: {message.provider} | Status: {message.status}
                              </div>
                            </div>
                            <Badge variant={
                              message.status === 'APPROVED' ? 'success' :
                              message.status === 'LINKED' ? 'warning' :
                              message.status === 'DUPLICATE' ? 'destructive' : 'secondary'
                            }>
                              {message.status}
                            </Badge>
                          </div>
                          
                          {message.amount && (
                            <div className="text-sm">
                              <span className="font-medium">Amount: TSH {parseFloat(message.amount).toLocaleString()}</span>
                              {message.fee && <span className="text-slate-500"> (Fee: TSH {parseFloat(message.fee).toLocaleString()})</span>}
                            </div>
                          )}
                          
                          <div className="text-xs text-slate-600 bg-white p-2 rounded border">
                            <strong>SMS Text:</strong>
                            <div className="mt-1 whitespace-pre-wrap">{message.rawText}</div>
                          </div>
                          
                          {message.linkedDeposit && (
                            <div className="bg-green-50 border border-green-200 p-2 rounded text-sm">
                              <strong className="text-green-800">Linked to Deposit:</strong>
                              <div className="text-green-700">
                                ID: {message.linkedDeposit.depositId} | 
                                Amount: TSH {parseFloat(message.linkedDeposit.amount).toLocaleString()} | 
                                Status: {message.linkedDeposit.status}
                              </div>
                              {message.linkedDeposit.status === 'pending' && (
                                <Button
                                  size="sm"
                                  className="mt-2"
                                  onClick={() => handleApproveWithTid(
                                    message.linkedDeposit.depositId, 
                                    message.tid,
                                    'Deposit approved via TID search'
                                  )}
                                  disabled={processing === message.linkedDeposit.depositId}
                                >
                                  {processing === message.linkedDeposit.depositId ? 'Approving...' : 'Approve Deposit'}
                                </Button>
                              )}
                            </div>
                          )}
                          
                          {!message.linkedDeposit && message.status === 'NEW' && (
                            <div className="bg-yellow-50 border border-yellow-200 p-2 rounded text-sm">
                              <div className="text-yellow-800">This SMS is not linked to any deposit request.</div>
                              <div className="text-yellow-700 mt-1">
                                To link it, find the corresponding deposit in the transactions below and use "Attach Message".
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {tidSearchLoading && (
                  <div className="text-center py-4">
                    <div className="inline-flex items-center gap-2 text-slate-600">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      Searching for TID...
                    </div>
                  </div>
                )}

                {!tidSearchLoading && tidSearch && tidSearchResults.length === 0 && (
                  <div className="text-center py-4 text-slate-500">
                    No SMS messages found for TID: {tidSearch}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Tabs value={tab} onValueChange={(value) => setTab(value as any)}>
            <TabsList className="mb-4 w-full justify-start gap-2 overflow-x-auto rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm snap-x snap-mandatory no-scrollbar">
              <TabsTrigger value="all" className="min-w-[120px] flex-shrink-0 snap-start text-xs sm:text-sm">All Transactions</TabsTrigger>
              <TabsTrigger value="deposit" className="min-w-[120px] flex-shrink-0 snap-start text-xs sm:text-sm">Deposits</TabsTrigger>
              <TabsTrigger value="withdrawal" className="min-w-[120px] flex-shrink-0 snap-start text-xs sm:text-sm">Cashouts</TabsTrigger>
              <TabsTrigger value="other" className="min-w-[180px] flex-shrink-0 snap-start whitespace-nowrap text-xs sm:text-sm">Other (Prizes, Fees, etc.)</TabsTrigger>
            </TabsList>

            <TabsContent value={tab}>
              {loading ? (
                <p className="text-sm text-slate-500">Loading transactions...</p>
              ) : (
                <ResponsiveTable
                  data={filtered}
                  keyExtractor={(tx) => `${tx.type}:${tx.id}`}
                  onRowClick={(tx) => {
                    setSelectedTx(tx);
                    setDetailsOpen(true);
                  }}
                  emptyMessage="No transactions found."
                  columns={[
                    {
                      key: 'type',
                      label: 'Type',
                      mobilePriority: 'high',
                      render: (type) => (
                        <Badge className={
                          type === 'deposit' ? 'bg-emerald-100 text-emerald-700' : 
                          type === 'withdrawal' ? 'bg-indigo-100 text-indigo-700' :
                          type === 'prize' ? 'bg-yellow-100 text-yellow-700' :
                          type === 'entry_fee' ? 'bg-purple-100 text-purple-700' :
                          type === 'transaction_fee' ? 'bg-gray-100 text-gray-700' :
                          type === 'bonus' ? 'bg-green-100 text-green-700' :
                          type === 'refund' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-700'
                        }>
                          {type === 'withdrawal' ? 'Cashout' : 
                           type === 'deposit' ? 'Deposit' :
                           type === 'entry_fee' ? 'Entry Fee' :
                           type === 'transaction_fee' ? 'Transaction Fee' :
                           type?.charAt(0).toUpperCase() + type?.slice(1).replace('_', ' ') || 'Unknown'}
                        </Badge>
                      )
                    },
                    {
                      key: 'referenceNumber',
                      label: 'Reference',
                      mobilePriority: 'medium',
                      render: (ref) => ref || '—'
                    },
                    {
                      key: 'description',
                      label: 'Description',
                      mobilePriority: 'low',
                      className: 'text-xs text-slate-600',
                      render: (description, tx) => (
                        <div className="max-w-xs">
                          <div className="truncate">
                            {description || 
                             (tx.type === 'prize' ? 'Tournament/Game Prize' : 
                              tx.type === 'entry_fee' ? 'Tournament Entry Fee' :
                              tx.type === 'transaction_fee' ? 'System Transaction Fee' :
                              tx.type === 'bonus' ? 'User Bonus' :
                              tx.type === 'refund' ? 'Payment Refund' : 
                              tx.provider || '—')}
                          </div>
                          {/* Show message status for mobile debugging */}
                          <div className="text-xs text-blue-600 md:hidden">
                            MSG: {tx.transactionMessage ? '✓' : '✗'} 
                            {(tx as any).message ? ' | ALT: ✓' : ''}
                            {(tx as any).confirmationMessage ? ' | CONF: ✓' : ''}
                          </div>
                        </div>
                      )
                    },
                    {
                      key: 'userId',
                      label: 'User',
                      mobilePriority: 'low',
                      render: (userId) => userId || '—'
                    },
                    {
                      key: 'amount',
                      label: 'Amount',
                      mobilePriority: 'high',
                      className: 'font-semibold text-slate-900',
                      render: (amount) => `TSH ${Number(amount || 0).toLocaleString()}`
                    },
                    {
                      key: 'fee',
                      label: 'Fee',
                      mobilePriority: 'medium',
                      className: 'text-sm text-slate-600',
                      render: (fee) => `TSH ${Number(fee || 0).toLocaleString()}`
                    },
                    {
                      key: 'status',
                      label: 'Status',
                      mobilePriority: 'high',
                      render: (status) => statusBadge(status)
                    },
                    {
                      key: 'createdAt',
                      label: 'Created',
                      mobilePriority: 'medium',
                      className: 'text-sm text-slate-600',
                      render: (createdAt) => createdAt ? new Date(createdAt).toLocaleDateString() : '—'
                    },
                    {
                      key: 'id',
                      label: 'Action',
                      mobilePriority: 'high',
                      render: (id, tx) => (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTx(tx);
                            setDetailsOpen(true);
                          }}
                        >
                          View
                        </Button>
                      )
                    }
                  ] as Column<PaymentTransaction>[]}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
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

      {/* Transaction Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
          <DialogHeader>
            <DialogTitle>Transaction Details</DialogTitle>
            <DialogDescription>Review the full transaction information before approval.</DialogDescription>
          </DialogHeader>
          {selectedTx && (
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge className={
                  selectedTx.type === 'deposit' ? 'bg-emerald-100 text-emerald-700' : 
                  selectedTx.type === 'withdrawal' ? 'bg-indigo-100 text-indigo-700' :
                  selectedTx.type === 'prize' ? 'bg-yellow-100 text-yellow-700' :
                  selectedTx.type === 'entry_fee' ? 'bg-purple-100 text-purple-700' :
                  selectedTx.type === 'transaction_fee' ? 'bg-gray-100 text-gray-700' :
                  selectedTx.type === 'bonus' ? 'bg-green-100 text-green-700' :
                  selectedTx.type === 'refund' ? 'bg-blue-100 text-blue-700' :
                  'bg-slate-100 text-slate-700'
                }>
                  {selectedTx.type === 'withdrawal' ? 'Cashout' : 
                   selectedTx.type === 'deposit' ? 'Deposit' :
                   selectedTx.type === 'entry_fee' ? 'Entry Fee' :
                   selectedTx.type === 'transaction_fee' ? 'Transaction Fee' :
                   selectedTx.type?.charAt(0).toUpperCase() + selectedTx.type?.slice(1).replace('_', ' ') || 'Unknown'}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span>{selectedTx.referenceNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize">{statusLabel(selectedTx.status)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>TSH {Number(selectedTx.amount).toLocaleString()}</span>
              </div>
              {selectedTx.fee !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span>TSH {Number(selectedTx.fee || 0).toLocaleString()}</span>
                </div>
              )}
              {(selectedTx.totalAmount !== undefined || selectedTx.totalDeducted !== undefined) && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span>TSH {Number(selectedTx.totalAmount || selectedTx.totalDeducted || 0).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span>{selectedTx.provider || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{selectedTx.phoneNumber || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">User ID</span>
                <span>{selectedTx.userId || '—'}</span>
              </div>
              {selectedTx.description && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Description</span>
                  <span>{selectedTx.description}</span>
                </div>
              )}
              {selectedTx.externalReference && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider Ref</span>
                  <span>{selectedTx.externalReference}</span>
                </div>
              )}
              {/* Debug info - will be removed after testing */}
              <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
                <strong>Debug:</strong> transactionMessage = {JSON.stringify(selectedTx.transactionMessage)}
                <br />
                <strong>All fields:</strong> {JSON.stringify(Object.keys(selectedTx).filter(k => k.includes('message') || k.includes('confirmation') || k.includes('Message')))}
              </div>
              
              {selectedTx.transactionMessage && (
                <div>
                  <span className="text-muted-foreground">
                    {selectedTx.type === 'deposit' ? 'Player Confirmation Message' : 'Transaction Message'}
                  </span>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                    {selectedTx.transactionMessage}
                  </pre>
                </div>
              )}
              
              {/* Check if message exists under different field names */}
              {(selectedTx as any).message && (
                <div>
                  <span className="text-muted-foreground">Message (alt field)</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                    {(selectedTx as any).message}
                  </pre>
                </div>
              )}
              
              {(selectedTx as any).confirmationMessage && (
                <div>
                  <span className="text-muted-foreground">Confirmation Message</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                    {(selectedTx as any).confirmationMessage}
                  </pre>
                </div>
              )}
              
              {selectedTx.failureReason && (
                <div>
                  <span className="text-muted-foreground">Failure Reason</span>
                  <p className="mt-1 text-sm">{selectedTx.failureReason}</p>
                </div>
              )}
              {selectedTx.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(selectedTx.createdAt).toLocaleString()}</span>
                </div>
              )}
              {selectedTx.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span>{new Date(selectedTx.completedAt).toLocaleString()}</span>
                </div>
              )}
              {selectedTx.metadata && (
                <div className="grid gap-2">
                  <div>
                    <span className="text-muted-foreground">Metadata</span>
                    <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                      {JSON.stringify(selectedTx.metadata, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
              
              {/* No player message warning for deposits */}
              {selectedTx && selectedTx.type === 'deposit' && !selectedTx.transactionMessage && 
               ['pending', 'pending_approval', 'pending_payment'].includes(String(selectedTx.status || '').toLowerCase()) && (
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-amber-800">Waiting for Player Confirmation</p>
                      <p className="text-amber-600">
                        This deposit cannot be approved until the player provides their payment confirmation message in their dashboard.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Transaction Message Input for Cashouts/Other (Admin side) */}
              {selectedTx && selectedTx.type !== 'deposit' && canApprove(selectedTx) && (
                <div className="pt-4 border-t border-border">
                  <label htmlFor="transaction-message" className="text-sm font-medium text-muted-foreground mb-2 block">
                    Transaction Message from Provider (Optional)
                  </label>
                  <textarea
                    id="transaction-message"
                    value={transactionMessage}
                    onChange={(e) => setTransactionMessage(e.target.value)}
                    placeholder="Enter the transaction confirmation message from M-PESA or payment provider..."
                    className="w-full px-3 py-2 border border-border rounded-md bg-background text-sm resize-none"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    If provided, this message will be sent to the user instead of the default notification.
                  </p>
                </div>
              )}
              
              {/* Action Buttons */}
              {selectedTx && ['pending', 'pending_approval', 'pending_payment'].includes(String(selectedTx.status || '').toLowerCase()) && (
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  {/* Approve Button */}
                  {canApprove(selectedTx) && (
                    <Button
                      onClick={async () => {
                        const message = selectedTx.type === 'deposit' 
                          ? selectedTx.transactionMessage // Use player's confirmation message for deposits
                          : (transactionMessage.trim() || undefined); // Use admin's message for cashouts
                        try {
                          await handleApprove(selectedTx.id, message);
                          setDetailsOpen(false);
                        } catch (error) {
                          console.error('Error approving transaction:', error);
                        }
                      }}
                      disabled={processing === selectedTx.id}
                      className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="w-4 h-4 mr-2" />
                      {processing === selectedTx.id ? 'Approving...' : `Approve ${selectedTx.type === 'withdrawal' ? 'Cashout' : selectedTx.type === 'deposit' ? 'Deposit' : 'Transaction'}`}
                    </Button>
                  )}
                  
                  {/* Reject Button with Countdown */}
                  {canReject(selectedTx) ? (
                    <Button
                      onClick={async () => {
                        const rejectionMessage = selectedTx.type === 'deposit' 
                          ? undefined // For deposits, use default rejection message
                          : (transactionMessage.trim() || undefined); // For cashouts, use admin's message if provided
                        try {
                          await handleReject(selectedTx.id, rejectionMessage);
                          setDetailsOpen(false);
                        } catch (error) {
                          console.error('Error rejecting transaction:', error);
                        }
                      }}
                      disabled={processing === selectedTx.id}
                      variant="destructive"
                      className="flex-1"
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      {processing === selectedTx.id ? 'Rejecting...' : `Reject ${selectedTx.type === 'withdrawal' ? 'Cashout' : selectedTx.type === 'deposit' ? 'Deposit' : 'Transaction'}`}
                    </Button>
                  ) : (
                    (() => {
                      const countdown = getRejectionCountdown(selectedTx);
                      return countdown ? (
                        <Button
                          disabled
                          variant="destructive"
                          className="flex-1 opacity-50 cursor-not-allowed"
                        >
                          <Clock className="w-4 h-4 mr-2" />
                          Wait {countdown.hours}h {countdown.minutes}m to Reject
                        </Button>
                      ) : (
                        <Button
                          disabled
                          variant="destructive" 
                          className="flex-1 opacity-50 cursor-not-allowed"
                        >
                          <XCircle className="w-4 h-4 mr-2" />
                          Cannot Reject
                        </Button>
                      );
                    })()
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
