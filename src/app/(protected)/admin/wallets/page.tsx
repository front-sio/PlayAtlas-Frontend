'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { walletApi, paymentApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Wallet, Plus, Minus, Search, ToggleLeft, ToggleRight, CheckCircle, XCircle, Clock, AlertCircle, RefreshCw } from 'lucide-react';

interface Wallet {
  walletId: string;
  ownerId: string;
  type: string;
  balance: number;
  currency: string;
  isActive: boolean;
  totalWins: number;
  totalLosses: number;
  createdAt: string;
  updatedAt: string;
}

interface FloatAdjustmentRequest {
  requestId: string;
  walletId: string;
  requestedBy: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approvals: Array<{
    approvalId: string;
    approvedBy: string;
    approverRole: string;
    comments?: string;
    approvedAt: string;
  }>;
  rejectionReason?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

interface WithdrawalRequest {
  withdrawalId: string;
  userId: string;
  walletId: string;
  amount: number;
  fee: number;
  totalDeducted: number;
  provider: string;
  phoneNumber: string;
  referenceNumber: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requiresApproval: boolean;
  createdAt: string;
  updatedAt: string;
}

const WalletsPage: React.FC = () => {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const role = (session?.user as any)?.role;

  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [floatRequests, setFloatRequests] = useState<FloatAdjustmentRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Float adjustment modal state
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [showFloatModal, setShowFloatModal] = useState(false);
  const [floatType, setFloatType] = useState<'credit' | 'debit'>('credit');
  const [floatAmount, setFloatAmount] = useState('');
  const [floatReason, setFloatReason] = useState('');
  const [floatSubmitting, setFloatSubmitting] = useState(false);

  // Approval modal state
  const [selectedRequest, setSelectedRequest] = useState<FloatAdjustmentRequest | null>(null);
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  // Withdrawal approval state
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [showWithdrawalApprovalModal, setShowWithdrawalApprovalModal] = useState(false);
  const [withdrawalRejectReason, setWithdrawalRejectReason] = useState('');
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);

  useEffect(() => {
    loadWallets();
    loadFloatRequests();
    loadPendingWithdrawals();
  }, [token]);

  const loadWallets = async () => {
    if (!token) return;
    try {
      setLoading(true);
      const result = await walletApi.listWallets(token);
      if (result.success && result.data) {
        setWallets(result.data);
      }
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to load wallets');
    } finally {
      setLoading(false);
    }
  };

  const loadFloatRequests = async () => {
    if (!token) return;
    try {
      const result = await paymentApi.getFloatAdjustmentRequests(token, 'PENDING');
      if (result.success && result.data) {
        setFloatRequests(result.data.requests || []);
      }
    } catch (err: any) {
      console.error('Failed to load float requests:', err);
    }
  };

