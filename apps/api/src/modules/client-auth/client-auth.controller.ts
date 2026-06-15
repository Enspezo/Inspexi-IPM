// @Public() op klasniveau → de globale staf-JwtAuthGuard + TenantGuard slaan over.
// TenantMiddleware blijft draaien, dus @CurrentTenant() levert de org uit het subdomein.
// /me gebruikt ClientJwtAuthGuard. Auth-routes strenger gerate-limit.

import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Public, CurrentTenant } from '@/common/decorators';
import { ClientJwtAuthGuard } from '@/common/guards/client-jwt-auth.guard';
import {
  CurrentClientUser,
  type CurrentClientUserData,
} from '@/common/decorators/current-client-user.decorator';
import { ClientAuthService } from './client-auth.service';
import {
  ClientLoginDto,
  ClientRegisterDto,
  ValidateMagicLinkDto,
  ClientForgotPasswordDto,
  ClientResetPasswordDto,
  ClientRefreshDto,
} from './dto';

@ApiTags('Client Auth')
@Public()
@Controller('client/auth')
export class ClientAuthController {
  constructor(private readonly service: ClientAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Klant-login (binnen org-subdomein)' })
  async login(@Body() dto: ClientLoginDto, @CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.login(dto, orgId) };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({ summary: 'Registreren via uitnodigings-magic-link' })
  async register(@Body() dto: ClientRegisterDto, @CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.register(dto, orgId) };
  }

  @Post('magic-link')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @ApiOperation({ summary: 'Magic-link valideren' })
  async magicLink(@Body() dto: ValidateMagicLinkDto, @CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.validateMagicLink(dto.token, orgId) };
  }

  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Access-token verversen (refresh-rotatie)' })
  async refresh(@Body() dto: ClientRefreshDto, @CurrentTenant('orgId') orgId: string | null) {
    return { success: true, data: await this.service.refresh(dto.refreshToken, orgId) };
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
