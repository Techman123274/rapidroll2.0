import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { MinesGameModel } from '@/models/MinesGame';

export async function GET() {
  try {
    await connectDb();
    const user = await requireSession();

    const games = await MinesGameModel.find({ userId: user._id }).sort({ createdAt: -1 }).limit(25);

    return ok({
      games: games.map((game) => ({
        gameId: String(game._id),
        status: game.status,
        betAmount: game.betAmount,
        payout: game.payout,
        multiplier: game.multiplier,
        gridSize: game.gridSize,
        mineCount: game.mineCount,
        createdAt: game.createdAt,
        revealedTiles: game.revealedTiles.length
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    return fail('Unable to fetch game history', 500);
  }
}
