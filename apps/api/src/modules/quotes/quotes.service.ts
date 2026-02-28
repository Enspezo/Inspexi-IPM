import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { User, Role, Prisma, QuoteStatus, RequestStatus, NotificationType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { StorageProvider, STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { PlanningService } from '../planning/planning.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  SetQuoteLinesDto,
  ListQuotesQueryDto,
  SubmitApprovalDto,
  ApproveQuoteDto,
  RejectQuoteDto,
  SendQuoteDto,
  AddQuestionDto,
  SignQuoteDto,
} from './dto';

const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.CONCEPT]: [QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD, QuoteStatus.VERLOPEN],
  [QuoteStatus.TER_GOEDKEURING]: [QuoteStatus.GOEDGEKEURD, QuoteStatus.CONCEPT, QuoteStatus.VERLOPEN],
  [QuoteStatus.GOEDGEKEURD]: [QuoteStatus.VERSTUURD, QuoteStatus.VERLOPEN],
  [QuoteStatus.VERSTUURD]: [QuoteStatus.BEKEKEN, QuoteStatus.VERLOPEN],
  [QuoteStatus.BEKEKEN]: [QuoteStatus.GEACCEPTEERD, QuoteStatus.AFGEWEZEN, QuoteStatus.VERLOPEN],
  [QuoteStatus.GEACCEPTEERD]: [],
  [QuoteStatus.AFGEWEZEN]: [],
  [QuoteStatus.VERLOPEN]: [],
};

function calculateLineTotal(quantity: number, unitPrice: number, discountPct: number): number {
  return Math.round(quantity * unitPrice * (1 - discountPct / 100) * 100) / 100;
}

