import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { UserModel } from '@/models/User';
import { fail } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';

const bodySchema = z.object({
  username: z.string().min(3).max(24).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email().max(120),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    enforceRateLimit('auth:register', 20, 60_000);
    await connectDb();

    const body = bodySchema.parse(await request.json());

    const existing = await UserModel.findOne({
      $or: [{ username: body.username }, { email: body.email.toLowerCase() }]
    });

    if (existing) {
      return fail('Username or email already in use', 409);
    }

    const created = await UserModel.create({
      username: body.username,
      email: body.email.toLowerCase(),
      passwordHash: hashPassword(body.password),
      role: 'player',
      balance: 1000,
      totalWagered: 0,
      totalWon: 0,
      clientSeed: `${body.username}-seed`
    });

    const token = signSession({
      _id: String(created._id),
      username: created.username,
      role: created.role
    });

    const response = NextResponse.json(
      {
        token,
        user: {
          id: String(created._id),
          username: created.username,
          role: created.role,
          balance: Number(created.balance),
          totalWagered: Number(created.totalWagered),
          totalWon: Number(created.totalWon),
          vipTier: created.vipTier,
          vipPoints: Number(created.vipPoints || 0),
          rakebackBalance: Number(created.rakebackBalance || 0),
          levelProgress: Number(created.levelProgress || 0)
        }
      },
      { status: 201 }
    );

    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.errors[0]?.message || 'Invalid registration payload', 400);
    }
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      return fail('Too many requests', 429);
    }
    return fail('Unable to register user', 500);
  }
}
