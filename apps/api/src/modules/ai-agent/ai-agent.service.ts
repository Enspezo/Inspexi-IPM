import { ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiConversation, User } from '@prisma/client';
import { assertFound } from '@/common';
import { PrismaService } from '@/prisma/prisma.service';
import { AI_AGENT_DEFAULT_MODEL } from './ai-config';
import { CreateConversationDto } from './dto';

/**
 * Conversatie-CRUD voor de AI-assistent (PRD-12). Gesprekken zijn privé per
 * gebruiker: elke query is gescoped op `orgId` + `userId`, dus andermans of
 * cross-tenant gesprekken geven 404 (geen bestaan prijsgeven).
 */
@Injectable()
export class AiAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /** Actueel geconfigureerd model (PRD-12 §5.5). */
  resolveModel(): string {
    return this.config.get<string>('AI_AGENT_MODEL', AI_AGENT_DEFAULT_MODEL);
  }

  /** De assistent vereist een organisatiecontext (superuser heeft er geen). */
  requireOrg(user: User): string {
    if (!user.orgId) {
      throw new ForbiddenException(
        'De AI-assistent vereist een organisatiecontext',
      );
    }
    return user.orgId;
  }

  async listConversations(user: User) {
    const orgId = this.requireOrg(user);
    return this.prisma.aiConversation.findMany({
      where: { orgId, userId: user.id, archivedAt: null },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        model: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async createConversation(user: User, dto: CreateConversationDto) {
    const orgId = this.requireOrg(user);
    return this.prisma.aiConversation.create({
      data: {
        orgId,
        userId: user.id,
        title: dto.title ?? null,
        model: this.resolveModel(),
      },
      select: { id: true, title: true, model: true, createdAt: true, updatedAt: true },
    });
  }

  /** Eén gesprek + berichten (chronologisch). 404 bij cross-tenant/andermans. */
  async getConversationWithMessages(id: string, user: User) {
    const orgId = this.requireOrg(user);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, orgId, userId: user.id },
      include: { messages: { orderBy: { createdAt: 'asc' } } },
    });
    return assertFound(conversation, 'Gesprek');
  }

  /** Eén gesprek zonder berichten (voor de runner). 404 als niet toegankelijk. */
  async getOwnedConversation(id: string, user: User): Promise<AiConversation> {
    const orgId = this.requireOrg(user);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id, orgId, userId: user.id },
    });
    return assertFound(conversation, 'Gesprek');
  }

  async archiveConversation(id: string, user: User) {
    // Scoping-check (404 bij niet-eigenaar/cross-tenant) vóór de update.
    await this.getOwnedConversation(id, user);
    await this.prisma.aiConversation.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return { id, archived: true };
  }
}
