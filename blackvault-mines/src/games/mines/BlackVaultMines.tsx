'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Howl, Howler } from 'howler';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest, clearToken, storeToken } from '@/src/lib/api';

type Role = 'player' | 'admin' | 'owner';
type RiskLevel = 'Low' | 'Medium' | 'High' | 'Extreme';

type UserSession = {
  id: string;
  username: string;
  role: Role;
  balance: number;
  totalWagered: number;
  totalWon: number;
  minesBanned?: boolean;
  clientSeed?: string;
  nonce?: number;
};

type StartResponse = {
  gameId: string;
  status: 'active';
  betAmount: number;
  mineCount: number;
  gridSize: number;
  revealedTiles: number[];
  multiplier: number;
  hashedServerSeed: string;
  clientSeed: string;
  nonce: number;
  houseEdge: number;
  balance: number;
};

type RevealResponse = {
  gameId: string;
  status: 'active' | 'lost' | 'won';
  tileIndex: number;
  hitMine: boolean;
  revealedTiles?: number[];
  minesPositions?: number[];
  multiplier: number;
  payout?: number;
  potentialWin?: number;
  balance?: number;
  serverSeed?: string;
  hashedServerSeed?: string;
  clientSeed?: string;
  nonce?: number;
};

type CashoutResponse = {
  gameId: string;
  status: 'cashed_out';
  payout: number;
  multiplier: number;
  balance: number;
  minesPositions: number[];
  serverSeed: string;
  hashedServerSeed: string;
  clientSeed: string;
  nonce: number;
};

type PublicState = {
  siteOnline: boolean;
  houseEdge: number;
  activeMinesGames: number;
  topWinners: Array<{ username: string; totalWon: number }>;
};

type VerifyResponse = {
  seedMatches: boolean;
  boardMatches: boolean;
  verified: boolean;
};

type MinesRound = {
  gameId: string;
  status: 'idle' | 'active' | 'lost' | 'won' | 'cashed_out';
  betAmount: number;
  mineCount: number;
  gridSize: number;
  revealed: number[];
  mines: number[];
  multiplier: number;
  potentialWin: number;
  payout: number;
  hashedServerSeed: string;
  serverSeed: string;
  clientSeed: string;
  nonce: number;
};

type AuthMode = 'login' | 'register';

type SoundName =
  | 'tile_click'
  | 'diamond_tick'
  | 'diamond_chime'
  | 'diamond_shimmer'
  | 'mine_hit'
  | 'cashout'
  | 'big_win'
  | 'background_ambient_loop';

const defaultRound: MinesRound = {
  gameId: '',
  status: 'idle',
  betAmount: 1,
  mineCount: 3,
  gridSize: 5,
  revealed: [],
  mines: [],
  multiplier: 1,
  potentialWin: 0,
  payout: 0,
  hashedServerSeed: '',
  serverSeed: '',
  clientSeed: 'blackvault-client-seed',
  nonce: 0
};

const defaultPublicState: PublicState = {
  siteOnline: true,
  houseEdge: 0.01,
  activeMinesGames: 0,
  topWinners: []
};

function calcRisk(mineCount: number, gridSize: number): RiskLevel {
  const ratio = mineCount / (gridSize * gridSize);
  if (ratio <= 0.12) return 'Low';
  if (ratio <= 0.25) return 'Medium';
  if (ratio <= 0.4) return 'High';
  return 'Extreme';
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  }).format(Number.isFinite(value) ? value : 0);
}

function DiamondIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path d="M4 9L9 3h6l5 6-8 12L4 9Z" className="fill-emerald-400/25 stroke-emerald-300" strokeWidth="1.2" />
      <path d="M9 3l3 6 3-6" className="stroke-emerald-200" strokeWidth="1.2" />
      <path d="M4 9h16" className="stroke-emerald-200" strokeWidth="1.2" />
    </svg>
  );
}

function MineIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="6" className="fill-rose-500/30 stroke-rose-300" strokeWidth="1.2" />
      <path d="M12 2v4M22 12h-4M12 22v-4M2 12h4M19 5l-3 3M5 5l3 3M19 19l-3-3M5 19l3-3" className="stroke-rose-300" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

