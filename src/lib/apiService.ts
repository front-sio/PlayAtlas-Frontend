// src/lib/apiService.ts

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, '') || 'http://localhost:8080/api';

const getSessionAccessToken = async () => {
  if (typeof window === 'undefined') return null;
  try {
    const { getSession } = await import('next-auth/react');
    const session = await getSession();
    return (session as any)?.accessToken ?? null;
  } catch {
    return null;
  }
};

/** Build headers consistently */
const buildHeaders = (token?: string, json = false) => {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (json) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
};

/** Helper: safe JSON parse */
const safeJsonParse = (text: string) => {
  try {
    return { ok: true as const, value: JSON.parse(text) };
  } catch (e) {
    return { ok: false as const, error: e, value: null };
  }
};

/** Core response handler */
const handleResponse = async (response: Response) => {
  const contentType = response.headers.get('content-type') || '';
  const url = response.url;

  let rawText = '';
  try {
    rawText = await response.text();
  } catch {
    rawText = '';
  }

  const trimmed = rawText.trim();
  const hasBody = trimmed.length > 0;

  const looksLikeJson =
    contentType.includes('application/json') ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[');

  let parsed: any = null;

  if (!hasBody) {
    parsed = null;
  } else if (looksLikeJson) {
    const parsedAttempt = safeJsonParse(trimmed);
    if (!parsedAttempt.ok) {
      const error = new Error('Invalid JSON response from server');
      (error as any).status = response.status;
      (error as any).url = url;
      (error as any).data = {
        parseError: true,
        contentType,
        rawResponse: rawText,
      };
      throw error;
    }
    parsed = parsedAttempt.value;
  } else {
    parsed = rawText; // HTML/text error pages etc.
  }

  // Normalize: if API didn't return { success, data }, wrap it
  const normalized =
    parsed && typeof parsed === 'object' && 'success' in parsed
      ? parsed
      : { success: response.ok, data: parsed };

  if (!response.ok) {
    const message =
      (parsed &&
        typeof parsed === 'object' &&
        (parsed.message || parsed.error || parsed.msg)) ||
      `Request failed (${response.status} ${response.statusText})`;

    // Helpful debugging for non-JSON error bodies
    if (!looksLikeJson) {
      console.error('💥 Non-JSON error response received:', {
        url,
        status: response.status,
        statusText: response.statusText,
        contentType: contentType || null,
        responseTextPreview: trimmed.slice(0, 500),
      });
    }

    const error = new Error(message);
    (error as any).status = response.status;
    (error as any).url = url;
    (error as any).data = normalized;
    (error as any).rawResponse = rawText;
    throw error;
  }

  return normalized;
};

/** Low-level request helper using the NextAuth session token */
const request = async (
  path: string,
  opts: {
    method?: string;
    token?: string;
    body?: any;
    json?: boolean; // body is JSON
    skipAuth?: boolean; // don't attach Authorization header
    _retryCount?: number; // internal retry counter
    _skipRefresh?: boolean; // internal: avoid refresh loop
  } = {}
) => {
  const method = opts.method || 'GET';
  const isJson = opts.json ?? (opts.body !== undefined && typeof opts.body !== 'string');
  const retryCount = opts._retryCount || 0;

  // Use provided token or pull from the session (client-only)
  const token = opts.token || (opts.skipAuth ? null : await getSessionAccessToken());

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: buildHeaders(opts.skipAuth ? undefined : token || undefined, isJson),
    body:
      opts.body === undefined
        ? undefined
        : isJson
        ? JSON.stringify(opts.body)
        : (opts.body as string),
  });

  // Retry once if the session has refreshed its access token
  if (res.status === 401 && retryCount === 0 && !opts._skipRefresh && !opts.skipAuth && !opts.token) {
    const refreshedToken = await getSessionAccessToken();
    if (refreshedToken && refreshedToken !== token) {
      return request(path, { ...opts, token: refreshedToken, _retryCount: retryCount + 1 });
    }
  }

  return handleResponse(res);
};

