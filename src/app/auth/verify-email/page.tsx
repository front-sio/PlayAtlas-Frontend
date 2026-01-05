'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trophy, Mail, ArrowLeft, CheckCircle } from 'lucide-react';
import { authApi } from '@/lib/apiService';

const VerifyEmailPage: React.FC = () => {
  const [code, setCode] = useState('');
  const [userId, setUserId] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [resendSuccess, setResendSuccess] = useState('');
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const paramUserId = searchParams.get('userId');
    const paramChannel = searchParams.get('channel');
    let resolvedUserId = paramUserId || '';
    let resolvedChannel: 'email' | 'sms' = paramChannel === 'sms' ? 'sms' : 'email';

    if (!resolvedUserId && typeof window !== 'undefined') {
      const stored = sessionStorage.getItem('pendingVerification');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          resolvedUserId = parsed.userId || resolvedUserId;
          if (parsed.channel === 'sms') resolvedChannel = 'sms';
        } catch {
          // ignore malformed storage
        }
      }
    }

    setUserId(resolvedUserId);
    setChannel(resolvedChannel);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    if (!userId) {
      setError('User ID not found. Please register or login again.');
      setIsLoading(false);
      return;
    }

    try {
      const result = await authApi.verifyEmail({
        userId,
        code: code.trim()
      });

      if (result.success) {
        const { user } = result.data;
        
        // Clear pending verification data
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('pendingVerification');
          
          // Store verified user data temporarily
          sessionStorage.setItem('verifiedUser', JSON.stringify(user));
        }

        setSuccess(true);
        
        // Redirect to login after successful verification
        // User will need to log in with their credentials to get a proper session
        setTimeout(() => {
          router.push('/auth/login?message=Account verified successfully. Please log in.');
        }, 2000);
      } else {
        setError(result.error || 'Verification failed. Please try again.');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!userId) {
      setError('User ID not found. Please register or login again.');
      return;
    }

    setIsResending(true);
    setError('');
    setResendSuccess('');

    try {
      const verificationChannel: 'email' | 'sms' = channel === 'sms' ? 'sms' : 'email';
      const result = await authApi.resendVerificationCode(userId, verificationChannel);
      
      if (result.success) {
        setResendSuccess(
          `Verification code sent successfully. Please check your ${channel === 'sms' ? 'SMS messages' : 'email'}.`
        );
      } else {
        setError(result.error || 'Failed to resend verification code.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to resend verification code.');
    } finally {
      setIsResending(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader className="text-center">
              <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-white" />
              </div>
              <CardTitle className="text-white">Verified!</CardTitle>
              <CardDescription className="text-gray-400">
                Your account has been successfully verified.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-center text-gray-300 mb-4">
                Redirecting you to your dashboard...
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">PlayAtlas</h1>
          <p className="text-purple-200">Verify your account</p>
        </div>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Verification</CardTitle>
            <CardDescription className="text-gray-400">
              Enter the verification code sent to your {channel === 'sms' ? 'phone' : 'email'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert className="bg-red-500/10 border-red-500/30 mb-4">
                <AlertDescription className="text-red-400">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            {resendSuccess && (
              <Alert className="bg-green-500/10 border-green-500/30 mb-4">
                <AlertDescription className="text-green-400">
                  {resendSuccess}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="channel" className="text-white">Verification Channel</Label>
                <select
                  id="channel"
                  name="channel"
                  value={channel}
                  onChange={(e) => setChannel(e.target.value === 'sms' ? 'sms' : 'email')}
                  className="w-full px-3 py-2 bg-gray-700/50 border-gray-600 text-white rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                >
                  <option value="email">Email</option>
                  <option value="sms">SMS</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-white">Verification Code</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    id="code"
                    name="code"
                    type="text"
                    placeholder="Enter 6-digit code"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="pl-10 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                    maxLength={6}
                    required
                  />
                </div>
                <p className="text-sm text-gray-400">
                  Check your {channel === 'sms' ? 'SMS messages' : 'email'} for the verification code
                </p>
              </div>

              <Button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {isLoading ? 'Verifying...' : 'Verify Account'}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-gray-400 mb-2">
                Didn't receive the code?
              </p>
              <Button
                type="button"
                
                onClick={handleResendCode}
                disabled={isResending}
                className="border-gray-600 text-gray-300 hover:bg-gray-700"
              >
                {isResending ? 'Resending...' : 'Resend Code'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Link href="/auth/login" className="inline-flex items-center text-purple-400 hover:text-purple-300 mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmailPage;
