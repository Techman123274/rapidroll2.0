import { connectDb } from '@/lib/db';
import { AuditLogModel } from '@/models/AuditLog';

export async function writeAudit(params: {
  action: string;
  actor: string;
  actorRole: string;
  target?: string;
  meta?: Record<string, unknown>;
}) {
  await connectDb();
  await AuditLogModel.create({
    action: params.action,
    actor: params.actor,
    actorRole: params.actorRole,
    target: params.target || '',
    meta: params.meta || {}
  });
}
