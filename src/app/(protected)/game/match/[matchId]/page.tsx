'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { tournamentApi, matchmakingApi, walletApi } from '@/lib/apiService';
import { Button } from '@/components/ui/button';
import { Clock, Wifi, WifiOff } from 'lucide-react';
import { PoolGameCanvas } from '@/components/pool/PoolGameCanvas';
import { GameState, PoolGameEngine, ShotData } from '@/lib/pool/engine';
import { io, Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { gameSocketService } from '@/lib/gameSocketService';
import { normalizeSocketTarget } from '@/lib/socket';

type Match = {
  matchId: string;
  tournamentId: string;
  seasonId?: string | null;
  player1Id: string;
  player2Id: string;
  status: string;
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
  const [matchSocket, setMatchSocket] = useState<Socket | null>(null);
  const [matchPhase, setMatchPhase] = useState<'ready' | 'waiting' | 'live'>('ready');
  const [playersReady, setPlayersReady] = useState(0);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [matchmakingConnected, setMatchmakingConnected] = useState(false);
  const [opponentConnected, setOpponentConnected] = useState(false);
  const [matchResult, setMatchResult] = useState<{ outcome: 'win' | 'lose'; message: string } | null>(null);
  const [redirectIn, setRedirectIn] = useState<number | null>(null);
  const matchSocketRef = useRef<Socket | null>(null);
  const engineRef = useRef<PoolGameEngine | null>(null);
  const sentCompleteRef = useRef(false);
  const matchResultRef = useRef(false);
  const pendingStateRef = useRef<GameState | null>(null);

  const matchmakingSocketUrl = useMemo(
    () => process.env.NEXT_PUBLIC_MATCHMAKING_SERVICE_URL || 'http://localhost:3009',
    []
  );
  const matchmakingSocketTarget = useMemo(
    () => normalizeSocketTarget(matchmakingSocketUrl),
    [matchmakingSocketUrl]
  );
  const localSide = useMemo(() => {
    if (!match || !playerId) return 'p1';
    return match.player1Id === playerId ? 'p1' : 'p2';
  }, [match, playerId]);

  const handleEngineReady = useCallback((engine: PoolGameEngine) => {
    engineRef.current = engine;
    engine.setLocalSide(localSide);
    if (pendingStateRef.current) {
      engine.applyState(pendingStateRef.current);
      pendingStateRef.current = null;
    }
  }, [localSide]);

  const handleShot = useCallback((shot: ShotData) => {
    if (!sessionId) return;
    gameSocketService.sendAction('shot', shot);
  }, [sessionId]);

  const handleState = useCallback((state: GameState) => {
    if (!sessionId) return;
    gameSocketService.updateState(state);

    if (state.winner && match && !sentCompleteRef.current) {
      sentCompleteRef.current = true;
      const winnerId = state.winner === 'p1' ? match.player1Id : match.player2Id;
      gameSocketService.completeGame(winnerId, state.p1Score, state.p2Score, {
        matchId: match.matchId,
        tournamentId: match.tournamentId,
        seasonId: match.seasonId
      });
    }

    if (state.winner && !matchResultRef.current) {
      matchResultRef.current = true;
      setMatchResult({
        outcome: state.winner === localSide ? 'win' : 'lose',
        message: state.message || (state.winner === localSide ? 'You won the match.' : 'You lost the match.')
      });
      setRedirectIn(5);
    }
  }, [match, sessionId, localSide]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  useEffect(() => {
    sentCompleteRef.current = false;
    matchResultRef.current = false;
    setMatchResult(null);
    setRedirectIn(null);
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || !playerId) return;
    gameSocketService.connect();
    gameSocketService.authenticate(playerId, session?.accessToken);

    const unsubAuth = gameSocketService.on('authenticated', () => {
      gameSocketService.joinGame(sessionId);
    });

    const unsubJoined = gameSocketService.on('game_joined', (data: any) => {
      if (!data?.gameState) return;
      if (engineRef.current) {
        engineRef.current.applyState(data.gameState as GameState);
      } else {
        pendingStateRef.current = data.gameState as GameState;
      }
    });

    const unsubGameStart = gameSocketService.on('game_start', () => {
      setMatchPhase('live');
      setOpponentConnected(true);
      toast.success('Game started! Good luck!');
    });

    const unsubAction = gameSocketService.on('game_action', (data: any) => {
      if (!engineRef.current || !playerId) return;
      if (data?.playerId === playerId) return;
      if (data?.action === 'shot') {
        engineRef.current.applyRemoteShot(data.data as ShotData);
        setOpponentConnected(true);
      }
    });

    const unsubState = gameSocketService.on('state_updated', (data: any) => {
      if (!engineRef.current) return;
      engineRef.current.applyState(data.gameState as GameState);
    });

    const unsubCompleted = gameSocketService.on('game_completed', (data: any) => {
      toast.success(data.winnerId === playerId ? 'You won!' : 'Match ended');
    });

    const unsubError = gameSocketService.on('error', (data: any) => {
      toast.error(data?.message || 'Game connection error');
    });

    return () => {
      unsubAuth();
      unsubJoined();
      unsubGameStart();
      unsubAction();
      unsubState();
      unsubCompleted();
      unsubError();
      gameSocketService.disconnect();
    };
  }, [sessionId, playerId, session?.accessToken]);

  useEffect(() => {
    const run = async () => {
      if (!playerId) return;
      setLoading(true);
      setError(null);

      try {
        const matchRes = await matchmakingApi.getMatch(String(matchId));
        const matchData = matchRes.data?.match as Match | undefined;
        const sessionData = matchRes.data?.session as { id?: string; sessionId?: string } | undefined;
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
        const joined = !!seasonRes.data?.tournamentPlayers?.some(
          (p: any) => p.playerId === playerId
        );
        if (!joined) {
          throw new Error('You must join the season (and pay the fee) before playing this match');
        }

        await walletApi.getWallet(session?.accessToken || '');

        setMatch(matchData);
        if (matchData.status === 'in-progress') {
          setMatchPhase('live');
        } else if (matchData.status === 'ready') {
          setMatchPhase('ready');
        }
        if (sessionData?.id || sessionData?.sessionId) {
          setSessionId(sessionData?.id || sessionData?.sessionId || null);
        }
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
  }, [matchId, playerId, status, session?.accessToken]);

  useEffect(() => {
    if (!matchResult) return;
    let remaining = 5;
    setRedirectIn(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      setRedirectIn(remaining);
    }, 1000);
    const timeout = setTimeout(() => {
      router.push('/game');
    }, 5000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [matchResult, router]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (matchPhase !== 'live' || matchResultRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [matchPhase]);

  useEffect(() => {
    if (!canPlay || !session?.accessToken || !match?.matchId || !playerId) return;

    const s = io(matchmakingSocketTarget.url, {
      path: matchmakingSocketTarget.path,
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    s.on('connect', () => {
      console.log('✓ Socket connected');
      setMatchmakingConnected(true);
      s.emit('authenticate', { playerId, token: session.accessToken });
      toast.success('Connected to game server');
    });

    s.on('authenticated', (data: any) => {
      console.log('✓ Authenticated', data);
      s.emit('join:match', match.matchId);
    });

    s.on('disconnect', () => {
      console.log('✗ Socket disconnected');
      setMatchmakingConnected(false);
      setOpponentConnected(false);
      toast.error('Disconnected from game server');
    });

    s.on('reconnect', (attemptNumber: number) => {
      console.log(`✓ Reconnected after ${attemptNumber} attempts`);
      toast.success('Reconnected to game server');
    });

    s.on('match:waiting_opponent', (data: any) => {
      setMatchPhase('waiting');
      setPlayersReady(Number(data?.playersReady || 1));
    });

    s.on('game:session_created', (data: any) => {
      console.log('✓ Game session created', data);
      setSessionId(data?.sessionId || null);
    });

    s.on('error', (data: any) => {
      console.error('Socket error', data);
      toast.error(data.message || 'Connection error');
    });

    matchSocketRef.current = s;
    setMatchSocket(s);

    return () => {
      if (matchSocketRef.current) {
        matchSocketRef.current.disconnect();
        matchSocketRef.current = null;
      }
      setMatchSocket(null);
    };
  }, [canPlay, match?.matchId, session?.accessToken, matchmakingSocketTarget, playerId]);

  const markReady = () => {
    if (!matchSocket || !match?.matchId) return;
    matchSocket.emit('match:ready', { matchId: match.matchId });
    setMatchPhase('waiting');
    setPlayersReady(1);
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
          <Button  className="border-white/20 text-white" onClick={() => router.push('/game')}>
            Back to matches
          </Button>
        </div>
      </div>
    );
  }

  if (!match || !canPlay) {
    return null;
  }

  return (
    <div className="relative w-full h-full">
      <PoolGameCanvas
        mode="match"
        fullscreen
        showWinnerOverlay={false}
        localSide={localSide}
        onEngineReady={handleEngineReady}
        onShot={handleShot}
        onState={handleState}
      />

      {matchResult && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center space-y-3">
            <h2 className="text-2xl font-bold text-white">
              {matchResult.outcome === 'win' ? 'You Win!' : 'You Lost'}
            </h2>
            <p className="text-sm text-white/80">{matchResult.message}</p>
            <p className="text-xs text-white/60">
              Redirecting to lobby{redirectIn !== null ? ` in ${redirectIn}s` : '...'}
            </p>
          </div>
        </div>
      )}
      
      {/* Connection status indicator */}
      <div className="absolute top-4 right-4 z-30 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-2">
        {matchmakingConnected ? (
          <Wifi className="h-4 w-4 text-green-400" />
        ) : (
          <WifiOff className="h-4 w-4 text-red-400" />
        )}
        <span className="text-xs text-white/80">
          {matchmakingConnected ? 'Connected' : 'Connecting...'}
        </span>
        {opponentConnected && (
          <span className="text-xs text-green-400 ml-2">• Opponent online</span>
        )}
      </div>

      {matchPhase !== 'live' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm z-20">
          <div className="rounded-full border border-white/20 bg-black/50 p-4">
            <Clock className="h-6 w-6 text-white" />
          </div>
          <div className="text-center">
            <p className="text-xl font-semibold text-white">
              {matchPhase === 'ready' ? 'Match Ready' : 'Waiting for opponent'}
            </p>
            <p className="text-sm text-white/70 mt-2">
              {matchPhase === 'ready' 
                ? 'Mark ready when you\'re prepared to play' 
                : 'Both players must be ready to start'}
            </p>
            {!matchmakingConnected && (
              <p className="text-xs text-yellow-300 mt-2">
                Connecting to game server...
              </p>
            )}
          </div>
          <Button
            onClick={markReady}
            disabled={!matchmakingConnected || matchPhase === 'waiting'}
            className="bg-emerald-500 hover:bg-emerald-600 text-white mt-4 disabled:opacity-50"
          >
            {matchPhase === 'waiting' ? 'Waiting...' : 'I\'m Ready'}
          </Button>
          {playersReady > 0 && (
            <p className="text-xs text-white/60">
              Players ready: {playersReady}/2
            </p>
          )}
        </div>
      )}
    </div>
  );
}
