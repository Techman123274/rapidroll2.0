'use client';

import { motion } from 'framer-motion';
import { Howl } from 'howler';
import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '@/src/lib/api';
import { VIPPanel } from '@/src/components/VIPPanel';

type User = {
  id: string;
  username: string;
  role: 'player' | 'admin' | 'owner';
  balance: number;
};

type VipState = {
  tier: string;
  vipPoints: number;
  levelProgress: number;
  rakebackBalance: number;
  rakebackRate: number;
  weeklyBonusMultiplier: number;
  withdrawalPriority: string;
  rainAccess: boolean;
  nextTier: string | null;
  pointsToNext: number;
  percentToNext: number;
};

type RollResponse = {
  gameId: string;
  status: 'won' | 'lost';
  roll: number;
  didWin: boolean;
  target: number;
  isOver: boolean;
  winChance: number;
  multiplier: number;
  payout: number;
  balance: number;
  hashedServerSeed: string;
  clientSeed: string;
  nonce: number;
};

const defaultVip: VipState = {
  tier: 'Bronze',
  vipPoints: 0,
  levelProgress: 0,
  rakebackBalance: 0,
  rakebackRate: 0.005,
  weeklyBonusMultiplier: 1,
  withdrawalPriority: 'standard',
  rainAccess: false,
  nextTier: 'Silver',
  pointsToNext: 10_000,
  percentToNext: 0
};

const houseEdge = 0.01;

function calculateWinChance(target: number, isOver: boolean) {
  return isOver ? 100 - target : target;
}

function calculateMultiplier(winChance: number) {
  return (100 / winChance) * (1 - houseEdge);
}

