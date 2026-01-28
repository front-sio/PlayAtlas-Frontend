'use client';

import React, { useRef, useState, useEffect } from 'react';
import { useSession, getSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpRight, ArrowDownLeft, Wallet, Plus, Minus, RefreshCw, Eye, EyeOff, Smartphone, Building, History, TrendingUp, AlertCircle, CheckCircle, Clock, Send, Download, Copy, Check } from 'lucide-react';
import { getWalletBalance, withdrawFunds, paymentApi } from '@/lib/apiService';
import { getApiBaseUrl } from '@/lib/apiBase';
import { PageLoader } from '@/components/ui/page-loader';
import PaymentConfirmation from '@/components/PaymentConfirmation';
import AlertModal from '@/components/ui/AlertModal';
import { notificationService, Notification } from '@/lib/notificationService';
import { useSocket } from '@/hooks/useSocket';

interface Transaction {
  id: string;
  type: 'DEPOSIT' | 'WITHDRAWAL' | 'TOURNAMENT_ENTRY' | 'WINNINGS' | 'TRANSFER_SENT' | 'TRANSFER_RECEIVED' | 'TOURNAMENT_FEE' | 'ADJUSTMENT';
  amount: number;
  status: string;
  description: string;
  createdAt: string;
  paymentMethod?: string;
  reference?: string;
  direction?: 'sent' | 'received';
  tournamentId?: string;
  seasonId?: string;
}

interface PaymentProvider {
  code: string;
  name: string;
  minAmount?: number;
  maxAmount?: number;
  fee?: number;
  lipaNumber?: string;
  instructions?: string;
  depositFeePercentage?: number;
}

interface ProviderDetails extends PaymentProvider {
  requestedAmount?: number;
  feeAmount?: number;
  totalPayable?: number;
}

interface DepositReceipt {
  depositId?: string;
  referenceNumber: string;
  amount: number;
  fee?: number;
  totalAmount?: number;
  status?: string;
  expiresAt?: string;
  provider?: string;
}