export function BlackVaultMines() {
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [identity, setIdentity] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [user, setUser] = useState<UserSession | null>(null);
  const [publicState, setPublicState] = useState<PublicState>(defaultPublicState);
  const [round, setRound] = useState<MinesRound>(defaultRound);

  const [betAmount, setBetAmount] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [gridSize, setGridSize] = useState(5);
  const [clientSeedInput, setClientSeedInput] = useState('blackvault-client-seed');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoCashoutTarget, setAutoCashoutTarget] = useState(1.5);
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);

  const [sessionProfit, setSessionProfit] = useState(0);
  const [liveWin, setLiveWin] = useState<number | null>(null);

  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const autoBetTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const soundsRef = useRef<Partial<Record<SoundName, Howl>>>({});
  const soundTimerRef = useRef<NodeJS.Timeout[]>([]);
  const diamondStreakRef = useRef(0);
  const activeDiamondLayersRef = useRef(0);

  const risk = useMemo(() => calcRisk(mineCount, gridSize), [mineCount, gridSize]);

  const tileCount = gridSize * gridSize;
  const gridClass = useMemo(() => {
    if (gridSize === 3) return 'grid-cols-3';
    if (gridSize === 4) return 'grid-cols-4';
    if (gridSize === 5) return 'grid-cols-5';
    if (gridSize === 6) return 'grid-cols-6';
    return 'grid-cols-7';
  }, [gridSize]);
  const canStart = useMemo(() => {
    return !!user && !loading && round.status !== 'active' && mineCount < tileCount && betAmount > 0;
  }, [betAmount, loading, mineCount, round.status, tileCount, user]);

  const canCashout = round.status === 'active' && round.revealed.length > 0;

  const playSound = useCallback(
    (name: SoundName) => {
      if (muted) return;
      const sound = soundsRef.current[name];
      if (!sound) return;
      sound.volume(volume);
      sound.play();
    },
    [muted, volume]
  );

  const playDiamondLayeredSound = useCallback(() => {
    if (muted) return;
    const streakPitch = 1 + Math.min(0.24, diamondStreakRef.current * 0.03);

    const schedule = (fn: () => void, delayMs: number) => {
      const timer = setTimeout(fn, delayMs);
      soundTimerRef.current.push(timer);
    };

    schedule(() => {
      const tick = soundsRef.current.diamond_tick;
      if (!tick) return;
      tick.volume(0.3 * volume);
      const id = tick.play();
      tick.rate(streakPitch, id);
    }, 90);

    schedule(() => {
      if (activeDiamondLayersRef.current >= 3) return;
      activeDiamondLayersRef.current += 1;

      const chime = soundsRef.current.diamond_chime;
      if (!chime) {
        activeDiamondLayersRef.current = Math.max(0, activeDiamondLayersRef.current - 1);
        return;
      }

      chime.volume(0.45 * volume);
      const id = chime.play();
      chime.rate(streakPitch, id);
      chime.once('end', () => {
        activeDiamondLayersRef.current = Math.max(0, activeDiamondLayersRef.current - 1);
      });
    }, 110);

    schedule(() => {
      if (activeDiamondLayersRef.current >= 3) return;
      activeDiamondLayersRef.current += 1;

      const shimmer = soundsRef.current.diamond_shimmer;
      if (!shimmer) {
        activeDiamondLayersRef.current = Math.max(0, activeDiamondLayersRef.current - 1);
        return;
      }

      shimmer.volume(0.2 * volume);
      const id = shimmer.play();
      shimmer.rate(Math.max(0.85, streakPitch - 0.04), id);
      shimmer.fade(0.2 * volume, 0, 150, id);
      shimmer.once('end', () => {
        activeDiamondLayersRef.current = Math.max(0, activeDiamondLayersRef.current - 1);
      });
    }, 130);
  }, [muted, volume]);

  const stopAmbient = useCallback(() => {
    const ambient = soundsRef.current.background_ambient_loop;
    if (ambient) ambient.stop();
  }, []);

  const startAmbient = useCallback(() => {
    if (muted) return;
    const ambient = soundsRef.current.background_ambient_loop;
    if (!ambient) return;
    if (!ambient.playing()) {
      ambient.volume(Math.max(0.1, volume * 0.35));
      ambient.play();
    }
  }, [muted, volume]);

  useEffect(() => {
    Howler.volume(volume);
  }, [volume]);

  useEffect(() => {
    Howler.mute(muted);
  }, [muted]);

  useEffect(() => {
    soundsRef.current = {
      tile_click: new Howl({ src: ['/sounds/tile_click.wav'], volume: 0.5 }),
      diamond_tick: new Howl({ src: ['/sounds/diamond_tick.wav'], volume: 0.3 }),
      diamond_chime: new Howl({ src: ['/sounds/diamond_chime.wav'], volume: 0.45 }),
      diamond_shimmer: new Howl({ src: ['/sounds/diamond_shimmer.wav'], volume: 0.2 }),
      mine_hit: new Howl({ src: ['/sounds/mine_hit.wav'], volume: 0.6 }),
      cashout: new Howl({ src: ['/sounds/cashout.wav'], volume: 0.6 }),
      big_win: new Howl({ src: ['/sounds/big_win.wav'], volume: 0.7 }),
      background_ambient_loop: new Howl({
        src: ['/sounds/background_ambient_loop.mp3'],
        loop: true,
        volume: 0.2
      })
    };

    return () => {
      soundTimerRef.current.forEach((timer) => clearTimeout(timer));
      soundTimerRef.current = [];
      Object.values(soundsRef.current).forEach((sound) => sound?.unload());
      soundsRef.current = {};
    };
  }, []);

  const loadPublicState = useCallback(async () => {
    const data = await apiRequest<PublicState>('/api/public/state');
    setPublicState(data);
  }, []);

  const loadMe = useCallback(async () => {
    try {
      const data = await apiRequest<{ user: UserSession }>('/api/auth/me');
      setUser(data.user);
      setClientSeedInput(data.user.clientSeed || 'blackvault-client-seed');
      setRound((prev) => ({ ...prev, clientSeed: data.user.clientSeed || prev.clientSeed }));
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    void loadPublicState();
    void loadMe();
  }, [loadMe, loadPublicState]);

  useEffect(() => {
    if (round.status === 'active' && autoCashoutEnabled && round.multiplier >= autoCashoutTarget) {
      void handleCashout();
    }
  }, [autoCashoutEnabled, autoCashoutTarget, round.multiplier, round.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (canStart) void handleStartGame();
      }
      if (event.code === 'Space') {
        event.preventDefault();
        if (canCashout) void handleCashout();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [canCashout, canStart]);

  useEffect(() => {
    if (!autoBetEnabled || round.status === 'active' || !user) return;
    if (autoBetTimeoutRef.current) clearTimeout(autoBetTimeoutRef.current);

    autoBetTimeoutRef.current = setTimeout(() => {
      if (canStart) {
        void handleStartGame();
      }
    }, 800);

    return () => {
      if (autoBetTimeoutRef.current) clearTimeout(autoBetTimeoutRef.current);
    };
  }, [autoBetEnabled, canStart, round.status, user]);

  async function handleRegister() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: UserSession }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ username, email, password })
      });

      storeToken(data.token);
      setUser(data.user);
      setNotice('Account created and session started.');
      startAmbient();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to register');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const data = await apiRequest<{ token: string; user: UserSession }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identity, password })
      });

      storeToken(data.token);
      setUser(data.user);
      setClientSeedInput(data.user.clientSeed || clientSeedInput);
      setNotice('Welcome back to BlackVault Mines.');
      startAmbient();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to login');
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    clearToken();
    setUser(null);
    setRound(defaultRound);
    setNotice('Session ended.');
    stopAmbient();
    await fetch('/api/auth/me', { method: 'DELETE', credentials: 'include' });
  }

  async function handleStartGame() {
    if (!user) {
      setError('Login required to start a game.');
      return;
    }

    setLoading(true);
    setError('');
    setNotice('');

    try {
      const data = await apiRequest<StartResponse>('/api/mines/start', {
        method: 'POST',
        body: JSON.stringify({
          betAmount,
          mineCount,
          gridSize,
          clientSeed: clientSeedInput
        })
      });

      playSound('tile_click');
      startAmbient();
      diamondStreakRef.current = 0;

      setRound({
        gameId: data.gameId,
        status: 'active',
        betAmount: data.betAmount,
        mineCount: data.mineCount,
        gridSize: data.gridSize,
        revealed: data.revealedTiles,
        mines: [],
        multiplier: data.multiplier,
        potentialWin: Number((data.betAmount * data.multiplier).toFixed(2)),
        payout: 0,
        hashedServerSeed: data.hashedServerSeed,
        serverSeed: '',
        clientSeed: data.clientSeed,
        nonce: data.nonce
      });

      setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to start game');
    } finally {
      setLoading(false);
    }
  }

  async function handleReveal(tileIndex: number) {
    if (round.status !== 'active') return;
    if (round.revealed.includes(tileIndex)) return;

    setLoading(true);
    setError('');

    try {
      const data = await apiRequest<RevealResponse>('/api/mines/reveal', {
        method: 'POST',
        body: JSON.stringify({ gameId: round.gameId, tileIndex })
      });

      playSound('tile_click');

      if (data.status === 'active') {
        diamondStreakRef.current += 1;
        playDiamondLayeredSound();
      }

      if (data.status === 'lost') {
        diamondStreakRef.current = 0;
        const timer = setTimeout(() => {
          playSound('mine_hit');
        }, 90);
        soundTimerRef.current.push(timer);
      }

      if (data.status === 'won') {
        diamondStreakRef.current = 0;
        playSound('big_win');
      }

      setRound((prev) => ({
        ...prev,
        status: data.status,
        revealed: data.revealedTiles || [...prev.revealed, tileIndex],
        mines: data.minesPositions || prev.mines,
        multiplier: data.multiplier,
        potentialWin: Number(data.potentialWin ?? prev.betAmount * data.multiplier),
        payout: Number(data.payout || prev.payout),
        serverSeed: data.serverSeed || prev.serverSeed,
        hashedServerSeed: data.hashedServerSeed || prev.hashedServerSeed,
        clientSeed: data.clientSeed || prev.clientSeed,
        nonce: typeof data.nonce === 'number' ? data.nonce : prev.nonce
      }));

      if (typeof data.balance === 'number') {
        setUser((prev) => (prev ? { ...prev, balance: data.balance, totalWon: prev.totalWon + (data.payout || 0) } : prev));
      }

      if (data.status === 'lost') {
        setSessionProfit((prev) => Number((prev - round.betAmount).toFixed(2)));
      }

      if (data.status === 'won' && data.payout) {
        const net = Number((data.payout - round.betAmount).toFixed(2));
        setSessionProfit((prev) => Number((prev + net).toFixed(2)));
        setLiveWin(net);
        setTimeout(() => setLiveWin(null), 2200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to reveal tile');
    } finally {
      setLoading(false);
    }
  }

  async function handleCashout() {
    if (!canCashout) return;

    setLoading(true);
    setError('');

    try {
      const data = await apiRequest<CashoutResponse>('/api/mines/cashout', {
        method: 'POST',
        body: JSON.stringify({ gameId: round.gameId })
      });

      playSound('cashout');
      diamondStreakRef.current = 0;
      if (data.payout >= round.betAmount * 2) {
        playSound('big_win');
      }

      setRound((prev) => ({
        ...prev,
        status: 'cashed_out',
        payout: data.payout,
        mines: data.minesPositions,
        serverSeed: data.serverSeed,
        hashedServerSeed: data.hashedServerSeed,
        clientSeed: data.clientSeed,
        nonce: data.nonce
      }));

      setUser((prev) => (prev ? { ...prev, balance: data.balance, totalWon: prev.totalWon + data.payout } : prev));

      const net = Number((data.payout - round.betAmount).toFixed(2));
      setSessionProfit((prev) => Number((prev + net).toFixed(2)));
      setLiveWin(net);
      setTimeout(() => setLiveWin(null), 2200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cash out');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (!round.serverSeed || round.mines.length === 0) {
      setError('Verification is available after game completion.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await apiRequest<VerifyResponse>('/api/mines/verify', {
        method: 'POST',
        body: JSON.stringify({
          serverSeed: round.serverSeed,
          hashedServerSeed: round.hashedServerSeed,
          clientSeed: round.clientSeed,
          nonce: round.nonce,
          gridSize: round.gridSize,
          mineCount: round.mineCount,
          expectedMines: round.mines
        })
      });

      if (data.verified) {
        setNotice('Provably fair verification passed.');
      } else {
        setError('Verification failed for this round.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to verify round');
    } finally {
      setLoading(false);
    }
  }

  const potentialWin = round.status === 'active' ? round.potentialWin : round.payout;

  return (
    <section className="relative mx-auto flex w-full max-w-6xl flex-col gap-4 pb-10">
      {/* LIVE WIN POPUP */}
      <AnimatePresence>
        {liveWin !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            className="pointer-events-none fixed left-1/2 top-6 z-50 -translate-x-1/2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 shadow-glow"
          >
            {liveWin >= 0 ? `+${formatMoney(liveWin)}` : formatMoney(liveWin)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className="rounded-2xl border border-slate-700/80 bg-slate-900/70 p-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-slate-100">BlackVault Mines</h1>
            <p className="text-sm text-slate-400">Provably fair game engine with 1% default house edge.</p>
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
              <span>Mute</span>
              <input type="checkbox" checked={muted} onChange={(e) => setMuted(e.target.checked)} className="accent-emerald-500" />
            </label>
            <label className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs text-slate-300">
              <span>Vol</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 accent-emerald-500"
              />
            </label>
            {(user?.role === 'admin' || user?.role === 'owner') && (
              <Link href="/admin/mines" className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Admin Panel
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* AUTH */}
      {!user && (
        <section className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <div className="mb-3 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`rounded-lg px-3 py-2 text-sm ${authMode === 'login' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`rounded-lg px-3 py-2 text-sm ${authMode === 'register' ? 'bg-slate-700 text-white' : 'bg-slate-800 text-slate-300'}`}
            >
              Register
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {authMode === 'register' && (
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Username"
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
              />
            )}
            <input
              value={authMode === 'login' ? identity : email}
              onChange={(e) => (authMode === 'login' ? setIdentity(e.target.value) : setEmail(e.target.value))}
              placeholder={authMode === 'login' ? 'Username or Email' : 'Email'}
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            />
            <button
              type="button"
              onClick={authMode === 'login' ? handleLogin : handleRegister}
              disabled={loading}
              className="rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? 'Please wait...' : authMode === 'login' ? 'Login' : 'Create Account'}
            </button>
          </div>
        </section>
      )}

      {/* SESSION BAR */}
      {user && (
        <section className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 p-4 md:grid-cols-6">
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Player</p>
            <p className="text-sm font-medium text-slate-100">{user.username}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Balance</p>
            <p className="text-sm font-semibold text-emerald-300">{formatMoney(user.balance)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Session P/L</p>
            <p className={`text-sm font-semibold ${sessionProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatMoney(sessionProfit)}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Risk</p>
            <p className="text-sm font-medium text-slate-200" title="Risk is based on mine ratio to total tiles.">{risk}</p>
          </div>
          <div className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">House Edge</p>
            <p className="text-sm font-medium text-slate-200">{(publicState.houseEdge * 100).toFixed(2)}%</p>
          </div>
          <button
            type="button"
            onClick={() => void handleLogout()}
            className="rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-slate-300 transition hover:border-rose-400/60 hover:text-rose-300"
          >
            Logout
          </button>
        </section>
      )}

      {/* GAME CONTROLS */}
      <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
        <div className="grid gap-3 md:grid-cols-8">
          <label className="md:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Bet</span>
            <input
              type="number"
              min={1}
              step="0.01"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Mines</span>
            <input
              type="number"
              min={1}
              max={24}
              value={mineCount}
              onChange={(e) => setMineCount(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            />
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Grid Size</span>
            <select
              value={gridSize}
              onChange={(e) => setGridSize(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            >
              {[3, 4, 5, 6, 7].map((size) => (
                <option key={size} value={size}>
                  {size}x{size}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => void handleStartGame()}
            disabled={!canStart}
            className="md:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading && round.status !== 'active' ? 'Starting...' : 'Start Game'}
          </button>

          <label className="md:col-span-4">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Client Seed</span>
            <input
              value={clientSeedInput}
              onChange={(e) => setClientSeedInput(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            />
          </label>

          <label className="flex items-center gap-2 md:col-span-2 md:justify-center">
            <input
              type="checkbox"
              checked={autoCashoutEnabled}
              onChange={(e) => setAutoCashoutEnabled(e.target.checked)}
              className="accent-emerald-500"
            />
            <span className="text-xs text-slate-300">Auto Cashout</span>
          </label>

          <label className="md:col-span-2">
            <span className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Target x</span>
            <input
              type="number"
              min={1.01}
              step="0.01"
              value={autoCashoutTarget}
              onChange={(e) => setAutoCashoutTarget(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm outline-none ring-emerald-500 focus:ring"
            />
          </label>

          <label className="flex items-center gap-2 md:col-span-2 md:justify-center">
            <input
              type="checkbox"
              checked={autoBetEnabled}
              onChange={(e) => setAutoBetEnabled(e.target.checked)}
              className="accent-emerald-500"
            />
            <span className="text-xs text-slate-300">Auto Bet</span>
          </label>
        </div>
      </section>

      {/* GRID */}
      <section className="rounded-2xl border border-slate-700 bg-slate-900/50 p-4">
        <motion.div
          layout
          className={`mx-auto grid max-w-[560px] gap-2 ${gridClass}`}
        >
          {Array.from({ length: tileCount }, (_, tileIndex) => {
            const isRevealed = round.revealed.includes(tileIndex);
            const isMine = round.mines.includes(tileIndex);
            const showDiamond = isRevealed && !isMine;

            return (
              <motion.button
                key={tileIndex}
                type="button"
                onClick={() => void handleReveal(tileIndex)}
                disabled={round.status !== 'active' || isRevealed || loading}
                className={`group relative h-16 rounded-xl border text-sm transition [transform-style:preserve-3d] md:h-20 ${
                  isRevealed
                    ? isMine
                      ? 'border-rose-500/40 bg-rose-500/20 shadow-danger'
                      : 'border-emerald-500/30 bg-emerald-500/10 shadow-glow'
                    : 'border-slate-700 bg-slate-950/70 hover:border-slate-500'
                } disabled:cursor-not-allowed`}
                initial={false}
                animate={{ rotateY: isRevealed ? 180 : 0 }}
                transition={{ duration: 0.26, ease: 'easeOut' }}
              >
                <span className={`absolute inset-0 flex items-center justify-center [backface-visibility:hidden] ${isRevealed ? 'opacity-0' : 'opacity-100'}`}>
                  <span className="h-2 w-2 rounded-full bg-slate-600 transition group-hover:bg-slate-400" />
                </span>
                <span className="absolute inset-0 flex items-center justify-center [backface-visibility:hidden] [transform:rotateY(180deg)]">
                  {isMine ? (
                    <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                      <MineIcon />
                    </motion.span>
                  ) : showDiamond ? (
                    <motion.span animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1.8 }}>
                      <DiamondIcon />
                    </motion.span>
                  ) : null}
                </span>
              </motion.button>
            );
          })}
        </motion.div>
      </section>

      {/* STATS + ACTIONS */}
      <section className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Multiplier</p>
          <motion.p key={round.multiplier} initial={{ opacity: 0.3 }} animate={{ opacity: 1 }} className="text-lg font-semibold text-emerald-300">
            {round.multiplier.toFixed(4)}x
          </motion.p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Potential Win</p>
          <p className="text-lg font-semibold text-slate-100">{formatMoney(potentialWin)}</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-950/70 px-3 py-2 md:col-span-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Provably Fair</p>
          <p className="truncate text-xs text-slate-300">Hash: {round.hashedServerSeed || '-'}</p>
          <p className="truncate text-xs text-slate-300">Client Seed: {round.clientSeed || '-'}</p>
          <p className="truncate text-xs text-slate-300">Nonce: {round.nonce}</p>
        </div>

        <button
          type="button"
          onClick={() => void handleCashout()}
          disabled={!canCashout || loading}
          className="md:col-span-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-3 text-sm font-semibold text-emerald-300 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading && canCashout ? 'Processing...' : 'Cash Out'}
        </button>

        <button
          type="button"
          onClick={() => void handleVerify()}
          disabled={!round.serverSeed || round.mines.length === 0 || loading}
          className="md:col-span-2 rounded-xl border border-slate-600 bg-slate-800/70 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Verify Round
        </button>
      </section>

      {/* LOSS STATE */}
      <AnimatePresence>
        {round.status === 'lost' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200"
          >
            Mine hit. Round lost.
          </motion.div>
        )}
      </AnimatePresence>

      {/* PLATFORM INFO */}
      <section className="grid gap-3 rounded-2xl border border-slate-700 bg-slate-900/50 p-4 md:grid-cols-2">
        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Platform State</p>
          <p className="text-sm text-slate-200">Site Online: {publicState.siteOnline ? 'Yes' : 'No'}</p>
          <p className="text-sm text-slate-200">Active Mines Games: {publicState.activeMinesGames}</p>
          <button
            type="button"
            onClick={() => void loadPublicState()}
            className="mt-3 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
          >
            Refresh State
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wide text-slate-500">Top Winners</p>
          <ul className="space-y-1 text-sm text-slate-300">
            {publicState.topWinners.length === 0 && <li>No winner data yet.</li>}
            {publicState.topWinners.map((entry) => (
              <li key={entry.username} className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-950/50 px-2 py-1.5">
                <span>{entry.username}</span>
                <span className="text-emerald-300">{formatMoney(entry.totalWon)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {error && <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {notice && <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{notice}</p>}
    </section>
  );
}
