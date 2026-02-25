const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const TOKEN_KEY = 'rapid_rolls_token';

export const authStorage = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setToken(token) {
    if (!token) return;
    localStorage.setItem(TOKEN_KEY, token);
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
  }
};

async function request(path, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      message = data.message || message;
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  healthCheck() {
    return request('/health');
  },

  register({ username, email, password }) {
    return request('/auth/register', {
      method: 'POST',
      body: { username, email, password }
    });
  },

  login({ email, password }) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
  },

  me(token) {
    return request('/auth/me', { token });
  },

  logout(token) {
    return request('/auth/logout', { method: 'POST', token });
  },

  claimDailyReward(token) {
    return request('/wallet/claim-daily', { method: 'POST', token });
  },

  deposit(token, amount) {
    return request('/wallet/deposit', { method: 'POST', token, body: { amount } });
  },

  withdraw(token, amount) {
    return request('/wallet/withdraw', { method: 'POST', token, body: { amount } });
  },

  getVipSummary(token) {
    return request('/vip/summary', { token });
  },

  getPublicState() {
    return request('/public/state');
  },

  getPlatformState(token) {
    return request('/platform/state', { token });
  },

  sendGlobalMessage(token, username, text) {
    if (!token) {
      return request('/chat/global/public', {
        method: 'POST',
        body: { user: username || 'Guest', text }
      });
    }

    return request('/chat/global', {
      method: 'POST',
      token,
      body: { text }
    });
  },

  deleteGlobalMessage(token, id) {
    return request(`/chat/global/${id}`, { method: 'DELETE', token });
  },

  clearGlobalChat(token) {
    return request('/chat/global', { method: 'DELETE', token });
  },

  postAnnouncement(token, text) {
    return request('/chat/announcement', { method: 'POST', token, body: { text } });
  },

  sendAdminMessage(token, text) {
    return request('/chat/admin', { method: 'POST', token, body: { text } });
  },

  getAdminLogs(token) {
    return request('/admin/logs', { token });
  },

  addPromotion(token, promo) {
    return request('/promotions', { method: 'POST', token, body: promo });
  },

  setUserPassword(token, userId, password) {
    return request(`/users/${userId}/password`, {
      method: 'PATCH',
      token,
      body: { password }
    });
  },

  addAdmin(token, payload) {
    return request('/users/admin', { method: 'POST', token, body: payload });
  },

  removeAdmin(token, userId) {
    return request(`/users/${userId}/admin`, { method: 'DELETE', token });
  },

  setSiteOnline(token, isSiteOnline) {
    return request('/platform/site-online', {
      method: 'PATCH',
      token,
      body: { isSiteOnline }
    });
  },

  setGameEnabled(token, slug, enabled) {
    return request(`/games/${slug}/enabled`, {
      method: 'PATCH',
      token,
      body: { enabled }
    });
  },

  getCrashState() {
    return request('/crash/state');
  },

  placeCrashBet(token, payload) {
    return request('/crash/bet', {
      method: 'POST',
      token,
      body: payload
    });
  },

  cancelCrashBet(token) {
    return request('/crash/cancel', {
      method: 'POST',
      token
    });
  },

  cashoutCrashBet(token) {
    return request('/crash/cashout', {
      method: 'POST',
      token
    });
  },

  getMyCrashBet(token) {
    return request('/crash/my-bet', { token });
  },

  verifyCrash(payload) {
    return request('/crash/verify', {
      method: 'POST',
      body: payload
    });
  },

  rollDice(token, payload) {
    return request('/dice/roll', {
      method: 'POST',
      token,
      body: payload
    });
  },

  verifyDice(payload) {
    return request('/dice/verify', {
      method: 'POST',
      body: payload
    });
  },

  getDiceHistory(token) {
    return request('/dice/history', { token });
  },

  spinRoulette(token, payload) {
    return request('/roulette/spin', {
      method: 'POST',
      token,
      body: payload
    });
  },

  verifyRoulette(payload) {
    return request('/roulette/verify', {
      method: 'POST',
      body: payload
    });
  },

  getRouletteHistory() {
    return request('/roulette/history');
  },

  playLimbo(token, payload) {
    return request('/limbo/play', {
      method: 'POST',
      token,
      body: payload
    });
  },

  dropPlinko(token, payload) {
    return request('/plinko/drop', {
      method: 'POST',
      token,
      body: payload
    });
  },

  startTowers(token, payload) {
    return request('/towers/start', {
      method: 'POST',
      token,
      body: payload
    });
  },

  revealTowers(token, payload) {
    return request('/towers/reveal', {
      method: 'POST',
      token,
      body: payload
    });
  },

  cashoutTowers(token, payload) {
    return request('/towers/cashout', {
      method: 'POST',
      token,
      body: payload
    });
  },

  getActiveTowers(token) {
    return request('/towers/active', { token });
  },

  rotateFairnessSeed(token, game, clientSeed) {
    return request('/fairness/rotate-seed', {
      method: 'POST',
      token,
      body: { game, clientSeed }
    });
  },

  verifyFairness(token, game, payload) {
    return request('/fairness/verify', {
      method: 'POST',
      token,
      body: { game, ...payload }
    });
  },

  getFairnessHistory(token, game) {
    return request(`/fairness/history${game ? `?game=${encodeURIComponent(game)}` : ''}`, { token });
  }
};
