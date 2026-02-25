import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { fail, ok } from '@/lib/http';
import { UserModel } from '@/models/User';
import { hashPassword } from '@/lib/password';

const bodySchema = z.object({
  bootstrapKey: z.string().min(6),
  username: z.string().min(3).max(24),
  email: z.string().email().max(120),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    await connectDb();

    const expectedKey = process.env.OWNER_BOOTSTRAP_KEY;
    if (!expectedKey) {
      return fail('Owner bootstrap disabled', 403);
    }

    const body = bodySchema.parse(await request.json());
    if (body.bootstrapKey !== expectedKey) {
      return fail('Invalid bootstrap key', 403);
    }

    const existingOwner = await UserModel.findOne({ role: 'owner' });
    if (existingOwner) {
      return fail('Owner already exists', 409);
    }

    const existing = await UserModel.findOne({
      $or: [{ username: body.username }, { email: body.email.toLowerCase() }]
    });

    if (existing) {
      return fail('Username or email already in use', 409);
    }

    const owner = await UserModel.create({
      username: body.username,
      email: body.email.toLowerCase(),
      passwordHash: hashPassword(body.password),
      role: 'owner',
      balance: 0,
      clientSeed: `${body.username}-seed`
    });

    return ok({
      owner: {
        id: String(owner._id),
        username: owner.username,
        role: owner.role
      }
    }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0]?.message || 'Invalid payload', 400);
    }
    return fail('Unable to bootstrap owner', 500);
  }
}
