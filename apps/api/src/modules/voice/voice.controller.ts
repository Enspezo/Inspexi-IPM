// Parse-endpoint (PWA-contract — stabiel houden) + publieke status.

import { Controller, Post, Get, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Public, Roles, CurrentUser, CurrentTenant } from '@/common/decorators';
import { ALL_STAFF } from '@/common/auth/roles';
import { VoiceParseService } from './voice-parse.service';
import { ParseMeasurementDto } from './dto';

const VOICE_USERS = ALL_STAFF;

@ApiTags('Voice')
@ApiBearerAuth()
@Controller('voice')
export class VoiceController {
  constructor(private readonly parse: VoiceParseService) {}

  @Get('status')
  @Public()
  @ApiOperation({ summary: 'Is voice-parsing beschikbaar?' })
  status() {
    return { success: true, data: { available: this.parse.isAvailable() } };
  }

  @Post('parse-measurement')
  @Roles(...VOICE_USERS)
  @ApiOperation({ summary: 'Gesproken meting → gestructureerde JSON (PWA-contract — stabiel houden)' })
  async parseMeasurement(
    @Body() dto: ParseMeasurementDto,
    @CurrentUser() user: User,
    @CurrentTenant('orgId') orgId: string | null,
  ) {
    const data = await this.parse.parseMeasurement({
      transcript: dto.transcript,
      templateId: dto.templateId,
      normTypeCode: dto.normTypeCode,
      userId: user.id,
      orgId: user.orgId ?? orgId,
    });
    return { success: true, data };
  }
}
