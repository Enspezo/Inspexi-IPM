// Template-prompts (org-admin, per org via user.orgId) + user-prompts (eigen) + combined-preview.

import {
  Controller, Get, Put, Delete, Param, Body, Query, ParseUUIDPipe, BadRequestException,
} from '@nestjs/common';
import { RequiresFeature } from '@/common/decorators/requires-feature.decorator';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { Roles, CurrentUser } from '@/common/decorators';
import { ALL_STAFF, ORG_ADMINS } from '@/common/auth/roles';
import { VoicePromptService } from './voice-prompt.service';
import { UpsertTemplatePromptDto, UpsertUserPromptDto } from './dto';

const VOICE_USERS = ALL_STAFF;

@ApiTags('Voice Prompts')
@ApiBearerAuth()
@RequiresFeature('BASIS_INSPECTIES')
@Controller('voice-prompts')
export class VoicePromptsController {
  constructor(private readonly prompts: VoicePromptService) {}

  private orgOf(user: User): string {
    if (!user.orgId) throw new BadRequestException('Selecteer eerst een organisatie');
    return user.orgId;
  }

  // ── Combined (preview / PWA) ──
  @Get('combined')
  @Roles(...VOICE_USERS)
  @ApiOperation({ summary: 'Samengestelde prompt (base + norm + template + user)' })
  async combined(
    @CurrentUser() user: User,
    @Query('templateId') templateId?: string,
    @Query('normTypeCode') normTypeCode?: string,
  ) {
    const data = await this.prompts.buildCombinedPrompt(templateId, user.id, user.orgId, normTypeCode);
    return { success: true, data: { prompt: data } };
  }

  // ── Template-prompts (org-admin) ──
  @Get('template')
  @Roles(...ORG_ADMINS)
  async listTemplate(@CurrentUser() user: User) {
    return { success: true, data: await this.prompts.listTemplatePrompts(this.orgOf(user)) };
  }

  @Get('template/:templateId')
  @Roles(...ORG_ADMINS)
  async getTemplate(@Param('templateId', ParseUUIDPipe) templateId: string, @CurrentUser() user: User) {
    return { success: true, data: await this.prompts.getTemplatePrompt(templateId, this.orgOf(user)) };
  }

  @Put('template/:templateId')
  @Roles(...ORG_ADMINS)
  async upsertTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @CurrentUser() user: User,
    @Body() dto: UpsertTemplatePromptDto,
  ) {
    return { success: true, data: await this.prompts.upsertTemplatePrompt(templateId, this.orgOf(user), dto) };
  }

  @Delete('template/:templateId')
  @Roles(...ORG_ADMINS)
  async deleteTemplate(@Param('templateId', ParseUUIDPipe) templateId: string, @CurrentUser() user: User) {
    await this.prompts.deleteTemplatePrompt(templateId, this.orgOf(user));
    return { success: true };
  }

  // ── User-prompts (eigen) ──
  @Get('user')
  @Roles(...VOICE_USERS)
  async listUser(@CurrentUser() user: User) {
    return { success: true, data: await this.prompts.listUserPrompts(user.id) };
  }

  @Put('user')
  @Roles(...VOICE_USERS)
  async upsertUser(@CurrentUser() user: User, @Body() dto: UpsertUserPromptDto) {
    return { success: true, data: await this.prompts.upsertUserPrompt(user.id, dto) };
  }

  @Delete('user/:id')
  @Roles(...VOICE_USERS)
  async deleteUser(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: User) {
    await this.prompts.deleteUserPrompt(id, user.id);
    return { success: true };
  }
}
