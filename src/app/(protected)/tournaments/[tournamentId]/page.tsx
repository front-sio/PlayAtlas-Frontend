'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { tournamentApi, walletApi } from '@/lib/apiService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from '@/lib/socket';

interface Tournament {
  tournamentId: string;
  name: string;
  description?: string;
  entryFee: number;
  maxPlayers: number;
  currentPlayers?: number;
  status: string;
  stage?: string;
  startTime?: string;
  createdAt?: string;
  seasonDuration?: number;
  tournamentPlayers?: Array<{ playerId: string }>;
}

interface Season {
  seasonId: string;
  seasonNumber: number;
  status: string;
  joiningClosed: boolean;
  matchesGenerated: boolean;
  startTime: string;
  endTime: string;
  playerCount?: number;
  hasJoined?: boolean;
}

interface Wallet {
  balance: number;
  walletId: string;
}

const statusColor = (status: string) => {
  switch (status) {
    case 'active': return 'bg-green-500';
    case 'upcoming': return 'bg-blue-500';
    case 'completed': return 'bg-gray-500';
    case 'cancelled': return 'bg-red-500';
    case 'stopped': return 'bg-yellow-600';
    default: return 'bg-gray-500';
  }
};

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'active': return 'ACTIVE';
    case 'upcoming': return 'UPCOMING';
    case 'completed': return 'COMPLETED';
    case 'cancelled': return 'CANCELLED';
    case 'stopped': return 'STOPPED';
    default: return status.toUpperCase();
  }
};

