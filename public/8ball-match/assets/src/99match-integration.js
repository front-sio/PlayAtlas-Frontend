// Multiplayer + match integration for PlayAtlas (authoritative server)
(function () {
  const CLIENT_TABLE = { width: 1600, height: 900 };
  const DEFAULT_SCALE = 2.3;
  const SCORE_SYNC_INTERVAL_MS = 250;
  const TIMER_SYNC_INTERVAL_MS = 1000;

  const params = new URLSearchParams(window.location.search);
  const matchDurationSeconds = Number(params.get('matchDurationSeconds') || params.get('matchDuration') || 300);
  const autostart = params.get('autostart') === '1';

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
    gameServiceUrl: params.get('gameServiceUrl') || null
  };

  const state = {
    initialized: false,
    matchOverSent: false,
    lastScoresSentAt: 0,
    lastTimerSentAt: 0,
    ballStatus: new Map(),
    scores: { p1: 0, p2: 0 },
    startTimeMs: null,
    isOnlineMatch: config.mode === 'match',
    socketReady: false,
    matchmakingSocket: null,
    gameSocket: null,
    sessionId: null,
    lastServerState: null,
    lastShotWasRunning: false,
    shotInFlight: false,
    readySent: false,
    socketsConnecting: false,
    localSide: null
  };

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
    const p1Label = config.player1Name || 'Player 1';
    const p2Label = config.player2Name || 'Player 2';
    const p1Initials = getPlayerInitials(p1Label) || 'P1';
    const p2Initials = getPlayerInitials(p2Label) || 'P2';
    const p1Text = gameInfo.humanIcon.children && gameInfo.humanIcon.children.find((c) => c && c.text !== undefined);
    const p2Text = gameInfo.aiIcon.children && gameInfo.aiIcon.children.find((c) => c && c.text !== undefined);
    if (p1Text) p1Text.text = p1Initials;
    if (p2Text) p2Text.text = p2Initials;
    if (gameInfo.p1Icon && gameInfo.p1Icon.children) {
      const label = gameInfo.p1Icon.children.find((c) => c && c.text !== undefined);
      if (label) label.text = p1Initials;
    }
    if (gameInfo.p2Icon && gameInfo.p2Icon.children) {
      const label = gameInfo.p2Icon.children.find((c) => c && c.text !== undefined);
      if (label) label.text = p2Initials;
    }
    if (config.player1Avatar) {
      loadAvatarTexture(gameInfo, 'player1Avatar', config.player1Avatar, gameInfo.humanIcon);
      if (gameInfo.p1Icon) {
        loadAvatarTexture(gameInfo, 'player1AvatarGameOver', config.player1Avatar, gameInfo.p1Icon);
      }
    }
    if (config.player2Avatar) {
      loadAvatarTexture(gameInfo, 'player2Avatar', config.player2Avatar, gameInfo.aiIcon);
      if (gameInfo.p2Icon) {
        loadAvatarTexture(gameInfo, 'player2AvatarGameOver', config.player2Avatar, gameInfo.p2Icon);
      }
    }
  }

  function loadAvatarTexture(gameInfo, key, url, targetSprite) {
    if (!window.game || !url || !targetSprite) return;
    const cacheKey = `avatar:${key}`;
    if (window.game.cache && window.game.cache.checkImageKey(cacheKey)) {
      targetSprite.loadTexture(cacheKey);
      return;
    }
    gameInfo._avatarLoading = gameInfo._avatarLoading || {};
    if (gameInfo._avatarLoading[cacheKey]) return;
    gameInfo._avatarLoading[cacheKey] = true;
    window.game.load.image(cacheKey, url);
    window.game.load.onLoadComplete.addOnce(() => {
      targetSprite.loadTexture(cacheKey);
      delete gameInfo._avatarLoading[cacheKey];
    });
    window.game.load.start();
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
    state.localSide = config.playerId === config.player1Id ? 'p1' : 'p2';
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
    if (!state.gameSocket || !state.socketReady || !gameInfo) return;
    if (!state.localSide || gameInfo.turn !== state.localSide) return;
    if (!gameInfo.aimDirectionVector) return;

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
    state.gameSocket.emit('game:action', { action: 'shot', data: payload });
  }

  function updateInputLocks(gameInfo) {
    if (!gameInfo || !state.isOnlineMatch) return;
    const isYourTurn = state.localSide && gameInfo.turn === state.localSide;
    const canPlay = Boolean(state.socketReady && state.sessionId);
    const allowInput = isYourTurn && canPlay;
    gameInfo.preventAim = !allowInput;
    gameInfo.preventSetPower = !allowInput;
    gameInfo.moverMouseDown = false;
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

  function loadSocketIo(url, onReady) {
    if (window.io) {
      onReady();
      return;
    }
    if (!url) return;
    const script = document.createElement('script');
    script.src = `${url.replace(/\/$/, '')}/socket.io/socket.io.js`;
    script.onload = onReady;
    script.onerror = () => {
      console.error('[8Ball] Failed to load socket.io client');
    };
    document.head.appendChild(script);
  }

  function connectSockets() {
    if (!state.isOnlineMatch || state.socketsConnecting) return;
    if (!config.playerId || !config.token || !config.matchId) return;
    if (!config.matchmakingUrl || !config.gameServiceUrl) return;
    if (!window.io) return;

    state.socketsConnecting = true;
    state.matchmakingSocket = window.io(config.matchmakingUrl, {
      transports: ['websocket', 'polling'],
      auth: { token: config.token }
    });

    state.matchmakingSocket.on('connect', () => {
      state.matchmakingSocket.emit('authenticate', {
        playerId: config.playerId,
        token: config.token
      });
    });

    state.matchmakingSocket.on('authenticated', () => {
      state.matchmakingSocket.emit('join:match', { matchId: config.matchId });
    });

    state.matchmakingSocket.on('match:state', (data) => {
      if (data && data.sessionId) {
        state.sessionId = data.sessionId;
        connectGameSession();
      }
    });

    state.matchmakingSocket.on('game:session_created', (data) => {
      if (data && data.sessionId) {
        state.sessionId = data.sessionId;
        connectGameSession();
      }
    });

    state.matchmakingSocket.on('disconnect', () => {
      state.socketReady = false;
    });
  }

  function connectGameSession() {
    if (!config.gameServiceUrl || !window.io || !state.sessionId) return;
    if (!state.gameSocket) {
      state.gameSocket = window.io(config.gameServiceUrl, {
        transports: ['websocket', 'polling'],
        auth: { token: config.token }
      });

      state.gameSocket.on('connect', () => {
        state.gameSocket.emit('authenticate', {
          playerId: config.playerId,
          token: config.token
        });
      });

      state.gameSocket.on('authenticated', () => {
        state.gameSocket.emit('game:join', { sessionId: state.sessionId });
      });

      state.gameSocket.on('game:joined', (data) => {
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

      state.gameSocket.on('game:start', (data) => {
        state.socketReady = true;
        if (data && data.gameState) {
          applyGameState(data.gameState);
        }
      });

      state.gameSocket.on('game:state_updated', (data) => {
        if (data && data.gameState) {
          applyGameState(data.gameState);
        }
      });

      state.gameSocket.on('game:completed', (data) => {
        sendEvent('MATCH_COMPLETED', {
          winnerId: data?.winnerId,
          scores: {
            player1: data?.player1Score || 0,
            player2: data?.player2Score || 0
          },
          reason: 'completed'
        });
      });

      state.gameSocket.on('disconnect', () => {
        state.socketReady = false;
      });
    } else {
      state.gameSocket.emit('game:join', { sessionId: state.sessionId });
    }
  }

  function tick() {
    if (!window.playState || !window.playState.gameInfo) {
      requestAnimationFrame(tick);
      return;
    }

    const gameInfo = window.playState.gameInfo;
    updateProjectInfoNames();
    ensureLocalSide();
    updateIconLabels(gameInfo);
    disablePauseButton(gameInfo);
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
    if (!state.startTimeMs) {
      state.startTimeMs = Date.now();
    }

    const gameElapsedSeconds = Math.floor((gameInfo.time || 0) / 60);
    const wallElapsedSeconds = Math.floor((Date.now() - state.startTimeMs) / 1000);
    const elapsedSeconds = gameElapsedSeconds > 0 ? gameElapsedSeconds : wallElapsedSeconds;
    const remainingSeconds = Math.max(0, matchDurationSeconds - elapsedSeconds);

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
      state.isOnlineMatch = config.mode === 'match';
      updateProjectInfoNames();
      if (state.isOnlineMatch) {
        loadSocketIo(config.gameServiceUrl || config.matchmakingUrl, () => {
          connectSockets();
        });
      }
    }
  });

  if (state.isOnlineMatch) {
    loadSocketIo(config.gameServiceUrl || config.matchmakingUrl, () => {
      connectSockets();
    });
  }

  tryAutostart();
  tick();
})();
