'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { agentApi, lookupApi, matchmakingApi, tournamentApi } from '@/lib/apiService';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

const MATCH_MAX_SECONDS = 300;

type Match = {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  withAi?: boolean;
  winnerId?: string | null;
  player1Score?: number | null;
  player2Score?: number | null;
  status: string;
  scheduledTime?: string | null;
  scheduledStartAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  assignedAgentId?: string | null;
  assignedAgentUserId?: string | null;
};

type SeasonInfo = {
  seasonId: string;
  name?: string | null;
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
};

export default function GameLobbyPage() {
  const { data: session, status } = useSession();
  const [matches, setMatches] = useState<Match[]>([]);
  const [seasonById, setSeasonById] = useState<Record<string, SeasonInfo>>({});
  const [agentNameById, setAgentNameById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const getSeasonLabel = (seasonId?: string | null) => {
    if (!seasonId) return '';
    const season = seasonById[String(seasonId)];
    if (season?.name) return season.name;
    return `Season ${String(seasonId).slice(0, 8)}`;
  };

  useEffect(() => {
    const run = async () => {
      const playerId = session?.user?.userId;
      const role = (session?.user as any)?.role;
      if (!playerId) return;

      setLoading(true);
      setError(null);
      try {
        let matchData: Match[] = [];

        if (role === 'agent') {
          // Agent view: fetch assigned matches
          const res = await agentApi.listMatches(session?.accessToken as string, 'scheduled,ready,in_progress');
          // Handle both array and object response formats
          const payload = res.data as any;
          matchData = (Array.isArray(payload) ? payload : payload?.matches || []) as Match[];
        } else {
          // Player view
          const res = await matchmakingApi.getPlayerMatchesMultiplayer(playerId);
          matchData = (res.data || []) as Match[];
        }

        setMatches(matchData);

        const seasonIds = Array.from(new Set(matchData.map((m) => m.seasonId).filter(Boolean)));
        const agentUserIds = Array.from(
          new Set(matchData.map((m) => m.assignedAgentUserId).filter(Boolean))
        );
        if (seasonIds.length > 0) {
          const seasonEntries: Array<[string, SeasonInfo] | null> = await Promise.all(
            seasonIds.map(async (seasonId) => {
              try {
                const seasonRes = await tournamentApi.getSeason(String(seasonId));
                return [String(seasonId), seasonRes.data as SeasonInfo];
              } catch {
                return null;
              }
            })
          );
          const seasonMap: Record<string, SeasonInfo> = {};
          seasonEntries.forEach((entry) => {
            if (entry) {
              seasonMap[entry[0]] = entry[1];
            }
          });
          setSeasonById(seasonMap);
        } else {
          setSeasonById({});
        }

        if (agentUserIds.length > 0) {
          try {
            const lookup = await lookupApi.resolveMatchLookups({
              opponentIds: [],
              tournamentIds: [],
              agentUserIds: agentUserIds as string[]
            });
            const agents = lookup?.data?.data?.agents || lookup?.data?.agents || {};
            setAgentNameById(agents);
          } catch {
            setAgentNameById({});
          }
        } else {
          setAgentNameById({});
        }
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
  }, [status, session?.user?.userId, (session?.user as any)?.role]);

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

  const now = Date.now();
  const endedStatuses = new Set(['completed', 'cancelled']);
  const seasonEndedStatuses = new Set(['completed', 'finished', 'cancelled']);

  const getMatchEndTime = (match: Match) => {
    if (match.startedAt) {
      return new Date(match.startedAt).getTime() + MATCH_MAX_SECONDS * 1000;
    }
    return null;
  };

  const getMatchStatus = (match: Match) => String(match.status || '').toLowerCase();

  const getBlockReason = (match: Match) => {
    const status = getMatchStatus(match);
    if (endedStatuses.has(status)) {
      return 'Match ended';
    }
    const season = match.seasonId ? seasonById[String(match.seasonId)] : null;
    if (season && seasonEndedStatuses.has(String(season.status))) {
      return 'Season ended';
    }
    const matchEnd = getMatchEndTime(match);
    if (matchEnd && now > matchEnd) {
      return 'Match time expired';
    }
    return null;
  };

  const readyMatches = matches.filter((m) => {
    const status = getMatchStatus(m);
    return status === 'ready' || status === 'in_progress';
  });
  const scheduledMatches = matches.filter((m) => getMatchStatus(m) === 'scheduled');
  const otherMatches = matches.filter(
    (m) => !['ready', 'in_progress', 'scheduled'].includes(getMatchStatus(m))
  );
  const completedMatches = matches.filter((m) => getMatchStatus(m) === 'completed');

  const formatTime = (value?: string | null) => {
    if (!value) return 'TBD';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return 'TBD';
    return dt.toLocaleString();
  };

  const getResultLabel = (match: Match) => {
    if (!session?.user?.userId || !match.winnerId) return null;
    return match.winnerId === session.user.userId ? 'Win' : 'Loss';
  };

  const getScheduleValue = (match: Match) => match.scheduledStartAt || match.scheduledTime;

  const getAssignedAgentLabel = (match: Match) => {
    if (match.assignedAgentUserId && agentNameById[match.assignedAgentUserId]) {
      return agentNameById[match.assignedAgentUserId];
    }
    if (match.assignedAgentId) {
      return `Agent ${match.assignedAgentId.slice(0, 6)}`;
    }
    return '';
  };
  const hasQueue =
    readyMatches.length > 0 || scheduledMatches.length > 0 || otherMatches.length > 0;

  const isAgent = (session?.user as any)?.role === 'agent';

  const handleStartMatch = async (matchId: string, playerId: string) => {
    try {
      const result = await matchmakingApi.startMatch(
        matchId,
        { playerId },
        (session as any)?.accessToken
      );
      if (result.success) {
        const redirectUrl = (result.data as any)?.redirectUrl || (result as any)?.redirectUrl;
        if (redirectUrl) {
          window.location.assign(redirectUrl);
        }
      } else {
        setError(result.error || 'Failed to start match');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start match');
    }
  };

  return (
    <div className="min-h-[calc(100dvh-64px)] w-full overflow-x-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.12),_transparent_55%),radial-gradient(circle_at_20%_30%,_rgba(59,130,246,0.12),_transparent_55%),linear-gradient(180deg,_#0a0f1b_0%,_#070a13_50%,_#06080f_100%)] text-white">
      <div
        className="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 sm:px-6 sm:pt-14 sm:pb-20 lg:px-8 space-y-8"
        style={{
          paddingLeft: 'calc(env(safe-area-inset-left) + 1rem)',
          paddingRight: 'calc(env(safe-area-inset-right) + 1rem)'
        }}
      >
        {error && (
          <Alert className="bg-red-500/10 border-red-500/30">
            <AlertDescription className="text-red-200">{error}</AlertDescription>
          </Alert>
        )}

        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">Game Lobby</p>
              <h1 className="mt-2 text-4xl font-semibold">Two Player Match Center</h1>
              <p className="mt-2 text-sm text-white/70">
                Join active tables, track scheduled fixtures, and review completed results.
              </p>
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Ready Now</p>
              <p className="mt-2 text-2xl font-semibold">{readyMatches.length}</p>
              <p className="text-xs text-emerald-200/80">Awaiting join</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Scheduled</p>
              <p className="mt-2 text-2xl font-semibold">{scheduledMatches.length}</p>
              <p className="text-xs text-blue-200/80">Queued fixtures</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs text-white/60">Completed</p>
              <p className="mt-2 text-2xl font-semibold">{completedMatches.length}</p>
              <p className="text-xs text-white/50">Results logged</p>
            </div>
          </div>
        </section>

        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-200/80">Match Queue</p>
              <h2 className="mt-2 text-2xl font-semibold">Your Matches</h2>
            </div>
            <span className="text-xs text-white/50">
              Total: {matches.length}
            </span>
          </div>

          {matches.length === 0 && (
            <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/60">
              No matches found. Join a season and wait for matchmaking to generate fixtures.
            </div>
          )}

          {hasQueue && (
            <div className="mt-6 w-full space-y-6 sm:max-h-[65vh] sm:overflow-y-auto sm:pr-1">
              {readyMatches.length > 0 && (
                <div className="w-full space-y-3">
                  <h3 className="text-sm font-semibold text-emerald-200">Ready to Play</h3>
                  {readyMatches.map((m) => {
                    const blockedReason = getBlockReason(m);
                    const agentLabel = getAssignedAgentLabel(m);
                    return (
                      <div
                        key={m.matchId}
                        className="flex w-full flex-col gap-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium text-white">
                            Match {m.matchId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-emerald-200/80">
                            Ready to play {m.seasonId ? `- ${getSeasonLabel(m.seasonId)}` : ''}
                          </p>
                          <p className="text-xs text-white/60">
                            Scheduled: {formatTime(getScheduleValue(m))}
                          </p>
                          <p className="text-xs text-white/60">
                            {agentLabel ? `Club desk: ${agentLabel}` : 'Club desk: Assigned agent'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:items-end">
                          {blockedReason ? (
                            <Button className="w-full sm:w-auto" disabled>
                              {blockedReason}
                            </Button>
                          ) : isAgent ? (
                            <Button
                              className="w-full sm:w-auto bg-emerald-500 hover:bg-emerald-600 text-white"
                              onClick={() => handleStartMatch(m.matchId, m.player1Id)}
                            >
                              Start Match
                            </Button>
                          ) : (
                            <Button asChild className="w-full sm:w-auto">
                              <Link href={`/game/match/${m.matchId}`}>Play Match</Link>
                            </Button>
                          )}
                          <p className="text-xs text-white/60">
                            {isAgent ? 'Start this match for players.' : 'Play this match at your club agent kiosk.'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {scheduledMatches.length > 0 && (
                <div className="w-full space-y-3">
                  <h3 className="text-sm font-semibold text-blue-200">Scheduled</h3>
                  {scheduledMatches.map((m) => {
                    const agentLabel = getAssignedAgentLabel(m);
                    return (
                      <div
                        key={m.matchId}
                        className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium text-white">
                            Match {m.matchId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-white/60">
                            Scheduled {m.seasonId ? `- ${getSeasonLabel(m.seasonId)}` : ''}
                          </p>
                          <p className="text-xs text-white/60">
                            Starts: {formatTime(getScheduleValue(m))}
                          </p>
                          <p className="text-xs text-white/60">
                            {agentLabel ? `Club desk: ${agentLabel}` : 'Club desk: Assigned agent'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2 sm:items-end">
                          {isAgent && (
                            <Button
                              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => handleStartMatch(m.matchId, m.player1Id)}
                            >
                              Start Match
                            </Button>
                          )}
                          <div className="text-xs text-white/60">
                            {isAgent ? 'Scheduled match.' : 'Scheduled to play at your club agent kiosk.'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {otherMatches.length > 0 && (
                <div className="w-full space-y-3">
                  <h3 className="text-sm font-semibold text-white/80">History</h3>
                  {otherMatches.map((m) => {
                    const status = getMatchStatus(m);
                    const agentLabel = getAssignedAgentLabel(m);
                    return (
                      <div
                        key={m.matchId}
                        className="flex w-full flex-col gap-3 rounded-2xl border border-white/10 bg-black/20 p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-medium text-white">
                            Match {m.matchId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-white/60">
                            Status: {status} {m.seasonId ? `- ${getSeasonLabel(m.seasonId)}` : ''}
                          </p>
                          <p className="text-xs text-white/60">
                            Scheduled: {formatTime(getScheduleValue(m))}
                          </p>
                          {agentLabel && (
                            <p className="text-xs text-white/60">
                              Club desk: {agentLabel}
                            </p>
                          )}
                          {status === 'completed' && (
                            <p className="text-xs text-white/70">
                              Result: {getResultLabel(m) || 'Completed'} · Score {m.player1Score ?? 0}-{m.player2Score ?? 0}
                            </p>
                          )}
                        </div>
                        <div className="text-xs text-white/60">
                          Match details are available at your club desk.
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
