import { Role } from '@prisma/client';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: Role[];
  orgId: string | null;
  // Onderscheidt een gewoon access-token van andere JWT's die met hetzelfde
  // JWT_SECRET zijn gesigned (reset-/verificatietokens). De JwtStrategy weigert
  // tokens zonder `type: 'access'`, zodat een reset-token nooit als access-token
  // kan dienen.
  type?: 'access';
}
