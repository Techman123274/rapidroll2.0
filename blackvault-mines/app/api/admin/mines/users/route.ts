import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireRole } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { UserModel } from '@/models/User';

export async function GET(request: Request) {
  try {
    await connectDb();
    const user = await requireSession();
    requireRole(user, ['admin', 'owner']);

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q') || '';

    const filter = q
      ? {
          $or: [
            { username: { $regex: q, $options: 'i' } },
            { email: { $regex: q, $options: 'i' } }
          ]
        }
      : {};

    const users = await UserModel.find(filter)
      .sort({ createdAt: -1 })
      .limit(100)
      .select('username email role minesBanned balance totalWagered totalWon createdAt');

    return ok({
      users: users.map((entry) => ({
        id: String(entry._id),
        username: entry.username,
        email: entry.email,
        role: entry.role,
        minesBanned: Boolean(entry.minesBanned),
        balance: Number(entry.balance),
        totalWagered: Number(entry.totalWagered),
        totalWon: Number(entry.totalWon),
        createdAt: entry.createdAt
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    return fail('Unable to fetch users', 500);
  }
}
