// Tweede auth-realm, ONDER subdomein-tenancy: elke flow krijgt de org (orgId) uit het
// subdomein mee (@CurrentTenant). Een klant logt in op het subdomein van de inspectieorg en
// ziet alleen die org. ClientAccess koppelt ClientUser → Contact (Fase 1 keuze); de org-scope
// = de Contacten van deze org waar de klant toegang toe heeft.
//
// Geport uit de App-bron (../Inspexi-App/.../client-auth): wachtwoord-reset via Resend +
// reset-tokens (hergebruikt ClientMagicLink) en de ClientAccess/InspectionClientAccess-grant bij
// magic-link-registratie — alles aangepast aan het Beheer-schema (Contact i.p.v. Client) en aan de
// subdomein-org-context. Het refresh-token is STATEFUL (spiegelt de staf-realm): SHA-256-gehasht in
// ClientRefreshToken, geroteerd bij refresh en intrekbaar bij logout/wachtwoord-reset; de rauwe
// waarde loopt als httpOnly-cookie (zie de controller), nooit in de response-body.

import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ClientUserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';
import { ClientJwtPayload } from './client-jwt.strategy';
import {
  ClientLoginDto,
  ClientRegisterDto,
  ClientResetPasswordDto,
} from './dto';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 uur

/** Herkomst (IP/User-Agent) van een sessie; gebruikt bij het uitgeven van refresh-tokens. */
export interface ClientSessionMeta {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class ClientAuthService {
  private readonly logger = new Logger(ClientAuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly email: EmailService,
  ) {}

  private requireOrg(orgId: string | null): string {
    if (!orgId) throw new BadRequestException('Gebruik het subdomein van uw organisatie');
    return orgId;
  }

  /**
   * Geeft een access-token (stateless JWT) + een refresh-token uit. Het refresh-token is
   * NIET stateless: het is een willekeurige waarde die SHA-256-gehasht in de DB staat, zodat
   * hij roteerbaar (bij refresh) en intrekbaar (bij logout) is — net als de staf-realm.
   * Het rauwe refresh-token wordt door de controller als httpOnly-cookie gezet, nooit in de body.
   */
  private async issueTokens(clientUserId: string, email: string, meta?: ClientSessionMeta) {
    const payload: ClientJwtPayload = { sub: clientUserId, email, type: 'client' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('CLIENT_JWT_SECRET'),
      expiresIn: this.config.get('CLIENT_JWT_EXPIRATION', '1h'),
    });
    const refreshToken = await this.createRefreshToken(clientUserId, meta);
    return {
      accessToken,
      refreshToken,
      expiresIn: this.expiresInSeconds(this.config.get('CLIENT_JWT_EXPIRATION', '1h')),
    };
  }

