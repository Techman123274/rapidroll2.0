import mongoose from 'mongoose';
import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireRole } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { MinesGameModel } from '@/models/MinesGame';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';

export async function POST(_request: Request, { params }: { params: { gameId: string } }) {
  try {
    await connectDb();
    const actor = await requireSession();
    requireRole(actor, ['admin', 'owner']);

    const dbSession = await mongoose.startSession();
    let result: Record<string, unknown> = {};

    await dbSession.withTransaction(async () => {
      const game = await MinesGameModel.findById(params.gameId).session(dbSession);
      if (!game) throw new Error('GAME_NOT_FOUND');
      if (game.status !== 'active') throw new Error('GAME_NOT_ACTIVE');

      game.status = 'forced_end';
      game.payout = 0;
      await game.save({ session: dbSession });

      // Refund original bet on force end for audit-safe closure.
      const updatedUser = await UserModel.findByIdAndUpdate(
        game.userId,
        { $inc: { balance: game.betAmount } },
        { new: true, session: dbSession }
      );

      result = {
        gameId: String(game._id),
        status: game.status,
        refunded: Number(game.betAmount),
        userBalance: Number(updatedUser?.balance ?? 0)
      };

      await writeAudit({
        action: 'admin.game.force_end',
        actor: actor.username,
        actorRole: actor.role,
        target: String(game._id),
        meta: { refund: game.betAmount }
      });
    });

    dbSession.endSession();
    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    if (error instanceof Error && error.message === 'GAME_NOT_FOUND') return fail('Game not found', 404);
    if (error instanceof Error && error.message === 'GAME_NOT_ACTIVE') return fail('Game is not active', 409);
    return fail('Unable to force end game', 500);
  }
}
