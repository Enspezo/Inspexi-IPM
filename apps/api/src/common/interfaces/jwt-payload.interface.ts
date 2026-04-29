import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: Role[];
  orgId: string | null;
}
