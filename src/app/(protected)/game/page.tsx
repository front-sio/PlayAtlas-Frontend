'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { matchmakingApi, tournamentApi } from '@/lib/apiService';
import { useMatchLookup } from '@/lib/useMatchLookup';
import { matchmakingSocketService } from '@/lib/matchmakingSocketService';
import { GAME_CATEGORY_OPTIONS, getGameCategoryLabel, getGameRoute, normalizeGameCategory } from '@/lib/gameCategories';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { HostScanModal } from '@/components/match/HostScanModal';
import { OpponentQrModal } from '@/components/match/OpponentQrModal';

const COUNTDOWN_GRACE_MS = 5 * 60 * 1000;

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
  assignedHostPlayerUserId?: string | null;
  verificationStatus?: string | null;
  verifiedAt?: string | null;
  gameCategory?: string | null;
  round?: string | null;
  groupLabel?: string | null;
};

type SeasonSummary = {
  seasonId: string;
  seasonNumber?: number;
  name?: string | null;
  status?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tournament?: {
    tournamentId: string;
    name?: string | null;
  };
};

type MatchViewModel = {
  matchId: string;
  seasonId?: string | null;
  seasonName: string;
  seasonLabel: string;
  playerA: { id: string; name: string };
  playerB: { id: string; name: string };
  hostSide: 'A' | 'B' | null;
  hostUserId?: string | null;
  scheduledStartAt?: string | null;
  matchDate?: string | null;
  gameCategory: string;
  status: string;
  verificationStatus: string;
  roundLabel?: string | null;
  isHost: boolean;
  isCompleted: boolean;
  isInProgress: boolean;
  countdownLabel: string | null;
  delayedLabel: string | null;
  resultLabel?: string | null;
  scoreLabel?: string | null;
};

type VerificationRequest = {
  matchId: string;
  token: string;
  bleNonce?: string;
  expiresAt: string;
};

const normalize = (value?: string | null) => String(value || '').toLowerCase().trim();

const getScheduleValue = (match: Match) => match.scheduledStartAt || match.scheduledTime || null;

const formatDateTime = (value?: string | null) => {
  if (!value) return 'TBD';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return 'TBD';
  return dt.toLocaleString();
};

