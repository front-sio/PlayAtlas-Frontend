'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { agentApi, matchmakingApi } from '@/lib/apiService';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Eye, EyeOff, User, Mail, Phone, Lock, UserCheck } from 'lucide-react';

interface AgentProfile {
  agentId: string;
  userId: string;
  isActive: boolean;
}

interface Wallet {
  walletId: string;
  balance: number;
  currency: string;
}

interface AgentPlayer {
  id: string;
  playerId: string;
  createdAt?: string;
}

interface AgentPayout {
  earningsId: string;
  earningsDate: string;
  basePayAmount: number;
  revenueShareAmount: number;
  totalAmount: number;
  status: string;
  paidAt?: string;
  createdAt?: string;
  matchesCompleted: number;
}

interface AssignedMatch {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  status: string;
  scheduledTime?: string | null;
  scheduledStartAt?: string | null;
}

const isAgentRole = (role?: string) => ['agent'].includes((role || '').toLowerCase());

export default function AgentPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;

  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [players, setPlayers] = useState<AgentPlayer[]>([]);
  const [earnings, setEarnings] = useState<AgentPayout[]>([]);
  const [matches, setMatches] = useState<AssignedMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const [registerForm, setRegisterForm] = useState({
    username: '',
    email: '',
    password: '',
    phoneNumber: '',
    firstName: '',
    lastName: '',
    gender: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const totalRevenue = useMemo(
    () => earnings.reduce((sum, payout) => sum + Number(payout.totalAmount || 0), 0),
    [earnings]
  );
  const pendingRevenue = useMemo(
    () => earnings.filter((p) => p.status?.toLowerCase() !== 'paid').reduce((sum, payout) => sum + Number(payout.totalAmount || 0), 0),
    [earnings]
  );

  useEffect(() => {
    if (!token || !isAgentRole(role)) return;
    loadAll();
  }, [token, role]);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError('');

      try {
        const profileResult = await agentApi.getProfile(token);
        if (profileResult.success) {
          setProfile(profileResult.data?.agent || null);
          setWallet(profileResult.data?.wallet || null);
        } else {
          setProfile(null);
          setWallet(null);
          setError((prev) => prev || profileResult.error || 'Failed to load agent profile');
        }
      } catch (err) {
        setProfile(null);
        setWallet(null);
        setError((prev) => prev || (err instanceof Error ? err.message : 'Failed to load agent profile'));
      }

      try {
        const playersResult = await agentApi.listPlayers(token);
        if (playersResult.success && playersResult.data) {
          setPlayers(playersResult.data as AgentPlayer[]);
        } else {
          setPlayers([]);
          setError((prev) => prev || playersResult.error || 'Failed to load players');
        }
      } catch (err) {
        setPlayers([]);
        setError((prev) => prev || (err instanceof Error ? err.message : 'Failed to load players'));
      }

      try {
        const earningsResult = await agentApi.listEarnings(token);
        if (earningsResult.success && earningsResult.data) {
          setEarnings(earningsResult.data as AgentPayout[]);
        } else {
          setEarnings([]);
          setError((prev) => prev || earningsResult.error || 'Failed to load payouts');
        }
      } catch (err) {
        setEarnings([]);
        setError((prev) => prev || (err instanceof Error ? err.message : 'Failed to load payouts'));
      }

      try {
        setMatchesLoading(true);
        const matchesResult = await agentApi.listMatches(token);
        const payload = (matchesResult.data as any) || null;
        const matchList = Array.isArray(payload) ? payload : payload?.matches || [];
        if (matchesResult.success) {
          setMatches(matchList as AssignedMatch[]);
        } else {
          setMatches([]);
          setError((prev) => prev || matchesResult.error || 'Failed to load matches');
        }
      } catch (err) {
        setMatches([]);
        setError((prev) => prev || (err instanceof Error ? err.message : 'Failed to load matches'));
      } finally {
        setMatchesLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agent dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterChange = (field: string, value: string) => {
    setRegisterForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;

    // Basic form validation
    const { username, email, password, phoneNumber, firstName, lastName } = registerForm;
    if (!username.trim() || !email.trim() || !password || !phoneNumber.trim() || !firstName.trim() || !lastName.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (!registerForm.gender) {
      setError('Please select a gender.');
      return;
    }

    try {
      setRegistering(true);
      setError('');
      setSuccess('');
      const payload = {
        ...registerForm,
        username: registerForm.username.trim(),
        email: registerForm.email.trim(),
        phoneNumber: registerForm.phoneNumber.trim(),
        firstName: registerForm.firstName.trim(),
        lastName: registerForm.lastName.trim(),
        agentId: profile?.agentId || undefined,
        agentUserId: profile?.userId || undefined,
      };
      const result = await agentApi.registerPlayer(token, payload);
      if (result.success) {
        setSuccess('Player registered successfully.');
        setRegisterForm({
          username: '',
          email: '',
          password: '',
          phoneNumber: '',
          firstName: '',
          lastName: '',
          gender: '',
        });
        setShowPassword(false); // Reset password visibility
        await loadAll();
      } else {
        setError(result.error || 'Failed to register player');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register player');
    } finally {
      setRegistering(false);
    }
  };

  const handleStartMatch = async (match: AssignedMatch) => {
    if (!token) return;
    try {
      const result = await matchmakingApi.startMatch(
        match.matchId,
        { playerId: match.player1Id },
        token
      );
      if (result.success) {
        const redirectUrl = (result.data as any)?.redirectUrl || (result as any)?.redirectUrl;
        if (redirectUrl) {
          window.location.assign(redirectUrl);
        }
      } else {
        setError(result.error || 'Failed to start match');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start match');
    }
  };

  if (status === 'authenticated' && role && !isAgentRole(role)) {
    return <AccessDenied message="You do not have permission to access the agent console." />;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(circle_at_20%_30%,_rgba(59,130,246,0.12),_transparent_55%),linear-gradient(180deg,_#0a0f1b_0%,_#070a13_50%,_#06080f_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Agent Console</p>
              <h1 className="mt-2 text-3xl font-semibold">Agent Workspace</h1>
              <p className="mt-2 text-sm text-white/70">
                Register players and track your revenue. Transfers are handled from the Wallet page.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">Live revenue</span>
              <span className="rounded-full bg-blue-500/10 px-3 py-1 text-blue-200">Player onboarding</span>
            </div>
          </div>
        </header>

        {(error || success) && (
          <div
            className={`rounded border px-3 py-2 text-sm ${error
                ? 'border-red-400/30 bg-red-500/10 text-red-200'
                : 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200'
              }`}
          >
            {error || success}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="flex h-12 w-full flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-white/10 bg-white/5 px-4 snap-x snap-mandatory no-scrollbar">
            <TabsTrigger
              value="overview"
              className="min-w-[140px] flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Overview
            </TabsTrigger>
            <TabsTrigger
              value="matches"
              className="min-w-[140px] flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Matches
            </TabsTrigger>
            <TabsTrigger
              value="players"
              className="min-w-[140px] flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Players
            </TabsTrigger>
            <TabsTrigger
              value="register"
              className="min-w-[180px] flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Register Player
            </TabsTrigger>
            <TabsTrigger
              value="payouts"
              className="min-w-[140px] flex-none snap-start text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white"
            >
              Payouts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <div className="grid gap-4 lg:grid-cols-4">
              <Card className="bg-white/5 border-white/10 lg:col-span-2">
                <CardHeader>
                  <CardTitle>Agent Profile</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-white/70">
                  {loading ? (
                    <p>Loading profile...</p>
                  ) : (
                    <>
                      <p>
                        <span className="font-medium text-white">Agent ID:</span>{' '}
                        {profile?.agentId || '—'}
                      </p>
                      <p>
                        <span className="font-medium text-white">Status:</span>{' '}
                        {profile?.isActive ? 'Active' : 'Inactive'}
                      </p>
                      <p>
                        <span className="font-medium text-white">Wallet:</span>{' '}
                        {wallet?.walletId || '—'}
                      </p>
                      <p>
                        <span className="font-medium text-white">Balance:</span>{' '}
                        {wallet ? `${Number(wallet.balance).toLocaleString()} ${wallet.currency}` : '—'}
                      </p>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle>Players</CardTitle>
                </CardHeader>
                <CardContent className="text-white">
                  <p className="text-3xl font-semibold">{players.length}</p>
                  <p className="text-sm text-white/70 mt-1">Registered by you</p>
                  <div className="mt-3 space-y-1 text-xs text-white/60">
                    <p>Keep hosting matches to increase your revenue share.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle>Revenue</CardTitle>
                </CardHeader>
                <CardContent className="text-white">
                  <p className="text-3xl font-semibold">TSH {totalRevenue.toLocaleString()}</p>
                  <p className="text-sm text-white/70 mt-1">All-time earnings</p>
                  <div className="mt-3 text-xs text-white/60">
                    Pending: TSH {pendingRevenue.toLocaleString()}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="matches">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle>Assigned Matches</CardTitle>
              </CardHeader>
              <CardContent>
                {matchesLoading ? (
                  <p className="text-sm text-white/70">Loading matches...</p>
                ) : matches.length === 0 ? (
                  <p className="text-sm text-white/70">No assigned matches.</p>
                ) : (
                  <div className="space-y-3">
                    {matches.map((match) => (
                      <div
                        key={match.matchId}
                        className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1 text-sm text-white/80">
                          <p className="font-semibold">Match {match.matchId.slice(0, 8)}</p>
                          <p>Status: {match.status}</p>
                          <p>
                            Scheduled:{' '}
                            {match.scheduledStartAt || match.scheduledTime
                              ? new Date(match.scheduledStartAt || match.scheduledTime || '').toLocaleString()
                              : 'TBD'}
                          </p>
                        </div>
                        {(() => {
                          const status = String(match.status || '').toLowerCase();
                          const canStart = status === 'ready' || status === 'scheduled';
                          return (
                            <Button
                              onClick={() => handleStartMatch(match)}
                              disabled={!canStart}
                              className="w-full border-white/20 text-white hover:bg-white/10 sm:w-auto"
                            >
                              {canStart ? 'Start Match' : 'Match Unavailable'}
                            </Button>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="players">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle>Registered Players</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-white/70">
                {loading ? (
                  <p>Loading players...</p>
                ) : players.length === 0 ? (
                  <p>No players registered yet.</p>
                ) : (
                  <div className="space-y-2">
                    {players.map((player) => (
                      <div key={player.id} className="rounded border border-white/10 bg-white/5 px-3 py-2">
                        <p className="text-white">{player.playerId}</p>
                        <p className="text-xs text-white/60">
                          Registered {player.createdAt ? new Date(player.createdAt).toLocaleString() : '—'}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="register">
            <Card className="bg-white/5 border-white/10 backdrop-blur-sm">
              <CardHeader className="pb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/20 to-blue-500/20">
                    <UserCheck className="h-5 w-5 text-emerald-400" />
                  </div>
                  <div>
                    <CardTitle className="text-xl">Register New Player</CardTitle>
                    <p className="text-sm text-white/70 mt-1">Add a new player to your network</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRegister} className="space-y-6">
                  {/* Personal Information Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/90 border-b border-white/10 pb-2">
                      <User className="h-4 w-4 text-emerald-400" />
                      Personal Information
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="text-sm font-medium text-white/90">
                          First Name
                        </Label>
                        <div className="relative">
                          <Input
                            id="firstName"
                            value={registerForm.firstName}
                            onChange={(event) => handleRegisterChange('firstName', event.target.value)}
                            placeholder="Enter first name"
                            className="pl-4 bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-emerald-400 focus:ring-emerald-400/20"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="text-sm font-medium text-white/90">
                          Last Name
                        </Label>
                        <div className="relative">
                          <Input
                            id="lastName"
                            value={registerForm.lastName}
                            onChange={(event) => handleRegisterChange('lastName', event.target.value)}
                            placeholder="Enter last name"
                            className="pl-4 bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-emerald-400 focus:ring-emerald-400/20"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="gender" className="text-sm font-medium text-white/90">
                        Gender
                      </Label>
                      <Select value={registerForm.gender} onValueChange={(value) => handleRegisterChange('gender', value)}>
                        <SelectTrigger className="bg-white/5 border-white/20 text-white focus:border-emerald-400 focus:ring-emerald-400/20">
                          <SelectValue placeholder="Select gender" />
                        </SelectTrigger>
                        <SelectContent className="bg-slate-900 border-white/20">
                          <SelectItem value="male" className="text-white hover:bg-white/10">Male</SelectItem>
                          <SelectItem value="female" className="text-white hover:bg-white/10">Female</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Account Information Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-sm font-medium text-white/90 border-b border-white/10 pb-2">
                      <Mail className="h-4 w-4 text-emerald-400" />
                      Account Information
                    </div>
                    
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="username" className="text-sm font-medium text-white/90">
                          Username <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <User className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                          <Input
                            id="username"
                            value={registerForm.username}
                            onChange={(event) => handleRegisterChange('username', event.target.value)}
                            placeholder="Enter username"
                            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-emerald-400 focus:ring-emerald-400/20"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium text-white/90">
                          Email Address <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                          <Input
                            id="email"
                            type="email"
                            value={registerForm.email}
                            onChange={(event) => handleRegisterChange('email', event.target.value)}
                            placeholder="Enter email address"
                            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-emerald-400 focus:ring-emerald-400/20"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="phoneNumber" className="text-sm font-medium text-white/90">
                          Phone Number <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                          <Input
                            id="phoneNumber"
                            type="tel"
                            value={registerForm.phoneNumber}
                            onChange={(event) => handleRegisterChange('phoneNumber', event.target.value)}
                            placeholder="Enter phone number"
                            className="pl-10 bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-emerald-400 focus:ring-emerald-400/20"
                            required
                          />
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="password" className="text-sm font-medium text-white/90">
                          Temporary Password <span className="text-red-400">*</span>
                        </Label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-white/50" />
                          <Input
                            id="password"
                            type={showPassword ? "text" : "password"}
                            value={registerForm.password}
                            onChange={(event) => handleRegisterChange('password', event.target.value)}
                            placeholder="Enter temporary password"
                            className="pl-10 pr-12 bg-white/5 border-white/20 text-white placeholder:text-white/50 focus:border-emerald-400 focus:ring-emerald-400/20"
                            required
                            minLength={6}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-white/50 hover:text-white transition-colors"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                        <p className="text-xs text-white/50">Player can change this after first login</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-3 pt-4 border-t border-white/10">
                    <Button 
                      type="submit" 
                      disabled={registering} 
                      className="w-full bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white font-medium py-3 rounded-lg transition-all duration-200 shadow-lg hover:shadow-emerald-500/25"
                    >
                      {registering ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full" />
                          Creating Player Account...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <UserCheck className="h-4 w-4" />
                          Register New Player
                        </div>
                      )}
                    </Button>
                    
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
                      <p className="text-xs text-blue-200 flex items-start gap-2">
                        <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5 flex-shrink-0" />
                        Players registered here are automatically linked to your agent ID for revenue tracking and commission purposes.
                      </p>
                    </div>
                  </div>
                </form>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payouts">
            <Card className="bg-white/5 border-white/10">
              <CardHeader>
                <CardTitle>Season Payouts</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-white/70">Loading payouts...</p>
                ) : earnings.length === 0 ? (
                  <p className="text-sm text-white/70">No payouts recorded yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b border-white/10">
                        <tr className="text-left text-xs uppercase text-white/60">
                          <th className="px-3 py-2">Date</th>
                          <th className="px-3 py-2">Matches</th>
                          <th className="px-3 py-2">Base Pay</th>
                          <th className="px-3 py-2">Rev. Share</th>
                          <th className="px-3 py-2">Total</th>
                          <th className="px-3 py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {earnings.map((payout) => (
                          <tr key={payout.earningsId} className="border-b border-white/10 last:border-0">
                            <td className="px-3 py-3">{new Date(payout.earningsDate).toLocaleDateString()}</td>
                            <td className="px-3 py-3">{payout.matchesCompleted}</td>
                            <td className="px-3 py-3">TSH {Number(payout.basePayAmount).toLocaleString()}</td>
                            <td className="px-3 py-3">TSH {Number(payout.revenueShareAmount).toLocaleString()}</td>
                            <td className="px-3 py-3 font-semibold">TSH {Number(payout.totalAmount).toLocaleString()}</td>
                            <td className="px-3 py-3">
                              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${payout.status === 'PAID' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                {payout.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
