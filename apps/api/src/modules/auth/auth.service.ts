import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';
import { JwtPayload, TenantContext } from '@/common/interfaces';
import { Role } from '@prisma/client';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private config: ConfigService,
    private emailService: EmailService,
  ) {}

  async login(
    dto: LoginDto,
    ipAddress?: string,
    userAgent?: string,
    tenant?: TenantContext | null,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Ongeldige inloggegevens');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is gedeactiveerd');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Ongeldige inloggegevens');
    }

    // Tenant-aware login checks
    this.assertUserMatchesTenant(user, tenant);

    // "Onthoud mij" default aan; alleen expliciet false verkort de sessie.
    const remember = dto.remember !== false;
    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(
      user.id,
      ipAddress,
      userAgent,
      remember,
    );

    // Clean up expired and old revoked tokens for this user to keep the session list tidy
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [
          // Tokens that have expired naturally
          { expiresAt: { lt: new Date() } },
          // Tokens revoked more than 30 days ago (explicit logouts kept for 30 days)
          { revokedAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
        ],
      },
    });

    return { accessToken, refreshToken, remember };
  }

  async refresh(
    refreshTokenRaw: string,
    ipAddress?: string,
    userAgent?: string,
    tenant?: TenantContext | null,
  ) {
    const tokenHash = this.hashToken(refreshTokenRaw);

    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { user: true },
    });

    if (!storedToken) {
      throw new UnauthorizedException('Ongeldige of verlopen refresh token');
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedException('Account is gedeactiveerd');
    }

    // A refresh token from org A must not be redeemable on org B's subdomain
    // (the cookie is shared across *.inspexi.nl in production).
    this.assertUserMatchesTenant(storedToken.user, tenant);

    // Hard-delete old token on rotation — rotation artifacts don't need to be
    // kept as visible "ended sessions"; only explicit logouts are soft-deleted.
    await this.prisma.refreshToken.delete({
      where: { id: storedToken.id },
    });

    // Issue new tokens — carry forward IP/UA and the "onthoud mij"-keuze from the
    // original session (older tokens without the column default to remember=true).
    const remember = storedToken.rememberMe !== false;
    const accessToken = this.generateAccessToken(storedToken.user);
    const newRefreshToken = await this.createRefreshToken(
      storedToken.userId,
      ipAddress ?? storedToken.ipAddress ?? undefined,
      userAgent ?? storedToken.userAgent ?? undefined,
      remember,
    );

    return { accessToken, refreshToken: newRefreshToken, remember };
  }

  async logout(refreshTokenRaw: string) {
    const tokenHash = this.hashToken(refreshTokenRaw);

    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    // Always return success (security: don't reveal if email exists)
    if (!user) return;

    const resetToken = this.jwtService.sign(
      // E-mail in de token binden zodat een token nooit op een ander
      // (bijv. later hergebruikt of gewijzigd) account toegepast kan worden
      { sub: user.id, email: user.email, purpose: 'password-reset' },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '1h',
      },
    );

    const publicUrl = this.config.get<string>('PUBLIC_URL');
    const resetUrl = `${publicUrl}/reset-password?token=${resetToken}`;

    await this.emailService.sendPasswordReset(user.email, resetUrl, user.orgId);
  }

  async resetPassword(dto: ResetPasswordDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Ongeldige of verlopen reset token');
    }

    if (payload.purpose !== 'password-reset') {
      throw new BadRequestException('Ongeldige token');
    }

    // Valideer dat de token nog bij dit account hoort (e-mailbinding)
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true },
    });
    if (!user || !payload.email || user.email !== payload.email) {
      throw new BadRequestException('Ongeldige of verlopen reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { passwordHash },
    });

    // Revoke all refresh tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: { userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async verifyEmail(dto: VerifyEmailDto) {
    let payload: any;
    try {
      payload = this.jwtService.verify(dto.token, {
        secret: this.config.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BadRequestException('Ongeldige of verlopen verificatie token');
    }

    if (payload.purpose !== 'email-verify') {
      throw new BadRequestException('Ongeldige token');
    }

    await this.prisma.user.update({
      where: { id: payload.sub },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Gebruiker niet gevonden');
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  // ─── Session Management ──────────────────────────────────

  async getSessions(userId: string, currentRefreshTokenRaw?: string) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.refreshToken.findMany({
      where: {
        userId,
        OR: [
          // Active sessions (not revoked, not expired)
          { revokedAt: null, expiresAt: { gt: new Date() } },
          // Recently explicitly-revoked sessions (last 30 days) — from logout/revoke, not rotation
          { revokedAt: { gte: thirtyDaysAgo } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        expiresAt: true,
        revokedAt: true,
      },
    });

    const currentTokenHash = currentRefreshTokenRaw
      ? this.hashToken(currentRefreshTokenRaw)
      : null;

    // To mark the current session, we need to check the hash
    let currentSessionId: string | null = null;
    if (currentTokenHash) {
      const current = await this.prisma.refreshToken.findFirst({
        where: { tokenHash: currentTokenHash, revokedAt: null },
        select: { id: true },
      });
      currentSessionId = current?.id ?? null;
    }

    return sessions.map((s) => ({
      ...s,
      isCurrent: s.id === currentSessionId,
    }));
  }

  async revokeSession(userId: string, sessionId: string) {
    const session = await this.prisma.refreshToken.findFirst({
      where: { id: sessionId, userId, revokedAt: null },
    });

    if (!session) {
      throw new BadRequestException('Sessie niet gevonden of al beëindigd');
    }

    await this.prisma.refreshToken.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  async revokeOtherSessions(userId: string, currentRefreshTokenRaw: string) {
    const currentTokenHash = this.hashToken(currentRefreshTokenRaw);

    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
        tokenHash: { not: currentTokenHash },
      },
      data: { revokedAt: new Date() },
    });
  }

  // ─── Private Helpers ───────────────────────────────────

  /**
   * Enforce that the authenticating user is allowed on the current tenant host.
   * Shared by login and refresh so a token issued for org A cannot be used on
   * org B's subdomain. Unknown host (orgId null, not superuser domain) → no
   * restriction (E2E / direct IP); the TenantGuard fails those secure in prod.
   */
  private assertUserMatchesTenant(
    user: { orgId: string | null; roles: Role[] },
    tenant?: TenantContext | null,
  ): void {
    if (!tenant) {
      return;
    }

    if (tenant.isSuperuserDomain && tenant.orgId === null) {
      // Explicit SUPERUSER domain (mijn.inspexi.nl) — only SUPERUSER allowed
      if (!user.roles.includes(Role.SUPERUSER)) {
        throw new UnauthorizedException(
          'Gebruik het subdomein van uw organisatie om in te loggen',
        );
      }
    } else if (tenant.orgId !== null) {
      // Org subdomain — user must belong to this org (unless SUPERUSER)
      if (!user.roles.includes(Role.SUPERUSER) && user.orgId !== tenant.orgId) {
        throw new UnauthorizedException(
          'Uw account hoort niet bij deze organisatie',
        );
      }
    }
  }

  private generateAccessToken(user: {
    id: string;
    email: string;
    roles: any;
    orgId: string | null;
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      orgId: user.orgId,
    };
    return this.jwtService.sign(payload);
  }

  private async createRefreshToken(
    userId: string,
    ipAddress?: string,
    userAgent?: string,
    remember = true,
  ): Promise<string> {
    const rawToken = uuidv4();
    const tokenHash = this.hashToken(rawToken);

    // "Onthoud mij" → persistente 30-daagse sessie; anders een kortere,
    // glijdende sessie die (samen met de session-cookie) bij het sluiten van de
    // browser eindigt. De DB-vervaltijd is de harde bovengrens.
    const expiration = remember
      ? this.config.get<string>('JWT_REFRESH_EXPIRATION', '30d')
      : this.config.get<string>('JWT_REFRESH_SHORT_EXPIRATION', '12h');
    const expiresAt = this.calculateExpiry(expiration);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        ipAddress: ipAddress ?? null,
        userAgent: userAgent ?? null,
        rememberMe: remember,
      },
    });

    return rawToken;
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private calculateExpiry(duration: string): Date {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match) {
      return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // default 30 days
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };

    return new Date(Date.now() + value * multipliers[unit]);
  }
}
