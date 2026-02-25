import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { requireSession } from '@/lib/auth';
import { calculatePotentialWin } from '@/lib/minesMath';
import { MinesGameModel } from '@/models/MinesGame';
import { TransactionModel } from '@/models/Transaction';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  gameId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    await connectDb();
    const user = await requireSession();

    enforceRateLimit(`mines:cashout:${user.id}`, 10, 10_000);

    const { gameId } = bodySchema.parse(await request.json());

    const dbSession = await mongoose.startSession();
    let response: Record<string, unknown> | null = null;

    await dbSession.withTransaction(async () => {
      const game = await MinesGameModel.findOne({
        _id: gameId,
        userId: user.id,
        status: 'active'
      }).session(dbSession);

      if (!game) {
        throw new Error('GAME_NOT_ACTIVE');
      }

      if (game.revealedTiles.length === 0) {
        throw new Error('NO_REVEALED_TILES');
      }

      const payout = calculatePotentialWin(game.betAmount, game.multiplier);
      game.status = 'cashed_out';
      game.payout = payout;
      await game.save({ session: dbSession });

      const updatedUser = await UserModel.findByIdAndUpdate(
        user.id,
        {
          $inc: {
            balance: payout,
            totalWon: payout
          }
        },
        { new: true, session: dbSession }
      );

      await TransactionModel.create(
        [
          {
            userId: user.id,
            amount: payout,
            type: 'payout',
            gameId: game._id,
            gameType: 'mines'
          }
        ],
        { session: dbSession }
      );

      await writeAudit({
        action: 'mines.cashout',
        actor: user.username,
        actorRole: user.role,
        target: String(game._id),
        meta: { payout, multiplier: game.multiplier }
      });

      response = {
        gameId: String(game._id),
        status: game.status,
        payout,
        multiplier: game.multiplier,
        balance: Number(updatedUser?.balance ?? 0),
        minesPositions: game.minesPositions,
        serverSeed: game.serverSeed,
        hashedServerSeed: game.hashedServerSeed,
        clientSeed: game.clientSeed,
        nonce: game.nonce
      };
    });

    dbSession.endSession();
    return ok(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'RATE_LIMITED') return fail('Too many requests', 429);
    if (error instanceof Error && error.message === 'GAME_NOT_ACTIVE') return fail('Game is not active', 409);
    if (error instanceof Error && error.message === 'NO_REVEALED_TILES') {
      return fail('Reveal at least one tile before cashout', 400);
    }
    if (error instanceof z.ZodError) return fail(error.errors[0]?.message || 'Invalid request', 400);
    return fail('Unable to cash out game', 500);
  }
}
