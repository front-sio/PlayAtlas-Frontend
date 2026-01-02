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

interface Deposit {
  id?: string;
  depositId: string;
  referenceNumber: string;
  amount: number;
  fee?: number;
  totalAmount?: number;
  provider: string;
  phoneNumber?: string;
  status: string;
  createdAt?: string;
  completedAt?: string;
  userId?: string;
  approvedBy?: string;
  approvedAt?: string;
  externalReference?: string;
  transactionMessage?: string;
  failureReason?: string;
  metadata?: any;
  callbackData?: any;
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

export default function AdminDepositsPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [selectedDeposit, setSelectedDeposit] = useState<Deposit | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const canViewSensitive = ['admin', 'super_admin', 'superuser', 'superadmin'].includes((role || '').toLowerCase());

  useEffect(() => {
    if (!token || !isAdminRole(role)) return;
    loadDeposits();
  }, [token, role]);

  const loadDeposits = async () => {
    try {
      setLoading(true);
      const result = await paymentApi.getAdminTransactions(token, 'deposit');
      if (result.success && result.data) {
        const data = result.data as any;
        setDeposits(data.transactions || data.data?.transactions || data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  };

  const filteredDeposits = useMemo(() => {
    if (!search.trim()) return deposits;
    const term = search.toLowerCase();
    return deposits.filter((deposit) =>
      `${deposit.referenceNumber} ${deposit.provider} ${deposit.phoneNumber || ''} ${deposit.userId || ''}`
        .toLowerCase()
        .includes(term)
    );
  }, [deposits, search]);

  const displayStatus = (status: string) => {
    const normalized = String(status || '').toLowerCase();
    if (['completed', 'approved'].includes(normalized)) return 'Successful';
    if (['pending_approval'].includes(normalized)) return 'Waiting Approval';
    if (['pending_payment'].includes(normalized)) return 'Waiting Confirmation';
    if (['pending', 'processing'].includes(normalized)) return 'Processing';
    if (['rejected', 'cancelled', 'failed'].includes(normalized)) return 'Failed';
    // Convert underscores to spaces and capitalize each word
    return normalized.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ') || 'Unknown';
  };

  const handleApprove = async (depositId: string) => {
    if (!token) return;
    try {
      setProcessing(depositId);
      const result = await paymentApi.approveDeposit(token, depositId);
      if (result.success) {
        // Find the deposit to get user info
        const deposit = deposits.find(d => d.depositId === depositId);
        
        // Send approval notification to user
        if (deposit?.userId) {
          await notificationService.sendNotification({
            userId: deposit.userId,
            type: 'payment',
            title: 'Deposit Confirmed',
            message: `**${deposit.referenceNumber}** Confirmed. Your deposit of TZS${deposit.amount?.toLocaleString()}.00 has been approved and credited to your wallet.`,
            data: {
              depositId: depositId,
              amount: deposit.amount,
              status: 'APPROVED',
              playSound: true
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
        
        await loadDeposits();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve deposit');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (depositId: string) => {
    if (!token) return;
    try {
      setProcessing(depositId);
      const result = await paymentApi.rejectDeposit(token, depositId, 'Rejected by admin');
      if (result.success) {
        // Find the deposit to get user info
        const deposit = deposits.find(d => d.depositId === depositId);
        
        // Send rejection notification to user
        if (deposit?.userId) {
          await notificationService.sendNotification({
            userId: deposit.userId,
            type: 'payment',
            title: 'Deposit Rejected',
            message: `Your deposit request of Tsh ${deposit.amount?.toLocaleString()} has been rejected. Please contact support if you believe this is an error.`,
            data: {
              depositId: depositId,
              amount: deposit.amount,
              status: 'REJECTED'
            },
            channel: 'in_app',
            priority: 'high'
          });
        }
        
        await loadDeposits();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject deposit');
    } finally {
      setProcessing(null);
    }
  };

  const columns = useMemo(() => [
    {
      key: 'referenceNumber' as keyof Deposit,
      label: 'Reference',
      mobilePriority: 'high' as const,
    },
    {
      key: 'provider' as keyof Deposit,
      label: 'Provider',
      mobilePriority: 'medium' as const,
    },
    {
      key: 'amount' as keyof Deposit,
      label: 'Amount',
      mobilePriority: 'high' as const,
      render: (value) => `TSH ${Number(value).toLocaleString()}`,
    },
    {
      key: 'phoneNumber' as keyof Deposit,
      label: 'Phone',
      mobilePriority: 'low' as const,
    },
    {
      key: 'status' as keyof Deposit,
      label: 'Status',
      mobilePriority: 'high' as const,
      render: (value) => {
        const status = String(value).toLowerCase();
        const isPending = ['pending', 'pending_approval', 'pending_payment'].includes(status);
        
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
      key: 'actions' as keyof Deposit,
      label: 'Action',
      mobilePriority: 'high' as const,
      render: (value, item) => (
        <Button
          size="sm"
          onClick={() => {
            setSelectedDeposit(item);
            setDetailsOpen(true);
          }}
        >
          View
        </Button>
      ),
    },
  ], []);

  if (status === 'authenticated' && role && !isAdminRole(role)) {
    return <AccessDenied message="You do not have permission to view deposits." />;
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Deposits</CardTitle>
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search deposits..."
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
            <p className="text-sm text-muted-foreground">Loading deposits...</p>
          ) : (
            <ResponsiveTable
              data={filteredDeposits}
              columns={columns}
              keyExtractor={(item) => item.depositId}
              emptyMessage="No deposits found."
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Deposit Details</DialogTitle>
            <DialogDescription>Review the full deposit information before approval.</DialogDescription>
          </DialogHeader>
          {selectedDeposit && (
            <div className="grid gap-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span>{selectedDeposit.referenceNumber}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="capitalize">{displayStatus(selectedDeposit.status)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span>TSH {Number(selectedDeposit.amount).toLocaleString()}</span>
              </div>
              {selectedDeposit.fee !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Fee</span>
                  <span>TSH {Number(selectedDeposit.fee || 0).toLocaleString()}</span>
                </div>
              )}
              {selectedDeposit.totalAmount !== undefined && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Total</span>
                  <span>TSH {Number(selectedDeposit.totalAmount || 0).toLocaleString()}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Provider</span>
                <span>{selectedDeposit.provider || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Phone</span>
                <span>{selectedDeposit.phoneNumber || '—'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">User ID</span>
                <span>{selectedDeposit.userId || '—'}</span>
              </div>
              {selectedDeposit.externalReference && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Provider Ref</span>
                  <span>{selectedDeposit.externalReference}</span>
                </div>
              )}
              {selectedDeposit.transactionMessage && (
                <div>
                  <span className="text-muted-foreground">Transaction Message</span>
                  <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                    {selectedDeposit.transactionMessage}
                  </pre>
                </div>
              )}
              {selectedDeposit.failureReason && (
                <div>
                  <span className="text-muted-foreground">Failure Reason</span>
                  <p className="mt-1 text-sm">{selectedDeposit.failureReason}</p>
                </div>
              )}
              {selectedDeposit.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Created</span>
                  <span>{new Date(selectedDeposit.createdAt).toLocaleString()}</span>
                </div>
              )}
              {selectedDeposit.completedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Completed</span>
                  <span>{new Date(selectedDeposit.completedAt).toLocaleString()}</span>
                </div>
              )}
              {canViewSensitive && (selectedDeposit.metadata || selectedDeposit.callbackData) && (
                <div className="grid gap-2">
                  {selectedDeposit.metadata && (
                    <div>
                      <span className="text-muted-foreground">Metadata</span>
                      <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                        {JSON.stringify(selectedDeposit.metadata, null, 2)}
                      </pre>
                    </div>
                  )}
                  {selectedDeposit.callbackData && (
                    <div>
                      <span className="text-muted-foreground">Callback Data</span>
                      <pre className="mt-1 whitespace-pre-wrap rounded border border-border bg-muted px-3 py-2 text-xs">
                        {JSON.stringify(selectedDeposit.callbackData, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
              
              {/* Action Buttons */}
              {selectedDeposit && ['pending', 'pending_approval', 'pending_payment'].includes(selectedDeposit.status?.toLowerCase()) && (
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <Button
                    onClick={async () => {
                      await handleApprove(selectedDeposit.depositId);
                      setDetailsOpen(false);
                    }}
                    disabled={processing === selectedDeposit.depositId}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {processing === selectedDeposit.depositId ? 'Approving...' : 'Approve Deposit'}
                  </Button>
                  <Button
                    onClick={async () => {
                      await handleReject(selectedDeposit.depositId);
                      setDetailsOpen(false);
                    }}
                    disabled={processing === selectedDeposit.depositId}
                    variant="destructive"
                    className="flex-1"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {processing === selectedDeposit.depositId ? 'Rejecting...' : 'Reject Deposit'}
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
