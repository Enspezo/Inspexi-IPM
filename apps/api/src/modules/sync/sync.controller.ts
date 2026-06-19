// Auth = interne user-JWT (globale JwtAuthGuard). Inspecteur + backoffice-rollen.
// X-Device-ID wordt in de body (deviceId) meegestuurd; header mag ook (zie @Headers).

import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { SyncService } from './sync.service';
import { PullQueryDto, PushDto, ResolveDto } from './dto';

const SYNC_ROLES = ALL_STAFF;

@ApiTags('Sync')
@ApiBearerAuth()
@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Get('pull')
  @Roles(...SYNC_ROLES)
  @ApiOperation({ summary: 'Wijzigingen ophalen sinds ?since (v2, entiteit-gegroepeerd)' })
  async pull(@CurrentUser() user: User, @Query() query: PullQueryDto) {
    return { success: true, data: await this.sync.pull(user, query.since) };
  }

  @Post('push')
  @Roles(...SYNC_ROLES)
  @ApiOperation({ summary: 'Lokale wijzigingen pushen (gegroepeerd per entiteit)' })
  async push(@CurrentUser() user: User, @Body() dto: PushDto) {
    return { success: true, data: await this.sync.push(user, dto) };
  }

  @Post('resolve')
  @Roles(...SYNC_ROLES)
  @ApiOperation({ summary: 'Sync-conflicten oplossen (client/server/merge)' })
  async resolve(@CurrentUser() user: User, @Body() dto: ResolveDto) {
    return { success: true, data: await this.sync.resolve(user, dto) };
  }
}
