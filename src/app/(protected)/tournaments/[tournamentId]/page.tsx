'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { tournamentApi, walletApi } from '@/lib/apiService';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'active':
      return 'default';
    case 'upcoming':
      return 'secondary';
    case 'completed':
      return 'outline';
    case 'cancelled':
      return 'destructive';
    default:
      return 'secondary';
  }
};

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

  const canJoinSeason = (season: Season) => {
    const now = new Date();
    const startTime = new Date(season.startTime);
    const timeUntilStart = startTime.getTime() - now.getTime();
    const JOINING_CLOSE_MINUTES = 30; // 30 minutes before start
    
    return season.status === 'upcoming' && 
           !season.joiningClosed && 
           !season.hasJoined &&
           timeUntilStart > JOINING_CLOSE_MINUTES * 60 * 1000;
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
    <div className="container mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/tournaments" className="text-sm text-muted-foreground hover:text-foreground">
            Back to tournaments
          </Link>
          <h1 className="text-3xl font-semibold mt-2">{tournament.name}</h1>
          {tournament.description && (
            <p className="text-sm text-muted-foreground mt-2">{tournament.description}</p>
          )}
        </div>
        <Badge variant={statusBadgeVariant(tournament.status)}>{tournament.status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Tournament Overview</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-sm">
          <div>
            <p className="text-muted-foreground">Entry Fee</p>
            <p className="text-lg font-semibold">TSH {Number(tournament.entryFee).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Players</p>
            <p className="text-lg font-semibold">{currentPlayers}/{tournament.maxPlayers}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Start Time</p>
            <p className="text-lg font-semibold">
              {tournament.startTime ? new Date(tournament.startTime).toLocaleString() : 'TBD'}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Stage</p>
            <p className="text-lg font-semibold">{tournament.stage || 'registration'}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Seasons</CardTitle>
            <span className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {seasons.length === 0 ? (
            <p className="text-sm text-muted-foreground">No seasons available yet.</p>
          ) : (
            <div className="space-y-4">
              {seasons.map((season) => (
                <div
                  key={season.seasonId}
                  className="space-y-3 rounded border border-border bg-background p-4"
                >
                  {/* Season Header */}
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold">Season {season.seasonNumber}</h3>
                      <Badge className={`${statusColor(season.status)} text-white`}>
                        {getStatusLabel(season.status)}
                      </Badge>
                      {season.hasJoined && (
                        <Badge className="bg-green-600 text-white">
                          ✓ You Joined
                        </Badge>
                      )}
                      {season.matchesGenerated && (
                        <Badge  className="border-purple-500 text-purple-300">
                          Matches Generated
                        </Badge>
                      )}
                    </div>
                  </div>

                  {/* Player Count and Progress */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {season.playerCount || 0} players joined
                      </span>
                      <span className="text-muted-foreground">
                        Max: {tournament?.maxPlayers || 0}
                      </span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          season.hasJoined 
                            ? 'bg-gradient-to-r from-green-600 to-emerald-600' 
                            : 'bg-gradient-to-r from-purple-600 to-pink-600'
                        }`}
                        style={{ 
                          width: `${Math.min(((season.playerCount || 0) / (tournament?.maxPlayers || 1)) * 100, 100)}%` 
                        }}
                      ></div>
                    </div>
                  </div>

                  {/* Time Information */}
                  <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">Start:</span>
                      <span className="font-medium">
                        {season.startTime ? new Date(season.startTime).toLocaleString() : 'TBD'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">End:</span>
                      <span className="font-medium">
                        {season.endTime ? new Date(season.endTime).toLocaleString() : 'TBD'}
                      </span>
                    </div>
                  </div>

                  {/* Action Button */}
                  {season.status === 'upcoming' && (
                    <div className="pt-2">
                      {season.joiningClosed ? (
                        <Badge className="bg-yellow-600 text-white">
                          Joining Closed
                        </Badge>
                      ) : season.hasJoined ? (
                        <Button disabled className="w-full md:w-auto bg-green-600 cursor-default">
                          ✓ Already Joined
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={joining === season.seasonId || !canJoinSeason(season)}
                          onClick={() => handleJoinSeason(season)}
                          className="w-full md:w-auto bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          {joining === season.seasonId ? 'Joining...' : 'Join Season'}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
