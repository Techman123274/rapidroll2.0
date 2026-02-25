import mongoose from 'mongoose';
import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { TransactionModel } from '@/models/Transaction';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';

export async function POST() {
  try {
    await connectDb();
    const user = await requireSession();
    enforceRateLimit(`vip:claim:${user.id}`, 6, 60_000);

    const dbSession = await mongoose.startSession();
    let payload: Record<string, unknown> | null = null;

    await dbSession.withTransaction(async () => {
      const current = await UserModel.findById(user.id).session(dbSession);
      if (!current) throw new Error('UNAUTHORIZED');

      const claimable = Number(current.rakebackBalance || 0);
      if (claimable <= 0) throw new Error('NOTHING_TO_CLAIM');

      const updated = await UserModel.findByIdAndUpdate(
        user.id,
        {
          $inc: {
            balance: claimable,
            totalWon: claimable
          },
          $set: {
            rakebackBalance: 0
          }
        },
        { new: true, session: dbSession }
      );

      await TransactionModel.create(
        [
          {
            userId: user.id,
            amount: claimable,
            type: 'rakeback_claim',
            gameType: 'vip'
          }
        ],
        { session: dbSession }
      );

      await writeAudit({
        action: 'vip.claim_rakeback',
        actor: user.username,
        actorRole: user.role,
        target: String(user._id),
        meta: { claimable }
      });

      payload = {
        claimed: claimable,
        balance: Number(updated?.balance || 0),
        rakebackBalance: Number(updated?.rakebackBalance || 0)
      };
    });

    dbSession.endSession();
    return ok(payload);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'RATE_LIMITED') return fail('Too many requests', 429);
    if (error instanceof Error && error.message === 'NOTHING_TO_CLAIM') return fail('No rakeback available', 400);
    return fail('Unable to claim rakeback', 500);
  }
}
