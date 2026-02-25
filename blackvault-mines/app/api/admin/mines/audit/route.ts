import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireRole } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { AuditLogModel } from '@/models/AuditLog';

export async function GET() {
  try {
    await connectDb();
    const user = await requireSession();
    requireRole(user, ['admin', 'owner']);

    const logs = await AuditLogModel.find({}).sort({ createdAt: -1 }).limit(200).lean();

    return ok({
      logs: logs.map((entry) => ({
        id: String(entry._id),
        action: entry.action,
        actor: entry.actor,
        actorRole: entry.actorRole,
        target: entry.target,
        meta: entry.meta,
        createdAt: entry.createdAt
      }))
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    return fail('Unable to fetch audit logs', 500);
  }
}
