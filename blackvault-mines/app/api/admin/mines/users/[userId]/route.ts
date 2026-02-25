import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireRole } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { UserModel } from '@/models/User';
import { hashPassword } from '@/lib/password';
import { writeAudit } from '@/lib/audit';

const patchSchema = z.object({
  minesBanned: z.boolean().optional(),
  resetPassword: z.string().min(8).max(128).optional()
});

export async function PATCH(request: Request, { params }: { params: { userId: string } }) {
  try {
    await connectDb();
    const actor = await requireSession();
    requireRole(actor, ['admin', 'owner']);

    const body = patchSchema.parse(await request.json());

    const update: Record<string, unknown> = {};
    if (typeof body.minesBanned === 'boolean') update.minesBanned = body.minesBanned;
    if (body.resetPassword) update.passwordHash = hashPassword(body.resetPassword);

    if (Object.keys(update).length === 0) {
      return fail('No valid fields to update', 400);
    }

    const updated = await UserModel.findByIdAndUpdate(params.userId, { $set: update }, { new: true });
    if (!updated) return fail('User not found', 404);

    await writeAudit({
      action: 'admin.user.update',
      actor: actor.username,
      actorRole: actor.role,
      target: String(updated._id),
      meta: {
        minesBanned: body.minesBanned,
        passwordReset: Boolean(body.resetPassword)
      }
    });

    return ok({
      user: {
        id: String(updated._id),
        username: updated.username,
        role: updated.role,
        minesBanned: Boolean(updated.minesBanned)
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    if (error instanceof z.ZodError) return fail(error.errors[0]?.message || 'Invalid payload', 400);
    return fail('Unable to update user', 500);
  }
}
