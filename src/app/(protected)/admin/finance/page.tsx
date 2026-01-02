'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertCircle, 
  Search, 
  Filter,
  Eye,
  RefreshCw,
  Bell,
  TrendingUp,
  TrendingDown,
  Users,
  DollarSign,
  Smartphone
} from 'lucide-react';
import { paymentApi } from '@/lib/apiService';
import { AccessDenied } from '@/components/admin/AccessDenied';

interface PendingDeposit {
  depositId: string;
  referenceNumber: string;
  amount: number;
  fee: number;
  totalAmount: number;
  provider: string;
  phoneNumber?: string;
  status: 'pending_payment' | 'pending_approval' | 'completed' | 'failed';
  transactionMessage?: string;
  createdAt: string;
  userId: string;
  user?: {
    username: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

const FinanceDashboard: React.FC = () => {
  const { data: session } = useSession();
  const [deposits, setDeposits] = useState<PendingDeposit[]>([]);
  const [filteredDeposits, setFilteredDeposits] = useState<PendingDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processingDeposit, setProcessingDeposit] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<{ [key: string]: boolean }>({});
  const [stats, setStats] = useState({
    todayTotal: 0,
    pendingCount: 0,
    completedToday: 0,
    totalFees: 0
  });

  // Check if user is finance officer/admin
  const isFinanceOfficer = session?.user?.role === 'admin' || session?.user?.role === 'finance_officer';

  useEffect(() => {
    if (!isFinanceOfficer) {
      return;
    }

    fetchPendingDeposits();
    
    // Set up WebSocket for real-time updates (optional)
    const wsUrl = process.env.NEXT_PUBLIC_ADMIN_WS_URL;
    if (!wsUrl || typeof window === 'undefined') {
      return;
    }

    try {
      const ws = new WebSocket(wsUrl);
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_DEPOSIT' || data.type === 'DEPOSIT_STATUS_UPDATE') {
            fetchPendingDeposits();
          }
        } catch (err) {
          // Silently ignore parsing errors
        }
      };

      ws.onerror = () => {
        // WebSocket unavailable - silently fall back to manual refresh
      };

      ws.onclose = () => {
        // Connection closed - silently clean up
      };

      return () => {
        try {
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close();
          }
        } catch (err) {
          // Silently ignore close errors
        }
      };
    } catch (err) {
      // Silently fail if WebSocket not supported
    }
  }, [isFinanceOfficer]);

  useEffect(() => {
    let filtered = deposits;

    // Apply status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(deposit => deposit.status === statusFilter);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter(deposit =>
        deposit.referenceNumber.toLowerCase().includes(searchLower) ||
        deposit.user?.username?.toLowerCase().includes(searchLower) ||
        deposit.user?.email?.toLowerCase().includes(searchLower) ||
        (deposit.userId || '').toLowerCase().includes(searchLower) ||
        (deposit.phoneNumber || '').includes(searchLower) ||
        deposit.provider.toLowerCase().includes(searchLower)
      );
    }

    setFilteredDeposits(filtered);
  }, [deposits, searchTerm, statusFilter]);

  const fetchPendingDeposits = async () => {
    try {
      setLoading(true);
      const token = (session as any)?.accessToken;
      
      const response = await paymentApi.getPendingDeposits(token, 'pending_approval');
      const allDeposits =
        (response?.data as any)?.deposits ||
        (response?.data as any)?.data?.deposits ||
        (response?.data as any) ||
        [];

      if (Array.isArray(allDeposits)) {
        setDeposits(allDeposits);
        
        // Calculate stats
        const today = new Date().toDateString();
        const todayDeposits = allDeposits.filter(d => 
          new Date(d.createdAt).toDateString() === today
        );
        
        setStats({
          todayTotal: todayDeposits.reduce((sum, d) => sum + d.amount, 0),
          pendingCount: allDeposits.filter(d => d.status === 'pending_approval').length,
          completedToday: todayDeposits.filter(d => d.status === 'completed').length,
          totalFees: allDeposits.reduce((sum, d) => sum + (d.fee || 0), 0)
        });
      }
    } catch (error) {
      console.error('Failed to fetch deposits:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (depositId: string) => {
    try {
      setActionLoading(prev => ({ ...prev, [depositId]: true }));
      const token = (session as any)?.accessToken;
      
      const response = await paymentApi.approveDeposit(token, depositId);
      
      if (response?.success) {
        // Update local state
        setDeposits(prev => prev.map(d => 
          d.depositId === depositId 
            ? { ...d, status: 'completed' }
            : d
        ));
      }
    } catch (error) {
      console.error('Failed to approve deposit:', error);
      alert('Failed to approve deposit. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [depositId]: false }));
    }
  };

  const handleReject = async (depositId: string) => {
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason?.trim()) return;

    try {
      setActionLoading(prev => ({ ...prev, [depositId]: true }));
      const token = (session as any)?.accessToken;
      
      const response = await paymentApi.rejectDeposit(token, depositId, reason);
      
      if (response?.success) {
        // Update local state
        setDeposits(prev => prev.map(d => 
          d.depositId === depositId 
            ? { ...d, status: 'failed' }
            : d
        ));
      }
    } catch (error) {
      console.error('Failed to reject deposit:', error);
      alert('Failed to reject deposit. Please try again.');
    } finally {
      setActionLoading(prev => ({ ...prev, [depositId]: false }));
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'pending_approval':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'pending_payment':
        return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'failed':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'pending_approval':
        return <Clock className="w-4 h-4" />;
      case 'pending_payment':
        return <AlertCircle className="w-4 h-4" />;
      case 'failed':
        return <XCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  if (!isFinanceOfficer) {
    return (
      <AccessDenied message="You don't have permission to access the finance dashboard. This area is restricted to finance officers and administrators." />
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-600 text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-slate-400" />
          <p>Loading finance dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Today's Total</p>
                <p className="text-2xl font-bold text-slate-900">
                  Tsh {stats.todayTotal.toLocaleString()}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Pending</p>
                <p className="text-2xl font-bold text-slate-900">{stats.pendingCount}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Completed Today</p>
                <p className="text-2xl font-bold text-slate-900">{stats.completedToday}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-blue-400" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500">Total Fees</p>
                <p className="text-2xl font-bold text-slate-900">
                  Tsh {stats.totalFees.toLocaleString()}
                </p>
              </div>
              <DollarSign className="w-8 h-8 text-purple-400" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 bg-white">
        <CardHeader>
          <CardTitle className="text-slate-900">Pending Deposits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  type="text"
                  placeholder="Search by reference, user, phone, or provider..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 border-slate-200 bg-white text-slate-900 placeholder-slate-400"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-700"
              >
                <option value="all">All Status</option>
                <option value="pending_payment">Pending Payment</option>
                <option value="pending_approval">Pending Approval</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
              <Button
                onClick={fetchPendingDeposits}
                
                className="border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Deposits Table */}
          <div className="rounded-lg border border-slate-200 overflow-hidden">
            {filteredDeposits.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-slate-500 mb-2">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'No deposits match your filters' 
                    : 'No pending deposits at the moment'}
                </div>
                <Bell className="w-12 h-12 text-slate-300 mx-auto" />
              </div>
            ) : (
              <>
                {/* Mobile Card View */}
                <div className="md:hidden space-y-4">
                  {filteredDeposits.map((deposit) => (
                    <Card key={deposit.depositId} className="border border-slate-200 bg-slate-50">
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-slate-500 mb-1">Reference</p>
                              <p className="text-sm font-mono text-slate-900 break-all">{deposit.referenceNumber}</p>
                              <p className="text-xs text-slate-400 mt-1">
                                {new Date(deposit.createdAt).toLocaleDateString()}
                              </p>
                            </div>
                            <Badge className={`flex items-center gap-1 shrink-0 ${getStatusColor(deposit.status)}`}>
                              {getStatusIcon(deposit.status)}
                              <span className="text-xs">{deposit.status.replace('_', ' ')}</span>
                            </Badge>
                          </div>

                          <div>
                            <p className="text-xs text-slate-500 mb-1">User</p>
                            <p className="text-sm text-slate-900 font-medium">{deposit.user?.firstName} {deposit.user?.lastName}</p>
                            <p className="text-sm text-slate-500">{deposit.user?.username || deposit.userId}</p>
                            <p className="text-xs text-slate-400">{deposit.user?.email || deposit.userId}</p>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-xs text-slate-500 mb-1">Provider</p>
                              <p className="text-sm text-slate-900">{deposit.provider}</p>
                              <p className="text-xs text-slate-500">{deposit.phoneNumber}</p>
                            </div>
                            <div className="text-right">
                              <p className="text-xs text-slate-500 mb-1">Amount</p>
                              <p className="text-sm font-bold text-slate-900">Tsh {deposit.amount.toLocaleString()}</p>
                              <p className="text-xs text-slate-500">Fee: Tsh {(deposit.fee || 0).toLocaleString()}</p>
                              <p className="text-xs font-medium text-slate-700">Total: Tsh {deposit.totalAmount.toLocaleString()}</p>
                            </div>
                          </div>

                          <div className="flex gap-2">
                            {deposit.status === 'pending_approval' && (
                              <>
                                <Button
                                  onClick={() => handleApprove(deposit.depositId)}
                                  disabled={actionLoading[deposit.depositId]}
                                  className="flex-1 bg-green-600 hover:bg-green-700"
                                >
                                  {actionLoading[deposit.depositId] ? (
                                    <>
                                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                      Processing...
                                    </>
                                  ) : (
                                    <>
                                      <CheckCircle className="w-4 h-4 mr-2" />
                                      Approve
                                    </>
                                  )}
                                </Button>
                                <Button
                                  
                                  onClick={() => handleReject(deposit.depositId)}
                                  disabled={actionLoading[deposit.depositId]}
                                  className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10"
                                >
                                  {actionLoading[deposit.depositId] ? (
                                    <>
                                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                      Processing...
                                    </>
                                  ) : (
                                    <>
                                      <XCircle className="w-4 h-4 mr-2" />
                                      Reject
                                    </>
                                  )}
                                </Button>
                              </>
                            )}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-slate-500 hover:text-slate-900"
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Desktop Table View */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left p-4 text-slate-600 font-medium">Reference</th>
                        <th className="text-left p-4 text-slate-600 font-medium">User</th>
                        <th className="text-left p-4 text-slate-600 font-medium">Provider</th>
                        <th className="text-left p-4 text-slate-600 font-medium">Amount</th>
                        <th className="text-left p-4 text-slate-600 font-medium">Fee</th>
                        <th className="text-left p-4 text-slate-600 font-medium">Total</th>
                        <th className="text-left p-4 text-slate-600 font-medium">Status</th>
                        <th className="text-left p-4 text-slate-600 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredDeposits.map((deposit) => (
                        <tr key={deposit.depositId} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="p-4">
                            <div className="text-slate-900 font-mono text-sm">{deposit.referenceNumber}</div>
                            <div className="text-slate-400 text-xs">
                              {new Date(deposit.createdAt).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-900">
                            <div className="font-medium">{deposit.user?.firstName} {deposit.user?.lastName}</div>
                            <div className="text-sm text-slate-500">{deposit.user?.username || deposit.userId}</div>
                            <div className="text-xs text-slate-400">{deposit.user?.email || deposit.userId}</div>
                            </div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-900">{deposit.provider}</div>
                            <div className="text-sm text-slate-500">{deposit.phoneNumber}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-900">Tsh {deposit.amount.toLocaleString()}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-500">Tsh {(deposit.fee || 0).toLocaleString()}</div>
                          </td>
                          <td className="p-4">
                            <div className="text-slate-900 font-medium">Tsh {deposit.totalAmount.toLocaleString()}</div>
                          </td>
                          <td className="p-4">
                            <Badge className={`flex items-center gap-1 ${getStatusColor(deposit.status)}`}>
                              {getStatusIcon(deposit.status)}
                              {deposit.status.replace('_', ' ')}
                            </Badge>
                          </td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              {deposit.status === 'pending_approval' && (
                                <>
                                  <Button
                                    size="sm"
                                    onClick={() => handleApprove(deposit.depositId)}
                                    disabled={actionLoading[deposit.depositId]}
                                    className="bg-green-600 hover:bg-green-700"
                                  >
                                    {actionLoading[deposit.depositId] ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <CheckCircle className="w-4 h-4" />
                                    )}
                                  </Button>
                                  <Button
                                    size="sm"
                                    
                                    onClick={() => handleReject(deposit.depositId)}
                                    disabled={actionLoading[deposit.depositId]}
                                    className="border-red-500/30 text-red-400 hover:bg-red-500/10"
                                  >
                                    {actionLoading[deposit.depositId] ? (
                                      <RefreshCw className="w-4 h-4 animate-spin" />
                                    ) : (
                                      <XCircle className="w-4 h-4" />
                                    )}
                                  </Button>
                                </>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-slate-500 hover:text-slate-900"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanceDashboard;
