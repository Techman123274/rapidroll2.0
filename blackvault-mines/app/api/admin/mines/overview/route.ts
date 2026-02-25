import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireRole } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { MinesGameModel } from '@/models/MinesGame';
import { UserModel } from '@/models/User';

export async function GET() {
  try {
    await connectDb();
    const user = await requireSession();
    requireRole(user, ['admin', 'owner']);

    const [activeGames, recentGames, totals] = await Promise.all([
      MinesGameModel.find({ status: 'active' }).sort({ createdAt: -1 }).limit(100).lean(),
      MinesGameModel.find({}).sort({ createdAt: -1 }).limit(50).lean(),
      UserModel.aggregate([
        {
          $group: {
            _id: null,
            users: { $sum: 1 },
            totalBalance: { $sum: '$balance' },
            totalWagered: { $sum: '$totalWagered' },
            totalWon: { $sum: '$totalWon' }
          }
        }
      ])
    ]);

    return ok({
      activeGames: activeGames.map((game) => ({
        id: String(game._id),
        userId: String(game.userId),
        gridSize: game.gridSize,
        mineCount: game.mineCount,
        revealedTiles: game.revealedTiles,
        minesPositions: game.minesPositions,
        betAmount: game.betAmount,
        multiplier: game.multiplier,
        createdAt: game.createdAt
      })),
      recentGames: recentGames.map((game) => ({
        id: String(game._id),
        status: game.status,
        betAmount: game.betAmount,
        payout: game.payout,
        mineCount: game.mineCount,
        gridSize: game.gridSize,
        createdAt: game.createdAt
      })),
      platformTotals: totals[0] || { users: 0, totalBalance: 0, totalWagered: 0, totalWon: 0 }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    return fail('Unable to fetch admin overview', 500);
  }
}