const WalletPage: React.FC = () => {
  const { data: session, status } = useSession();
  const apiBase = getApiBaseUrl();
  const { socket } = useSocket({ enabled: true });
  const [balance, setBalance] = useState(0);
  const [revenueBalance, setRevenueBalance] = useState(0);
  const [walletId, setWalletId] = useState<string | null>(null);
  const [showBalance, setShowBalance] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositPhoneNumber, setDepositPhoneNumber] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawPhoneNumber, setWithdrawPhoneNumber] = useState('');
  const [withdrawMethod, setWithdrawMethod] = useState<'airtel' | 'mpesa' | 'tigopesa' | 'halopesa' | 'bank'>('mpesa');
  const [withdrawSource, setWithdrawSource] = useState<'deposit' | 'revenue'>('deposit');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferPhoneNumber, setTransferPhoneNumber] = useState('');
  const [transferDescription, setTransferDescription] = useState('');
  const [transferRecipient, setTransferRecipient] = useState<{
    userId: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    phoneNumber?: string;
  } | null>(null);
  const [transferLookupLoading, setTransferLookupLoading] = useState(false);
  const [transferLookupError, setTransferLookupError] = useState<string | null>(null);
  const [transferConfirmed, setTransferConfirmed] = useState(false);
  const [walletNumberCopied, setWalletNumberCopied] = useState(false);
  const [providers, setProviders] = useState<PaymentProvider[]>([]);
  const [providersLoading, setProvidersLoading] = useState(true);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [transactionError, setTransactionError] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [providerDetails, setProviderDetails] = useState<ProviderDetails | null>(null);
  const [providerDetailsLoading, setProviderDetailsLoading] = useState(false);
  const [depositResult, setDepositResult] = useState<DepositReceipt | null>(null);
  const [showPaymentConfirmation, setShowPaymentConfirmation] = useState(false);
  const [alertModal, setAlertModal] = useState({
    open: false,
    title: '',
    message: '',
    type: 'info' as 'error' | 'success' | 'info'
  });
  const processedNotificationsRef = useRef<Set<string>>(new Set());

  const processPaymentNotification = async (notification: Notification) => {
    if (!notification || notification.type !== 'payment') return;
    if (processedNotificationsRef.current.has(notification.notificationId)) return;

    processedNotificationsRef.current.add(notification.notificationId);

    try {
      const isSuccess = notification.message.toLowerCase().includes('approved') || 
                       notification.message.toLowerCase().includes('completed') ||
                       notification.message.toLowerCase().includes('successful');
      const isFailed = notification.message.toLowerCase().includes('rejected') || 
                      notification.message.toLowerCase().includes('failed') ||
                      notification.message.toLowerCase().includes('declined');
      
      if (isSuccess) {
        showAlert('Transaction Approved', notification.message, 'success');
      } else if (isFailed) {
        showAlert('Transaction Failed', notification.message, 'error');
      } else {
        showAlert('Transaction Update', notification.message, 'info');
      }
      
      await notificationService.markAsRead(notification.notificationId);

      const token = await getAccessToken();
      if (token) {
        const balanceData = await getWalletBalance(token);
        if (balanceData?.data?.balance !== undefined) {
          setBalance(balanceData.data.balance);
          if (balanceData.data.revenueBalance !== undefined) {
            setRevenueBalance(balanceData.data.revenueBalance);
          }
        }
        await refreshTransactions(token);
      }
    } catch (error) {
      console.error('Failed to check payment notifications:', error);
    }
  };

  const fetchUnreadPaymentNotifications = async () => {
    try {
      const notifications = await notificationService.getUserNotifications({
        type: 'payment',
        isRead: false
      });
      
      if (notifications.success && notifications.data.length > 0) {
        for (const notification of notifications.data) {
          await processPaymentNotification(notification);
        }
      }
    } catch (error) {
      console.error('Failed to fetch payment notifications:', error);
    }
  };

  const showAlert = (title: string, message: string, type: 'error' | 'success' | 'info' = 'info') => {
    setAlertModal({ open: true, title, message, type });
  };

  const copyWalletNumber = async () => {
    const receiveNumber = session?.user?.phoneNumber || walletId;
    if (receiveNumber && typeof window !== 'undefined') {
      await navigator.clipboard.writeText(receiveNumber);
      setWalletNumberCopied(true);
      setTimeout(() => setWalletNumberCopied(false), 2000);
    }
  };

  const normalizeStatus = (value?: string) => (value ? value.toUpperCase() : 'PENDING');

  // Convert DepositReceipt to Transaction for display in transaction history
  const depositReceiptToTransaction = (receipt: DepositReceipt, providerName: string): Transaction => {
    return {
      id: receipt.depositId || receipt.referenceNumber,
      type: 'DEPOSIT',
      amount: receipt.amount,
      status: 'PENDING_PAYMENT',
      description: `${providerName} Deposit - Pending Confirmation`,
      createdAt: new Date().toISOString(),
      paymentMethod: providerName,
      reference: receipt.referenceNumber
    };
  };

  const normalizePaymentTransaction = (tx: any): Transaction | null => {
    if (!tx) return null;
    const typeKey = String(tx.type || '').toLowerCase();
    const statusKey = String(tx.status || '').toUpperCase();
    const isDeposit = typeKey === 'deposit';
    const isWithdrawal = typeKey === 'withdrawal';
    const isTournamentFee = typeKey === 'tournament_fee';
    const isTransferSent = typeKey === 'transfer_sent';
    const isTransferReceived = typeKey === 'transfer_received';
    
    // Handle PENDING_PAYMENT status (deposits waiting for transaction message confirmation)
    const isPendingPayment = statusKey === 'PENDING_PAYMENT';
    
    // Accept all transaction types
    if (!isDeposit && !isWithdrawal && !isPendingPayment && !isTournamentFee && !isTransferSent && !isTransferReceived) return null;

    const amount = Number(tx.amount || 0);
    const provider = tx.provider || '';
    
    // Generate description based on transaction type
    let description = '';
    let displayType: Transaction['type'] = 'DEPOSIT';
    let displayAmount = amount;
    
    if (isDeposit || isPendingPayment) {
      displayType = 'DEPOSIT';
      description = isPendingPayment 
        ? `${provider ? provider.toUpperCase() + ' ' : ''}Deposit - Pending Confirmation`
        : 'Deposit';
      displayAmount = amount;
    } else if (isWithdrawal) {
      displayType = 'WITHDRAWAL';
      description = provider === 'bank' ? 'Bank Transfer Cashout' : `${provider.toUpperCase()} Cashout`;
      displayAmount = -amount;
    } else if (isTournamentFee) {
      displayType = 'TOURNAMENT_FEE';
      description = 'Tournament Entry Fee';
      displayAmount = -amount;
    } else if (isTransferSent) {
      displayType = 'TRANSFER_SENT';
      description = tx.description || 'Money Sent';
      displayAmount = -amount;
    } else if (isTransferReceived) {
      displayType = 'TRANSFER_RECEIVED';
      description = tx.description || 'Money Received';
      displayAmount = amount;
    }

    return {
      id: tx.id || tx.depositId || tx.withdrawalId || tx.feeId || tx.transferId || tx.referenceNumber,
      type: displayType,
      amount: displayAmount,
      status: normalizeStatus(tx.status),
      description,
      createdAt: tx.createdAt || tx.completedAt || tx.processedAt || new Date().toISOString(),
      paymentMethod: provider || undefined,
      reference: tx.referenceNumber || undefined,
      direction: (isTransferSent || isTransferReceived) ? tx.direction as 'sent' | 'received' : undefined,
      tournamentId: tx.tournamentId || undefined,
      seasonId: tx.seasonId || undefined
    };
  };

  const refreshTransactions = async (token: string) => {
    if (!token) return;
    try {
      const paymentTxResponse = await paymentApi.getTransactionHistory(token);
      const paymentTxs = paymentTxResponse?.data || paymentTxResponse || [];

      const normalizedPaymentTxs = Array.isArray(paymentTxs)
        ? paymentTxs
            .map((tx: any) => normalizePaymentTransaction(tx))
            .filter(Boolean) as Transaction[]
        : [];

      const combined = [...normalizedPaymentTxs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      setTransactions(combined);
      setTransactionError(null);
    } catch (error) {
      console.error('Failed to get transaction history:', error);
      setTransactionError('Failed to get transaction history. Please try again.');
    }
  };

  const getAccessToken = async () => {
    const latestSession = await getSession();
    return (latestSession as any)?.accessToken as string | undefined;
  };

  const selectedProviderMeta = selectedProvider
    ? providers.find((p) => p.code === selectedProvider) || null
    : null;
  const providerLimits = providerDetails ?? selectedProviderMeta;
  const minDepositAmount = providerLimits?.minAmount;
  const maxDepositAmount = providerLimits?.maxAmount;
  const parsedDepositAmount = parseFloat(depositAmount);
  const hasDepositAmount = !Number.isNaN(parsedDepositAmount) && parsedDepositAmount > 0;
  const depositFeeRate =
    providerDetails?.depositFeePercentage ??
    selectedProviderMeta?.depositFeePercentage ??
    0;
  const derivedFee = hasDepositAmount
    ? Number((parsedDepositAmount * depositFeeRate).toFixed(2))
    : 0;
  const calculatedFee =
    providerDetails?.feeAmount !== undefined ? providerDetails.feeAmount : derivedFee;
  const totalPayable =
    providerDetails?.totalPayable !== undefined
      ? providerDetails.totalPayable
      : hasDepositAmount
      ? Number((parsedDepositAmount + derivedFee).toFixed(2))
      : 0;
  const amountOutOfRange =
    hasDepositAmount &&
    ((typeof minDepositAmount === 'number' && parsedDepositAmount < minDepositAmount) ||
      (typeof maxDepositAmount === 'number' && parsedDepositAmount > maxDepositAmount));
  const depositBalance = Math.max(0, balance - revenueBalance);
  const availableWithdrawalBalance =
    withdrawSource === 'revenue' ? revenueBalance : depositBalance;

  // Persist pending deposits across page refreshes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    // Load pending deposits from localStorage
    const savedPendingDeposits = localStorage.getItem('pendingDeposits');
    if (savedPendingDeposits) {
      try {
        const pendingDeposits = JSON.parse(savedPendingDeposits);
        // Only restore if deposit hasn't expired
        const now = Date.now();
        const validDeposits = pendingDeposits.filter((dep: any) => {
          const expiresAt = new Date(dep.expiresAt).getTime();
          return expiresAt > now;
        });
        
        if (validDeposits.length > 0) {
          setDepositResult(validDeposits[0]);
          
          // Add pending deposits to transaction history
          const providerName = providers.find((p) => p.code === validDeposits[0].provider)?.name || 'Mobile Money';
          const pendingTransactions = validDeposits.map((dep: DepositReceipt) => 
            depositReceiptToTransaction(dep, providerName)
          );
          
          // Add to existing transactions (at the beginning to show first)
          setTransactions((prevTransactions) => {
            // Create a Set of existing transaction IDs to avoid duplicates
            const existingIds = new Set(prevTransactions.map(tx => tx.id));
            const newTransactions = pendingTransactions.filter(tx => !existingIds.has(tx.id));
            return [...newTransactions, ...prevTransactions];
          });
        }
        
        // Clean up expired deposits
        if (validDeposits.length !== pendingDeposits.length) {
          localStorage.setItem('pendingDeposits', JSON.stringify(validDeposits));
        }
      } catch (error) {
        console.error('Failed to load pending deposits:', error);
        localStorage.removeItem('pendingDeposits');
      }
    }
  }, [providers]);

  // Fetch unread notifications once on load
  useEffect(() => {
    if (status === 'authenticated') {
      fetchUnreadPaymentNotifications();
    }
  }, [status]);

  useEffect(() => {
    if (!socket) return;

    const handleNotification = (notification: Notification) => {
      if (notification?.type === 'payment') {
        processPaymentNotification(notification);
      }
    };

    socket.on('notification:new', handleNotification);
    return () => {
      socket.off('notification:new', handleNotification);
    };
  }, [socket]);

  useEffect(() => {
    // Fetch real data from API
    const fetchWalletData = async () => {
      try {
        setPageLoading(true);
        const latestSession = await getSession();
        const authToken = (latestSession as any)?.accessToken as string | undefined;
        
        if (authToken) {
          // Fetch wallet balance
          const balanceData = await getWalletBalance(authToken);
          if (balanceData?.data?.balance !== undefined) {
            setBalance(balanceData.data.balance);
            if (balanceData.data.revenueBalance !== undefined) {
              setRevenueBalance(balanceData.data.revenueBalance);
            }
          }
          if (balanceData?.data?.walletId) {
            setWalletId(balanceData.data.walletId);
          }

          await refreshTransactions(authToken);
        } else {
          console.error('🔍 No authentication token available');
          // Redirect to login if no token available
          if (typeof window !== 'undefined') {
            window.location.href = '/auth/login';
          }
        }
      } catch (error: any) {
        console.error('🔍 Failed to fetch wallet data:', error);
        
        // If it's a 401 error, the token refresh mechanism should handle it
        // But if it fails, we'll be redirected to login automatically
        if (error?.status === 401) {
          console.log('🔍 401 error caught in wallet page - token refresh should handle this');
        } else {
          // For other errors, we can show a user-friendly message
          // but keep the current state
        }
      } finally {
        setPageLoading(false);
      }
    };

    if (status === 'authenticated') fetchWalletData();
    if (status === 'unauthenticated') {
      setPageLoading(false);
      if (typeof window !== 'undefined') {
        window.location.href = '/auth/login';
      }
    }
  }, [status]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        setProvidersLoading(true);
        setProvidersError(null);
        const response = await paymentApi.getProviders();
        const list = response?.data || [];
        setProviders(list);
        if (list.length > 0) {
          setSelectedProvider((current) => current || list[0].code);
        }
      } catch (error) {
        console.error('Failed to load payment providers:', error);
        setProvidersError('Failed to load payment providers. Please try again.');
      } finally {
        setProvidersLoading(false);
      }
    };

    loadProviders();
  }, []);

  useEffect(() => {
    if (!selectedProvider) {
      setProviderDetails(null);
      return;
    }

    const fallback = providers.find((p) => p.code === selectedProvider);
    if (fallback) {
      setProviderDetails((current) => {
        if (
          current?.code === selectedProvider &&
          current?.requestedAmount === parsedDepositAmount &&
          current.instructions
        ) {
          return current;
        }
        return fallback;
      });
    } else {
      setProviderDetails(null);
    }

    let isCancelled = false;
    setProviderDetailsLoading(true);

    const timeout = setTimeout(async () => {
      try {
        const amountValue = hasDepositAmount ? parsedDepositAmount : undefined;
        const detailResponse = await paymentApi.getProviderDetails(selectedProvider, amountValue);
        if (!isCancelled) {
          const serverData = detailResponse?.data || null;
          if (serverData) {
            setProviderDetails({
              ...(fallback || {}),
              ...serverData,
              instructions: serverData.instructions || fallback?.instructions,
            });
          } else {
            setProviderDetails(fallback || null);
          }
        }
      } catch (error) {
        console.error('Failed to load provider info:', error);
        if (!isCancelled) {
          setProviderDetails(fallback || null);
        }
      } finally {
        if (!isCancelled) {
          setProviderDetailsLoading(false);
        }
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearTimeout(timeout);
    };
  }, [selectedProvider, depositAmount, providers]);

  const handleAddFunds = async () => {
    if (!walletId) {
      showAlert('Error', 'Wallet not ready. Please refresh and try again.', 'error');
      return;
    }

    if (!selectedProvider) {
      showAlert('Error', 'Please select a payment provider.', 'error');
      return;
    }

    if (!hasDepositAmount || !depositPhoneNumber) {
      showAlert('Error', 'Please enter amount and phone number', 'error');
      return;
    }

    if (amountOutOfRange) {
      let minDisplay: string | null = null;
      let maxDisplay: string | null = null;

      if (typeof minDepositAmount === 'number') {
        minDisplay = `${minDepositAmount.toLocaleString()} TSH`;
      }

      if (typeof maxDepositAmount === 'number') {
        maxDisplay = `${maxDepositAmount.toLocaleString()} TSH`;
      }

      let rangeMessage = 'within the allowed range';
      if (minDisplay && maxDisplay) {
        rangeMessage = `between ${minDisplay} and ${maxDisplay}`;
      } else if (minDisplay) {
        rangeMessage = `of at least ${minDisplay}`;
      } else if (maxDisplay) {
        rangeMessage = `of no more than ${maxDisplay}`;
      }

      showAlert('Invalid Amount', `Please enter an amount ${rangeMessage}.`, 'error');
      return;
    }

    setLoading(true);
    setDepositResult(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        showAlert('Authentication Required', 'Please login to add funds', 'error');
        return;
      }

      const payload = {
        walletId,
        provider: selectedProvider,
        phoneNumber: depositPhoneNumber,
        amount: parsedDepositAmount
      };

      const response = await paymentApi.initiateDeposit(token, payload);

      if (response?.success && response.data) {
        const receipt = response.data as DepositReceipt;
        const providerName =
          providers.find((p) => p.code === selectedProvider)?.name || 'Mobile Money';

        setDepositResult(receipt);
        setDepositAmount('');
        setDepositPhoneNumber('');

        // Save to localStorage for persistence
        if (typeof window !== 'undefined') {
          const pendingDeposits = JSON.parse(localStorage.getItem('pendingDeposits') || '[]');
          pendingDeposits.push(receipt);
          localStorage.setItem('pendingDeposits', JSON.stringify(pendingDeposits));
        }

        // Add transaction to transaction history immediately
        const newTransaction = depositReceiptToTransaction(receipt, providerName);
        setTransactions((prev) => [newTransaction, ...prev]);

        // Refresh transactions from API to load PENDING_PAYMENT status deposits
        await refreshTransactions(token);

        showAlert('Deposit Initiated', 'Please complete the payment using the instructions provided.', 'success');
      } else {
        showAlert('Deposit Failed', response?.message || 'Failed to process deposit', 'error');
      }
    } catch (error) {
      console.error('Deposit error:', error);
      showAlert('Deposit Failed', 'Failed to process deposit. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdrawFunds = async () => {
    if (!withdrawAmount || !withdrawPhoneNumber) {
      showAlert('Error', 'Please enter amount and phone number', 'error');
      return;
    }

    if (parseFloat(withdrawAmount) > availableWithdrawalBalance) {
      const sourceLabel = withdrawSource === 'revenue' ? 'revenue' : 'deposit';
      showAlert('Insufficient Balance', `You do not have enough ${sourceLabel} balance to withdraw this amount.`, 'error');
      return;
    }

    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        showAlert('Authentication Required', 'Please login to withdraw funds', 'error');
        return;
      }

      const withdrawalData = {
        walletId,
        amount: parseFloat(withdrawAmount),
        paymentMethod: withdrawMethod,
        phoneNumber: withdrawPhoneNumber,
        description: withdrawMethod === 'bank' ? 'Bank Transfer Withdrawal' : `${withdrawMethod.toUpperCase()} Withdrawal`,
        withdrawalSource: withdrawSource
      };

      const response = await withdrawFunds(token, withdrawalData);
      
      if (response?.success) {
        // Create optimistic transaction (DON'T update balance until approved)
        const newTransaction: Transaction = {
          id: response.data?.transactionId || Date.now().toString(),
          type: 'WITHDRAWAL',
          amount: -parseFloat(withdrawAmount),
          status: 'PENDING_APPROVAL',
          description: withdrawMethod === 'bank' ? 'Bank Transfer Cashout' : `${withdrawMethod.toUpperCase()} Cashout`,
          createdAt: new Date().toISOString(),
          paymentMethod: withdrawMethod === 'bank' ? 'Bank Transfer' : withdrawMethod.toUpperCase(),
          reference: response.data?.reference || `TXN${Date.now()}`
        };

        setTransactions([newTransaction, ...transactions]);
        
        // DO NOT UPDATE BALANCE - Keep the balance unchanged until withdrawal is approved
        // The balance should only be deducted when the admin approves the withdrawal
        
        setWithdrawAmount('');
        setWithdrawPhoneNumber('');
        showAlert('Success', 'Withdrawal request submitted successfully! Waiting for admin approval.', 'success');
      } else {
        showAlert('Withdrawal Failed', response?.message || 'Failed to process withdrawal', 'error');
      }
    } catch (error: any) {
      console.error('Withdrawal error:', error);
      const errorMessage = error?.message || 'Failed to process withdrawal. Please try again.';
      showAlert('Withdrawal Failed', errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleTransferFunds = async () => {
    if (!walletId) {
      showAlert('Error', 'Wallet not ready. Please refresh and try again.', 'error');
      return;
    }

    if (!transferAmount || !transferPhoneNumber) {
      showAlert('Error', 'Please enter amount and recipient phone number', 'error');
      return;
    }

    if (!session?.user?.userId) {
      showAlert('Authentication Required', 'Please login to transfer funds', 'error');
      return;
    }
    if (!transferRecipient || !transferConfirmed) {
      showAlert('Confirm Recipient', 'Please confirm the recipient before sending.', 'error');
      return;
    }

    const parsedTransferAmount = parseFloat(transferAmount);
    if (isNaN(parsedTransferAmount) || parsedTransferAmount <= 0) {
      showAlert('Error', 'Please enter a valid amount', 'error');
      return;
    }

    if (parsedTransferAmount > balance) {
      showAlert('Insufficient Balance', 'You do not have enough balance to transfer.', 'error');
      return;
    }

    setLoading(true);
    try {
      const token = await getAccessToken();
      if (!token) {
        showAlert('Authentication Required', 'Please login to transfer funds', 'error');
        return;
      }

      const response = await fetch(`${apiBase}/payment/transfer`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          fromWalletId: walletId,
          userId: session.user.userId,
          toPhoneNumber: transferPhoneNumber,
          amount: parsedTransferAmount,
          description: transferDescription || undefined
        })
      });

      const rawResponse = await response.text();
      const trimmed = rawResponse.trim();
      let data: any = null;
      if (trimmed) {
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          try {
            data = JSON.parse(trimmed);
          } catch (parseError) {
            console.error('Transfer response JSON parse error:', parseError, trimmed.slice(0, 200));
            data = { success: false, error: 'Invalid response from server' };
          }
        } else {
          data = { success: false, error: trimmed };
        }
      } else {
        data = { success: response.ok };
      }
      if (!response.ok && !data?.error) {
        data = { ...data, success: false, error: `Transfer failed (${response.status})` };
      }
      
      if (data?.success) {
        // Update balance immediately (instant transfer)
        const depositPortion = Math.min(depositBalance, parsedTransferAmount);
        const revenuePortion = Math.max(0, parsedTransferAmount - depositPortion);
        setBalance((prev) => prev - parsedTransferAmount);
        setRevenueBalance((prev) => Math.max(0, prev - revenuePortion));

        // Create transaction record
        const newTransaction: Transaction = {
          id: data.data?.transferId || Date.now().toString(),
          type: 'TRANSFER_SENT',
          amount: -parsedTransferAmount,
          status: 'COMPLETED',
          description: transferDescription || 'Money Sent',
          createdAt: new Date().toISOString(),
          reference: data.data?.referenceNumber || `TXFR${Date.now()}`
        };

        setTransactions([newTransaction, ...transactions]);
        
        setTransferAmount('');
        setTransferPhoneNumber('');
        setTransferDescription('');
        setTransferRecipient(null);
        setTransferConfirmed(false);
        showAlert('Transfer Successful', `Successfully sent Tsh ${parsedTransferAmount.toLocaleString()} to ${transferPhoneNumber}`, 'success');
      } else {
        showAlert('Transfer Failed', data?.error || 'Failed to transfer funds', 'error');
      }
    } catch (error: any) {
      console.error('Transfer error:', error);
      const errorMessage = error?.message || 'Failed to transfer funds. Please try again.';
      showAlert('Transfer Failed', errorMessage, 'error');
    } finally {
      setLoading(false);
    }
  };

  const normalizeDisplayStatus = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'APPROVED':
        return 'SUCCESS';
      case 'PENDING_APPROVAL':
      case 'PENDING_PAYMENT':
        return 'PENDING';
      case 'PENDING':
        return 'PROCESSING';
      case 'REJECTED':
        return 'FAILED';
      default:
        return status;
    }
  };

  const normalizePhoneNumber = (phone: string) => {
    const cleaned = phone.replace(/\s+/g, '');
    if (cleaned.startsWith('0')) {
      return `+255${cleaned.slice(1)}`;
    }
    if (!cleaned.startsWith('+')) {
      return `+255${cleaned}`;
    }
    return cleaned;
  };

  useEffect(() => {
    if (!transferPhoneNumber) {
      setTransferRecipient(null);
      setTransferLookupError(null);
      setTransferConfirmed(false);
      return;
    }

    const trimmed = transferPhoneNumber.trim();
    if (trimmed.length < 9) {
      setTransferRecipient(null);
      setTransferLookupError(null);
      setTransferConfirmed(false);
      return;
    }

    setTransferConfirmed(false);
    const timeout = setTimeout(async () => {
      const token = await getAccessToken();
      if (!token) return;
      setTransferLookupLoading(true);
      setTransferLookupError(null);
      try {
        const normalized = normalizePhoneNumber(trimmed);
        const lookupResponse = await fetch(
          `${apiBase}/payment/transfer/lookup/phone/${encodeURIComponent(normalized)}`,
          {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` }
          }
        );
        const raw = await lookupResponse.text();
        const trimmedRaw = raw.trim();
        let parsed: any = null;
        if (trimmedRaw) {
          if (trimmedRaw.startsWith('{') || trimmedRaw.startsWith('[')) {
            try {
              parsed = JSON.parse(trimmedRaw);
            } catch (parseError) {
              console.error('Recipient lookup JSON parse error:', parseError, trimmedRaw.slice(0, 200));
            }
          } else {
            parsed = { success: false, error: trimmedRaw };
          }
        }
        if (!lookupResponse.ok || !parsed?.success) {
          const fallbackError =
            lookupResponse.status === 404 ? 'Recipient not found' : 'Failed to lookup recipient';
          setTransferRecipient(null);
          setTransferLookupError(parsed?.error || fallbackError);
          return;
        }
        const user = parsed?.data?.user;
        setTransferRecipient(user || null);
        setTransferLookupError(null);
      } catch (error) {
        console.error('Recipient lookup failed:', error);
        setTransferRecipient(null);
        setTransferLookupError('Failed to lookup recipient');
      } finally {
        setTransferLookupLoading(false);
      }
    }, 450);

    return () => clearTimeout(timeout);
  }, [transferPhoneNumber]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'SUCCESS':
      case 'APPROVED':
        return 'text-green-400 bg-green-400/10';
      case 'PENDING':
      case 'PENDING_PAYMENT':
      case 'PENDING_APPROVAL':
      case 'PROCESSING':
        return 'text-yellow-400 bg-yellow-400/10';
      case 'FAILED':
      case 'REJECTED':
        return 'text-red-400 bg-red-400/10';
      default:
        return 'text-gray-400 bg-gray-400/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'COMPLETED':
      case 'SUCCESS':
      case 'APPROVED':
        return <CheckCircle className="w-4 h-4" />;
      case 'PENDING':
      case 'PENDING_PAYMENT':
      case 'PENDING_APPROVAL':
      case 'PROCESSING':
        return <Clock className="w-4 h-4" />;
      case 'FAILED':
      case 'REJECTED':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getTransactionIcon = (type: string) => {
    switch (type) {
      case 'DEPOSIT':
        return <ArrowDownLeft className="w-5 h-5 text-green-400" />;
      case 'WITHDRAWAL':
        return <ArrowUpRight className="w-5 h-5 text-red-400" />;
      case 'TOURNAMENT_ENTRY':
      case 'TOURNAMENT_FEE':
        return <Minus className="w-5 h-5 text-orange-400" />;
      case 'WINNINGS':
        return <TrendingUp className="w-5 h-5 text-purple-400" />;
      case 'TRANSFER_SENT':
        return <Send className="w-5 h-5 text-blue-400" />;
      case 'TRANSFER_RECEIVED':
        return <Download className="w-5 h-5 text-green-400" />;
      default:
        return <Wallet className="w-5 h-5 text-gray-400" />;
    }
  };

  const buildInstructionLines = (template?: string) => {
    if (!template) return [];
    const lipaValue = providerDetails?.lipaNumber || 'lipa namba';
    const amountValue =
      totalPayable > 0
        ? totalPayable.toLocaleString()
        : hasDepositAmount
        ? parsedDepositAmount.toLocaleString()
        : 'kiasi';
    return template
      .replace(/{lipanumber}/gi, lipaValue)
      .replace(/{amount}/gi, amountValue)
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  };

  const instructionLines = buildInstructionLines(providerDetails?.instructions);

  if (pageLoading) {
    return <PageLoader label="Loading wallet…" />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.12),_transparent_55%),radial-gradient(circle_at_20%_30%,_rgba(16,185,129,0.12),_transparent_55%),linear-gradient(180deg,_#0a0f1b_0%,_#070a13_50%,_#06080f_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Wallet Control</p>
              <h1 className="mt-2 text-4xl font-semibold">Enterprise Wallet</h1>
              <p className="mt-2 text-sm text-white/70">
                Track balances, manage transfers, and reconcile transactions in real time.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">Instant Transfers</span>
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-200">Mobile Money Ready</span>
            </div>
          </div>
        </header>

        <Card className="bg-white/5 border-white/10">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-white">Available Balance</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowBalance(!showBalance)}
                className="text-white/70 hover:text-white"
              >
                {showBalance ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-baseline space-x-2">
              <span className="text-2xl font-semibold text-white/80">Tsh</span>
              <span className={`text-5xl font-bold ${showBalance ? 'text-white' : 'blur-sm text-white/50'}`}>
                {showBalance ? balance.toLocaleString() : '••••'}
              </span>
            </div>
            <div className="flex flex-wrap gap-4 text-xs text-white/60">
              <span>
                Revenue balance:{' '}
                <span className={showBalance ? 'text-white' : 'blur-sm text-white/50'}>
                  {showBalance ? `Tsh ${revenueBalance.toLocaleString()}` : '••••'}
                </span>
              </span>
              <span>
                Deposit balance:{' '}
                <span className={showBalance ? 'text-white' : 'blur-sm text-white/50'}>
                  {showBalance ? `Tsh ${depositBalance.toLocaleString()}` : '••••'}
                </span>
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <p className="text-white/50">Receive Number</p>
                <p className="mt-1 text-sm font-semibold">
                  {session?.user?.phoneNumber || 'Not set'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <p className="text-white/50">Wallet ID</p>
                <p className="mt-1 text-sm font-semibold break-all">
                  {walletId || '—'}
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs">
                <p className="text-white/50">Status</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Badge className="bg-green-500/20 text-green-300 border-green-500/30">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </Badge>
                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                    Lipa namba enabled
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs defaultValue="transactions" className="space-y-6">
          <TabsList className="bg-white/5 border border-white/10 flex h-12 w-full flex-nowrap items-center justify-start gap-2 overflow-x-auto px-2 pr-4 snap-x snap-mandatory no-scrollbar">
            <TabsTrigger value="transactions" className="min-w-[140px] shrink-0 flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:border-white/20">
              <History className="w-4 h-4 mr-2" />
              Transactions
            </TabsTrigger>
            <TabsTrigger value="add-funds" className="min-w-[140px] shrink-0 flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:border-white/20">
              <Plus className="w-4 h-4 mr-2" />
              Add Funds
            </TabsTrigger>
            <TabsTrigger value="withdraw" className="min-w-[140px] shrink-0 flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:border-white/20">
              <Minus className="w-4 h-4 mr-2" />
              Cashout
            </TabsTrigger>
            <TabsTrigger value="transfer" className="min-w-[140px] shrink-0 flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white data-[state=active]:border-white/20">
              <Send className="w-4 h-4 mr-2" />
              Transfer
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transactions" className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle className="text-white">Transaction History</CardTitle>
                    <CardDescription className="text-white/60">
                      View your recent transactions and their status
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={async () => {
                      const token = await getAccessToken();
                      if (token) {
                        setPageLoading(true);
                        await fetchUnreadPaymentNotifications();
                        await refreshTransactions(token);
                        const balanceData = await getWalletBalance(token);
                        if (balanceData?.data?.balance !== undefined) {
                          setBalance(balanceData.data.balance);
                          if (balanceData.data.revenueBalance !== undefined) {
                            setRevenueBalance(balanceData.data.revenueBalance);
                          }
                        }
                        setPageLoading(false);
                      }
                    }}
                    className="text-white/70 hover:text-white"
                    disabled={pageLoading}
                  >
                    <RefreshCw className={`w-4 h-4 ${pageLoading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {transactionError && (
                  <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {transactionError}
                  </div>
                )}
                {transactions.length === 0 ? (
                  <div className="text-center py-12">
                    <Wallet className="w-16 h-16 text-purple-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-white mb-2">No transactions yet</h3>
                    <p className="text-white/60 mb-6">
                      Your transaction history will appear here once you start making deposits, withdrawals, or tournament entries.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="flex flex-col gap-3 rounded-lg bg-white/5 border border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="flex items-start gap-3 sm:items-center sm:gap-4">
                          {getTransactionIcon(transaction.type)}
                          <div>
                            <p className="text-white font-medium">{transaction.description}</p>
                            <p className="text-sm text-white/60">
                              {transaction.paymentMethod} • {new Date(transaction.createdAt).toLocaleDateString()}
                            </p>
                            {transaction.reference && (
                              <p className="text-xs text-white/50">Ref: {transaction.reference}</p>
                            )}
                          </div>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className={`font-bold ${
                            transaction.amount > 0 ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {transaction.amount > 0 ? '+' : ''}Tsh {Math.abs(transaction.amount).toLocaleString()}
                          </p>
                          <div className={`mt-1 inline-flex items-center space-x-1 rounded-full px-2 py-1 text-xs ${getStatusColor(transaction.status)}`}>
                            {getStatusIcon(transaction.status)}
                            <span>{normalizeDisplayStatus(transaction.status)}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="add-funds" className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Add Funds</CardTitle>
                <CardDescription className="text-white/60">
                  Enter amount and mobile number to compute fees, then select a provider
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Amount Input First - BEFORE Provider Selection */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Amount (Tsh)
                    </label>
                    <input
                      type="number"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter amount"
                      min={typeof minDepositAmount === 'number' ? minDepositAmount : 1000}
                      max={typeof maxDepositAmount === 'number' ? maxDepositAmount : 5000000}
                    />
                    <p className="text-xs text-white/60 mt-1">
                      Min 1,000 • Max 5,000,000 TSH
                    </p>
                    {amountOutOfRange && (
                      <p className="text-xs text-red-300 mt-1">
                        Please enter an amount between 1,000 and 5,000,000 TSH
                      </p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={depositPhoneNumber}
                      onChange={(e) => setDepositPhoneNumber(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="+255 7xx xxx xxx"
                    />
                  </div>
                </div>

                {/* Fee Breakdown - PROMINENT DISPLAY ABOVE PROVIDER SELECTION */}
                {hasDepositAmount && (
                  <div className="rounded-lg border border-purple-500/30 bg-gradient-to-br from-purple-500/15 to-pink-500/15 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <TrendingUp className="w-5 h-5 text-purple-300" />
                      <h3 className="text-lg font-bold text-white">Fee Computation</h3>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-base">
                        <span className="text-white/80">Amount you deposit</span>
                        <span className="font-bold text-white text-lg">
                          Tsh {parsedDepositAmount.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-base">
                        <span className="text-white/80">
                          Platform fee ({((depositFeeRate || 0) * 100).toFixed(2).replace(/\.?0+$/, '')}%)
                        </span>
                        <span className="font-bold text-yellow-300 text-lg">
                          Tsh {calculatedFee.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px bg-white/20 my-3" />
                      <div className="flex items-center justify-between text-lg font-bold">
                        <span className="text-white">Total to pay</span>
                        <span className="text-purple-300 text-xl">
                          Tsh {totalPayable.toLocaleString()}
                        </span>
                      </div>
                      <div className="mt-3 text-xs text-white/60 italic">
                        * You will receive Tsh {parsedDepositAmount.toLocaleString()} in your wallet
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">
                    Payment Provider
                  </label>
                  {providersLoading ? (
                    <div className="flex items-center space-x-2 text-white/70 text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Loading providers…</span>
                    </div>
                  ) : providersError ? (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 text-sm text-red-200 px-4 py-3">
                      {providersError}
                    </div>
                  ) : providers.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {providers.map((provider) => (
                        <Button
                          key={provider.code}
                          type="button"
                          variant={selectedProvider === provider.code ? 'default' : 'outline'}
                          className={`p-4 h-auto text-left ${
                            selectedProvider === provider.code
                              ? 'bg-linear-to-r from-purple-600 to-pink-600 border-transparent text-white'
                              : 'border-white/20 bg-white text-slate-900 hover:bg-white/90'
                          }`}
                          onClick={() => setSelectedProvider(provider.code)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{provider.name}</p>
                              <p className="text-xs opacity-75">
                                Min {provider.minAmount?.toLocaleString() || '1,000'} • Max {provider.maxAmount?.toLocaleString() || '5,000,000'} Tsh
                              </p>
                            </div>
                            {selectedProvider === provider.code && (
                              <CheckCircle className="w-5 h-5 text-white" />
                            )}
                          </div>
                        </Button>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-yellow-400/40 bg-yellow-400/10 text-sm text-yellow-100 px-4 py-3">
                      No payment providers are available right now.
                    </div>
                  )}
                </div>

                {selectedProvider && (
                  <>
                    {/* Payment Instructions */}
                    <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-5">
                      <div className="flex items-center gap-2 mb-4">
                        <Smartphone className="w-5 h-5 text-blue-300" />
                        <h3 className="text-lg font-semibold text-white">Payment Instructions</h3>
                      </div>
                      {providerDetailsLoading ? (
                        <div className="flex items-center space-x-2 text-white/70 text-sm">
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Fetching instructions…</span>
                        </div>
                      ) : providerDetails ? (
                        <div className="space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                              <p className="text-xs uppercase tracking-wide text-white/50">
                                Provider
                              </p>
                              <p className="text-lg font-semibold text-white">{providerDetails.name}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-white/50">
                                Lipa Namba
                              </p>
                              <p className="text-lg font-semibold text-purple-300">
                                {providerDetails.lipaNumber || '—'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wide text-white/50">
                                Limits
                              </p>
                              <p className="text-sm text-white">
                                {providerDetails.minAmount
                                  ? `Min ${providerDetails.minAmount.toLocaleString()}`
                                  : 'Min 1,000'}{' '}
                                •{' '}
                                {providerDetails.maxAmount
                                  ? `Max ${providerDetails.maxAmount.toLocaleString()}`
                                  : 'Max 5,000,000'}{' '}
                                Tsh
                              </p>
                            </div>
                          </div>
                          <div className="mt-4">
                            <p className="text-sm font-medium text-white mb-2">How to pay:</p>
                            {instructionLines.length > 0 ? (
                              <div className="space-y-2 text-sm text-white/90">
                                {instructionLines.map((line, idx) => (
                                  <div key={`${providerDetails.code}-instruction-${idx}`} className="flex items-start gap-2">
                                    <span className="text-blue-300 font-bold">{idx + 1}.</span>
                                    <span>{line}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm text-white/60">
                                Enter an amount to see the payment instructions.
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-white/60">
                          Select a provider and enter an amount to view instructions.
                        </div>
                      )}
                      </div>
                    </>
                  )}

                {/* Submit Button */}
                <Button
                  onClick={handleAddFunds}
                  disabled={
                    loading ||
                    !hasDepositAmount ||
                    !depositPhoneNumber ||
                    !selectedProvider ||
                    providersLoading ||
                    amountOutOfRange
                  }
                  className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-lg py-6"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Plus className="w-5 h-5 mr-2" />
                      Initiate Deposit - Pay Tsh {totalPayable.toLocaleString()}
                    </>
                  )}
                </Button>

                {/* Pending Deposits from localStorage that need confirmation */}
                {depositResult && (
                  <div className="rounded-lg p-4 bg-purple-500/10 border border-purple-500/30 text-white">
                    <div className="flex flex-col md:flex-row md:justify-between gap-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/60">
                          Reference Number
                        </p>
                        <p className="text-lg font-semibold">{depositResult.referenceNumber}</p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/60">
                          Amount to Pay
                        </p>
                        <p className="text-lg font-semibold">
                          Tsh {(depositResult.totalAmount ?? depositResult.amount)?.toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/60">
                          Amount to Wallet
                        </p>
                        <p className="text-lg font-semibold">
                          Tsh {(depositResult.amount ?? 0).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/60">
                          Platform Fee
                        </p>
                        <p className="text-lg font-semibold">
                          Tsh {(depositResult.fee ?? calculatedFee).toLocaleString()}
                        </p>
                      </div>
                      {depositResult.expiresAt && (
                        <div>
                          <p className="text-xs uppercase tracking-wide text-white/60">Expires</p>
                          <p className="text-lg font-semibold">
                            {new Date(depositResult.expiresAt).toLocaleTimeString()}
                          </p>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-3 mt-4 sm:flex-row">
                      <Button
                        onClick={() => setShowPaymentConfirmation(true)}
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                      >
                        Confirm Payment
                      </Button>
                      <Button
                        onClick={() => {
                          setDepositResult(null);
                          setDepositAmount('');
                          setDepositPhoneNumber('');
                        }}
                        className="flex-1 border-2 border-white/30 text-white bg-transparent hover:bg-red-500/20 hover:border-red-400/50 hover:text-red-200"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}

                {/* Payment Confirmation Modal */}
                {showPaymentConfirmation && depositResult && (
                  <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
                    <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                      <PaymentConfirmation
                        depositId={depositResult.depositId || ''}
                        referenceNumber={depositResult.referenceNumber}
                        provider={depositResult.provider || ''}
                        amount={depositResult.amount}
                        totalAmount={depositResult.totalAmount || depositResult.amount}
                        onConfirmed={async () => {
                          setShowPaymentConfirmation(false);
                          // Remove from localStorage
                          if (typeof window !== 'undefined' && depositResult?.referenceNumber) {
                            const pendingDeposits = JSON.parse(localStorage.getItem('pendingDeposits') || '[]');
                            const updatedDeposits = pendingDeposits.filter((dep: any) => 
                              dep.referenceNumber !== depositResult.referenceNumber
                            );
                            localStorage.setItem('pendingDeposits', JSON.stringify(updatedDeposits));
                          }
                          setDepositResult(null);
                          // Refresh transaction history
                          const token = await getAccessToken();
                          if (!token) return;
                          await refreshTransactions(token);
                        }}
                        onCancel={() => setShowPaymentConfirmation(false)}
                      />
                    </div>
                  </div>
                )}

                <div className="rounded-lg p-4 bg-white/5 border border-white/10">
                  <div className="flex items-start space-x-3">
                    <Smartphone className="w-5 h-5 text-purple-400 mt-0.5" />
                    <div>
                      <h4 className="text-white font-medium mb-1">Need help?</h4>
                      <p className="text-sm text-white/60">
                        Dial the provider&apos;s USSD code or open their app, follow the steps shown
                        above, and make sure to enter the lipa namba exactly as it appears. Keep the
                        confirmation message for faster approvals.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="withdraw" className="space-y-4">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle className="text-white">Cashout</CardTitle>
                <CardDescription className="text-white/60">
                  Cashout your winnings to your preferred payment method. All cashouts require admin approval.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Withdrawal Methods */}
                <div>
                  <label className="block text-sm font-medium text-white/70 mb-3">
                    Select Payment Method
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <button
                      type="button"
                      onClick={() => setWithdrawMethod('mpesa')}
                      className={`group relative p-4 h-auto flex flex-col items-center justify-center border-2 rounded-lg transition-all duration-200 ${
                        withdrawMethod === 'mpesa'
                          ? 'bg-linear-to-r from-purple-600 to-pink-600 border-purple-500 text-white shadow-lg'
                          : 'bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40 hover:scale-105'
                      }`}
                    >
                      <Smartphone className="w-6 h-6 mb-2 transition-transform group-hover:scale-110" />
                      <p className="font-medium text-sm">M-Pesa</p>
                      {withdrawMethod === 'mpesa' && (
                        <CheckCircle className="w-5 h-5 absolute top-2 right-2 text-white" />
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setWithdrawMethod('airtel')}
                      className={`group relative p-4 h-auto flex flex-col items-center justify-center border-2 rounded-lg transition-all duration-200 ${
                        withdrawMethod === 'airtel'
                          ? 'bg-linear-to-r from-purple-600 to-pink-600 border-purple-500 text-white shadow-lg'
                          : 'bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40 hover:scale-105'
                      }`}
                    >
                      <Smartphone className="w-6 h-6 mb-2 transition-transform group-hover:scale-110" />
                      <p className="font-medium text-sm">Airtel Money</p>
                      {withdrawMethod === 'airtel' && (
                        <CheckCircle className="w-5 h-5 absolute top-2 right-2 text-white" />
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setWithdrawMethod('tigopesa')}
                      className={`group relative p-4 h-auto flex flex-col items-center justify-center border-2 rounded-lg transition-all duration-200 ${
                        withdrawMethod === 'tigopesa'
                          ? 'bg-linear-to-r from-purple-600 to-pink-600 border-purple-500 text-white shadow-lg'
                          : 'bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40 hover:scale-105'
                      }`}
                    >
                      <Smartphone className="w-6 h-6 mb-2 transition-transform group-hover:scale-110" />
                      <p className="font-medium text-sm">Tigo Pesa</p>
                      {withdrawMethod === 'tigopesa' && (
                        <CheckCircle className="w-5 h-5 absolute top-2 right-2 text-white" />
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setWithdrawMethod('halopesa')}
                      className={`group relative p-4 h-auto flex flex-col items-center justify-center border-2 rounded-lg transition-all duration-200 ${
                        withdrawMethod === 'halopesa'
                          ? 'bg-linear-to-r from-purple-600 to-pink-600 border-purple-500 text-white shadow-lg'
                          : 'bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40 hover:scale-105'
                      }`}
                    >
                      <Smartphone className="w-6 h-6 mb-2 transition-transform group-hover:scale-110" />
                      <p className="font-medium text-sm">Halo Pesa</p>
                      {withdrawMethod === 'halopesa' && (
                        <CheckCircle className="w-5 h-5 absolute top-2 right-2 text-white" />
                      )}
                    </button>
                    
                    <button
                      type="button"
                      onClick={() => setWithdrawMethod('bank')}
                      className={`group relative p-4 h-auto flex flex-col items-center justify-center border-2 rounded-lg transition-all duration-200 ${
                        withdrawMethod === 'bank'
                          ? 'bg-linear-to-r from-purple-600 to-pink-600 border-purple-500 text-white shadow-lg'
                          : 'bg-white/5 border-white/20 text-white hover:bg-white/10 hover:border-white/40 hover:scale-105'
                      }`}
                    >
                      <Building className="w-6 h-6 mb-2 transition-transform group-hover:scale-110" />
                      <p className="font-medium text-sm">Bank Transfer</p>
                      {withdrawMethod === 'bank' && (
                        <CheckCircle className="w-5 h-5 absolute top-2 right-2 text-white" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Form */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Withdraw From
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setWithdrawSource('deposit')}
                        className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                          withdrawSource === 'deposit'
                            ? 'bg-white/10 border-white/40 text-white'
                            : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        Deposit Balance
                        <p className="mt-1 text-xs text-white/60">
                          Tsh {depositBalance.toLocaleString()}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => setWithdrawSource('revenue')}
                        className={`rounded-lg border px-4 py-3 text-sm font-medium transition ${
                          withdrawSource === 'revenue'
                            ? 'bg-white/10 border-white/40 text-white'
                            : 'bg-white/5 border-white/20 text-white/70 hover:bg-white/10'
                        }`}
                      >
                        Revenue Balance
                        <p className="mt-1 text-xs text-white/60">
                          Tsh {revenueBalance.toLocaleString()}
                        </p>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Amount (Tsh)
                    </label>
                    <input
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter amount"
                      min="5000"
                      max={availableWithdrawalBalance}
                    />
                    <p className="text-xs text-white/60 mt-1">
                      Available {withdrawSource} balance: Tsh {availableWithdrawalBalance.toLocaleString()} • Minimum: Tsh 5,000
                    </p>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      {withdrawMethod === 'bank' ? 'Bank Account Number' : 'Mobile Phone Number'}
                    </label>
                    <input
                      type={withdrawMethod === 'bank' ? 'text' : 'tel'}
                      value={withdrawPhoneNumber}
                      onChange={(e) => setWithdrawPhoneNumber(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder={withdrawMethod === 'bank' ? 'Bank account number' : '+255 7xx xxx xxx'}
                    />
                  </div>

                  {/* Fee Calculation Display */}
                  {withdrawAmount && parseFloat(withdrawAmount) >= 5000 && (
                    <div className="rounded-lg border border-white/10 bg-black/10 p-4 text-sm text-white/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span>Withdrawal amount</span>
                        <span className="font-semibold">
                          Tsh {parseFloat(withdrawAmount).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Processing fee (1%)</span>
                        <span className="font-semibold">
                          Tsh {(parseFloat(withdrawAmount) * 0.01).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px bg-white/10 my-2" />
                      <div className="flex items-center justify-between text-base font-semibold text-white">
                        <span>Total to deduct</span>
                        <span className="text-red-300">
                          Tsh {(parseFloat(withdrawAmount) * 1.01).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px bg-white/10 my-2" />
                      <div className="flex items-center space-x-2 text-xs text-yellow-300">
                        <AlertCircle className="w-3 h-3" />
                        <span>Withdrawal requires admin approval and may take 1-3 business days to process</span>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={handleWithdrawFunds}
                    disabled={
                      loading ||
                      !withdrawAmount ||
                      !withdrawPhoneNumber ||
                      parseFloat(withdrawAmount) > availableWithdrawalBalance ||
                      parseFloat(withdrawAmount) < 5000
                    }
                    className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <ArrowUpRight className="w-4 h-4 mr-2" />
                        Submit Cashout Request
                      </>
                    )}
                  </Button>
                </div>

                {/* Cashout Info */}
                <div className="rounded-lg p-4 bg-white/5 border-white/10">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
                    <div>
                      <h4 className="text-white font-medium mb-1">Cashout Information</h4>
                      <ul className="text-sm text-white/60 space-y-1">
                        <li>• Minimum cashout: Tsh 5,000</li>
                        <li>• Processing fee: 1% of cashout amount</li>
                        <li>• All cashouts require admin approval</li>
                        <li>• Processing time: 1-3 business days</li>
                        <li>• lipa namba cashouts processed instantly for mobile money</li>
                        <li>• Bank transfers may incur additional charges</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transfer" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Send Money Card */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Send Money</CardTitle>
                  <CardDescription className="text-white/60">
                    Transfer funds to another player wallet
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Recipient Phone Number
                    </label>
                    <input
                      type="tel"
                      value={transferPhoneNumber}
                      onChange={(e) => setTransferPhoneNumber(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="+255 7xx xxx xxx"
                    />
                  </div>

                  <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                    {transferLookupLoading && (
                      <div className="flex items-center gap-2 text-blue-200">
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Looking up recipient...
                      </div>
                    )}
                    {!transferLookupLoading && transferLookupError && (
                      <div className="text-red-300">{transferLookupError}</div>
                    )}
                    {!transferLookupLoading && transferRecipient && (
                      <div className="space-y-2">
                        <p className="text-xs uppercase tracking-wide text-white/40">Recipient</p>
                        <p className="text-base text-white font-semibold">
                          {transferRecipient.firstName || transferRecipient.lastName
                            ? `${transferRecipient.firstName || ''} ${transferRecipient.lastName || ''}`.trim()
                            : transferRecipient.username || 'User'}
                        </p>
                        <p className="text-xs text-white/50">{transferRecipient.phoneNumber || transferPhoneNumber}</p>
                        <label className="mt-2 flex items-center gap-2 text-xs text-white/70">
                          <input
                            type="checkbox"
                            checked={transferConfirmed}
                            onChange={(e) => setTransferConfirmed(e.target.checked)}
                            className="rounded border-white/20 bg-black/30 text-purple-500"
                          />
                          I confirm this is the correct recipient.
                        </label>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Amount (Tsh)
                    </label>
                    <input
                      type="number"
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="Enter amount"
                      min="1000"
                      max={balance}
                    />
                    <p className="text-xs text-white/60 mt-1">
                      Available balance: Tsh {balance.toLocaleString()} • Minimum: Tsh 1,000
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/70 mb-2">
                      Description (Optional)
                    </label>
                    <input
                      type="text"
                      value={transferDescription}
                      onChange={(e) => setTransferDescription(e.target.value)}
                      className="w-full p-3 rounded-lg bg-black/20 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      placeholder="e.g., Game winnings, Loan repayment"
                      maxLength={100}
                    />
                  </div>

                  <Button
                    onClick={handleTransferFunds}
                    disabled={
                      loading ||
                      !transferAmount ||
                      !transferPhoneNumber ||
                      !transferRecipient ||
                      !transferConfirmed ||
                      parseFloat(transferAmount) > balance ||
                      parseFloat(transferAmount) < 1000
                    }
                    className="w-full bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        Send Money - Tsh {transferAmount ? parseFloat(transferAmount).toLocaleString() : '0'}
                      </>
                    )}
                  </Button>

                  <div className="rounded-lg p-4 bg-white/5 border border-white/10">
                    <div className="flex items-start space-x-3">
                      <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="text-white font-medium mb-1">Transfer Information</h4>
                        <ul className="text-sm text-white/60 space-y-1">
                          <li>• Minimum transfer: Tsh 1,000</li>
                          <li>• No transaction fee for transfers</li>
                          <li>• Instant processing (no approval needed)</li>
                          <li>• Enter recipient's phone number to send money</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Receive Money Card */}
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white">Receive Money</CardTitle>
                  <CardDescription className="text-white/60">
                    Share your phone number to receive transfers
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-lg p-6 bg-gradient-to-br from-purple-500/15 to-pink-500/15 border border-purple-500/30">
                    <div className="text-center space-y-4">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-white/50 mb-2">
                          Your Mobile Money Number
                        </p>
                        <div className="flex items-center justify-center gap-3">
                          <p className="text-2xl font-bold text-white break-all">
                            {session?.user?.phoneNumber || walletId || 'Loading...'}
                          </p>
                          <Button
                            onClick={copyWalletNumber}
                            disabled={!session?.user?.phoneNumber && !walletId}
                            variant="ghost"
                            size="sm"
                            className="text-white/70 hover:text-white hover:bg-white/10"
                          >
                            {walletNumberCopied ? (
                              <Check className="w-5 h-5 text-green-400" />
                            ) : (
                              <Copy className="w-5 h-5" />
                            )}
                          </Button>
                        </div>
                        {walletNumberCopied && (
                          <p className="text-sm text-green-400">Copied to clipboard!</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg p-4 bg-white/5 border border-white/10">
                    <div className="flex items-start space-x-3">
                      <Smartphone className="w-5 h-5 text-purple-400 mt-0.5" />
                      <div>
                        <h4 className="text-white font-medium mb-1">How to Receive Money</h4>
                        <ol className="text-sm text-white/60 space-y-2 list-decimal list-inside">
                          <li>Share your phone number above with others</li>
                          <li>They can send money to your wallet using this number</li>
                          <li>Transfers are instant with no fees</li>
                          <li>Use the copy button to easily share your phone number</li>
                        </ol>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg p-4 bg-white/5 border border-white/10">
                    <div className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5" />
                      <div>
                        <h4 className="text-white font-medium mb-1">Security Tips</h4>
                        <ul className="text-sm text-white/60 space-y-1">
                          <li>• Only share your phone number with trusted people</li>
                          <li>• Verify the recipient's phone number before sending</li>
                          <li>• All transfers are recorded for your security</li>
                          <li>• Contact support if you notice any suspicious activity</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Alert Modal */}
        <AlertModal
          open={alertModal.open}
          onOpenChange={(open) => setAlertModal({ ...alertModal, open })}
          title={alertModal.title}
          message={alertModal.message}
          type={alertModal.type}
        />
      </div>
    </div>
  );
};

export default WalletPage;
