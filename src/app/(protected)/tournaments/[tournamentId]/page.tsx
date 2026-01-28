'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { tournamentApi, walletApi, matchmakingApi } from '@/lib/apiService';
import { getApiBaseUrl } from '@/lib/apiBase';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageLoader } from '@/components/ui/page-loader';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from '@/lib/socket';
import { getGameCategoryLabel, normalizeGameCategory } from '@/lib/gameCategories';

interface Tournament {
  tournamentId: string;
  name: string;
  description?: string;
  entryFee: number;
  maxPlayers: number;
  currentPlayers?: number;
  gameCategory?: string | null;
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
  name?: string | null;
  status: string;
  joiningClosed: boolean;
  matchesGenerated: boolean;
  startTime: string;
  endTime: string;
  playerCount?: number;
  hasJoined?: boolean;
}

interface BracketMatch {
  matchId: string;
  player1Id: string;
  player2Id: string;
  winnerId?: string | null;
  status: string;
  scheduledStartAt?: string | null;
  assignedHostPlayerUserId?: string | null;
  verificationStatus?: string | null;
  verifiedAt?: string | null;
  winnerAdvancesToMatchId?: string | null;
  winnerAdvancesToSlot?: string | null;
}

interface BracketStage {
  stage: string;
  matches: BracketMatch[];
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

const formatStageLabel = (stage: string) => {
  switch (stage) {
    case 'round_of_32': return 'Round of 32';
    case 'round_of_16': return 'Round of 16';
    case 'quarterfinal': return 'Quarterfinal';
    case 'semifinal': return 'Semifinal';
    case 'final': return 'Final';
    default: {
      const match = stage.match(/^round_of_(\d+)$/);
      if (match) return `Round of ${match[1]}`;
      return stage.replace(/_/g, ' ').toUpperCase();
    }
  }
};

interface SeasonCardProps {
  season: Season;
  tournament: Tournament;
  todaySeasons: Season[];
  joining: string | null;
  onJoin: (season: Season) => void;
  isPrimary: boolean;
}

const SeasonCard: React.FC<SeasonCardProps> = ({ 
  season, 
  tournament, 
  todaySeasons, 
  joining, 
  onJoin, 
  isPrimary 
}) => {
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

  const disabledReason = getJoinDisabledReason(season);
  const showJoin = season.status === 'upcoming';
  const isToday = !!season.startTime && todaySeasons.some((today) => today.seasonId === season.seasonId);
  const isActive = season.status === 'active';
  const isCompleted = season.status === 'completed';
  
  const cardClasses = isPrimary
    ? "rounded-2xl border border-white/10 bg-gradient-to-br from-white/8 via-white/5 to-transparent p-5 hover:from-white/12 hover:via-white/8 transition-all duration-200"
    : "rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/8 transition-all duration-200";

  return (
    <div className={cardClasses}>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`${isPrimary ? 'text-lg' : 'text-base'} font-semibold text-white`}>
              {season.name || `Season ${season.seasonNumber}`}
            </h3>
            <Badge className={`${statusColor(season.status)} text-white text-xs`}>
              {getStatusLabel(season.status)}
            </Badge>
            {isToday && (
              <Badge className="bg-amber-500/20 text-amber-200 border-amber-500/30 text-xs">
                Today
              </Badge>
            )}
            {isActive && (
              <Badge className="bg-green-500/20 text-green-200 border-green-500/30 text-xs animate-pulse">
                Live
              </Badge>
            )}
          </div>
          
          {/* Player count and status indicators */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-3 py-1 text-white/70">
              {season.playerCount || 0}/{tournament.maxPlayers} players
            </span>
            {season.hasJoined && (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-emerald-200">
                ✓ Joined
              </span>
            )}
            {season.matchesGenerated && (
              <span className="rounded-full bg-blue-500/20 px-3 py-1 text-blue-200">
                Matches Ready
              </span>
            )}
            {isCompleted && (
              <span className="rounded-full bg-gray-500/20 px-3 py-1 text-gray-300">
                Finished
              </span>
            )}
          </div>
        </div>
        
        {/* Time info */}
        <div className="text-right text-xs text-white/60 min-w-0">
          <div className="font-medium">
            {season.startTime ? new Date(season.startTime).toLocaleDateString() : 'TBD'}
          </div>
          <div className="text-white/50">
            {season.startTime ? new Date(season.startTime).toLocaleTimeString() : 'Time TBD'}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {isPrimary && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-white/50">
            <span>Registration Progress</span>
            <span>
              {Math.round(((season.playerCount || 0) / (tournament.maxPlayers || 1)) * 100)}%
            </span>
          </div>
          <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                season.hasJoined
                  ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
                  : isActive
                  ? 'bg-gradient-to-r from-green-400 to-green-600'
                  : 'bg-gradient-to-r from-amber-400 to-amber-600'
              }`}
              style={{
                width: `${Math.min(((season.playerCount || 0) / (tournament.maxPlayers || 1)) * 100, 100)}%`
              }}
            />
          </div>
        </div>
      )}

      {/* Season details for primary cards */}
      {isPrimary && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-white/60 mb-1">Start Time</p>
            <p className="font-semibold text-white">
              {season.startTime ? new Date(season.startTime).toLocaleString() : 'To Be Determined'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3">
            <p className="text-xs text-white/60 mb-1">Entry Fee</p>
            <p className="font-semibold text-white">
              TSH {Number(tournament.entryFee).toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 space-y-2">
        {showJoin && (
          <>
            {season.hasJoined ? (
              <Button disabled className="w-full bg-emerald-600 text-white cursor-default">
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
                Successfully Joined
              </Button>
            ) : (
              <Button
                disabled={joining === season.seasonId || !canJoinSeason(season)}
                onClick={() => onJoin(season)}
                className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium"
              >
                {joining === season.seasonId ? (
                  <div className="flex items-center">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white animate-spin rounded-full mr-2" />
                    Joining Season...
                  </div>
                ) : (
                  `Join ${season.name || 'Season'} - TSH ${Number(tournament.entryFee).toLocaleString()}`
                )}
              </Button>
            )}
            {!season.hasJoined && disabledReason && (
              <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <p className="text-xs text-amber-200 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  {disabledReason}
                </p>
              </div>
            )}
          </>
        )}

        {/* View Season Button - Available for ALL seasons */}
        <Link 
          href={`/tournament/${season.seasonId}`}
          className="block w-full"
        >
          <Button 
            variant="outline"
            className="w-full border-white/20 text-white hover:bg-white/10 bg-white/5"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            View Season Details
          </Button>
        </Link>
      </div>

      {/* Status message for non-joinable seasons */}
      {!showJoin && (
        <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
          <p className="text-xs text-white/60 flex items-center">
            {isCompleted ? (
              <>
                <svg className="w-4 h-4 mr-2 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Season completed. Results are final.
              </>
            ) : isActive ? (
              <>
                <svg className="w-4 h-4 mr-2 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 0l-3 3a1 1 0 001.414 1.414L9 9.414V13a1 1 0 102 0V9.414l1.293 1.293a1 1 0 001.414-1.414z" clipRule="evenodd" />
                </svg>
                Season is live! Matches in progress.
              </>
            ) : (
              <>
                <svg className="w-4 h-4 mr-2 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                {season.name || 'Season'} is not accepting new registrations.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
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
  const [socketConnected, setSocketConnected] = useState(false);
  const [bracketStages, setBracketStages] = useState<BracketStage[]>([]);
  const socketRef = useRef<Socket | null>(null);

  const apiBase = getApiBaseUrl();
  const socketTarget = useMemo(
    () => normalizeSocketTarget(process.env.NEXT_PUBLIC_ADMIN_WS_URL || apiBase),
    [apiBase]
  );

  const todaySeasons = useMemo(() => {
    const now = new Date();
    return seasons.filter((season) => {
      if (!season.startTime) return false;
      const start = new Date(season.startTime);
      return (
        start.getFullYear() === now.getFullYear() &&
        start.getMonth() === now.getMonth() &&
        start.getDate() === now.getDate()
      );
    });
  }, [seasons]);

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
    const loadBracket = async () => {
      if (!token || seasons.length === 0) {
        setBracketStages([]);
        return;
      }
      const primarySeason = seasons.find((season) => season.status === 'active') || seasons[0];
      if (!primarySeason?.seasonId) {
        setBracketStages([]);
        return;
      }
      try {
        const result = await matchmakingApi.getSeasonBracket(primarySeason.seasonId, token);
        const stages = (result.data as any)?.stages || result.data?.data?.stages || [];
        setBracketStages(stages as BracketStage[]);
      } catch {
        setBracketStages([]);
      }
    };

    loadBracket();
  }, [token, seasons]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      await loadTournamentData();
      setLoading(false);
    };

    load();
  }, [tournamentId, token, socketTarget.url, socketTarget.path]);

  useEffect(() => {
    if (!tournamentId || !token) return;
    const connectionUrl = socketTarget.url || undefined;
    const s = io(connectionUrl, {
      path: socketTarget.path,
      auth: token ? { token } : undefined,
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = s;

    s.on('connect', () => {
      setSocketConnected(true);
      s.emit('join:tournament', String(tournamentId));
    });
    s.on('disconnect', () => {
      setSocketConnected(false);
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

    s.on('tournament:seasons:update', (payload: any) => {
      if (payload?.tournamentId === tournamentId) {
        loadTournamentData();
      }
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
      setSocketConnected(false);
    };
  }, [tournamentId, socketTarget, session, token]);

  useEffect(() => {
    if (!tournamentId) return;
    if (socketConnected) return;
    const interval = setInterval(() => {
      loadTournamentData();
    }, 15000);
    return () => clearInterval(interval);
  }, [tournamentId, socketConnected]);

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
              <div className="flex items-center gap-2">
                <Link 
                  href="/tournaments" 
                  className="text-xs uppercase tracking-[0.3em] text-emerald-300/80 hover:text-emerald-200 transition-colors flex items-center gap-1"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to tournaments
                </Link>
                <span className="text-white/30">•</span>
                <span className="text-xs uppercase tracking-[0.3em] text-white/50">Tournament Detail</span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-semibold" style={{ fontFamily: 'var(--font-tournament-display)' }}>
                {tournament.name}
              </h1>
              <p className="max-w-2xl text-sm text-white/70">
                {tournament.description || 'Seasoned play with calibrated match timers and clean bracket progression.'}
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <Badge className={`${statusColor(tournament.status)} text-white border-none`}>
                {getStatusLabel(tournament.status)}
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/70">
                {getGameCategoryLabel(normalizeGameCategory(tournament.gameCategory) || 'BILLIARDS')}
              </Badge>
              {socketConnected && (
                <div className="flex items-center gap-1 text-xs text-green-300">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                  <span>Live Updates</span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Entry Fee</p>
              <p className="mt-2 text-2xl font-semibold">TSH {Number(tournament.entryFee).toLocaleString()}</p>
              <p className="text-xs text-emerald-200/80">Paid once per season</p>
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
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-sky-200/80">Bracket</p>
              <h2 className="text-2xl font-semibold">Who Meets Next</h2>
            </div>
          </div>

          {bracketStages.length === 0 ? (
            <p className="mt-6 text-sm text-white/60">
              Bracket fixtures will appear once matches are generated for this season.
            </p>
          ) : (
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              {bracketStages.map((stage) => (
                <div key={stage.stage} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <p className="text-sm font-semibold text-sky-100">{formatStageLabel(stage.stage)}</p>
                  <div className="mt-3 space-y-3 text-sm text-white/80">
                    {stage.matches.map((match, index) => (
                      <div key={match.matchId} className="rounded-xl border border-white/10 bg-black/20 p-3">
                        <p className="text-xs text-white/60">
                          Match {index + 1} · {match.matchId.slice(0, 8)}
                        </p>
                        <p className="mt-1 font-medium">
                          {match.player1Id.slice(0, 8)} vs {match.player2Id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-white/60">
                          Scheduled: {match.scheduledStartAt ? new Date(match.scheduledStartAt).toLocaleString() : 'TBD'}
                        </p>
                        {match.winnerAdvancesToMatchId && (
                          <p className="text-xs text-sky-200">
                            Winner advances to {match.winnerAdvancesToMatchId.slice(0, 8)} (slot {match.winnerAdvancesToSlot})
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-amber-200/80">Tournament Seasons</p>
              <h2 className="text-2xl font-semibold" style={{ fontFamily: 'var(--font-tournament-display)' }}>
                Match Seasons & Registration
              </h2>
              <p className="text-sm text-white/70 mt-2">Join upcoming seasons to compete in brackets</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-xs text-white/50">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                  <span>Live Updates</span>
                </div>
                <div>Today: {todaySeasons.length} season{todaySeasons.length === 1 ? '' : 's'}</div>
                <div>Updated: {lastUpdated.toLocaleTimeString()}</div>
              </div>
              {wallet && (
                <div className="text-right">
                  <p className="text-xs text-white/60">Your Balance</p>
                  <p className="text-sm font-semibold text-emerald-300">
                    TSH {Number(wallet.balance).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {seasons.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">No Seasons Available</h3>
              <p className="text-sm text-white/60 max-w-md mx-auto">
                Seasons will appear here when the tournament administrator creates them. Check back soon!
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-6">
              {/* Active/Upcoming Seasons First */}
              {(() => {
                const activeSeasons = seasons.filter(s => ['active', 'upcoming'].includes(s.status));
                const completedSeasons = seasons.filter(s => !['active', 'upcoming'].includes(s.status));
                const sortedActive = activeSeasons.sort((a, b) => {
                  if (a.status === 'active' && b.status !== 'active') return -1;
                  if (b.status === 'active' && a.status !== 'active') return 1;
                  if (typeof a.seasonNumber === 'number' && typeof b.seasonNumber === 'number') {
                    return b.seasonNumber - a.seasonNumber;
                  }
                  const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                  const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                  return aTime - bTime;
                });
                const sortedCompleted = completedSeasons.sort((a, b) => {
                  if (typeof a.seasonNumber === 'number' && typeof b.seasonNumber === 'number') {
                    return b.seasonNumber - a.seasonNumber;
                  }
                  const aTime = a.startTime ? new Date(a.startTime).getTime() : 0;
                  const bTime = b.startTime ? new Date(b.startTime).getTime() : 0;
                  return bTime - aTime;
                });

                return (
                  <>
                    {/* Active & Upcoming Seasons */}
                    {sortedActive.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-emerald-300 mb-4 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-emerald-400"></div>
                          Active & Upcoming Seasons
                        </h3>
                        <div className="grid gap-6 lg:grid-cols-2">
                          {sortedActive.map((season) => (
                            <SeasonCard 
                              key={season.seasonId} 
                              season={season} 
                              tournament={tournament}
                              todaySeasons={todaySeasons}
                              joining={joining}
                              onJoin={handleJoinSeason}
                              isPrimary={true}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Completed Seasons */}
                    {sortedCompleted.length > 0 && (
                      <div>
                        <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-white/40"></div>
                          Previous Seasons
                        </h3>
                        <div className="grid gap-4 lg:grid-cols-3">
                          {sortedCompleted.slice(0, 12).map((season) => (
                            <SeasonCard 
                              key={season.seasonId} 
                              season={season} 
                              tournament={tournament}
                              todaySeasons={todaySeasons}
                              joining={joining}
                              onJoin={handleJoinSeason}
                              isPrimary={false}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
