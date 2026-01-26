'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  assignedAgentId?: string | null;
  assignedAgentUserId?: string | null;
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

export default function PlayMatchPage() {
  const { matchId } = useParams<{ matchId: string }>();
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

        if (
          matchData.player1Id !== playerId &&
          matchData.player2Id !== playerId &&
          matchData.assignedAgentUserId !== playerId
        ) {
          throw new Error('You are not a participant in this match');
        }

        if (!matchData.seasonId) {
          throw new Error('Match is not associated with a season');
        }

        const seasonRes = await tournamentApi.getSeason(matchData.seasonId);
        const seasonData = seasonRes.data as any;

        // Agents don't need to join the season to start/view matches they are assigned to
        const isAssignedAgent = matchData.assignedAgentUserId === playerId;
        const joined = isAssignedAgent || !!seasonData?.tournamentPlayers?.some(
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
            player1Avatar,
            player2Avatar,
            matchmakingUrl,
            gameServiceUrl,
            matchmakingSocketPath,
            gameSocketPath
          }
        };

        iframe.contentWindow.postMessage(playerData, window.location.origin);
      }
    }
  }, [iframeLoaded, session, match, matchId, playerNames, gameType]);

  useEffect(() => {
    if (!match) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'Are you sure you want to leave? Your match progress will be lost and this is a real money game.';
      return event.returnValue;
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      // Block Refresh (Ctrl+R, F5, Cmd+R)
      if (((event.ctrlKey || event.metaKey) && key === 'r') || event.key === 'F5') {
        event.preventDefault();
      }
      // Block Back navigation (Alt+Left, Cmd+[)
      if ((event.altKey && event.key === 'ArrowLeft') || ((event.ctrlKey || event.metaKey) && event.key === '[')) {
        event.preventDefault();
      }
    };
    const handlePopState = (event: PopStateEvent) => {
      // Prevent back navigation by pushing the state again
      window.history.pushState(null, '', window.location.href);
    };

    // Push initial state to trap back button
    window.history.pushState(null, '', window.location.href);

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [match]);

  // Listen for game events from iframe
  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;

      const { type, data } = event.data;
      switch (type) {
        case 'GAME_STATE_CHANGED':
          console.log('Game state changed:', data.state);
          break;
        case 'SCORE_UPDATE':
          setScoreState({
            player1: Number(data?.player1Score || 0),
            player2: Number(data?.player2Score || 0)
          });
          break;
        case 'MATCH_COMPLETED':
          console.log('Match completed:', data);
          if (completionRef.current) {
            break;
          }
          {
            const matchResult = normalizeMatchResult(data);
            if (!matchResult?.winnerId) {
              console.warn('Match completed payload missing winner info', data);
              break;
            }
            completionRef.current = true;
            setCompletionStatus('submitting');
            setCompletionError(null);
            try {
              const result = await matchmakingApi.updateMatchResult(
                String(matchId),
                matchResult,
                session?.accessToken
              );
              if (!result?.success) {
                const message = (result as any)?.error || (result as any)?.message || 'Failed to submit match result';
                throw new Error(message);
              }
              setCompletionStatus('completed');
              setMatch((prev) => (prev ? { ...prev, status: 'completed', endedAt: new Date().toISOString() } : prev));
              console.log('Match result submitted successfully');
            } catch (error) {
              completionRef.current = false;
              setCompletionStatus('error');
              setCompletionError(error instanceof Error ? error.message : 'Failed to submit match result');
              console.error('Failed to submit match result:', error);
            }
          }
          break;
        case 'NAVIGATE': {
          const destination = data?.to;
          if (destination) {
            if (data?.replace) {
              router.replace(destination);
            } else {
              router.push(destination);
            }
          }
          break;
        }
        case 'GAME_EXIT':
        case 'BACK_TO_LOBBY':
          router.replace('/game');
          break;
        case 'CONNECTION_ERROR':
          console.error('Game connection error:', data.error);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [matchDurationSeconds, matchId, router, session?.accessToken]);

  const handleIframeLoad = () => {
    setIframeLoaded(true);
  };

  const handleBackToLobby = () => {
    router.replace('/game');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border border-white/20 border-t-white mx-auto"></div>
          <p className="text-white/70 text-sm">Loading match...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4 max-w-sm px-4">
          <p className="text-red-200">{error}</p>
          <Button className="border-white/20 text-white" onClick={() => router.push('/game')}>
            Back to matches
          </Button>
        </div>
      </div>
    );
  }

  if (!match) {
    return null;
  }

  if (!canPlay) {
    const scheduledAt = match.scheduledStartAt || match.scheduledTime;
    return (
      <div className="flex items-center justify-center w-full h-full">
        <div className="text-center space-y-4 max-w-lg px-4">
          <p className="text-white text-lg font-semibold">Match play is handled at the club kiosk.</p>
          <p className="text-white/70 text-sm">
            Show this match ID to the assigned agent to start your game.
          </p>
          <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-left text-sm text-white/80">
            <p>Match: {match.matchId}</p>
            <p>Status: {match.status}</p>
            <p>Scheduled: {scheduledAt ? new Date(scheduledAt).toLocaleString() : 'TBD'}</p>
            <p>Assigned agent: {match.assignedAgentUserId || match.assignedAgentId || 'TBD'}</p>
          </div>
          <Button className="border-white/20 text-white" onClick={() => router.push('/game')}>
            Back to matches
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-screen h-[100dvh] overflow-hidden sm:h-screen sm:w-full">
      <iframe
        src={iframeSrc}
        title="8-ball match"
        className="absolute inset-0 h-full w-full border-0"
        allow="autoplay; fullscreen"
        allowFullScreen
        onLoad={handleIframeLoad}
      />

      {/* Connection status indicator */}
      

      {completionStatus !== 'idle' && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-black/80 p-6 text-center">
            <p className="text-sm uppercase tracking-[0.3em] text-white/60">Match status</p>
            <h2 className="mt-3 text-2xl font-semibold text-white">
              {completionStatus === 'submitting' && 'Finalizing match'}
              {completionStatus === 'completed' && 'Match completed'}
              {completionStatus === 'error' && 'Match completion failed'}
            </h2>
            {completionStatus === 'error' && (
              <p className="mt-3 text-sm text-red-200">{completionError || 'Please try again.'}</p>
            )}
            <div className="mt-5 flex justify-center gap-3">
              <Button className="border-white/20 text-white" onClick={handleBackToLobby}>
                Back to matches
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
