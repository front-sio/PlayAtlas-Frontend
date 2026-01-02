'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import { agentApi } from '@/lib/apiService';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

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
  payoutId: string;
  seasonId: string;
  playerCount: number;
  amount: number;
  status: string;
  paidAt?: string;
  createdAt?: string;
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
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [registerForm, setRegisterForm] = useState({
    username: '',
    email: '',
    password: '',
    phoneNumber: '',
    firstName: '',
    lastName: '',
    gender: '',
  });
  const [transferForm, setTransferForm] = useState({
    phoneNumber: '',
    amount: '',
  });
  const [recipientInfo, setRecipientInfo] = useState<{ username?: string; userId?: string } | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  useEffect(() => {
    if (!token || !isAgentRole(role)) return;
    loadAll();
  }, [token, role]);

  const loadAll = async () => {
    try {
      setLoading(true);
      const [profileResult, playersResult, earningsResult] = await Promise.all([
        agentApi.getProfile(token),
        agentApi.listPlayers(token),
        agentApi.listEarnings(token),
      ]);

      if (profileResult.success) {
        setProfile(profileResult.data?.agent || null);
        setWallet(profileResult.data?.wallet || null);
      }
      if (playersResult.success && playersResult.data) {
        setPlayers(playersResult.data as AgentPlayer[]);
      }
      if (earningsResult.success && earningsResult.data) {
        setEarnings(earningsResult.data as AgentPayout[]);
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

  const handleTransferChange = (field: string, value: string) => {
    setTransferForm((prev) => ({ ...prev, [field]: value }));
    setRecipientInfo(null); // Clear recipient info when form changes
  };

  const handlePhoneLookup = async () => {
    if (!transferForm.phoneNumber || !token) return;
    
    setLookingUp(true);
    setRecipientInfo(null);
    setError('');
    
    try {
      const result = await agentApi.lookupRecipient(token, transferForm.phoneNumber);
      if (result.success && result.data) {
        setRecipientInfo({
          username: result.data.username,
          userId: result.data.userId
        });
      } else {
        setError(result.error || 'Recipient not found');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to lookup recipient');
    } finally {
      setLookingUp(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    try {
      setRegistering(true);
      setError('');
      setSuccess('');
      const result = await agentApi.registerPlayer(token, registerForm);
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

  const handleTransfer = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    try {
      setTransferring(true);
      setError('');
      setSuccess('');
      const amountNumber = Number(transferForm.amount);
      const result = await agentApi.transferFloat(token, {
        phoneNumber: transferForm.phoneNumber,
        amount: amountNumber,
      });
      if (result.success) {
        setSuccess('Float transferred successfully.');
        setTransferForm({ phoneNumber: '', amount: '' });
        setRecipientInfo(null);
        await loadAll();
      } else {
        setError(result.error || 'Failed to transfer float');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transfer float');
    } finally {
      setTransferring(false);
    }
  };

  if (status === 'authenticated' && role && !isAgentRole(role)) {
    return <AccessDenied message="You do not have permission to access the agent console." />;
  }

  return (
    <div className="container mx-auto space-y-6 py-10 text-white">
      <div>
        <h1 className="text-2xl font-semibold">Agent Console</h1>
        <p className="text-sm text-white/70">
          Register players, transfer float, and track seasonal payouts.
        </p>
      </div>

      {(error || success) && (
        <div
          className={`rounded border px-3 py-2 text-sm ${
            error
              ? 'border-red-400/30 bg-red-500/10 text-red-200'
              : 'border-emerald-300/30 bg-emerald-500/10 text-emerald-200'
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-white/5 border-white/10">
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

        <Card className="lg:col-span-2 bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle>Register Player</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleRegister}>
              <Input
                value={registerForm.username}
                onChange={(event) => handleRegisterChange('username', event.target.value)}
                placeholder="Username"
                required
              />
              <Input
                value={registerForm.email}
                onChange={(event) => handleRegisterChange('email', event.target.value)}
                placeholder="Email"
                type="email"
                required
              />
              <Input
                value={registerForm.phoneNumber}
                onChange={(event) => handleRegisterChange('phoneNumber', event.target.value)}
                placeholder="Phone number"
                required
              />
              <Input
                value={registerForm.password}
                onChange={(event) => handleRegisterChange('password', event.target.value)}
                placeholder="Temporary password"
                type="password"
                required
              />
              <Input
                value={registerForm.firstName}
                onChange={(event) => handleRegisterChange('firstName', event.target.value)}
                placeholder="First name"
              />
              <Input
                value={registerForm.lastName}
                onChange={(event) => handleRegisterChange('lastName', event.target.value)}
                placeholder="Last name"
              />
              <select
                value={registerForm.gender}
                onChange={(event) => handleRegisterChange('gender', event.target.value)}
                className="rounded border border-white/10 bg-black/30 px-3 py-2 text-sm text-white md:col-span-2"
              >
                <option value="">Select gender (optional)</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
              <div className="md:col-span-2">
                <Button type="submit" disabled={registering} className="w-full">
                  {registering ? 'Registering...' : 'Register Player'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle>Transfer Float</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-3 md:grid-cols-2" onSubmit={handleTransfer}>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-white/60">Recipient Phone Number</label>
                <div className="flex gap-2">
                  <Input
                    value={transferForm.phoneNumber}
                    onChange={(event) => handleTransferChange('phoneNumber', event.target.value)}
                    placeholder="e.g., +255123456789"
                    className="flex-1"
                    type="tel"
                    required
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handlePhoneLookup}
                    disabled={lookingUp || !transferForm.phoneNumber}
                    className="px-3"
                  >
                    {lookingUp ? '...' : 'Lookup'}
                  </Button>
                </div>
                {recipientInfo && (
                  <div className="mt-2 rounded bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                    Found: {recipientInfo.username} (ID: {recipientInfo.userId})
                  </div>
                )}
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs text-white/60">Amount (TZS)</label>
                <Input
                  value={transferForm.amount}
                  onChange={(event) => handleTransferChange('amount', event.target.value)}
                  placeholder="Enter amount"
                  type="number"
                  min="0"
                  step="100"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <Button 
                  type="submit" 
                  disabled={transferring || !recipientInfo} 
                  className="w-full"
                >
                  {transferring ? 'Transferring...' : 'Transfer Float'}
                </Button>
              </div>
            </form>
            <p className="mt-3 text-xs text-white/60">
              Enter recipient's phone number to look them up, then transfer float. Seasonal payouts are automated at TZS 200 per registered player who joins a season.
            </p>
          </CardContent>
        </Card>

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
      </div>

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
                    <th className="px-3 py-2">Season</th>
                    <th className="px-3 py-2">Players</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Paid At</th>
                  </tr>
                </thead>
                <tbody>
                  {earnings.map((payout) => (
                    <tr key={payout.payoutId} className="border-b border-white/10 last:border-0">
                      <td className="px-3 py-3">{payout.seasonId}</td>
                      <td className="px-3 py-3">{payout.playerCount}</td>
                      <td className="px-3 py-3">TSH {Number(payout.amount).toLocaleString()}</td>
                      <td className="px-3 py-3">{payout.status}</td>
                      <td className="px-3 py-3">
                        {payout.paidAt ? new Date(payout.paidAt).toLocaleString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
