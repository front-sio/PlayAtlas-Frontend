'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Trophy, 
  Target, 
  TrendingUp,
  Crown,
  CheckCircle,
  X
} from 'lucide-react';

interface GroupStanding {
  playerId: string;
  position: number;
  matchesPlayed: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDifference: number;
  winPercentage: number;
  qualified: boolean;
  isCurrentPlayer: boolean;
}

interface GroupMatch {
  matchId: string;
  player1Id: string;
  player2Id: string;
  player1Score: number;
  player2Score: number;
  winnerId?: string;
  status: string;
  scheduledStartAt?: string;
  completedAt?: string;
}

export interface GroupsViewProps {
  groups: {
    seasonId: string;
    standingsByGroup: Record<string, GroupStanding[]>;
    matchesByGroup: Record<string, GroupMatch[]>;
    playerGroup?: string;
  };
}

export function GroupsView({ groups }: GroupsViewProps) {
  const { standingsByGroup, matchesByGroup, playerGroup } = groups;

  const groupLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

  const getPositionIcon = (position: number, qualified: boolean) => {
    if (qualified) {
      return position === 1 ? (
        <Crown className="h-4 w-4 text-yellow-400" />
      ) : (
        <CheckCircle className="h-4 w-4 text-green-400" />
      );
    }
    return null;
  };

  const getPositionColor = (position: number, qualified: boolean) => {
    if (position === 1) return 'text-yellow-400';
    if (position === 2 && qualified) return 'text-green-400';
    if (position <= 2) return 'text-blue-400';
    return 'text-white/70';
  };

  const calculateGroupProgress = (matches: GroupMatch[]) => {
    const total = 6; // Each group has 6 matches (4 players in round-robin)
    const completed = matches.filter(m => m.status === 'COMPLETED').length;
    return { completed, total, percentage: (completed / total) * 100 };
  };

  return (
    <div className="space-y-6">
      {/* Your Group Highlight */}
      {playerGroup && (
        <Card className="bg-blue-600/20 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-white font-semibold mb-1 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                    {playerGroup}
                  </div>
                  Your Group: Group {playerGroup}
                </h3>
                <div className="text-sm text-white/80">
                  {(() => {
                    const groupStandings = standingsByGroup[playerGroup] || [];
                    const playerStanding = groupStandings.find(s => s.isCurrentPlayer);
                    const progress = calculateGroupProgress(matchesByGroup[playerGroup] || []);
                    
                    return (
                      <div className="flex items-center gap-4">
                        <span>
                          Position: #{playerStanding?.position || 'TBD'} of 4
                        </span>
                        <span>
                          Progress: {progress.completed}/{progress.total} matches
                        </span>
                        {playerStanding?.qualified && (
                          <Badge className="bg-green-600 text-white">
                            ✅ Qualified
                          </Badge>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Groups Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {groupLabels.map(groupLabel => {
          const standings = standingsByGroup[groupLabel] || [];
          const matches = matchesByGroup[groupLabel] || [];
          const progress = calculateGroupProgress(matches);
          const isPlayerGroup = groupLabel === playerGroup;

          return (
            <Card 
              key={groupLabel} 
              className={`${isPlayerGroup ? 
                'bg-blue-600/10 border-blue-500/30' : 
                'bg-black/20 border-white/10'
              }`}
            >
              <CardHeader>
                <CardTitle className="text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-8 h-8 ${isPlayerGroup ? 'bg-blue-600' : 'bg-gray-600'} rounded-full flex items-center justify-center text-sm font-bold`}>
                      {groupLabel}
                    </div>
                    Group {groupLabel}
                    {isPlayerGroup && (
                      <Badge variant="outline" className="border-blue-500/50 text-blue-200">
                        Your Group
                      </Badge>
                    )}
                  </div>
                  <Badge variant="secondary" className="text-xs">
                    {progress.completed}/{progress.total}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {/* Group Progress Bar */}
                <div className="space-y-2">
                  <div className="flex justify-between text-xs text-white/70">
                    <span>Match Progress</span>
                    <span>{Math.round(progress.percentage)}%</span>
                  </div>
                  <div className="w-full bg-white/10 rounded-full h-2">
                    <div 
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${progress.percentage}%` }}
                    ></div>
                  </div>
                </div>

                {/* Standings Table */}
                <div className="space-y-1">
                  <div className="grid grid-cols-7 text-xs text-white/60 font-medium pb-1 border-b border-white/10">
                    <span className="col-span-2">Player</span>
                    <span className="text-center">P</span>
                    <span className="text-center">W</span>
                    <span className="text-center">L</span>
                    <span className="text-center">PD</span>
                    <span className="text-center">%</span>
                  </div>
                  
                  {standings.map((standing) => (
                    <div 
                      key={standing.playerId}
                      className={`grid grid-cols-7 text-sm py-2 rounded transition-all ${
                        standing.isCurrentPlayer ? 
                          'bg-blue-600/20 text-blue-200 font-semibold' : 
                          'text-white hover:bg-white/5'
                      }`}
                    >
                      <div className="col-span-2 flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <span className={`font-bold ${getPositionColor(standing.position, standing.qualified)}`}>
                            {standing.position}
                          </span>
                          {getPositionIcon(standing.position, standing.qualified)}
                        </div>
                        <span className="truncate">
                          Player {standing.playerId.slice(-4)}
                          {standing.isCurrentPlayer && ' (You)'}
                        </span>
                      </div>
                      <span className="text-center">{standing.matchesPlayed}</span>
                      <span className="text-center text-green-400">{standing.wins}</span>
                      <span className="text-center text-red-400">{standing.losses}</span>
                      <span className={`text-center ${standing.pointDifference >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {standing.pointDifference > 0 ? '+' : ''}{standing.pointDifference}
                      </span>
                      <span className="text-center">
                        {Math.round(standing.winPercentage * 100)}%
                      </span>
                    </div>
                  ))}

                  {standings.length === 0 && (
                    <div className="text-center text-white/50 py-4">
                      <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No standings yet</p>
                    </div>
                  )}
                </div>

                {/* Qualification Status */}
                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div className="text-xs text-white/70">
                    Top 2 qualify to Round of 16
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <CheckCircle className="h-3 w-3 text-green-400" />
                    <span className="text-green-400">
                      {standings.filter(s => s.qualified).length}/2 qualified
                    </span>
                  </div>
                </div>

                {/* Recent Matches Preview */}
                {matches.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white/80">Recent Matches</h4>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {matches.slice(-3).map((match) => (
                        <div 
                          key={match.matchId}
                          className="flex items-center justify-between text-xs bg-white/5 rounded p-2"
                        >
                          <div className="flex items-center gap-2">
                            <span>Player {match.player1Id.slice(-4)}</span>
                            <span className="text-white/60">vs</span>
                            <span>Player {match.player2Id.slice(-4)}</span>
                          </div>
                          
                          {match.status === 'COMPLETED' ? (
                            <div className="flex items-center gap-1">
                              <span className={match.winnerId === match.player1Id ? 'text-green-400' : 'text-white/70'}>
                                {match.player1Score}
                              </span>
                              <span className="text-white/60">-</span>
                              <span className={match.winnerId === match.player2Id ? 'text-green-400' : 'text-white/70'}>
                                {match.player2Score}
                              </span>
                            </div>
                          ) : (
                            <Badge 
                              variant="outline" 
                              className="text-xs"
                            >
                              {match.status}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Groups Summary */}
      <Card className="bg-black/20 border-white/10">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Trophy className="h-5 w-5" />
            Groups Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white">
                {Object.values(standingsByGroup).flat().filter(s => s.qualified).length}
              </div>
              <div className="text-sm text-white/70">Total Qualified</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">
                {Object.values(matchesByGroup).flat().filter(m => m.status === 'COMPLETED').length}
              </div>
              <div className="text-sm text-white/70">Matches Played</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">
                {Object.values(matchesByGroup).flat().length - 
                 Object.values(matchesByGroup).flat().filter(m => m.status === 'COMPLETED').length}
              </div>
              <div className="text-sm text-white/70">Remaining</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">
                {Math.round(
                  (Object.values(matchesByGroup).flat().filter(m => m.status === 'COMPLETED').length / 
                   Object.values(matchesByGroup).flat().length) * 100
                )}%
              </div>
              <div className="text-sm text-white/70">Complete</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