const QUOTE_INCLUDE = {
  contact: { select: { id: true, type: true, companyName: true, firstName: true, lastName: true, email: true } },
  location: { select: { id: true, name: true, city: true, street: true, houseNumber: true, postalCode: true } },
  request: { select: { id: true, title: true } },
  template: { select: { id: true, name: true } },
  createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
  lines: {
    include: { product: { select: { id: true, name: true, unit: true, productGroupId: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
  approvalRequests: {
    include: {
      requestedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
      reviewedByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { requestedAt: 'desc' as const },
  },
  questions: {
    include: { user: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: 'asc' as const },
  },
  attachments: { orderBy: { sortOrder: 'asc' as const } },
};

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private config: ConfigService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private planningService: PlanningService,
    private customFieldsValidator: CustomFieldsValidator,
  ) {}

  private getPublicUrl(path: string): string {
    const baseUrl = this.config.get<string>('PUBLIC_URL', 'http://localhost:5173');
    return `${baseUrl}${path}`;
  }

  async findAll(user: User, query: ListQuotesQueryDto) {
    const { search, status, contactId, createdBy, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: Prisma.QuoteWhereInput = {};
    if (!user.roles.includes(Role.SUPERUSER)) where.orgId = user.orgId!;
    if (status) where.status = status;
    if (contactId) where.contactId = contactId;
    if (createdBy) where.createdBy = createdBy;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { contact: { OR: [{ companyName: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } },
      ];
    }
    const [data, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: {
          contact: { select: { id: true, type: true, companyName: true, firstName: true, lastName: true, email: true } },
          createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.quote.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const quote = await this.prisma.quote.findUnique({ where: { id }, include: QUOTE_INCLUDE });
    if (!quote) throw new NotFoundException('Offerte niet gevonden');
    if (!user.roles.includes(Role.SUPERUSER) && quote.orgId !== user.orgId) throw new ForbiddenException();
    return quote;
  }

  async create(dto: CreateQuoteDto, user: User) {
    let orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) throw new ForbiddenException('Geen organisatie gekoppeld');
    const contact = await this.prisma.contact.findUnique({ where: { id: dto.contactId } });
    if (!contact || contact.isDeleted) throw new NotFoundException('Relatie niet gevonden');
    if (!orgId && user.roles.includes(Role.SUPERUSER)) orgId = contact.orgId;
    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== orgId) throw new ForbiddenException('Relatie behoort niet tot uw organisatie');
    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({ where: { id: dto.locationId } });
      if (!location) throw new NotFoundException('Locatie niet gevonden');
      if (location.contactId !== dto.contactId) throw new ForbiddenException('Locatie behoort niet tot deze relatie');
    }
    let templateData: { coverBlocks?: any; contentBlocks?: any; closingBlocks?: any; defaultValidityDays?: number; requiresApproval?: boolean } = {};
    if (dto.templateId) {
      const template = await this.prisma.quoteTemplate.findUnique({ where: { id: dto.templateId } });
      if (!template || !template.isActive) throw new NotFoundException('Template niet gevonden');
      if (!user.roles.includes(Role.SUPERUSER) && template.orgId !== orgId) throw new ForbiddenException('Template behoort niet tot uw organisatie');
      templateData = { coverBlocks: template.coverBlocks, contentBlocks: template.contentBlocks, closingBlocks: template.closingBlocks, defaultValidityDays: template.defaultValidityDays, requiresApproval: template.requiresApproval };
    }
    let validUntil: Date | undefined;
    if (dto.validUntil) {
      validUntil = new Date(dto.validUntil);
    } else {
      const org = await this.prisma.organization.findUnique({ where: { id: orgId! } });
      const days = templateData.defaultValidityDays ?? org?.defaultValidityDays ?? 30;
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + days);
    }
    const customFields = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(orgId!, 'QUOTE', dto.customFields)
      : null;

    return this.prisma.$transaction(async (tx) => {
      const quoteNumber = await this.generateQuoteNumber(orgId!, tx);
      return tx.quote.create({
        data: {
          orgId: orgId!,
          quoteNumber,
          templateId: dto.templateId || undefined,
          requestId: dto.requestId || undefined,
          contactId: dto.contactId,
          locationId: dto.locationId || undefined,
          subject: dto.subject,
          coverBlocks: templateData.coverBlocks ?? undefined,
          contentBlocks: dto.contentBlocks ?? templateData.contentBlocks ?? undefined,
          closingBlocks: templateData.closingBlocks ?? undefined,
          validUntil,
          requiresApproval: templateData.requiresApproval ?? false,
          internalNotes: dto.internalNotes || undefined,
          createdBy: user.id,
          publicToken: randomUUID(),
          customFields: customFields as any,
        },
      });
    });
  }

  async update(id: string, dto: UpdateQuoteDto, user: User) {
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.CONCEPT) throw new BadRequestException('Alleen offertes met status CONCEPT kunnen bewerkt worden');

    let customFieldsData: any = undefined;
    if (dto.customFields !== undefined) {
      const merged = {
        ...((quote.customFields as Record<string, any>) ?? {}),
        ...dto.customFields,
      };
      customFieldsData = await this.customFieldsValidator.validateAndSanitize(
        quote.orgId, 'QUOTE', merged,
      );
    }

    return this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.contactId !== undefined && { contactId: dto.contactId }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.validUntil !== undefined && { validUntil: new Date(dto.validUntil) }),
        ...(dto.internalNotes !== undefined && { internalNotes: dto.internalNotes }),
        ...(dto.coverBlocks !== undefined && { coverBlocks: dto.coverBlocks }),
        ...(dto.contentBlocks !== undefined && { contentBlocks: dto.contentBlocks }),
        ...(dto.closingBlocks !== undefined && { closingBlocks: dto.closingBlocks }),
        ...(customFieldsData !== undefined && { customFields: customFieldsData as any }),
      },
    });
  }

  async setLines(id: string, dto: SetQuoteLinesDto, user: User) {
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.CONCEPT) throw new BadRequestException('Offerteregels kunnen alleen bij status CONCEPT gewijzigd worden');
    return this.prisma.$transaction(async (tx) => {
      await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
      let subtotal = 0, vatTotal = 0, discountTotal = 0;
      const lineData = dto.lines.map((line, index) => {
        const vatRate = line.vatRate ?? 21;
        const discountPct = line.discountPct ?? 0;
        const lineTotal = calculateLineTotal(line.quantity, line.unitPrice, discountPct);
        const fullPrice = Math.round(line.quantity * line.unitPrice * 100) / 100;
        subtotal += lineTotal;
        vatTotal += Math.round((lineTotal * vatRate) / 100 * 100) / 100;
        discountTotal += Math.round((fullPrice - lineTotal) * 100) / 100;
        return { quoteId: quote.id, productId: line.productId || undefined, description: line.description, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, vatRate, discountPct, lineTotal, sortOrder: line.sortOrder ?? index };
      });
      if (lineData.length > 0) await tx.quoteLine.createMany({ data: lineData });
      const total = Math.round((subtotal + vatTotal) * 100) / 100;
      return tx.quote.update({ where: { id: quote.id }, data: { subtotal, vatTotal, discountTotal, total }, include: { lines: { orderBy: { sortOrder: 'asc' } } } });
    });
  }

  async updateStatus(id: string, status: QuoteStatus, user: User) {
    const quote = await this.findOne(id, user);
    const validTargets = VALID_TRANSITIONS[quote.status];
    if (!validTargets.includes(status)) throw new BadRequestException(`Statusovergang van ${quote.status} naar ${status} is niet toegestaan`);
    const updated = await this.prisma.quote.update({ where: { id: quote.id }, data: { status } });
    if (status === QuoteStatus.VERSTUURD) {
      this.notifications.dispatch({ type: NotificationType.OFFERTE_VERSTUURD, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte verstuurd', body: `Offerte ${quote.quoteNumber} is naar de klant verstuurd.`, entityType: 'quote', entityId: quote.id });
    }
    return updated;
  }

  async sendQuote(id: string, dto: SendQuoteDto, user: User) {
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.GOEDGEKEURD && quote.status !== QuoteStatus.CONCEPT) {
      throw new BadRequestException('Alleen offertes met status CONCEPT of GOEDGEKEURD kunnen verstuurd worden');
    }
    const org = await this.prisma.organization.findUnique({ where: { id: quote.orgId }, select: { name: true, senderName: true, senderEmail: true } });
    let token = quote.publicToken;
    if (!token) {
      token = randomUUID();
      await this.prisma.quote.update({ where: { id: quote.id }, data: { publicToken: token } });
    }
    const quoteUrl = this.getPublicUrl(`/offerte/${token}`);
    await this.emailService.sendQuoteEmail({ to: dto.to, cc: dto.cc, subject: dto.subject, bodyText: dto.bodyText, quoteUrl, orgName: org?.name ?? 'InspeXi', senderName: org?.senderName, senderEmail: org?.senderEmail, orgId: quote.orgId, quoteNumber: quote.quoteNumber });
    const updated = await this.prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.VERSTUURD, sentAt: new Date() } });
    this.notifications.dispatch({ type: NotificationType.OFFERTE_VERSTUURD, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte verstuurd', body: `Offerte ${quote.quoteNumber} is naar ${dto.to} verstuurd.`, entityType: 'quote', entityId: quote.id });
    return updated;
  }

  async submitForApproval(id: string, dto: SubmitApprovalDto, user: User) {
    const quote = await this.findOne(id, user);
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
    const quote = await this.findOne(id, user);
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
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.TER_GOEDKEURING) throw new BadRequestException('Alleen offertes met status TER_GOEDKEURING kunnen afgewezen worden');
    const updated = await this.prisma.$transaction(async (tx) => {
      const pending = await tx.quoteApprovalRequest.findFirst({ where: { quoteId: quote.id, status: 'PENDING' }, orderBy: { requestedAt: 'desc' } });
      if (pending) await tx.quoteApprovalRequest.update({ where: { id: pending.id }, data: { status: 'REJECTED', reviewedBy: user.id, reviewedAt: new Date(), note: dto.note } });
      return tx.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.CONCEPT } });
    });
    this.notifications.dispatch({ type: NotificationType.OFFERTE_AFGEWEZEN, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte afgewezen', body: `Offerte ${quote.quoteNumber} is afgewezen.`, entityType: 'quote', entityId: quote.id });
    return updated;
  }

  async remove(id: string, user: User) {
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.CONCEPT) throw new BadRequestException('Alleen offertes met status CONCEPT kunnen verwijderd worden');
    await this.prisma.quote.delete({ where: { id: quote.id } });
    return { deleted: true };
  }

  // Q&A (medewerker)
  async addQuestion(id: string, dto: AddQuestionDto, user: User) {
    const quote = await this.findOne(id, user);
    return this.prisma.quoteQuestion.create({
      data: { quoteId: quote.id, userId: user.id, message: dto.message, isFromClient: false },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  async getQuestions(id: string, user: User) {
    const quote = await this.findOne(id, user);
    return this.prisma.quoteQuestion.findMany({
      where: { quoteId: quote.id },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async answerClientQuestion(id: string, questionId: string, dto: AddQuestionDto, user: User) {
    const quote = await this.findOne(id, user);
    const question = await this.prisma.quoteQuestion.findUnique({ where: { id: questionId } });
    if (!question || question.quoteId !== quote.id) throw new NotFoundException('Vraag niet gevonden');
    const answer = await this.prisma.quoteQuestion.create({
      data: { quoteId: quote.id, userId: user.id, message: dto.message, isFromClient: false },
      include: { user: { select: { id: true, firstName: true, lastName: true } } },
    });
    const contactEmail = (quote as any).contact?.email;
    if (contactEmail && quote.publicToken) {
      const org = await this.prisma.organization.findUnique({ where: { id: quote.orgId }, select: { name: true, senderName: true, senderEmail: true } });
      const quoteUrl = this.getPublicUrl(`/offerte/${quote.publicToken}`);
      this.emailService.sendQuoteAnswerEmail({ to: contactEmail, quoteNumber: quote.quoteNumber, answer: dto.message, quoteUrl, orgName: org?.name ?? 'InspeXi', senderName: org?.senderName, senderEmail: org?.senderEmail, orgId: quote.orgId }).catch(() => {});
    }
    return answer;
  }

  // Bijlagen (intern)
  async getAttachments(id: string, user: User) {
    const quote = await this.findOne(id, user);
    return this.prisma.quoteAttachment.findMany({ where: { quoteId: quote.id }, orderBy: { sortOrder: 'asc' } });
  }

  async uploadAttachment(id: string, file: Express.Multer.File, user: User) {
    const quote = await this.findOne(id, user);
    const storageKey = `${quote.orgId}/quotes/${quote.id}/${randomUUID()}-${file.originalname}`;
    await this.storage.upload(storageKey, file.buffer, file.mimetype);
    const count = await this.prisma.quoteAttachment.count({ where: { quoteId: quote.id } });
    return this.prisma.quoteAttachment.create({
      data: { quoteId: quote.id, storageKey, fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size, isStandard: false, sortOrder: count },
    });
  }

  async downloadAttachment(id: string, attachmentId: string, user: User) {
    const quote = await this.findOne(id, user);
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }

  async deleteAttachment(id: string, attachmentId: string, user: User) {
    const quote = await this.findOne(id, user);
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    await this.storage.delete(attachment.storageKey);
    await this.prisma.quoteAttachment.delete({ where: { id: attachmentId } });
    return { deleted: true };
  }

  // Publieke webviewer
  async findByPublicToken(token: string) {
    const quote = await this.prisma.quote.findUnique({
      where: { publicToken: token },
      include: {
        ...QUOTE_INCLUDE,
        organization: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
      },
    });
    if (!quote) throw new NotFoundException('Offerte niet gevonden');
    const notSentStatuses: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (notSentStatuses.includes(quote.status)) {
      throw new ForbiddenException('Offerte is nog niet verstuurd');
    }
    if (!quote.viewedAt) {
      await this.prisma.quote.update({
        where: { id: quote.id },
        data: { viewedAt: new Date(), status: quote.status === QuoteStatus.VERSTUURD ? QuoteStatus.BEKEKEN : quote.status },
      });
      this.notifications.dispatch({ type: NotificationType.OFFERTE_BEKEKEN, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte bekeken', body: `Klant heeft offerte ${quote.quoteNumber} voor het eerst geopend.`, entityType: 'quote', entityId: quote.id });
    }
    return quote;
  }

  async addClientQuestion(token: string, dto: AddQuestionDto) {
    const quote = await this.prisma.quote.findUnique({
      where: { publicToken: token },
      select: { id: true, orgId: true, quoteNumber: true, createdBy: true, status: true },
    });
    if (!quote) throw new NotFoundException('Offerte niet gevonden');
    const unavailableStatuses: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (unavailableStatuses.includes(quote.status)) throw new ForbiddenException('Offerte is niet beschikbaar');
    const question = await this.prisma.quoteQuestion.create({ data: { quoteId: quote.id, userId: null, message: dto.message, isFromClient: true } });
    this.notifications.dispatch({ type: NotificationType.NIEUWE_VRAAG_KLANT, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Nieuwe vraag van klant', body: `Klant heeft een vraag gesteld bij offerte ${quote.quoteNumber}.`, entityType: 'quote', entityId: quote.id });
    return question;
  }

  async signQuote(token: string, dto: SignQuoteDto, clientIp?: string, userAgent?: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token }, include: { organization: { select: { name: true } } } });
    if (!quote) throw new NotFoundException('Offerte niet gevonden');
    if (quote.status !== QuoteStatus.VERSTUURD && quote.status !== QuoteStatus.BEKEKEN) throw new BadRequestException('Offerte kan niet worden ondertekend in de huidige status');
    if (quote.signedAt) throw new BadRequestException('Offerte is al ondertekend');
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.GEACCEPTEERD, signedAt: new Date(), clientName: dto.clientName, clientSignature: dto.signature || null, clientIp: clientIp || null, clientUserAgent: userAgent || null, viewedAt: quote.viewedAt ?? new Date() },
    });
    const managers = await this.prisma.user.findMany({ where: { orgId: quote.orgId, roles: { hasSome: [Role.MANAGER, Role.ORG_ADMIN] }, isActive: true }, select: { id: true } });
    const recipientIds = [...new Set([quote.createdBy, ...managers.map((m) => m.id)])];
    this.notifications.dispatch({ type: NotificationType.OFFERTE_ONDERTEKEND, orgId: quote.orgId, recipientUserIds: recipientIds, title: 'Offerte ondertekend', body: `${dto.clientName} heeft offerte ${quote.quoteNumber} ondertekend.`, entityType: 'quote', entityId: quote.id });
    // Auto-create planning item on quote acceptance
    this.planningService.createFromQuote({
      id: quote.id,
      orgId: quote.orgId,
      contactId: quote.contactId,
      locationId: quote.locationId ?? null,
      createdBy: quote.createdBy,
      quoteNumber: quote.quoteNumber,
    }).catch((err) => this.logger.error('Failed to create planning item for quote', err));
    return { success: true, signedAt: updated.signedAt };
  }

  async downloadPublicAttachment(token: string, attachmentId: string) {
    const quote = await this.prisma.quote.findUnique({ where: { publicToken: token }, select: { id: true, status: true } });
    if (!quote) throw new NotFoundException('Offerte niet gevonden');
    const unavailableStatusesForDownload: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (unavailableStatusesForDownload.includes(quote.status)) throw new ForbiddenException('Offerte is niet beschikbaar');
    const attachment = await this.prisma.quoteAttachment.findUnique({ where: { id: attachmentId } });
    if (!attachment || attachment.quoteId !== quote.id) throw new NotFoundException('Bijlage niet gevonden');
    const buffer = await this.storage.download(attachment.storageKey);
    return { buffer, attachment };
  }

  // Price resolution
  async resolvePrice(productId: string, contactId: string, quantity: number, user: User) {
    const product = await this.prisma.product.findUnique({ where: { id: productId } });
    if (!product) throw new NotFoundException('Product niet gevonden');
    if (!user.roles.includes(Role.SUPERUSER) && product.orgId !== user.orgId) throw new ForbiddenException();
    const contactTables = await this.prisma.contactPriceTable.findMany({
      where: { contactId },
      include: { priceTable: { include: { items: { where: { productId }, include: { tiers: { orderBy: { fromQty: 'asc' } } } } } } },
    });
    let priceTableItem: any = null;
    for (const cpt of contactTables) {
      const item = cpt.priceTable.items.find((i) => i.productId === productId);
      if (item) { priceTableItem = item; break; }
    }
    if (!priceTableItem) {
      const defaultTable = await this.prisma.priceTable.findFirst({ where: { orgId: product.orgId, isDefault: true }, include: { items: { where: { productId }, include: { tiers: { orderBy: { fromQty: 'asc' } } } } } });
      priceTableItem = defaultTable?.items.find((i) => i.productId === productId) ?? null;
    }
    let unitPrice = 0;
    if (priceTableItem) {
      if (priceTableItem.priceType === 'FIXED') unitPrice = priceTableItem.basePrice ?? 0;
      else if (priceTableItem.priceType === 'TIERED') {
        for (const tier of priceTableItem.tiers) {
          if (quantity >= tier.fromQty && (tier.toQty === null || quantity <= tier.toQty)) { unitPrice = tier.price; break; }
        }
      }
    }
    return { unitPrice, vatRate: product.defaultVat, unit: product.unit };
  }

  async createFromRequest(requestId: string, user: User) {
    const request = await this.prisma.request.findUnique({ where: { id: requestId } });
    if (!request || request.isDeleted) throw new NotFoundException('Aanvraag niet gevonden');
    if (!user.roles.includes(Role.SUPERUSER) && request.orgId !== user.orgId) throw new ForbiddenException();
    return this.prisma.$transaction(async (tx) => {
      const quoteNumber = await this.generateQuoteNumber(request.orgId, tx);
      const org = await tx.organization.findUnique({ where: { id: request.orgId } });
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + (org?.defaultValidityDays ?? 30));
      const quote = await tx.quote.create({
        data: { orgId: request.orgId, quoteNumber, requestId: request.id, contactId: request.contactId, locationId: request.locationId || undefined, subject: request.title, validUntil, createdBy: user.id, publicToken: randomUUID() },
      });
      await tx.request.update({ where: { id: request.id }, data: { status: RequestStatus.OFFERTE_GEMAAKT } });
      await tx.requestStatusHistory.create({ data: { requestId: request.id, fromStatus: request.status, toStatus: RequestStatus.OFFERTE_GEMAAKT, changedBy: user.id, note: `Offerte ${quoteNumber} aangemaakt` } });
      return quote;
    });
  }

  async generatePdf(id: string, user: User): Promise<{ buffer: Buffer; quoteNumber: string }> {
    const quote = await this.findOne(id, user);
    if (!quote.publicToken) throw new BadRequestException('Offerte heeft geen publiek token. Verstuur de offerte eerst.');
    const puppeteer = await import('puppeteer');
    const publicUrl = this.getPublicUrl(`/offerte/${quote.publicToken}`);
    const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    try {
      const page = await browser.newPage();
      await page.goto(publicUrl, { waitUntil: 'networkidle0', timeout: 30000 });
      const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' } });
      return { buffer: Buffer.from(pdfBuffer), quoteNumber: quote.quoteNumber };
    } finally {
      await browser.close();
    }
  }

  private async generateQuoteNumber(orgId: string, tx: Prisma.TransactionClient): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OFF-${year}-`;
    const latestQuote = await tx.quote.findFirst({ where: { orgId, quoteNumber: { startsWith: prefix } }, orderBy: { quoteNumber: 'desc' }, select: { quoteNumber: true } });
    let sequence = 1;
    if (latestQuote) {
      const parts = latestQuote.quoteNumber.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) sequence = lastSeq + 1;
    }
    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }
}
