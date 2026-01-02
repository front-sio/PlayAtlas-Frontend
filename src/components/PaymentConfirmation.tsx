'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, Smartphone, Copy, Clock } from 'lucide-react';
import { paymentApi } from '@/lib/apiService';
import { getSession } from 'next-auth/react';

interface PaymentConfirmationProps {
  depositId: string;
  referenceNumber: string;
  provider: string;
  amount: number;
  totalAmount: number;
  onConfirmed?: () => void;
  onCancel?: () => void;
}

const PaymentConfirmation: React.FC<PaymentConfirmationProps> = ({
  depositId,
  referenceNumber,
  provider,
  amount,
  totalAmount,
  onConfirmed,
  onCancel
}) => {
  const [transactionMessage, setTransactionMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!transactionMessage.trim()) {
      setError('Please enter the transaction confirmation message from your phone');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const session = await getSession();
      const token = (session as any)?.accessToken as string | undefined;
      if (!token) {
        setError('Please log in to confirm payment');
        return;
      }

      const response = await paymentApi.confirmDeposit(token, {
        referenceNumber,
        transactionMessage: transactionMessage.trim()
      });

      if (response?.success) {
        setSuccess(true);
        setTimeout(() => {
          onConfirmed?.();
        }, 2000);
      } else {
        setError(response?.message || 'Failed to confirm payment');
      }
    } catch (err: any) {
      console.error('Payment confirmation error:', err);
      setError(err?.message || 'Failed to confirm payment. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyReference = () => {
    navigator.clipboard.writeText(referenceNumber);
  };

  if (success) {
    return (
      <Card className="bg-green-500/10 border-green-500/30">
        <CardHeader>
          <CardTitle className="text-green-400 flex items-center gap-2">
            <CheckCircle className="w-5 h-5" />
            Payment Submitted for Approval
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-500 rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-white" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-green-400 mb-2">
              Thank you! Your payment has been submitted.
            </h3>
            <p className="text-green-300 mb-4">
              Our finance team will review and approve your deposit shortly. You will receive a notification once it's approved.
            </p>
            <div className="rounded-lg bg-green-500/20 p-4 text-sm text-green-200 space-y-2">
              <div className="flex items-center gap-2">
                <span className="font-medium">Reference:</span>
                <span className="font-mono">{referenceNumber}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyReference}
                  className="text-green-300 hover:text-white"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Amount:</span>
                <span>Tsh {amount.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Status:</span>
                <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">
                  <Clock className="w-3 h-3 mr-1" />
                  Pending Approval
                </Badge>
              </div>
            </div>
          </div>
          <Button
            onClick={onConfirmed}
            className="w-full bg-green-600 hover:bg-green-700"
          >
            Done
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-white/5 border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-purple-400" />
          Confirm Payment
        </CardTitle>
        <div className="text-sm text-white/60 mt-2">
          Complete the payment on your phone, then paste the confirmation message below
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Payment Summary */}
          <div className="rounded-lg bg-purple-500/10 border border-purple-500/30 p-4 space-y-3">
            <h4 className="text-sm font-medium text-purple-300 mb-3">Payment Details</h4>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Provider:</span>
              <span className="text-white font-medium">{provider}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Reference:</span>
              <div className="flex items-center gap-2">
                <span className="text-white font-mono text-sm">{referenceNumber}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={copyReference}
                  className="text-white/60 hover:text-white"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">Amount Paid:</span>
              <span className="text-white font-medium">Tsh {totalAmount.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/70">You'll Receive:</span>
              <span className="text-green-400 font-medium">Tsh {amount.toLocaleString()}</span>
            </div>
          </div>

          {/* Instructions */}
          <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 p-4">
            <h4 className="text-sm font-medium text-blue-300 mb-2">How to Confirm</h4>
            <ol className="text-sm text-blue-200 space-y-2 list-decimal list-inside">
              <li>Complete the payment using your phone's USSD code or mobile money app</li>
              <li>Copy the transaction confirmation message from your phone</li>
              <li>Paste the confirmation message in the field below</li>
              <li>Click "Submit Payment Confirmation" to send for approval</li>
            </ol>
          </div>

          {/* Transaction Message Input */}
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Transaction Confirmation Message
            </label>
            <Textarea
              value={transactionMessage}
              onChange={(e) => setTransactionMessage(e.target.value)}
              placeholder="Paste the confirmation message from your mobile money transaction here..."
              className="w-full min-h-[120px] bg-black/20 border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              required
            />
            <p className="text-xs text-white/50 mt-1">
              This should be the exact message you received from your mobile money provider after making the payment.
            </p>
          </div>

          {/* Error Display */}
          {error && (
            <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-sm font-medium text-red-300 mb-1">Confirmation Failed</h4>
                  <p className="text-sm text-red-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              type="button"
              onClick={onCancel}
              className="flex-1 border-2 border-white/30 text-white bg-transparent hover:bg-red-500/20 hover:border-red-400/50 hover:text-red-200"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              disabled={isSubmitting || !transactionMessage.trim()}
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 mr-2 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Submit Payment Confirmation
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default PaymentConfirmation;
