'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { tournamentApi, matchmakingApi, walletApi, lookupApi, getAvatarUrl } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Wifi } from 'lucide-react';

type Match = {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  status: string;
  scheduledTime?: string | null;
  scheduledStartAt?: string | null;
  assignedHostPlayerUserId?: string | null;
  verificationStatus?: string | null;
  verifiedAt?: string | null;
  startedAt?: string | null;
  endedAt?: string | null;
  gameSessionId?: string | null;
  metadata?: {
    matchDurationSeconds?: number;
    gameType?: string | null;
    aiDifficulty?: number | null;
    aiRating?: number | null;
    level?: number | null;
  } | null;
};

export function BilliardsMatchView({ matchId }: { matchId: string }) {
  const router = useRouter();
  const { data: session, status } = useSession();

  const playerId = session?.user?.userId;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [canPlay, setCanPlay] = useState(false);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [scoreState, setScoreState] = useState({ player1: 0, player2: 0 });
  const [playerNames, setPlayerNames] = useState<{ player1?: string; player2?: string }>({});
  const [playerAvatars, setPlayerAvatars] = useState<{ player1?: string; player2?: string }>({});
  const [completionStatus, setCompletionStatus] = useState<'idle' | 'submitting' | 'completed' | 'error'>('idle');
  const [completionError, setCompletionError] = useState<string | null>(null);
  const completionRef = useRef(false);
  const gameType = 'multiplayer'; // Fixed to multiplayer mode only

  const matchDurationSeconds = useMemo(() => {
    const raw = match?.metadata?.matchDurationSeconds;
    return Number(raw || 300);
  }, [match]);

  const iframeSrc = useMemo(() => {
    if (!match || !session?.user) return '';

    const matchmakingUrl = process.env.NEXT_PUBLIC_MATCHMAKING_SERVICE_URL || '';
    const gameServiceUrl = process.env.NEXT_PUBLIC_GAME_SERVICE_URL || '';
    const matchmakingSocketPath = process.env.NEXT_PUBLIC_MATCHMAKING_SOCKET_PATH || '';
    const gameSocketPath = process.env.NEXT_PUBLIC_GAME_SOCKET_PATH || '';
    const matchMode = 'match';

    // Check for debug mode from URL
    const urlParams = new URLSearchParams(window?.location?.search || '');
    const debugMode = urlParams.get('debug') === '1';

    const params = new URLSearchParams({
      autostart: '1',
      mode: matchMode,
      matchId: String(matchId),
      matchDurationSeconds: String(matchDurationSeconds),
      player1Id: match.player1Id,
      player2Id: match.player2Id,
      matchmakingUrl,
      gameServiceUrl,
      matchmakingSocketPath,
      gameSocketPath
    });

    if (playerId) {
      params.set('playerId', playerId);
    }

    // Add JWT token for authentication
    if (session?.accessToken) {
      params.set('token', session.accessToken);
    }

    // Add gameSessionId if available
    if (match.gameSessionId) {
      params.set('gameSessionId', match.gameSessionId);
    }

    // Pass debug mode to the game
    if (debugMode) {
      params.set('debug', '1');
    }

    // Add autostart parameter to skip mode selection
    params.set('autostart', '1');
    params.set('skipModeSelection', '1');
    params.set('forcePvp', '1');
    if (playerNames.player1) {
      params.set('player1Name', playerNames.player1);
    }
    if (playerNames.player2) {
      params.set('player2Name', playerNames.player2);
    }
    if (playerAvatars.player1) {
      params.set('player1Avatar', playerAvatars.player1);
    }
    if (playerAvatars.player2) {
      params.set('player2Avatar', playerAvatars.player2);
    }

    // Always use original 8ball for multiplayer matches
    return `/8ball-match/index.html?${params.toString()}`;
  }, [
    match,
    matchDurationSeconds,
    matchId,
    session?.user,
    playerId,
    gameType,
    playerNames.player1,
    playerNames.player2,
    playerAvatars.player1,
    playerAvatars.player2
  ]);

  const toNumber = (value: unknown, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const normalizeMatchResult = (payload: any) => {
    if (!payload) return null;

    if (payload?.winner && payload?.results) {
      return {
        winnerId: String(payload.winner),
        player1Score: toNumber(payload.results.player1Score, 0),
        player2Score: toNumber(payload.results.player2Score, 0),
        matchDuration: toNumber(payload.duration, matchDurationSeconds),
        endReason: payload.endReason || '8ball_potted'
      };
    }

    const embedded = payload?.data?.metadata?.result || payload?.metadata?.result;
    if (embedded?.winnerId) {
      return {
        winnerId: String(embedded.winnerId),
        player1Score: toNumber(embedded.player1Score, 0),
        player2Score: toNumber(embedded.player2Score, 0),
        matchDuration: toNumber(
          embedded.matchDuration ?? payload?.data?.metadata?.matchDurationSeconds ?? payload?.metadata?.matchDurationSeconds,
          matchDurationSeconds
        ),
        endReason: embedded.endReason || embedded.reason || payload?.endReason || payload?.reason || '8ball_potted'
      };
    }

    if (payload?.winnerId) {
      return {
        winnerId: String(payload.winnerId),
        player1Score: toNumber(payload.player1Score, 0),
        player2Score: toNumber(payload.player2Score, 0),
        matchDuration: toNumber(payload.matchDuration ?? payload.matchDurationSeconds, matchDurationSeconds),
        endReason: payload.endReason || payload.reason || '8ball_potted'
      };
    }

    return null;
  };

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    const run = async () => {
      if (!playerId) return;
      setLoading(true);
      setError(null);

      try {
        const matchRes = await matchmakingApi.getMatchMultiplayer(String(matchId));
        const matchData = matchRes.data?.match as Match | undefined;

        if (!matchData) {
          throw new Error('Match not found');
        }

        if (matchData.player1Id !== playerId && matchData.player2Id !== playerId) {
          throw new Error('You are not a participant in this match');
        }

        if (!matchData.seasonId) {
          throw new Error('Match is not associated with a season');
        }

        const seasonRes = await tournamentApi.getSeason(matchData.seasonId);
        const seasonData = seasonRes.data as any;

        const joined = !!seasonData?.tournamentPlayers?.some(
          (p: any) => p.playerId === playerId
        );

        if (!joined) {
          throw new Error('You must join the season (and pay the fee) before playing this match');
        }

        const seasonStatus = String(seasonData?.status || '');
        const seasonEndedStatuses = new Set(['completed', 'finished', 'cancelled']);
        if (seasonEndedStatuses.has(seasonStatus)) {
          throw new Error('Season has ended');
        }

        if (['completed', 'cancelled'].includes(matchData.status)) {
          throw new Error('Match has ended');
        }
        if (matchData.endedAt) {
          throw new Error('Match has ended');
        }
        if (matchData.startedAt) {
          const matchEndTime = new Date(matchData.startedAt).getTime() + matchDurationSeconds * 1000;
          if (Date.now() > matchEndTime) {
            throw new Error('Match time has expired');
          }
        }

        const verificationStatus = String(matchData.verificationStatus || '').toLowerCase();
        if (verificationStatus && verificationStatus !== 'verified' && !matchData.startedAt) {
          throw new Error('Match verification is still pending. Ask the host to verify.');
        }

        await walletApi.getWallet(session?.accessToken || '');

        setMatch(matchData);
        const currentName = session?.user?.username || `${session?.user?.firstName || ''} ${session?.user?.lastName || ''}`.trim();
        const lookup = await lookupApi.resolveMatchLookups(
          {
            opponentIds: [matchData.player1Id, matchData.player2Id],
            tournamentIds: [matchData.tournamentId]
          },
          session?.accessToken
        ).catch(() => null);

        const opponents = lookup?.data?.data?.opponents || lookup?.data?.opponents || {};
        const opponentAvatars = lookup?.data?.data?.opponentAvatars || lookup?.data?.opponentAvatars || {};
        const resolveName = (id: string) => {
          const resolved = opponents?.[id];
          if (resolved) return resolved;
          if (id === playerId) return currentName || id;
          return 'Opponent';
        };
        const resolveAvatar = (id: string) => {
          const avatar = opponentAvatars?.[id];
          if (avatar) return getAvatarUrl(avatar);
          if (id === playerId) {
            return (session?.user as any)?.avatarUrl || (session?.user as any)?.avatar || '';
          }
          return '';
        };
        setPlayerNames({
          player1: resolveName(matchData.player1Id),
          player2: resolveName(matchData.player2Id)
        });
        setPlayerAvatars({
          player1: resolveAvatar(matchData.player1Id),
          player2: resolveAvatar(matchData.player2Id)
        });
        setCanPlay(true);
      } catch (err: any) {
        setError(err?.message || 'Failed to load match');
        setCanPlay(false);
      } finally {
        setLoading(false);
      }
    };

    if (status === 'authenticated') {
      run();
    }
  }, [matchId, playerId, status, session?.accessToken, matchDurationSeconds]);

  // Send player data to iframe when it loads
  useEffect(() => {
    if (iframeLoaded && session?.user && match) {
      const iframe = document.querySelector('iframe');
      if (iframe?.contentWindow) {
        const matchmakingUrl = process.env.NEXT_PUBLIC_MATCHMAKING_SERVICE_URL;
        const gameServiceUrl = process.env.NEXT_PUBLIC_GAME_SERVICE_URL;
        const matchmakingSocketPath = process.env.NEXT_PUBLIC_MATCHMAKING_SOCKET_PATH;
        const gameSocketPath = process.env.NEXT_PUBLIC_GAME_SOCKET_PATH;
        const currentAvatar =
          (session.user as any)?.avatarUrl ||
          (session.user as any)?.avatar ||
          (session.user as any)?.image ||
          '';
        const player1Avatar =
          match.player1Id === session.user.userId ? currentAvatar : '';
        const player2Avatar =
          match.player2Id === session.user.userId ? currentAvatar : '';
        const playerData = {
          type: 'SET_PLAYER_DATA',
          data: {
            playerId: session.user.userId,
            playerName: session.user.username || `${session.user.firstName} ${session.user.lastName}`.trim(),
            token: session.accessToken,
            mode: 'match',
            matchId: String(matchId),
            player1Id: match.player1Id,
            player2Id: match.player2Id,
            player1Name: playerNames.player1 || '',
            player2Name: playerNames.player2 || '',
            player1Avatar: player1Avatar || '',
            player2Avatar: player2Avatar || '',
            matchmakingUrl,
            gameServiceUrl,
            matchmakingSocketPath,
            gameSocketPath
          }
        };
        iframe.contentWindow.postMessage(playerData, '*');
      }
    }
  }, [iframeLoaded, session?.user, match, playerNames, playerAvatars, matchId]);

  useEffect(() => {
    if (!match?.matchId || !session?.accessToken) return;

    const handleMessage = (event: MessageEvent) => {
      if (!event?.data) return;

      if (event.data.type === 'SCORE_UPDATE') {
        setScoreState(event.data.data || { player1: 0, player2: 0 });
      }

      if (event.data.type === 'MATCH_COMPLETE') {
        if (completionRef.current) return;
        completionRef.current = true;

        const result = normalizeMatchResult(event.data.data);
        if (!result) {
          setCompletionStatus('error');
          setCompletionError('Match completed but result was invalid.');
          return;
        }

        setCompletionStatus('submitting');

        matchmakingApi.updateMatchResult(
          match.matchId,
          {
            winnerId: result.winnerId,
            player1Score: result.player1Score,
            player2Score: result.player2Score,
            matchDuration: result.matchDuration,
            endReason: result.endReason
          },
          session.accessToken
        ).then(() => {
          setCompletionStatus('completed');
        }).catch((err: any) => {
          setCompletionStatus('error');
          setCompletionError(err?.message || 'Failed to submit match result');
        });
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [match?.matchId, session?.accessToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white">
        Loading match...
      </div>
    );
  }

  if (error || !match || !canPlay) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-lg text-center space-y-4">
          <h2 className="text-2xl font-semibold">Match unavailable</h2>
          <p className="text-white/70">{error || 'You cannot play this match right now.'}</p>
          <Button onClick={() => router.push('/game')}>Back to matches</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="text-sm text-white/70">
          {playerNames.player1 || match.player1Id} vs {playerNames.player2 || match.player2Id}
        </div>
        <div className="flex items-center gap-3 text-xs text-white/60">
          <Wifi className="h-4 w-4" />
          Match {match.matchId.slice(0, 8)}
        </div>
      </div>

      <div className="flex-1 bg-black">
        <iframe
          src={iframeSrc}
          title="Billiards Match"
          className="w-full h-full border-0"
          onLoad={() => setIframeLoaded(true)}
          allow="camera; microphone; fullscreen"
        />
      </div>

      <div className="border-t border-white/10 px-4 py-3 text-xs text-white/70 flex items-center justify-between">
        <div>
          Score: {scoreState.player1} - {scoreState.player2}
        </div>
        <div>
          {completionStatus === 'submitting' && 'Submitting result...'}
          {completionStatus === 'completed' && 'Result submitted'}
          {completionStatus === 'error' && completionError}
        </div>
      </div>
    </div>
  );
}
