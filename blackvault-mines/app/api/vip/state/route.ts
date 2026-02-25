import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { vipProgress } from '@/lib/vip';

export async function GET() {
  try {
    const user = await requireSession();
    const progress = vipProgress(Number(user.vipPoints || 0));

    return ok({
      tier: progress.current.tier,
      vipPoints: Number(user.vipPoints || 0),
      levelProgress: Number(user.levelProgress || progress.percentToNext),
      rakebackBalance: Number(user.rakebackBalance || 0),
      rakebackRate: progress.current.rakebackRate,
      weeklyBonusMultiplier: progress.current.weeklyBonusMultiplier,
      withdrawalPriority: progress.current.withdrawalPriority,
      rainAccess: progress.current.rainAccess,
      nextTier: progress.next?.tier || null,
      pointsToNext: progress.pointsToNext,
      percentToNext: progress.percentToNext
    });
  } catch {
    return fail('Unauthorized', 401);
  }
}
