import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';
import { DiceGameModel } from '@/models/DiceGame';
import { PlatformSettingModel } from '@/models/PlatformSetting';
import { TransactionModel } from '@/models/Transaction';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';
import {
  calculateDiceMultiplier,
  calculateWinChance,
  generateDiceRoll,
  generateServerSeed,
  hashSeed,
  isDiceWin
} from '@/lib/diceFair';
import { vipUpdateFromWager } from '@/lib/vip';

const bodySchema = z.object({
  betAmount: z.number().positive(),
  target: z.number().min(2).max(98),
  isOver: z.boolean(),
  clientSeed: z.string().min(3).max(128).optional()
});

export async function POST(request: Request) {
  try {
    await connectDb();
    const user = await requireSession();

    enforceRateLimit(`dice:roll:${user.id}`, 18, 10_000);

    const body = bodySchema.parse(await request.json());

    const [siteSetting, edgeSetting] = await Promise.all([
      PlatformSettingModel.findOne({ key: 'site_online' }),
      PlatformSettingModel.findOne({ key: 'house_edge' })
    ]);

    if (siteSetting && siteSetting.value === false) {
      return fail('Site is currently in maintenance mode', 503);
    }

    const houseEdge = Number(edgeSetting?.value ?? 0.01);

    const dbSession = await mongoose.startSession();
    let payload: Record<string, unknown> | null = null;

    await dbSession.withTransaction(async () => {
      const currentUser = await UserModel.findById(user.id).session(dbSession);
      if (!currentUser) throw new Error('UNAUTHORIZED');
      if (Number(currentUser.balance) < body.betAmount) throw new Error('INSUFFICIENT_BALANCE');

      const vipStats = vipUpdateFromWager(Number(currentUser.vipPoints || 0), body.betAmount);
      const setPayload: Record<string, unknown> = {
        vipTier: vipStats.tier,
        levelProgress: vipStats.levelProgress
      };
      if (body.clientSeed) setPayload.clientSeed = body.clientSeed;

      const lockedUser = await UserModel.findOneAndUpdate(
        {
          _id: user.id,
          balance: { $gte: body.betAmount }
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

      if (!lockedUser) throw new Error('INSUFFICIENT_BALANCE');

      const winChance = calculateWinChance(body.target, body.isOver);
      const multiplier = calculateDiceMultiplier(winChance, houseEdge);

      const serverSeed = generateServerSeed();
      const hashedServerSeed = hashSeed(serverSeed);
      const clientSeed = body.clientSeed || lockedUser.clientSeed;
      const nonce = lockedUser.nonce;

      const roll = generateDiceRoll({ serverSeed, clientSeed, nonce });
      const didWin = isDiceWin(roll, body.target, body.isOver);
      const payout = didWin ? Number((body.betAmount * multiplier).toFixed(2)) : 0;

      const game = await DiceGameModel.create(
        [
          {
            userId: user.id,
            betAmount: body.betAmount,
            target: body.target,
            isOver: body.isOver,
            roll,
            winChance,
            multiplier,
            payout,
            status: didWin ? 'won' : 'lost',
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
            userId: user.id,
            amount: body.betAmount,
            type: 'bet',
            gameId: game[0]._id,
            gameType: 'dice'
          }
        ],
        { session: dbSession }
      );

      let nextBalance = Number(lockedUser.balance);

      if (didWin && payout > 0) {
        const updated = await UserModel.findByIdAndUpdate(
          user.id,
          {
            $inc: {
              balance: payout,
              totalWon: payout
            }
          },
          { new: true, session: dbSession }
        );

        nextBalance = Number(updated?.balance || nextBalance);

        await TransactionModel.create(
          [
            {
              userId: user.id,
              amount: payout,
              type: 'payout',
              gameId: game[0]._id,
              gameType: 'dice'
            }
          ],
          { session: dbSession }
        );
      }

      await writeAudit({
        action: 'dice.roll',
        actor: user.username,
        actorRole: user.role,
        target: String(game[0]._id),
        meta: {
          betAmount: body.betAmount,
          target: body.target,
          isOver: body.isOver,
          roll,
          didWin
        }
      });

      payload = {
        gameId: String(game[0]._id),
        status: didWin ? 'won' : 'lost',
        roll,
        didWin,
        target: body.target,
        isOver: body.isOver,
        winChance,
        multiplier,
        payout,
        balance: nextBalance,
        hashedServerSeed,
        clientSeed,
        nonce,
        houseEdge
      };
    });

    dbSession.endSession();
    return ok(payload, 201);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'INSUFFICIENT_BALANCE') return fail('Insufficient balance', 400);
    if (error instanceof Error && error.message === 'RATE_LIMITED') return fail('Too many requests', 429);
    if (error instanceof z.ZodError) return fail(error.errors[0]?.message || 'Invalid payload', 400);
    return fail('Unable to roll dice', 500);
  }
}
