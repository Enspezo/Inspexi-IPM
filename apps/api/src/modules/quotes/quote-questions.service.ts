import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { User, QuoteStatus, NotificationType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import { assertFound, publicTenantWhere } from '@/common';
import { TenantContext } from '@/common/interfaces/tenant-context.interface';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { AddQuestionDto } from './dto';
import { findQuoteForUser, getPublicUrl } from './quotes.helpers';

@Injectable()
export class QuoteQuestionsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private config: ConfigService,
    private entitlements: EntitlementsService,
  ) {}

  // Q&A (medewerker)
  async addQuestion(id: string, dto: AddQuestionDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    return this.prisma.quoteQuestion.create({
      data: { quoteId: quote.id, userId: user.id, message: dto.message, isFromClient: false },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getQuestions(id: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    return this.prisma.quoteQuestion.findMany({
      where: { quoteId: quote.id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async answerClientQuestion(id: string, questionId: string, dto: AddQuestionDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    const question = await this.prisma.quoteQuestion.findUnique({ where: { id: questionId } });
    if (!question || question.quoteId !== quote.id) throw new NotFoundException('Vraag niet gevonden');
    const answer = await this.prisma.quoteQuestion.create({
      data: { quoteId: quote.id, userId: user.id, message: dto.message, isFromClient: false },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    const contactEmail = (quote as any).contact?.email;
    if (contactEmail && quote.publicToken) {
      const org = await this.prisma.organization.findUnique({ where: { id: quote.orgId }, select: { name: true, senderName: true, senderEmail: true } });
      const quoteUrl = getPublicUrl(this.config, `/offerte/${quote.publicToken}`);
      this.emailService.sendQuoteAnswerEmail({ to: contactEmail, quoteNumber: quote.quoteNumber, answer: dto.message, quoteUrl, orgName: org?.name ?? 'InspeXi', senderName: org?.senderName, senderEmail: org?.senderEmail, orgId: quote.orgId }).catch(() => {});
    }
    return answer;
  }

  // Publieke webviewer
  async addClientQuestion(token: string, dto: AddQuestionDto, tenant?: TenantContext) {
    // B-152 (WP-B7): tenantbinding + entitlement tegen de eigenaar-org.
    const quote = assertFound(await this.prisma.quote.findFirst({
      where: { publicToken: token, ...publicTenantWhere(tenant, this.config, 'Offerte') },
      select: { id: true, orgId: true, quoteNumber: true, createdBy: true, status: true },
    }), 'Offerte');
    await this.entitlements.assertFeature(quote.orgId, 'CRM_COMPLEET');
    const unavailableStatuses: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (unavailableStatuses.includes(quote.status)) throw new ForbiddenException('Offerte is niet beschikbaar');
    const question = await this.prisma.quoteQuestion.create({ data: { quoteId: quote.id, userId: null, message: dto.message, isFromClient: true } });
    this.notifications.dispatch({ type: NotificationType.NIEUWE_VRAAG_KLANT, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Nieuwe vraag van klant', body: `Klant heeft een vraag gesteld bij offerte ${quote.quoteNumber}.`, entityType: 'quote', entityId: quote.id });
    return question;
  }
}
