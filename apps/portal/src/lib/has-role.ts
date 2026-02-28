import type { User } from '@/types';
import { Role } from '@/types';

export function hasRole(
  user: User | null | undefined,
  roles: Role | Role[],
): boolean {
  if (!user) return false;
  const roleArray = Array.isArray(roles) ? roles : [roles];
  return user.roles.some((r) => roleArray.includes(r));
}
