'use client';

import { motion } from 'framer-motion';
import { useMemo } from 'react';

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

export function VIPPanel({
  vip,
  onClaim,
  claiming
}: {
  vip: VipState;
  onClaim: () => Promise<void>;
  claiming: boolean;
}) {
  const progressValue = useMemo(() => Math.max(0, Math.min(100, vip.percentToNext)), [vip.percentToNext]);

  return (
    <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
      <header className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">VIP</p>
          <h2 className="text-lg font-semibold text-slate-100">{vip.tier}</h2>
        </div>
        <div className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs text-amber-200">
          Points {vip.vipPoints.toLocaleString()}
        </div>
      </header>

      <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-800">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progressValue}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="h-full bg-emerald-500"
        />
      </div>

      <p className="text-xs text-slate-400">
        {vip.nextTier ? `${vip.pointsToNext.toLocaleString()} points to ${vip.nextTier}` : 'Maximum tier reached'}
      </p>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <p className="text-slate-300">Rakeback: {(vip.rakebackRate * 100).toFixed(2)}%</p>
        <p className="text-slate-300">Weekly: x{vip.weeklyBonusMultiplier.toFixed(2)}</p>
        <p className="text-slate-300">Withdraw: {vip.withdrawalPriority}</p>
        <p className="text-slate-300">Rain: {vip.rainAccess ? 'Enabled' : 'Locked'}</p>
      </div>

      <button
        type="button"
        onClick={() => void onClaim()}
        disabled={claiming || vip.rakebackBalance <= 0}
        className="mt-4 w-full rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-2 text-sm font-semibold text-emerald-300 disabled:opacity-50"
      >
        {claiming ? 'Claiming...' : `Claim Rakeback $${vip.rakebackBalance.toFixed(2)}`}
      </button>
    </section>
  );
}
