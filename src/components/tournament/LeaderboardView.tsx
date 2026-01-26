'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy } from 'lucide-react';

type LeaderboardEntry = {
  playerId: string;
  groupLabel?: string;
  groupPosition?: number;
  qualified?: boolean;
  currentRound?: string;
  roundsWon?: number;
  eliminated?: boolean;
  isChampion?: boolean;
  isCurrentPlayer?: boolean;
};

export interface LeaderboardViewProps {
  leaderboard: {
    seasonId: string;
    leaderboard: LeaderboardEntry[];
    playerRank?: number;
    totalQualified?: number;
  };
}

export function LeaderboardView({ leaderboard }: LeaderboardViewProps) {
  const entries = leaderboard?.leaderboard || [];

  return (
    <Card className="bg-black/20 border-white/10">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Trophy className="h-5 w-5" />
          Leaderboard
          {leaderboard?.totalQualified ? (
            <Badge variant="secondary" className="ml-auto">
              {leaderboard.totalQualified} qualified
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {entries.length === 0 ? (
          <p className="text-sm text-white/60">No leaderboard data yet.</p>
        ) : (
          entries.map((entry, index) => (
            <div
              key={`${entry.playerId}-${index}`}
              className={`flex items-center justify-between rounded-md border border-white/10 px-3 py-2 text-sm ${
                entry.isCurrentPlayer ? 'bg-blue-600/20 text-blue-100' : 'text-white/80'
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 text-xs text-white/60">#{index + 1}</span>
                <span className="font-medium">Player {entry.playerId.slice(-4)}</span>
                {entry.groupLabel ? (
                  <Badge className="bg-white/10 text-white/70 border-white/10">
                    Group {entry.groupLabel}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {entry.isChampion && <Badge className="bg-yellow-500/20 text-yellow-200">Champion</Badge>}
                {entry.eliminated && <Badge className="bg-red-500/20 text-red-200">Eliminated</Badge>}
                {entry.currentRound && (
                  <Badge className="bg-white/10 text-white/70 border-white/10">
                    {entry.currentRound}
                  </Badge>
                )}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
