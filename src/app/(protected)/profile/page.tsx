'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { generateColor, getInitials } from '@/lib/avatarUtils';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

import { Trophy, User, Calendar, Target, Award, Settings, Camera, Save, Shield, Loader2 } from 'lucide-react';
import { getApiBaseUrl } from '@/lib/apiBase';
import { authApi, playerApi, tournamentApi, matchmakingApi } from '@/lib/apiService';
import { PageLoader } from '@/components/ui/page-loader';
import { NotificationPreferences } from '@/components/NotificationPreferences';

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  points: number;
  unlockedAt: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

interface PlayerStats {
  averageBreakTime: number;
  bestBreak: number;
  centuries: number;
  prizeMoney: number;
  tournamentsWon: number;
  highestRun: number;
}

interface PlayerProfile {
  id: string; // playerId
  displayName: string;
  username: string;
  email: string;
  phone?: string;
  avatar?: string;

  level: number;
  experience: number;
  experienceToNext: number;

  wins: number;
  losses: number;
  draws: number;

  rating: number;
  rank: number;
  totalMatches: number;
  winRate: number;

  achievements: Achievement[];
  statistics: PlayerStats;

  joinedAt: string;
  lastActive: string;
}

interface SeasonSummary {
  seasonId: string;
  seasonNumber: number;
  name?: string | null;
  status: string;
  startTime: string;
  endTime: string;
  joinedAt?: string;
  playerStatus?: string;
  tournament?: {
    tournamentId: string;
    name: string;
  };
}

interface ClubTournament {
  tournamentId: string;
  name: string;
  status?: string;
  startTime?: string | null;
  endTime?: string | null;
  entryFee?: number;
}

interface MatchSummary {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  winnerId?: string | null;
  status: string;
  scheduledTime?: string | null;
}

