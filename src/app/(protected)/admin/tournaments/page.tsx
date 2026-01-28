'use client';

import React, { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { adminApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccessDenied } from '@/components/admin/AccessDenied';
import { canCreateTournaments, canViewTournaments, canManageTournaments } from '@/lib/permissions';
import { GAME_CATEGORY_OPTIONS, getGameCategoryLabel } from '@/lib/gameCategories';

interface Tournament {
  tournamentId: string;
  name: string;
  entryFee: number;
  currentPlayers?: number;
  maxPlayers: number;
  gameCategory?: string | null;
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

interface Club {
  clubId: string;
  name: string;
  locationText?: string | null;
  status?: string;
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
  assignedHostPlayerUserId?: string | null;
  verificationStatus?: string | null;
  verifiedAt?: string | null;
}

interface TournamentOverview {
  seasons: TournamentSeason[];
  matches: Match[];
  matchStatusCounts: Record<string, number>;
  totalMatches: number;
  activeMatches: number;
  inProgressMatches: number;
}

const computeAiDifficulty = (entryFeeValue: string) => {
  const entryFee = Number(entryFeeValue || 0);
  if (!entryFee) return '5';
  const level = Math.max(1, Math.ceil(entryFee / 1000));
  const scaled = level * 5;
  const clamped = Math.max(1, Math.min(50, scaled));
  return String(clamped);
};

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
  const [gameCategoryFilter, setGameCategoryFilter] = useState('all');
  const [verificationFilter, setVerificationFilter] = useState('all');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    clubId: '',
    name: '',
    description: '',
    entryFee: '',
    maxPlayers: '',
    startTime: '',
    seasonDuration: '',
    gameType: 'multiplayer',
    gameCategory: 'BILLIARDS',
    aiDifficulty: '5',
  });
  const [aiDifficultyTouched, setAiDifficultyTouched] = useState(false);
  const [clubs, setClubs] = useState<Club[]>([]);
  const [clubsLoading, setClubsLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'stop' | 'resume';
    tournament: Tournament;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [editingTournament, setEditingTournament] = useState<Tournament | null>(null);
  const [updateForm, setUpdateForm] = useState({
    name: '',
    entryFee: '',
    maxPlayers: '',
    startTime: '',
  });
  const [updateLoading, setUpdateLoading] = useState(false);
  const [updateError, setUpdateError] = useState('');
  const [updateSuccess, setUpdateSuccess] = useState('');

  useEffect(() => {
    if (!canViewTournaments(role)) return;
    loadData();
  }, [token, role, statusFilter, gameCategoryFilter]);

  useEffect(() => {
    if (!token || !canCreateTournaments(role)) return;
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
      const categoryParam = gameCategoryFilter === 'all' ? undefined : gameCategoryFilter;
      const [listResult, statsResult] = await Promise.all([
        token ? adminApi.getTournaments(token, statusParam, 50, 0, categoryParam) : Promise.resolve({ success: false }),
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

  const handleStop = async (tournamentId: string) => {
    if (!token) return;
    try {
      setError('');
      setSuccess('');
      const result = await adminApi.stopTournament(token, tournamentId);
      if (result.success) {
        const updated = (result.data as any) || {};
        setTournaments((prev) =>
          prev.map((tournament) =>
            tournament.tournamentId === tournamentId
              ? { ...tournament, status: updated.status || 'stopped', stage: updated.stage || tournament.stage }
              : tournament
          )
        );
        setSuccess('Tournament stopped.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop tournament');
    }
  };

  const handleResume = async (tournamentId: string) => {
    if (!token) return;
    try {
      setError('');
      setSuccess('');
      const result = await adminApi.resumeTournament(token, tournamentId);
      if (result.success) {
        const updated = (result.data as any) || {};
        setTournaments((prev) =>
          prev.map((tournament) =>
            tournament.tournamentId === tournamentId
              ? { ...tournament, status: updated.status || 'active', stage: updated.stage || tournament.stage }
              : tournament
          )
        );
        setSuccess('Tournament resumed.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume tournament');
    }
  };

  const handleCreateChange = (field: string, value: string) => {
    setCreateForm((prev) => {
      if (field === 'gameType' && value === 'with_ai') {
        const aiDifficulty = computeAiDifficulty(prev.entryFee);
        setAiDifficultyTouched(false);
        return { ...prev, gameType: value, maxPlayers: '2', aiDifficulty };
      }
      if (field === 'gameType' && value !== 'with_ai') {
        setAiDifficultyTouched(false);
        return { ...prev, gameType: value };
      }
      if (field === 'entryFee') {
        const next = { ...prev, entryFee: value };
        if (prev.gameType === 'with_ai' && !aiDifficultyTouched) {
          next.aiDifficulty = computeAiDifficulty(value);
        }
        return next;
      }
      if (field === 'aiDifficulty') {
        setAiDifficultyTouched(true);
      }
      return { ...prev, [field]: value };
    });
  };

  const handleCreate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) return;
    try {
      setCreating(true);
      setError('');
      setSuccess('');
      const payload: Record<string, any> = {
        clubId: createForm.clubId,
        name: createForm.name,
        description: createForm.description,
        entryFee: Number(createForm.entryFee),
        maxPlayers: Number(createForm.maxPlayers),
        gameType: createForm.gameType,
        gameCategory: createForm.gameCategory
      };
      if (createForm.gameType === 'with_ai') {
        payload.maxPlayers = 2;
        payload.aiDifficulty = Number(createForm.aiDifficulty);
      }
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
          clubId: '',
          name: '',
          description: '',
          entryFee: '',
          maxPlayers: '',
          startTime: '',
          seasonDuration: '',
          gameType: 'multiplayer',
          gameCategory: 'BILLIARDS',
          aiDifficulty: '5',
        });
        setAiDifficultyTouched(false);
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
  const selectedTournament = tournaments.find((t) => t.tournamentId === selectedTournamentId) || null;
  const isAiTournament = createForm.gameType === 'with_ai';
  const confirmTitle = confirmAction?.type === 'stop' ? 'Pause tournament?' : 'Resume tournament?';
  const confirmDescription =
    confirmAction?.type === 'stop'
      ? 'New seasons will stop until you resume this tournament.'
      : 'Season generation will continue once this tournament is resumed.';
  const confirmLabel = confirmAction?.type === 'stop' ? 'Pause Tournament' : 'Resume Tournament';

  const formatLocalDateTime = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
  };

  const handleUpdateFormChange = (field: keyof typeof updateForm, value: string) => {
    setUpdateForm((prev) => ({ ...prev, [field]: value }));
  };

  const openUpdateDialog = (tournament: Tournament) => {
    setEditingTournament(tournament);
    setUpdateForm({
      name: tournament.name,
      entryFee: tournament.entryFee != null ? String(tournament.entryFee) : '',
      maxPlayers: tournament.maxPlayers != null ? String(tournament.maxPlayers) : '',
      startTime: formatLocalDateTime(tournament.startTime),
    });
    setUpdateError('');
    setUpdateSuccess('');
    setUpdateDialogOpen(true);
  };

  const handleUpdateDialogClose = () => {
    if (updateLoading) return;
    setUpdateDialogOpen(false);
    setEditingTournament(null);
    setUpdateError('');
  };

  const handleUpdateSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !editingTournament) return;
    setUpdateLoading(true);
    setUpdateError('');
    setUpdateSuccess('');
    try {
      const payload: Record<string, any> = {
        name: updateForm.name,
        entryFee: Number(updateForm.entryFee) || 0,
      };
      if (updateForm.maxPlayers) {
        payload.maxPlayers = Number(updateForm.maxPlayers);
      }
      if (updateForm.startTime) {
        const iso = new Date(updateForm.startTime);
        if (!Number.isNaN(iso.getTime())) {
          payload.startTime = iso.toISOString();
        }
      }

      // Use the enhanced API function with automatic stop/update/resume workflow
      const result = await adminApi.updateTournamentWithWorkflow(
        token, 
        editingTournament.tournamentId, 
        payload,
        'Updating tournament settings via admin dashboard'
      );
      
      if (result.success && result.data) {
        setTournaments((prev) =>
          prev.map((tournament) =>
            tournament.tournamentId === editingTournament.tournamentId
              ? { ...tournament, ...result.data }
              : tournament
          )
        );
        
        const successMessage = result.workflowExecuted 
          ? 'Tournament updated successfully using stop → update → resume workflow'
          : 'Tournament updated successfully';
        
        setUpdateSuccess(successMessage);
        
        // Show success for 3 seconds then close dialog
        setTimeout(() => {
          handleUpdateDialogClose();
          setUpdateSuccess('');
        }, 3000);
      } else {
        setUpdateError(result.error || 'Failed to update tournament');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update tournament';
      
      // Check if this is the stop-first error and show helpful message
      if (errorMessage.includes('Stop the tournament first') || errorMessage.includes('stop → update → resume')) {
        setUpdateError(errorMessage);
      } else {
        setUpdateError(`Update failed: ${errorMessage}`);
      }
    } finally {
      setUpdateLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.type === 'stop') {
        await handleStop(confirmAction.tournament.tournamentId);
      } else {
        await handleResume(confirmAction.tournament.tournamentId);
      }
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  return (
    <div className="container mx-auto py-10 space-y-6">
      {canCreate && (
        <Card>
          <CardHeader>
            <CardTitle>Create Tournament</CardTitle>
          </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreate}>
            <select
              value={createForm.clubId}
              onChange={(event) => handleCreateChange('clubId', event.target.value)}
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
            <select
              value={createForm.gameType}
              onChange={(event) => handleCreateChange('gameType', event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="multiplayer">Multiplayer</option>
              <option value="with_ai">With AI</option>
            </select>
            <select
              value={createForm.gameCategory}
              onChange={(event) => handleCreateChange('gameCategory', event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              required
            >
              {GAME_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {getGameCategoryLabel(category)}
                </option>
              ))}
            </select>
            {isAiTournament && (
              <input
                value={createForm.aiDifficulty}
                onChange={(event) => handleCreateChange('aiDifficulty', event.target.value)}
                placeholder="AI difficulty (1-100)"
                type="number"
                min="1"
                max="100"
                className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
              />
            )}
            <input
              value={createForm.maxPlayers}
              onChange={(event) => handleCreateChange('maxPlayers', event.target.value)}
              placeholder="Max players"
              type="number"
              min="2"
              disabled={isAiTournament}
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
          <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm md:w-44"
            >
              {['all', 'upcoming', 'active', 'stopped', 'completed', 'cancelled'].map((status) => (
                <option key={status} value={status}>
                  {status.charAt(0).toUpperCase() + status.slice(1)}
                </option>
              ))}
            </select>
            <select
              value={gameCategoryFilter}
              onChange={(event) => setGameCategoryFilter(event.target.value)}
              className="w-full rounded border border-input bg-background px-3 py-2 text-sm md:w-48"
            >
              <option value="all">All games</option>
              {GAME_CATEGORY_OPTIONS.map((category) => (
                <option key={category} value={category}>
                  {getGameCategoryLabel(category)}
                </option>
              ))}
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {updateSuccess && (
            <div className="mb-4 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {updateSuccess}
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
                    <th className="px-3 py-2">Game</th>
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
                      <td className="px-3 py-3">
                        {getGameCategoryLabel(tournament.gameCategory || 'BILLIARDS')}
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
                            {tournament.status === 'active' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setConfirmAction({ type: 'stop', tournament })}
                              >
                                Stop
                              </Button>
                            )}
                            {tournament.status === 'stopped' && (
                              <Button
                                size="sm"
                                onClick={() => setConfirmAction({ type: 'resume', tournament })}
                              >
                                Resume
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openUpdateDialog(tournament)}
                            >
                              Update
                            </Button>
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
            {selectedTournament && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium">{selectedTournament.name}</span>
                  <span className="text-muted-foreground">
                    {getGameCategoryLabel(selectedTournament.gameCategory || 'BILLIARDS')}
                  </span>
                </div>
                {selectedTournament.gameCategory && selectedTournament.gameCategory !== 'BILLIARDS' && (
                  <p className="mt-1 text-xs text-amber-600">
                    Not playable yet. Only Billiards sessions are supported.
                  </p>
                )}
              </div>
            )}
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
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                    <span>Verification filter:</span>
                    <select
                      value={verificationFilter}
                      onChange={(event) => setVerificationFilter(event.target.value)}
                      className="rounded border border-slate-200 bg-white px-2 py-1 text-xs"
                    >
                      <option value="all">All</option>
                      <option value="qr_issued">QR Issued</option>
                      <option value="verified">Verified</option>
                      <option value="expired">Expired</option>
                      <option value="pending">Not Requested</option>
                      <option value="stuck_qr">QR Issued &gt; 10 min</option>
                    </select>
                  </div>
                  <div className="mt-2 overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="border-b text-left text-xs uppercase text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">Match</th>
                          <th className="px-3 py-2">Season</th>
                          <th className="px-3 py-2">Players</th>
                          <th className="px-3 py-2">Host</th>
                          <th className="px-3 py-2">Verification</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Scheduled</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.matches
                          .filter((match) => ['active', 'in_progress', 'in-progress', 'ready', 'matched', 'scheduled'].includes(match.status))
                          .filter((match) => {
                            if (verificationFilter === 'all') return true;
                            const status = String(match.verificationStatus || 'pending').toLowerCase();
                            if (verificationFilter === 'stuck_qr') {
                              if (status !== 'qr_issued') return false;
                              if (!match.scheduledTime) return true;
                              const ageMs = Date.now() - new Date(match.scheduledTime).getTime();
                              return ageMs > 10 * 60 * 1000;
                            }
                            return status === verificationFilter;
                          })
                          .map((match) => (
                            <tr key={match.matchId} className="border-b last:border-0">
                              <td className="px-3 py-3">{match.matchId}</td>
                              <td className="px-3 py-3">{match.seasonId || '—'}</td>
                              <td className="px-3 py-3">{match.player1Id} vs {match.player2Id}</td>
                              <td className="px-3 py-3">
                                {match.assignedHostPlayerUserId ? match.assignedHostPlayerUserId : '—'}
                              </td>
                              <td className="px-3 py-3">
                                {match.verificationStatus || '—'}
                              </td>
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

      {/* Simple modal that we know works */}
      {updateDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg max-w-md w-full mx-4">
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <h2 className="text-lg font-bold mb-4">Update Tournament</h2>
              <p className="text-sm text-gray-600">
                Tournament: {editingTournament?.name}<br/>
                Status: {editingTournament?.status}
                {editingTournament?.status === 'active' && (
                  <span className="text-orange-600"><br/>⚠️ System will stop → update → resume</span>
                )}
              </p>
              
              <div className="space-y-3">
                <input
                  value={updateForm.name}
                  onChange={(e) => handleUpdateFormChange('name', e.target.value)}
                  placeholder="Tournament name"
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  value={updateForm.entryFee}
                  onChange={(e) => handleUpdateFormChange('entryFee', e.target.value)}
                  placeholder="Entry fee"
                  type="number"
                  className="w-full px-3 py-2 border rounded"
                  required
                />
                <input
                  value={updateForm.maxPlayers}
                  onChange={(e) => handleUpdateFormChange('maxPlayers', e.target.value)}
                  placeholder="Max players"
                  type="number"
                  className="w-full px-3 py-2 border rounded"
                />
                <input
                  value={updateForm.startTime}
                  onChange={(e) => handleUpdateFormChange('startTime', e.target.value)}
                  type="datetime-local"
                  className="w-full px-3 py-2 border rounded"
                />
              </div>

              {updateError && (
                <div className="p-2 bg-red-100 text-red-700 text-sm rounded">
                  {updateError}
                </div>
              )}
              
              {updateSuccess && (
                <div className="p-2 bg-green-100 text-green-700 text-sm rounded">
                  {updateSuccess}
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleUpdateDialogClose}
                  className="px-4 py-2 bg-gray-200 rounded"
                  disabled={updateLoading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded"
                  disabled={updateLoading}
                >
                  {updateLoading ? 'Updating...' : 'Update'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove all other modal code temporarily */}

      <AlertDialog open={!!confirmAction} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent className="border-slate-200 bg-white text-slate-900">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-500">
              {confirmAction?.tournament?.name ? `${confirmAction.tournament.name}. ` : ''}
              {confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel asChild>
              <Button variant="outline" disabled={confirmLoading}>
                Cancel
              </Button>
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button onClick={handleConfirm} disabled={confirmLoading}>
                {confirmLoading ? 'Please wait...' : confirmLabel}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
