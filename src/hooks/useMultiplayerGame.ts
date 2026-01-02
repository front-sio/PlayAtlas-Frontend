import { useState, useEffect, useCallback, useRef } from 'react';
import { gameSocketService, GameState } from '@/lib/gameSocketService';
import { matchmakingSocketService } from '@/lib/matchmakingSocketService';
import { PoolGameEngine } from '@/lib/pool/engine';

interface UseMultiplayerGameProps {
  playerId: string;
  matchId?: string;
  sessionId?: string;
}

interface MultiplayerGameState {
  isConnected: boolean;
  inQueue: boolean;
  inMatch: boolean;
  inGame: boolean;
  opponentConnected: boolean;
  opponentReady: boolean;
  yourTurn: boolean;
  gameState: GameState | null;
  error: string | null;
  loading: boolean;
  matchFound: boolean;
  matchData: any;
  gameStarted: boolean;
}

export function useMultiplayerGame({ playerId, matchId, sessionId }: UseMultiplayerGameProps) {
  const [state, setState] = useState<MultiplayerGameState>({
    isConnected: false,
    inQueue: false,
    inMatch: false,
    inGame: false,
    opponentConnected: false,
    opponentReady: false,
    yourTurn: false,
    gameState: null,
    error: null,
    loading: false,
    matchFound: false,
    matchData: null,
    gameStarted: false,
  });

  const gameEngineRef = useRef<PoolGameEngine | null>(null);

  // Initialize socket connections
  useEffect(() => {
    if (typeof window !== 'undefined') {
      gameSocketService.connect();
      matchmakingSocketService.connect();

      gameSocketService.authenticate(playerId);
      matchmakingSocketService.authenticate(playerId);
    }

    return () => {
      // Cleanup on unmount
      gameSocketService.disconnect();
      matchmakingSocketService.disconnect();
    };
  }, [playerId]);

  // Handle game socket events
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    // Connection status
    unsubscribers.push(
      gameSocketService.on('connected', () => {
        setState(prev => ({ ...prev, isConnected: true }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('disconnected', () => {
        setState(prev => ({ ...prev, isConnected: false }));
      })
    );

    // Game events
    unsubscribers.push(
      gameSocketService.on('game_joined', (data) => {
        setState(prev => ({
          ...prev,
          inGame: true,
          gameState: data.gameState,
          yourTurn: data.yourTurn,
        }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('game_ready', () => {
        setState(prev => ({ ...prev, loading: false }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('game_start', (data) => {
        setState(prev => ({
          ...prev,
          gameStarted: true,
          gameState: data.gameState,
          loading: false,
        }));

        // Initialize game engine with received state
        if (!gameEngineRef.current) {
          gameEngineRef.current = new PoolGameEngine({ mode: 'match', onHud: () => {} });
        }
      })
    );

    unsubscribers.push(
      gameSocketService.on('opponent_connected', () => {
        setState(prev => ({ ...prev, opponentConnected: true }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('opponent_ready', () => {
        setState(prev => ({ ...prev, opponentReady: true }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('opponent_disconnected', () => {
        setState(prev => ({ ...prev, opponentConnected: false }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('game_action', (data) => {
        // Handle opponent's action
        console.log('Received opponent action:', data);
        // Action data will be processed by the game component/engine
      })
    );

    unsubscribers.push(
      gameSocketService.on('state_updated', (data) => {
        setState(prev => ({ ...prev, gameState: data.gameState }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('game_completed', (data) => {
        console.log('Game completed:', data);
        setState(prev => ({
          ...prev,
          gameStarted: false,
          loading: false,
        }));
      })
    );

    unsubscribers.push(
      gameSocketService.on('error', (data) => {
        setState(prev => ({ ...prev, error: data.message, loading: false }));
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  // Handle matchmaking events
  useEffect(() => {
    const unsubscribers: (() => void)[] = [];

    unsubscribers.push(
      matchmakingSocketService.on('match_found', (data) => {
        setState(prev => ({
          ...prev,
          inQueue: false,
          inMatch: true,
          matchFound: true,
          matchData: data,
          loading: false,
        }));
      })
    );

    unsubscribers.push(
      matchmakingSocketService.on('match_bye', () => {
        setState(prev => ({ ...prev, inQueue: false }));
      })
    );

    unsubscribers.push(
      matchmakingSocketService.on('match_cancelled', () => {
        setState(prev => ({
          ...prev,
          inMatch: false,
          matchFound: false,
          loading: false,
        }));
      })
    );

    unsubscribers.push(
      matchmakingSocketService.on('queue_joined', () => {
        setState(prev => ({ ...prev, inQueue: true, loading: false }));
      })
    );

    unsubscribers.push(
      matchmakingSocketService.on('queue_left', () => {
        setState(prev => ({ ...prev, inQueue: false }));
      })
    );

    unsubscribers.push(
      matchmakingSocketService.on('queue_error', (data) => {
        setState(prev => ({ ...prev, error: data.message, loading: false, inQueue: false }));
      })
    );

    unsubscribers.push(
      matchmakingSocketService.on('queue_timeout', () => {
        setState(prev => ({ ...prev, inQueue: false, error: 'Queue timeout' }));
      })
    );

    return () => {
      unsubscribers.forEach(unsub => unsub());
    };
  }, []);

  // Join match queue
  const joinQueue = useCallback((tournamentId?: string, seasonId?: string, round?: number) => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    matchmakingSocketService.joinQueue(tournamentId, seasonId, round);
  }, []);

  // Leave match queue
  const leaveQueue = useCallback(() => {
    matchmakingSocketService.leaveQueue();
    setState(prev => ({ ...prev, inQueue: false }));
  }, []);

  // Join game session
  const joinGame = useCallback((gameSessionId: string) => {
    setState(prev => ({ ...prev, loading: true }));
    gameSocketService.joinGame(gameSessionId);
  }, []);

  // Mark as ready
  const setReady = useCallback(() => {
    gameSocketService.setReady();
    matchmakingSocketService.setMatchReady(matchId!);
  }, [matchId]);

  // Send shot/action
  const sendShot = useCallback((shotData: any) => {
    if (state.yourTurn && state.gameStarted) {
      gameSocketService.sendAction('shot', shotData);
    }
  }, [state.yourTurn, state.gameStarted]);

  // Update game state after local calculation
  const updateGameState = useCallback((gameState: GameState) => {
    gameSocketService.updateState(gameState);
    setState(prev => ({ ...prev, gameState }));
  }, []);

  // Complete game
  const completeGame = useCallback((winnerId: string, player1Score: number, player2Score: number) => {
    gameSocketService.completeGame(winnerId, player1Score, player2Score);
  }, []);

  return {
    ...state,
    joinQueue,
    leaveQueue,
    joinGame,
    setReady,
    sendShot,
    updateGameState,
    completeGame,
    gameEngine: gameEngineRef.current,
  };
}