  const handleRequestFloatAdjustment = async () => {
    if (!token || !selectedWallet || !floatAmount || !floatReason) return;

    setFloatSubmitting(true);
    try {
      const result = await paymentApi.requestFloatAdjustment(token, {
        walletId: selectedWallet.walletId,
        type: floatType,
        amount: Number(floatAmount),
        reason: floatReason
      });

      if (result.success) {
        alert(result.message || 'Float adjustment request submitted successfully!');
        setShowFloatModal(false);
        setFloatAmount('');
        setFloatReason('');
        loadFloatRequests();
      } else {
        alert(result.message || 'Failed to submit request');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit request');
    } finally {
      setFloatSubmitting(false);
    }
  };

  const handleApproveFloatAdjustment = async (requestId: string, comments?: string) => {
    if (!token) return;

    try {
      const result = await paymentApi.approveFloatAdjustment(token, requestId, comments);
      if (result.success) {
        alert(result.message || 'Approval recorded successfully!');
        loadFloatRequests();
        loadWallets(); // Refresh to see updated balance if approved
      } else {
        alert(result.message || 'Failed to approve');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to approve');
    }
  };

  const handleRejectFloatAdjustment = async () => {
    if (!token || !selectedRequest || !rejectReason) return;

    try {
      const result = await paymentApi.rejectFloatAdjustment(token, selectedRequest.requestId, rejectReason);
      if (result.success) {
        alert(result.message || 'Request rejected successfully!');
        setShowApprovalModal(false);
        setRejectReason('');
        loadFloatRequests();
      } else {
        alert(result.message || 'Failed to reject');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reject');
    }
  };

  const loadPendingWithdrawals = async () => {
    if (!token) return;
    try {
      const result = await paymentApi.getAdminTransactions(token, 'withdrawal', 'pending');
      if (result.success && result.data) {
        setPendingWithdrawals(result.data.transactions || []);
      }
    } catch (err: any) {
      console.error('Failed to load pending withdrawals:', err);
    }
  };

  const handleApproveWithdrawal = async (withdrawalId: string) => {
    if (!token) return;

    try {
      const result = await paymentApi.approveWithdrawal(token, withdrawalId);
      if (result.success) {
        alert('Withdrawal approved successfully!');
        setShowWithdrawalApprovalModal(false);
        setWithdrawalRejectReason('');
        loadPendingWithdrawals();
        loadWallets(); // Refresh to see updated balance
      } else {
        alert(result.message || 'Failed to approve withdrawal');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to approve withdrawal');
    }
  };

  const handleRejectWithdrawal = async () => {
    if (!token || !selectedWithdrawal || !withdrawalRejectReason) return;

    try {
      const result = await paymentApi.rejectWithdrawal(token, selectedWithdrawal.withdrawalId, withdrawalRejectReason);
      if (result.success) {
        alert('Withdrawal rejected successfully!');
        setShowWithdrawalApprovalModal(false);
        setWithdrawalRejectReason('');
        loadPendingWithdrawals();
        loadWallets(); // Refresh to see updated balance
      } else {
        alert(result.message || 'Failed to reject withdrawal');
      }
    } catch (err: any) {
      alert(err.message || 'Failed to reject withdrawal');
    }
  };

  const filteredWallets = useMemo(() => {
    if (!search.trim()) return wallets;
    const term = search.toLowerCase();
    return wallets.filter((wallet) =>
      `${wallet.walletId} ${wallet.ownerId} ${wallet.type}`.toLowerCase().includes(term)
    );
  }, [wallets, search]);

  const canViewWallets = (role: string) => {
    return ['admin', 'super_admin', 'superuser', 'superadmin', 'finance_manager', 'manager', 'director'].includes(role);
  };

  const canApproveFloat = (role: string) => {
    return ['director', 'manager'].includes(role);
  };

  const canApproveWithdrawals = (role: string) => {
    return ['admin', 'super_admin', 'superuser', 'superadmin', 'finance_manager', 'manager', 'director'].includes(role);
  };

  if (status === 'authenticated' && role && !canViewWallets(role)) {
    return <AccessDenied message="You do not have permission to manage wallets." />;
  }

  return (
    <div className="space-y-6">
      {/* Pending Withdrawals */}
      {pendingWithdrawals.length > 0 && canApproveWithdrawals(role) && (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900 flex items-center">
              <Wallet className="w-5 h-5 mr-2" />
              Pending Cashout Requests
            </CardTitle>
            <CardDescription className="text-slate-500">
              Withdrawals requiring admin approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingWithdrawals.map((withdrawal) => {
                const wallet = wallets.find((w) => w.walletId === withdrawal.walletId);
                return (
                  <div key={withdrawal.withdrawalId} className="flex items-center justify-between p-4 rounded-lg border border-slate-200 bg-slate-50">
                    <div className="flex items-center space-x-4">
                      <Badge className={`${
                        withdrawal.requiresApproval 
                          ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                          : 'bg-green-50 text-green-700 border-green-200'
                      }`}>
                        {withdrawal.requiresApproval ? 'Pending Approval' : 'Processing'}
                      </Badge>
                      <div>
                        <p className="text-slate-900 font-medium">
                          Tsh {Number(withdrawal.amount).toLocaleString()} (fee: Tsh {Number(withdrawal.fee).toLocaleString()})
                        </p>
                        <p className="text-sm text-slate-500">
                          Wallet: {wallet?.ownerId || withdrawal.userId} • {wallet?.type || 'Unknown'}
                        </p>
                        <p className="text-xs text-slate-400">
                          To: {withdrawal.phoneNumber} ({withdrawal.provider})
                        </p>
                        <p className="text-xs text-slate-400">
                          Ref: {withdrawal.referenceNumber} • {new Date(withdrawal.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        size="sm"
                        onClick={() => handleApproveWithdrawal(withdrawal.withdrawalId)}
                        className="bg-green-600 hover:bg-green-700"
                        disabled={withdrawalLoading}
                      >
                        {withdrawalLoading ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                            Processing...
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-4 h-4 mr-1" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        size="sm"
                        
                        onClick={() => {
                          setSelectedWithdrawal(withdrawal);
                          setShowWithdrawalApprovalModal(true);
                        }}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pending Float Adjustment Requests */}
      {floatRequests.length > 0 && canApproveFloat(role) && (
        <Card className="border-slate-200 bg-white">
          <CardHeader>
            <CardTitle className="text-slate-900 flex items-center">
              <Clock className="w-5 h-5 mr-2" />
              Pending Float Adjustments
            </CardTitle>
            <CardDescription className="text-slate-500">
              Requests requiring approval from Director and Manager
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {floatRequests.map((request) => {
                const wallet = wallets.find((w) => w.walletId === request.walletId);
                return (
                  <div key={request.requestId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-center space-x-4">
                      <Badge className={`${
                        request.type === 'credit' 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }`}>
                        {request.type.toUpperCase()}
                      </Badge>
                      <div>
                        <p className="text-slate-900 font-medium">
                          Tsh {Number(request.amount).toLocaleString()}
                        </p>
                        <p className="text-sm text-slate-500">
                          Wallet: {wallet?.ownerId || request.walletId} • {wallet?.type || 'Unknown'}
                        </p>
                        <p className="text-xs text-slate-400">{request.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge className="bg-amber-50 text-amber-700 border-amber-200">
                        {request.approvals.length}/2 Approvals
                      </Badge>
                      <Button
                        size="sm"
                        onClick={() => handleApproveFloatAdjustment(request.requestId)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle className="w-4 h-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        
                        onClick={() => {
                          setSelectedRequest(request);
                          setShowApprovalModal(true);
                        }}
                        className="border-red-200 text-red-600 hover:bg-red-50"
                      >
                        <XCircle className="w-4 h-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wallets List */}
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-slate-900">Wallets</CardTitle>
              <CardDescription className="text-slate-500">
                Manage user and agent wallet balances
              </CardDescription>
            </div>
            <div className="flex items-center space-x-2 w-full md:w-auto">
              <Input
                type="text"
                placeholder="Search wallets..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="w-full md:max-w-xs border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading wallets...</p>
          ) : filteredWallets.length === 0 ? (
            <p className="text-sm text-muted-foreground">No wallets found.</p>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="md:hidden space-y-4">
                {filteredWallets.map((wallet) => (
                  <Card key={wallet.walletId} className="border border-slate-200 bg-slate-50">
                    <CardContent className="p-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-slate-500 mb-1">Wallet ID</p>
                            <p className="text-sm font-mono text-slate-900 break-all">{wallet.walletId}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                              wallet.isActive 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {wallet.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        
                        <div>
                          <p className="text-xs text-slate-500 mb-1">Owner ID</p>
                          <p className="text-sm text-slate-900">{wallet.ownerId}</p>
                        </div>
                        
                        <div className="flex justify-between">
                          <div>
                            <p className="text-xs text-slate-500 mb-1">Type</p>
                            <p className="text-sm text-slate-900">{wallet.type}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-slate-500 mb-1">Balance</p>
                            <p className="text-sm font-bold text-emerald-600">
                              Tsh {Number(wallet.balance).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        
                        <div className="pt-2">
                          <Dialog open={showFloatModal && selectedWallet?.walletId === wallet.walletId} onOpenChange={(open) => {
                            setShowFloatModal(open);
                            if (!open) setSelectedWallet(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                
                                onClick={() => setSelectedWallet(wallet)}
                                className="w-full border-slate-200 text-slate-700 hover:bg-slate-100"
                              >
                                Adjust Balance
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="border-slate-200 bg-white text-slate-900">
                              <DialogHeader>
                                <DialogTitle>Request Float Adjustment</DialogTitle>
                                <DialogDescription className="text-slate-500">
                                  Submit a request to adjust wallet balance. Requires approval from Director and Manager.
                                </DialogDescription>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="flex items-center justify-between space-x-4">
                                  <Label>Adjustment Type</Label>
                                  <div className="flex space-x-2">
                                    <Button
                                      type="button"
                                      variant={floatType === 'credit' ? 'default' : 'outline'}
                                      onClick={() => setFloatType('credit')}
                                      className={floatType === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'border-slate-200 text-slate-700'}
                                    >
                                      <Plus className="w-4 h-4 mr-2" />
                                      Credit
                                    </Button>
                                    <Button
                                      type="button"
                                      variant={floatType === 'debit' ? 'default' : 'outline'}
                                      onClick={() => setFloatType('debit')}
                                      className={floatType === 'debit' ? 'bg-red-600 hover:bg-red-700' : 'border-slate-200 text-slate-700'}
                                    >
                                      <Minus className="w-4 h-4 mr-2" />
                                      Debit
                                    </Button>
                                  </div>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="amount">Amount</Label>
                                  <Input
                                    id="amount"
                                    type="number"
                                    placeholder="Enter amount"
                                    value={floatAmount}
                                    onChange={(e) => setFloatAmount(e.target.value)}
                                    className="border-slate-200 bg-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="reason">Reason</Label>
                                  <Textarea
                                    id="reason"
                                    placeholder="Explain the reason for this adjustment"
                                    value={floatReason}
                                    onChange={(e) => setFloatReason(e.target.value)}
                                    className="border-slate-200 bg-white"
                                  />
                                </div>
                              </div>
                              <DialogFooter>
                                <Button
                                  
                                  onClick={() => setShowFloatModal(false)}
                                  className="border-slate-200 text-slate-700"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  onClick={handleRequestFloatAdjustment}
                                  disabled={floatSubmitting || !floatAmount || !floatReason}
                                  className="bg-purple-600 hover:bg-purple-700"
                                >
                                  {floatSubmitting ? (
                                    <>
                                      <Clock className="w-4 h-4 mr-2 animate-spin" />
                                      Submitting...
                                    </>
                                  ) : (
                                    <>
                                      <Plus className="w-4 h-4 mr-2" />
                                      Submit Request
                                    </>
                                  )}
                                </Button>
                              </DialogFooter>
                            </DialogContent>
                          </Dialog>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left px-3 py-3 text-slate-600 font-semibold">Wallet ID</th>
                      <th className="text-left px-3 py-3 text-slate-600 font-semibold">Owner ID</th>
                      <th className="text-left px-3 py-3 text-slate-600 font-semibold">Type</th>
                      <th className="text-left px-3 py-3 text-slate-600 font-semibold">Balance</th>
                      <th className="text-left px-3 py-3 text-slate-600 font-semibold">Status</th>
                      <th className="text-left px-3 py-3 text-slate-600 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWallets.map((wallet) => (
                      <tr key={wallet.walletId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="px-3 py-3 text-slate-900 font-mono text-sm">{wallet.walletId}</td>
                        <td className="px-3 py-3 text-slate-900">{wallet.ownerId}</td>
                        <td className="px-3 py-3 text-slate-900">{wallet.type}</td>
                        <td className="px-3 py-3 text-emerald-600 font-bold">
                          Tsh {Number(wallet.balance).toLocaleString()}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={`rounded-full px-3 py-1 text-xs font-semibold ${
                              wallet.isActive 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {wallet.isActive ? 'Active' : 'Disabled'}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Dialog open={showFloatModal && selectedWallet?.walletId === wallet.walletId} onOpenChange={(open) => {
                            setShowFloatModal(open);
                            if (!open) setSelectedWallet(null);
                          }}>
                            <DialogTrigger asChild>
                              <Button
                                size="sm"
                                
                                onClick={() => setSelectedWallet(wallet)}
                                className="border-slate-200 text-slate-700 hover:bg-slate-100"
                              >
                                Adjust
                              </Button>
                            </DialogTrigger>
                          </Dialog>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal Rejection Dialog */}
      <Dialog open={showWithdrawalApprovalModal} onOpenChange={setShowWithdrawalApprovalModal}>
        <DialogContent className="border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Reject Cashout Request</DialogTitle>
            <DialogDescription className="text-slate-500">
              Please provide a reason for rejecting this cashout request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="withdrawal-reject-reason">Rejection Reason</Label>
              <Textarea
                id="withdrawal-reject-reason"
                placeholder="Explain why this cashout is being rejected"
                value={withdrawalRejectReason}
                onChange={(e) => setWithdrawalRejectReason(e.target.value)}
                className="border-slate-200 bg-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              
              onClick={() => {
                setShowWithdrawalApprovalModal(false);
                setWithdrawalRejectReason('');
              }}
              className="border-slate-200 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectWithdrawal}
              disabled={!withdrawalRejectReason}
              className="bg-red-600 hover:bg-red-700"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject Cashout
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rejection Dialog */}
      <Dialog open={showApprovalModal} onOpenChange={setShowApprovalModal}>
        <DialogContent className="border-slate-200 bg-white text-slate-900">
          <DialogHeader>
            <DialogTitle>Reject Float Adjustment</DialogTitle>
            <DialogDescription className="text-slate-500">
              Please provide a reason for rejecting this adjustment request.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Rejection Reason</Label>
              <Textarea
                id="reject-reason"
                placeholder="Explain why this request is being rejected"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="border-slate-200 bg-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              
              onClick={() => {
                setShowApprovalModal(false);
                setRejectReason('');
              }}
              className="border-slate-200 text-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleRejectFloatAdjustment}
              disabled={!rejectReason}
              className="bg-red-600 hover:bg-red-700"
            >
              <XCircle className="w-4 h-4 mr-2" />
              Reject Request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Card className="max-w-md border-slate-200 bg-white shadow-sm">
        <CardContent className="pt-6 text-center">
          <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-900 mb-2">Access Denied</h3>
          <p className="text-slate-600">{message}</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default WalletsPage;
