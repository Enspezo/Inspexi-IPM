import { Injectable, BadRequestException } from '@nestjs/common';
import { User, Role, QuoteStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { SubmitApprovalDto, ApproveQuoteDto, RejectQuoteDto } from './dto';
import { findQuoteForUser } from './quotes.helpers';

@Injectable()
export class QuoteApprovalsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async submitForApproval(id: string, dto: SubmitApprovalDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (quote.status !== QuoteStatus.CONCEPT) throw new BadRequestException('Alleen offertes met status CONCEPT kunnen ter goedkeuring worden ingediend');
    if (!quote.requiresApproval) throw new BadRequestException('Deze offerte vereist geen goedkeuring');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quoteApprovalRequest.create({ data: { quoteId: quote.id, requestedBy: user.id, note: dto.note || undefined } });
      return tx.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.TER_GOEDKEURING } });
    });
    const managers = await this.prisma.user.findMany({ where: { orgId: quote.orgId, roles: { hasSome: [Role.MANAGER, Role.ORG_ADMIN] }, isActive: true }, select: { id: true } });
    this.notifications.dispatch({ type: NotificationType.OFFERTE_TER_GOEDKEURING, orgId: quote.orgId, recipientUserIds: managers.map((m) => m.id), title: 'Offerte ter goedkeuring', body: `Offerte ${quote.quoteNumber} staat klaar voor uw goedkeuring.`, entityType: 'quote', entityId: quote.id });
    return updated;
  }

  async approve(id: string, dto: ApproveQuoteDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (quote.status !== QuoteStatus.TER_GOEDKEURING) throw new BadRequestException('Alleen offertes met status TER_GOEDKEURING kunnen goedgekeurd worden');
    const updated = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.quoteApprovalRequest.findFirst({ where: { quoteId: quote.id, status: 'PENDING' }, orderBy: { requestedAt: 'desc' } });
      if (pending) await tx.quoteApprovalRequest.update({ where: { id: pending.id }, data: { status: 'APPROVED', reviewedBy: user.id, reviewedAt: new Date(), note: dto.note || pending.note } });
      return tx.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.GOEDGEKEURD, managerSignature: dto.managerSignature || null } });
    });
    this.notifications.dispatch({ type: NotificationType.OFFERTE_GOEDGEKEURD, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte goedgekeurd', body: `Offerte ${quote.quoteNumber} is goedgekeurd.`, entityType: 'quote', entityId: quote.id });
    return updated;
  }

  async reject(id: string, dto: RejectQuoteDto, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    if (quote.status !== QuoteStatus.TER_GOEDKEURING) throw new BadRequestException('Alleen offertes met status TER_GOEDKEURING kunnen afgewezen worden');
    const updated = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.quoteApprovalRequest.findFirst({ where: { quoteId: quote.id, status: 'PENDING' }, orderBy: { requestedAt: 'desc' } });
      if (pending) await tx.quoteApprovalRequest.update({ where: { id: pending.id }, data: { status: 'REJECTED', reviewedBy: user.id, reviewedAt: new Date(), note: dto.note } });
      return tx.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.CONCEPT } });
    });
    this.notifications.dispatch({ type: NotificationType.OFFERTE_AFGEWEZEN, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte afgewezen', body: `Offerte ${quote.quoteNumber} is afgewezen.`, entityType: 'quote', entityId: quote.id });
    return updated;
  }
}