// -------------------- Auth API (matches your auth-service routes) --------------------
export const authApi = {
  register: async (data: any) =>
    request('/auth/register', { method: 'POST', body: data, json: true }),

  login: async (data: any) => {
    
    try {
      return await request('/auth/login', { method: 'POST', body: data, json: true });
    } catch (fetchError) {
      throw fetchError;
    }
  },

  verifyEmail: async (data: { code: string; userId: string }) =>
    request('/auth/verify-email', { method: 'POST', body: data, json: true }),

  resendVerificationCode: async (userId: string, channel: 'email' | 'sms' = 'email') =>
    request('/auth/resend-verification', { method: 'POST', body: { userId, channel }, json: true }),

  forgotPassword: async (email: string) =>
    request('/auth/forgot-password', { method: 'POST', body: { email }, json: true }),

  resetPassword: async (data: { userId: string; code: string; newPassword: string }) =>
    request('/auth/reset-password', { method: 'POST', body: data, json: true }),

  // ✅ FIX: backend route is POST /auth/refresh
  refreshToken: async (refreshToken: string) =>
    request('/auth/refresh', {
      method: 'POST',
      body: { refreshToken },
      json: true,
      skipAuth: true,
      _skipRefresh: true,
    }),

  // ✅ FIX: backend logout expects refreshToken in body and requires authenticate middleware
  logout: async (token: string, refreshToken?: string) =>
    request('/auth/logout', { method: 'POST', token, body: { refreshToken }, json: true }),

  getCurrentUser: async (token: string) =>
    request('/auth/me', { method: 'GET', token }),

  updatePayoutPhone: async (token: string, phoneNumber: string) =>
    request('/auth/payout-phone', { method: 'PUT', token, body: { phoneNumber }, json: true }),

  devAutoVerify: async (userId: string) =>
    request('/auth/dev-auto-verify', { method: 'POST', body: { userId }, json: true }),
};

// -------------------- Player API (matches your player-service routes) --------------------
export const playerApi = {
  // ✅ POST /player/ (create or update player)
  createOrUpdatePlayer: async (data: any) =>
    request('/player', { method: 'POST', body: data, json: true }),

  // ✅ GET /player/:playerId/stats
  getStats: async (playerId: string, token?: string) => {
    if (!playerId) {
      const error = new Error('playerId is required to fetch player stats');
      (error as any).status = 400;
      (error as any).url = `${API_BASE_URL}/player/{playerId}/stats`;
      throw error;
    }
    // token is optional (your routes shown are not protected; keep token if you protect later)
    return request(`/player/${encodeURIComponent(playerId)}/stats`, { method: 'GET', token });
  },

  // ✅ GET /player/leaderboard (no query params in your routes file)
  getLeaderboard: async (token?: string) =>
    request('/player/leaderboard', { method: 'GET', token }),

  // ✅ POST /player/match-result
  updateMatchResult: async (data: any, token?: string) =>
    request('/player/match-result', { method: 'POST', token, body: data, json: true }),

  // ✅ POST /player/achievements
  addAchievement: async (data: any, token?: string) =>
    request('/player/achievements', { method: 'POST', token, body: data, json: true }),
};

