'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canManageUsers } from '@/lib/permissions';
import { useSocket } from '@/hooks/useSocket';

interface AgentUser {
  userId: string;
  username: string;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  isVerified: boolean;
  clubId?: string | null;
  createdAt?: string;
}

interface Club {
  clubId: string;
  name: string;
  locationText?: string | null;
  status?: string;
}

export default function AdminAgentsPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [agents, setAgents] = useState<AgentUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [form, setForm] = useState({
    clubId: '',
    username: '',
    email: '',
    password: '',
    phoneNumber: '',
    firstName: '',
    lastName: '',
    gender: 'male'
  });

  useEffect(() => {
    if (!token || !canManageUsers(role)) return;
    loadAgents();
  }, [token, role]);

  useEffect(() => {
    if (!token || !canManageUsers(role)) return;
    setClubsLoading(true);
    adminApi
      .getClubs(token)
      .then((result) => {
        if (result.success && result.data) {
          const payload = (result.data as any)?.data || result.data;
          setClubs((payload || []) as Club[]);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load clubs');
      })
      .finally(() => setClubsLoading(false));
  }, [token, role]);

  // Listen for real-time Socket.IO updates
  const { socket } = useSocket({ enabled: true });
  useEffect(() => {
    if (!socket) return;

    const handleUserStats = (data: any) => {
      console.log('User stats updated in agents page:', data);
      // Reload agents when user stats change (new agent created)
      if (data.totalAgents !== undefined) {
        loadAgents();
      }
    };

    socket.on('admin:user:stats', handleUserStats);

    return () => {
      socket.off('admin:user:stats', handleUserStats);
    };
  }, [socket]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const result = await adminApi.getAgents(token, 100, 0);
      if (result.success && result.data) {
        const data = result.data as any;
        setAgents(data.data || data || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    try {
      setCreating(true);
      setError('');
      const result = await adminApi.createAgent(token, form);
      if (result.success) {
        setForm({
          clubId: '',
          username: '',
          email: '',
          password: '',
          phoneNumber: '',
          firstName: '',
          lastName: '',
          gender: 'male'
        });
        await loadAgents();
      } else {
        setError(result.error || 'Failed to create agent');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agent');
    } finally {
      setCreating(false);
    }
  };

  if (status === 'authenticated' && role && !canManageUsers(role)) {
    return <AccessDenied message="You do not have permission to manage agents." />;
  }

  return (
    <div className="container mx-auto py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
            <select
              value={form.clubId}
              onChange={(event) => handleChange('clubId', event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              required
            >
              <option value="" disabled>
                {clubsLoading ? 'Loading clubs...' : 'Select club'}
              </option>
              {clubs.map((club) => (
                <option key={club.clubId} value={club.clubId}>
                  {club.name}
                </option>
              ))}
            </select>
            <Input
              value={form.username}
              onChange={(event) => handleChange('username', event.target.value)}
              placeholder="Username"
              required
            />
            <Input
              value={form.email}
              onChange={(event) => handleChange('email', event.target.value)}
              placeholder="Email"
              type="email"
              required
            />
            <Input
              value={form.password}
              onChange={(event) => handleChange('password', event.target.value)}
              placeholder="Password"
              type="password"
              required
            />
            <Input
              value={form.phoneNumber}
              onChange={(event) => handleChange('phoneNumber', event.target.value)}
              placeholder="Phone number"
              required
            />
            <Input
              value={form.firstName}
              onChange={(event) => handleChange('firstName', event.target.value)}
              placeholder="First name"
              required
            />
            <Input
              value={form.lastName}
              onChange={(event) => handleChange('lastName', event.target.value)}
              placeholder="Last name"
              required
            />
            <select
              value={form.gender}
              onChange={(event) => handleChange('gender', event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <div className="md:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Agent'}
              </Button>
            </div>
          </form>
          {error && (
            <div className="mt-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Agents</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading agents...</p>
          ) : agents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No agents found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.userId} className="border-b last:border-0">
                      <td className="px-3 py-3">{agent.firstName} {agent.lastName}</td>
                      <td className="px-3 py-3">{agent.username}</td>
                      <td className="px-3 py-3">{agent.email}</td>
                      <td className="px-3 py-3">{agent.phoneNumber}</td>
                      <td className="px-3 py-3">
                        {agent.isActive ? 'Active' : 'Inactive'} / {agent.isVerified ? 'Verified' : 'Unverified'}
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