const formatDuration = (seconds: number) => {
  const abs = Math.max(0, Math.floor(seconds));
  const hrs = Math.floor(abs / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  if (hrs > 0) return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
};

const getCountdownLabels = (scheduledAt: string | null, nowMs: number) => {
  if (!scheduledAt) {
    return { countdownLabel: null, delayedLabel: null };
  }
  const target = new Date(scheduledAt).getTime();
  if (Number.isNaN(target)) {
    return { countdownLabel: null, delayedLabel: null };
  }
  const diff = target - nowMs;
  if (diff > 0) {
    return {
      countdownLabel: `Starts in ${formatDuration(diff / 1000)}`,
      delayedLabel: null
    };
  }
  if (Math.abs(diff) <= COUNTDOWN_GRACE_MS) {
    return { countdownLabel: 'Starting soon', delayedLabel: null };
  }
  return {
    countdownLabel: 'Delayed',
    delayedLabel: `Scheduled ${formatDateTime(scheduledAt)}`
  };
};

const getVerificationLabel = (status: string, verificationStatus: string) => {
  if (status === 'in_progress') return 'STARTED';
  if (status === 'completed') return 'COMPLETED';
  if (status === 'cancelled') return 'CANCELLED';
  if (!verificationStatus || verificationStatus === 'pending') return 'NOT_REQUESTED';
  if (verificationStatus === 'qr_issued') return 'QR_ISSUED';
  if (verificationStatus === 'verified') return 'VERIFIED';
  if (verificationStatus === 'expired') return 'EXPIRED';
  if (verificationStatus === 'failed') return 'FAILED';
  return verificationStatus.toUpperCase();
};

const getStatusBadge = (status: string, verificationStatus: string) => {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return 'Started';
  if (verificationStatus === 'verified') return 'Verified';
  if (verificationStatus === 'qr_issued') return 'QR Issued';
  if (verificationStatus === 'expired') return 'Expired';
  if (verificationStatus === 'failed') return 'Failed';
  if (status === 'scheduled') return 'Scheduled';
  return 'In Queue';
};

const getStageLabel = (match: Match) => {
  const round = match.round ? String(match.round) : '';
  const group = match.groupLabel ? String(match.groupLabel) : '';
  if (round && group) return `Group ${group} - ${round}`;
  if (round) return round;
  if (group) return `Group ${group}`;
  return null;
};

export default function GameLobbyPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [matches, setMatches] = useState<Match[]>([]);
  const [seasons, setSeasons] = useState<SeasonSummary[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string>('all');
  const [gameCategoryFilter, setGameCategoryFilter] = useState<string>('all');
  const [historyResultFilter, setHistoryResultFilter] = useState<string>('all');
  const [historyDateFrom, setHistoryDateFrom] = useState<string>('');
  const [historyDateTo, setHistoryDateTo] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [hostMatchId, setHostMatchId] = useState<string | null>(null);
  const [hostExpiresAt, setHostExpiresAt] = useState<string | null>(null);
  const [hostError, setHostError] = useState<string | null>(null);
  const [hostModalOpen, setHostModalOpen] = useState(false);

  const [verificationRequests, setVerificationRequests] = useState<Record<string, VerificationRequest>>({});
  const [activeOpponentMatchId, setActiveOpponentMatchId] = useState<string | null>(null);
  const [resultMatchId, setResultMatchId] = useState<string | null>(null);

  const playerId = session?.user?.userId;
  const accessToken = (session as any)?.accessToken as string | undefined;

  useEffect(() => {
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const run = async () => {
      if (!playerId) return;
      setLoading(true);
      setError(null);
      try {
        const [matchRes, seasonsRes] = await Promise.all([
          matchmakingApi.getPlayerMatchesAllSeasons(playerId),
          accessToken ? tournamentApi.getPlayerSeasons(accessToken, playerId) : Promise.resolve({ data: [] })
        ]);

        setMatches((matchRes.data || []) as Match[]);
        setSeasons((seasonsRes.data || []) as SeasonSummary[]);
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
      setSeasons([]);
    }
  }, [status, playerId, accessToken]);

  useEffect(() => {
    if (!playerId || !accessToken) return;

    matchmakingSocketService.connect();
    matchmakingSocketService.authenticate(playerId, accessToken);

    const unsubscribeQr = matchmakingSocketService.on('match_verification_qr', (payload: any) => {
      if (!payload?.matchId || !payload?.token) return;
      setVerificationRequests((prev) => ({
        ...prev,
        [payload.matchId]: {
          matchId: payload.matchId,
          token: payload.token,
          bleNonce: payload.bleNonce,
          expiresAt: payload.expiresAt
        }
      }));
      setMatches((prev) =>
        prev.map((m) =>
          m.matchId === payload.matchId ? { ...m, verificationStatus: 'qr_issued' } : m
        )
      );
      setActiveOpponentMatchId(payload.matchId);
    });

    const unsubscribeVerified = matchmakingSocketService.on('match_verified', (payload: any) => {
      if (!payload?.matchId) return;
      setMatches((prev) =>
        prev.map((m) =>
          m.matchId === payload.matchId
            ? { ...m, verificationStatus: 'verified', verifiedAt: payload.verifiedAt }
            : m
        )
      );
    });

    return () => {
      unsubscribeQr();
      unsubscribeVerified();
    };
  }, [playerId, accessToken]);

  const seasonById = useMemo(() => {
    const map: Record<string, SeasonSummary> = {};
    seasons.forEach((season) => {
      map[String(season.seasonId)] = season;
    });
    return map;
  }, [seasons]);

  const allSeasonIds = useMemo(() => {
    const fromSeasons = seasons.map((s) => String(s.seasonId));
    const fromMatches = matches.map((m) => m.seasonId).filter(Boolean).map((id) => String(id));
    return Array.from(new Set([...fromSeasons, ...fromMatches])).filter(Boolean);
  }, [seasons, matches]);

  const opponentIds = useMemo(() => {
    const ids = matches.flatMap((m) => [m.player1Id, m.player2Id]);
    return Array.from(new Set(ids.filter(Boolean)));
  }, [matches]);

  const { opponents } = useMatchLookup({
    opponentIds,
    token: accessToken
  });

  const currentName =
    session?.user?.username ||
    `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim() ||
    'You';

  const resolvePlayerName = (id: string) => {
    if (!id) return 'TBD';
    const resolved = opponents?.[id];
    if (resolved) return resolved;
    if (id === playerId) return currentName;
    return `Player ${id.slice(-4)}`;
  };

  const filteredMatches = useMemo(() => {
    return matches.filter((m) => {
      if (seasonFilter !== 'all' && String(m.seasonId) !== seasonFilter) return false;
      if (gameCategoryFilter !== 'all') {
        const category = normalizeGameCategory(m.gameCategory) || 'BILLIARDS';
        if (category !== gameCategoryFilter) return false;
      }
      return true;
    });
  }, [matches, seasonFilter, gameCategoryFilter]);

  const viewMatches = useMemo<MatchViewModel[]>(() => {
    return filteredMatches.map((m) => {
      const status = normalize(m.status);
      const verificationStatus = normalize(m.verificationStatus);
      const isCompleted = status === 'completed' || status === 'cancelled';
      const isInProgress = status === 'in_progress';
      const seasonId = m.seasonId ? String(m.seasonId) : undefined;
      const season = seasonId ? seasonById[seasonId] : undefined;
      const seasonName = season?.name || season?.tournament?.name || '';
      const seasonLabel = seasonName
        ? `${seasonName} - ${seasonId ? seasonId.slice(0, 8) : ''}`
        : seasonId
          ? `Season ${seasonId.slice(0, 8)}`
          : 'Season TBD';
      const scheduledAt = getScheduleValue(m);
      const matchDate = m.endedAt || m.startedAt || scheduledAt || null;
      const { countdownLabel, delayedLabel } = getCountdownLabels(scheduledAt, nowMs);
      const gameCategory = normalizeGameCategory(m.gameCategory) || 'BILLIARDS';
      const resultLabel =
        m.winnerId && playerId ? (m.winnerId === playerId ? 'Win' : 'Loss') : null;
      const scoreLabel =
        typeof m.player1Score === 'number' && typeof m.player2Score === 'number'
          ? `${m.player1Score}-${m.player2Score}`
          : null;

      return {
        matchId: m.matchId,
        seasonId: m.seasonId,
        seasonName,
        seasonLabel,
        playerA: { id: m.player1Id, name: resolvePlayerName(m.player1Id) },
        playerB: { id: m.player2Id, name: resolvePlayerName(m.player2Id) },
        hostSide:
          m.assignedHostPlayerUserId === m.player1Id
            ? 'A'
            : m.assignedHostPlayerUserId === m.player2Id
              ? 'B'
              : null,
        hostUserId: m.assignedHostPlayerUserId,
        scheduledStartAt: scheduledAt,
        matchDate,
        gameCategory,
        status,
        verificationStatus,
        roundLabel: getStageLabel(m),
        isHost: m.assignedHostPlayerUserId === playerId,
        isCompleted,
        isInProgress,
        countdownLabel,
        delayedLabel,
        resultLabel,
        scoreLabel
      };
    });
  }, [filteredMatches, seasonById, nowMs, opponents, playerId]);

  const upcomingMatches = useMemo(
    () =>
      viewMatches.filter(
        (m) =>
          !m.isCompleted &&
          m.status === 'scheduled' &&
          !['qr_issued', 'verified', 'expired', 'failed'].includes(m.verificationStatus)
      ),
    [viewMatches]
  );

  const queueMatches = useMemo(
    () =>
      viewMatches.filter((m) => {
        if (m.isCompleted) return false;
        if (!m.hostUserId) return false;
        if (m.status === 'ready' || m.status === 'in_progress') return true;
        const verification = m.verificationStatus || 'not_requested';
        if (m.status === 'scheduled' && verification === 'not_requested') return false;
        if (['qr_issued', 'verified', 'expired', 'failed', 'pending'].includes(verification)) return true;
        return false;
      }),
    [viewMatches]
  );

  const historyMatches = useMemo(() => {
    let filtered = viewMatches.filter((m) => m.isCompleted);
    if (historyResultFilter !== 'all') {
      filtered = filtered.filter((m) => {
        if (!m.resultLabel) return false;
        return historyResultFilter === 'win' ? m.resultLabel === 'Win' : m.resultLabel === 'Loss';
      });
    }
    if (historyDateFrom) {
      const from = new Date(historyDateFrom).getTime();
      filtered = filtered.filter((m) => {
        const date = m.matchDate ? new Date(m.matchDate).getTime() : 0;
        return date >= from;
      });
    }
    if (historyDateTo) {
      const to = new Date(historyDateTo).getTime() + 24 * 60 * 60 * 1000;
      filtered = filtered.filter((m) => {
        const date = m.matchDate ? new Date(m.matchDate).getTime() : 0;
        return date <= to;
      });
    }
    return filtered;
  }, [viewMatches, historyResultFilter, historyDateFrom, historyDateTo]);

  const activeOpponentRequest = activeOpponentMatchId
    ? verificationRequests[activeOpponentMatchId]
    : null;

  const resultMatch = resultMatchId
    ? viewMatches.find((m) => m.matchId === resultMatchId) || null
    : null;

  const handleHostStart = async (matchId: string) => {
    try {
      setHostError(null);
      const result = await matchmakingApi.hostStartMatch(matchId, accessToken);
      if (!result.success) {
        setHostError(result.error || 'Failed to request QR');
        return;
      }
      setHostMatchId(matchId);
      setHostExpiresAt(result.data?.expiresAt || null);
      setHostModalOpen(true);
    } catch (err: any) {
      setHostError(err?.message || 'Failed to request QR');
    }
  };

  const handleHostVerify = async (matchId: string, payload: string) => {
    try {
      setHostError(null);
      let token = payload;
      let bleNonce = '';
      try {
        const parsed = JSON.parse(payload);
        token = parsed.token || payload;
        bleNonce = parsed.bleNonce || '';
      } catch {
        token = payload;
      }
      if (!bleNonce) {
        setHostError('BLE verification data missing. Ask opponent to refresh QR.');
        return;
      }
      const verifyResult = await matchmakingApi.hostVerifyMatch(
        matchId,
        token,
        bleNonce,
        accessToken
      );
      if (!verifyResult.success) {
        setHostError(verifyResult.error || 'Verification failed');
        return;
      }
      await matchmakingApi.startMatch(matchId, { source: 'host_verification' }, accessToken);
      const match = viewMatches.find((item) => item.matchId === matchId);
      const category = match?.gameCategory || 'BILLIARDS';
      router.push(getGameRoute(category, matchId));
    } catch (err: any) {
      setHostError(err?.message || 'Verification failed');
    }
  };

  const handleStartVerifiedMatch = async (matchId: string, gameCategory: string) => {
    try {
      await matchmakingApi.startMatch(matchId, { source: 'host_verified' }, accessToken);
      router.push(getGameRoute(gameCategory, matchId));
    } catch (err: any) {
      setHostError(err?.message || 'Failed to start match');
    }
  };

  const getMatchAction = (match: MatchViewModel) => {
    const verificationLabel = getVerificationLabel(match.status, match.verificationStatus);
    if (match.isCompleted) {
      return {
        label: 'View results',
        onClick: () => setResultMatchId(match.matchId),
        variant: 'secondary' as const
      };
    }
    if (match.isInProgress) {
      return {
        label: 'Enter match',
        onClick: () => router.push(getGameRoute(match.gameCategory, match.matchId)),
        variant: 'default' as const
      };
    }
    if (match.isHost) {
      if (verificationLabel === 'VERIFIED') {
        return {
          label: 'Enter match',
          onClick: () => handleStartVerifiedMatch(match.matchId, match.gameCategory),
          variant: 'default' as const
        };
      }
      return {
        label: 'Start match',
        onClick: () => handleHostStart(match.matchId),
        variant: 'default' as const
      };
    }
    if (verificationLabel === 'QR_ISSUED') {
      const hasToken = !!verificationRequests[match.matchId];
      return {
        label: 'Show QR',
        onClick: () => setActiveOpponentMatchId(match.matchId),
        variant: 'secondary' as const,
        disabled: !hasToken
      };
    }
    return {
      label: 'Waiting',
      onClick: () => {},
      variant: 'secondary' as const,
      disabled: true
    };
  };

  const getQueueHint = (match: MatchViewModel) => {
    const verificationLabel = getVerificationLabel(match.status, match.verificationStatus);
    if (match.isHost) {
      if (verificationLabel === 'VERIFIED') return 'Verification complete. Start the match when ready.';
      return 'Start match to issue the opponent QR.';
    }
    if (verificationLabel === 'QR_ISSUED') return 'Show the QR to your host.';
    return 'Waiting for host to initiate verification.';
  };

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
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-200/80">My Matches</p>
              <h1 className="mt-2 text-4xl font-semibold">All Seasons Match Center</h1>
              <p className="mt-2 text-sm text-white/70">
                Track scheduled fixtures, verification queue, and completed results across every season.
              </p>
            </div>
            <div className="w-full sm:max-w-[240px]">
              <Select value={seasonFilter} onValueChange={setSeasonFilter}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="All seasons" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All seasons</SelectItem>
                  {allSeasonIds.map((seasonId) => {
                    const season = seasonById[seasonId];
                    const label = season?.name || season?.tournament?.name || `Season ${seasonId.slice(0, 8)}`;
                    return (
                      <SelectItem key={seasonId} value={seasonId}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full sm:max-w-[220px]">
              <Select value={gameCategoryFilter} onValueChange={setGameCategoryFilter}>
                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                  <SelectValue placeholder="All games" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All games</SelectItem>
                  {GAME_CATEGORY_OPTIONS.map((category) => (
                    <SelectItem key={category} value={category}>
                      {getGameCategoryLabel(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="bg-white/5 border border-white/10">
              <TabsTrigger value="upcoming">Upcoming ({upcomingMatches.length})</TabsTrigger>
              <TabsTrigger value="queue">Queue ({queueMatches.length})</TabsTrigger>
              <TabsTrigger value="history">History ({historyMatches.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="upcoming" className="mt-6 space-y-4">
              {upcomingMatches.length === 0 ? (
                <p className="text-sm text-white/60">
                  No scheduled matches yet. Join more seasons to see upcoming fixtures.
                </p>
              ) : (
                upcomingMatches.map((match) => (
                  <MatchCard
                    key={match.matchId}
                    match={match}
                    statusLabel={getStatusBadge(match.status, match.verificationStatus)}
                    verificationLabel={getVerificationLabel(match.status, match.verificationStatus)}
                    countdown={match.countdownLabel}
                    delayedLabel={match.delayedLabel}
                    action={getMatchAction(match)}
                    queueHint={getQueueHint(match)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="queue" className="mt-6 space-y-4">
              {queueMatches.length === 0 ? (
                <p className="text-sm text-white/60">
                  No matches in queue right now.
                </p>
              ) : (
                queueMatches.map((match) => (
                  <MatchCard
                    key={match.matchId}
                    match={match}
                    statusLabel={getStatusBadge(match.status, match.verificationStatus)}
                    verificationLabel={getVerificationLabel(match.status, match.verificationStatus)}
                    countdown={match.countdownLabel || 'No schedule yet'}
                    delayedLabel={match.delayedLabel}
                    action={getMatchAction(match)}
                    queueHint={getQueueHint(match)}
                  />
                ))
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-6 space-y-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:flex-row sm:items-end">
                <div className="w-full sm:max-w-[200px]">
                  <p className="mb-2 text-xs text-white/60">Result</p>
                  <Select value={historyResultFilter} onValueChange={setHistoryResultFilter}>
                    <SelectTrigger className="bg-white/10 border-white/20 text-white">
                      <SelectValue placeholder="All results" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All results</SelectItem>
                      <SelectItem value="win">Wins only</SelectItem>
                      <SelectItem value="loss">Losses only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-full sm:max-w-[200px]">
                  <p className="mb-2 text-xs text-white/60">From</p>
                  <input
                    type="date"
                    value={historyDateFrom}
                    onChange={(event) => setHistoryDateFrom(event.target.value)}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
                  />
                </div>
                <div className="w-full sm:max-w-[200px]">
                  <p className="mb-2 text-xs text-white/60">To</p>
                  <input
                    type="date"
                    value={historyDateTo}
                    onChange={(event) => setHistoryDateTo(event.target.value)}
                    className="w-full rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40"
                  />
                </div>
              </div>

              {historyMatches.length === 0 ? (
                <p className="text-sm text-white/60">
                  No completed matches yet.
                </p>
              ) : (
                historyMatches.map((match) => (
                  <MatchCard
                    key={match.matchId}
                    match={match}
                    statusLabel={getStatusBadge(match.status, match.verificationStatus)}
                    verificationLabel={getVerificationLabel(match.status, match.verificationStatus)}
                    countdown={match.matchDate ? `Played ${formatDateTime(match.matchDate)}` : null}
                    delayedLabel={match.delayedLabel}
                    action={getMatchAction(match)}
                    queueHint={match.resultLabel ? `${match.resultLabel} - ${match.scoreLabel || 'Score TBD'}` : null}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        </section>

        <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-blue-200/80">Tournament Map</p>
              <h2 className="mt-2 text-2xl font-semibold">Progression Path</h2>
              <p className="text-sm text-white/70">
                View group standings and bracket progress to see what comes next.
              </p>
            </div>
            {seasonFilter !== 'all' && (
              <Button asChild className="bg-blue-500 hover:bg-blue-600">
                <Link href={`/tournament/${seasonFilter}`}>Open Tournament Map</Link>
              </Button>
            )}
          </div>

          {seasonFilter === 'all' && (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {allSeasonIds.length === 0 && (
                <p className="text-sm text-white/60">Join a season to unlock the map view.</p>
              )}
              {allSeasonIds.map((seasonId) => {
                const season = seasonById[seasonId];
                const label = season?.name || season?.tournament?.name || `Season ${seasonId.slice(0, 8)}`;
                return (
                  <Card key={seasonId} className="bg-white/5 border-white/10">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-white">{label}</p>
                        <p className="text-xs text-white/60">Season {seasonId}</p>
                      </div>
                      <Button asChild variant="secondary">
                        <Link href={`/tournament/${seasonId}`}>Tournament Map</Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {hostMatchId && (
        <HostScanModal
          open={hostModalOpen}
          matchId={hostMatchId}
          expiresAt={hostExpiresAt}
          error={hostError}
          onClose={() => setHostModalOpen(false)}
          onRefresh={() => handleHostStart(hostMatchId)}
          onScan={(value) => handleHostVerify(hostMatchId, value)}
        />
      )}

      {activeOpponentRequest && (
        <OpponentQrModal
          open={!!activeOpponentMatchId}
          matchId={activeOpponentRequest.matchId}
          token={activeOpponentRequest.token}
          bleNonce={activeOpponentRequest.bleNonce}
          expiresAt={activeOpponentRequest.expiresAt}
          onClose={() => setActiveOpponentMatchId(null)}
        />
      )}

      <Dialog open={!!resultMatch} onOpenChange={() => setResultMatchId(null)}>
        <DialogContent className="bg-slate-950 border-white/10 text-white">
          <DialogHeader>
            <DialogTitle>Match Results</DialogTitle>
          </DialogHeader>
          {resultMatch && (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-white">
                  {resultMatch.playerA.name} vs {resultMatch.playerB.name}
                </p>
                <p className="text-white/60">Match {resultMatch.matchId.slice(0, 8)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-white/80">Result: {resultMatch.resultLabel || 'Completed'}</p>
                <p className="text-white/60">Score: {resultMatch.scoreLabel || 'TBD'}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-white/60">Season: {resultMatch.seasonLabel}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MatchCard({
  match,
  statusLabel,
  verificationLabel,
  countdown,
  delayedLabel,
  action,
  queueHint
}: {
  match: MatchViewModel;
  statusLabel: string;
  verificationLabel: string;
  countdown: string | null;
  delayedLabel: string | null;
  action: { label: string; onClick: () => void; variant: 'default' | 'secondary'; disabled?: boolean };
  queueHint?: string | null;
}) {
  return (
    <Card className="bg-black/20 border-white/10">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-white/60">
              <Badge variant="secondary">{statusLabel}</Badge>
              <Badge variant="outline" className="border-white/20 text-white/70">
                {verificationLabel}
              </Badge>
              <Badge variant="outline" className="border-white/20 text-white/70">
                {getGameCategoryLabel(match.gameCategory)}
              </Badge>
              {match.roundLabel && (
                <Badge variant="outline" className="border-white/20 text-white/70">
                  {match.roundLabel}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 text-sm text-white">
              <div className="flex flex-col">
                <span className="font-medium">{match.playerA.name}</span>
                {match.hostSide === 'A' && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/90">Host</span>
                )}
              </div>
              <span className="text-white/40">vs</span>
              <div className="flex flex-col text-right">
                <span className="font-medium">{match.playerB.name}</span>
                {match.hostSide === 'B' && (
                  <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-200/90">Host</span>
                )}
              </div>
            </div>

            {!match.hostSide && (
              <div className="text-[10px] uppercase tracking-[0.2em] text-white/40">Host TBD (Legacy match)</div>
            )}

            <div className="text-xs text-white/60">
              {match.seasonLabel}
            </div>

            {countdown && (
              <div className="text-xs text-white/70">
                {countdown}
                {delayedLabel ? ` - ${delayedLabel}` : ''}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:items-end">
            <Button
              className={action.variant === 'default' ? 'bg-emerald-500 hover:bg-emerald-600 text-white' : ''}
              variant={action.variant}
              onClick={action.onClick}
              disabled={action.disabled}
            >
              {action.label}
            </Button>
            {queueHint && <p className="text-xs text-white/60">{queueHint}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
