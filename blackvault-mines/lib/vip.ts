export type VipTier = 'Bronze' | 'Silver' | 'Gold' | 'Platinum' | 'Diamond' | 'Elite';

export type VipTierConfig = {
  tier: VipTier;
  minPoints: number;
  rakebackRate: number;
  weeklyBonusMultiplier: number;
  withdrawalPriority: 'standard' | 'priority';
  rainAccess: boolean;
};

export const VIP_TIERS: VipTierConfig[] = [
  { tier: 'Bronze', minPoints: 0, rakebackRate: 0.005, weeklyBonusMultiplier: 1, withdrawalPriority: 'standard', rainAccess: false },
  { tier: 'Silver', minPoints: 10_000, rakebackRate: 0.0075, weeklyBonusMultiplier: 1.05, withdrawalPriority: 'standard', rainAccess: false },
  { tier: 'Gold', minPoints: 50_000, rakebackRate: 0.01, weeklyBonusMultiplier: 1.1, withdrawalPriority: 'priority', rainAccess: true },
  { tier: 'Platinum', minPoints: 150_000, rakebackRate: 0.0125, weeklyBonusMultiplier: 1.15, withdrawalPriority: 'priority', rainAccess: true },
  { tier: 'Diamond', minPoints: 500_000, rakebackRate: 0.015, weeklyBonusMultiplier: 1.25, withdrawalPriority: 'priority', rainAccess: true },
  { tier: 'Elite', minPoints: 1_000_000, rakebackRate: 0.02, weeklyBonusMultiplier: 1.4, withdrawalPriority: 'priority', rainAccess: true }
];

export function resolveVipTier(points: number): VipTierConfig {
  const normalized = Number.isFinite(points) ? points : 0;
  let selected = VIP_TIERS[0];

  for (const tier of VIP_TIERS) {
    if (normalized >= tier.minPoints) selected = tier;
  }

  return selected;
}

export function nextVipTier(points: number): VipTierConfig | null {
  const normalized = Number.isFinite(points) ? points : 0;
  return VIP_TIERS.find((tier) => tier.minPoints > normalized) || null;
}

export function vipProgress(points: number) {
  const current = resolveVipTier(points);
  const next = nextVipTier(points);

  if (!next) {
    return {
      current,
      next: null,
      pointsInTier: Math.max(0, points - current.minPoints),
      pointsToNext: 0,
      percentToNext: 100
    };
  }

  const tierSpan = next.minPoints - current.minPoints;
  const pointsInTier = Math.max(0, points - current.minPoints);
  const percentToNext = tierSpan <= 0 ? 100 : Math.max(0, Math.min(100, (pointsInTier / tierSpan) * 100));

  return {
    current,
    next,
    pointsInTier,
    pointsToNext: Math.max(0, next.minPoints - points),
    percentToNext
  };
}

export function vipUpdateFromWager(currentPoints: number, wagerAmount: number) {
  const nextPoints = Number((currentPoints + wagerAmount).toFixed(2));
  const progress = vipProgress(nextPoints);

  return {
    nextPoints,
    tier: progress.current.tier,
    levelProgress: Number(progress.percentToNext.toFixed(4)),
    rakebackRate: progress.current.rakebackRate,
    rakebackAccrual: Number((wagerAmount * progress.current.rakebackRate).toFixed(4)),
    progress
  };
}
