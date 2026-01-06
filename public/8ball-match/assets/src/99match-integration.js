(function () {
  const params = new URLSearchParams(window.location.search);
  const matchDurationSeconds = Number(params.get('matchDurationSeconds') || params.get('matchDuration') || 300);
  const player1Id = params.get('player1Id') || null;
  const player2Id = params.get('player2Id') || null;
  const player1Name = params.get('player1Name') || null;
  const player2Name = params.get('player2Name') || null;
  const autostart = params.get('autostart') === '1';

  const sendEvent = (type, data) => {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type, data }, window.location.origin);
    }
  };

  const state = {
    initialized: false,
    lastScoresSentAt: 0,
    lastTimerSentAt: 0,
    matchOverSent: false,
    ballStatus: new Map(),
    scores: { p1: 0, p2: 0 },
    startTimeMs: null
  };

  const FRAMES_PER_SECOND = 60;
  const SCORE_SYNC_INTERVAL_MS = 250;
  const TIMER_SYNC_INTERVAL_MS = 1000;

  function getWinnerByPoints(gameInfo) {
    if (state.scores.p1 > state.scores.p2) return 'p1';
    if (state.scores.p2 > state.scores.p1) return 'p2';
    return gameInfo.turn === 'p2' ? 'p2' : 'p1';
  }

  function finalizeMatch(gameInfo, reason) {
    if (state.matchOverSent) return;
    state.matchOverSent = true;

    const winner = reason === 'completed' && gameInfo.winner ? gameInfo.winner : getWinnerByPoints(gameInfo);
    const winnerId = winner === 'p1' ? player1Id : player2Id;
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

  function ensureMode(gameInfo) {
    if (window.projectInfo && window.projectInfo.mode !== 2) {
      window.projectInfo.mode = 2;
      window.projectInfo.levelName = '2players';
      window.projectInfo.matchDurationSeconds = matchDurationSeconds;
      window.projectInfo.player1Name = player1Name;
      window.projectInfo.player2Name = player2Name;
    }
    if (window.projectInfo && !window.projectInfo.matchDurationSeconds) {
      window.projectInfo.matchDurationSeconds = matchDurationSeconds;
    }
    if (window.projectInfo && !window.projectInfo.player1Name && player1Name) {
      window.projectInfo.player1Name = player1Name;
    }
    if (window.projectInfo && !window.projectInfo.player2Name && player2Name) {
      window.projectInfo.player2Name = player2Name;
    }
    gameInfo.mode = gameInfo.mode || 'match';
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

  function tick() {
    if (!window.playState || !window.playState.gameInfo) {
      requestAnimationFrame(tick);
      return;
    }

    const gameInfo = window.playState.gameInfo;
    ensureMode(gameInfo);

    updateScores(gameInfo);

    if (!state.startTimeMs) {
      state.startTimeMs = Date.now();
    }
    const gameElapsedSeconds = Math.floor((gameInfo.time || 0) / FRAMES_PER_SECOND);
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

  tryAutostart();
  tick();
})();
