import jwt from 'jsonwebtoken';
import { cookies, headers } from 'next/headers';
import { z } from 'zod';
import { connectDb } from '@/lib/db';
import { UserModel } from '@/models/User';

const payloadSchema = z.object({
  sub: z.string(),
  role: z.enum(['player', 'admin', 'owner']),
  username: z.string()
});

const JWT_SECRET = process.env.JWT_SECRET || 'dev_insecure_secret_change_me';
const SESSION_COOKIE = 'blackvault_session';

function readToken() {
  const authHeader = headers().get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) return authHeader.slice(7);

  const xToken = headers().get('x-session-token');
  if (xToken) return xToken;

  return cookies().get(SESSION_COOKIE)?.value || '';
}

export async function requireSession() {
  const token = readToken();

  if (!token) {
    throw new Error('UNAUTHORIZED');
  }

  let payloadRaw: unknown;
  try {
    payloadRaw = jwt.verify(token, JWT_SECRET);
  } catch {
    throw new Error('UNAUTHORIZED');
  }

  const payload = payloadSchema.parse(payloadRaw);

  await connectDb();
  const user = await UserModel.findById(payload.sub);
  if (!user) throw new Error('UNAUTHORIZED');

  return user;
}

export function signSession(user: { _id: string; username: string; role: 'player' | 'admin' | 'owner' }) {
  return jwt.sign(
    {
      sub: String(user._id),
      username: user.username,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;
