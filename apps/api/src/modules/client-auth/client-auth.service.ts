// Tweede auth-realm, ONDER subdomein-tenancy: elke flow krijgt de org (orgId) uit het
// subdomein mee (@CurrentTenant). Een klant logt in op het subdomein van de inspectieorg en
// ziet alleen die org. ClientAccess koppelt ClientUser → Contact (Fase 1 keuze); de org-scope
// = de Contacten van deze org waar de klant toegang toe heeft.
//
// Geport uit de App-bron (../Inspexi-App/.../client-auth): wachtwoord-reset via Resend +
// reset-tokens (hergebruikt ClientMagicLink), refresh-rotatie (stateless, aparte secret), en
// de ClientAccess/InspectionClientAccess-grant bij magic-link-registratie — alles aangepast
// aan het Beheer-schema (Contact i.p.v. Client) en aan de subdomein-org-context.

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
import { randomBytes } from 'crypto';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';
import { ClientJwtPayload } from './client-jwt.strategy';
import {
  ClientLoginDto,
  ClientRegisterDto,
  ClientResetPasswordDto,
} from './dto';

const RESET_TTL_MS = 60 * 60 * 1000; // 1 uur

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

  private async issueTokens(clientUserId: string, email: string) {
    const payload: ClientJwtPayload = { sub: clientUserId, email, type: 'client' };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('CLIENT_JWT_SECRET'),
      expiresIn: this.config.get('CLIENT_JWT_EXPIRATION', '1h'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow('CLIENT_JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('CLIENT_JWT_REFRESH_EXPIRATION', '30d'),
    });
    return {
      accessToken,
      refreshToken,
      expiresIn: this.expiresInSeconds(this.config.get('CLIENT_JWT_EXPIRATION', '1h')),
    };
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

  async login(dto: ClientLoginDto, orgId: string | null) {
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
    return { ...(await this.issueTokens(user.id, user.email)), user: this.publicUser(user) };
  }

  /** Magic-link onboarding/login: token valideren binnen de org-context. */
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
      ...(await this.issueTokens(link.clientUser.id, link.clientUser.email)),
      user: this.publicUser(link.clientUser),
      inspectionPlanId: link.inspectionPlanId,
    };
  }

  /** Registratie via magic link: maakt/activeert ClientUser + auto-grant ClientAccess + InspectionClientAccess. */
  async register(dto: ClientRegisterDto, orgId: string | null) {
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

    return { ...(await this.issueTokens(user.id, user.email)), user: this.publicUser(user) };
  }

  /** Refresh-rotatie (stateless): valideert het refresh-token (aparte secret) en geeft een nieuw paar uit. */
  async refresh(refreshToken: string, orgId: string | null) {
    const org = this.requireOrg(orgId);
    let payload: ClientJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<ClientJwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('CLIENT_JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Ongeldig of verlopen refresh-token');
    }
    if (payload.type !== 'client') throw new UnauthorizedException('Ongeldig token-type');

    const user = await this.prisma.clientUser.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== ClientUserStatus.ACTIVE) {
      throw new UnauthorizedException('Klantaccount niet gevonden of inactief');
    }
    await this.assertOrgAccess(user.id, org);
    return { ...(await this.issueTokens(user.id, user.email)), user: this.publicUser(user) };
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

    const baseUrl = this.config.get<string>('PUBLIC_URL', 'http://localhost:5173');
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
