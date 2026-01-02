'use client';

import React, { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { User, Mail, CheckCircle } from 'lucide-react';
import { PageLoader } from '@/components/ui/page-loader';

const DashboardPage: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Redirect if not authenticated
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  if (status === 'loading') {
    return <PageLoader label="Loading dashboard…" />;
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-white/70">Welcome back</p>
        </div>
      </div>

        {/* Success Message */}
        {searchParams.get('message') && (
          <Alert className="bg-green-500/10 border-green-500/30 mb-6">
            <AlertDescription className="text-green-400">
              {searchParams.get('message')}
            </AlertDescription>
          </Alert>
        )}

      {/* User Info Card */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <User className="w-5 h-5 mr-2" />
                User Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-white/60 text-sm">Username</p>
                  <p className="text-white">{session.user?.username}</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm">Name</p>
                  <p className="text-white">
                    {session.user?.firstName} {session.user?.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-white/60 text-sm">Role</p>
                  <p className="text-white capitalize">{session.user?.role}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white flex items-center">
                <Mail className="w-5 h-5 mr-2" />
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-white/60 text-sm">Email</p>
                  <p className="text-white">{session.user?.email}</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm">Phone</p>
                  <p className="text-white">{session.user?.phoneNumber}</p>
                </div>
                <div>
                  <p className="text-white/60 text-sm">Verification Status</p>
                  <div className="flex items-center space-x-2">
                    {session.user?.isVerified ? (
                      <>
                        <CheckCircle className="w-4 h-4 text-green-400" />
                        <span className="text-green-400">Verified</span>
                      </>
                    ) : (
                      <>
                        <div className="w-4 h-4 rounded-full bg-yellow-400"></div>
                        <span className="text-yellow-400">Not Verified</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader>
              <CardTitle className="text-white">Authentication Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-white/60 text-sm">Session Status</p>
                  <p className="text-green-400">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      {/* Quick Actions */}
      <Card className="bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
            <CardDescription className="text-white/60">
              Common actions you can perform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Button 
                onClick={() => router.push('/profile')}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
              >
                View Profile
              </Button>
              <Button 
                onClick={() => router.push('/game')}
                 
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                Play Game
              </Button>
              <Button 
                onClick={() => router.push('/tournaments')}
                 
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                View Tournaments
              </Button>
            </div>
          </CardContent>
      </Card>
    </div>
  );
};

export default DashboardPage;
