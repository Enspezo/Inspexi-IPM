// Base-prompts (laag 1) — alleen SUPERUSER.

import { Controller, Get, Post, Patch, Delete, Param, Body, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles } from '@/common/decorators';
import { VoicePromptService } from './voice-prompt.service';
import { CreateBasePromptDto, UpdateBasePromptDto } from './dto';

@ApiTags('Voice Prompts (admin)')
@ApiBearerAuth()
@Roles(Role.SUPERUSER)
@Controller('admin/voice-prompts')
export class VoicePromptAdminController {
  constructor(private readonly prompts: VoicePromptService) {}

  @Get('base')
  @ApiOperation({ summary: 'Alle base-prompts' })
  async list() {
    return { success: true, data: await this.prompts.listBasePrompts() };
  }

  @Post('base')
  async create(@Body() dto: CreateBasePromptDto) {
    return { success: true, data: await this.prompts.createBasePrompt(dto) };
  }

  @Patch('base/:id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBasePromptDto) {
    return { success: true, data: await this.prompts.updateBasePrompt(id, dto) };
  }

  @Post('base/:id/activate')
  @ApiOperation({ summary: 'Eén base-prompt activeren (de rest wordt gedeactiveerd)' })
  async activate(@Param('id', ParseUUIDPipe) id: string) {
    return { success: true, data: await this.prompts.activateBasePrompt(id) };
  }

  @Delete('base/:id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.prompts.deleteBasePrompt(id);
    return { success: true };
  }
}
