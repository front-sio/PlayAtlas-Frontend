"use client";

import React from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, Trophy, Users } from "lucide-react";
import { getGameCategoryLabel, getGameRoute, normalizeGameCategory } from "@/lib/gameCategories";

export interface Match {
  matchId: string;
  matchNumber: number;
  round: string;
  groupLabel?: string;
  
  player1Id?: string;
  player2Id?: string;
  player1Score: number;
  player2Score: number;
  winnerId?: string;
  
  status: string;
  scheduledStartAt?: string;
  gameCategory?: string;
  
  assignedDeviceId?: string;
  assignedAgentId?: string;
  assignedAgentName?: string;
  assignedDeviceName?: string;
  assignedHostPlayerUserId?: string;
  verificationStatus?: string;
  
  isPlayerMatch: boolean;
  playerPosition?: number;
}

export interface FixturesPayload {
  seasonId: string;
  fixturesByRound: Record<string, Match[]>;
  totalFixtures: number;
  playerMatches: number;
  playerContext?: {
    eliminated?: boolean;
    isChampion?: boolean;
    qualified?: boolean;
  };
}

function getStatusColor(status: string) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-green-600';
    case 'READY':
      return 'bg-blue-600';
    case 'IN_PROGRESS':
      return 'bg-yellow-600';
    case 'SCHEDULED':
      return 'bg-gray-600';
    default:
      return 'bg-gray-500';
  }
}

function getStatusText(status: string) {
  switch (status) {
    case 'COMPLETED':
      return '✅ Complete';
    case 'READY':
      return '🟢 Ready';
    case 'IN_PROGRESS':
      return '🔄 Playing';
    case 'SCHEDULED':
      return '⏰ Scheduled';
    default:
      return status;
  }
}

export function FixturesView({ fixtures }: { fixtures: FixturesPayload }) {
  const { fixturesByRound } = fixtures;
  
  const sortedRounds = Object.keys(fixturesByRound).sort();
  
  return (
    <div className="space-y-6">
      {sortedRounds.map((round) => {
        const matches = fixturesByRound[round];
        const playerMatches = matches.filter(m => m.isPlayerMatch);
        const otherMatches = matches.filter(m => !m.isPlayerMatch);
        
        return (
          <div key={round}>
            <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5" />
              {round}
              <span className="text-sm text-white/70">({matches.length} matches)</span>
            </h3>
            
            <div className="grid gap-4">
              {/* Player matches first */}
              {playerMatches.map((match) => {
                const category = normalizeGameCategory(match.gameCategory) || 'BILLIARDS';
                return (
                  <Link key={match.matchId} href={getGameRoute(category, match.matchId)} className="block">
                  <Card 
                    className="bg-blue-600/20 border-blue-500/30"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-600">Your Match</Badge>
                          <Badge variant="outline" className="text-white/70 border-white/30">
                            {getGameCategoryLabel(category)}
                          </Badge>
                          <span className="text-white font-medium">
                            Match #{match.matchNumber}
                          </span>
                          {match.groupLabel && (
                            <Badge variant="outline" className="text-white/70 border-white/30">
                              Group {match.groupLabel}
                            </Badge>
                          )}
                        </div>
                        
                        <Badge className={getStatusColor(match.status)}>
                          {getStatusText(match.status)}
                        </Badge>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-sm text-white/80">
                          {match.scheduledStartAt && (
                            <div className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {new Date(match.scheduledStartAt).toLocaleString()}
                            </div>
                          )}
                          
                          <div className="flex items-center gap-2">
                            {match.assignedHostPlayerUserId && (
                              <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs">
                                Host: {match.assignedHostPlayerUserId === match.player1Id ? 'Player 1' : 'Player 2'}
                              </span>
                            )}
                            {match.verificationStatus && (
                              <span className="rounded-full border border-white/20 px-2 py-0.5 text-xs">
                                {match.verificationStatus.toUpperCase()}
                              </span>
                            )}
                          </div>
                        </div>
                        
                        {match.status === 'COMPLETED' && match.winnerId && (
                          <div className="text-sm text-green-400">
                            Score: {match.player1Score}-{match.player2Score}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
                );
              })}
              
              {/* Other matches */}
              <div className="grid md:grid-cols-2 gap-4">
                {otherMatches.map((match) => {
                  const category = normalizeGameCategory(match.gameCategory) || 'BILLIARDS';
                  return (
                    <Link key={match.matchId} href={getGameRoute(category, match.matchId)} className="block">
                    <Card 
                      className="bg-black/20 border-white/10"
                    >
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white/70 text-sm">
                            Match #{match.matchNumber}
                            {match.groupLabel && ` - Group ${match.groupLabel}`}
                          </span>
                          
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getStatusColor(match.status)} border-none`}
                          >
                            {getStatusText(match.status)}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-white/60">
                          {match.scheduledStartAt && (
                            <span>
                              {new Date(match.scheduledStartAt).toLocaleTimeString()}
                            </span>
                          )}
                          
                          {match.status === 'COMPLETED' && (
                            <span>
                              {match.player1Score}-{match.player2Score}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
      
      {sortedRounds.length === 0 && (
        <Card className="bg-black/20 border-white/10">
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 text-white/50 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">No Fixtures Yet</h3>
            <p className="text-white/70">Fixtures will appear here once they're generated.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
