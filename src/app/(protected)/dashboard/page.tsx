'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Activity, Flame, Target, Trophy, TrendingUp } from 'lucide-react';
import { PageLoader } from '@/components/ui/page-loader';
import { lookupApi, playerApi, tournamentApi } from '@/lib/apiService';
import { useSocket } from '@/hooks/useSocket';
import { toast } from '@/hooks/use-toast';

type PlayerStats = {
  totalMatches?: number;
  matchesWon?: number;
  matchesLost?: number;
  winRate?: number | string;
  rankingPoints?: number;
  currentStreak?: number;
  longestStreak?: number;
  recentMatches?: Array<{
    matchId?: string;
    opponentId?: string;
    result?: string;
    pointsChange?: number;
    playedAt?: string;
    tournamentId?: string;
    matchData?: Record<string, any>;
  }>;
};

type Tournament = {
  tournamentId: string;
  name: string;
  description?: string;
  entryFee: number;
  maxPlayers: number;
  currentPlayers: number;
  status: 'draft' | 'upcoming' | 'active' | 'stopped' | 'completed' | 'cancelled';
  startTime?: string;
  createdAt: string;
};

type Season = {
  seasonId: string;
  tournamentId: string;
  seasonNumber: number;
  name?: string | null;
  status: string;
  joiningClosed?: boolean;
  matchesGenerated?: boolean;
  startTime?: string;
  endTime?: string;
  playerCount?: number;
  hasJoined?: boolean;
};

