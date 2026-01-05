// 8Ball Pool Server Integration
// This handles all communication with the backend services

var ServerIntegration = {
    // Socket connections
    matchmakingSocket: null,
    gameSocket: null,
    
    // Game state
    isConnected: false,
    playerId: null,
    playerName: null,
    sessionToken: null,
    matchId: null,
    sessionId: null,
    gameMode: 'practice', // 'practice' or 'match'
    opponentReady: false,
    playerReady: false,
    gameStarted: false,
    
    // URLs
    matchmakingUrl: null,
    gameServiceUrl: null,
    
    init: function() {
        console.log('[8Ball] Initializing server integration...');
        
        // Get URLs from environment or default
        this.matchmakingUrl = window.NEXT_PUBLIC_MATCHMAKING_SERVICE_URL || 'http://localhost:3009';
        this.gameServiceUrl = window.NEXT_PUBLIC_GAME_SERVICE_URL || 'http://localhost:3005';
        
        // Parse URL parameters for server integration
        this.parseUrlParameters();
        
        // Listen for messages from parent window (auth data)
        this.setupMessageHandlers();
        
        // Initialize sockets if we have player data
        if (this.playerId && this.sessionToken) {
            this.connectToServices();
        }
    },
    
    parseUrlParameters: function() {
        const urlParams = new URLSearchParams(window.location.search);
        
        // Get player data from URL or autostart params
        if (window.__POOL_AUTOSTART__) {
            this.playerId = window.__POOL_AUTOSTART__.playerId;
            this.playerName = window.__POOL_AUTOSTART__.playerName;
            this.sessionToken = window.__POOL_AUTOSTART__.token;
            this.matchId = window.__POOL_AUTOSTART__.matchId;
            this.gameMode = window.__POOL_AUTOSTART__.mode || 'practice';
        }
        
        // Fallback to URL params
        if (!this.playerId) {
            this.playerId = urlParams.get('playerId');
            this.playerName = urlParams.get('playerName');
            this.sessionToken = urlParams.get('token');
            this.matchId = urlParams.get('matchId');
            this.gameMode = urlParams.get('mode') || 'practice';
        }
        
        console.log('[8Ball] Player data:', {
            playerId: this.playerId,
            playerName: this.playerName,
            gameMode: this.gameMode,
            matchId: this.matchId
        });
    },
    
    setupMessageHandlers: function() {
        window.addEventListener('message', (event) => {
            if (event.origin !== window.location.origin) return;
            
            const { type, data } = event.data;
            switch (type) {
                case 'SET_PLAYER_DATA':
                    this.playerId = data.playerId;
                    this.playerName = data.playerName;
                    this.sessionToken = data.token;
                    if (data.matchId) this.matchId = data.matchId;
                    if (data.mode) this.gameMode = data.mode;
                    this.connectToServices();
                    break;
                    
                case 'UPDATE_AI_LEVEL':
                    projectInfo.aiRating = data.level;
                    break;
            }
        });
    },
    
    connectToServices: function() {
        console.log('[8Ball] Connecting to services...');
        
        // Skip socket connections for practice mode
        if (this.gameMode === 'practice') {
            console.log('[8Ball] Practice mode - skipping socket connections');
            return;
        }
        
        if (this.gameMode === 'match' && this.matchId) {
            this.connectToMatchmaking();
        }
        
        // Only connect to game service for multiplayer matches
        this.connectToGameService();
    },
    
    connectToMatchmaking: function() {
        if (!this.matchId || !this.playerId || !this.sessionToken) {
            console.error('[8Ball] Missing required data for matchmaking connection');
            return;
        }
        
        console.log('[8Ball] Connecting to matchmaking service...');
        
        this.matchmakingSocket = io(this.matchmakingUrl, {
            transports: ['websocket', 'polling'],
            auth: { token: this.sessionToken }
        });
        
        this.matchmakingSocket.on('connect', () => {
            console.log('[8Ball] ✓ Connected to matchmaking service');
            this.authenticateMatchmaking();
        });
        
        this.matchmakingSocket.on('authenticated', (data) => {
            console.log('[8Ball] ✓ Authenticated with matchmaking service');
            this.joinMatch();
        });
        
        this.matchmakingSocket.on('match:joined', () => {
            console.log('[8Ball] ✓ Joined match room');
            this.updateGameState('connected');
        });
        
        this.matchmakingSocket.on('match:ready_update', (data) => {
            console.log('[8Ball] Match ready update:', data);
            this.updateReadyState(data.readyCount);
        });
        
        this.matchmakingSocket.on('match:state', (data) => {
            console.log('[8Ball] Match state:', data);
            if (data.sessionId) {
                this.sessionId = data.sessionId;
                this.joinGameSession();
            }
        });
        
        this.matchmakingSocket.on('game:session_created', (data) => {
            console.log('[8Ball] Game session created:', data);
            this.sessionId = data.sessionId;
            this.joinGameSession();
        });
        
        this.matchmakingSocket.on('disconnect', () => {
            console.log('[8Ball] ✗ Disconnected from matchmaking service');
            this.updateGameState('disconnected');
        });
        
        this.matchmakingSocket.on('error', (error) => {
            console.error('[8Ball] Matchmaking error:', error);
            this.showError('Connection error: ' + error.message);
        });
    },
    
    connectToGameService: function() {
        console.log('[8Ball] Connecting to game service...');
        
        this.gameSocket = io(this.gameServiceUrl, {
            transports: ['websocket', 'polling']
        });
        
        this.gameSocket.on('connect', () => {
            console.log('[8Ball] ✓ Connected to game service');
            if (this.playerId && this.sessionToken) {
                this.authenticateGameService();
            }
        });
        
        this.gameSocket.on('authenticated', (data) => {
            console.log('[8Ball] ✓ Authenticated with game service');
            if (this.sessionId) {
                this.joinGameSession();
            }
        });
        
        this.gameSocket.on('game_joined', (data) => {
            console.log('[8Ball] ✓ Joined game session');
            this.handleGameJoined(data);
        });
        
        this.gameSocket.on('game_start', (data) => {
            console.log('[8Ball] ✓ Game started!');
            this.startGame(data);
        });
        
        this.gameSocket.on('state_updated', (data) => {
            this.handleStateUpdate(data);
        });
        
        this.gameSocket.on('game_action', (data) => {
            this.handleOpponentAction(data);
        });
        
        this.gameSocket.on('game_completed', (data) => {
            this.handleGameCompleted(data);
        });
        
        this.gameSocket.on('opponent_connected', () => {
            console.log('[8Ball] ✓ Opponent connected');
            this.updateGameState('opponent_connected');
        });
        
        this.gameSocket.on('opponent_disconnected', () => {
            console.log('[8Ball] ✗ Opponent disconnected');
            this.updateGameState('opponent_disconnected');
        });
    },
    
    authenticateMatchmaking: function() {
        this.matchmakingSocket.emit('authenticate', {
            playerId: this.playerId,
            token: this.sessionToken
        });
    },
    
    authenticateGameService: function() {
        this.gameSocket.emit('authenticate', {
            playerId: this.playerId,
            token: this.sessionToken
        });
    },
    
    joinMatch: function() {
        if (!this.matchId) return;
        
        this.matchmakingSocket.emit('join:match', {
            matchId: this.matchId
        }, (response) => {
            if (!response?.ok) {
                this.showError('Failed to join match: ' + (response?.error || 'Unknown error'));
            }
        });
    },
    
    markReady: function() {
        if (!this.matchmakingSocket || !this.matchId) {
            // For practice mode, just start the game
            if (this.gameMode === 'practice') {
                this.startPracticeGame();
                return;
            }
            return;
        }
        
        this.matchmakingSocket.emit('match:ready', {
            matchId: this.matchId
        }, (response) => {
            if (response?.ok) {
                this.playerReady = true;
                this.updateGameUI();
            } else {
                this.showError('Failed to mark ready: ' + (response?.error || 'Unknown error'));
            }
        });
    },
    
    joinGameSession: function() {
        if (!this.gameSocket || !this.sessionId) return;
        
        this.gameSocket.emit('game:join', {
            sessionId: this.sessionId,
            playerId: this.playerId
        });
    },
    
    sendGameAction: function(action, data) {
        if (!this.gameSocket || !this.sessionId) return;
        
        this.gameSocket.emit('game:action', {
            sessionId: this.sessionId,
            action: action,
            data: data
        });
    },
    
    // Game event handlers
    handleGameJoined: function(data) {
        this.gameStarted = true;
        this.updateGameUI();
        
        // Initialize game state if provided
        if (data.gameState) {
            this.applyGameState(data.gameState);
        }
    },
    
    startGame: function(data) {
        this.gameStarted = true;
        this.updateGameState('playing');
        
        // Transition from menu to game
        if (game.state.current !== 'play') {
            game.state.start('play');
        }
    },
    
    startPracticeGame: function() {
        this.gameStarted = true;
        projectInfo.mode = 1; // AI mode
        projectInfo.levelName = "practice_ai_" + projectInfo.aiRating.toString();
        
        // Start the game
        if (game.state.current !== 'play') {
            game.state.start('play');
        }
    },
    
    handleStateUpdate: function(data) {
        if (data.gameState) {
            this.applyGameState(data.gameState);
        }
    },
    
    handleOpponentAction: function(data) {
        console.log('[8Ball] Opponent action:', data);
        // Handle opponent shots, moves, etc.
    },
    
    handleGameCompleted: function(data) {
        console.log('[8Ball] Game completed:', data);
        this.gameStarted = false;
        this.showGameResult(data);
    },
    
    applyGameState: function(gameState) {
        // Apply the server game state to the local game
        // This would integrate with the existing Phaser game logic
        console.log('[8Ball] Applying game state:', gameState);
    },
    
    // UI update functions
    updateGameState: function(state) {
        console.log('[8Ball] Game state changed to:', state);
        this.updateGameUI();
        
        // Notify parent window of state changes
        if (window.parent !== window) {
            window.parent.postMessage({
                type: 'GAME_STATE_CHANGED',
                data: { state: state }
            }, '*');
        }
    },
    
    updateReadyState: function(readyCount) {
        console.log('[8Ball] Ready count:', readyCount);
        this.updateGameUI();
    },
    
    updateGameUI: function() {
        // Update the game UI elements based on current state
        // This will be called from the main game states
        
        if (typeof window.updateGameHUD === 'function') {
            window.updateGameHUD({
                playerName: this.playerName,
                gameMode: this.gameMode,
                playerReady: this.playerReady,
                opponentReady: this.opponentReady,
                gameStarted: this.gameStarted,
                isConnected: this.isConnected
            });
        }
    },
    
    showError: function(message) {
        console.error('[8Ball] Error:', message);
        
        // Show error in game UI
        if (typeof window.showGameError === 'function') {
            window.showGameError(message);
        }
        
        // Fallback to alert
        // alert('Game Error: ' + message);
    },
    
    showGameResult: function(result) {
        console.log('[8Ball] Game result:', result);
        
        if (typeof window.showGameResult === 'function') {
            window.showGameResult(result);
        }
    },
    
    // Cleanup
    disconnect: function() {
        if (this.matchmakingSocket) {
            this.matchmakingSocket.disconnect();
            this.matchmakingSocket = null;
        }
        
        if (this.gameSocket) {
            this.gameSocket.disconnect();
            this.gameSocket = null;
        }
        
        this.isConnected = false;
        this.gameStarted = false;
    }
};

// Initialize when the script loads
if (typeof window !== 'undefined') {
    window.ServerIntegration = ServerIntegration;
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            ServerIntegration.init();
        });
    } else {
        ServerIntegration.init();
    }
}