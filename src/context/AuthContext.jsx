import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, authStorage } from '../services/api';

const AuthContext = createContext(null);

const isClaimedToday = (isoDate) => {
  if (!isoDate) return false;
  const claimedDate = new Date(isoDate).toDateString();
  const today = new Date().toDateString();
  return claimedDate === today;
};

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => authStorage.getToken());
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const isDailyAvailable = user ? !isClaimedToday(user.lastDailyClaimedAt) : false;

  useEffect(() => {
    let active = true;

    async function bootstrapAuth() {
      if (!token) {
        if (active) setIsLoading(false);
        return;
      }

      try {
        const data = await api.me(token);
        if (active) {
          setUser(data.user);
        }
      } catch {
        authStorage.clearToken();
        if (active) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    bootstrapAuth();

    return () => {
      active = false;
    };
  }, [token]);

  const login = async (credentials) => {
    setIsLoading(true);
    try {
      const data = await api.login(credentials);
      authStorage.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (payload) => {
    setIsLoading(true);
    try {
      const data = await api.register(payload);
      authStorage.setToken(data.token);
      setToken(data.token);
      setUser(data.user);
      return data.user;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      if (token) {
        await api.logout(token);
      }
    } catch {
      // ignore logout errors during local cleanup
    } finally {
      authStorage.clearToken();
      setToken(null);
      setUser(null);
      setIsLoading(false);
    }
  };

  const refreshUser = async () => {
    if (!token) return null;
    const data = await api.me(token);
    setUser(data.user);
    return data.user;
  };

  const syncUser = useCallback((nextUser) => {
    if (!nextUser) return;
    setUser(nextUser);
  }, []);

  const claimDailyBonus = async () => {
    if (!user || !token || !isDailyAvailable) return { ok: false, reason: 'unavailable' };
    setIsLoading(true);
    try {
      const data = await api.claimDailyReward(token);
      setUser(data.user);
      return { ok: true };
    } finally {
      setIsLoading(false);
    }
  };

  const depositFunds = async (amount = 25) => {
    if (!user || !token || amount <= 0) return;
    setIsLoading(true);
    try {
      const data = await api.deposit(token, amount);
      setUser(data.user);
    } finally {
      setIsLoading(false);
    }
  };

  const withdrawFunds = async (amount = 25) => {
    if (!user || !token || amount <= 0 || user.balance < amount) return { ok: false };
    setIsLoading(true);
    try {
      const data = await api.withdraw(token, amount);
      setUser(data.user);
      return { ok: true };
    } catch {
      return { ok: false };
    } finally {
      setIsLoading(false);
    }
  };

  const applyBalanceDelta = async (delta = 0) => {
    if (!user || !token || !Number.isFinite(delta) || delta === 0) return { ok: false };

    if (delta > 0) {
      const data = await api.deposit(token, Number(delta.toFixed(2)));
      setUser(data.user);
      return { ok: true, user: data.user };
    }

    const withdrawAmount = Number(Math.abs(delta).toFixed(2));
    if (user.balance < withdrawAmount) return { ok: false, reason: 'insufficient' };

    try {
      const data = await api.withdraw(token, withdrawAmount);
      setUser(data.user);
      return { ok: true, user: data.user };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  };

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      isDailyAvailable,
      login,
      register,
      logout,
      claimDailyBonus,
      depositFunds,
      withdrawFunds,
      applyBalanceDelta,
      refreshUser,
      syncUser
    }),
    [user, token, isLoading, isDailyAvailable, syncUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
