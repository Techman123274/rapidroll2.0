import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { requireSession } from '@/lib/auth';
import { calculateMultiplier, calculatePotentialWin } from '@/lib/minesMath';
import { MinesGameModel } from '@/models/MinesGame';
import { PlatformSettingModel } from '@/models/PlatformSetting';
import { TransactionModel } from '@/models/Transaction';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  gameId: z.string().min(1),
  tileIndex: z.number().int().min(0)
});

export async function POST(request: Request) {
  try {
    await connectDb();
    const user = await requireSession();

    enforceRateLimit(`mines:reveal:${user.id}`, 20, 10_000);

    const { gameId, tileIndex } = bodySchema.parse(await request.json());

    const [edgeSetting, siteSetting] = await Promise.all([
      PlatformSettingModel.findOne({ key: 'house_edge' }),
      PlatformSettingModel.findOne({ key: 'site_online' })
    ]);

    const houseEdge = Number(edgeSetting?.value ?? 0.01);

    if (siteSetting && siteSetting.value === false) {
      return fail('Site is currently in maintenance mode', 503);
    }

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

      const tileCount = game.gridSize * game.gridSize;
      if (tileIndex >= tileCount) {
        throw new Error('INVALID_TILE');
      }
      if (game.revealedTiles.includes(tileIndex)) {
        throw new Error('TILE_ALREADY_REVEALED');
      }

      const hitMine = game.minesPositions.includes(tileIndex);
      game.revealedTiles.push(tileIndex);

      if (hitMine) {
        game.status = 'lost';
        game.payout = 0;
        await game.save({ session: dbSession });

        await writeAudit({
          action: 'mines.reveal.mine_hit',
          actor: user.username,
          actorRole: user.role,
          target: String(game._id),
          meta: { tileIndex }
        });

        response = {
          gameId: String(game._id),
          status: 'lost',
          tileIndex,
          hitMine: true,
          minesPositions: game.minesPositions,
          serverSeed: game.serverSeed,
          hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed,
          nonce: game.nonce,
          multiplier: game.multiplier,
          payout: 0
        };
        return;
      }

      const safeRevealed = game.revealedTiles.length;
      game.multiplier = calculateMultiplier({
        gridSize: game.gridSize,
        mineCount: game.mineCount,
        revealedTiles: safeRevealed,
        houseEdge
      });

      const safeTarget = game.gridSize * game.gridSize - game.mineCount;
      const reachedAllSafeTiles = safeRevealed >= safeTarget;

      if (reachedAllSafeTiles) {
        const payout = calculatePotentialWin(game.betAmount, game.multiplier);
        game.status = 'won';
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
          action: 'mines.reveal.auto_win',
          actor: user.username,
          actorRole: user.role,
          target: String(game._id),
          meta: { tileIndex, payout }
        });

        response = {
          gameId: String(game._id),
          status: 'won',
          tileIndex,
          hitMine: false,
          revealedTiles: game.revealedTiles,
          minesPositions: game.minesPositions,
          serverSeed: game.serverSeed,
          hashedServerSeed: game.hashedServerSeed,
          clientSeed: game.clientSeed,
          nonce: game.nonce,
          multiplier: game.multiplier,
          payout,
          balance: Number(updatedUser?.balance ?? 0)
        };
        return;
      }

      await game.save({ session: dbSession });

      await writeAudit({
        action: 'mines.reveal.safe',
        actor: user.username,
        actorRole: user.role,
        target: String(game._id),
        meta: { tileIndex, revealedCount: safeRevealed }
      });

      response = {
        gameId: String(game._id),
        status: 'active',
        tileIndex,
        hitMine: false,
        revealedTiles: game.revealedTiles,
        multiplier: game.multiplier,
        potentialWin: calculatePotentialWin(game.betAmount, game.multiplier)
      };
    });

    dbSession.endSession();
    return ok(response);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'RATE_LIMITED') return fail('Too many requests', 429);
    if (error instanceof Error && error.message === 'GAME_NOT_ACTIVE') return fail('Game is not active', 409);
    if (error instanceof Error && error.message === 'INVALID_TILE') return fail('Invalid tile index', 400);
    if (error instanceof Error && error.message === 'TILE_ALREADY_REVEALED') return fail('Tile already revealed', 409);
    if (error instanceof z.ZodError) return fail(error.errors[0]?.message || 'Invalid request', 400);
    return fail('Unable to reveal tile', 500);
  }
}
