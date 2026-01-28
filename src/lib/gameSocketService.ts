// frontend/src/lib/gameSocketService.ts
import { io, Socket } from 'socket.io-client';
import { normalizeSocketTarget } from './socket';

type GameState = any;

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

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

class GameSocketService {
  private socket: Socket | null = null;
  private isConnected: boolean = false;
  private currentSessionId: string | null = null;
  private currentPlayerId: string | null = null;
  private currentToken: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = Number.POSITIVE_INFINITY;
  private reconnectDelay: number = 2000;
  private connectionStatus: ConnectionStatus = 'disconnected';
  private lastConnectionError: string | null = null;
  private isConnecting: boolean = false;

  // Event handlers
  private eventHandlers: Map<string, Set<Function>> = new Map();

  constructor() {
    if (typeof window !== 'undefined') {
      console.log('[GameSocket] Service initialized');
    }
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  /**
   * Get last connection error
   */
  getLastError(): string | null {
    return this.lastConnectionError;
  }

  /**
   * Connect to the game service
   */
  connect(playerId?: string, token?: string, sessionId?: string): void {
    this.currentPlayerId = playerId || this.currentPlayerId;
    this.currentToken = token || this.currentToken;
    this.currentSessionId = sessionId || this.currentSessionId;

    if (this.socket?.connected) {
      console.log('[GameSocket] Already connected');
      this.connectionStatus = 'connected';
      if (this.currentPlayerId) {
        this.authenticate(this.currentPlayerId, this.currentToken || undefined);
      }
      if (this.currentSessionId) {
        this.joinGame(this.currentSessionId);
      }
      return;
    }

    if (this.isConnecting) {
      console.log('[GameSocket] Connection already in progress');
      return;
    }

    this.isConnecting = true;
    this.connectionStatus = 'connecting';
    this.lastConnectionError = null;

    const fallbackBase = process.env.NODE_ENV === 'development' ? 'http://localhost:3006' : '';
    const rawBase = process.env.NEXT_PUBLIC_GAME_SERVICE_URL
      || process.env.NEXT_PUBLIC_ADMIN_WS_URL
      || process.env.NEXT_PUBLIC_API_URL
      || fallbackBase;
    const gameServiceUrl = rawBase.replace(/\/api\/?$/, '');
    const socketPathOverride = process.env.NEXT_PUBLIC_GAME_SOCKET_PATH;
    const socketTarget = socketPathOverride
      ? `${gameServiceUrl.replace(/\/$/, '')}${socketPathOverride}`
      : gameServiceUrl;
    const { url, path } = normalizeSocketTarget(socketTarget);
    const connectionUrl = url || undefined;

    console.log('[GameSocket] Connecting to:', connectionUrl || 'same origin');
    console.log('[GameSocket] Using path:', path);

    this.socket = io(connectionUrl, {
      path,
      transports: ['polling'],
      upgrade: false,
      reconnection: true,
      reconnectionDelay: this.reconnectDelay,
      reconnectionAttempts: this.maxReconnectAttempts,
      timeout: 30000,
      forceNew: false,
      auth: this.currentToken ? { token: this.currentToken } : undefined,
    });

    this.socket.on('connect', () => {
      console.log('[GameSocket] ✓ Connected to game service');
      this.isConnected = true;
      this.connectionStatus = 'connected';
      this.isConnecting = false;
      this.reconnectAttempts = 0;
      this.lastConnectionError = null;
      this.emit('connected');
      this.emit('status_change', { status: 'connected' });
      if (this.currentPlayerId) {
        this.authenticate(this.currentPlayerId, this.currentToken || undefined);
      }
      if (this.currentSessionId) {
        this.joinGame(this.currentSessionId);
      }
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[GameSocket] ✗ Disconnected:', reason);
      this.isConnected = false;
      this.connectionStatus = 'disconnected';
      this.isConnecting = false;
      this.emit('disconnected', reason);
      this.emit('status_change', { status: 'disconnected', reason });
    });

    this.socket.on('connect_error', (error) => {
      console.error('[GameSocket] ✗ Connection error:', error.message);
      this.isConnected = false;
      this.connectionStatus = 'error';
      this.isConnecting = false;
      this.lastConnectionError = error.message;
      this.reconnectAttempts++;
      console.log(`[GameSocket] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      
      this.emit('connect_error', error);
      this.emit('status_change', { status: 'error', error: error.message });
      
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('[GameSocket] Max reconnection attempts reached');
        this.emit('connection_failed', error);
      }
    });

    this.socket.on('reconnect', (attemptNumber) => {
      console.log(`[GameSocket] ✓ Reconnected after ${attemptNumber} attempts`);
      this.emit('reconnected', { attemptNumber });
    });

    this.socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[GameSocket] Reconnection attempt ${attemptNumber}...`);
      this.emit('reconnecting', { attemptNumber });
    });

    this.socket.on('reconnect_failed', () => {
      console.error('[GameSocket] Reconnection failed');
      this.connectionStatus = 'error';
      this.isConnecting = false;
      this.emit('reconnect_failed');
    });

    // Game events
    this.socket.on('authenticated', (data: GameSocketEvents['authenticated']) => {
      console.log('[GameSocket] ✓ Authenticated:', data);
      this.emit('authenticated', data);
    });

    this.socket.on('auth_error', (data: GameSocketEvents['auth_error']) => {
      console.error('[GameSocket] Auth error:', data);
      this.emit('auth_error', data);
    });

    this.socket.on('game:joined', (data: GameSocketEvents['game_joined']) => {
      console.log('[GameSocket] ✓ Joined game session:', data.sessionId);
      this.currentSessionId = data.sessionId;
      this.emit('game_joined', data);
    });

    this.socket.on('game:ready', (data: GameSocketEvents['game_ready']) => {
      console.log('[GameSocket] Game ready');
      this.emit('game_ready', data);
    });

    this.socket.on('game:start', (data: GameSocketEvents['game_start']) => {
      console.log('[GameSocket] ✓ Game started');
      this.emit('game_start', data);
    });

    this.socket.on('opponent:connected', (data: GameSocketEvents['opponent_connected']) => {
      console.log('[GameSocket] ✓ Opponent connected:', data.playerId);
      this.emit('opponent_connected', data);
    });

    this.socket.on('opponent:ready', (data: GameSocketEvents['opponent_ready']) => {
      console.log('[GameSocket] ✓ Opponent ready:', data.playerId);
      this.emit('opponent_ready', data);
    });

    this.socket.on('opponent:disconnected', (data: GameSocketEvents['opponent_disconnected']) => {
      console.log('[GameSocket] ✗ Opponent disconnected:', data.playerId);
      this.emit('opponent_disconnected', data);
    });

    this.socket.on('game:action', (data: GameSocketEvents['game_action']) => {
      this.emit('game_action', data);
    });

    this.socket.on('game:state_updated', (data: GameSocketEvents['state_updated']) => {
      this.emit('state_updated', data);
    });

    this.socket.on('game:completed', (data: GameSocketEvents['game_completed']) => {
      console.log('[GameSocket] ✓ Game completed');
      this.emit('game_completed', data);
    });

    this.socket.on('error', (data: GameSocketEvents['error']) => {
      console.error('[GameSocket] Socket error:', data);
      this.emit('error', data);
    });
  }

  /**
   * Authenticate the player
   */
  authenticate(playerId: string, token?: string): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Cannot authenticate: Not connected');
      this.lastConnectionError = 'Socket not connected';
      return;
    }

