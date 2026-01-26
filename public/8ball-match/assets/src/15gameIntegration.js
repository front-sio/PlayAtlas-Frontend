(function () {
  var state = {
    startSent: false,
    resultSent: false
  };

  function getParams() {
    var params = new URLSearchParams(window.location.search || '');
    return {
      matchmakingUrl: params.get('matchmakingUrl') || '',
      gameServiceUrl: params.get('gameServiceUrl') || '',
      matchId: params.get('matchId') || '',
      sessionId: params.get('gameSessionId') || '',
      playerId: params.get('playerId') || '',
      token: params.get('token') || ''
    };
  }

  function buildHeaders(token) {
    var headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers.Authorization = 'Bearer ' + token;
    }
    return headers;
  }

  function postMessage(type, data) {
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage({ type: type, data: data }, '*');
    } catch (err) {
      console.warn('[match-integration] postMessage failed', err);
    }
  }

  function signalStart(options) {
    if (state.startSent) return;
    var cfg = getParams();
    if (!cfg.matchmakingUrl || !cfg.matchId) {
      console.warn('[match-integration] Missing matchmaking URL or match ID');
      return;
    }
    state.startSent = true;

    var payload = {
      startedAt: (options && options.startedAt) || new Date().toISOString(),
      sessionId: cfg.sessionId || null,
      playerId: cfg.playerId || null,
      source: (options && options.source) || 'break'
    };

    var url =
      cfg.matchmakingUrl.replace(/\/$/, '') +
      '/matchmaking/match/' +
      encodeURIComponent(cfg.matchId) +
      '/start';

    fetch(url, {
      method: 'POST',
      headers: buildHeaders(cfg.token),
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        }
        return res.json();
      })
      .then(function (data) {
        postMessage('MATCH_STARTED', data);
      })
      .catch(function (err) {
        console.error('[match-integration] start error', err);
        state.startSent = false;
      });
  }

  function submitResult(result) {
    if (state.resultSent) return;
    var cfg = getParams();
    if (!cfg.gameServiceUrl || !cfg.sessionId) {
      console.warn('[match-integration] Missing game service URL or session ID');
      state.resultSent = true;
      // Send result directly as data
      postMessage('MATCH_COMPLETED', result);
      return;
    }
    state.resultSent = true;

    var url =
      cfg.gameServiceUrl.replace(/\/$/, '') +
      '/sessions/' +
      encodeURIComponent(cfg.sessionId) +
      '/submit-result';

    fetch(url, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify(result)
    })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        }
        return res.json();
      })
      .then(function (data) {
        // Send server response or fallback to original result
        postMessage('MATCH_COMPLETED', data || result);
      })
      .catch(function (err) {
        console.error('[match-integration] result error', err);
        state.resultSent = false;
        // Send the result data directly
        postMessage('MATCH_COMPLETED', result);
      });
  }

  window.MatchIntegration = {
    getParams: getParams,
    signalStart: signalStart,
    submitResult: submitResult
  };
})();
