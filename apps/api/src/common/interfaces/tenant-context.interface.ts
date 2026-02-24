import { Organization } from '@prisma/client';

export interface TenantContext {
  /** The slug extracted from the subdomain, or null for the SUPERUSER domain */
  slug: string | null;
  /** The resolved organization, or null for SUPERUSER domain */
  organization: Organization | null;
  /** Shortcut for organization.id, or null */
  orgId: string | null;
  /** True when the hostname is a recognized base/superuser domain (mijn.localhost, mijn.inspexi.nl, localhost, inspexi.nl) */
  isSuperuserDomain: boolean;
}