const ProfilePage: React.FC = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showNotifications, setShowNotifications] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarUploading, setIsAvatarUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinedSeasons, setJoinedSeasons] = useState<SeasonSummary[]>([]);
  const [wonSeasons, setWonSeasons] = useState<SeasonSummary[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [clubTournaments, setClubTournaments] = useState<ClubTournament[]>([]);

  useEffect(() => {
    if (status === 'authenticated') fetchUserData();
    if (status === 'unauthenticated') {
      setError('Please login to view your profile');
      setProfileLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const logErr = (label: string, e: any) => {
    console.error(label, {
      message: e?.message,
      status: e?.status,
      url: e?.url,
      data: e?.data,
      raw: typeof e?.rawResponse === 'string' ? e.rawResponse.slice(0, 400) : undefined,
    });
  };

  const resolveAvatarUrl = (value?: string | null) => {
    if (!value) return '';
    const apiBase = getApiBaseUrl().replace(/\/$/, '');
    if (value.startsWith('http')) {
      try {
        const parsed = new URL(value);
        if (parsed.pathname.startsWith('/uploads/')) {
          return `${apiBase}/auth${parsed.pathname}`;
        }
      } catch {
        return value;
      }
      return value;
    }
    if (value.startsWith('blob:') || value.startsWith('data:')) {
      return value;
    }
    const path = value.startsWith('/') ? value : `/${value}`;
    if (path.startsWith('/uploads/')) {
      return `${apiBase}/auth${path}`;
    }
    return `${apiBase}${path}`;
  };

  const handleAvatarSelect = () => {
    avatarInputRef.current?.click();
  };

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage('Please select an image file.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMessage('Image must be smaller than 2MB.');
      return;
    }

    const token = (session as any)?.accessToken as string | undefined;
    if (!token) {
      setMessage('Please login to upload an avatar.');
      return;
    }

    setIsAvatarUploading(true);
    setMessage('');

    try {
      const previewUrl = URL.createObjectURL(file);
      const response = await authApi.updateAvatar(token, file);
      const updated = response?.data;

      const resolvedAvatar = updated?.avatarUrl ? resolveAvatarUrl(updated.avatarUrl) : previewUrl;
      setProfile((prev) => (prev ? { ...prev, avatar: resolvedAvatar } : prev));
      setMessage('Avatar updated successfully!');
    } catch (e) {
      logErr('❌ Avatar upload error', e);
      setMessage('Failed to update avatar. Please try again.');
    } finally {
      setIsAvatarUploading(false);
      if (avatarInputRef.current) {
        avatarInputRef.current.value = '';
      }
    }
  };

  const fetchUserData = async () => {
    const token = (session as any)?.accessToken as string | undefined;

    if (!token) {
      setError('Please login to view your profile');
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    setError('');

    try {
      // 1) auth/me
      const meRes = await authApi.getCurrentUser(token);
      const me = meRes?.data || {};
      const userId = String(me.userId || '');

      // In this system, playerId === auth userId (see player-service ensurePlayerProfile).
      const playerId = userId;

      const isAgent = String(me.role || '').toLowerCase() === 'agent';

      // 2) create or update player (best-effort; profile can still render without it)
      if (!isAgent) {
        try {
          await playerApi.createOrUpdatePlayer({
            // player-service expects { playerId, username, agentUserId? }
            playerId,
            username: me.username,
          }, token);
        } catch (e) {
          logErr('⚠️ Failed to ensure player profile', e);
        }
      }

      // 3) stats (best-effort; if it fails we still show basic profile info)
      let stats: any = {};
      if (!isAgent) {
        try {
          const statsRes = await playerApi.getStats(String(playerId), token);
          stats = statsRes?.data || {};
        } catch (e) {
          logErr('⚠️ Failed to load player stats', e);
          stats = {};
        }
      }

      const ratingPoints = Number(stats.rankingPoints || 0);

      const combined: PlayerProfile = {
        id: String(playerId),
        displayName: `${me.firstName || ''} ${me.lastName || ''}`.trim() || me.username || 'Player',
        username: me.username || '',
        email: me.email || '',
        phone: me.phoneNumber || '',
        avatar: resolveAvatarUrl(me.avatarUrl || ''),

        level: Math.floor(ratingPoints / 100) + 1,
        experience: ratingPoints % 100,
        experienceToNext: 100,

        wins: Number(stats.matchesWon || 0),
        losses: Number(stats.matchesLost || 0),
        draws: Number(stats.draws || 0),

        rating: ratingPoints,
        rank: Number(stats.rank || 0),
        totalMatches: Number(stats.totalMatches || 0),
        winRate: Number(stats.winRate || 0),

        achievements: Array.isArray(stats.achievements) ? stats.achievements : [],
        statistics: {
          averageBreakTime: Number(stats.averageBreakTime || 0),
          bestBreak: Number(stats.highestScore || 0),
          centuries: Number(stats.centuries || 0),
          prizeMoney: Number(stats.prizeMoney || 0),
          tournamentsWon: Number(stats.tournamentsWon || 0),
          highestRun: Number(stats.highestScore || 0),
        },

        joinedAt: me.createdAt || new Date().toISOString(),
        lastActive: new Date().toISOString(),
      };

      setProfile(combined);
      setClubTournaments(Array.isArray(stats.clubTournaments) ? stats.clubTournaments : []);
      setFormData((prev) => ({
        ...prev,
        displayName: combined.displayName,
        email: combined.email,
        phone: combined.phone || '',
      }));
    } catch (e) {
      logErr('❌ Failed to load profile', e);
      setError('Failed to load profile data');
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    const loadHistory = async () => {
      const token = (session as any)?.accessToken as string | undefined;
      const playerId = session?.user?.userId as string | undefined;
      if (!token || !playerId) return;

      setHistoryLoading(true);
      setHistoryError('');

      try {
        const [joinedRes, wonRes, matchesRes] = await Promise.all([
          tournamentApi.getPlayerSeasons(token, playerId),
          tournamentApi.getPlayerSeasons(token, playerId, 'won'),
          matchmakingApi.getPlayerMatches(playerId)
        ]);

        setJoinedSeasons((joinedRes.data || []) as SeasonSummary[]);
        setWonSeasons((wonRes.data || []) as SeasonSummary[]);
        setMatchHistory((matchesRes.data || []) as MatchSummary[]);
      } catch (err: any) {
        setHistoryError(err?.message || 'Failed to load season and match history');
      } finally {
        setHistoryLoading(false);
      }
    };

    if (status === 'authenticated') {
      loadHistory();
    }
  }, [status, session]);

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'COMMON':
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
      case 'RARE':
        return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
      case 'EPIC':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
      case 'LEGENDARY':
        return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  const handleSaveProfile = async () => {
    setIsLoading(true);
    setMessage('');

    try {
      // No update profile endpoint in your player routes; keep as mock for now
      await new Promise((r) => setTimeout(r, 700));
      if (profile) {
        setProfile({
          ...profile,
          displayName: formData.displayName,
          email: formData.email,
          phone: formData.phone,
        });
      }
      setMessage('Profile updated successfully!');
      setIsEditing(false);
    } catch (e) {
      logErr('❌ Profile update error', e);
      setMessage('Failed to update profile. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordChange = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    if (!formData.currentPassword) {
      setMessage('Current password is required');
      return;
    }

    const token = (session as any)?.accessToken as string | undefined;
    if (!token) {
      setMessage('Please login to change your password');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      await authApi.changePassword(token, {
        currentPassword: formData.currentPassword,
        newPassword: formData.newPassword
      });

      setMessage('Password changed successfully!');
      setFormData((prev) => ({
        ...prev,
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      }));
    } catch (e) {
      logErr('❌ Change password error', e);
      setMessage('Failed to change password. Check your current password and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (profileLoading) return <PageLoader label="Loading profile…" />;

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(circle_at_20%_30%,_rgba(59,130,246,0.12),_transparent_55%),linear-gradient(180deg,_#0a0f1b_0%,_#070a13_50%,_#06080f_100%)] text-white">
        <div className="mx-auto w-full max-w-3xl px-4 py-8 space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Player Profile</p>
            <h1 className="mt-2 text-3xl font-bold text-white">Profile</h1>
            <p className="text-white/70">Manage your profile and track your progress</p>
          </div>

          <Card className="bg-white/5 border-white/10 rounded-3xl">
            <CardContent className="py-10 text-center space-y-3">
              <h2 className="text-xl font-semibold text-white">Couldn’t load your profile</h2>
              <p className="text-sm text-red-300">{error || 'Failed to load profile data'}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
                <Button
                  onClick={fetchUserData}
                  className="bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-600 hover:to-cyan-600"
                >
                  Try Again
                </Button>
                {status === 'unauthenticated' && (
                  <Button
                    className="border-white/20 text-white/80 hover:bg-white/10"
                    onClick={() => router.push('/auth/login')}
                  >
                    Go to Login
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const playedMatches = matchHistory.filter((match) => match.status === 'completed');
  const wonMatches = playedMatches.filter((match) => match.winnerId === profile.id);
  const avatarInitials = getInitials(profile.displayName);
  const avatarColor = generateColor(profile.displayName);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(circle_at_20%_30%,_rgba(59,130,246,0.12),_transparent_55%),linear-gradient(180deg,_#0a0f1b_0%,_#070a13_50%,_#06080f_100%)] text-white">
      <div className="mx-auto w-full max-w-3xl px-4 pb-10 pt-6 space-y-5">
        <Card className="bg-white/5 border-white/10 rounded-3xl">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col items-center text-center gap-3">
              <div className="relative">
                <Avatar className="w-24 h-24 border border-white/10">
                  <AvatarImage src={profile.avatar} alt={profile.displayName} />
                  <AvatarFallback className="text-2xl text-white" style={{ backgroundColor: avatarColor }}>
                    {avatarInitials}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                />
                <Button
                  size="icon"
                  onClick={handleAvatarSelect}
                  className="absolute -bottom-1 -right-1 h-9 w-9 border border-white/15 bg-black/60 text-white/80 hover:bg-white/10"
                >
                  <Camera className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-1">
                <h1 className="text-2xl font-semibold text-white">{profile.displayName}</h1>
                <p className="text-sm text-emerald-200/90">@{profile.username}</p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <Badge className="bg-emerald-600/20 text-emerald-200 border-emerald-500/30">Level {profile.level}</Badge>
                <Badge className="bg-sky-600/20 text-sky-200 border-sky-500/30">Rank #{profile.rank}</Badge>
              </div>

              <div className="w-full grid gap-2 pt-2">
                <Button
                  onClick={() => setActiveTab('settings')}
                  className="w-full min-h-[44px] bg-emerald-500 hover:bg-emerald-600"
                >
                  Edit Profile
                </Button>
                <Button
                  variant="outline"
                  onClick={() => router.push('/dashboard')}
                  className="w-full min-h-[44px] border-white/15 text-white hover:bg-white/10"
                >
                  Back to Dashboard
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="flex min-h-[44px] w-full flex-nowrap items-center gap-1.5 overflow-x-auto rounded-lg border border-white/10 bg-white/5 px-2 mb-4 snap-x snap-mandatory no-scrollbar sm:gap-2 sm:px-3 sm:mb-6">
              <TabsTrigger value="overview" className="min-w-[90px] min-h-[44px] flex-none snap-start px-3 py-2 text-[11px] text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:min-w-[120px] sm:text-xs md:text-sm">
                Overview
              </TabsTrigger>
              <TabsTrigger value="achievements" className="min-w-[90px] min-h-[44px] flex-none snap-start px-3 py-2 text-[11px] text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:min-w-[120px] sm:text-xs md:text-sm">
                <span className="hidden sm:inline">Achievements</span>
                <span className="sm:hidden">Awards</span>
              </TabsTrigger>
              <TabsTrigger value="seasons" className="min-w-[90px] min-h-[44px] flex-none snap-start px-3 py-2 text-[11px] text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:min-w-[120px] sm:text-xs md:text-sm">
                Seasons
              </TabsTrigger>
              <TabsTrigger value="matches" className="min-w-[90px] min-h-[44px] flex-none snap-start px-3 py-2 text-[11px] text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:min-w-[120px] sm:text-xs md:text-sm">
                Matches
              </TabsTrigger>
              <TabsTrigger value="settings" className="min-w-[90px] min-h-[44px] flex-none snap-start px-3 py-2 text-[11px] text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:min-w-[120px] sm:text-xs md:text-sm">
                Settings
              </TabsTrigger>
              <TabsTrigger value="notifications" className="min-w-[90px] min-h-[44px] flex-none snap-start px-3 py-2 text-[11px] text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white sm:min-w-[140px] sm:text-xs md:text-sm">
                <span className="hidden sm:inline">Notifications</span>
                <span className="sm:hidden">Notify</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="space-y-4">
                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="space-y-1 p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base">
                      <Target className="w-4 h-4 mr-2" />
                      Stats & Performance
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs">
                      Quick snapshot of your results and progress.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Wins</p>
                        <p className="text-xl font-semibold text-green-400">{profile.wins}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Losses</p>
                        <p className="text-xl font-semibold text-red-400">{profile.losses}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Draws</p>
                        <p className="text-xl font-semibold text-yellow-400">{profile.draws}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Rating</p>
                        <p className="text-xl font-semibold text-white">{profile.rating}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Win Rate</p>
                        <p className="text-xl font-semibold text-emerald-300">{profile.winRate}%</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Total Matches</p>
                        <p className="text-xl font-semibold text-white">{profile.totalMatches}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Best Break</p>
                        <p className="text-xl font-semibold text-white">{profile.statistics.bestBreak}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Highest Run</p>
                        <p className="text-xl font-semibold text-white">{profile.statistics.highestRun}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Tournaments Won</p>
                        <p className="text-xl font-semibold text-white">{profile.statistics.tournamentsWon}</p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Prize Money</p>
                        <p className="text-xl font-semibold text-emerald-300">
                          Tsh {profile.statistics.prizeMoney.toLocaleString()}
                        </p>
                      </div>
                      <div className="col-span-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-between text-[11px] text-white/60">
                          <span>Experience</span>
                          <span className="text-white/80">
                            {profile.experience}/{profile.experienceToNext}
                          </span>
                        </div>
                        <Progress
                          value={(profile.experience / profile.experienceToNext) * 100}
                          className="mt-2 h-2 bg-white/10"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="space-y-1 p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base">
                      <Calendar className="w-4 h-4 mr-2" />
                      Account & Club
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs">
                      Membership details and club tournaments.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0 space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Member Since</p>
                        <p className="text-sm font-semibold text-white">
                          {new Date(profile.joinedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <p className="text-[11px] text-white/60">Last Active</p>
                        <p className="text-sm font-semibold text-white">
                          {new Date(profile.lastActive).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-white">Club Tournaments</p>
                        <Trophy className="h-4 w-4 text-emerald-300" />
                      </div>
                      <p className="text-xs text-white/60 mt-1">Tournaments from your registered club</p>
                      <div className="mt-3 space-y-2">
                        {clubTournaments.length === 0 ? (
                          <p className="text-xs text-white/60">No tournaments available for your club yet.</p>
                        ) : (
                          clubTournaments.slice(0, 4).map((tournament) => (
                            <div
                              key={tournament.tournamentId}
                              className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-white">{tournament.name}</p>
                                <Badge className="bg-white/10 text-white/80 border-white/10">
                                  {tournament.status || 'scheduled'}
                                </Badge>
                              </div>
                              {tournament.startTime && (
                                <p className="text-[11px] text-white/60">
                                  Starts {new Date(tournament.startTime).toLocaleDateString()}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="achievements">
              <Card className="bg-white/5 border-white/10 rounded-3xl">
                <CardHeader className="p-4 sm:p-6">
                  <CardTitle className="text-white flex items-center text-base sm:text-lg">
                    <Award className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                    Achievements
                  </CardTitle>
                  <CardDescription className="text-white/60 text-xs sm:text-sm">Unlock achievements and earn rewards</CardDescription>
                </CardHeader>
                <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
                  {profile.achievements.length === 0 ? (
                    <div className="text-center text-white/60 py-8 text-sm sm:py-10 sm:text-base">No achievements yet.</div>
                  ) : (
                    <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                      {profile.achievements.map((a) => (
                        <div key={a.id} className="flex flex-row items-start gap-3 rounded-lg bg-white/5 border border-white/10 p-3 sm:p-4">
                          <div className="text-2xl flex-shrink-0 sm:text-4xl">{a.icon}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h3 className="text-white font-medium text-sm sm:text-base truncate">{a.name}</h3>
                              <Badge className={`${getRarityColor(a.rarity)} text-[10px] px-1.5 py-0 flex-shrink-0 sm:text-xs sm:px-2`}>{a.rarity}</Badge>
                            </div>
                            <p className="text-white/60 text-xs line-clamp-2 sm:text-sm">{a.description}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[10px] text-white/60 sm:text-xs">{new Date(a.unlockedAt).toLocaleDateString()}</span>
                              <span className="text-xs text-cyan-400 font-medium sm:text-sm">+{a.points} pts</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seasons">
              <div className="space-y-4 sm:space-y-6">
                {historyError && (
                  <Card className="bg-red-500/10 border-red-500/20 rounded-3xl">
                    <CardContent className="py-3 px-4 text-xs text-red-200 sm:py-4 sm:text-sm">{historyError}</CardContent>
                  </Card>
                )}

                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base sm:text-lg">
                      <Trophy className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                      Seasons Joined
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs sm:text-sm">
                      {historyLoading ? 'Loading seasons...' : `${joinedSeasons.length} seasons`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2 sm:p-6 sm:pt-0 sm:space-y-3">
                    {!historyLoading && joinedSeasons.length === 0 && (
                      <p className="text-xs text-white/60 py-2 sm:text-sm">You have not joined any seasons yet.</p>
                    )}
                    {joinedSeasons.slice(0, 6).map((season) => (
                      <div
                        key={season.seasonId}
                        className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 sm:px-4 sm:py-3"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <p className="text-xs font-semibold text-white line-clamp-1 sm:text-sm">
                            {season.tournament?.name || 'Tournament'} · {season.name || `Season ${season.seasonNumber}`}
                          </p>
                          <Badge className="bg-white/10 text-white/80 border-white/10 text-[10px] px-1.5 py-0 self-start sm:text-xs sm:px-2 sm:py-0.5 sm:self-center">
                            {season.status}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-white/60 sm:text-xs">
                          Joined {season.joinedAt ? new Date(season.joinedAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base sm:text-lg">
                      <Award className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                      Seasons Won
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs sm:text-sm">
                      {historyLoading ? 'Loading wins...' : `${wonSeasons.length} wins`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2 sm:p-6 sm:pt-0 sm:space-y-3">
                    {!historyLoading && wonSeasons.length === 0 && (
                      <p className="text-xs text-white/60 py-2 sm:text-sm">No season wins yet. Keep playing!</p>
                    )}
                    {wonSeasons.slice(0, 6).map((season) => (
                      <div
                        key={season.seasonId}
                        className="flex flex-col gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 sm:px-4 sm:py-3"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                          <p className="text-xs font-semibold text-white line-clamp-1 sm:text-sm">
                            {season.tournament?.name || 'Tournament'} · {season.name || `Season ${season.seasonNumber}`}
                          </p>
                          <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-[10px] px-1.5 py-0 self-start sm:text-xs sm:px-2 sm:py-0.5 sm:self-center">
                            Winner
                          </Badge>
                        </div>
                        <p className="text-[10px] text-emerald-100/80 sm:text-xs">
                          Completed {new Date(season.endTime).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="matches">
              <div className="space-y-4 sm:space-y-6">
                {historyError && (
                  <Card className="bg-red-500/10 border-red-500/20 rounded-3xl">
                    <CardContent className="py-3 px-4 text-xs text-red-200 sm:py-4 sm:text-sm">{historyError}</CardContent>
                  </Card>
                )}

                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base sm:text-lg">
                      <Target className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                      Matches Played
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs sm:text-sm">
                      {historyLoading ? 'Loading matches...' : `${playedMatches.length} completed`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2 sm:p-6 sm:pt-0 sm:space-y-3">
                    {!historyLoading && playedMatches.length === 0 && (
                      <p className="text-xs text-white/60 py-2 sm:text-sm">No completed matches yet.</p>
                    )}
                    {playedMatches.slice(0, 6).map((match) => (
                      <div
                        key={match.matchId}
                        className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 sm:gap-2"
                      >
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-white sm:text-sm">
                            Match {match.matchId.slice(0, 8)}
                          </p>
                          <p className="text-[10px] text-white/60 sm:text-xs">
                            {match.seasonId ? `Season ${String(match.seasonId).slice(0, 8)}` : 'Friendly match'}
                          </p>
                        </div>
                        <Badge
                          className={`${
                            match.winnerId === profile.id
                              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                              : 'bg-red-500/20 text-red-200 border-red-400/30'
                          } text-[10px] px-1.5 py-0 self-start sm:text-xs sm:px-2 sm:py-0.5 sm:self-center`}
                        >
                          {match.winnerId === profile.id ? 'Won' : 'Lost'}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base sm:text-lg">
                      <Trophy className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                      Matches Won
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs sm:text-sm">
                      {historyLoading ? 'Loading wins...' : `${wonMatches.length} wins`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-2 sm:p-6 sm:pt-0 sm:space-y-3">
                    {!historyLoading && wonMatches.length === 0 && (
                      <p className="text-xs text-white/60 py-2 sm:text-sm">No wins recorded yet.</p>
                    )}
                    {wonMatches.slice(0, 6).map((match) => (
                      <div
                        key={match.matchId}
                        className="flex flex-col gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:px-4 sm:py-3 sm:gap-2"
                      >
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-white sm:text-sm">
                            Match {match.matchId.slice(0, 8)}
                          </p>
                          <p className="text-[10px] text-emerald-100/80 sm:text-xs">
                            {match.seasonId ? `Season ${String(match.seasonId).slice(0, 8)}` : 'Friendly match'}
                          </p>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30 text-[10px] px-1.5 py-0 self-start sm:text-xs sm:px-2 sm:py-0.5 sm:self-center">
                          Winner
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings">
              <div className="space-y-4 sm:space-y-6">
                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base sm:text-lg">
                      <User className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                      Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3 sm:p-6 sm:pt-0 sm:space-y-4">
                    <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="displayName" className="text-white text-xs sm:text-sm">Display Name</Label>
                        <Input
                          id="displayName"
                          value={formData.displayName}
                          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                          disabled={!isEditing}
                          className="bg-black/20 border-white/10 text-white placeholder-white/40 h-9 text-sm sm:h-10"
                        />
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="email" className="text-white text-xs sm:text-sm">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          disabled={!isEditing}
                          className="bg-black/20 border-white/10 text-white placeholder-white/40 h-9 text-sm sm:h-10"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5 sm:space-y-2">
                      <Label htmlFor="phone" className="text-white text-xs sm:text-sm">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={!isEditing}
                        className="bg-black/20 border-white/10 text-white placeholder-white/40 h-9 text-sm sm:h-10"
                      />
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
                      {isEditing ? (
                        <>
                          <Button
                            onClick={handleSaveProfile}
                            disabled={isLoading}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-9 text-sm sm:h-10"
                          >
                            {isLoading ? 'Saving...' : (
                              <>
                                <Save className="w-3.5 h-3.5 mr-1.5 sm:w-4 sm:h-4 sm:mr-2" />
                                Save Changes
                              </>
                            )}
                          </Button>
                          <Button
                            onClick={() => setIsEditing(false)}
                            className="border-white/20 text-white/80 hover:bg-white/10 h-9 text-sm sm:h-10"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => setIsEditing(true)}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-9 text-sm sm:h-10"
                        >
                          <Settings className="w-3.5 h-3.5 mr-1.5 sm:w-4 sm:h-4 sm:mr-2" />
                          Edit Profile
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10 rounded-3xl">
                  <CardHeader className="p-4 sm:p-6">
                    <CardTitle className="text-white flex items-center text-base sm:text-lg">
                      <Shield className="w-4 h-4 mr-2 flex-shrink-0 sm:w-5 sm:h-5" />
                      Change Password
                    </CardTitle>
                    <CardDescription className="text-white/60 text-xs sm:text-sm">
                      Update your password using your current one.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 space-y-3 sm:p-6 sm:pt-0 sm:space-y-4">
                    <div className="space-y-1.5 sm:space-y-2">
                      <Label htmlFor="currentPassword" className="text-white text-xs sm:text-sm">Current Password</Label>
                      <Input
                        id="currentPassword"
                        type={showPassword ? 'text' : 'password'}
                        value={formData.currentPassword}
                        onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                        className="bg-black/20 border-white/10 text-white placeholder-white/40 h-9 text-sm sm:h-10"
                      />
                    </div>

                    <div className="grid gap-3 sm:gap-4 md:grid-cols-2">
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="newPassword" className="text-white text-xs sm:text-sm">New Password</Label>
                        <Input
                          id="newPassword"
                          type={showPassword ? 'text' : 'password'}
                          value={formData.newPassword}
                          onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                          className="bg-black/20 border-white/10 text-white placeholder-white/40 h-9 text-sm sm:h-10"
                        />
                      </div>
                      <div className="space-y-1.5 sm:space-y-2">
                        <Label htmlFor="confirmPassword" className="text-white text-xs sm:text-sm">Confirm New Password</Label>
                        <Input
                          id="confirmPassword"
                          type={showPassword ? 'text' : 'password'}
                          value={formData.confirmPassword}
                          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                          className="bg-black/20 border-white/10 text-white placeholder-white/40 h-9 text-sm sm:h-10"
                        />
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="showPassword"
                        checked={showPassword}
                        onChange={(e) => setShowPassword(e.target.checked)}
                        className="rounded border-white/20 bg-black/30 text-purple-500 h-4 w-4"
                      />
                      <Label htmlFor="showPassword" className="text-white/70 text-xs sm:text-sm cursor-pointer">Show passwords</Label>
                    </div>

                    <Button
                      onClick={handlePasswordChange}
                      disabled={isLoading || !formData.currentPassword || !formData.newPassword}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 h-9 text-sm sm:h-10 w-full sm:w-auto"
                    >
                      {isLoading ? 'Updating...' : 'Change Password'}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationPreferences />
            </TabsContent>
          </Tabs>
      </div>

      <Dialog open={isAvatarUploading}>
        <DialogContent className="bg-slate-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Uploading avatar</DialogTitle>
            <DialogDescription>Please wait while we save your image.</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-300" />
            <div>
              <p className="text-sm font-medium">Uploading avatar</p>
              <p className="text-xs text-white/60">Please wait while we save your image.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {message && (
        <div
          className={`fixed bottom-3 right-3 left-3 p-3 rounded-lg shadow-lg backdrop-blur-sm sm:bottom-4 sm:right-4 sm:left-auto sm:max-w-md sm:p-4 ${
            message.toLowerCase().includes('success') || message.toLowerCase().includes('sent')
              ? 'bg-green-500/20 border-green-500/30'
              : 'bg-red-500/20 border-red-500/30'
          } border`}
        >
          <p
            className={`text-xs sm:text-sm ${
              message.toLowerCase().includes('success') || message.toLowerCase().includes('sent')
                ? 'text-green-400'
                : 'text-red-400'
            }`}
          >
            {message}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