  /** Maakt een nieuw, gehasht refresh-token aan in de DB en geeft de rauwe waarde terug. */
  private async createRefreshToken(clientUserId: string, meta?: ClientSessionMeta): Promise<string> {
    const rawToken = randomUUID();
    const expiresAt = this.calculateExpiry(
      this.config.get('CLIENT_JWT_REFRESH_EXPIRATION', '30d'),
    );
    await this.prisma.clientRefreshToken.create({
      data: {
        clientUserId,
        tokenHash: this.hashToken(rawToken),
        expiresAt,
        ipAddress: meta?.ipAddress ?? null,
        userAgent: meta?.userAgent ?? null,
      },
    });
    return rawToken;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** "30d"/"1h"/"45m"/"30s" → absolute vervaldatum (fallback 30 dagen). */
  private calculateExpiry(duration: string): Date {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const value = parseInt(match[1], 10);
    const factor = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2]] ?? 86_400_000;
    return new Date(Date.now() + value * factor);
  }

  /** Heeft deze klant toegang tot een Contact binnen DEZE org (subdomein)? */
  private async assertOrgAccess(clientUserId: string, orgId: string) {
    const access = await this.prisma.clientAccess.findFirst({
      where: { clientUserId, contact: { orgId, isDeleted: false } },
      select: { id: true },
    });
    if (!access) throw new ForbiddenException('Geen toegang tot deze organisatie');
  }

  /**
   * Auto-grant bij magic-link-onboarding: koppel ClientAccess → het Contact van het
   * inspectieplan (binnen deze org) en — als invitedBy bekend is — een InspectionClientAccess
   * (canView/canSign). Idempotent (upsert). Plannen buiten de org-context worden genegeerd.
   */
  private async grantPlanAccess(
    clientUserId: string,
    orgId: string,
    inspectionPlanId: string,
    magicLinkCreatedBy: string | null,
  ) {
    const plan = await this.prisma.inspectionPlan.findFirst({
      where: { id: inspectionPlanId, orgId, deletedAt: null },
      select: { id: true, contactId: true, createdBy: true, assignedTo: true },
    });
    if (!plan) return; // plan hoort niet bij deze org → geen cross-tenant grant

    await this.prisma.clientAccess.upsert({
      where: { clientUserId_contactId: { clientUserId, contactId: plan.contactId } },
      create: { clientUserId, contactId: plan.contactId, grantedBy: magicLinkCreatedBy },
      update: {},
    });

    // InspectionClientAccess.invitedBy is verplicht (UUID). Val terug op de plan-eigenaar.
    const invitedBy = magicLinkCreatedBy ?? plan.createdBy ?? plan.assignedTo;
    if (!invitedBy) return; // geen geldige uitnodiger → laat het bij contact-niveau-toegang

    await this.prisma.inspectionClientAccess.upsert({
      where: { inspectionPlanId_clientUserId: { inspectionPlanId, clientUserId } },
      create: {
        inspectionPlanId,
        clientUserId,
        canView: true,
        canSign: true,
        invitedBy,
        acceptedAt: new Date(),
      },
      update: { canView: true, canSign: true, acceptedAt: new Date() },
    });
  }

  async login(dto: ClientLoginDto, orgId: string | null, meta?: ClientSessionMeta) {
    const org = this.requireOrg(orgId);
    const user = await this.prisma.clientUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user?.passwordHash || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Onjuiste inloggegevens');
    }
    if (user.status !== ClientUserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is inactief');
    }
    await this.assertOrgAccess(user.id, org); // scope op subdomein-org

    await this.prisma.clientUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    return { ...(await this.issueTokens(user.id, user.email, meta)), user: this.publicUser(user) };
  }

  /** Magic-link onboarding/login: token valideren binnen de org-context. */
  async validateMagicLink(token: string, orgId: string | null, meta?: ClientSessionMeta) {
    const org = this.requireOrg(orgId);
    const link = await this.prisma.clientMagicLink.findUnique({
      where: { token },
      include: { clientUser: true },
    });
    if (!link || link.usedAt || link.expiresAt < new Date()) {
      throw new BadRequestException('Magic link ongeldig of verlopen');
    }

    if (!link.clientUser) {
      // Nog geen account → frontend toont registratie (e-mail voorgevuld). Link NIET als
      // gebruikt markeren: register() consumeert 'm.
      return {
        requiresRegistration: true,
        email: link.email,
        inspectionPlanId: link.inspectionPlanId,
      };
    }

    // Bestaand account: een nieuwe plan-uitnodiging kent direct toegang toe.
    if (link.inspectionPlanId) {
      await this.grantPlanAccess(link.clientUser.id, org, link.inspectionPlanId, link.createdBy);
    }
    await this.assertOrgAccess(link.clientUser.id, org);

    await this.prisma.$transaction([
      this.prisma.clientMagicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
      this.prisma.clientUser.update({
        where: { id: link.clientUser.id },
        data: { lastLoginAt: new Date() },
      }),
    ]);

    return {
      requiresRegistration: false,
      ...(await this.issueTokens(link.clientUser.id, link.clientUser.email, meta)),
      user: this.publicUser(link.clientUser),
      inspectionPlanId: link.inspectionPlanId,
    };
  }

  /** Registratie via magic link: maakt/activeert ClientUser + auto-grant ClientAccess + InspectionClientAccess. */
  async register(dto: ClientRegisterDto, orgId: string | null, meta?: ClientSessionMeta) {
    const org = this.requireOrg(orgId);
    const link = await this.prisma.clientMagicLink.findUnique({
      where: { token: dto.magicLinkToken },
    });
    if (
      !link ||
      link.usedAt ||
      link.expiresAt < new Date() ||
      link.email.toLowerCase() !== dto.email.toLowerCase()
    ) {
      throw new BadRequestException('Registratie vereist een geldige uitnodiging');
    }

    const existing = await this.prisma.clientUser.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing?.passwordHash) {
      throw new ConflictException('Er bestaat al een account met dit e-mailadres');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = existing
      ? await this.prisma.clientUser.update({
          where: { id: existing.id },
          data: {
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            function: dto.function,
            status: ClientUserStatus.ACTIVE,
            emailVerified: true,
          },
        })
      : await this.prisma.clientUser.create({
          data: {
            email: dto.email.toLowerCase(),
            passwordHash,
            firstName: dto.firstName,
            lastName: dto.lastName,
            phone: dto.phone,
            function: dto.function,
            status: ClientUserStatus.ACTIVE,
            emailVerified: true,
          },
        });

    if (link.inspectionPlanId) {
      await this.grantPlanAccess(user.id, org, link.inspectionPlanId, link.createdBy);
    }
    await this.prisma.clientMagicLink.update({
      where: { id: link.id },
      data: { usedAt: new Date(), clientUserId: user.id },
    });

    return { ...(await this.issueTokens(user.id, user.email, meta)), user: this.publicUser(user) };
  }

  /**
   * Refresh-rotatie (stateful): zoekt het gehashte, niet-ingetrokken en niet-verlopen refresh-token
   * op, roteert het (oude wordt hard verwijderd, nieuw uitgegeven) en geeft een nieuw paar uit.
   * Herbevestigt de org-toegang binnen het subdomein.
   */
  async refresh(refreshToken: string, orgId: string | null, meta?: ClientSessionMeta) {
    const org = this.requireOrg(orgId);

    const stored = await this.prisma.clientRefreshToken.findFirst({
      where: {
        tokenHash: this.hashToken(refreshToken),
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { clientUser: true },
    });
    if (!stored) throw new UnauthorizedException('Ongeldig of verlopen refresh-token');

    const user = stored.clientUser;
    if (!user || user.status !== ClientUserStatus.ACTIVE) {
      throw new UnauthorizedException('Klantaccount niet gevonden of inactief');
    }
    await this.assertOrgAccess(user.id, org);

    // Rotatie: verwijder het gebruikte token vóór het uitgeven van een nieuw paar.
    await this.prisma.clientRefreshToken.delete({ where: { id: stored.id } });

    return {
      ...(await this.issueTokens(user.id, user.email, {
        ipAddress: meta?.ipAddress ?? stored.ipAddress ?? undefined,
        userAgent: meta?.userAgent ?? stored.userAgent ?? undefined,
      })),
      user: this.publicUser(user),
    };
  }

  /** Logout: trekt het meegegeven refresh-token in (idempotent — onbekende tokens zijn no-ops). */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken) return;
    await this.prisma.clientRefreshToken.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Wachtwoord-reset aanvragen: org-scoped reset-token + Resend-mail. Lekt nooit of een account bestaat. */
  async forgotPassword(email: string, orgId: string | null) {
    const generic = { message: 'Als er een account bestaat, is er een reset-e-mail verstuurd' };
    if (!orgId) return generic;

    const user = await this.prisma.clientUser.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) return generic;

    // Alleen resetten als de klant daadwerkelijk toegang heeft binnen deze org.
    const hasAccess = await this.prisma.clientAccess.findFirst({
      where: { clientUserId: user.id, contact: { orgId, isDeleted: false } },
      select: { id: true },
    });
    if (!hasAccess) return generic;

    const token = randomBytes(32).toString('hex');
    await this.prisma.clientMagicLink.create({
      data: {
        email: user.email,
        clientUserId: user.id,
        token,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });

    // Client reset links must point at the CLIENT portal, not the staff portal.
    // Prefer CLIENT_PUBLIC_URL; fall back to PUBLIC_URL for dev/back-compat (DEP-5).
    const baseUrl =
      this.config.get<string>('CLIENT_PUBLIC_URL') ??
      this.config.get<string>('PUBLIC_URL', 'http://localhost:5174');
    const resetUrl = `${baseUrl}/reset-password?token=${token}`;
    // Fire-and-forget: EmailService.sendPasswordReset logt bij falen (geen enumeratie).
    await this.email.sendPasswordReset(user.email, resetUrl, orgId).catch((e) => {
      this.logger.error(`Versturen reset-mail mislukt: ${(e as Error).message}`);
    });

    return generic;
  }

  async resetPassword(dto: ClientResetPasswordDto) {
    const link = await this.prisma.clientMagicLink.findUnique({ where: { token: dto.token } });
    if (!link || link.usedAt || link.expiresAt < new Date() || !link.clientUserId) {
      throw new BadRequestException('Reset-token ongeldig of verlopen');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    await this.prisma.$transaction([
      this.prisma.clientUser.update({ where: { id: link.clientUserId }, data: { passwordHash } }),
      this.prisma.clientMagicLink.update({ where: { id: link.id }, data: { usedAt: new Date() } }),
      // Trek alle bestaande sessies in — een wachtwoordwijziging beëindigt lopende sessies.
      this.prisma.clientRefreshToken.updateMany({
        where: { clientUserId: link.clientUserId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return { message: 'Wachtwoord succesvol gewijzigd' };
  }

  async getMe(clientUserId: string, orgId: string | null) {
    const org = this.requireOrg(orgId);
    const user = await this.prisma.clientUser.findUnique({ where: { id: clientUserId } });
    if (!user) throw new UnauthorizedException();
    // Alleen de toegang binnen DEZE org tonen.
    const access = await this.prisma.clientAccess.findMany({
      where: { clientUserId, contact: { orgId: org, isDeleted: false } },
      select: {
        role: true,
        contact: { select: { id: true, companyName: true, firstName: true, lastName: true } },
      },
    });
    return { ...this.publicUser(user), access };
  }

  private publicUser(u: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    function: string | null;
  }) {
    return {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
      function: u.function,
    };
  }

  /** "1h"/"30d"/"45m"/"30s" → seconden (fallback 3600). */
  private expiresInSeconds(value: string): number {
    const match = /^(\d+)([smhd])$/.exec(value);
    if (!match) return 3600;
    const num = parseInt(match[1], 10);
    const unit = match[2];
    const factor = { s: 1, m: 60, h: 3600, d: 86400 }[unit] ?? 3600;
    return num * factor;
  }
}
