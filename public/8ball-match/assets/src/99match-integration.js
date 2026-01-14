// Multiplayer + match integration for PlayAtlas (authoritative server)
(function () {
  const CLIENT_TABLE = { width: 1600, height: 900 };
  const DEFAULT_SCALE = 2.3;
  const SCORE_SYNC_INTERVAL_MS = 250;
  const TIMER_SYNC_INTERVAL_MS = 1000;

  const params = new URLSearchParams(window.location.search);
  const matchDurationSeconds = Number(params.get('matchDurationSeconds') || params.get('matchDuration') || 300);
  const autostart = params.get('autostart') === '1';
  const debugEnabled = params.get('debug') === '1';

  const config = {
    mode: params.get('mode') || 'practice',
    matchId: params.get('matchId') || null,
    playerId: params.get('playerId') || null,
    token: params.get('token') || null,
    player1Id: params.get('player1Id') || null,
    player2Id: params.get('player2Id') || null,
    player1Name: params.get('player1Name') || null,
    player2Name: params.get('player2Name') || null,
    player1Avatar: params.get('player1Avatar') || null,
    player2Avatar: params.get('player2Avatar') || null,
    matchmakingUrl: params.get('matchmakingUrl') || null,
    gameServiceUrl: params.get('gameServiceUrl') || null,
    matchmakingSocketPath: params.get('matchmakingSocketPath') || null,
    gameSocketPath: params.get('gameSocketPath') || null,
    gameSessionId: params.get('gameSessionId') || null
  };

  // Debug initialization
  if (debugEnabled || config.mode === 'match') {
    console.log('[8Ball] Initialization Config:', config);
  }

  const state = {
    initialized: false,
    matchOverSent: false,
    lastScoresSentAt: 0,
    lastTimerSentAt: 0,
    ballStatus: new Map(),
    scores: { p1: 0, p2: 0 },
    startTimeMs: null,
    matchStartTime: null,
    maxDurationSeconds: 300,
    isOnlineMatch: config.mode === 'match',
    socketReady: false,
    matchmakingSocket: null,
    gameSocket: null,
    sessionId: null,
    lastServerState: null,
    lastShotWasRunning: false,
    shotInFlight: false,
    readySent: false,
    matchmakingReadySent: false,
    socketsConnecting: false,
    localSide: null,
    debugCount: 0,
    webRTCConnection: null,
    localStream: null,
    remoteStream: null,
    physicsPatched: false
  };

  function debugLog() {
    if (!debugEnabled) return;
    if (typeof console === 'undefined') return;
    const timestamp = new Date().toISOString();
    const args = Array.prototype.slice.call(arguments);
    args.unshift(`[${timestamp}]`);
    // eslint-disable-next-line no-console
    console.log.apply(console, args);
  }

  function sendEvent(type, data) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type, data }, window.location.origin);
    }
  }

  function getTableSize(gameInfo) {
    const scale = (gameInfo && gameInfo.adjustmentScale) || DEFAULT_SCALE;
    const n = 600 * scale;
    return {
      width: 100 * n,
      height: 50 * n
    };
  }

  function worldToClient(gameInfo, point) {
    if (!point) return null;
    const table = getTableSize(gameInfo);
    return {
      x: ((point.x + table.width / 2) / table.width) * CLIENT_TABLE.width,
      y: ((point.y + table.height / 2) / table.height) * CLIENT_TABLE.height
    };
  }

  function clientToWorld(gameInfo, point) {
    if (!point) return null;
    const table = getTableSize(gameInfo);
    return {
      x: (point.x / CLIENT_TABLE.width) * table.width - table.width / 2,
      y: (point.y / CLIENT_TABLE.height) * table.height - table.height / 2
    };
  }

  function worldDirToClient(gameInfo, dir) {
    if (!dir) return null;
    const table = getTableSize(gameInfo);
    return {
      x: dir.x * (CLIENT_TABLE.width / table.width),
      y: dir.y * (CLIENT_TABLE.height / table.height)
    };
  }

  function clientVelToWorld(gameInfo, vel) {
    if (!vel) return null;
    const table = getTableSize(gameInfo);
    return {
      x: vel.x * (table.width / CLIENT_TABLE.width),
      y: vel.y * (table.height / CLIENT_TABLE.height)
    };
  }

  function getPlayerInitials(name) {
    if (!name) return '';
    const parts = String(name).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function createAvatarPlaceholder(initials, size, bgColor, textColor) {
    const canvas = document.createElement('canvas');
    const safeSize = Math.max(64, Number(size) || 128);
    canvas.width = safeSize;
    canvas.height = safeSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const center = safeSize / 2;
    ctx.clearRect(0, 0, safeSize, safeSize);
    ctx.fillStyle = bgColor || '#2f6dff';
    ctx.beginPath();
    ctx.arc(center, center, center, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = textColor || '#ffffff';
    ctx.font = `bold ${Math.floor(safeSize * 0.42)}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials || '?', center, center);
    return canvas.toDataURL('image/png');
  }

  function hideTextChildren(sprite) {
    if (!sprite || !sprite.children) return;
    sprite.children.forEach((child) => {
      if (child && child.text !== undefined) {
        child.text = '';
        child.visible = false;
      }
    });
  }

  function updateProjectInfoNames() {
    if (!window.projectInfo) return;
    if (config.player1Name) window.projectInfo.player1Name = config.player1Name;
    if (config.player2Name) window.projectInfo.player2Name = config.player2Name;
    window.projectInfo.mode = 2;
    window.projectInfo.levelName = '2players';
    window.projectInfo.matchDurationSeconds = matchDurationSeconds;
    window.projectInfo.isOnlineMatch = state.isOnlineMatch;
  }

  function updateIconLabels(gameInfo) {
    if (!gameInfo || !gameInfo.humanIcon || !gameInfo.aiIcon) return;
    if (!window.game || !window.game.cache) return;
    if (!window.game.state || window.game.state.current !== 'play') return;
    if (window.game.cache.checkBitmapFontKey && !window.game.cache.checkBitmapFontKey('font7')) return;
    const p1Label = config.player1Name || 'Player 1';
    const p2Label = config.player2Name || 'Player 2';
    const p1Initials = getPlayerInitials(p1Label) || 'P1';
    const p2Initials = getPlayerInitials(p2Label) || 'P2';
    try {
      hideTextChildren(gameInfo.humanIcon);
      hideTextChildren(gameInfo.aiIcon);
      hideTextChildren(gameInfo.p1Icon);
      hideTextChildren(gameInfo.p2Icon);
    } catch (err) {
      return;
    }

    loadAvatarTexture(gameInfo, 'player1Avatar', config.player1Avatar, gameInfo.humanIcon, p1Initials);
    if (gameInfo.p1Icon) {
      loadAvatarTexture(gameInfo, 'player1AvatarGameOver', config.player1Avatar, gameInfo.p1Icon, p1Initials);
    }
    loadAvatarTexture(gameInfo, 'player2Avatar', config.player2Avatar, gameInfo.aiIcon, p2Initials);
    if (gameInfo.p2Icon) {
      loadAvatarTexture(gameInfo, 'player2AvatarGameOver', config.player2Avatar, gameInfo.p2Icon, p2Initials);
    }
  }

  function loadAvatarTexture(gameInfo, key, url, targetSprite, initials) {
    if (!window.game || !targetSprite) return;
    const cacheKey = `avatar:${key}`;
    const avatarUrl = url || createAvatarPlaceholder(initials, 128);
    if (!avatarUrl) return;

    if (window.game.cache && window.game.cache.checkImageKey(cacheKey)) {
      targetSprite.loadTexture(cacheKey);
      return;
    }
    gameInfo._avatarLoading = gameInfo._avatarLoading || {};
    if (gameInfo._avatarLoading[cacheKey]) return;
    gameInfo._avatarLoading[cacheKey] = true;
    const img = new Image();
    img.onload = () => {
      if (window.game.cache) {
        window.game.cache.addImage(cacheKey, '', img);
        targetSprite.loadTexture(cacheKey);
      }
      delete gameInfo._avatarLoading[cacheKey];
    };
    img.onerror = () => {
      delete gameInfo._avatarLoading[cacheKey];
    };
    img.src = avatarUrl;
  }

  function disablePauseButton(gameInfo) {
    if (!state.isOnlineMatch || !gameInfo || !gameInfo.menuButton) return;
    gameInfo.menuButton.visible = false;
    if (gameInfo.menuButton.input) {
      gameInfo.menuButton.input.enabled = false;
    }
  }

  function ensureLocalSide() {
    if (!config.playerId || !config.player1Id || !config.player2Id) return;
    const newSide = config.playerId === config.player1Id ? 'p1' : 'p2';
    if (state.localSide !== newSide) {
      state.localSide = newSide;
      debugLog('[8Ball] Local side determined:', state.localSide);
    }
  }

  function applyBallState(gameInfo, ballState) {
    if (!gameInfo || !gameInfo.ballArray || !ballState) return;
    const ball = gameInfo.ballArray[ballState.id];
    if (!ball) return;
    const pos = clientToWorld(gameInfo, ballState.pos);
    const vel = clientVelToWorld(gameInfo, ballState.vel);
    if (pos) {
      ball.position.x = pos.x;
      ball.position.y = pos.y;
    }
    if (vel) {
      ball.velocity.x = vel.x;
      ball.velocity.y = vel.y;
    }
    ball.active = ballState.active ? 1 : 0;
    if (ball.mc) ball.mc.visible = ball.active;
    if (ball.shadow) ball.shadow.visible = ball.active;
  }

  function applyGameState(gameState) {
    if (!window.playState || !window.playState.gameInfo || !gameState || !gameState.clientState) return;
    const gameInfo = window.playState.gameInfo;
    const clientState = gameState.clientState;
    state.lastServerState = gameState;
    
    // Ensure we know which side we're playing
    if (gameState.player1Id && gameState.player2Id) {
      config.player1Id = gameState.player1Id;
      config.player2Id = gameState.player2Id;
      ensureLocalSide();
    }
    
    if (debugEnabled) {
      state.debugCount += 1;
      if (state.debugCount % 20 === 1) {
        debugLog('[8Ball] applyGameState', {
          tick: state.debugCount,
          turn: clientState.turn,
          localSide: state.localSide,
          currentPlayer: gameState.currentPlayer,
          ballInHand: clientState.ballInHand,
          winner: clientState.winner
        });
      }
    }

    if (Array.isArray(clientState.balls)) {
      clientState.balls.forEach((ballState) => applyBallState(gameInfo, ballState));
    }

    const moving = Array.isArray(clientState.balls)
      ? clientState.balls.some((ballState) => {
        const vel = ballState.vel;
        if (!vel) return false;
        return Math.abs(vel.x) > 0.4 || Math.abs(vel.y) > 0.4;
      })
      : false;

    if (clientState.turn) {
      gameInfo.turn = clientState.turn;
    }
    if (clientState.p1Target) gameInfo.p1TargetType = clientState.p1Target;
    if (clientState.p2Target) gameInfo.p2TargetType = clientState.p2Target;
    if (typeof clientState.ballInHand === 'boolean') gameInfo.cueBallInHand = clientState.ballInHand;
    if (typeof clientState.foul === 'boolean') gameInfo.fouled = clientState.foul;
    if (typeof clientState.shotNumber === 'number') gameInfo.shotNum = clientState.shotNumber;
    gameInfo.shotRunning = moving;
    gameInfo.beginStrike = false;
    gameInfo.gameRunning = true;
    if (clientState.winner) {
      gameInfo.winner = clientState.winner;
      gameInfo.gameOver = true;
    }

    if (typeof window.renderScreen === 'function') {
      window.renderScreen();
    }
  }

  function sendShot(gameInfo) {
    if (!state.gameSocket || !state.socketReady || !gameInfo) {
      debugLog('[8Ball] Shot blocked: socket not ready', {
        hasSocket: !!state.gameSocket,
        socketReady: state.socketReady,
        hasGameInfo: !!gameInfo
      });
      return;
    }
    if (!state.localSide || gameInfo.turn !== state.localSide) {
      debugLog('[8Ball] Shot blocked: not player turn', {
        localSide: state.localSide,
        gameTurn: gameInfo.turn
      });
      return;
    }
    if (!gameInfo.aimDirectionVector) {
      debugLog('[8Ball] Shot blocked: no aim direction');
      return;
    }

    const direction = worldDirToClient(gameInfo, gameInfo.aimDirectionVector);
    const cueBall = gameInfo.ballArray && gameInfo.ballArray[0];
    const cueBallPosition = gameInfo.cueBallInHand && cueBall ? worldToClient(gameInfo, cueBall.position) : null;
    const payload = {
      direction,
      power: gameInfo.power,
      cueBallPosition,
      screw: cueBall ? cueBall.screw : 0,
      english: cueBall ? cueBall.english : 0
    };
    
    debugLog('[8Ball] Sending shot:', payload);
    state.gameSocket.emit('game:action', { action: 'shot', data: payload });
  }

  function updateInputLocks(gameInfo) {
    if (!gameInfo || !state.isOnlineMatch) return;
    const isYourTurn = state.localSide && gameInfo.turn === state.localSide;
    const canPlay = Boolean(state.socketReady && state.sessionId);
    const allowInput = isYourTurn && canPlay;
    
    if (debugEnabled) {
      debugLog('[8Ball] Input Lock Status:', {
        localSide: state.localSide,
        gameTurn: gameInfo.turn,
        isYourTurn,
        socketReady: state.socketReady,
        sessionId: !!state.sessionId,
        canPlay,
        allowInput
      });
    }
    
    gameInfo.preventAim = !allowInput;
    gameInfo.preventSetPower = !allowInput;
    gameInfo.preventUpdateCue = !allowInput;
    gameInfo.lockAim = !allowInput;
    if (!allowInput) {
      gameInfo.settingPower = false;
      gameInfo.beginStrike = false;
      gameInfo.executeStrike = false;
      gameInfo.startAim = false;
      gameInfo.moverMouseDown = false;
    }
  }

  function ensureAuthoritativePhysics(gameInfo) {
    if (!state.isOnlineMatch || state.physicsPatched || !gameInfo || !gameInfo.phys) return;
    if (typeof gameInfo.phys.updatePhysics !== 'function') return;
    state.physicsPatched = true;
    gameInfo._authoritativePhysicsOriginal = gameInfo.phys.updatePhysics;
    gameInfo.phys.updatePhysics = function noop() {};
    debugLog('[8Ball] Authoritative physics enabled');
  }

  function updateScores(gameInfo) {
    const balls = gameInfo.ballArray || [];
    for (let i = 0; i < balls.length; i += 1) {
      const ball = balls[i];
      if (!ball) continue;
      const wasActive = state.ballStatus.get(ball.id);
      const isActive = Boolean(ball.active);
      if (wasActive === undefined) {
        state.ballStatus.set(ball.id, isActive);
        continue;
      }
      if (wasActive && !isActive) {
        if (ball.id !== 0) {
          if (gameInfo.turn === 'p2') {
            state.scores.p2 += 1;
          } else {
            state.scores.p1 += 1;
          }
        }
      }
      state.ballStatus.set(ball.id, isActive);
    }
  }

  function syncScore(gameInfo, elapsedSeconds, remainingSeconds) {
    const now = Date.now();
    if (now - state.lastScoresSentAt < SCORE_SYNC_INTERVAL_MS) return;
    state.lastScoresSentAt = now;
    sendEvent('SCORE_UPDATE', {
      player1Score: state.scores.p1,
      player2Score: state.scores.p2,
      elapsedSeconds,
      remainingSeconds
    });
  }

  function syncTimer(elapsedSeconds, remainingSeconds) {
    const now = Date.now();
    if (now - state.lastTimerSentAt < TIMER_SYNC_INTERVAL_MS) return;
    state.lastTimerSentAt = now;
    sendEvent('MATCH_TIMER', { elapsedSeconds, remainingSeconds });
  }

  function getMatchTiming() {
    if (state.matchStartTime) {
      const elapsedSeconds = Math.floor((Date.now() - state.matchStartTime.getTime()) / 1000);
      const remainingSeconds = Math.max(0, state.maxDurationSeconds - elapsedSeconds);
      return { elapsedSeconds, remainingSeconds };
    }
    
    // Fallback to game time or wall time
    if (!state.startTimeMs) {
      state.startTimeMs = Date.now();
    }
    
    const gameElapsedSeconds = Math.floor((gameInfo?.time || 0) / 60);
    const wallElapsedSeconds = Math.floor((Date.now() - state.startTimeMs) / 1000);
    const elapsedSeconds = gameElapsedSeconds > 0 ? gameElapsedSeconds : wallElapsedSeconds;
    const remainingSeconds = Math.max(0, state.maxDurationSeconds - elapsedSeconds);
    
    return { elapsedSeconds, remainingSeconds };
  }

  function finalizeMatch(gameInfo, reason) {
    if (state.matchOverSent) return;
    state.matchOverSent = true;
    const winner = gameInfo.winner || (state.scores.p1 >= state.scores.p2 ? 'p1' : 'p2');
    const winnerId = winner === 'p1' ? config.player1Id : config.player2Id;
    gameInfo.gameOver = true;
    gameInfo.gameRunning = false;
    gameInfo.winner = winner;
    sendEvent('MATCH_COMPLETED', {
      winner,
      winnerId,
      reason,
      scores: { player1: state.scores.p1, player2: state.scores.p2 }
    });
  }

  function tryAutostart() {
    if (!autostart) return;
    if (!window.game || !window.projectInfo) return;
    if (window.game.state && window.game.state.current === 'play') {
      return;
    }
    if (window.game.state && window.game.state.current === 'mainMenu') {
      window.projectInfo.mode = 2;
      window.projectInfo.levelName = '2players';
      window.projectInfo.tutorial = false;
      window.game.state.start('play');
    } else {
      setTimeout(tryAutostart, 250);
    }
  }

  function normalizeSocketTarget(rawUrl, fallbackPath) {
    if (!rawUrl) {
      return { url: null, path: fallbackPath || '/socket.io' };
    }
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return { url: null, path: fallbackPath || '/socket.io' };
    }
    const withoutTrailing = trimmed.replace(/\/$/, '');
    const socketIndex = withoutTrailing.indexOf('/socket.io');
    let url = withoutTrailing;
    let path = fallbackPath || '/socket.io';
    if (socketIndex !== -1) {
      url = withoutTrailing.slice(0, socketIndex);
      path = withoutTrailing.slice(socketIndex);
    }
    if (!path.startsWith('/socket.io')) {
      path = fallbackPath || '/socket.io';
    }
    return { url, path };
  }

  function loadSocketIo(url, socketPath, onReady) {
    if (window.io) {
      onReady();
      return;
    }
    const target = normalizeSocketTarget(url, socketPath);
    if (!target.url) return;
    const normalized = target.url.replace(/^ws(s)?:\/\//, 'http$1://');
    const serverSrc = `${normalized.replace(/\/$/, '')}${target.path}/socket.io.js`;
    const localSrc = '/8ball-match/assets/lib/socket.io.min.js';
    let triedFallback = false;
    const inject = (src) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = onReady;
      script.onerror = () => {
        if (!triedFallback && src !== localSrc) {
          triedFallback = true;
          inject(localSrc);
          return;
        }
        console.error('[8Ball] Failed to load socket.io client');
      };
      document.head.appendChild(script);
    };
    inject(serverSrc);
  }

  function connectSockets() {
    if (!state.isOnlineMatch || state.socketsConnecting) return;
    
    // If gameSessionId is provided directly, skip matchmaking socket and connect directly to game
    if (config.gameSessionId) {
      debugLog('[8Ball] Direct session connection mode - gameSessionId provided:', config.gameSessionId);
      state.sessionId = config.gameSessionId;
      connectGameSession();
      return;
    }
    
    if (!config.playerId || !config.token || !config.matchId) {
      debugLog('[8Ball] Cannot connect sockets - missing required config', {
        playerId: !!config.playerId,
        token: !!config.token,
        matchId: !!config.matchId
      });
      return;
    }
    if (!window.io) {
      debugLog('[8Ball] Cannot connect sockets - socket.io not loaded');
      return;
    }

    state.socketsConnecting = true;
    const matchmakingTarget = normalizeSocketTarget(config.matchmakingUrl, config.matchmakingSocketPath);
    if (!matchmakingTarget.url) {
      debugLog('[8Ball] Cannot connect sockets - invalid matchmaking URL');
      state.socketsConnecting = false;
      return;
    }

    debugLog('[8Ball] Connecting to matchmaking service:', matchmakingTarget);
    state.matchmakingSocket = window.io(matchmakingTarget.url, {
      path: matchmakingTarget.path,
      transports: ['websocket', 'polling'],
      auth: { token: config.token }
    });

    state.matchmakingSocket.on('connect', () => {
      debugLog('[8Ball] matchmaking connected', matchmakingTarget);
      state.matchmakingSocket.emit('authenticate', {
        playerId: config.playerId,
        token: config.token
      });
    });

    state.matchmakingSocket.on('authenticated', () => {
      debugLog('[8Ball] matchmaking authenticated');
      state.matchmakingSocket.emit('join:match', { matchId: config.matchId });
    });

    state.matchmakingSocket.on('error', (error) => {
      debugLog('[8Ball] matchmaking socket error', error);
    });

    state.matchmakingSocket.on('match:state', (data) => {
      debugLog('[8Ball] match:state', data);
      if (data && data.sessionId) {
        state.sessionId = data.sessionId;
        connectGameSession();
        return;
      }
      if (!state.matchmakingReadySent && config.matchId) {
        state.matchmakingReadySent = true;
        state.matchmakingSocket.emit('match:ready', { matchId: config.matchId });
      }
    });

    state.matchmakingSocket.on('match:joined', (data) => {
      debugLog('[8Ball] match:joined', data);
      if (!state.matchmakingReadySent && config.matchId) {
        state.matchmakingReadySent = true;
        state.matchmakingSocket.emit('match:ready', { matchId: config.matchId });
      }
    });

    state.matchmakingSocket.on('match:started', (data) => {
      debugLog('[8Ball] match:started', data);
      if (data.startedAt) {
        state.matchStartTime = new Date(data.startedAt);
        state.maxDurationSeconds = data.maxDurationSeconds || 300;
      }
    });

    state.matchmakingSocket.on('match:timing_info', (data) => {
      debugLog('[8Ball] match:timing_info', data);
      if (data.startedAt) {
        state.matchStartTime = new Date(data.startedAt);
        state.maxDurationSeconds = data.maxDurationSeconds || 300;
      }
    });

    state.matchmakingSocket.on('match:timeout', (data) => {
      debugLog('[8Ball] match:timeout', data);
      sendEvent('MATCH_COMPLETED', {
        winner: null,
        winnerId: null,
        reason: 'timeout',
        scores: { player1: state.scores.p1, player2: state.scores.p2 }
      });
    });

    state.matchmakingSocket.on('game:session_created', (data) => {
      debugLog('[8Ball] game:session_created', data);
      if (data && data.sessionId) {
        state.sessionId = data.sessionId;
        if (data.startedAt) {
          state.matchStartTime = new Date(data.startedAt);
          state.maxDurationSeconds = data.maxDurationSeconds || 300;
        }
        connectGameSession();
      }
    });

    state.matchmakingSocket.on('disconnect', () => {
      debugLog('[8Ball] matchmaking disconnected');
      state.socketReady = false;
      state.socketsConnecting = false;
    });
  }

  function connectGameSession() {
    if (!window.io || !state.sessionId) {
      debugLog('[8Ball] Cannot connect game session:', {
        hasIo: !!window.io,
        sessionId: !!state.sessionId
      });
      return;
    }
    const gameTarget = normalizeSocketTarget(config.gameServiceUrl || config.matchmakingUrl, config.gameSocketPath);
    if (!gameTarget.url) {
      debugLog('[8Ball] Cannot connect game session - invalid game service URL');
      return;
    }
    
    if (!state.gameSocket) {
      debugLog('[8Ball] Connecting to game service:', gameTarget);
      state.gameSocket = window.io(gameTarget.url, {
        path: gameTarget.path,
        transports: ['websocket', 'polling'],
        auth: { token: config.token }
      });

      state.gameSocket.on('connect', () => {
        debugLog('[8Ball] game connected', gameTarget);
        state.gameSocket.emit('authenticate', {
          playerId: config.playerId,
          token: config.token
        });
      });

      state.gameSocket.on('authenticated', () => {
        debugLog('[8Ball] game authenticated');
        state.gameSocket.emit('game:join', { sessionId: state.sessionId });
      });

      state.gameSocket.on('game:joined', (data) => {
        debugLog('[8Ball] game:joined', data);
        state.socketReady = true;
        if (data && data.gameState) {
          applyGameState(data.gameState);
        }
        if (!state.readySent) {
          state.readySent = true;
          state.gameSocket.emit('game:ready');
          if (state.matchmakingSocket) {
            state.matchmakingSocket.emit('match:ready', { matchId: config.matchId });
          }
        }
      });

      state.gameSocket.on('game:ready', (data) => {
        debugLog('[8Ball] game:ready received', data);
        state.socketReady = true;
      });

      state.gameSocket.on('game:start', (data) => {
        debugLog('[8Ball] game:start', data);
        state.socketReady = true;
        if (data && data.gameState) {
          applyGameState(data.gameState);
        }
        
        // Initialize voice chat when game starts
        if (state.isOnlineMatch) {
          setTimeout(() => {
            initWebRTC();
            // Player 1 initiates the voice call
            if (state.localSide === 'p1') {
              setTimeout(() => startVoiceCall(), 1000);
            }
          }, 2000);
        }
      });

      state.gameSocket.on('game:state_updated', (data) => {
        debugLog('[8Ball] game:state_updated', data && data.tick ? { tick: data.tick, totalTicks: data.totalTicks } : null);
        if (data && data.gameState) {
          applyGameState(data.gameState);
        }
      });

      state.gameSocket.on('game:completed', (data) => {
        debugLog('[8Ball] game:completed', data);
        sendEvent('MATCH_COMPLETED', {
          winnerId: data?.winnerId,
          scores: {
            player1: data?.player1Score || 0,
            player2: data?.player2Score || 0
          },
          reason: 'completed'
        });
      });

      state.gameSocket.on('voice:signal', (data) => {
        debugLog('[8Ball] voice:signal received', data);
        handleVoiceSignal(data);
      });

      state.gameSocket.on('error', (error) => {
        debugLog('[8Ball] game socket error', error);
      });

      state.gameSocket.on('disconnect', () => {
        debugLog('[8Ball] game socket disconnected');
        state.socketReady = false;
      });
    } else {
      state.gameSocket.emit('game:join', { sessionId: state.sessionId });
    }
  }

  // WebRTC Voice Chat Functions
  function initWebRTC() {
    if (!state.isOnlineMatch || !state.gameSocket) return;
    
    const configuration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };

    state.webRTCConnection = new RTCPeerConnection(configuration);

    // Handle incoming audio stream
    state.webRTCConnection.ontrack = (event) => {
      debugLog('[8Ball] Received remote audio stream');
      state.remoteStream = event.streams[0];
      
      // Create audio element for remote stream
      const remoteAudio = document.getElementById('remoteAudio') || document.createElement('audio');
      remoteAudio.id = 'remoteAudio';
      remoteAudio.srcObject = state.remoteStream;
      remoteAudio.autoplay = true;
      remoteAudio.style.display = 'none';
      if (!document.getElementById('remoteAudio')) {
        document.body.appendChild(remoteAudio);
      }
    };

    // Handle ICE candidates
    state.webRTCConnection.onicecandidate = (event) => {
      if (event.candidate && state.gameSocket) {
        const opponentId = state.localSide === 'p1' ? config.player2Id : config.player1Id;
        state.gameSocket.emit('voice:signal', {
          to: opponentId,
          signal: {
            type: 'ice-candidate',
            candidate: event.candidate
          }
        });
      }
    };

    // Get user audio
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        state.localStream = stream;
        stream.getTracks().forEach(track => {
          state.webRTCConnection.addTrack(track, stream);
        });
        debugLog('[8Ball] Local audio stream added');
      })
      .catch((error) => {
        debugLog('[8Ball] Failed to get user audio:', error);
      });
  }

  function handleVoiceSignal(data) {
    if (!state.webRTCConnection || !data.signal) return;

    const { signal } = data;

    if (signal.type === 'offer') {
      state.webRTCConnection.setRemoteDescription(new RTCSessionDescription(signal))
        .then(() => {
          return state.webRTCConnection.createAnswer();
        })
        .then((answer) => {
          return state.webRTCConnection.setLocalDescription(answer);
        })
        .then(() => {
          const opponentId = state.localSide === 'p1' ? config.player2Id : config.player1Id;
          state.gameSocket.emit('voice:signal', {
            to: opponentId,
            signal: {
              type: 'answer',
              sdp: state.webRTCConnection.localDescription
            }
          });
        })
        .catch((error) => {
          debugLog('[8Ball] Error handling voice offer:', error);
        });
    } else if (signal.type === 'answer') {
      state.webRTCConnection.setRemoteDescription(new RTCSessionDescription(signal))
        .catch((error) => {
          debugLog('[8Ball] Error handling voice answer:', error);
        });
    } else if (signal.type === 'ice-candidate') {
      state.webRTCConnection.addIceCandidate(new RTCIceCandidate(signal.candidate))
        .catch((error) => {
          debugLog('[8Ball] Error adding ICE candidate:', error);
        });
    }
  }

  function startVoiceCall() {
    if (!state.webRTCConnection || !state.localStream) return;

    state.webRTCConnection.createOffer()
      .then((offer) => {
        return state.webRTCConnection.setLocalDescription(offer);
      })
      .then(() => {
        const opponentId = state.localSide === 'p1' ? config.player2Id : config.player1Id;
        state.gameSocket.emit('voice:signal', {
          to: opponentId,
          signal: {
            type: 'offer',
            sdp: state.webRTCConnection.localDescription
          }
        });
      })
      .catch((error) => {
        debugLog('[8Ball] Error starting voice call:', error);
      });
  }

  function toggleMute() {
    if (!state.localStream) return false;
    
    const audioTrack = state.localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      return !audioTrack.enabled; // Return true if muted
    }
    return false;
  }
    if (!window.playState || !window.playState.gameInfo) {
      requestAnimationFrame(tick);
      return;
    }

    const gameInfo = window.playState.gameInfo;
    updateProjectInfoNames();
    ensureLocalSide();
    updateIconLabels(gameInfo);
    disablePauseButton(gameInfo);
    ensureAuthoritativePhysics(gameInfo);
    updateInputLocks(gameInfo);

    if (state.isOnlineMatch) {
      if (gameInfo.shotRunning && !state.lastShotWasRunning && !state.shotInFlight) {
        state.shotInFlight = true;
        sendShot(gameInfo);
      }
      if (!gameInfo.shotRunning) {
        state.shotInFlight = false;
      }
      state.lastShotWasRunning = gameInfo.shotRunning;
    }

    updateScores(gameInfo);
    
    const { elapsedSeconds, remainingSeconds } = getMatchTiming();

    syncScore(gameInfo, elapsedSeconds, remainingSeconds);
    syncTimer(elapsedSeconds, remainingSeconds);

    if (!state.matchOverSent && remainingSeconds <= 0) {
      finalizeMatch(gameInfo, 'timeout');
    } else if (gameInfo.gameOver && !state.matchOverSent) {
      finalizeMatch(gameInfo, 'completed');
    }

    requestAnimationFrame(tick);
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== window.location.origin) return;
    const { type, data } = event.data || {};
    if (type === 'SET_PLAYER_DATA' && data) {
      config.playerId = data.playerId || config.playerId;
      config.token = data.token || config.token;
      config.matchId = data.matchId || config.matchId;
      config.mode = data.mode || config.mode;
      config.player1Id = data.player1Id || config.player1Id;
      config.player2Id = data.player2Id || config.player2Id;
      config.player1Name = data.player1Name || config.player1Name;
      config.player2Name = data.player2Name || config.player2Name;
      config.player1Avatar = data.player1Avatar || config.player1Avatar;
      config.player2Avatar = data.player2Avatar || config.player2Avatar;
      config.matchmakingUrl = data.matchmakingUrl || config.matchmakingUrl;
      config.gameServiceUrl = data.gameServiceUrl || config.gameServiceUrl;
      config.matchmakingSocketPath = data.matchmakingSocketPath || config.matchmakingSocketPath;
      config.gameSocketPath = data.gameSocketPath || config.gameSocketPath;
      state.isOnlineMatch = config.mode === 'match';
      updateProjectInfoNames();
      if (state.isOnlineMatch) {
        loadSocketIo(
          config.gameServiceUrl || config.matchmakingUrl,
          config.gameSocketPath || config.matchmakingSocketPath,
          () => {
          connectSockets();
        });
      }
    }
  });

  if (state.isOnlineMatch) {
    loadSocketIo(
      config.gameServiceUrl || config.matchmakingUrl,
      config.gameSocketPath || config.matchmakingSocketPath,
      () => {
      connectSockets();
    });
  }

  // Debug helpers for console
  window.POOL_DEBUG = {
    getState: () => ({
      config: { ...config },
      state: { 
        isOnlineMatch: state.isOnlineMatch,
        socketReady: state.socketReady,
        sessionId: state.sessionId,
        localSide: state.localSide,
        matchOverSent: state.matchOverSent,
        shotInFlight: state.shotInFlight,
        readySent: state.readySent,
        matchmakingReadySent: state.matchmakingReadySent,
        socketsConnecting: state.socketsConnecting,
        matchStartTime: state.matchStartTime,
        maxDurationSeconds: state.maxDurationSeconds
      },
      connections: {
        hasMatchmakingSocket: !!state.matchmakingSocket,
        hasGameSocket: !!state.gameSocket,
        matchmakingConnected: state.matchmakingSocket?.connected,
        gameSocketConnected: state.gameSocket?.connected,
        hasWebRTC: !!state.webRTCConnection,
        webRTCState: state.webRTCConnection?.connectionState
      }
    }),
    reconnect: () => {
      state.socketsConnecting = false;
      connectSockets();
    },
    voice: {
      init: initWebRTC,
      start: startVoiceCall,
      mute: toggleMute,
      getConnectionState: () => state.webRTCConnection?.connectionState
    },
    timing: getMatchTiming
  };

  tryAutostart();
  tick();
})();