const DashboardPage: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [stats, setStats] = useState<PlayerStats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [tournamentsError, setTournamentsError] = useState<string | null>(null);
  const [seasonsByTournament, setSeasonsByTournament] = useState<Record<string, Season[]>>({});
  const [seasonsError, setSeasonsError] = useState<string | null>(null);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [opponentNames, setOpponentNames] = useState<Record<string, string>>({});
  const [tournamentNames, setTournamentNames] = useState<Record<string, string>>({});
  const { socket, isConnected } = useSocket({ enabled: true });
  const profileEnsuredRef = useRef(false);

  const playerId = session?.user?.userId;
  const accessToken = session?.accessToken;
  const fallbackUsername =
    session?.user?.username ||
    session?.user?.email?.split('@')[0] ||
    (playerId ? `player-${playerId.slice(0, 6)}` : undefined);

  const formattedWinRate = useMemo(() => {
    if (!stats?.winRate && stats?.winRate !== 0) return '—';
    const numeric = typeof stats.winRate === 'string' ? Number(stats.winRate) : stats.winRate;
    if (Number.isNaN(numeric)) return '—';
    return `${numeric.toFixed(1)}%`;
  }, [stats?.winRate]);

  const winRateValue = useMemo(() => {
    if (!stats?.winRate && stats?.winRate !== 0) return 0;
    const numeric = typeof stats.winRate === 'string' ? Number(stats.winRate) : stats.winRate;
    return Number.isNaN(numeric) ? 0 : Math.max(0, Math.min(100, numeric));
  }, [stats?.winRate]);

  const visibleTournaments = useMemo(() => {
    const sorted = [...tournaments].sort((a, b) => {
      if (a.status === b.status) {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return aTime - bTime;
      }
      if (a.status === 'active') return -1;
      if (b.status === 'active') return 1;
      if (a.status === 'upcoming') return -1;
      if (b.status === 'upcoming') return 1;
      return 0;
    });
    return sorted.filter((t) => t.status === 'active' || t.status === 'upcoming').slice(0, 6);
  }, [tournaments]);

  const openSeasons = useMemo(() => {
    const seasons = Object.values(seasonsByTournament).flat();
    return seasons
      .filter((season) => season.status === 'upcoming' && !season.joiningClosed)
      .sort((a, b) => {
        const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
        const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
        return aTime - bTime;
      })
      .slice(0, 6);
  }, [seasonsByTournament]);

  useEffect(() => {
    // Redirect if not authenticated
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;

    const loadStats = async () => {
      setStatsLoading(true);
      setStatsError(null);
      try {
        const response = await playerApi.getStats(playerId, accessToken);
        if (cancelled) return;
        setStats(response?.data || null);
      } catch (err) {
        if (cancelled) return;
        const status = (err as any)?.status;
        if (status === 404 && !profileEnsuredRef.current && fallbackUsername) {
          try {
            profileEnsuredRef.current = true;
            await playerApi.createOrUpdatePlayer({ playerId, username: fallbackUsername });
            if (typeof window !== 'undefined' && !sessionStorage.getItem('playerProfileCreatedToast')) {
              sessionStorage.setItem('playerProfileCreatedToast', 'true');
              toast({
                title: 'Profile created',
                description: 'We set up your player profile so stats can load.',
              });
            }
            const retry = await playerApi.getStats(playerId, accessToken);
            if (!cancelled) {
              setStats(retry?.data || null);
              setStatsError(null);
            }
          } catch (ensureErr) {
            if (!cancelled) {
              setStatsError(ensureErr instanceof Error ? ensureErr.message : 'Failed to load stats');
              setStats(null);
            }
          }
        } else {
          setStatsError(err instanceof Error ? err.message : 'Failed to load stats');
          setStats(null);
        }
      } finally {
        if (!cancelled) setStatsLoading(false);
      }
    };

    loadStats();
    return () => {
      cancelled = true;
    };
  }, [playerId, accessToken]);

  useEffect(() => {
    if (!playerId) return;
    let cancelled = false;

    const loadTournaments = async () => {
      setTournamentsLoading(true);
      setTournamentsError(null);
      try {
        const response = await tournamentApi.getTournaments(1, 50);
        if (cancelled) return;
        setTournaments(response?.data || []);
      } catch (err) {
        if (cancelled) return;
        setTournamentsError(err instanceof Error ? err.message : 'Failed to load tournaments');
      } finally {
        if (!cancelled) setTournamentsLoading(false);
      }
    };

    loadTournaments();
    return () => {
      cancelled = true;
    };
  }, [playerId]);

  useEffect(() => {
    if (!stats?.recentMatches?.length) return;
    let cancelled = false;

    const loadLookups = async () => {
      const recent = stats.recentMatches.slice(0, 6);
      const missingOpponents = recent
        .map((match) => match.opponentId)
        .filter((id): id is string => !!id && !opponentNames[id]);
      const missingTournaments = recent
        .map((match) => match.tournamentId)
        .filter((id): id is string => !!id && !tournamentNames[id]);

      if (missingOpponents.length === 0 && missingTournaments.length === 0) return;

      try {
        const response = await lookupApi.resolveMatchLookups(
          { opponentIds: missingOpponents, tournamentIds: missingTournaments },
          accessToken
        );
        if (cancelled) return;
        const opponents = response?.data?.opponents || {};
        const tournaments = response?.data?.tournaments || {};

        if (Object.keys(opponents).length > 0) {
          setOpponentNames((prev) => ({ ...prev, ...opponents }));
        }
        if (Object.keys(tournaments).length > 0) {
          setTournamentNames((prev) => ({ ...prev, ...tournaments }));
        }
      } catch (err) {
        if (cancelled) return;
        missingOpponents.forEach((opponentId) => {
          setOpponentNames((prev) => ({ ...prev, [opponentId]: opponentId.slice(0, 8) }));
        });
        missingTournaments.forEach((tournamentId) => {
          setTournamentNames((prev) => ({ ...prev, [tournamentId]: `Tournament ${tournamentId.slice(0, 6)}` }));
        });
      }
    };

    loadLookups();
    return () => {
      cancelled = true;
    };
  }, [stats?.recentMatches, opponentNames, tournamentNames, accessToken]);

  useEffect(() => {
    if (!socket || !isConnected || !playerId) return;

    const handleStats = (payload: PlayerStats) => {
      setStats(payload || null);
      setStatsError(null);
    };

    const handleStatsError = async (payload: { message?: string }) => {
      const message = payload?.message || 'Failed to load stats';
      if (message.includes('404') && !profileEnsuredRef.current && playerId && fallbackUsername) {
        try {
          profileEnsuredRef.current = true;
          await playerApi.createOrUpdatePlayer({ playerId, username: fallbackUsername });
          if (typeof window !== 'undefined' && !sessionStorage.getItem('playerProfileCreatedToast')) {
            sessionStorage.setItem('playerProfileCreatedToast', 'true');
            toast({
              title: 'Profile created',
              description: 'We set up your player profile so stats can load.',
            });
          }
          socket.emit('player:stats:request', { playerId });
          return;
        } catch (ensureErr) {
          setStatsError(ensureErr instanceof Error ? ensureErr.message : 'Failed to load stats');
          return;
        }
      }
      setStatsError(message);
    };

    socket.on('player:stats', handleStats);
    socket.on('player:stats:error', handleStatsError);
    socket.emit('player:stats:request', { playerId });

    const interval = setInterval(() => {
      socket.emit('player:stats:request', { playerId });
    }, 30000);

    return () => {
      clearInterval(interval);
      socket.off('player:stats', handleStats);
      socket.off('player:stats:error', handleStatsError);
    };
  }, [socket, isConnected, playerId]);

  useEffect(() => {
    if (!socket || !isConnected || !playerId) return;

    const handleTournaments = (payload: Tournament[]) => {
      setTournaments(payload || []);
      setTournamentsError(null);
    };

    const handleTournamentsError = (payload: { message?: string }) => {
      setTournamentsError(payload?.message || 'Failed to load tournaments');
    };

    const handleSeasons = (payload: { tournamentId: string; seasons: Season[] }) => {
      if (!payload?.tournamentId) return;
      setSeasonsByTournament((prev) => ({
        ...prev,
        [payload.tournamentId]: payload.seasons || []
      }));
      setSeasonsError(null);
    };

    const handleSeasonsError = (payload: { message?: string }) => {
      setSeasonsError(payload?.message || 'Failed to load seasons');
    };

    socket.on('player:tournaments:update', handleTournaments);
    socket.on('player:tournaments:error', handleTournamentsError);
    socket.on('player:seasons:update', handleSeasons);
    socket.on('player:seasons:error', handleSeasonsError);

    socket.emit('player:tournaments:request');

    const interval = setInterval(() => {
      socket.emit('player:tournaments:request');
    }, 30000);

    return () => {
      clearInterval(interval);
      socket.off('player:tournaments:update', handleTournaments);
      socket.off('player:tournaments:error', handleTournamentsError);
      socket.off('player:seasons:update', handleSeasons);
      socket.off('player:seasons:error', handleSeasonsError);
    };
  }, [socket, isConnected, playerId]);

  useEffect(() => {
    if (!socket || !isConnected || visibleTournaments.length === 0) return;

    visibleTournaments.forEach((tournament) => {
      socket.emit('player:seasons:request', { tournamentId: tournament.tournamentId });
    });

    const interval = setInterval(() => {
      visibleTournaments.forEach((tournament) => {
        socket.emit('player:seasons:request', { tournamentId: tournament.tournamentId });
      });
    }, 45000);

    return () => {
      clearInterval(interval);
    };
  }, [socket, isConnected, visibleTournaments]);

  if (status === 'loading') {
    return <PageLoader label="Loading dashboard…" />;
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(circle_at_20%_30%,_rgba(59,130,246,0.12),_transparent_55%),linear-gradient(180deg,_#0a0f1b_0%,_#070a13_50%,_#06080f_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Player Dashboard</p>
              <h1 className="mt-2 text-4xl font-semibold">
                Welcome back{fallbackUsername ? `, ${fallbackUsername}` : ''}
              </h1>
              <p className="mt-2 text-sm text-white/70">
                Track performance, enter live seasons, and keep momentum between matches.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => router.push('/game')}
                className="bg-emerald-500 hover:bg-emerald-600 text-white"
              >
                Start Match
              </Button>
              <Button
                onClick={() => router.push('/tournaments')}
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                Browse Tournaments
              </Button>
            </div>
          </div>

          {searchParams.get('message') && (
            <Alert className="mt-4 bg-green-500/10 border-green-500/30">
              <AlertDescription className="text-green-400">
                {searchParams.get('message')}
              </AlertDescription>
            </Alert>
          )}
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-emerald-300" />
                Ranking Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-white">
                {statsLoading ? '...' : stats?.rankingPoints ?? '—'}
              </div>
              <p className="text-xs text-white/50">Climb the ladder with each win.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                <Target className="h-4 w-4 text-sky-300" />
                Win Rate
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-white">
                {statsLoading ? '...' : formattedWinRate}
              </div>
              <p className="text-xs text-white/50">
                {statsLoading ? 'Loading performance...' : `${stats?.matchesWon ?? 0} wins · ${stats?.matchesLost ?? 0} losses`}
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                <Activity className="h-4 w-4 text-amber-300" />
                Matches Played
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-white">
                {statsLoading ? '...' : stats?.totalMatches ?? '—'}
              </div>
              <p className="text-xs text-white/50">Total matches recorded.</p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-white/70 flex items-center gap-2">
                <Flame className="h-4 w-4 text-rose-300" />
                Current Streak
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold text-white">
                {statsLoading ? '...' : stats?.currentStreak ?? '—'}
              </div>
              <p className="text-xs text-white/50">
                Best streak: {statsLoading ? '...' : stats?.longestStreak ?? '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        {statsError && (
          <Alert className="bg-red-500/10 border-red-500/30">
            <AlertDescription className="text-red-300">
              {statsError}
            </AlertDescription>
          </Alert>
        )}

        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-300" />
              Progression
            </CardTitle>
            <CardDescription className="text-white/60">
              Track how your performance is trending.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div>
              <div className="flex items-center justify-between text-sm text-white/70">
                <span>Win rate</span>
                <span>{formattedWinRate}</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-white/10">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                  style={{ width: `${winRateValue}%` }}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/60">Matches won</p>
                <p className="text-xl font-semibold text-white">{stats?.matchesWon ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/60">Matches lost</p>
                <p className="text-xl font-semibold text-white">{stats?.matchesLost ?? '—'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/60">Best streak</p>
                <p className="text-xl font-semibold text-white">{stats?.longestStreak ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-300" />
              Recent Matches
            </CardTitle>
            <CardDescription className="text-white/60">
              Your latest results and momentum.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {stats?.recentMatches?.length ? (
              <div className="space-y-3">
                {stats.recentMatches.slice(0, 6).map((match, index) => (
                  <div
                    key={`${match.matchId || match.playedAt || 'match'}-${index}`}
                    className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-sm"
                  >
                    <div>
                      <p className="text-white">
                        {match.result ? match.result.toUpperCase() : 'RESULT'} vs{' '}
                        {match.opponentId
                          ? opponentNames[match.opponentId] ||
                            match.matchData?.opponentUsername ||
                            match.matchData?.opponentName ||
                            match.opponentId.slice(0, 8)
                          : 'Opponent'}
                      </p>
                      <p className="text-xs text-white/50">
                        {match.tournamentId
                          ? tournamentNames[match.tournamentId] || `Tournament ${match.tournamentId.slice(0, 6)}`
                          : 'Tournament'}
                      </p>
                      <p className="text-xs text-white/50">
                        {match.playedAt ? new Date(match.playedAt).toLocaleString() : 'Time TBD'}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-white/80">
                        {typeof match.pointsChange === 'number' ? `${match.pointsChange >= 0 ? '+' : ''}${match.pointsChange}` : '—'}
                      </p>
                      <p className="text-xs text-white/50">{match.matchId?.slice(0, 8) || 'Match'}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-white/60">No match history yet.</p>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-white">Open Seasons</CardTitle>
              <CardDescription className="text-white/60">
                Only upcoming seasons with open joining are shown.
              </CardDescription>
            </div>
            <Button
              onClick={() => router.push('/tournaments')}
              className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              Browse Tournaments
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {seasonsError && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertDescription className="text-red-300">
                  {seasonsError}
                </AlertDescription>
              </Alert>
            )}
            {openSeasons.length === 0 && !seasonsError ? (
              <p className="text-sm text-white/60">No open seasons right now.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {openSeasons.map((season) => (
                  <div
                    key={season.seasonId}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-white/70">{season.name || `Season ${season.seasonNumber}`}</p>
                        <p className="text-xs text-white/50">
                          {season.startTime ? new Date(season.startTime).toLocaleString() : 'Start time TBD'}
                        </p>
                      </div>
                      <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-500/40">
                        {season.status}
                      </Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-sm text-white/70">
                      <span>{season.playerCount || 0} players</span>
                      <span>{season.joiningClosed ? 'Joining closed' : 'Open to join'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-white">Live Tournaments</CardTitle>
              <CardDescription className="text-white/60">
                Active and upcoming tournaments to jump into.
              </CardDescription>
            </div>
            <Button
              onClick={() => router.push('/tournaments')}
              className="border-white/20 text-white hover:bg-white/10 hover:text-white"
            >
              View All
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {tournamentsError && (
              <Alert className="bg-red-500/10 border-red-500/30">
                <AlertDescription className="text-red-300">
                  {tournamentsError}
                </AlertDescription>
              </Alert>
            )}
            {tournamentsLoading && (
              <p className="text-sm text-white/60">Loading tournaments...</p>
            )}
            {!tournamentsLoading && visibleTournaments.length === 0 && !tournamentsError && (
              <p className="text-sm text-white/60">No active or upcoming tournaments right now.</p>
            )}
            <div className="grid gap-4 lg:grid-cols-3">
              {visibleTournaments.map((tournament) => (
                <div
                  key={tournament.tournamentId}
                  className="rounded-2xl border border-white/10 bg-white/5 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{tournament.name}</p>
                      <p className="text-xs text-white/50">
                        {tournament.startTime ? `Starts ${new Date(tournament.startTime).toLocaleDateString()}` : 'Start time TBD'}
                      </p>
                    </div>
                    <Badge className="bg-sky-500/20 text-sky-200 border-sky-500/40">
                      {tournament.status}
                    </Badge>
                  </div>
                  <div className="mt-3 text-sm text-white/70">
                    {tournament.currentPlayers}/{tournament.maxPlayers} players · Tsh {tournament.entryFee}
                  </div>
                  <Button
                    onClick={() => router.push(`/tournaments/${tournament.tournamentId}`)}
                    className="mt-4 w-full border-white/20 text-white hover:bg-white/10 hover:text-white"
                  >
                    View Tournament
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-3xl bg-white/5 border-white/10">
          <CardHeader>
            <CardTitle className="text-white">Quick Actions</CardTitle>
            <CardDescription className="text-white/60">
              Jump back into the action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
              <Button
                onClick={() => router.push('/game')}
                className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
              >
                Start a Match
              </Button>
              <Button
                onClick={() => router.push('/tournaments')}
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                Browse Tournaments
              </Button>
              <Button
                onClick={() => router.push('/profile')}
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                Update Profile
              </Button>
              <Button
                onClick={() => socket?.emit('player:stats:request', { playerId })}
                className="border-white/20 text-white hover:bg-white/10 hover:text-white"
              >
                Refresh Stats
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
