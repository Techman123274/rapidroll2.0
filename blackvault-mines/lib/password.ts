import crypto from 'crypto';

const KEYLEN = 64;

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(':');
  if (!salt || !stored) return false;
  const derived = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(stored, 'hex'));
  } catch {
    return false;
  }
}
