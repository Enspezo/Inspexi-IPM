import type { ContactRef } from './common';

export interface ClientUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  function: string | null;
}

export type ClientAccessRole = 'VIEWER' | 'SIGNER' | 'ADMIN';

export interface ClientAccessEntry {
  role: ClientAccessRole;
  contact: ContactRef;
}

export interface ClientMe extends ClientUser {
  access: ClientAccessEntry[];
}

// Het refresh-token loopt als httpOnly-cookie (server-side); alleen het access-token bereikt de client.
export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface LoginResult extends AuthTokens {
  user: ClientUser;
}

export type MagicLinkResult =
  | { requiresRegistration: true; email: string; inspectionPlanId: string | null }
  | ({ requiresRegistration: false; user: ClientUser; inspectionPlanId: string | null } & AuthTokens);
