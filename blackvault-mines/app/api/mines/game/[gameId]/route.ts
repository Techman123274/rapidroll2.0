import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { fail, ok } from '@/lib/http';
import { MinesGameModel } from '@/models/MinesGame';

export async function GET(_request: Request, { params }: { params: { gameId: string } }) {
  try {
    await connectDb();
    const user = await requireSession();

    const game = await MinesGameModel.findOne({ _id: params.gameId, userId: user._id });
    if (!game) return fail('Game not found', 404);

    const exposeMines = game.status !== 'active';

    return ok({
      gameId: String(game._id),
      status: game.status,
      betAmount: game.betAmount,
      mineCount: game.mineCount,
      gridSize: game.gridSize,
      revealedTiles: game.revealedTiles,
      multiplier: game.multiplier,
      payout: game.payout,
      hashedServerSeed: game.hashedServerSeed,
      serverSeed: exposeMines ? game.serverSeed : '',
      clientSeed: game.clientSeed,
      nonce: game.nonce,
      minesPositions: exposeMines ? game.minesPositions : []
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    return fail('Unable to fetch game', 500);
  }
}
