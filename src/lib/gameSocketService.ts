import { io, Socket } from 'socket.io-client';

type GameState = {
  balls: any[];
  currentPlayer: string;
  scores: { [playerId: string]: number };
  turn: number;
  [key: string]: any;
};

type GameSocketEvents = {
  authenticated: { success: boolean; playerId: string; hasActiveSession: boolean; sessionId?: string };
  auth_error: { error: string };
  game_joined: { sessionId: string; gameState: GameState; player1Id: string; player2Id: string; yourTurn: boolean };
  game_ready: { message: string };
  game_start: { message: string; gameState: GameState };
  opponent_connected: { playerId: string };
  opponent_ready: { playerId: string };
  opponent_disconnected: { playerId: string };
  game_action: { playerId: string; action: string; data: any; timestamp: string };
  state_updated: { gameState: GameState; timestamp: string };
  game_completed: { winnerId: string; player1Score: number; player2Score: number; timestamp: string };
  error: { message: string };
};

class GameSocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private currentSessionId: string | null = null;
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
   * Connect to the game service
   */
  connect(): void {
    if (this.socket?.connected) {
      console.log('[GameSocket] Already connected');
      return;
    }

    const gameServiceUrl = process.env.NEXT_PUBLIC_GAME_SERVICE_URL || 'http://localhost:3006';

    this.socket = io(gameServiceUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 60000,
    });

    this.socket.on('connect', () => {
      console.log('[GameSocket] Connected to game service');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[GameSocket] Disconnected:', reason);
      this.isConnected = false;
      this.emit('disconnected', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('[GameSocket] Connection error:', error);
      this.reconnectAttempts++;
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.emit('connection_failed', error);
      }
    });

    this.socket.on('authenticated', (data: GameSocketEvents['authenticated']) => {
      this.emit('authenticated', data);
    });

    this.socket.on('auth_error', (data: GameSocketEvents['auth_error']) => {
      this.emit('auth_error', data);
    });

    this.socket.on('game:joined', (data: GameSocketEvents['game_joined']) => {
      this.currentSessionId = data.sessionId;
      this.emit('game_joined', data);
    });

    this.socket.on('game:ready', (data: GameSocketEvents['game_ready']) => {
      this.emit('game_ready', data);
    });

    this.socket.on('game:start', (data: GameSocketEvents['game_start']) => {
      this.emit('game_start', data);
    });

    this.socket.on('opponent:connected', (data: GameSocketEvents['opponent_connected']) => {
      this.emit('opponent_connected', data);
    });

    this.socket.on('opponent:ready', (data: GameSocketEvents['opponent_ready']) => {
      this.emit('opponent_ready', data);
    });

    this.socket.on('opponent:disconnected', (data: GameSocketEvents['opponent_disconnected']) => {
      this.emit('opponent_disconnected', data);
    });

    this.socket.on('game:action', (data: GameSocketEvents['game_action']) => {
      this.emit('game_action', data);
    });

    this.socket.on('game:state_updated', (data: GameSocketEvents['state_updated']) => {
      this.emit('state_updated', data);
    });

    this.socket.on('game:completed', (data: GameSocketEvents['game_completed']) => {
      this.emit('game_completed', data);
    });

    this.socket.on('error', (data: GameSocketEvents['error']) => {
      this.emit('error', data);
    });
  }

  /**
   * Authenticate the player
   */
  authenticate(playerId: string, token?: string): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Not connected');
      return;
    }

    this.socket.emit('authenticate', { playerId, token });
  }

  /**
   * Join a game session
   */
  joinGame(sessionId: string): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Not connected');
      return;
    }

    this.socket.emit('game:join', { sessionId });
  }

  /**
   * Mark player as ready
   */
  setReady(): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Not connected');
      return;
    }

    this.socket.emit('game:ready');
  }

  /**
   * Send a game action (shot, etc.)
   */
  sendAction(action: string, data: any): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Not connected');
      return;
    }

    this.socket.emit('game:action', { action, data });
  }

  /**
   * Update game state
   */
  updateState(gameState: GameState): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Not connected');
      return;
    }

    this.socket.emit('game:update_state', { gameState });
  }

  /**
   * Complete the game
   */
  completeGame(winnerId: string, player1Score: number, player2Score: number, metadata?: any): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Not connected');
      return;
    }

    this.socket.emit('game:complete', {
      winnerId,
      player1Score,
      player2Score,
      metadata
    });
  }

  /**
   * Disconnect from the game service
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.currentSessionId = null;
      console.log('[GameSocket] Disconnected');
    }
  }

  /**
   * Check if connected
   */
  isSocketConnected(): boolean {
    return this.isConnected && this.socket?.connected === true;
  }

  /**
   * Get current session ID
   */
  getCurrentSessionId(): string | null {
    return this.currentSessionId;
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
          console.error(`[GameSocket] Error in handler for ${event}:`, error);
        }
      });
    }
  }
}

// Export singleton instance
export const gameSocketService = new GameSocketService();

// Export types
export type { GameState, GameSocketEvents };
