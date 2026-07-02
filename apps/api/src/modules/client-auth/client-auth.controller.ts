// @Public() op klasniveau → de globale staf-JwtAuthGuard + TenantGuard slaan over.
// TenantMiddleware blijft draaien, dus @CurrentTenant() levert de org uit het subdomein.
// /me gebruikt ClientJwtAuthGuard. Auth-routes strenger gerate-limit.
//
// Het refresh-token is stateful (DB-gehasht, roteerbaar/intrekbaar) en wordt als httpOnly,
// secure, sameSite-cookie op pad /api/v1/client/auth gezet — nooit in de response-body.

import { Controller, Post, Get, Body, Req, Res, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientAuthService, ClientSessionMeta } from './client-auth.service';
import {
  ClientLoginDto,
  ClientRegisterDto,
  ValidateMagicLinkDto,
  ClientForgotPasswordDto,
  ClientResetPasswordDto,
} from './dto';

const CLIENT_REFRESH_COOKIE = 'client_refresh_token';

@ApiTags('Client Auth')
@Public()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('client/auth')
export class ClientAuthController {
  private readonly baseDomain: string;

  constructor(
    private readonly service: ClientAuthService,
    private readonly config: ConfigService,
  ) {
    this.baseDomain = this.config.get<string>('BASE_DOMAIN', 'localhost');
  }

  /** httpOnly, secure (buiten localhost), sameSite refresh-cookie, gescoped op de client-auth-routes. */
  private cookieOptions() {
    return {
      httpOnly: true,
      secure: this.baseDomain !== 'localhost',
      sameSite: 'lax' as const,
      path: '/api/v1/client/auth',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 dagen
      ...(this.baseDomain !== 'localhost' ? { domain: `.${this.baseDomain}` } : {}),
    };
  }

  private sessionMeta(req: Request): ClientSessionMeta {
    return {
      ipAddress: req.ip || req.socket?.remoteAddress || undefined,
      userAgent: req.headers['user-agent'],
    };
  }

  /** Zet de refresh-cookie en haalt het rauwe token uit de service-respons; de body krijgt 'm nooit. */
  private setRefreshCookie<T extends { refreshToken: string }>(
    res: Response,
    result: T,
  ): Omit<T, 'refreshToken'> {
    const { refreshToken, ...rest } = result;
    res.cookie(CLIENT_REFRESH_COOKIE, refreshToken, this.cookieOptions());
    return rest;
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Klant-login (binnen org-subdomein)' })
  async login(
    @Body() dto: ClientLoginDto,
    @CurrentTenant('orgId') orgId: string | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.login(dto, orgId, this.sessionMeta(req));
    return { success: true, data: this.setRefreshCookie(res, result) };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Registreren via uitnodigings-magic-link' })
  async register(
    @Body() dto: ClientRegisterDto,
    @CurrentTenant('orgId') orgId: string | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.register(dto, orgId, this.sessionMeta(req));
    return { success: true, data: this.setRefreshCookie(res, result) };
  }

  @Post('magic-link')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Magic-link valideren' })
  async magicLink(
    @Body() dto: ValidateMagicLinkDto,
    @CurrentTenant('orgId') orgId: string | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.service.validateMagicLink(dto.token, orgId, this.sessionMeta(req));
    // Alleen bij een bestaand account (requiresRegistration=false) is er een refresh-token.
    if ('refreshToken' in result) {
      return { success: true, data: this.setRefreshCookie(res, result) };
    }
    return { success: true, data: result };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Access-token verversen (refresh-rotatie via httpOnly-cookie)' })
  async refresh(
    @CurrentTenant('orgId') orgId: string | null,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[CLIENT_REFRESH_COOKIE];
    if (!refreshToken) {
      return { success: false, message: 'Geen refresh-token' };
    }
    const result = await this.service.refresh(refreshToken, orgId, this.sessionMeta(req));
    return { success: true, data: this.setRefreshCookie(res, result) };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Uitloggen: refresh-token intrekken en cookie wissen' })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[CLIENT_REFRESH_COOKIE];
    if (refreshToken) {
      await this.service.logout(refreshToken);
    }
    const { path, domain } = this.cookieOptions();
    res.clearCookie(CLIENT_REFRESH_COOKIE, { path, ...(domain ? { domain } : {}) });
    return { success: true };
  }

  @Post('forgot-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Wachtwoord-reset aanvragen (Resend-mail)' })
  async forgotPassword(
    @Body() dto: ClientForgotPasswordDto,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.forgotPassword(dto.email, orgId) };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Wachtwoord resetten met token' })
  async resetPassword(@Body() dto: ClientResetPasswordDto) {
    return { success: true, data: await this.service.resetPassword(dto) };
  }

  @Get('me')
  @UseGuards(ClientJwtAuthGuard)
  @ApiOperation({ summary: 'Huidige klantgebruiker + toegang binnen deze org' })
  async me(
    @CurrentClientUser() user: CurrentClientUserData,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    return { success: true, data: await this.service.getMe(user.id, orgId) };
  }
}
