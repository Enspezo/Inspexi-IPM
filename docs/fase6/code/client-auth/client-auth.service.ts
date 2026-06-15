// Doel in apps/api: src/modules/client-auth/client-auth.service.ts
//
// Tweede auth-realm, ONDER subdomein-tenancy: elke flow krijgt de org (orgId) uit het
// subdomein mee (@CurrentTenant). Een klant logt in op het subdomein van de inspectieorg en
// ziet alleen die org. ClientAccess koppelt ClientUser → Contact (Fase 1 keuze); de org-scope
// = de Contacten van deze org waar de klant toegang toe heeft.
//
// >>> PORT FROM APP SOURCE <<< e-mail (Resend), wachtwoord-reset-tokens en refresh-rotatie:
// neem die over uit ../Inspexi-App/apps/api/src/modules/client-auth/client-auth.service.ts.

import { Injectable, UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/prisma';
import { ClientLoginDto, ClientRegisterDto } from './dto';

@Injectable()
export class ClientAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  private requireOrg(orgId: string | null): string {
    if (!orgId) throw new BadRequestException('Gebruik het subdomein van uw organisatie');
    return orgId;
  }

  private async issueTokens(clientUserId: string, email: string) {
    const payload = { sub: clientUserId, email, type: 'client' as const };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('CLIENT_JWT_SECRET'),
      expiresIn: this.config.get('CLIENT_JWT_EXPIRATION', '1h'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('CLIENT_JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('CLIENT_JWT_REFRESH_EXPIRATION', '30d'),
    });
    return { accessToken, refreshToken };
  }

  /** Heeft deze klant toegang tot een Contact binnen DEZE org (subdomein)? */
  private async assertOrgAccess(clientUserId: string, orgId: string) {
    const access = await this.prisma.clientAccess.findFirst({
      where: { clientUserId, contact: { orgId, isDeleted: false } },
      select: { id: true },
    });
    if (!access) throw new ForbiddenException('Geen toegang tot deze organisatie');
  }

  async login(dto: ClientLoginDto, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const user = await this.prisma.clientUser.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Onjuiste inloggegevens');
    }
    if (user.status !== ClientUserStatus.ACTIVE) throw new UnauthorizedException('Account is inactief');
    await this.assertOrgAccess(user.id, org); // scope op subdomein-org

    await this.prisma.clientUser.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { ...(await this.issueTokens(user.id, user.email)), user: this.publicUser(user) };
  }

  /** Magic-link onboarding: token valideren binnen de org-context. */
  async validateMagicLink(token: string, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const link = await this.prisma.clientMagicLink.findUnique({
      where: { token },
      include: { clientUser: true },
    });
    if (!link || link.usedAt || link.expiresAt < new Date()) {
      throw new BadRequestException('Magic link ongeldig of verlopen');
    }
    if (!link.clientUser) {
      // Nog geen account → frontend toont registratie (e-mail voorgevuld)
      return { requiresRegistration: true, email: link.email, inspectionPlanId: link.inspectionPlanId };
    }
    await this.assertOrgAccess(link.clientUser.id, org);
    await this.prisma.clientMagicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } });
    return {
      requiresRegistration: false,
      ...(await this.issueTokens(link.clientUser.id, link.clientUser.email)),
      user: this.publicUser(link.clientUser),
    };
  }

  /** Registratie via magic link: maakt ClientUser + auto-grant ClientAccess naar het juiste Contact. */
  async register(dto: ClientRegisterDto, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const link = await this.prisma.clientMagicLink.findUnique({ where: { token: dto.magicLinkToken } });
    if (!link || link.usedAt || link.expiresAt < new Date() || link.email.toLowerCase() !== dto.email.toLowerCase()) {
      throw new BadRequestException('Registratie vereist een geldige uitnodiging');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.clientUser.create({
      data: {
        email: dto.email.toLowerCase(), passwordHash, firstName: dto.firstName, lastName: dto.lastName,
        phone: dto.phone, status: ClientUserStatus.ACTIVE, emailVerified: true,
      },
    });
    // >>> PORT: koppel ClientAccess naar het Contact bij dit magic-link/inspectieplan binnen `org`,
    // en (bij inspectionPlanId) een InspectionClientAccess met canView/canSign.
    await this.prisma.clientMagicLink.update({ where: { id: link.id }, data: { usedAt: new Date(), clientUserId: user.id } });
    void org;
    return { ...(await this.issueTokens(user.id, user.email)), user: this.publicUser(user) };
  }

  async getMe(clientUserId: string, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const user = await this.prisma.clientUser.findUnique({ where: { id: clientUserId } });
    if (!user) throw new UnauthorizedException();
    // Alleen de toegang binnen DEZE org tonen
    const access = await this.prisma.clientAccess.findMany({
      where: { clientUserId, contact: { orgId: org, isDeleted: false } },
      select: { role: true, contact: { select: { id: true, companyName: true, firstName: true, lastName: true } } },
    });
    return { ...this.publicUser(user), access };
  }

  // forgotPassword / resetPassword: >>> PORT (Resend-mail + reset-token).

  private publicUser(u: { id: string; email: string; firstName: string; lastName: string; phone: string | null; function: string | null }) {
    return { id: u.id, email: u.email, firstName: u.firstName, lastName: u.lastName, phone: u.phone, function: u.function };
  }
}
