import {
  Controller,
  Post,
  Get,
  Body,
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
import { Request, Response } from 'express';
import { User } from '@prisma/client';
import { AuthService } from './auth.service';
import { LoginDto, ForgotPasswordDto, ResetPasswordDto, VerifyEmailDto } from './dto';
import { Public, CurrentUser } from '@/common/decorators';

const REFRESH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
};

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login met e-mail en wachtwoord' })
  @ApiResponse({ status: 200, description: 'Retourneert access token, zet refresh cookie' })
  @ApiResponse({ status: 401, description: 'Ongeldige inloggegevens' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);
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

    const result = await this.authService.refresh(refreshToken);
    res.cookie('refresh_token', result.refreshToken, REFRESH_COOKIE_OPTIONS);
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
    res.clearCookie('refresh_token', { path: '/api/v1/auth' });
    return { success: true };
  }

  @Public()
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
}
