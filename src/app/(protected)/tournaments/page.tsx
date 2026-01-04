'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Trophy, Users, Wallet, Play, Clock, Filter, Search, Star, Eye, ArrowRight } from 'lucide-react';
import { tournamentApi, walletApi } from '@/lib/apiService';
import { useSession } from 'next-auth/react';
import { PageLoader } from '@/components/ui/page-loader';
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from '../../../lib/socket';

interface Tournament {
  tournamentId: string;
  name: string;
  description?: string;
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
  status: string;
  joiningClosed: boolean;
  matchesGenerated: boolean;
  startTime: string;
  endTime: string;
  playerCount?: number;
  hasJoined?: boolean;
}

const TournamentsPage: React.FC = () => {
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [filteredTournaments, setFilteredTournaments] = useState<Tournament[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [seasonsByTournament, setSeasonsByTournament] = useState<Record<string, Season[]>>({});
  const [loadingSeasons, setLoadingSeasons] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const { data: session } = useSession();
  const socketRef = useRef<Socket | null>(null);
  const [socketConnected, setSocketConnected] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api';
  const socketUrl = useMemo(() => apiBase.replace(/\/api\/?$/, ''), [apiBase]);
  const socketTarget = useMemo(() => normalizeSocketTarget(socketUrl), [socketUrl]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch tournaments (public)
        const tournamentsData = await tournamentApi.getTournaments();
        setTournaments(tournamentsData.data || []);

        // Fetch wallet (requires auth)
        const token = (session as any)?.accessToken as string | undefined;
        if (token) {
          try {
            const walletData = await walletApi.getWallet(token);
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
  }, [session]);

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

    setFilteredTournaments(filtered);
  }, [searchTerm, selectedType, selectedDifficulty, selectedStatus, tournaments]);

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
    const s = io(socketTarget.url, {
      path: socketTarget.path,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = s;

    s.on('connect', () => {
      setSocketConnected(true);
      const playerId = session?.user?.userId;
      const token = (session as any)?.accessToken;
      if (playerId && token) {
        s.emit('authenticate', { playerId, token });
      }
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

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [mounted, socketTarget, session]);

  useEffect(() => {
    if (!socketConnected || !socketRef.current) return;
    tournaments.forEach((tournament) => {
      socketRef.current?.emit('join:season', { tournamentId: tournament.tournamentId });
    });
  }, [socketConnected, tournaments]);

  const handleJoinSeason = async (tournament: Tournament, season: Season) => {
    if (!session?.user?.userId) {
      alert('Please login to join tournaments');
      return;
    }

    if (!wallet?.walletId) {
      alert('Wallet information not available');
      return;
    }

    if (wallet.balance < tournament.entryFee) {
      alert('Insufficient balance. Please add funds to your wallet.');
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

        alert(`Successfully joined Season ${season.seasonNumber} for: ${tournament.name}`);
      } else {
        alert('Please login to join tournaments');
      }
    } catch (error: any) {
      console.error('Failed to join tournament:', error);
      alert(error.message || 'Failed to join tournament. Please try again.');
    } finally {
      setJoining(null);
    }
  };

  if (!mounted || loading) {
    return <PageLoader label="Loading tournaments…" />;
  }

  return (
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">Tournaments</h1>
          <p className="text-xl text-purple-200">Join exciting tournaments and compete for amazing prizes</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-gradient-to-r from-purple-900/50 to-purple-900/20 border-purple-800/30">
            <CardContent className="p-6 text-center">
              <Trophy className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white">{tournaments.length}</h3>
              <p className="text-sm text-purple-300">Total Tournaments</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-purple-900/50 to-purple-900/20 border-purple-800/30">
            <CardContent className="p-6 text-center">
              <Play className="w-12 h-12 text-green-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white">{tournaments.filter(t => t.status === 'active').length}</h3>
              <p className="text-sm text-purple-300">Active Now</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-purple-900/50 to-purple-900/20 border-purple-800/30">
            <CardContent className="p-6 text-center">
              <Users className="w-12 h-12 text-cyan-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white">{tournaments.reduce((sum, t) => sum + t.currentPlayers, 0)}</h3>
              <p className="text-sm text-purple-300">Players Playing</p>
            </CardContent>
          </Card>
          
          <Card className="bg-gradient-to-r from-purple-900/50 to-purple-900/20 border-purple-800/30">
            <CardContent className="p-6 text-center">
              <Wallet className="w-12 h-12 text-purple-400 mx-auto mb-4" />
              <h3 className="text-2xl font-bold text-white">
                Tsh {tournaments.reduce((sum, t) => sum + (t.entryFee * t.currentPlayers), 0).toLocaleString()}
              </h3>
              <p className="text-sm text-purple-300">Total Entry Fees</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-gray-800/50 border-gray-700 mb-8">
          <CardContent className="p-6">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                  <Input
                    placeholder="Search tournaments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 bg-gray-700/50 border-gray-600 text-white placeholder-gray-400"
                  />
                </div>
              </div>
              
              <div className="flex flex-wrap gap-2">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="px-4 py-2 bg-gray-700/50 border-gray-600 text-white rounded-lg"
                >
                  <option value="ALL">All Types</option>
                  <option value="SCHEDULED">Scheduled</option>
                  <option value="ACTIVE">Active</option>
                  <option value="COMPLETED">Completed</option>
                </select>
                
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value)}
                  className="px-4 py-2 bg-gray-700/50 border-gray-600 text-white rounded-lg"
                >
                  <option value="ALL">All Status</option>
                  <option value="active">Active</option>
                  <option value="upcoming">Upcoming</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tournaments Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTournaments.map((tournament) => (
            <Card key={tournament.tournamentId} className="bg-gray-800/50 border-gray-700 hover:bg-gray-700/80 transition-all duration-300">
              <CardHeader>
                <div className="flex justify-between items-start mb-2">
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30">
                    {tournament.status}
                  </Badge>
                </div>
                <CardTitle className="text-white">{tournament.name}</CardTitle>
                <CardDescription className="text-gray-400">{tournament.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-400">Entry Fee</p>
                      <p className="text-lg font-bold text-white">Tsh {tournament.entryFee}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-400">Players</p>
                      <p className="text-lg font-bold text-white">{tournament.currentPlayers}/{tournament.maxPlayers}</p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Status</span>
                      <Badge className={`${getStatusColor(tournament.status)} text-white`}>
                        {getStatusLabel(tournament.status)}
                      </Badge>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2">
                      <div 
                        className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full"
                        style={{ width: `${(tournament.currentPlayers / tournament.maxPlayers) * 100}%` }}
                      ></div>
                    </div>
                  </div>

                  {tournament.startTime && (
                    <div className="flex items-center text-sm text-gray-400">
                      <Clock className="w-4 h-4 mr-2" />
                      Starts {new Date(tournament.startTime).toLocaleDateString()}
                    </div>
                  )}
                  
                  <div className="flex gap-2">
                    <Button
                      
                      className="flex-1 border-purple-500/40 text-purple-200 hover:bg-purple-500/10"
                      onClick={() => loadSeasons(tournament.tournamentId)}
                    >
                      View Seasons
                    </Button>
                    <Link href={`/tournaments/${tournament.tournamentId}`}>
                      <Button
                        
                        size="sm"
                        className="border-gray-600 text-gray-300 hover:bg-gray-700"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                  </div>

                  {loadingSeasons[tournament.tournamentId] && (
                    <p className="text-xs text-white/60 mt-2">Loading seasons...</p>
                  )}

                  {seasonsByTournament[tournament.tournamentId] && (
                    <div className="mt-3 space-y-2">
                      {seasonsByTournament[tournament.tournamentId]
                        .filter((s) => s.status === 'upcoming' && !s.joiningClosed)
                        .slice(0, 2)
                        .map((season) => (
                          <div key={season.seasonId} className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-400">
                                Season {season.seasonNumber}
                              </span>
                              <span className="text-purple-300">
                                {season.playerCount || 0} players
                              </span>
                            </div>
                            {season.hasJoined ? (
                              <Button
                                disabled
                                className="w-full bg-green-600 hover:bg-green-700 cursor-default"
                              >
                                ✓ Joined
                              </Button>
                            ) : (
                              <Button
                                onClick={() => handleJoinSeason(tournament, season)}
                                disabled={joining === season.seasonId}
                                className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 disabled:opacity-50"
                              >
                                {joining === season.seasonId ? 'Joining...' : `Join Season ${season.seasonNumber}`}
                              </Button>
                            )}
                          </div>
                        ))}

                      {seasonsByTournament[tournament.tournamentId].filter((s) => s.status === 'upcoming' && !s.joiningClosed).length === 0 && (
                        <p className="text-xs text-white/60">
                          No open seasons right now. Check back soon.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {filteredTournaments.length === 0 && (
          <div className="text-center py-12">
            <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">No tournaments found</h3>
            <p className="text-gray-400">Try adjusting your filters or search terms</p>
          </div>
        )}
      </div>
  );
};

export default TournamentsPage;