    console.log('[GameSocket] Authenticating player:', playerId);
    this.socket.emit('authenticate', { playerId, token });
  }

  /**
   * Join a game session
   */
  joinGame(sessionId: string): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Cannot join game: Not connected');
      this.lastConnectionError = 'Socket not connected';
      return;
    }

    console.log('[GameSocket] Joining game session:', sessionId);
    this.currentSessionId = sessionId;
    this.socket.emit('game:join', { sessionId }, (ack?: { ok?: boolean; error?: string }) => {
      if (!ack?.ok) {
        console.error('[GameSocket] Join game failed:', ack?.error || 'No ack');
      }
    });
  }

  /**
   * Mark player as ready
   */
  setReady(): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Cannot set ready: Not connected');
      this.lastConnectionError = 'Socket not connected';
      return;
    }

    console.log('[GameSocket] Setting player ready');
    this.socket.emit('game:ready');
  }

  /**
   * Send a game action (shot, etc.)
   */
  sendAction(action: string, data: any): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Cannot send action: Not connected');
      this.lastConnectionError = 'Socket not connected';
      return;
    }

    console.log('[GameSocket] Sending action:', action);
    this.socket.emit('game:action', { action, data });
  }

  /**
   * Update game state
   */
  updateState(gameState: GameState): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Cannot update state: Not connected');
      this.lastConnectionError = 'Socket not connected';
      return;
    }

    this.socket.emit('game:update_state', { gameState });
  }

  /**
   * Complete the game
   */
  completeGame(winnerId: string, player1Score: number, player2Score: number, metadata?: any): void {
    if (!this.socket?.connected) {
      console.error('[GameSocket] Cannot complete game: Not connected');
      this.lastConnectionError = 'Socket not connected';
      return;
    }

    console.log('[GameSocket] Completing game. Winner:', winnerId);
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
      this.connectionStatus = 'disconnected';
      this.isConnecting = false;
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
   * Force reconnect
   */
  reconnect(): void {
    console.log('[GameSocket] Forcing reconnection...');
    this.disconnect();
    this.reconnectAttempts = 0;
    this.lastConnectionError = null;
    this.connect();
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
export type { GameState, GameSocketEvents, ConnectionStatus };
