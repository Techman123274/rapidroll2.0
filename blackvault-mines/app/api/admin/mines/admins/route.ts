import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireOwner } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { UserModel } from '@/models/User';
import { writeAudit } from '@/lib/audit';

const bodySchema = z.object({
  username: z.string().min(3).max(24),
  role: z.enum(['player', 'admin'])
});

export async function GET() {
  try {
    await connectDb();
    const owner = await requireSession();
    requireOwner(owner);

    const admins = await UserModel.find({ role: { $in: ['admin', 'owner'] } })
      .select('username email role createdAt')
      .sort({ createdAt: -1 });

    return ok({
      admins: admins.map((entry) => ({
        id: String(entry._id),
        username: entry.username,
        email: entry.email,
        role: entry.role,
        createdAt: entry.createdAt
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    return fail('Unable to fetch admin list', 500);
  }
}

export async function POST(request: Request) {
  try {
    await connectDb();
    const owner = await requireSession();
    requireOwner(owner);

    const body = bodySchema.parse(await request.json());
    const user = await UserModel.findOne({ username: body.username });
    if (!user) return fail('User not found', 404);
    if (user.role === 'owner' && body.role !== 'admin') {
      return fail('Owner role cannot be downgraded from this endpoint', 400);
    }

    user.role = body.role;
    await user.save();

    await writeAudit({
      action: 'owner.admins.set_role',
      actor: owner.username,
      actorRole: owner.role,
      target: String(user._id),
      meta: { newRole: body.role }
    });

    return ok({
      user: {
        id: String(user._id),
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    if (error instanceof z.ZodError) return fail(error.errors[0]?.message || 'Invalid payload', 400);
    return fail('Unable to update admin role', 500);
  }
}
