import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { signSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { UserModel } from '@/models/User';
import { fail } from '@/lib/http';
import { enforceRateLimit } from '@/lib/rateLimit';

const bodySchema = z.object({
  identity: z.string().min(3).max(120),
  password: z.string().min(8).max(128)
});

export async function POST(request: Request) {
  try {
    enforceRateLimit('auth:login', 30, 60_000);
    await connectDb();

    const body = bodySchema.parse(await request.json());

    const user = await UserModel.findOne({
      $or: [{ username: body.identity }, { email: body.identity.toLowerCase() }]
    });

    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      return fail('Invalid credentials', 401);
    }

    const token = signSession({
      _id: String(user._id),
      username: user.username,
      role: user.role
    });

    const response = NextResponse.json({
      token,
      user: {
        id: String(user._id),
        username: user.username,
        role: user.role,
        balance: Number(user.balance),
        totalWagered: Number(user.totalWagered),
        totalWon: Number(user.totalWon),
        minesBanned: Boolean(user.minesBanned),
        vipTier: user.vipTier,
        vipPoints: Number(user.vipPoints || 0),
        rakebackBalance: Number(user.rakebackBalance || 0),
        levelProgress: Number(user.levelProgress || 0)
      }
    });

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
      return fail(error.errors[0]?.message || 'Invalid login payload', 400);
    }
    if (error instanceof Error && error.message === 'RATE_LIMITED') {
      return fail('Too many requests', 429);
    }
    return fail('Unable to login user', 500);
  }
}
