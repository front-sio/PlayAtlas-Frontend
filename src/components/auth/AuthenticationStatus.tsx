'use client';

import React from 'react';
import { useSession } from 'next-auth/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  Clock, 
  Key, 
  RefreshCw,
  User,
  CheckCircle,
  XCircle,
  AlertCircle
} from 'lucide-react';

interface AuthenticationStatusProps {
  className?: string;
}

const AuthenticationStatus: React.FC<AuthenticationStatusProps> = ({ className = '' }) => {
  const { data: session, status } = useSession();

  const getTokenStatus = (token?: string) => {
    if (!token) return { status: 'none', color: 'destructive', text: 'No Token', icon: XCircle };
    
    try {
      // Simple JWT decode to check expiration (without verifying signature)
      const payload = JSON.parse(atob(token.split('.')[1]));
      const now = Math.floor(Date.now() / 1000);
      
      if (payload.exp > now) {
        const timeLeft = payload.exp - now;
        const hoursLeft = Math.floor(timeLeft / 3600);
        const minutesLeft = Math.floor((timeLeft % 3600) / 60);
        
        return {
          status: 'valid',
          color: 'default',
          text: `Valid (${hoursLeft}h ${minutesLeft}m)`,
          icon: CheckCircle,
          expiresIn: timeLeft
        };
      } else {
        return {
          status: 'expired',
          color: 'destructive',
          text: 'Expired',
          icon: XCircle
        };
      }
    } catch (error) {
      return {
        status: 'invalid',
        color: 'destructive',
        text: 'Invalid Format',
        icon: AlertCircle
      };
    }
  };

  const getSessionStatus = () => {
    switch (status) {
      case 'loading':
        return {
          status: 'loading',
          color: 'secondary',
          text: 'Loading...',
          icon: RefreshCw,
          description: 'Checking authentication status'
        };
      case 'authenticated':
        return {
          status: 'authenticated',
          color: 'default',
          text: 'Authenticated',
          icon: ShieldCheck,
          description: 'User is successfully authenticated'
        };
      case 'unauthenticated':
        return {
          status: 'unauthenticated',
          color: 'destructive',
          text: 'Not Authenticated',
          icon: ShieldAlert,
          description: 'User is not authenticated'
        };
      default:
        return {
          status: 'unknown',
          color: 'secondary',
          text: 'Unknown',
          icon: AlertCircle,
          description: 'Unable to determine authentication status'
        };
    }
  };

  const sessionStatus = getSessionStatus();
  const accessTokenStatus = getTokenStatus(session?.accessToken as string);

  const maskToken = (token?: string) => {
    if (!token) return '••••••••••••••••';
    const firstChars = token.substring(0, 8);
    const lastChars = token.substring(token.length - 4);
    const maskedMiddle = '•'.repeat(Math.max(0, token.length - 12));
    return `${firstChars}${maskedMiddle}${lastChars}`;
  };

  const getTokenType = (token?: string) => {
    if (!token) return 'none';
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.typ || 'JWT';
    } catch {
      return 'unknown';
    }
  };

  if (status === 'loading') {
    return (
      <Card className={`bg-gray-800/50 border-gray-700 ${className}`}>
        <CardHeader>
          <CardTitle className="text-white flex items-center">
            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
            Authentication Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center text-gray-400 py-4">
            <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin" />
            <p>Loading authentication status...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`bg-gray-800/50 border-gray-700 ${className}`}>
      <CardHeader>
        <CardTitle className="text-white flex items-center">
          <Shield className="w-5 h-5 mr-2" />
          Authentication Status
        </CardTitle>
        <CardDescription className="text-gray-400">
          Current authentication and session information
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Session Status */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Session Status</span>
            </div>
            <Badge variant={sessionStatus.color as any} className="flex items-center space-x-1">
              <sessionStatus.icon className="w-3 h-3" />
              <span>{sessionStatus.text}</span>
            </Badge>
          </div>
          {sessionStatus.description && (
            <p className="text-xs text-gray-400 ml-6">{sessionStatus.description}</p>
          )}
        </div>

        {/* User Information */}
        {session?.user && (
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <User className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">User Information</span>
            </div>
            <div className="ml-6 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Username:</span>
                <span className="text-xs text-white">{session.user.username}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Email:</span>
                <span className="text-xs text-white">{session.user.email}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Role:</span>
                <Badge  className="text-xs">
                  {session.user.role}
                </Badge>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Verified:</span>
                <Badge variant={session.user.isVerified ? "default" : "secondary"} className="text-xs">
                  {session.user.isVerified ? "Verified" : "Not Verified"}
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Access Token */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Key className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-gray-300">Access Token</span>
            </div>
            <Badge variant={accessTokenStatus.color as any} className="flex items-center space-x-1">
              <accessTokenStatus.icon className="w-3 h-3" />
              <span>{accessTokenStatus.text}</span>
            </Badge>
          </div>
          {session?.accessToken && (
            <div className="ml-6 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Type:</span>
                <span className="text-xs text-white">{getTokenType(session.accessToken)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Token:</span>
                <span className="text-xs text-white font-mono break-all max-w-[200px]">
                  {maskToken(session.accessToken)}
                </span>
              </div>
              {accessTokenStatus.expiresIn && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Expires in:</span>
                  <span className="text-xs text-white">
                    {Math.floor(accessTokenStatus.expiresIn / 60)} minutes
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Last Updated */}
        <div className="pt-4 border-t border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-400">Last Updated</span>
            </div>
            <span className="text-xs text-gray-300">
              {new Date().toLocaleString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default AuthenticationStatus;
