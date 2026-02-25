import { UserDoc } from '@/models/User';

export function requireRole(user: UserDoc, roles: Array<'admin' | 'owner'>) {
  if (!roles.includes(user.role as 'admin' | 'owner')) {
    throw new Error('FORBIDDEN');
  }
}

export function requireOwner(user: UserDoc) {
  if (user.role !== 'owner') {
    throw new Error('FORBIDDEN');
  }
}
