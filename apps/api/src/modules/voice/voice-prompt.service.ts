// 3-lagen prompt-model voor voice-parsing:
//   1. Base prompt (VoiceBasePrompt, superuser, één actief)
//   1b. Norm-context (normTypeCode)
//   2. Template-prompt (VoiceTemplatePrompt, per org + meetstaat)
//   3. User-prompt (VoiceUserPrompt, persoonlijk; globaal + per template)
// buildCombinedPrompt(...) voegt ze samen tot de system-prompt voor Claude.

import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '@/prisma';
import { DEFAULT_VOICE_BASE_PROMPT } from './default-base-prompt';
import {
  CreateBasePromptDto, UpdateBasePromptDto, UpsertTemplatePromptDto, UpsertUserPromptDto,
} from './dto';

@Injectable()
export class VoicePromptService {
  private readonly logger = new Logger(VoicePromptService.name);
  constructor(private prisma: PrismaService) {}

  // ── Base prompts (superuser) ──
  listBasePrompts() {
    return this.prisma.voiceBasePrompt.findMany({ orderBy: [{ isActive: 'desc' }, { version: 'desc' }] });
  }
  async getActiveBasePrompt() {
    const p = await this.prisma.voiceBasePrompt.findFirst({ where: { isActive: true } });
    if (!p) throw new NotFoundException('Geen actieve base-prompt geconfigureerd');
    return p;
  }
  async getBasePromptById(id: string) {
    const p = await this.prisma.voiceBasePrompt.findUnique({ where: { id } });
    if (!p) throw new NotFoundException('Base-prompt niet gevonden');
    return p;
  }
  createBasePrompt(dto: CreateBasePromptDto) {
    return this.prisma.voiceBasePrompt.create({
      data: { name: dto.name, content: dto.content, isActive: dto.isActive ?? false },
    });
  }
  async updateBasePrompt(id: string, dto: UpdateBasePromptDto) {
    await this.getBasePromptById(id);
    return this.prisma.voiceBasePrompt.update({
      where: { id }, data: { ...dto, version: { increment: 1 } },
    });
  }
  async activateBasePrompt(id: string) {
    await this.getBasePromptById(id);
    await this.prisma.$transaction([
      this.prisma.voiceBasePrompt.updateMany({ where: { isActive: true }, data: { isActive: false } }),
      this.prisma.voiceBasePrompt.update({ where: { id }, data: { isActive: true } }),
    ]);
    return this.getBasePromptById(id);
  }
  async deleteBasePrompt(id: string) {
    const p = await this.getBasePromptById(id);
    if (p.isActive) throw new ForbiddenException('Actieve base-prompt kan niet verwijderd worden');
    return this.prisma.voiceBasePrompt.delete({ where: { id } });
  }

  // ── Template-prompts (org-admin) ──
  listTemplatePrompts(orgId: string) {
    return this.prisma.voiceTemplatePrompt.findMany({
      where: { orgId }, include: { template: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' },
    });
  }
  getTemplatePrompt(templateId: string, orgId: string) {
    return this.prisma.voiceTemplatePrompt.findUnique({ where: { orgId_templateId: { orgId, templateId } } });
  }
  upsertTemplatePrompt(templateId: string, orgId: string, dto: UpsertTemplatePromptDto) {
    return this.prisma.voiceTemplatePrompt.upsert({
      where: { orgId_templateId: { orgId, templateId } },
      update: { content: dto.content, isActive: dto.isActive ?? true },
      create: { templateId, orgId, content: dto.content, isActive: dto.isActive ?? true },
    });
  }
  deleteTemplatePrompt(templateId: string, orgId: string) {
    return this.prisma.voiceTemplatePrompt.delete({ where: { orgId_templateId: { orgId, templateId } } });
  }

  // ── User-prompts (eigen) ──
  listUserPrompts(userId: string) {
    return this.prisma.voiceUserPrompt.findMany({
      where: { userId }, include: { template: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' },
    });
  }
  getUserPrompt(userId: string, templateId: string | null) {
    return this.prisma.voiceUserPrompt.findFirst({ where: { userId, templateId: templateId ?? null } });
  }
  async upsertUserPrompt(userId: string, dto: UpsertUserPromptDto) {
    const templateId = dto.templateId ?? null;
    const existing = await this.prisma.voiceUserPrompt.findFirst({ where: { userId, templateId } });
    if (existing) {
      return this.prisma.voiceUserPrompt.update({
        where: { id: existing.id }, data: { content: dto.content, isActive: dto.isActive ?? true },
      });
    }
    return this.prisma.voiceUserPrompt.create({
      data: { userId, templateId, content: dto.content, isActive: dto.isActive ?? true },
    });
  }
  async deleteUserPrompt(id: string, userId: string) {
    const p = await this.prisma.voiceUserPrompt.findFirst({ where: { id, userId } });
    if (!p) throw new NotFoundException('User-prompt niet gevonden');
    return this.prisma.voiceUserPrompt.delete({ where: { id } });
  }

  // ── Combined prompt (voor parsing) ──
  async buildCombinedPrompt(
    templateId?: string, userId?: string, orgId?: string | null, normTypeCode?: string,
  ): Promise<string> {
    const sections: string[] = [];
    try {
      sections.push((await this.getActiveBasePrompt()).content);
    } catch {
      sections.push(this.getDefaultBasePrompt());
      this.logger.warn('Geen actieve base-prompt — fallback gebruikt');
    }
    if (normTypeCode) {
      sections.push(`\n\n---\n## Norm Context\n\nDeze inspectie volgt: **${normTypeCode}**. Pas beoordeling/grenswaardes daarop aan.`);
    }
    if (templateId && orgId) {
      const tp = await this.getTemplatePrompt(templateId, orgId);
      if (tp?.isActive && tp.content) sections.push(`\n\n---\n## Template-instructies\n\n${tp.content}`);
    }
    if (userId) {
      const g = await this.getUserPrompt(userId, null);
      if (g?.isActive && g.content) sections.push(`\n\n---\n## Persoonlijke voorkeuren\n\n${g.content}`);
      if (templateId) {
        const tu = await this.getUserPrompt(userId, templateId);
        if (tu?.isActive && tu.content) sections.push(`\n\n---\n## Persoonlijke voorkeuren (dit template)\n\n${tu.content}`);
      }
    }
    return sections.join('');
  }

  /** Fallback wanneer er geen actieve VoiceBasePrompt in de database staat.
   *  De volledige NL-domeinprompt staat in default-base-prompt.ts (geport uit de App-bron). */
  private getDefaultBasePrompt(): string {
    return DEFAULT_VOICE_BASE_PROMPT;
  }
}