// -------------------- Wallet API (leave as-is if your backend matches these routes) --------------------
export const walletApi = {
  getWallet: async (token: string) => request('/wallet/balance', { method: 'GET', token }),

  getTransactions: async (token: string, page = 1, limit = 20) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(Math.max(0, (page - 1) * limit)));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/payment/transactions${query}`, { method: 'GET', token });
  },

  requestDeposit: async (token: string, data: any) =>
    request('/wallet/deposit/request', { method: 'POST', token, body: data, json: true }),

  requestPayout: async (token: string, data: any) =>
    request('/payment/withdrawal/initiate', { method: 'POST', token, body: data, json: true }),

  listWallets: async (token: string, filters?: { type?: string; ownerId?: string; isActive?: boolean }) => {
    const params = new URLSearchParams();
    if (filters?.type) params.set('type', filters.type);
    if (filters?.ownerId) params.set('ownerId', filters.ownerId);
    if (filters?.isActive !== undefined) params.set('isActive', String(filters.isActive));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/wallet/admin/wallets${query}`, { method: 'GET', token });
  },

  updateWallet: async (token: string, walletId: string, data: any) =>
    request(`/wallet/admin/wallets/${encodeURIComponent(walletId)}`, { method: 'PUT', token, body: data, json: true }),

  creditWallet: async (token: string, data: any) =>
    request('/wallet/credit', { method: 'POST', token, body: data, json: true }),

  debitWallet: async (token: string, data: any) =>
    request('/wallet/debit', { method: 'POST', token, body: data, json: true }),

  // Payout management
  getPayoutRequests: async (token: string, status?: string, limit = 20, offset = 0) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/wallet/payouts${query}`, { method: 'GET', token });
  },

  approvePayout: async (token: string, payoutId: string, transactionMessage?: string, externalReference?: string, notes?: string) =>
    request(`/wallet/payouts/${encodeURIComponent(payoutId)}/approve`, {
      method: 'POST',
      token,
      body: { transactionMessage, externalReference, notes },
      json: true
    }),

  rejectPayout: async (token: string, payoutId: string, reason: string, notes?: string) =>
    request(`/wallet/payouts/${encodeURIComponent(payoutId)}/reject`, {
      method: 'POST',
      token,
      body: { reason, notes },
      json: true
    }),
};

// -------------------- Tournament API (leave if your backend matches these routes) --------------------
export const tournamentApi = {
  getTournaments: async (page = 1, limit = 20, status?: string) => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    params.set('limit', String(limit));
    if (status) params.set('status', status);
    return request(`/tournament?${params.toString()}`, { method: 'GET' });
  },

  getPlayerSeasons: async (token: string, playerId: string, result?: 'won') => {
    const params = new URLSearchParams();
    if (result) params.set('result', result);
    const qs = params.toString();
    return request(
      `/tournament/players/${encodeURIComponent(playerId)}/seasons${qs ? `?${qs}` : ''}`,
      { method: 'GET', token }
    );
  },

  getTournament: async (id: string) =>
    request(`/tournament/${encodeURIComponent(id)}`, { method: 'GET' }),

  createTournament: async (token: string, data: any) =>
    request('/tournament', { method: 'POST', token, body: data, json: true }),

  joinTournament: async (token: string, id: string, playerId: string, playerWalletId: string) =>
    request(`/tournament/${encodeURIComponent(id)}/join`, {
      method: 'POST',
      token,
      body: { playerId, playerWalletId },
      json: true,
    }),

  getSeasons: async (id: string, page = 1, limit = 20) =>
    request(`/tournament/${encodeURIComponent(id)}/seasons?page=${page}&limit=${limit}`, { method: 'GET' }),

  getSeason: async (seasonId: string) =>
    request(`/tournament/seasons/${encodeURIComponent(seasonId)}`, { method: 'GET' }),

  joinSeason: async (token: string, seasonId: string, playerId: string, playerWalletId: string) =>
    request(`/tournament/seasons/${encodeURIComponent(seasonId)}/join`, {
      method: 'POST',
      token,
      body: { playerId, playerWalletId },
      json: true,
    }),
};

// -------------------- Game API (leave if your backend matches these routes) --------------------
export const gameApi = {
  getActiveGames: async (token: string) => request('/game/active', { method: 'GET', token }),

  getGame: async (id: string) => request(`/game/match/${encodeURIComponent(id)}`, { method: 'GET' }),

  getGameHistory: async (token: string, page = 1, limit = 20) =>
    request(`/game/history?page=${page}&limit=${limit}`, { method: 'GET', token }),

  getLeaderboard: async (page = 1, limit = 50) =>
    request(`/game/leaderboard?page=${page}&limit=${limit}`, { method: 'GET' }),
};

// -------------------- Notification API --------------------
export const notificationApi = {
  getNotifications: async (token: string, page = 1, limit = 20) =>
    request(`/notification?page=${page}&limit=${limit}`, { method: 'GET', token }),

  markAsRead: async (token: string, data: any) =>
    request('/notification/mark-read', { method: 'PUT', token, body: data, json: true }),

  markAllAsRead: async (token: string) =>
    request('/notification/mark-all-read', { method: 'PUT', token }),
};

// -------------------- Payment API --------------------
export const paymentApi = {
  getProviders: async () => request('/payment/providers/all', { method: 'GET' }),

  getProviderDetails: async (code: string, amount?: number) => {
    const query = typeof amount === 'number' && !Number.isNaN(amount) ? `?amount=${encodeURIComponent(amount)}` : '';
    return request(`/payment/providers/${encodeURIComponent(code)}${query}`, { method: 'GET' });
  },

  initiateDeposit: async (token: string, data: any) =>
    request('/payment/deposit/initiate', { method: 'POST', token, body: data, json: true }),

  confirmDeposit: async (token: string, data: any) =>
    request('/payment/deposit/confirm', { method: 'POST', token, body: data, json: true }),

  getDepositStatus: async (token: string, referenceNumber: string) =>
    request(`/payment/deposit/${encodeURIComponent(referenceNumber)}`, { method: 'GET', token }),

  // Admin endpoints for finance officers
  approveDeposit: async (token: string, depositId: string, transactionMessage?: string) =>
    request(`/payment/deposit/${encodeURIComponent(depositId)}/approve`, { 
      method: 'POST', 
      token,
      ...(transactionMessage && {
        body: { transactionMessage },
        json: true
      })
    }),

  rejectDeposit: async (token: string, depositId: string, reason: string) =>
    request(`/payment/deposit/${encodeURIComponent(depositId)}/reject`, { 
      method: 'POST', 
      token, 
      body: { reason }, 
      json: true 
    }),

  getPendingDeposits: async (token: string, status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/payment/admin/deposits/pending${query}`, { method: 'GET', token });
  },

  getPendingWithdrawals: async (token: string, status?: string) => {
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`/payment/admin/withdrawals/pending${query}`, { method: 'GET', token });
  },

  approveWithdrawal: async (token: string, withdrawalId: string, transactionMessage?: string) =>
    request(`/payment/withdrawal/${encodeURIComponent(withdrawalId)}/approve`, { 
      method: 'POST', 
      token,
      ...(transactionMessage && {
        body: { transactionMessage },
        json: true
      })
    }),

  rejectWithdrawal: async (token: string, withdrawalId: string, reason: string) =>
    request(`/payment/withdrawal/${encodeURIComponent(withdrawalId)}/reject`, {
      method: 'POST',
      token,
      body: { reason },
      json: true
    }),

  getTransactionHistory: async (token: string, type?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/payment/transactions${query}`, { method: 'GET', token });
  },

  getAdminTransactions: async (token: string, type?: string, status?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/payment/admin/transactions${query}`, { method: 'GET', token });
  },

  // Float adjustment endpoints
  requestFloatAdjustment: async (token: string, data: any) =>
    request('/payment/float-adjustment/request', { method: 'POST', token, body: data, json: true }),

  getFloatAdjustmentRequests: async (token: string, status?: string, walletId?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (walletId) params.set('walletId', walletId);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/payment/float-adjustment/requests${query}`, { method: 'GET', token });
  },

  getFloatAdjustmentById: async (token: string, requestId: string) =>
    request(`/payment/float-adjustment/requests/${encodeURIComponent(requestId)}`, { method: 'GET', token }),

  approveFloatAdjustment: async (token: string, requestId: string, comments?: string) =>
    request(`/payment/float-adjustment/${encodeURIComponent(requestId)}/approve`, { 
      method: 'POST', 
      token, 
      body: { comments }, 
      json: true 
    }),

  rejectFloatAdjustment: async (token: string, requestId: string, reason: string) =>
    request(`/payment/float-adjustment/${encodeURIComponent(requestId)}/reject`, { 
      method: 'POST', 
      token, 
      body: { reason }, 
      json: true 
    }),
};

// -------------------- Admin API --------------------
export const adminApi = {
  getUsers: async (token: string, role?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (role) params.set('role', role);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/admin/users${query}`, { method: 'GET', token });
  },

  getAgents: async (token: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/admin/agents${query}`, { method: 'GET', token });
  },

  createAgent: async (token: string, data: any) =>
    request('/admin/agents', { method: 'POST', token, body: data, json: true }),

  updateUser: async (token: string, userId: string, data: any) =>
    request(`/admin/users/${encodeURIComponent(userId)}`, { method: 'PUT', token, body: data, json: true }),

  suspendUser: async (token: string, userId: string, reason: string) =>
    request(`/admin/users/${encodeURIComponent(userId)}/suspend`, {
      method: 'POST',
      token,
      body: { reason },
      json: true
    }),

  getDashboardStats: async (token: string) =>
    request('/admin/dashboard', { method: 'GET', token }),

  getTournamentStats: async (token: string) =>
    request('/admin/tournaments/stats', { method: 'GET', token }),

  getTournaments: async (token: string, status?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/admin/tournaments${query}`, { method: 'GET', token });
  },

  createTournament: async (token: string, data: any) =>
    request('/admin/tournaments', { method: 'POST', token, body: data, json: true }),

  cancelTournament: async (token: string, tournamentId: string, reason?: string) =>
    request(`/admin/tournaments/${encodeURIComponent(tournamentId)}/cancel`, {
      method: 'POST',
      token,
      body: { reason },
      json: true
    }),

  startTournament: async (token: string, tournamentId: string) =>
    request(`/admin/tournaments/${encodeURIComponent(tournamentId)}/start`, {
      method: 'POST',
      token
    }),

  getGameSessions: async (token: string, status?: string, limit = 50) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    params.set('limit', String(limit));
    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/admin/games/sessions${query}`, { method: 'GET', token });
  },

  cancelGameSession: async (token: string, sessionId: string) =>
    request(`/admin/games/sessions/${encodeURIComponent(sessionId)}/cancel`, {
      method: 'POST',
      token
    }),

  generateFinancialReport: async (token: string, startDate: string, endDate: string) =>
    request('/admin/reports/financial', {
      method: 'POST',
      token,
      body: { startDate, endDate },
      json: true
    }),
};

// -------------------- Agent API --------------------
export const agentApi = {
  getProfile: async (token: string) =>
    request('/agent/me', { method: 'GET', token }),

  registerPlayer: async (token: string, data: any) =>
    request('/agent/players/register', { method: 'POST', token, body: data, json: true }),

  listPlayers: async (token: string) =>
    request('/agent/players', { method: 'GET', token }),

  lookupRecipient: async (token: string, phoneNumber: string) =>
    request(`/agent/transfer/lookup/phone/${encodeURIComponent(phoneNumber)}`, { method: 'GET', token }),

  transferFloat: async (token: string, data: { phoneNumber: string; amount: number }) =>
    request('/agent/transfer', { method: 'POST', token, body: data, json: true }),

  listEarnings: async (token: string) =>
    request('/agent/earnings', { method: 'GET', token }),
};

// -------------------- Matchmaking API --------------------
export const matchmakingApi = {
  getPlayerMatches: async (playerId: string, status?: string) => {
    const base = `/matchmaking/player/${encodeURIComponent(playerId)}/matches`;
    const qs = status ? `?status=${encodeURIComponent(status)}` : '';
    return request(`${base}${qs}`, { method: 'GET' });
  },

  getMatch: async (matchId: string) =>
    request(`/matchmaking/match/${encodeURIComponent(matchId)}`, { method: 'GET' }),

  updateMatchResult: async (matchId: string, data: any, token?: string) =>
    request(`/matchmaking/match/${encodeURIComponent(matchId)}/result`, { method: 'PUT', token, body: data, json: true }),
};

// -------------------- Lookup API --------------------
export const lookupApi = {
  resolveMatchLookups: async (data: { opponentIds: string[]; tournamentIds: string[] }, token?: string) =>
    request('/lookup/matches', { method: 'POST', token, body: data, json: true })
};

// -------------------- Backward compatibility exports --------------------
export const getWalletBalance = async (token: string) => walletApi.getWallet(token);
export const withdrawFunds = async (token: string, data: any) => walletApi.requestPayout(token, data);
export const getTransactionHistory = async (token: string, page = 1, limit = 20) =>
  paymentApi.getTransactionHistory(token, undefined, limit, Math.max(0, (page - 1) * limit));

export const handleApiError = (error: any) => {
  console.error('API Error:', {
    message: error?.message,
    status: error?.status,
    url: error?.url,
    data: error?.data,
    raw: error?.rawResponse?.slice?.(0, 500),
  });

  if (typeof window !== 'undefined' && error?.status === 401) {
    window.location.href = '/auth/login';
  }

  return error;
};
