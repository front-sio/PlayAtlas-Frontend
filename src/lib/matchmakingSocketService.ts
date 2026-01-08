// frontend/src/lib/matchmakingSocketService.ts
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from './socket';

type MatchmakingSocketEvents = {
  match_found: { matchId: string; opponentId: string; scheduledTime: Date; round?: number; tournamentId?: string };
  match_bye: { tournamentId: string; seasonId: string; round: number; message: string };
  match_cancelled: { matchId: string; reason: string };
  challenge_received: { challengeId: string; from: string };
  challenge_sent: { challengeId: string; to: string };
  challenge_accepted: { matchId: string; opponentId: string };
  challenge_declined: { from: string };
  error: { message: string };
  queue_joined: { success: boolean; queueId: string; estimatedWaitTime: number };
  queue_left: { success: boolean };
  queue_error: { message: string };
  queue_timeout: { message: string };
  challenge_error: { message: string };
};

class MatchmakingSocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 2000;

  // Event handlers
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor() {
    // Singleton pattern
    if (typeof window !== 'undefined') {
      // Client-side only
    }
  }

  /**
   * Connect to matchmaking service
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log('[MatchmakingSocket] Already connected');
      return;
    }

    const matchmakingServiceUrl = process.env.NEXT_PUBLIC_MATCHMAKING_SERVICE_URL || 'http://localhost:3009';
    const socketPathOverride = process.env.NEXT_PUBLIC_MATCHMAKING_SOCKET_PATH;
    const socketTarget = socketPathOverride
      ? `${matchmakingServiceUrl.replace(/\/$/, '')}${socketPathOverride}`
      : matchmakingServiceUrl;
    const { url, path } = normalizeSocketTarget(socketTarget);

    this.socket = io(url, {
      path,
      transports: ['polling', 'websocket'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 60000,
    });

    this.socket.on('connect', () => {
      console.log('[MatchmakingSocket] Connected to matchmaking service');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[MatchmakingSocket] Disconnected:', reason);
      this.isConnected = false;
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[MatchmakingSocket] Connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('connection_failed', error);
      }
    });

    this.socket.on('match:found', (data: MatchmakingSocketEvents['match_found']) => {
      this.emit('match_found', data);
    });

    this.socket.on('match:bye', (data: MatchmakingSocketEvents['match_bye']) => {
      this.emit('match_bye', data);
    });

    this.socket.on('match:cancelled', (data: MatchmakingSocketEvents['match_cancelled']) => {
      this.emit('match_cancelled', data);
    });

    this.socket.on('challenge:received', (data: MatchmakingSocketEvents['challenge_received']) => {
      this.emit('challenge_received', data);
    });

    this.socket.on('challenge:sent', (data: MatchmakingSocketEvents['challenge_sent']) => {
      this.emit('challenge_sent', data);
    });

    this.socket.on('challenge:accepted', (data: MatchmakingSocketEvents['challenge_accepted']) => {
      this.emit('challenge_accepted', data);
    });

    this.socket.on('challenge:declined', (data: MatchmakingSocketEvents['challenge_declined']) => {
      this.emit('challenge_declined', data);
    });

    this.socket.on('queue:joined', (data: MatchmakingSocketEvents['queue_joined']) => {
      this.emit('queue_joined', data);
    });

    this.socket.on('queue:left', (data: MatchmakingSocketEvents['queue_left']) => {
      this.emit('queue_left', data);
    });

    this.socket.on('queue:error', (data: MatchmakingSocketEvents['queue_error']) => {
      this.emit('queue_error', data);
    });

    this.socket.on('queue:timeout', (data: MatchmakingSocketEvents['queue_timeout']) => {
      this.emit('queue_timeout', data);
    });

    this.socket.on('challenge:error', (data: MatchmakingSocketEvents['challenge_error']) => {
      this.emit('challenge_error', data);
    });

    this.socket.on('error', (data: MatchmakingSocketEvents['error']) => {
      this.emit('error', data);
    });
  }

  /**
   * Authenticate player
   */
  authenticate(playerId: string, token?: string): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('authenticate', { playerId, token });
  }

  /**
   * Join match queue
   */
  joinQueue(tournamentId?: string, seasonId?: string, round?: number): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('queue:join', { tournamentId, seasonId, round });
  }

  /**
   * Leave match queue
   */
  leaveQueue(): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('queue:leave');
  }

  /**
   * Send challenge to another player
   */
  sendChallenge(toPlayerId: string): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('challenge:send', { to: toPlayerId });
  }

  /**
   * Accept a challenge
   */
  acceptChallenge(challengeId: string): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('challenge:accept', { challengeId });
  }

  /**
   * Decline a challenge
   */
  declineChallenge(challengeId: string): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('challenge:decline', { challengeId });
  }

  /**
   * Join a match room
   */
  joinMatch(matchId: string): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('join:match', matchId);
  }

  /**
   * Mark as ready for match
   */
  setMatchReady(matchId: string): void {
    if (!this.socket?.connected) {
      console.error('[MatchmakingSocket] Not connected');
      return;
    }

    this.socket.emit('match:ready', { matchId });
  }

  /**
   * Disconnect from matchmaking service
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      console.log('[MatchmakingSocket] Disconnected');
    }
  }

  /**
   * Check if connected
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Subscribe to an event
   */
  on(event: string, handler: Function): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: string, data?: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`[MatchmakingSocket] Error in handler for ${event}:`, error);
        }
      });
    }
  }
}

// Export singleton instance
export const matchmakingSocketService = new MatchmakingSocketService();

// Export types
export type { MatchmakingSocketEvents };
