'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, getSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Trophy, Eye, EyeOff, Mail, Lock, ArrowLeft } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [formData, setFormData] = useState({
    identifier: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingVerification, setPendingVerification] = useState<{ userId: string; channel: string } | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    // Enhanced logging for debugging
    console.log('🔐 Login attempt started:', {
      identifier: formData.identifier,
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent
    });

    try {
      console.log('📡 Calling signIn with credentials:', {
        identifier: formData.identifier,
        passwordLength: formData.password.length,
        redirect: false
      });

      const result = await signIn('credentials', {
        identifier: formData.identifier,
        password: formData.password,
        redirect: false,
      });

      console.log('📥 signIn result:', {
        ok: result?.ok,
        error: result?.error,
        status: result?.status,
        url: result?.url
      });

      if (result?.error) {
        console.log('❌ Login failed with error:', result.error);
        
        if (result.error.startsWith('ACCOUNT_NOT_VERIFIED')) {
          const [, userId = '', channel = 'email'] = result.error.split(':');
          setPendingVerification({ userId, channel });
          setError(`Please verify your ${channel === 'sms' ? 'phone' : 'email'} to continue. Check your ${channel === 'sms' ? 'SMS messages' : 'inbox'} for the verification code.`);
          if (typeof window !== 'undefined' && userId) {
            sessionStorage.setItem('pendingVerification', JSON.stringify({ userId, channel }));
          }
        } else if (result.error.includes('CredentialsSignin')) {
          setError('Invalid credentials. Please check your email/username/phone and password.');
        } else {
          setError('Login failed. Please try again.');
        }
      } else if (result?.ok) {
        console.log('✅ Login successful, checking session...');
        
        try {
          // Add a small delay to ensure session is properly set
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Check if user needs verification
          const session = await getSession();
          console.log('👤 Session data:', {
            hasSession: !!session,
            hasUser: !!session?.user,
            isVerified: session?.user?.isVerified,
            userId: session?.user?.userId,
            fullSession: session
          });
          
          if (!session) {
            console.log('❌ No session found after successful login');
            setError('Login succeeded but no session was created. Please try again.');
            return;
          }
          
          if (session?.user?.isVerified === false) {
            console.log('📧 Redirecting to email verification...');
            router.push('/auth/verify-email');
          } else {
            console.log('🏠 Redirecting to dashboard...');
            router.push('/dashboard');
          }
        } catch (sessionError) {
          console.error('💥 Session error:', {
            error: sessionError,
            message: sessionError instanceof Error ? sessionError.message : 'Unknown error',
            stack: sessionError instanceof Error ? sessionError.stack : undefined
          });
          setError('Failed to get user session. Please try again.');
        }
      } else {
        console.log('❓ Unexpected signIn result:', result);
        setError('Login failed. Please try again.');
      }
    } catch (err) {
      console.error('💥 Login error caught:', {
        error: err,
        message: err instanceof Error ? err.message : 'Unknown error',
        stack: err instanceof Error ? err.stack : undefined
      });
      setError('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
      console.log('🏁 Login attempt completed');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-r from-cyan-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
            <Trophy className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">PlayAtlas</h1>
          <p className="text-purple-200">Sign in to your account</p>
        </div>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">Welcome Back</CardTitle>
            <CardDescription className="text-gray-400">
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            {searchParams.get('message') && (
              <Alert className="bg-green-500/10 border-green-500/30 mb-4">
                <AlertDescription className="text-green-400">
                  {searchParams.get('message')}
                </AlertDescription>
              </Alert>
            )}
            
            {error && (
              <Alert className="bg-red-500/10 border-red-500/30 mb-4">
                <AlertDescription className="text-red-400">
                  {error}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-white">Email, Username, or Phone</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    id="identifier"
                    name="identifier"
                    type="text"
                    placeholder="Enter your email, username, or phone"
                    value={formData.identifier}
                    onChange={handleChange}
                    className="pl-10 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Enter your password"
                    value={formData.password}
                    onChange={handleChange}
                    className="pl-10 pr-10 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3 text-gray-400 hover:text-white"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-sm text-gray-300">Remember me</span>
                </label>
                <Link href="/auth/forgot-password" className="text-sm text-purple-400 hover:text-purple-300">
                  Forgot password?
                </Link>
              </div>

              <Button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                {isLoading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>

            {pendingVerification?.userId && (
              <div className="mt-4 text-center">
                <Button
                  type="button"
                  onClick={() =>
                    router.push(
                      `/auth/verify-email?userId=${encodeURIComponent(pendingVerification.userId)}&channel=${encodeURIComponent(
                        pendingVerification.channel
                      )}`
                    )
                  }
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  Verify now
                </Button>
              </div>
            )}

            <div className="mt-6 text-center">
              <p className="text-gray-400">
                Don't have an account?{' '}
                <Link href="/auth/register" className="text-purple-400 hover:text-purple-300">
                  Sign up
                </Link>
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 text-center">
          <Link href="/" className="inline-flex items-center text-purple-400 hover:text-purple-300">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
