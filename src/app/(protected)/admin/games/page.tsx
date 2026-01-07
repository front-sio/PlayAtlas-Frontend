'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';

interface GameSession {
  sessionId: string;
  player1Id: string;
  player2Id: string;
  status: string;
  startedAt?: string;
  createdAt?: string;
}

const isAdminRole = (role?: string) =>
  [
    'admin',
    'staff',
    'manager',
    'director',
    'super_admin',
    'superuser',
    'superadmin',
    'moderator',
    'finance_manager',
    'tournament_manager',
    'game_manager',
    'game_master',
    'support'
  ]
    .includes((role || '').toLowerCase());

export default function AdminGamesPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [sessions, setSessions] = useState<GameSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('active');

  useEffect(() => {
    if (!token || !isAdminRole(role)) return;
    loadSessions(statusFilter);
  }, [token, role, statusFilter]);

  const loadSessions = async (status: string) => {
    try {
      setLoading(true);
      const statusParam = status === 'all' ? undefined : status;
      const result = await adminApi.getGameSessions(token, statusParam, 50);
      if (result.success && result.data) {
        const payload = result.data as any;
        const items = payload?.data || payload?.sessions || payload;
        setSessions(Array.isArray(items) ? items : []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (sessionId: string) => {
    try {
      const result = await adminApi.cancelGameSession(token, sessionId);
      if (result.success) {
        setSessions((prev) =>
          prev.map((session) =>
            session.sessionId === sessionId ? { ...session, status: 'cancelled' } : session
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel session');
    }
  };

  if (status === 'authenticated' && role && !isAdminRole(role)) {
    return <AccessDenied message="You do not have permission to view game sessions." />;
  }

  return (
    <div className="container mx-auto py-10">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Game Sessions</CardTitle>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm md:w-48"
          >
            {['all', 'active', 'completed', 'cancelled'].map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading sessions...</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sessions found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Session ID</th>
                    <th className="px-3 py-2">Players</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Started</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((session) => (
                    <tr key={session.sessionId} className="border-b last:border-0">
                      <td className="px-3 py-3">{session.sessionId}</td>
                      <td className="px-3 py-3">
                        {session.player1Id} vs {session.player2Id}
                      </td>
                      <td className="px-3 py-3">{session.status}</td>
                      <td className="px-3 py-3">
                        {session.startedAt ? new Date(session.startedAt).toLocaleString() : '—'}
                      </td>
                      <td className="px-3 py-3">
                        {session.status === 'active' && (
                          <Button variant="destructive" size="sm" onClick={() => handleCancel(session.sessionId)}>
                            Cancel
                          </Button>
                        )}
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
