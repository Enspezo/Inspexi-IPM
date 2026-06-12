import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { Organization } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { TenantCacheService } from '../services/tenant-cache.service';
import { TenantContext } from '../interfaces/tenant-context.interface';

type SlugResult =
  | { type: 'superuser' }   // mijn.localhost, mijn.inspexi.nl, localhost, inspexi.nl
  | { type: 'org'; slug: string }  // voorbeeldbedrijf.localhost
  | { type: 'unknown' };    // 127.0.0.1, IP, unrecognized hosts (e.g., tests)

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  private readonly baseDomain: string;
  private readonly superuserSubdomain: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tenantCache: TenantCacheService,
  ) {
    this.baseDomain = this.config.get<string>('BASE_DOMAIN', 'localhost');
    this.superuserSubdomain = this.config.get<string>('SUPERUSER_SUBDOMAIN', 'mijn');
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const hostname = req.hostname; // NestJS/Express strips port automatically

    const result = this.classifyHostname(hostname);

    if (result.type === 'superuser') {
      // Explicitly recognized SUPERUSER domain
      req.tenant = { slug: null, organization: null, orgId: null, isSuperuserDomain: true };
      return next();
    }

    if (result.type === 'unknown') {
      // Unrecognized host (IP, test env) → no tenant restrictions
      req.tenant = { slug: null, organization: null, orgId: null, isSuperuserDomain: false };
      return next();
    }

    // Org subdomain → look up by slug (alleen actieve orgs)
    const org = await this.findOrgBySlug(result.slug);
    if (!org || !org.isActive) {
      res.status(404).json({
        statusCode: 404,
        message: `Organisatie '${result.slug}' niet gevonden`,
      });
      return;
    }

    req.tenant = { slug: result.slug, organization: org, orgId: org.id, isSuperuserDomain: false };
    return next();
  }

  /**
   * Classify the hostname into SUPERUSER, org subdomain, or unknown.
   */
  private classifyHostname(hostname: string): SlugResult {
    // Exact match on base domain (e.g., localhost, inspexi.nl) → superuser
    if (hostname === this.baseDomain) {
      return { type: 'superuser' };
    }

    const suffix = `.${this.baseDomain}`;
    if (!hostname.endsWith(suffix)) {
      // Doesn't match base domain at all (e.g., 127.0.0.1, IP, test host)
      return { type: 'unknown' };
    }

    const subdomain = hostname.slice(0, -suffix.length);
    if (!subdomain || subdomain.includes('.')) {
      // Empty or nested subdomain → treat as unknown
      return { type: 'unknown' };
    }

    // SUPERUSER subdomain (mijn.localhost, mijn.inspexi.nl) → superuser
    if (subdomain === this.superuserSubdomain) {
      return { type: 'superuser' };
    }

    // Valid org subdomain
    return { type: 'org', slug: subdomain };
  }

  private async findOrgBySlug(slug: string): Promise<Organization | null> {
    // Check shared cache first (invalidated by OrganizationsService on updates)
    const cached = this.tenantCache.get(slug);
    if (cached) {
      return cached;
    }

    try {
      const org = await this.prisma.organization.findUnique({
        where: { slug },
      });

      if (org && org.isActive) {
        this.tenantCache.set(slug, org);
      } else {
        // Remove stale cache entry if org was deleted or deactivated
        this.tenantCache.invalidate(slug);
      }

      return org;
    } catch (error) {
      this.logger.error(`Failed to resolve tenant slug '${slug}'`, error);
      return null;
    }
  }
}
