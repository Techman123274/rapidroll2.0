import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { requireSession } from '@/lib/auth';
import { calculateMultiplier } from '@/lib/minesMath';
import { generateMinesPositions, generateServerSeed, hashServerSeed } from '@/lib/provablyFair';
import { MinesGameModel } from '@/models/MinesGame';
import { PlatformSettingModel } from '@/models/PlatformSetting';
import { TransactionModel } from '@/models/Transaction';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';
import { vipUpdateFromWager } from '@/lib/vip';

const bodySchema = z.object({
  betAmount: z.number().positive(),
  mineCount: z.number().int().min(1).max(24),
  gridSize: z.number().int().min(3).max(7),
  clientSeed: z.string().min(3).max(128).optional()
});

export async function POST(request: Request) {
  try {
    await connectDb();
    const user = await requireSession();

    enforceRateLimit(`mines:start:${user.id}`, 8, 10_000);

    if (user.minesBanned) {
      return fail('User is banned from mines', 403);
    }

    const body = bodySchema.parse(await request.json());
    const tileCount = body.gridSize * body.gridSize;
    if (body.mineCount >= tileCount) {
      return fail('mineCount must be less than total tiles', 400);
    }

    const [siteSetting, edgeSetting] = await Promise.all([
      PlatformSettingModel.findOne({ key: 'site_online' }),
      PlatformSettingModel.findOne({ key: 'house_edge' })
    ]);

    if (siteSetting && siteSetting.value === false) {
      return fail('Site is currently in maintenance mode', 503);
    }

    const houseEdge = Number(edgeSetting?.value ?? 0.01);

    const dbSession = await mongoose.startSession();
    let payload: Record<string, unknown> = {};

    await dbSession.withTransaction(async () => {
      const currentUser = await UserModel.findOne({
        _id: user.id,
        minesBanned: { $ne: true }
      }).session(dbSession);

      if (!currentUser) {
        throw new Error('INSUFFICIENT_BALANCE');
      }
      if (Number(currentUser.balance) < body.betAmount) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const vipStats = vipUpdateFromWager(Number(currentUser.vipPoints || 0), body.betAmount);

      const setPayload: Record<string, unknown> = {
        vipTier: vipStats.tier,
        levelProgress: vipStats.levelProgress
      };
      if (body.clientSeed) setPayload.clientSeed = body.clientSeed;

      const lockedUser = await UserModel.findOneAndUpdate(
        {
          _id: user.id,
          balance: { $gte: body.betAmount },
          minesBanned: { $ne: true }
        },
        {
          $inc: {
            balance: -body.betAmount,
            totalWagered: body.betAmount,
            nonce: 1,
            vipPoints: body.betAmount,
            rakebackBalance: vipStats.rakebackAccrual
          },
          $set: setPayload
        },
        { new: true, session: dbSession }
      );

      if (!lockedUser) {
        throw new Error('INSUFFICIENT_BALANCE');
      }

      const serverSeed = generateServerSeed();
      const hashedServerSeed = hashServerSeed(serverSeed);
      const clientSeed = body.clientSeed || lockedUser.clientSeed;
      const nonce = lockedUser.nonce;

      const minesPositions = generateMinesPositions({
        gridSize: body.gridSize,
        mineCount: body.mineCount,
        serverSeed,
        clientSeed,
        nonce
      });

      const game = await MinesGameModel.create(
        [
          {
            userId: lockedUser._id,
            betAmount: body.betAmount,
            mineCount: body.mineCount,
            gridSize: body.gridSize,
            revealedTiles: [],
            minesPositions,
            multiplier: calculateMultiplier({
              gridSize: body.gridSize,
              mineCount: body.mineCount,
              revealedTiles: 0,
              houseEdge
            }),
            payout: 0,
            status: 'active',
            serverSeed,
            hashedServerSeed,
            clientSeed,
            nonce
          }
        ],
        { session: dbSession }
      );

      await TransactionModel.create(
        [
          {
            userId: lockedUser._id,
            amount: body.betAmount,
            type: 'bet',
            gameId: game[0]._id,
            gameType: 'mines'
          }
        ],
        { session: dbSession }
      );

      payload = {
        gameId: String(game[0]._id),
        status: game[0].status,
        betAmount: game[0].betAmount,
        mineCount: game[0].mineCount,
        gridSize: game[0].gridSize,
        revealedTiles: game[0].revealedTiles,
        multiplier: game[0].multiplier,
        hashedServerSeed,
        clientSeed,
        nonce,
        houseEdge,
        balance: Number(lockedUser.balance)
      };

      await writeAudit({
        action: 'mines.start',
        actor: lockedUser.username,
        actorRole: lockedUser.role,
        target: String(game[0]._id),
        meta: {
          betAmount: body.betAmount,
          mineCount: body.mineCount,
          gridSize: body.gridSize
        }
      });
    });

    dbSession.endSession();
    return ok(payload, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return fail('Unauthorized', 401);
    }
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      return fail('Too many requests', 429);
    }
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') {
      return fail('Insufficient balance', 400);
    }
    if (error instanceof z.ZodError) {
      return fail(error.errors[0]?.message || 'Invalid request body', 400);
    }
    return fail('Unable to start mines game', 500);
  }
}
