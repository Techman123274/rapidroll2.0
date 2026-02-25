import { NextResponse } from 'next/server';
import { requireSession, SESSION_COOKIE_NAME } from '@/lib/auth';
import { fail } from '@/lib/http';

export async function GET() {
  try {
    const user = await requireSession();

    return NextResponse.json({
      user: {
        id: String(user._id),
        username: user.username,
        role: user.role,
        balance: Number(user.balance),
        totalWagered: Number(user.totalWagered),
        totalWon: Number(user.totalWon),
        minesBanned: Boolean(user.minesBanned),
        nonce: Number(user.nonce),
        clientSeed: user.clientSeed,
        vipTier: user.vipTier,
        vipPoints: Number(user.vipPoints || 0),
        rakebackBalance: Number(user.rakebackBalance || 0),
        levelProgress: Number(user.levelProgress || 0)
      }
    });
  } catch {
    return fail('Unauthorized', 401);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0
  });
  return response;
}