export function DiceRush() {
  const [user, setUser] = useState<User | null>(null);
  const [vip, setVip] = useState<VipState>(defaultVip);
  const [betAmount, setBetAmount] = useState(5);
  const [target, setTarget] = useState(50);
  const [isOver, setIsOver] = useState(false);
  const [rolling, setRolling] = useState(false);
  const [displayRoll, setDisplayRoll] = useState(0);
  const [result, setResult] = useState<RollResponse | null>(null);
  const [error, setError] = useState('');
  const [claiming, setClaiming] = useState(false);

  const winChance = useMemo(() => calculateWinChance(target, isOver), [target, isOver]);
  const multiplier = useMemo(() => calculateMultiplier(winChance), [winChance]);
  const profitOnWin = useMemo(() => Math.max(0, betAmount * multiplier - betAmount), [betAmount, multiplier]);

  const spinRaf = useRef(0);
  const soundsRef = useRef<{ win?: Howl; lose?: Howl }>({});

  useEffect(() => {
    soundsRef.current = {
      win: new Howl({ src: ['/sounds/cashout_rise.wav'], volume: 0.45 }),
      lose: new Howl({ src: ['/sounds/mine_hit.wav'], volume: 0.28 })
    };

    return () => {
      window.cancelAnimationFrame(spinRaf.current);
      soundsRef.current.win?.unload();
      soundsRef.current.lose?.unload();
    };
  }, []);

  useEffect(() => {
    async function bootstrap() {
      try {
        const me = await apiRequest<{ user: User }>('/api/auth/me');
        setUser(me.user);
      } catch {
        setUser(null);
      }

      try {
        const vipState = await apiRequest<VipState>('/api/vip/state');
        setVip(vipState);
      } catch {
        setVip(defaultVip);
      }
    }

    void bootstrap();
  }, []);

  async function refreshVip() {
    try {
      const vipState = await apiRequest<VipState>('/api/vip/state');
      setVip(vipState);
    } catch {
      // Ignore.
    }
  }

  async function claimRakeback() {
    setClaiming(true);
    try {
      const data = await apiRequest<{ balance: number; rakebackBalance: number }>('/api/vip/claim-rakeback', {
        method: 'POST'
      });
      setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
      setVip((prev) => ({ ...prev, rakebackBalance: data.rakebackBalance }));
      await refreshVip();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to claim rakeback');
    } finally {
      setClaiming(false);
    }
  }

  function animateRoll(finalRoll: number) {
    const start = performance.now();
    const duration = 400;

    const run = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - progress) ** 2;
      const spinValue = progress < 1 ? Math.random() * 100 : finalRoll;
      const blended = progress < 1 ? spinValue : finalRoll * eased + finalRoll * (1 - eased);
      setDisplayRoll(Number(blended.toFixed(2)));
      if (progress < 1) spinRaf.current = window.requestAnimationFrame(run);
    };

    window.cancelAnimationFrame(spinRaf.current);
    spinRaf.current = window.requestAnimationFrame(run);
  }

  async function rollDice() {
    if (!user || rolling) return;

    setRolling(true);
    setError('');
    setResult(null);

    try {
      const data = await apiRequest<RollResponse>('/api/dice/roll', {
        method: 'POST',
        body: JSON.stringify({
          betAmount,
          target,
          isOver
        })
      });

      animateRoll(data.roll);
      setResult(data);
      setUser((prev) => (prev ? { ...prev, balance: data.balance } : prev));
      await refreshVip();

      if (data.didWin) {
        soundsRef.current.win?.play();
      } else {
        soundsRef.current.lose?.play();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Roll failed');
    } finally {
      setRolling(false);
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-4 p-4 lg:grid-cols-[1fr_320px]">
      <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
        <header className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-100">Dice Rush</h1>
            <p className="text-sm text-slate-400">Provably fair roll engine with 1% house edge.</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-400">Balance</p>
            <p className="text-lg font-semibold text-emerald-300">${user?.balance.toFixed(2) || '0.00'}</p>
          </div>
        </header>

        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <input
            type="range"
            min={2}
            max={98}
            step={0.01}
            value={target}
            onChange={(event) => setTarget(Number(event.target.value))}
            className="w-full accent-emerald-500"
          />
          <div className="mt-2 flex items-center justify-between text-sm text-slate-300">
            <span>2</span>
            <span>{target.toFixed(2)}</span>
            <span>98</span>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Bet
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={betAmount}
              onChange={(event) => setBetAmount(Number(event.target.value) || 0)}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"
            />
          </label>

          <label className="text-sm text-slate-300">
            Direction
            <select
              value={isOver ? 'over' : 'under'}
              onChange={(event) => setIsOver(event.target.value === 'over')}
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2"
            >
              <option value="under">Roll Under</option>
              <option value="over">Roll Over</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-2 rounded-xl border border-slate-700 bg-slate-950/50 p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-400">Multiplier</p>
            <p className="text-lg font-semibold text-emerald-300">{multiplier.toFixed(4)}x</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Win Chance</p>
            <p className="text-lg font-semibold text-slate-100">{winChance.toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-slate-400">Profit on Win</p>
            <p className="text-lg font-semibold text-slate-100">${profitOnWin.toFixed(2)}</p>
          </div>
        </div>

        <motion.button
          type="button"
          whileTap={{ scale: 0.97 }}
          onClick={() => void rollDice()}
          disabled={rolling || !user}
          className={`mt-4 h-12 w-full rounded-xl text-sm font-semibold transition ${
            !user || rolling
              ? 'border border-slate-700 bg-slate-800 text-slate-400'
              : 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
          }`}
        >
          {rolling ? 'Rolling...' : 'Roll Dice'}
        </motion.button>

        <div
          className={`mt-4 rounded-xl border p-4 ${
            result?.didWin
              ? 'border-emerald-500/40 bg-emerald-500/10'
              : result
                ? 'border-rose-500/40 bg-rose-500/10'
                : 'border-slate-700 bg-slate-950/60'
          }`}
        >
          <p className="text-xs uppercase tracking-wide text-slate-400">Result</p>
          <p className="text-3xl font-semibold text-slate-100">{displayRoll.toFixed(2)}</p>
          {result && (
            <p className="mt-1 text-sm text-slate-300">
              {result.didWin ? `Win +$${result.payout.toFixed(2)}` : 'Loss'} | Nonce {result.nonce}
            </p>
          )}
        </div>

        {error && <p className="mt-3 text-sm text-rose-300">{error}</p>}
      </div>

      <VIPPanel vip={vip} onClaim={claimRakeback} claiming={claiming} />
    </section>
  );
}
