import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto';
import { Public, CurrentUser } from '@/common/decorators';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  private readonly baseDomain: string;

  constructor(
    private authService: AuthService,
    private config: ConfigService,
  ) {
    this.baseDomain = this.config.get<string>('BASE_DOMAIN', 'localhost');
  }

  /**
   * Build cookie options with correct domain for subdomain support.
   * remember=true → persistent 30-day cookie; remember=false → session cookie
   * (no maxAge) that the browser drops when it closes.
   */
  private getCookieOptions(remember = true) {
    return {
      httpOnly: true,
      secure: this.baseDomain !== 'localhost',
      sameSite: 'lax' as const,
      path: '/api/v1/auth',
      ...(remember ? { maxAge: 30 * 24 * 60 * 60 * 1000 } : {}), // 30 days or session cookie
      // localhost: no domain set (cookie stays on exact hostname)
      // production: .inspexi.nl (shared across all subdomains)
      ...(this.baseDomain !== 'localhost'
        ? { domain: `.${this.baseDomain}` }
        : {}),
    };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login met e-mail en wachtwoord' })
  @ApiResponse({ status: 200, description: 'Retourneert access token, zet refresh cookie' })
  @ApiResponse({ status: 401, description: 'Ongeldige inloggegevens' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const ip = req.ip || req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await this.authService.login(dto, ip, ua, req.tenant);
    res.cookie(
      'refresh_token',
      result.refreshToken,
      this.getCookieOptions(result.remember),
    );
    return { success: true, data: { accessToken: result.accessToken } };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vernieuw access token via httpOnly cookie' })
  @ApiResponse({ status: 200, description: 'Retourneert nieuw access token' })
  @ApiResponse({ status: 401, description: 'Ongeldige of verlopen refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (!refreshToken) {
      return { success: false, message: 'Geen refresh token' };
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const ua = req.headers['user-agent'];
    const result = await this.authService.refresh(refreshToken, ip, ua, req.tenant);
    res.cookie(
      'refresh_token',
      result.refreshToken,
      this.getCookieOptions(result.remember),
    );
    return { success: true, data: { accessToken: result.accessToken } };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Uitloggen en refresh token intrekken' })
  @ApiResponse({ status: 200, description: 'Uitgelogd' })
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    const clearOptions = this.getCookieOptions();
    res.clearCookie('refresh_token', {
      path: clearOptions.path,
      ...(clearOptions.domain ? { domain: clearOptions.domain } : {}),
    });
    return { success: true };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stuur wachtwoord reset e-mail' })
  @ApiResponse({ status: 200, description: 'Als het e-mailadres bestaat, is een reset link verstuurd' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    return {
      success: true,
      message: 'Als het e-mailadres bestaat, is een reset link verstuurd',
    };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset wachtwoord met token' })
  @ApiResponse({ status: 200, description: 'Wachtwoord is gereset' })
  @ApiResponse({ status: 400, description: 'Ongeldige of verlopen token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { success: true, message: 'Wachtwoord is gereset' };
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Huidig ingelogde gebruiker + organisatie info' })
  @ApiResponse({ status: 200, description: 'Gebruikersprofiel' })
  @ApiResponse({ status: 401, description: 'Niet geautoriseerd' })
  async me(@CurrentUser() user: User) {
    const data = await this.authService.getMe(user.id);
    return { success: true, data };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bevestig e-mailadres met token' })
  @ApiResponse({ status: 200, description: 'E-mail bevestigd' })
  @ApiResponse({ status: 400, description: 'Ongeldige of verlopen token' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { success: true, message: 'E-mail bevestigd' };
  }

  // ─── Session Management ─────────────────────────────────

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lijst van alle sessies (actief + historisch)' })
  @ApiResponse({ status: 200, description: 'Lijst van sessies' })
  async getSessions(
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    const data = await this.authService.getSessions(user.id, refreshToken);
    return { success: true, data };
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Beëindig een specifieke sessie' })
  @ApiResponse({ status: 200, description: 'Sessie beëindigd' })
  @ApiResponse({ status: 400, description: 'Sessie niet gevonden' })
  async revokeSession(
    @CurrentUser() user: User,
    @Param('id') sessionId: string,
  ) {
    await this.authService.revokeSession(user.id, sessionId);
    return { success: true, message: 'Sessie beëindigd' };
  }

  @Delete('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Beëindig alle andere sessies' })
  @ApiResponse({ status: 200, description: 'Overige sessies beëindigd' })
  async revokeOtherSessions(
    @CurrentUser() user: User,
    @Req() req: Request,
  ) {
    const refreshToken = req.cookies?.['refresh_token'];
    if (refreshToken) {
      await this.authService.revokeOtherSessions(user.id, refreshToken);
    }
    return { success: true, message: 'Overige sessies beëindigd' };
  }
}
