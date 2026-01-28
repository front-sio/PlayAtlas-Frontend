'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import AlertModal from '@/components/ui/AlertModal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Trophy, Users, Wallet, Play, Clock, Filter, Search, Star, Eye, ArrowRight } from 'lucide-react';
import { agentApi, playerApi, tournamentApi, walletApi } from '@/lib/apiService';
import { getApiBaseUrl } from '@/lib/apiBase';
import { useSession } from 'next-auth/react';
import { PageLoader } from '@/components/ui/page-loader';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from '@/lib/socket';
import { GAME_CATEGORY_OPTIONS, getGameCategoryLabel, normalizeGameCategory } from '@/lib/gameCategories';

interface Tournament {
  tournamentId: string;
  name: string;
  description?: string;
  gameCategory?: string | null;
  entryFee: number;
  maxPlayers: number;
  currentPlayers: number;
  status: 'draft' | 'upcoming' | 'active' | 'stopped' | 'completed' | 'cancelled';
  startTime?: string;
  createdAt: string;
  seasonDuration?: number;
  competitionWalletId?: string;
  stage?: string;
}

interface Wallet {
  balance: number;
  walletId: string;
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

const FIXTURE_DELAY_MINUTES = 4;

const isJoiningClosed = (season: Season) => {
  if (season.joiningClosed) return true;
  if (!season.startTime) return false;
  const startTime = new Date(season.startTime);
  if (Number.isNaN(startTime.getTime())) return false;
  const joiningCloseAt = new Date(startTime.getTime() - FIXTURE_DELAY_MINUTES * 60 * 1000);
  return Date.now() >= joiningCloseAt.getTime();
};

const TournamentsPage: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filteredTournaments, setFilteredTournaments] = useState<Tournament[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedGameCategory, setSelectedGameCategory] = useState<string>('ALL');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [seasonsByTournament, setSeasonsByTournament] = useState<Record<string, Season[]>>({});
  const [loadingSeasons, setLoadingSeasons] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [alertModal, setAlertModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'error' | 'success' | 'info';
  }>({ open: false, title: '', message: '', type: 'info' });
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  const playerId = (session?.user as any)?.userId as string | undefined;
  const accessToken = (session as any)?.accessToken as string | undefined;
  const clubIdFromSession = (session?.user as any)?.clubId as string | undefined;
  const role = (session?.user as any)?.role as string | undefined;
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);
  const [playerClubId, setPlayerClubId] = useState<string | null>(null);

  const apiBase = getApiBaseUrl();
  const socketTarget = useMemo(
    () => normalizeSocketTarget(process.env.NEXT_PUBLIC_ADMIN_WS_URL || apiBase),
    [apiBase]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const normalizedRole = (role || '').toLowerCase();
        const isAgent = normalizedRole === 'agent';
        let clubId = clubIdFromSession || playerClubId || null;

        if (!clubId && isAgent && accessToken) {
          try {
            const profileRes = await agentApi.getProfile(accessToken);
            clubId = profileRes?.data?.agent?.clubId || null;
          } catch (err) {
            console.error('Failed to fetch agent profile:', err);
          }
        }

        if (!clubId && !isAgent && playerId) {
          try {
            const playerStats = await playerApi.getStats(playerId, accessToken);
            clubId = (playerStats?.data as any)?.clubId || null;
            setPlayerClubId(clubId);
          } catch (err: any) {
            if (err?.status === 404 && (session?.user as any)?.username) {
              await playerApi.createOrUpdatePlayer({
                playerId,
                username: (session?.user as any)?.username
              }, accessToken);
              const retry = await playerApi.getStats(playerId, accessToken);
              clubId = (retry?.data as any)?.clubId || null;
              setPlayerClubId(clubId);
            } else if (err?.status !== 404) {
              throw err;
            }
          }
        }

        // Fetch tournaments (public)
        if (clubId) {
          const tournamentsData = await tournamentApi.getTournaments(1, 50, 'active', clubId);
          setTournaments(tournamentsData.data || []);
        } else {
          setTournaments([]);
        }

        // Fetch wallet (requires auth)
        if (accessToken) {
          try {
            const walletData = await walletApi.getWallet(accessToken);
            setWallet(walletData.data);
          } catch (error) {
            console.error('Failed to fetch wallet:', error);
          }
        } else {
          setWallet(null);
        }
      } catch (error) {
        console.error('Failed to fetch tournaments:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [accessToken, clubIdFromSession, playerClubId, playerId, role, session]);

  useEffect(() => {
    let filtered = tournaments;

    if (searchTerm) {
      filtered = filtered.filter(tournament =>
        tournament.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        tournament.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedType !== 'ALL') {
      filtered = filtered.filter(tournament => {
        // Convert backend status to frontend type
        const statusMap: { [key: string]: string } = {
          'upcoming': 'SCHEDULED',
          'active': 'ACTIVE',
          'completed': 'COMPLETED'
        };
        const frontendType = statusMap[tournament.status] || tournament.status;
        return frontendType === selectedType;
      });
    }

    if (selectedDifficulty !== 'ALL') {
      // This would need difficulty field from backend
      filtered = filtered.filter(tournament => true);
    }

    if (selectedStatus !== 'ALL') {
      filtered = filtered.filter(tournament => tournament.status === selectedStatus.toLowerCase());
    }

    if (selectedGameCategory !== 'ALL') {
      filtered = filtered.filter((tournament) => {
        const category = normalizeGameCategory(tournament.gameCategory) || 'BILLIARDS';
        return category === selectedGameCategory;
      });
    }

    setFilteredTournaments(filtered);
  }, [searchTerm, selectedType, selectedDifficulty, selectedStatus, selectedGameCategory, tournaments]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-500';
      case 'upcoming': return 'bg-blue-500';
      case 'draft': return 'bg-purple-500';
      case 'stopped': return 'bg-yellow-600';
      case 'completed': return 'bg-gray-500';
      case 'cancelled': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'ACTIVE';
      case 'upcoming': return 'SCHEDULED';
      case 'draft': return 'DRAFT';
      case 'stopped': return 'STOPPED';
      case 'completed': return 'COMPLETED';
      case 'cancelled': return 'CANCELLED';
      default: return status.toUpperCase();
    }
  };

  const loadSeasons = async (tournamentId: string, force = false) => {
    if (!force && seasonsByTournament[tournamentId]) return;
    setLoadingSeasons((prev) => ({ ...prev, [tournamentId]: true }));
    try {
      const res = await tournamentApi.getSeasons(tournamentId);
      setSeasonsByTournament((prev) => ({ ...prev, [tournamentId]: res.data || [] }));
    } catch (error) {
      console.error('Failed to fetch seasons:', error);
    } finally {
      setLoadingSeasons((prev) => ({ ...prev, [tournamentId]: false }));
    }
  };

  useEffect(() => {
    if (!mounted) return;
    const token = (session as any)?.accessToken as string | undefined;
    if (!token) return;
    const connectionUrl = socketTarget.url || undefined;
    const s = io(connectionUrl, {
      path: socketTarget.path,
      auth: { token },
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = s;

    s.on('connect', () => {
      setSocketConnected(true);
      tournaments.forEach((tournament) => {
        s.emit('join:tournament', String(tournament.tournamentId));
      });
    });

    s.on('disconnect', () => {
      setSocketConnected(false);
    });

    s.on('season:matches_generated', (payload: any) => {
      if (payload?.tournamentId) {
        loadSeasons(payload.tournamentId, true);
      }
    });

    s.on('season:completed', (payload: any) => {
      if (payload?.tournamentId) {
        loadSeasons(payload.tournamentId, true);
      }
    });

    s.on('tournament:seasons:update', (payload: any) => {
      if (payload?.tournamentId) {
        loadSeasons(payload.tournamentId, true);
      }
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [mounted, session, tournaments, socketTarget.url, socketTarget.path]);

  useEffect(() => {
    if (!socketConnected || !socketRef.current) return;
    tournaments.forEach((tournament) => {
      socketRef.current?.emit('join:tournament', String(tournament.tournamentId));
    });
  }, [socketConnected, tournaments]);

  const getJoinDisabledReason = (tournament: Tournament, season: Season) => {
    if (season.status !== 'upcoming') return 'Season not open';
    if (isJoiningClosed(season)) return 'Joining closed';
    if (season.hasJoined) return 'Already joined';
    if (typeof tournament.maxPlayers === 'number' && typeof season.playerCount === 'number') {
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

  const handleJoinSeason = async (tournament: Tournament, season: Season) => {
    if (!session?.user?.userId) {
      setAlertModal({
        open: true,
        title: 'Login Required',
        message: 'Please login to join tournaments.',
        type: 'info'
      });
      return;
    }

    if (!wallet?.walletId) {
      setAlertModal({
        open: true,
        title: 'Wallet Unavailable',
        message: 'Wallet information is not available right now.',
        type: 'error'
      });
      return;
    }

    if (wallet.balance < tournament.entryFee) {
      setAlertModal({
        open: true,
        title: 'Insufficient Balance',
        message: 'Please add funds to your wallet before joining.',
        type: 'error'
      });
      return;
    }

    setJoining(season.seasonId);

    try {
      const token = (session as any)?.accessToken as string | undefined;
      if (token) {
        await tournamentApi.joinSeason(token, season.seasonId, session.user.userId, wallet.walletId);

        // Refresh season list for UI state
        setSeasonsByTournament((prev) => {
          const next = { ...prev };
          delete next[tournament.tournamentId];
          return next;
        });
        await loadSeasons(tournament.tournamentId);

        // Update wallet balance
        setWallet(prev => prev ? { ...prev, balance: prev.balance - tournament.entryFee } : null);

        setAlertModal({
          open: true,
          title: 'Joined Successfully',
          message: `You joined ${season.name || `Season ${season.seasonNumber}`} for ${tournament.name}.`,
          type: 'success'
        });
      } else {
        setAlertModal({
          open: true,
          title: 'Login Required',
          message: 'Please login to join tournaments.',
          type: 'info'
        });
      }
    } catch (error: any) {
      console.error('Failed to join tournament:', error);
      setAlertModal({
        open: true,
        title: 'Join Failed',
        message: error.message || 'Failed to join tournament. Please try again.',
        type: 'error'
      });
    } finally {
      setJoining(null);
    }
  };

  if (!mounted || loading) {
    return <PageLoader label="Loading tournaments…" />;
  }

  const openSeasons = Object.values(seasonsByTournament)
    .flat()
    .filter((season) => season.status === 'upcoming' && !isJoiningClosed(season));

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(20,184,166,0.15),_transparent_55%),radial-gradient(circle_at_30%_40%,_rgba(234,179,8,0.12),_transparent_55%),linear-gradient(180deg,_#0b0f1a_0%,_#070a12_45%,_#06080e_100%)] text-white">
      <AlertModal
        open={alertModal.open}
        onOpenChange={(open) => setAlertModal((prev) => ({ ...prev, open }))}
        title={alertModal.title}
        message={alertModal.message}
        type={alertModal.type}
      />
      <div className="mx-auto max-w-6xl px-4 py-10 space-y-8" style={{ fontFamily: 'var(--font-tournament)' }}>
        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Tournament Control</p>
              <h1 className="text-4xl sm:text-5xl font-semibold" style={{ fontFamily: 'var(--font-tournament-display)' }}>
                Enterprise Season Hub
              </h1>
              <p className="max-w-2xl text-sm text-white/70">
                Curated competitive seasons, transparent schedules, and live readiness tracking for every match.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-white/60">
              <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-emerald-200">Live Sync</span>
              <span className="rounded-full bg-amber-500/10 px-3 py-1 text-amber-200">Fair Scheduling</span>
            </div>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Total Tournaments</p>
              <p className="mt-2 text-2xl font-semibold">{tournaments.length}</p>
              <p className="text-xs text-emerald-200/80">Stable cycle</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Active Now</p>
              <p className="mt-2 text-2xl font-semibold">{tournaments.filter((t) => t.status === 'active').length}</p>
              <p className="text-xs text-emerald-200/80">In progress</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Open Seasons</p>
              <p className="mt-2 text-2xl font-semibold">{openSeasons.length}</p>
              <p className="text-xs text-amber-200/80">Join window</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Player Pool</p>
              <p className="mt-2 text-2xl font-semibold">{tournaments.reduce((sum, t) => sum + t.currentPlayers, 0)}</p>
              <p className="text-xs text-white/50">Across all seasons</p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-white/40" />
              <Input
                placeholder="Search tournament, season, or prize pool"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-transparent border-white/10 text-white placeholder-white/40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg"
              >
                <option value="ALL">All Types</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="ACTIVE">Active</option>
                <option value="COMPLETED">Completed</option>
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg"
              >
                <option value="ALL">All Status</option>
                <option value="active">Active</option>
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
              </select>
              <select
                value={selectedGameCategory}
                onChange={(e) => setSelectedGameCategory(e.target.value)}
                className="px-4 py-2 bg-white/5 border border-white/10 text-white rounded-lg"
              >
                <option value="ALL">All Games</option>
                {GAME_CATEGORY_OPTIONS.map((category) => (
                  <option key={category} value={category}>
                    {getGameCategoryLabel(category)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {filteredTournaments.map((tournament) => (
            <div
              key={tournament.tournamentId}
              className="flex h-full flex-col rounded-3xl border border-white/10 bg-gradient-to-br from-white/8 via-white/4 to-transparent p-5 shadow-[0_12px_40px_rgba(15,23,42,0.5)]"
            >
              <div className="flex items-start justify-between">
                <Badge className="bg-emerald-500/15 text-emerald-200 border-emerald-500/30">
                  {getStatusLabel(tournament.status)}
                </Badge>
                <Badge variant="outline" className="border-white/20 text-white/70">
                  {getGameCategoryLabel(normalizeGameCategory(tournament.gameCategory) || 'BILLIARDS')}
                </Badge>
                <span className="text-xs text-white/50">
                  {tournament.startTime ? new Date(tournament.startTime).toLocaleDateString() : 'Rolling'}
                </span>
              </div>

              <div className="mt-4 space-y-2">
                <h3 className="text-lg font-semibold" style={{ fontFamily: 'var(--font-tournament-display)' }}>
                  {tournament.name}
                </h3>
                <p className="text-sm text-white/60 line-clamp-3">{tournament.description || 'Elite season competition with structured match flow.'}</p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                  <p className="text-xs text-white/50">Entry Fee</p>
                  <p className="mt-1 text-base font-semibold">Tsh {tournament.entryFee.toLocaleString()}</p>
                </div>
              </div>

              

              <div className="mt-5 flex gap-2">
                <Button
                  className="flex-1 border-white/20 text-white hover:bg-white/10"
                  onClick={() => loadSeasons(tournament.tournamentId)}
                >
                  View Seasons
                </Button>
                <Link href={`/tournaments/${tournament.tournamentId}`}>
                  <Button size="sm" className="border-white/20 text-white hover:bg-white/10">
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                </Link>
              </div>

              {loadingSeasons[tournament.tournamentId] && (
                <p className="mt-3 text-xs text-white/60">Loading seasons…</p>
              )}

              {seasonsByTournament[tournament.tournamentId] && (
                <div className="mt-4 space-y-3">
                  {seasonsByTournament[tournament.tournamentId]
                    .filter((s) => s.status === 'upcoming')
                    .slice(0, 2)
                    .map((season) => {
                      const disabledReason = getJoinDisabledReason(tournament, season);
                      const disabled = joining === season.seasonId || disabledReason.length > 0;
                      return (
                        <div key={season.seasonId} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                          <div className="flex items-center justify-between text-xs text-white/60">
                            <span>{season.name || `Season ${season.seasonNumber}`}</span>
                            <span>{season.playerCount || 0} players</span>
                          </div>
                          {season.hasJoined ? (
                            <Button disabled className="mt-3 w-full bg-emerald-600 hover:bg-emerald-700 cursor-default">
                              ✓ Joined
                            </Button>
                          ) : (
                            <Button
                              onClick={() => handleJoinSeason(tournament, season)}
                              disabled={disabled}
                              className="mt-3 w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50"
                            >
                              {joining === season.seasonId ? 'Joining…' : `Join ${season.name || `Season ${season.seasonNumber}`}`}
                            </Button>
                          )}
                          {!season.hasJoined && disabledReason && (
                            <p className="mt-2 text-xs text-amber-200">{disabledReason}</p>
                          )}
                        </div>
                      );
                    })}

                  {seasonsByTournament[tournament.tournamentId].filter((s) => s.status === 'upcoming' && !s.joiningClosed).length === 0 && (
                    <p className="text-xs text-white/60">
                      No open seasons right now. Check back soon.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>

        {filteredTournaments.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-12 h-12 text-white/30 mx-auto mb-4" />
            <h3 className="text-lg font-semibold">No tournaments found</h3>
            <p className="text-sm text-white/50">Try adjusting your filters or search terms.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TournamentsPage;