export default function TournamentDetailPage() {
  const { tournamentId } = useParams<{ tournamentId: string }>();
  const { data: session } = useSession();
  const token = (session as any)?.accessToken as string | undefined;
  const playerId = session?.user?.userId as string | undefined;
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const socketRef = useRef<Socket | null>(null);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
  const socketUrl = useMemo(() => apiBase.replace(/\/api\/?$/, ''), [apiBase]);
  const socketTarget = useMemo(() => normalizeSocketTarget(socketUrl), [socketUrl]);

  const loadTournamentData = async () => {
    if (!tournamentId) return;
    try {
      const [tournamentRes, seasonsRes] = await Promise.all([
        tournamentApi.getTournament(String(tournamentId)),
        token ? tournamentApi.getSeasons(String(tournamentId)) : Promise.resolve({ data: [] }),
      ]);
      setTournament(tournamentRes.data || null);
      setSeasons(seasonsRes.data || []);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tournament');
    }
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      await loadTournamentData();
      setLoading(false);
    };

    load();
  }, [tournamentId, token]);

  useEffect(() => {
    if (!tournamentId) return;
    const s = io(socketTarget.url, {
      path: socketTarget.path,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = s;

    s.on('connect', () => {
      const player = session?.user?.userId;
      if (player && token) {
        s.emit('authenticate', { playerId: player, token });
      }
      s.emit('join:season', { tournamentId });
    });

    s.on('season:matches_generated', (payload: any) => {
      if (payload?.tournamentId === tournamentId) {
        loadTournamentData();
      }
    });

    s.on('season:completed', (payload: any) => {
      if (payload?.tournamentId === tournamentId) {
        loadTournamentData();
      }
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [tournamentId, socketTarget, session, token]);

  useEffect(() => {
    const loadWallet = async () => {
      if (!token) {
        setWallet(null);
        return;
      }
      try {
        const walletRes = await walletApi.getWallet(token);
        setWallet(walletRes.data || null);
      } catch (err) {
        setWallet(null);
      }
    };

    loadWallet();
  }, [token]);

  const currentPlayers = useMemo(() => {
    if (!tournament) return 0;
    if (typeof tournament.currentPlayers === 'number') return tournament.currentPlayers;
    return tournament.tournamentPlayers?.length || 0;
  }, [tournament]);

  const getJoinDisabledReason = (season: Season) => {
    if (season.status !== 'upcoming') return 'Season not open';
    if (season.joiningClosed) return 'Joining closed';
    if (season.hasJoined) return 'Already joined';
    if (typeof tournament?.maxPlayers === 'number' && typeof season.playerCount === 'number') {
      if (season.playerCount >= tournament.maxPlayers) return 'Season full';
    }
    if (season.startTime) {
      const startTime = new Date(season.startTime);
      if (!Number.isNaN(startTime.getTime()) && Date.now() >= startTime.getTime()) {
        return 'Season started';
      }
    }
    return '';
  };

  const canJoinSeason = (season: Season) => {
    return getJoinDisabledReason(season) === '';
  };

  const handleJoinSeason = async (season: Season) => {
    if (!playerId || !token) {
      setError('Please login to join seasons.');
      return;
    }
    if (!wallet?.walletId || !tournament) {
      setError('Wallet information not available.');
      return;
    }
    if (wallet.balance < tournament.entryFee) {
      setError('Insufficient balance. Please add funds to your wallet.');
      return;
    }

    setJoining(season.seasonId);
    setError('');
    try {
      await tournamentApi.joinSeason(token, season.seasonId, playerId, wallet.walletId);
      // Refresh data immediately after joining
      await loadTournamentData();
      setWallet((prev) =>
        prev ? { ...prev, balance: prev.balance - tournament.entryFee } : prev
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join season');
    } finally {
      setJoining(null);
    }
  };

  if (loading) {
    return <PageLoader label="Loading tournament..." />;
  }

  if (error) {
    return (
      <div className="container mx-auto py-8">
        <div className="rounded border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  if (!tournament) {
    return (
      <div className="container mx-auto py-8">
        <div className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          Tournament not found.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.14),_transparent_55%),radial-gradient(circle_at_30%_40%,_rgba(234,179,8,0.1),_transparent_55%),linear-gradient(180deg,_#0b0f1a_0%,_#070a12_45%,_#06080e_100%)] text-white">
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8" style={{ fontFamily: 'var(--font-tournament)' }}>
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-3">
              <Link href="/tournaments" className="text-xs uppercase tracking-[0.3em] text-emerald-300/80 hover:text-emerald-200">
                Back to tournaments
              </Link>
              <h1 className="text-4xl sm:text-5xl font-semibold" style={{ fontFamily: 'var(--font-tournament-display)' }}>
                {tournament.name}
              </h1>
              <p className="max-w-2xl text-sm text-white/70">
                {tournament.description || 'Seasoned play with calibrated match timers and clean bracket progression.'}
              </p>
            </div>
            <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
              {getStatusLabel(tournament.status)}
            </Badge>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Entry Fee</p>
              <p className="mt-2 text-2xl font-semibold">TSH {Number(tournament.entryFee).toLocaleString()}</p>
              <p className="text-xs text-emerald-200/80">Paid once per season</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Players</p>
              <p className="mt-2 text-2xl font-semibold">{currentPlayers}/{tournament.maxPlayers}</p>
              <p className="text-xs text-white/50">Roster capacity</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Stage</p>
              <p className="mt-2 text-2xl font-semibold">{tournament.stage || 'registration'}</p>
              <p className="text-xs text-white/50">Current phase</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Start</p>
              <p className="mt-2 text-lg font-semibold">
                {tournament.startTime ? new Date(tournament.startTime).toLocaleString() : 'TBD'}
              </p>
              <p className="text-xs text-white/50">Local time</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Season Window</p>
              <p className="mt-2 text-lg font-semibold">
                {typeof tournament.seasonDuration === 'number'
                  ? `${Math.round(tournament.seasonDuration / 60)} min`
                  : 'Adaptive'}
              </p>
              <p className="text-xs text-white/50">Auto-scheduled</p>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">Seasons</p>
              <h2 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-tournament-display)' }}>
                Scheduled Match Flow
              </h2>
            </div>
            <span className="text-xs text-white/50">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          </div>

          {seasons.length === 0 ? (
            <p className="mt-6 text-sm text-white/60">No seasons available yet.</p>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {seasons.map((season) => {
                const disabledReason = getJoinDisabledReason(season);
                const showJoin = season.status === 'upcoming';
                return (
                  <div
                    key={season.seasonId}
                    className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 via-white/5 to-transparent p-5"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="space-y-2">
                        <div className="flex items-center gap-3">
                          <h3 className="text-lg font-semibold">Season {season.seasonNumber}</h3>
                          <Badge className={`${statusColor(season.status)} text-white`}>
                            {getStatusLabel(season.status)}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
                          <span className="rounded-full bg-white/10 px-3 py-1">
                            {season.playerCount || 0} players
                          </span>
                          <span className="rounded-full bg-white/10 px-3 py-1">
                            Max {tournament.maxPlayers}
                          </span>
                          {season.hasJoined && (
                            <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">
                              Joined
                            </span>
                          )}
                          {season.matchesGenerated && (
                            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-amber-200">
                              Matches ready
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-white/50">
                        {season.startTime ? `Starts ${new Date(season.startTime).toLocaleString()}` : 'Start time TBD'}
                      </div>
                    </div>

                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-white/50">
                        <span>Seat fill</span>
                        <span>
                          {Math.round(((season.playerCount || 0) / (tournament.maxPlayers || 1)) * 100)}%
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-white/10">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            season.hasJoined
                              ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                              : 'bg-gradient-to-r from-amber-400 to-emerald-400'
                          }`}
                          style={{
                            width: `${Math.min(((season.playerCount || 0) / (tournament.maxPlayers || 1)) * 100, 100)}%`
                          }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs text-white/60">Start</p>
                        <p className="mt-1 font-semibold">
                          {season.startTime ? new Date(season.startTime).toLocaleString() : 'TBD'}
                        </p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                        <p className="text-xs text-white/60">End</p>
                        <p className="mt-1 font-semibold">
                          {season.endTime ? new Date(season.endTime).toLocaleString() : 'TBD'}
                        </p>
                      </div>
                    </div>

                    {showJoin && (
                      <div className="mt-4">
                        {season.hasJoined ? (
                          <Button disabled className="w-full bg-emerald-600 cursor-default">
                            ✓ Joined
                          </Button>
                        ) : (
                          <Button
                            disabled={joining === season.seasonId || !canJoinSeason(season)}
                            onClick={() => handleJoinSeason(season)}
                            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60"
                          >
                            {joining === season.seasonId ? 'Joining…' : 'Join Season'}
                          </Button>
                        )}
                        {!season.hasJoined && disabledReason && (
                          <p className="mt-2 text-xs text-amber-200">{disabledReason}</p>
                        )}
                      </div>
                    )}
                    {!showJoin && (
                      <p className="mt-4 text-xs text-white/50">
                        {season.status === 'completed' ? 'Season finished. Results are locked.' : 'Season is not accepting new entries.'}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
