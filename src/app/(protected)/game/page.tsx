'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { matchmakingApi } from '@/lib/apiService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Match = {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  status: string;
  scheduledTime?: string | null;
};

export default function GameLobbyPage() {
  const { data: session, status } = useSession();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      const playerId = session?.user?.userId;
      if (!playerId) return;

      setLoading(true);
      setError(null);
      try {
        const res = await matchmakingApi.getPlayerMatches(playerId);
        setMatches(res.data || []);
      } catch (err: any) {
        setError(err?.message || 'Failed to load matches');
      } finally {
        setLoading(false);
      }
    };

    if (status === 'authenticated') run();
    if (status === 'unauthenticated') {
      setLoading(false);
      setMatches([]);
    }
  }, [status, session?.user?.userId]);

  if (status === 'unauthenticated') {
    return (
      <Alert className="bg-yellow-500/10 border-yellow-500/30">
        <AlertDescription className="text-yellow-200">
          Please sign in to view your matches.
        </AlertDescription>
      </Alert>
    );
  }

  if (loading) {
    return (
      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Loading matches...</CardTitle>
        </CardHeader>
      </Card>
    );
  }

  const readyMatches = matches.filter((m) => m.status === 'ready' || m.status === 'in-progress');
  const scheduledMatches = matches.filter((m) => m.status === 'scheduled');
  const otherMatches = matches.filter(
    (m) => m.status !== 'ready' && m.status !== 'in-progress' && m.status !== 'scheduled'
  );

  return (
    <div className="space-y-4">
      {error && (
        <Alert className="bg-red-500/10 border-red-500/30">
          <AlertDescription className="text-red-200">{error}</AlertDescription>
        </Alert>
      )}

      <Card className="bg-linear-to-br from-indigo-900/50 via-purple-900/40 to-slate-900/50 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Practice While You Wait</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-white/70">
            Sharpen your break, control spin, and stay ready for your next match.
          </p>
          <Link href="/game/practice">
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">Start Practice</Button>
          </Link>
        </CardContent>
      </Card>

      <Card className="bg-white/5 border-white/10">
        <CardHeader>
          <CardTitle className="text-white">Your Match Queue</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {matches.length === 0 && (
            <p className="text-sm text-white/70">
              No matches found. Join a season and wait for matchmaking to generate fixtures.
            </p>
          )}

          {readyMatches.length > 0 && (
            <div className="space-y-2">
              {readyMatches.map((m) => (
                <div
                  key={m.matchId}
                  className="flex items-center justify-between rounded-md border border-emerald-400/20 bg-emerald-500/10 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      Match {m.matchId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-emerald-200/80">
                      Ready to play {m.seasonId ? `- Season ${String(m.seasonId).slice(0, 8)}` : ''}
                    </p>
                  </div>
                  <Link href={`/game/match/${m.matchId}`}>
                    <Button className="bg-emerald-500 hover:bg-emerald-600 text-white">
                      Join Match
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}

          {scheduledMatches.length > 0 && (
            <div className="space-y-2">
              {scheduledMatches.map((m) => (
                <div
                  key={m.matchId}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      Match {m.matchId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-white/60">
                      Scheduled {m.seasonId ? `- Season ${String(m.seasonId).slice(0, 8)}` : ''}
                    </p>
                  </div>
                  <Link href={`/game/match/${m.matchId}`}>
                    <Button  className="border-white/20 text-white">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}

          {otherMatches.length > 0 && (
            <div className="space-y-2">
              {otherMatches.map((m) => (
                <div
                  key={m.matchId}
                  className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-white">
                      Match {m.matchId.slice(0, 8)}
                    </p>
                    <p className="text-xs text-white/60">
                      Status: {m.status} {m.seasonId ? `- Season ${String(m.seasonId).slice(0, 8)}` : ''}
                    </p>
                  </div>
                  <Link href={`/game/match/${m.matchId}`}>
                    <Button  className="border-white/20 text-white">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
