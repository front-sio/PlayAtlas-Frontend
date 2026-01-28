'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { paymentApi } from '@/lib/apiService';
import { notificationService } from '@/lib/notificationService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { ResponsiveTable } from '@/components/admin/ResponsiveTable';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface Withdrawal {
  id?: string;
  withdrawalId: string;
  referenceNumber: string;
  amount: number;
  fee?: number;
  totalDeducted?: number;
  provider?: string;
  phoneNumber?: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
  userId?: string;
  externalReference?: string;
  failureReason?: string;
  metadata?: any;
}

const isAdminRole = (role?: string) =>
  [
    'admin',
    'staff',
    'manager',
    'director',
    'super_admin',
    'superuser',
    'superadmin',
    'moderator',
    'finance_manager',
    'tournament_manager',
    'game_manager',
    'game_master',
    'support'
  ].includes((role || '').toLowerCase());

export default function AdminCashoutsPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedWithdrawal, setSelectedWithdrawal] = useState<Withdrawal | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [transactionMessage, setTransactionMessage] = useState('');

  const canViewSensitive = ['admin', 'super_admin', 'superuser', 'superadmin'].includes((role || '').toLowerCase());

  useEffect(() => {
    if (!token || !isAdminRole(role)) return;
    loadWithdrawals();
  }, [token, role]);

  const loadWithdrawals = async () => {
    try {
      setLoading(true);
      const result = await paymentApi.getAdminTransactions(token, 'withdrawal');
      if (result.success && result.data) {
        const data = result.data as any;
        const items = data.transactions || data.data?.transactions || data || [];
        const mapped = Array.isArray(items)
          ? items.map((tx: any) => ({
              withdrawalId: tx.referenceId || tx.withdrawalId || tx.id || tx.transactionId,
              referenceNumber: tx.referenceNumber,
              amount: tx.amount,
              fee: tx.fee,
              totalDeducted: tx.totalAmount,
              provider: tx.provider,
              phoneNumber: tx.phoneNumber || tx.metadata?.phoneNumber,
              status: tx.status,
              createdAt: tx.createdAt,
              updatedAt: tx.updatedAt,
              userId: tx.userId,
              externalReference: tx.externalReference,
              failureReason: tx.failureReason,
              metadata: tx.metadata
            }))
          : [];
        setWithdrawals(mapped);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  };

  const filteredWithdrawals = useMemo(() => {
    if (!search.trim()) return withdrawals;
    const term = search.toLowerCase();
    return withdrawals.filter((withdrawal) =>
      `${withdrawal.referenceNumber} ${withdrawal.provider || ''} ${withdrawal.phoneNumber || ''} ${withdrawal.userId || ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [withdrawals, search]);

  const displayStatus = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (['approved', 'completed'].includes(normalized)) return 'Successful';
    if (['pending'].includes(normalized)) return 'Processing';
    if (['cancelled', 'canceled'].includes(normalized)) return 'Cancelled';
    if (['rejected', 'failed'].includes(normalized)) return 'Failed';
    // Convert underscores to spaces and capitalize each word
    return normalized.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ') || 'Unknown';
  };

  const handleApprove = async (withdrawalId: string, txnMessage?: string) => {
    if (!token) return;
    try {
      setProcessing(withdrawalId);
      const result = await paymentApi.approveWithdrawal(token, withdrawalId, txnMessage);
      if (result.success) {
        // Find the withdrawal to get user info
        const withdrawal = withdrawals.find(w => w.withdrawalId === withdrawalId);
        
        // Send approval notification to user
        if (withdrawal?.userId) {
          await notificationService.sendNotification({
            userId: withdrawal.userId,
            type: 'payment',
            title: 'Cashout Confirmed',
            message: txnMessage || `**${withdrawal.referenceNumber}** Confirmed. Your cashout of TZS${withdrawal.amount?.toLocaleString()}.00 has been approved and processed successfully.`,
            data: {
              withdrawalId: withdrawalId,
              amount: withdrawal.amount,
              status: 'APPROVED',
              playSound: true
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
        
        await loadWithdrawals();
        setTransactionMessage(''); // Clear the message after approval
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve withdrawal');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (withdrawalId: string) => {
    if (!token) return;
    try {
      setProcessing(withdrawalId);
      const result = await paymentApi.rejectWithdrawal(token, withdrawalId, 'Rejected by admin');
      if (result.success) {
        // Find the withdrawal to get user info
        const withdrawal = withdrawals.find(w => w.withdrawalId === withdrawalId);
        
        // Send rejection notification to user
        if (withdrawal?.userId) {
          await notificationService.sendNotification({
            userId: withdrawal.userId,
            type: 'payment',
            title: 'Cashout Rejected',
            message: `Your cashout request of Tsh ${withdrawal.amount?.toLocaleString()} has been rejected. The amount has been returned to your wallet.`,
            data: {
              withdrawalId: withdrawalId,
              amount: withdrawal.amount,
              status: 'REJECTED'
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
        
        await loadWithdrawals();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject withdrawal');
    } finally {
      setProcessing(null);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'referenceNumber' as keyof Withdrawal,
      label: 'Reference',
      mobilePriority: 'high' as const,
    },
    {
      key: 'provider' as keyof Withdrawal,
      label: 'Provider',
      mobilePriority: 'medium' as const,
    },
    {
      key: 'amount' as keyof Withdrawal,
      label: 'Amount',
      mobilePriority: 'high' as const,
      render: (value) => `TSH ${Number(value).toLocaleString()}`,
    },
    {
      key: 'phoneNumber' as keyof Withdrawal,
      label: 'Phone',
      mobilePriority: 'low' as const,
    },
    {
      key: 'status' as keyof Withdrawal,
      label: 'Status',
      mobilePriority: 'high' as const,
      render: (value) => {
        const status = String(value).toLowerCase();
        const isPending = ['pending'].includes(status);
        
        return (
          <div className="flex items-center gap-2">
            {isPending && <AlertCircle className="h-4 w-4 text-amber-500" />}
            <span className={isPending ? 'text-amber-600 font-medium' : ''}>
              {displayStatus(String(value))}
            </span>
          </div>
        );
      },
    },
    {
      key: 'actions' as keyof Withdrawal,
      label: 'Action',
      mobilePriority: 'high' as const,
      render: (value, item) => (
        <Button
          size="sm"
          onClick={() => {
            setSelectedWithdrawal(item);
            setDetailsOpen(true);
          }}
        >
          View
        </Button>
      ),
    },
  ], []);

  if (status === 'authenticated' && role && !isAdminRole(role)) {
    return <AccessDenied message="You do not have permission to view cashouts." />;
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Cashouts</CardTitle>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search withdrawals..."
            className="md:max-w-xs"
          />
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading withdrawals...</p>
          ) : (
            <ResponsiveTable
              data={filteredWithdrawals}
              columns={columns}
              keyExtractor={(item) => item.withdrawalId}
              emptyMessage="No cashouts found."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Cashout Details</DialogTitle>
            <DialogDescription>Review the full cashout information before approval.</DialogDescription>
          </DialogHeader>
          {selectedWithdrawal && (
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span>{selectedWithdrawal.referenceNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize">{displayStatus(selectedWithdrawal.status)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>TSH {Number(selectedWithdrawal.amount).toLocaleString()}</span>
              </div>
              {selectedWithdrawal.fee !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span>TSH {Number(selectedWithdrawal.fee || 0).toLocaleString()}</span>
                </div>
              )}
              {selectedWithdrawal.totalDeducted !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total Deducted</span>
                  <span>TSH {Number(selectedWithdrawal.totalDeducted || 0).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span>{selectedWithdrawal.provider || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{selectedWithdrawal.phoneNumber || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">User ID</span>
                <span>{selectedWithdrawal.userId || '—'}</span>
              </div>
              {selectedWithdrawal.externalReference && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider Ref</span>
                  <span>{selectedWithdrawal.externalReference}</span>
                </div>
              )}
              {selectedWithdrawal.failureReason && (
                <div>
                  <span className="text-muted-foreground">Failure Reason</span>
                  <p className="mt-1 text-sm">{selectedWithdrawal.failureReason}</p>
                </div>
              )}
              {selectedWithdrawal.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(selectedWithdrawal.createdAt).toLocaleString()}</span>
                </div>
              )}
              {selectedWithdrawal.updatedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Updated</span>
                  <span>{new Date(selectedWithdrawal.updatedAt).toLocaleString()}</span>
                </div>
              )}
              {canViewSensitive && selectedWithdrawal.metadata && (
                <div>
                  <span className="text-muted-foreground">Metadata</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                    {JSON.stringify(selectedWithdrawal.metadata, null, 2)}
                  </pre>
                </div>
              )}
              
              {/* Transaction Message Input for Approval */}
              {selectedWithdrawal && ['pending', 'pending_approval'].includes(selectedWithdrawal.status?.toLowerCase()) && (
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
                    If provided, this message will be sent to the player instead of the default notification.
                  </p>
                </div>
              )}
              
              {/* Action Buttons */}
              {selectedWithdrawal && ['pending', 'pending_approval'].includes(selectedWithdrawal.status?.toLowerCase()) && (
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    onClick={async () => {
                      await handleApprove(selectedWithdrawal.withdrawalId, transactionMessage.trim() || undefined);
                      setDetailsOpen(false);
                    }}
                    disabled={processing === selectedWithdrawal.withdrawalId}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {processing === selectedWithdrawal.withdrawalId ? 'Approving...' : 'Approve Cashout'}
                  </Button>
                  <Button
                    onClick={async () => {
                      await handleReject(selectedWithdrawal.withdrawalId);
                      setDetailsOpen(false);
                    }}
                    disabled={processing === selectedWithdrawal.withdrawalId}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {processing === selectedWithdrawal.withdrawalId ? 'Rejecting...' : 'Reject Cashout'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
