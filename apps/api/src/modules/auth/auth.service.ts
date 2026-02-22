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
import { JwtPayload } from '@/common/interfaces';
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

  async login(dto: LoginDto) {
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

    const accessToken = this.generateAccessToken(user);
    const refreshToken = await this.createRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  async refresh(refreshTokenRaw: string) {
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

    // Revoke old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Issue new tokens
    const accessToken = this.generateAccessToken(storedToken.user);
    const newRefreshToken = await this.createRefreshToken(storedToken.userId);

    return { accessToken, refreshToken: newRefreshToken };
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
      { sub: user.id, purpose: 'password-reset' },
      {
        secret: this.config.get<string>('JWT_SECRET'),
        expiresIn: '1h',
      },
    );

    const publicUrl = this.config.get<string>('PUBLIC_URL');
    const resetUrl = `${publicUrl}/reset-password?token=${resetToken}`;

    await this.emailService.sendPasswordReset(user.email, resetUrl);
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

  // ─── Private Helpers ───────────────────────────────────

  private generateAccessToken(user: {
    id: string;
    email: string;
    role: any;
    orgId: string | null;
  }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      orgId: user.orgId,
    };
    return this.jwtService.sign(payload);
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const rawToken = uuidv4();
    const tokenHash = this.hashToken(rawToken);

    const refreshExpiration = this.config.get<string>(
      'JWT_REFRESH_EXPIRATION',
      '30d',
    );
    const expiresAt = this.calculateExpiry(refreshExpiration);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
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
