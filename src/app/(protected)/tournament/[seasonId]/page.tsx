'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Calendar, 
  Users, 
  Trophy, 
  Clock, 
  MapPin, 
  Crown,
  Target,
  Timer
} from 'lucide-react';
import { FixturesView, type FixturesPayload as FixturesPayloadType, type Match } from '@/components/tournament/FixturesView';
import { GroupsView, type GroupsViewProps } from '@/components/tournament/GroupsView';
import { LeaderboardView, type LeaderboardViewProps } from '@/components/tournament/LeaderboardView';
import { getApiBaseUrl } from '@/lib/apiBase';
import { BracketViewFullMap } from '@/components/tournament/BracketView';

type ExtendedLeaderboard = LeaderboardViewProps['leaderboard'] & {
  playerContext?: {
    eliminated?: boolean;
    isChampion?: boolean;
    qualified?: boolean;
  };
};

export default function TournamentGamePage() {
  const params = useParams();
  const { seasonId } = params;
  const { data: session } = useSession();

  const [activeTab, setActiveTab] = useState('fixtures');
  const [fixtures, setFixtures] = useState<FixturesPayloadType | null>(null);
  const [groups, setGroups] = useState<GroupsViewProps['groups'] | null>(null);
  const [bracket, setBracket] = useState<FixturesPayloadType | null>(null);
  const [leaderboard, setLeaderboard] = useState<ExtendedLeaderboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const apiBase = getApiBaseUrl();

  // Auto-refresh data every 30 seconds
  useEffect(() => {
    if (!seasonId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        const token = (session as any)?.accessToken as string | undefined;
        const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
        
        // Fetch all tournament data
        const [fixturesRes, groupsRes, bracketRes, leaderboardRes] = await Promise.all([
          fetch(`${apiBase}/tournament/player/seasons/${seasonId}/fixtures`, { headers }),
          fetch(`${apiBase}/tournament/player/seasons/${seasonId}/groups`, { headers }),
          fetch(`${apiBase}/tournament/player/seasons/${seasonId}/bracket`, { headers }),
          fetch(`${apiBase}/tournament/player/seasons/${seasonId}/leaderboard`, { headers })
        ]);

        if (fixturesRes.ok) {
          const fixturesData = await fixturesRes.json();
          setFixtures(fixturesData.data as FixturesPayloadType);
        }

        if (groupsRes.ok) {
          const groupsData = await groupsRes.json();
          setGroups(groupsData.data as GroupsViewProps['groups']);
        }

        if (bracketRes.ok) {
          const bracketData = await bracketRes.json();
          setBracket(bracketData.data as FixturesPayloadType);
        }

        if (leaderboardRes.ok) {
          const leaderboardData = await leaderboardRes.json();
          setLeaderboard(leaderboardData.data as ExtendedLeaderboard);
        }

      } catch (err) {
        console.error('Failed to fetch tournament data:', err);
        setError('Failed to load tournament data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    // Set up auto-refresh
    const interval = setInterval(fetchData, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [seasonId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-500 border-t-transparent mx-auto"></div>
            <p className="text-white/70">Loading tournament...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center space-y-4 max-w-md px-4">
            <div className="text-red-400 text-5xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold text-white">Tournament Unavailable</h2>
            <p className="text-white/70">{error}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="bg-blue-600 hover:bg-blue-700"
            >
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Get next match for player
  const getNextMatch = (): Match | null => {
    if (!fixtures?.fixturesByRound) return null;
    
    const allMatches = Object.values(fixtures.fixturesByRound).flat();
    return allMatches.find((match: Match) => 
      match.isPlayerMatch && 
      (match.status === 'SCHEDULED' || match.status === 'READY')
    ) || null;
  };

  const nextMatch: Match | null = getNextMatch();
  const seasonLabel = leaderboard?.seasonId?.slice(-4) || (seasonId ? seasonId.slice(-4) : '—');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-blue-950 to-slate-950">
      {/* Header */}
      <div className="bg-black/20 border-b border-white/10">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white mb-1">
                Tournament Season {seasonLabel}
              </h1>
              <div className="flex items-center gap-4 text-sm text-white/70">
                <div className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  <span>{leaderboard?.totalQualified || 0}/32 Qualified</span>
                </div>
                <div className="flex items-center gap-1">
                  <Trophy className="h-4 w-4" />
                  <span>8 Groups + Knockout</span>
                </div>
                <div className="flex items-center gap-1">
                  <Timer className="h-4 w-4" />
                  <span>5min matches</span>
                </div>
              </div>
            </div>
            
            {/* Status Badge */}
            <div className="text-right">
              <Badge 
                variant={bracket?.playerContext?.eliminated ? 'destructive' : 
                        bracket?.playerContext?.isChampion ? 'default' : 
                        'secondary'}
                className="mb-2"
              >
                {bracket?.playerContext?.eliminated ? '❌ Eliminated' :
                 bracket?.playerContext?.isChampion ? '👑 Champion' :
                 bracket?.playerContext?.qualified ? '✅ Qualified' : 
                 '⏳ In Progress'}
              </Badge>
              
              {leaderboard?.playerRank && (
                <div className="text-sm text-white/70">
                  Rank #{leaderboard.playerRank}/{leaderboard.totalQualified}
                </div>
              )}
            </div>
          </div>

          {/* Next Match Alert */}
          {nextMatch && (
            <Card className="mt-4 bg-blue-600/20 border-blue-500/30">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-white font-semibold mb-1">
                      🚀 Your Next Match
                    </h3>
                    <div className="flex items-center gap-4 text-sm text-white/80">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {nextMatch?.scheduledStartAt ? 
                          new Date(nextMatch.scheduledStartAt).toLocaleTimeString() : 
                          'TBD'
                        }
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        Device {nextMatch?.assignedDeviceId?.slice(-1) || 'TBD'}
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-3 w-3" />
                        {nextMatch?.round} {nextMatch?.groupLabel ? `Group ${nextMatch.groupLabel}` : ''}
                      </div>
                    </div>
                  </div>
                  
                  <Badge 
                    variant={nextMatch?.status === 'READY' ? 'default' : 'secondary'}
                    className="animate-pulse"
                  >
                    {nextMatch?.status === 'READY' ? '🟢 Ready' : '⏰ Scheduled'}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 bg-black/20 border border-white/10">
            <TabsTrigger 
              value="fixtures" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/70"
            >
              <Calendar className="h-4 w-4 mr-2" />
              Fixtures
            </TabsTrigger>
            <TabsTrigger 
              value="groups" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/70"
            >
              <Users className="h-4 w-4 mr-2" />
              Groups
            </TabsTrigger>
            <TabsTrigger 
              value="bracket" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/70"
            >
              <Trophy className="h-4 w-4 mr-2" />
              Bracket
            </TabsTrigger>
            <TabsTrigger 
              value="leaderboard" 
              className="data-[state=active]:bg-blue-600 data-[state=active]:text-white text-white/70"
            >
              <Crown className="h-4 w-4 mr-2" />
              Leaderboard
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="fixtures" className="space-y-6">
              {fixtures && <FixturesView fixtures={fixtures} />}
            </TabsContent>

            <TabsContent value="groups" className="space-y-6">
              {groups && <GroupsView groups={groups} />}
            </TabsContent>

            <TabsContent value="bracket" className="space-y-6">
              {bracket && <BracketViewFullMap fixtures={bracket} />}
            </TabsContent>

            <TabsContent value="leaderboard" className="space-y-6">
              {leaderboard && <LeaderboardView leaderboard={leaderboard} />}
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {/* Live Updates Indicator */}
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-green-600/20 border border-green-500/30 rounded-full px-3 py-2 flex items-center gap-2">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-xs text-green-200">Live</span>
        </div>
      </div>
    </div>
  );
}
