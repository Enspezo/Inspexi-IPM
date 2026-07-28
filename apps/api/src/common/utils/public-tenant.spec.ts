import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { publicTenantWhere } from './public-tenant';
import { TenantContext } from '../interfaces/tenant-context.interface';

/** WP-B7 (B-152) — semantiek van de publieke tenantbinding per hosttype. */
describe('publicTenantWhere', () => {
  const configWith = (baseDomain: string) =>
    ({ get: jest.fn().mockReturnValue(baseDomain) }) as unknown as ConfigService;

  const orgTenant: TenantContext = {
    slug: 'orga',
    organization: { id: 'org-a' } as any,
    orgId: 'org-a',
    isSuperuserDomain: false,
  };
  const superuserTenant: TenantContext = {
    slug: null,
    organization: null,
    orgId: null,
    isSuperuserDomain: true,
  };
  const unknownTenant: TenantContext = {
    slug: null,
    organization: null,
    orgId: null,
    isSuperuserDomain: false,
  };

  it('org-subdomein → bindt de lookup aan die org', () => {
    expect(publicTenantWhere(orgTenant, configWith('localhost'), 'Offerte')).toEqual({ orgId: 'org-a' });
    // Binding geldt óók op localhost — dat is de kern van de fix (B-152).
    expect(publicTenantWhere(orgTenant, configWith('inspexi.nl'), 'Offerte')).toEqual({ orgId: 'org-a' });
  });

  it('apex-/superuser-domein → bewust onbegrensd (gemailde PUBLIC_URL-links, DEP-6)', () => {
    expect(publicTenantWhere(superuserTenant, configWith('localhost'), 'Offerte')).toEqual({});
    expect(publicTenantWhere(superuserTenant, configWith('inspexi.nl'), 'Offerte')).toEqual({});
  });

  it('onbekende host op localhost → onbegrensd (e2e-conventie op 127.0.0.1)', () => {
    expect(publicTenantWhere(unknownTenant, configWith('localhost'), 'Offerte')).toEqual({});
  });

  it('onbekende host in productie → fail-secure 404 met generieke NL-melding', () => {
    expect(() => publicTenantWhere(unknownTenant, configWith('inspexi.nl'), 'Offerte')).toThrow(
      NotFoundException,
    );
    expect(() => publicTenantWhere(unknownTenant, configWith('inspexi.nl'), 'Offerte')).toThrow(
      'Offerte niet gevonden',
    );
  });

  it('ontbrekende tenant-context (unit-tests zonder HTTP-laag) → onbegrensd', () => {
    expect(publicTenantWhere(undefined, configWith('inspexi.nl'), 'Offerte')).toEqual({});
  });
});
