import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { requireSession } from '@/lib/auth';
import { requireRole } from '@/lib/roles';
import { fail, ok } from '@/lib/http';
import { PlatformSettingModel } from '@/models/PlatformSetting';
import { writeAudit } from '@/lib/audit';

const patchSchema = z.object({
  houseEdge: z.number().min(0).max(0.1).optional(),
  siteOnline: z.boolean().optional()
});

export async function GET() {
  try {
    await connectDb();
    const user = await requireSession();
    requireRole(user, ['admin', 'owner']);

    const [houseEdge, siteOnline] = await Promise.all([
      PlatformSettingModel.findOne({ key: 'house_edge' }),
      PlatformSettingModel.findOne({ key: 'site_online' })
    ]);

    return ok({
      houseEdge: Number(houseEdge?.value ?? Number(process.env.HOUSE_EDGE || 0.01)),
      siteOnline: siteOnline ? Boolean(siteOnline.value) : true
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    return fail('Unable to fetch settings', 500);
  }
}

export async function PATCH(request: Request) {
  try {
    await connectDb();
    const user = await requireSession();
    requireRole(user, ['admin', 'owner']);

    const body = patchSchema.parse(await request.json());

    if (typeof body.houseEdge === 'number') {
      await PlatformSettingModel.findOneAndUpdate(
        { key: 'house_edge' },
        { value: body.houseEdge },
        { upsert: true, new: true }
      );
    }

    if (typeof body.siteOnline === 'boolean') {
      await PlatformSettingModel.findOneAndUpdate(
        { key: 'site_online' },
        { value: body.siteOnline },
        { upsert: true, new: true }
      );
    }

    await writeAudit({
      action: 'admin.settings.update',
      actor: user.username,
      actorRole: user.role,
      meta: body
    });

    return ok({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return fail('Unauthorized', 401);
    if (error instanceof Error && error.message === 'FORBIDDEN') return fail('Forbidden', 403);
    if (error instanceof z.ZodError) return fail(error.errors[0]?.message || 'Invalid payload', 400);
    return fail('Unable to update settings', 500);
  }
}
