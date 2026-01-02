'use client';

import React, { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Trophy, User, Calendar, Target, Award, Settings, Camera, Save, Shield, Zap, Bell } from 'lucide-react';
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

  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showNotifications, setShowNotifications] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Keep userId around for password reset
  const [authUserId, setAuthUserId] = useState<string>('');

  // OTP reset flow state
  const [resetStep, setResetStep] = useState<'idle' | 'codeSent'>('idle');

  const [formData, setFormData] = useState({
    displayName: '',
    email: '',
    phone: '',
    // NOTE: backend doesn’t support changing password with current password
    // we keep the field only if you want UI, but it won't be used
    currentPassword: '',
    resetCode: '', // ✅ added
    newPassword: '',
    confirmPassword: '',
  });

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [profileLoading, setProfileLoading] = useState(true);
  const [error, setError] = useState('');
  const [joinedSeasons, setJoinedSeasons] = useState<SeasonSummary[]>([]);
  const [wonSeasons, setWonSeasons] = useState<SeasonSummary[]>([]);
  const [matchHistory, setMatchHistory] = useState<MatchSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

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
      setAuthUserId(userId);

      // In this system, playerId === auth userId (see player-service ensurePlayerProfile).
      const playerId = userId;

      // 2) create or update player (best-effort; profile can still render without it)
      try {
        await playerApi.createOrUpdatePlayer({
          // player-service expects { playerId, username, agentUserId? }
          playerId,
          username: me.username,
        });
      } catch (e) {
        logErr('⚠️ Failed to ensure player profile', e);
      }

      // 3) stats (best-effort; if it fails we still show basic profile info)
      let stats: any = {};
      try {
        const statsRes = await playerApi.getStats(String(playerId));
        stats = statsRes?.data || {};
      } catch (e) {
        logErr('⚠️ Failed to load player stats', e);
        stats = {};
      }

      const ratingPoints = Number(stats.rankingPoints || 0);

      const combined: PlayerProfile = {
        id: String(playerId),
        displayName: `${me.firstName || ''} ${me.lastName || ''}`.trim() || me.username || 'Player',
        username: me.username || '',
        email: me.email || '',
        phone: me.phoneNumber || '',
        avatar: '',

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

  // ✅ Step 1: send reset code
  const handleSendResetCode = async () => {
    setIsLoading(true);
    setMessage('');

    try {
      if (!formData.email) {
        setMessage('Email is missing. Please reload profile.');
        return;
      }

      await authApi.forgotPassword(formData.email);
      setResetStep('codeSent');
      setMessage(`Reset code sent to ${formData.email}`);
    } catch (e) {
      logErr('❌ Forgot password error', e);
      setMessage('Failed to send reset code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // ✅ Step 2: reset password using userId + code + newPassword
  const handlePasswordChange = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      setMessage('Passwords do not match');
      return;
    }
    if (!formData.resetCode) {
      setMessage('Enter the reset code from your email');
      return;
    }
    if (!authUserId) {
      setMessage('User ID missing. Please reload profile.');
      return;
    }

    setIsLoading(true);
    setMessage('');

    try {
      await authApi.resetPassword({
        userId: authUserId, // ✅ REQUIRED by backend
        code: formData.resetCode, // ✅ real OTP code
        newPassword: formData.newPassword,
      });

      setMessage('Password reset successfully!');
      setFormData((prev) => ({
        ...prev,
        currentPassword: '',
        resetCode: '',
        newPassword: '',
        confirmPassword: '',
      }));
      setResetStep('idle');
    } catch (e) {
      logErr('❌ Reset password error', e);
      setMessage('Failed to reset password. Check code and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (profileLoading) return <PageLoader label="Loading profile…" />;

  if (error || !profile) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Profile</h1>
          <p className="text-white/70">Manage your profile and track your progress</p>
        </div>

        <Card className="bg-white/5 border-white/10">
          <CardContent className="py-10 text-center space-y-3">
            <h2 className="text-xl font-semibold text-white">Couldn’t load your profile</h2>
            <p className="text-sm text-red-300">{error || 'Failed to load profile data'}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-3">
              <Button
                onClick={fetchUserData}
                className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
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
    );
  }

  const playedMatches = matchHistory.filter((match) => match.status === 'completed');
  const wonMatches = playedMatches.filter((match) => match.winnerId === profile.id);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-white">My Profile</h1>
        <p className="text-white/70">Manage your profile and track your progress</p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Left card */}
        <div className="lg:col-span-1">
          <Card className="bg-white/5 border-white/10">
            <CardContent className="p-6">
              <div className="text-center">
                <div className="relative inline-block">
                  <Avatar className="w-24 h-24 mx-auto mb-4">
                    <AvatarImage src={profile.avatar} alt={profile.displayName} />
                    <AvatarFallback className="text-2xl bg-gradient-to-r from-purple-600 to-pink-600">
                      {profile.displayName.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Button size="sm"  className="absolute bottom-2 right-2 border-white/20 text-white/80 hover:bg-white/10">
                    <Camera className="w-4 h-4" />
                  </Button>
                </div>

                <h2 className="text-2xl font-bold text-white mb-2">{profile.displayName}</h2>
                <p className="text-purple-300 mb-4">@{profile.username}</p>

                <div className="flex items-center justify-center space-x-2 mb-4">
                  <Badge className="bg-purple-600/20 text-purple-300 border-purple-500/30">Level {profile.level}</Badge>
                  <Badge className="bg-cyan-600/20 text-cyan-300 border-cyan-500/30">Rank #{profile.rank}</Badge>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Rating</span>
                    <span className="text-white font-semibold">{profile.rating}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Win Rate</span>
                    <span className="text-green-400 font-semibold">{profile.winRate}%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Total Matches</span>
                    <span className="text-white font-semibold">{profile.totalMatches}</span>
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-white/10">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-white/60">Experience</span>
                    <span className="text-white">
                      {profile.experience}/{profile.experienceToNext}
                    </span>
                  </div>
                  <Progress value={(profile.experience / profile.experienceToNext) * 100} className="h-2 bg-white/10" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right tabs */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6 mb-6 bg-white/5 border border-white/10">
              <TabsTrigger value="overview" className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                Overview
              </TabsTrigger>
              <TabsTrigger value="achievements" className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                Achievements
              </TabsTrigger>
              <TabsTrigger value="seasons" className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                Seasons
              </TabsTrigger>
              <TabsTrigger value="matches" className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                Matches
              </TabsTrigger>
              <TabsTrigger value="settings" className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                Settings
              </TabsTrigger>
              <TabsTrigger value="notifications" className="text-white/70 data-[state=active]:bg-white/10 data-[state=active]:text-white">
                Notifications
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview">
              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Target className="w-5 h-5 mr-2" />
                      Match Statistics
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-green-400">{profile.wins}</p>
                        <p className="text-sm text-white/60">Wins</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-400">{profile.losses}</p>
                        <p className="text-sm text-white/60">Losses</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-yellow-400">{profile.draws}</p>
                        <p className="text-sm text-white/60">Draws</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Zap className="w-5 h-5 mr-2" />
                      Performance
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Best Break</span>
                        <span className="text-white">{profile.statistics.bestBreak}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Highest Run</span>
                        <span className="text-white">{profile.statistics.highestRun}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Trophy className="w-5 h-5 mr-2" />
                      Tournament Success
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Tournaments Won</span>
                        <span className="text-white">{profile.statistics.tournamentsWon}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Prize Money</span>
                        <span className="text-green-400">Tsh {profile.statistics.prizeMoney.toLocaleString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Calendar className="w-5 h-5 mr-2" />
                      Account Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Member Since</span>
                        <span className="text-white">{new Date(profile.joinedAt).toLocaleDateString()}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-white/60">Last Active</span>
                        <span className="text-white">{new Date(profile.lastActive).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="achievements">
              <Card className="bg-white/5 border-white/10">
                <CardHeader>
                  <CardTitle className="text-white flex items-center">
                    <Award className="w-5 h-5 mr-2" />
                    Achievements
                  </CardTitle>
                  <CardDescription className="text-white/60">Unlock achievements and earn rewards</CardDescription>
                </CardHeader>
                <CardContent>
                  {profile.achievements.length === 0 ? (
                    <div className="text-center text-white/60 py-10">No achievements yet.</div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {profile.achievements.map((a) => (
                        <div key={a.id} className="flex items-center space-x-4 p-4 rounded-lg bg-white/5 border border-white/10">
                          <div className="text-4xl">{a.icon}</div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h3 className="text-white font-medium">{a.name}</h3>
                              <Badge className={getRarityColor(a.rarity)}>{a.rarity}</Badge>
                            </div>
                            <p className="text-white/60 text-sm">{a.description}</p>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-white/60">{new Date(a.unlockedAt).toLocaleDateString()}</span>
                              <span className="text-sm text-cyan-400">+{a.points} pts</span>
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
              <div className="space-y-6">
                {historyError && (
                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="py-4 text-sm text-red-200">{historyError}</CardContent>
                  </Card>
                )}

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Trophy className="w-5 h-5 mr-2" />
                      Seasons Joined
                    </CardTitle>
                    <CardDescription className="text-white/60">
                      {historyLoading ? 'Loading seasons...' : `${joinedSeasons.length} seasons`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!historyLoading && joinedSeasons.length === 0 && (
                      <p className="text-sm text-white/60">You have not joined any seasons yet.</p>
                    )}
                    {joinedSeasons.slice(0, 6).map((season) => (
                      <div
                        key={season.seasonId}
                        className="flex flex-col gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">
                            {season.tournament?.name || 'Tournament'} · Season {season.seasonNumber}
                          </p>
                          <Badge className="bg-white/10 text-white/80 border-white/10">
                            {season.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-white/60">
                          Joined {season.joinedAt ? new Date(season.joinedAt).toLocaleDateString() : '—'}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Award className="w-5 h-5 mr-2" />
                      Seasons Won
                    </CardTitle>
                    <CardDescription className="text-white/60">
                      {historyLoading ? 'Loading wins...' : `${wonSeasons.length} wins`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!historyLoading && wonSeasons.length === 0 && (
                      <p className="text-sm text-white/60">No season wins yet. Keep playing!</p>
                    )}
                    {wonSeasons.slice(0, 6).map((season) => (
                      <div
                        key={season.seasonId}
                        className="flex flex-col gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3"
                      >
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-semibold text-white">
                            {season.tournament?.name || 'Tournament'} · Season {season.seasonNumber}
                          </p>
                          <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                            Winner
                          </Badge>
                        </div>
                        <p className="text-xs text-emerald-100/80">
                          Completed {new Date(season.endTime).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="matches">
              <div className="space-y-6">
                {historyError && (
                  <Card className="bg-red-500/10 border-red-500/20">
                    <CardContent className="py-4 text-sm text-red-200">{historyError}</CardContent>
                  </Card>
                )}

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Target className="w-5 h-5 mr-2" />
                      Matches Played
                    </CardTitle>
                    <CardDescription className="text-white/60">
                      {historyLoading ? 'Loading matches...' : `${playedMatches.length} completed`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!historyLoading && playedMatches.length === 0 && (
                      <p className="text-sm text-white/60">No completed matches yet.</p>
                    )}
                    {playedMatches.slice(0, 6).map((match) => (
                      <div
                        key={match.matchId}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-4 py-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            Match {match.matchId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-white/60">
                            {match.seasonId ? `Season ${String(match.seasonId).slice(0, 8)}` : 'Friendly match'}
                          </p>
                        </div>
                        <Badge
                          className={
                            match.winnerId === profile.id
                              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30'
                              : 'bg-red-500/20 text-red-200 border-red-400/30'
                          }
                        >
                          {match.winnerId === profile.id ? 'Won' : 'Lost'}
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Trophy className="w-5 h-5 mr-2" />
                      Matches Won
                    </CardTitle>
                    <CardDescription className="text-white/60">
                      {historyLoading ? 'Loading wins...' : `${wonMatches.length} wins`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {!historyLoading && wonMatches.length === 0 && (
                      <p className="text-sm text-white/60">No wins recorded yet.</p>
                    )}
                    {wonMatches.slice(0, 6).map((match) => (
                      <div
                        key={match.matchId}
                        className="flex items-center justify-between rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-4 py-3"
                      >
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-white">
                            Match {match.matchId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-emerald-100/80">
                            {match.seasonId ? `Season ${String(match.seasonId).slice(0, 8)}` : 'Friendly match'}
                          </p>
                        </div>
                        <Badge className="bg-emerald-500/20 text-emerald-200 border-emerald-400/30">
                          Winner
                        </Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="settings">
              <div className="space-y-6">
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <User className="w-5 h-5 mr-2" />
                      Profile Information
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="displayName" className="text-white">Display Name</Label>
                        <Input
                          id="displayName"
                          value={formData.displayName}
                          onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                          disabled={!isEditing}
                          className="bg-black/20 border-white/10 text-white placeholder-white/40"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email" className="text-white">Email</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          disabled={!isEditing}
                          className="bg-black/20 border-white/10 text-white placeholder-white/40"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone" className="text-white">Phone Number</Label>
                      <Input
                        id="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={!isEditing}
                        className="bg-black/20 border-white/10 text-white placeholder-white/40"
                      />
                    </div>

                    <div className="flex space-x-3">
                      {isEditing ? (
                        <>
                          <Button
                            onClick={handleSaveProfile}
                            disabled={isLoading}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                          >
                            {isLoading ? 'Saving...' : (
                              <>
                                <Save className="w-4 h-4 mr-2" />
                                Save Changes
                              </>
                            )}
                          </Button>
                          <Button
                            
                            onClick={() => setIsEditing(false)}
                            className="border-white/20 text-white/80 hover:bg-white/10"
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          onClick={() => setIsEditing(true)}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          <Settings className="w-4 h-4 mr-2" />
                          Edit Profile
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* ✅ Password reset card (correct for your backend) */}
                <Card className="bg-white/5 border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white flex items-center">
                      <Shield className="w-5 h-5 mr-2" />
                      Reset Password
                    </CardTitle>
                    <CardDescription className="text-white/60">
                      We’ll email you a reset code, then you set a new password.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Button
                      onClick={handleSendResetCode}
                      disabled={isLoading || !formData.email}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                    >
                      {isLoading ? 'Sending...' : (resetStep === 'codeSent' ? 'Resend Code' : 'Send Reset Code')}
                    </Button>

                    {resetStep === 'codeSent' && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="resetCode" className="text-white">Reset Code</Label>
                          <Input
                            id="resetCode"
                            value={formData.resetCode}
                            onChange={(e) => setFormData({ ...formData, resetCode: e.target.value })}
                            className="bg-black/20 border-white/10 text-white placeholder-white/40"
                            placeholder="Enter the code sent to your email"
                          />
                        </div>

                        <div className="grid md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="newPassword" className="text-white">New Password</Label>
                            <Input
                              id="newPassword"
                              type={showPassword ? 'text' : 'password'}
                              value={formData.newPassword}
                              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                              className="bg-black/20 border-white/10 text-white placeholder-white/40"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="confirmPassword" className="text-white">Confirm New Password</Label>
                            <Input
                              id="confirmPassword"
                              type={showPassword ? 'text' : 'password'}
                              value={formData.confirmPassword}
                              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                              className="bg-black/20 border-white/10 text-white placeholder-white/40"
                            />
                          </div>
                        </div>

                        <div className="flex items-center space-x-2">
                          <input
                            type="checkbox"
                            id="showPassword"
                            checked={showPassword}
                            onChange={(e) => setShowPassword(e.target.checked)}
                            className="rounded border-white/20 bg-black/30 text-purple-500"
                          />
                          <Label htmlFor="showPassword" className="text-white/70">Show passwords</Label>
                        </div>

                        <Button
                          onClick={handlePasswordChange}
                          disabled={isLoading || !formData.resetCode || !formData.newPassword}
                          className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                        >
                          {isLoading ? 'Resetting...' : 'Reset Password'}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="notifications">
              <NotificationPreferences />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {message && (
        <div
          className={`fixed bottom-4 right-4 p-4 rounded-lg ${
            message.toLowerCase().includes('success') || message.toLowerCase().includes('sent')
              ? 'bg-green-500/20 border-green-500/30'
              : 'bg-red-500/20 border-red-500/30'
          } border`}
        >
          <p
            className={
              message.toLowerCase().includes('success') || message.toLowerCase().includes('sent')
                ? 'text-green-400'
                : 'text-red-400'
            }
          >
            {message}
          </p>
        </div>
      )}
    </div>
  );
};

export default ProfilePage;
