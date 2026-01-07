'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canCreateTournaments, canViewTournaments, canManageTournaments } from '@/lib/permissions';

interface Tournament {
  tournamentId: string;
  name: string;
  entryFee: number;
  currentPlayers?: number;
  maxPlayers: number;
  status: string;
  stage?: string;
  startTime?: string;
  createdAt?: string;
}

interface TournamentStats {
  totalTournaments?: number;
  totalPlayers?: number;
  activeSeasons?: number;
  statusCounts?: Record<string, number>;
}

interface TournamentSeason {
  seasonId: string;
  seasonNumber: number;
  name?: string | null;
  status: string;
  startTime?: string | null;
  endTime?: string | null;
  playerCount?: number;
  tournamentPlayers?: { playerId: string }[];
  matches?: Match[];
}

interface Match {
  matchId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  status: string;
  roundNumber?: number | null;
  scheduledTime?: string | null;
}

interface TournamentOverview {
  seasons: TournamentSeason[];
  matches: Match[];
  matchStatusCounts: Record<string, number>;
  totalMatches: number;
  activeMatches: number;
  inProgressMatches: number;
}

export default function AdminTournamentsPage() {
  const { data: session, status } = useSession();
  const token = (session as any)?.accessToken;
  const role = (session?.user as any)?.role;
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [stats, setStats] = useState<TournamentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<TournamentOverview | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState('');
  const [selectedTournamentId, setSelectedTournamentId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    description: '',
    entryFee: '',
    maxPlayers: '',
    startTime: '',
    seasonDuration: '',
  });

  useEffect(() => {
    if (!canViewTournaments(role)) return;
    loadData();
  }, [token, role, statusFilter]);

  useEffect(() => {
    if (!tournaments.length) {
      setSelectedTournamentId(null);
      setOverview(null);
      return;
    }
    if (!selectedTournamentId || !tournaments.some((t) => t.tournamentId === selectedTournamentId)) {
      setSelectedTournamentId(tournaments[0].tournamentId);
    }
  }, [tournaments, selectedTournamentId]);

  useEffect(() => {
    if (!token || !selectedTournamentId) return;
    setOverviewError('');
    setOverviewLoading(true);
    adminApi
      .getTournamentOverview(token, selectedTournamentId)
      .then((result) => {
        if (result.success && result.data) {
          setOverview(result.data as TournamentOverview);
        }
      })
      .catch((err) => {
        setOverviewError(err instanceof Error ? err.message : 'Failed to load tournament overview');
      })
      .finally(() => setOverviewLoading(false));
  }, [token, selectedTournamentId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const statusParam = statusFilter === 'all' ? undefined : statusFilter;
      const [listResult, statsResult] = await Promise.all([
        token ? adminApi.getTournaments(token, statusParam, 50, 0) : Promise.resolve({ success: false }),
        token ? adminApi.getTournamentStats(token) : Promise.resolve({ success: false }),
      ]);

      if (listResult.success && listResult.data) {
        const payload = (listResult.data as any)?.data || listResult.data;
        const items = (payload as any)?.items || payload;
        setTournaments((items || []) as Tournament[]);
      }
      if (statsResult.success && statsResult.data) {
        setStats(statsResult.data as TournamentStats);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournaments');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async (tournamentId: string) => {
    if (!token) return;
    try {
      setError('');
      const result = await adminApi.cancelTournament(token, tournamentId, 'Cancelled by admin');
      if (result.success) {
        setTournaments((prev) =>
          prev.map((tournament) =>
            tournament.tournamentId === tournamentId
              ? { ...tournament, status: 'cancelled' }
              : tournament
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel tournament');
    }
  };

  const handleStart = async (tournamentId: string) => {
    if (!token) return;
    try {
      setError('');
      const result = await adminApi.startTournament(token, tournamentId);
      if (result.success) {
        const updated = (result.data as any) || {};
        setTournaments((prev) =>
          prev.map((tournament) =>
            tournament.tournamentId === tournamentId
              ? { ...tournament, status: updated.status || 'active', stage: updated.stage || tournament.stage }
              : tournament
          )
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start tournament');
    }
  };

  const handleCreateChange = (field: string, value: string) => {
    setCreateForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    try {
      setCreating(true);
      setError('');
      setSuccess('');
      const payload: Record<string, any> = {
        name: createForm.name,
        description: createForm.description,
        entryFee: Number(createForm.entryFee),
        maxPlayers: Number(createForm.maxPlayers),
      };
      if (createForm.startTime) {
        payload.startTime = new Date(createForm.startTime).toISOString();
      }
      if (createForm.seasonDuration) {
        payload.seasonDuration = Number(createForm.seasonDuration);
      }
      const result = await adminApi.createTournament(token, payload);
      if (result.success) {
        setSuccess('Tournament created successfully.');
        setCreateForm({
          name: '',
          description: '',
          entryFee: '',
          maxPlayers: '',
          startTime: '',
          seasonDuration: '',
        });
        await loadData();
      } else {
        setError(result.error || 'Failed to create tournament');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create tournament');
    } finally {
      setCreating(false);
    }
  };

  if (status === 'authenticated' && role && !canViewTournaments(role)) {
    return <AccessDenied message="You do not have permission to view tournaments." />;
  }

  const canCreate = canCreateTournaments(role);

  return (
    <div className="container mx-auto py-10 space-y-6">
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Tournament</CardTitle>
          </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
            <input
              value={createForm.name}
              onChange={(event) => handleCreateChange('name', event.target.value)}
              placeholder="Tournament name"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <input
              value={createForm.entryFee}
              onChange={(event) => handleCreateChange('entryFee', event.target.value)}
              placeholder="Entry fee (TZS)"
              type="number"
              min="0"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <input
              value={createForm.maxPlayers}
              onChange={(event) => handleCreateChange('maxPlayers', event.target.value)}
              placeholder="Max players"
              type="number"
              min="2"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              required
            />
            <input
              value={createForm.startTime}
              onChange={(event) => handleCreateChange('startTime', event.target.value)}
              type="datetime-local"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              value={createForm.seasonDuration}
              onChange={(event) => handleCreateChange('seasonDuration', event.target.value)}
              placeholder="Season duration (seconds)"
              type="number"
              min="300"
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            />
            <textarea
              value={createForm.description}
              onChange={(event) => handleCreateChange('description', event.target.value)}
              placeholder="Description (optional)"
              className="md:col-span-2 w-full rounded border border-input bg-background px-3 py-2 text-sm"
            />
            <div className="md:col-span-2">
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Tournament'}
              </Button>
            </div>
          </form>
          {success && (
            <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {success}
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Tournament Snapshot</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-muted-foreground">Total Tournaments</p>
              <p className="text-lg font-semibold">{stats.totalTournaments ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Total Players</p>
              <p className="text-lg font-semibold">{stats.totalPlayers ?? 0}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Active Seasons</p>
              <p className="text-lg font-semibold">{stats.activeSeasons ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <CardTitle>Tournaments</CardTitle>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm md:w-48"
          >
            {['all', 'upcoming', 'active', 'completed', 'cancelled'].map((status) => (
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
            <p className="text-sm text-muted-foreground">Loading tournaments...</p>
          ) : tournaments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tournaments found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Entry Fee</th>
                    <th className="px-3 py-2">Players</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Details</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {tournaments.map((tournament) => (
                    <tr
                      key={tournament.tournamentId}
                      className={`border-b last:border-0 ${selectedTournamentId === tournament.tournamentId ? 'bg-slate-50' : ''}`}
                    >
                      <td className="px-3 py-3">{tournament.name}</td>
                      <td className="px-3 py-3">TSH {Number(tournament.entryFee).toLocaleString()}</td>
                      <td className="px-3 py-3">
                        {(tournament.currentPlayers ?? 0)}/{tournament.maxPlayers}
                      </td>
                      <td className="px-3 py-3">{tournament.status}</td>
                      <td className="px-3 py-3">
                        <Button
                          size="sm"
                          variant={selectedTournamentId === tournament.tournamentId ? 'secondary' : 'outline'}
                          onClick={() => setSelectedTournamentId(tournament.tournamentId)}
                        >
                          View
                        </Button>
                      </td>
                      <td className="px-3 py-3">
                        {canManageTournaments(role) && (
                          <div className="flex flex-wrap gap-2">
                            {tournament.status === 'upcoming' && (
                              <Button size="sm" onClick={() => handleStart(tournament.tournamentId)}>
                                Start
                              </Button>
                            )}
                            {tournament.status !== 'cancelled' && (
                              <Button variant="destructive" size="sm" onClick={() => handleCancel(tournament.tournamentId)}>
                                Cancel
                              </Button>
                            )}
                          </div>
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

      {selectedTournamentId && (
        <Card>
          <CardHeader>
            <CardTitle>Tournament Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {overviewError && (
              <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
                {overviewError}
              </div>
            )}
            {overviewLoading ? (
              <p className="text-sm text-muted-foreground">Loading tournament overview...</p>
            ) : !overview ? (
              <p className="text-sm text-muted-foreground">No overview data available.</p>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Total Matches</p>
                    <p className="text-lg font-semibold">{overview.totalMatches}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Active Matches</p>
                    <p className="text-lg font-semibold">{overview.activeMatches}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                    <p className="text-lg font-semibold">{overview.inProgressMatches}</p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">Season List</p>
                  <div className="mt-2 space-y-3">
                    {overview.seasons.map((season) => (
                      <div key={season.seasonId} className="rounded border border-slate-200 bg-white p-3">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="font-medium text-slate-900">
                              {season.name || `Season ${season.seasonNumber}`}
                            </p>
                            <p className="text-xs text-slate-500">
                              Status: {season.status} • Players: {season.playerCount ?? season.tournamentPlayers?.length ?? 0}
                            </p>
                          </div>
                          <div className="text-xs text-slate-500">
                            Matches: {season.matches?.length || 0}
                          </div>
                        </div>
                        {season.tournamentPlayers?.length ? (
                          <div className="mt-2 text-xs text-slate-500">
                            Players: {season.tournamentPlayers.slice(0, 8).map((p) => p.playerId).join(', ')}
                            {season.tournamentPlayers.length > 8 ? '…' : ''}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-slate-400">No players joined.</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-slate-900">Matches In Progress</p>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Match</th>
                          <th className="px-3 py-2">Season</th>
                          <th className="px-3 py-2">Players</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Scheduled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.matches
                          .filter((match) => ['active', 'in_progress', 'in-progress', 'ready', 'matched', 'scheduled'].includes(match.status))
                          .map((match) => (
                            <tr key={match.matchId} className="border-b last:border-0">
                              <td className="px-3 py-3">{match.matchId}</td>
                              <td className="px-3 py-3">{match.seasonId || '—'}</td>
                              <td className="px-3 py-3">{match.player1Id} vs {match.player2Id}</td>
                              <td className="px-3 py-3">{match.status}</td>
                              <td className="px-3 py-3">
                                {match.scheduledTime ? new Date(match.scheduledTime).toLocaleString() : '—'}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
