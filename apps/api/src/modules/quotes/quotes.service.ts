import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Role, Prisma, QuoteStatus, RequestStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  SetQuoteLinesDto,
  ListQuotesQueryDto,
  SubmitApprovalDto,
  ApproveQuoteDto,
  RejectQuoteDto,
} from './dto';

// Valid status transitions
const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  [QuoteStatus.CONCEPT]: [
    QuoteStatus.TER_GOEDKEURING,
    QuoteStatus.GOEDGEKEURD,
    QuoteStatus.VERLOPEN,
  ],
  [QuoteStatus.TER_GOEDKEURING]: [
    QuoteStatus.GOEDGEKEURD,
    QuoteStatus.CONCEPT,
    QuoteStatus.VERLOPEN,
  ],
  [QuoteStatus.GOEDGEKEURD]: [QuoteStatus.VERSTUURD, QuoteStatus.VERLOPEN],
  [QuoteStatus.VERSTUURD]: [QuoteStatus.BEKEKEN, QuoteStatus.VERLOPEN],
  [QuoteStatus.BEKEKEN]: [
    QuoteStatus.GEACCEPTEERD,
    QuoteStatus.AFGEWEZEN,
    QuoteStatus.VERLOPEN,
  ],
  [QuoteStatus.GEACCEPTEERD]: [],
  [QuoteStatus.AFGEWEZEN]: [],
  [QuoteStatus.VERLOPEN]: [],
};

function calculateLineTotal(
  quantity: number,
  unitPrice: number,
  discountPct: number,
): number {
  return (
    Math.round(quantity * unitPrice * (1 - discountPct / 100) * 100) / 100
  );
}

@Injectable()
export class QuotesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── List ──────────────────────────────────────────────

  async findAll(user: User, query: ListQuotesQueryDto) {
    const { search, status, contactId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.QuoteWhereInput = {};

    if (user.role !== Role.SUPERUSER) {
      where.orgId = user.orgId!;
    }

    if (status) {
      where.status = status;
    }

    if (contactId) {
      where.contactId = contactId;
    }

    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        {
          contact: {
            OR: [
              { companyName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { lastName: { contains: search, mode: 'insensitive' } },
            ],
          },
        },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.quote.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              type: true,
              companyName: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.quote.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  // ─── Detail ────────────────────────────────────────────

  async findOne(id: string, user: User) {
    const quote = await this.prisma.quote.findUnique({
      where: { id },
      include: {
        contact: {
          select: {
            id: true,
            type: true,
            companyName: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            city: true,
            street: true,
            houseNumber: true,
            postalCode: true,
          },
        },
        request: {
          select: { id: true, title: true },
        },
        template: {
          select: { id: true, name: true },
        },
        createdByUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        lines: {
          include: {
            product: {
              select: { id: true, name: true, unit: true, category: true },
            },
          },
          orderBy: { sortOrder: 'asc' },
        },
        approvalRequests: {
          include: {
            requestedByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
            reviewedByUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { requestedAt: 'desc' },
        },
      },
    });

    if (!quote) {
      throw new NotFoundException('Offerte niet gevonden');
    }

    if (user.role !== Role.SUPERUSER && quote.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return quote;
  }

  // ─── Create ────────────────────────────────────────────

  async create(dto: CreateQuoteDto, user: User) {
    let orgId = user.orgId;
    if (!orgId && user.role !== Role.SUPERUSER) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    // Verify contact belongs to same org
    const contact = await this.prisma.contact.findUnique({
      where: { id: dto.contactId },
    });
    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }

    // For SUPERUSER (no orgId), derive orgId from the contact
    if (!orgId && user.role === Role.SUPERUSER) {
      orgId = contact.orgId;
    }

    if (user.role !== Role.SUPERUSER && contact.orgId !== orgId) {
      throw new ForbiddenException('Relatie behoort niet tot uw organisatie');
    }

    // Verify location if provided
    if (dto.locationId) {
      const location = await this.prisma.location.findUnique({
        where: { id: dto.locationId },
      });
      if (!location) {
        throw new NotFoundException('Locatie niet gevonden');
      }
      if (location.contactId !== dto.contactId) {
        throw new ForbiddenException(
          'Locatie behoort niet tot deze relatie',
        );
      }
    }

    // Load template if provided
    let templateData: {
      coverBlocks?: any;
      contentBlocks?: any;
      closingBlocks?: any;
      defaultValidityDays?: number;
      requiresApproval?: boolean;
    } = {};
    if (dto.templateId) {
      const template = await this.prisma.quoteTemplate.findUnique({
        where: { id: dto.templateId },
      });
      if (!template || !template.isActive) {
        throw new NotFoundException('Template niet gevonden');
      }
      if (user.role !== Role.SUPERUSER && template.orgId !== orgId) {
        throw new ForbiddenException(
          'Template behoort niet tot uw organisatie',
        );
      }
      templateData = {
        coverBlocks: template.coverBlocks,
        contentBlocks: template.contentBlocks,
        closingBlocks: template.closingBlocks,
        defaultValidityDays: template.defaultValidityDays,
        requiresApproval: template.requiresApproval,
      };
    }

    // Calculate validUntil
    let validUntil: Date | undefined;
    if (dto.validUntil) {
      validUntil = new Date(dto.validUntil);
    } else {
      const org = await this.prisma.organization.findUnique({
        where: { id: orgId! },
      });
      const days = templateData.defaultValidityDays ?? org?.defaultValidityDays ?? 30;
      validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + days);
    }

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
          contentBlocks: templateData.contentBlocks ?? undefined,
          closingBlocks: templateData.closingBlocks ?? undefined,
          validUntil,
          requiresApproval: templateData.requiresApproval ?? false,
          internalNotes: dto.internalNotes || undefined,
          createdBy: user.id,
        },
      });
    });
  }

  // ─── Update ────────────────────────────────────────────

  async update(id: string, dto: UpdateQuoteDto, user: User) {
    const quote = await this.findOne(id, user);

    if (quote.status !== QuoteStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen offertes met status CONCEPT kunnen bewerkt worden',
      );
    }

    return this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.contactId !== undefined && { contactId: dto.contactId }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.validUntil !== undefined && {
          validUntil: new Date(dto.validUntil),
        }),
        ...(dto.internalNotes !== undefined && {
          internalNotes: dto.internalNotes,
        }),
        ...(dto.coverBlocks !== undefined && { coverBlocks: dto.coverBlocks }),
        ...(dto.contentBlocks !== undefined && {
          contentBlocks: dto.contentBlocks,
        }),
        ...(dto.closingBlocks !== undefined && {
          closingBlocks: dto.closingBlocks,
        }),
      },
    });
  }

  // ─── Set Lines ─────────────────────────────────────────

  async setLines(id: string, dto: SetQuoteLinesDto, user: User) {
    const quote = await this.findOne(id, user);

    if (quote.status !== QuoteStatus.CONCEPT) {
      throw new BadRequestException(
        'Offerteregels kunnen alleen bij status CONCEPT gewijzigd worden',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Delete existing lines
      await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });

      // Calculate and create new lines
      let subtotal = 0;
      let vatTotal = 0;
      let discountTotal = 0;

      const lineData = dto.lines.map((line, index) => {
        const vatRate = line.vatRate ?? 21;
        const discountPct = line.discountPct ?? 0;
        const lineTotal = calculateLineTotal(
          line.quantity,
          line.unitPrice,
          discountPct,
        );
        const fullPrice = Math.round(line.quantity * line.unitPrice * 100) / 100;

        subtotal += lineTotal;
        vatTotal += Math.round((lineTotal * vatRate) / 100 * 100) / 100;
        discountTotal += Math.round((fullPrice - lineTotal) * 100) / 100;

        return {
          quoteId: quote.id,
          productId: line.productId || undefined,
          description: line.description,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          vatRate,
          discountPct,
          lineTotal,
          sortOrder: line.sortOrder ?? index,
        };
      });

      if (lineData.length > 0) {
        await tx.quoteLine.createMany({ data: lineData });
      }

      const total = Math.round((subtotal + vatTotal) * 100) / 100;

      // Update quote totals
      return tx.quote.update({
        where: { id: quote.id },
        data: { subtotal, vatTotal, discountTotal, total },
        include: {
          lines: { orderBy: { sortOrder: 'asc' } },
        },
      });
    });
  }

  // ─── Status Update ─────────────────────────────────────

  async updateStatus(id: string, status: QuoteStatus, user: User) {
    const quote = await this.findOne(id, user);

    const validTargets = VALID_TRANSITIONS[quote.status];
    if (!validTargets.includes(status)) {
      throw new BadRequestException(
        `Statusovergang van ${quote.status} naar ${status} is niet toegestaan`,
      );
    }

    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status },
    });

    // Notify the quote creator when sent
    if (status === QuoteStatus.VERSTUURD) {
      this.notifications.dispatch({
        type: NotificationType.OFFERTE_VERSTUURD,
        orgId: quote.orgId,
        recipientUserIds: [quote.createdBy],
        title: 'Offerte verstuurd',
        body: `Offerte ${quote.quoteNumber} is naar de klant verstuurd.`,
        entityType: 'quote',
        entityId: quote.id,
      });
    }

    return updated;
  }

  // ─── Submit for Approval ───────────────────────────────

  async submitForApproval(id: string, dto: SubmitApprovalDto, user: User) {
    const quote = await this.findOne(id, user);

    if (quote.status !== QuoteStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen offertes met status CONCEPT kunnen ter goedkeuring worden ingediend',
      );
    }

    if (!quote.requiresApproval) {
      throw new BadRequestException(
        'Deze offerte vereist geen goedkeuring',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.quoteApprovalRequest.create({
        data: {
          quoteId: quote.id,
          requestedBy: user.id,
          note: dto.note || undefined,
        },
      });

      return tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.TER_GOEDKEURING },
      });
    });

    // Notify all managers + org admins in the org
    const managers = await this.prisma.user.findMany({
      where: {
        orgId: quote.orgId,
        role: { in: [Role.MANAGER, Role.ORG_ADMIN] },
        isActive: true,
      },
      select: { id: true },
    });
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_TER_GOEDKEURING,
      orgId: quote.orgId,
      recipientUserIds: managers.map((m) => m.id),
      title: 'Offerte ter goedkeuring',
      body: `Offerte ${quote.quoteNumber} staat klaar voor uw goedkeuring.`,
      entityType: 'quote',
      entityId: quote.id,
    });

    return updated;
  }

  // ─── Approve ───────────────────────────────────────────

  async approve(id: string, dto: ApproveQuoteDto, user: User) {
    const quote = await this.findOne(id, user);

    if (quote.status !== QuoteStatus.TER_GOEDKEURING) {
      throw new BadRequestException(
        'Alleen offertes met status TER_GOEDKEURING kunnen goedgekeurd worden',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // Update the latest pending approval request
      const pendingApproval = await tx.quoteApprovalRequest.findFirst({
        where: { quoteId: quote.id, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
      });

      if (pendingApproval) {
        await tx.quoteApprovalRequest.update({
          where: { id: pendingApproval.id },
          data: {
            status: 'APPROVED',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            note: dto.note || pendingApproval.note,
          },
        });
      }

      return tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.GOEDGEKEURD },
      });
    });

    // Notify the quote creator
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_GOEDGEKEURD,
      orgId: quote.orgId,
      recipientUserIds: [quote.createdBy],
      title: 'Offerte goedgekeurd',
      body: `Offerte ${quote.quoteNumber} is goedgekeurd.`,
      entityType: 'quote',
      entityId: quote.id,
    });

    return updated;
  }

  // ─── Reject ────────────────────────────────────────────

  async reject(id: string, dto: RejectQuoteDto, user: User) {
    const quote = await this.findOne(id, user);

    if (quote.status !== QuoteStatus.TER_GOEDKEURING) {
      throw new BadRequestException(
        'Alleen offertes met status TER_GOEDKEURING kunnen afgewezen worden',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const pendingApproval = await tx.quoteApprovalRequest.findFirst({
        where: { quoteId: quote.id, status: 'PENDING' },
        orderBy: { requestedAt: 'desc' },
      });

      if (pendingApproval) {
        await tx.quoteApprovalRequest.update({
          where: { id: pendingApproval.id },
          data: {
            status: 'REJECTED',
            reviewedBy: user.id,
            reviewedAt: new Date(),
            note: dto.note,
          },
        });
      }

      return tx.quote.update({
        where: { id: quote.id },
        data: { status: QuoteStatus.CONCEPT },
      });
    });

    // Notify the quote creator
    this.notifications.dispatch({
      type: NotificationType.OFFERTE_AFGEWEZEN,
      orgId: quote.orgId,
      recipientUserIds: [quote.createdBy],
      title: 'Offerte afgewezen',
      body: `Offerte ${quote.quoteNumber} is afgewezen.`,
      entityType: 'quote',
      entityId: quote.id,
    });

    return updated;
  }

  // ─── Delete ────────────────────────────────────────────

  async remove(id: string, user: User) {
    const quote = await this.findOne(id, user);

    if (quote.status !== QuoteStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen offertes met status CONCEPT kunnen verwijderd worden',
      );
    }

    await this.prisma.quote.delete({ where: { id: quote.id } });
    return { deleted: true };
  }

  // ─── Resolve Price ─────────────────────────────────────

  async resolvePrice(
    productId: string,
    contactId: string,
    quantity: number,
    user: User,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
    });
    if (!product) {
      throw new NotFoundException('Product niet gevonden');
    }

    if (user.role !== Role.SUPERUSER && product.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    // Check contact's assigned price tables first
    const contactTables = await this.prisma.contactPriceTable.findMany({
      where: { contactId },
      include: {
        priceTable: {
          include: {
            items: {
              where: { productId },
              include: { tiers: { orderBy: { fromQty: 'asc' } } },
            },
          },
        },
      },
    });

    let priceTableItem: any = null;
    for (const cpt of contactTables) {
      const item = cpt.priceTable.items.find(
        (i) => i.productId === productId,
      );
      if (item) {
        priceTableItem = item;
        break;
      }
    }

    // Fallback to org default price table
    if (!priceTableItem) {
      const defaultTable = await this.prisma.priceTable.findFirst({
        where: { orgId: product.orgId, isDefault: true },
        include: {
          items: {
            where: { productId },
            include: { tiers: { orderBy: { fromQty: 'asc' } } },
          },
        },
      });
      priceTableItem =
        defaultTable?.items.find((i) => i.productId === productId) ?? null;
    }

    // Resolve the price
    let unitPrice = 0;
    if (priceTableItem) {
      if (priceTableItem.priceType === 'FIXED') {
        unitPrice = priceTableItem.basePrice ?? 0;
      } else if (priceTableItem.priceType === 'TIERED') {
        for (const tier of priceTableItem.tiers) {
          if (
            quantity >= tier.fromQty &&
            (tier.toQty === null || quantity <= tier.toQty)
          ) {
            unitPrice = tier.price;
            break;
          }
        }
      }
    }

    return {
      unitPrice,
      vatRate: product.defaultVat,
      unit: product.unit,
    };
  }

  // ─── Create from Request ───────────────────────────────

  async createFromRequest(requestId: string, user: User) {
    const request = await this.prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!request || request.isDeleted) {
      throw new NotFoundException('Aanvraag niet gevonden');
    }

    if (user.role !== Role.SUPERUSER && request.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return this.prisma.$transaction(async (tx) => {
      const quoteNumber = await this.generateQuoteNumber(request.orgId, tx);

      // Calculate validity from org settings
      const org = await tx.organization.findUnique({
        where: { id: request.orgId },
      });
      const validUntil = new Date();
      validUntil.setDate(
        validUntil.getDate() + (org?.defaultValidityDays ?? 30),
      );

      const quote = await tx.quote.create({
        data: {
          orgId: request.orgId,
          quoteNumber,
          requestId: request.id,
          contactId: request.contactId,
          locationId: request.locationId || undefined,
          subject: request.title,
          validUntil,
          createdBy: user.id,
        },
      });

      // Update request status to OFFERTE_GEMAAKT
      await tx.request.update({
        where: { id: request.id },
        data: { status: RequestStatus.OFFERTE_GEMAAKT },
      });

      // Add status history for the request
      await tx.requestStatusHistory.create({
        data: {
          requestId: request.id,
          fromStatus: request.status,
          toStatus: RequestStatus.OFFERTE_GEMAAKT,
          changedBy: user.id,
          note: `Offerte ${quoteNumber} aangemaakt`,
        },
      });

      return quote;
    });
  }

  // ─── Quote Number Generation ───────────────────────────

  private async generateQuoteNumber(
    orgId: string,
    tx: Prisma.TransactionClient,
  ): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `OFF-${year}-`;

    const latestQuote = await tx.quote.findFirst({
      where: {
        orgId,
        quoteNumber: { startsWith: prefix },
      },
      orderBy: { quoteNumber: 'desc' },
      select: { quoteNumber: true },
    });

    let sequence = 1;
    if (latestQuote) {
      const parts = latestQuote.quoteNumber.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) {
        sequence = lastSeq + 1;
      }
    }

    return `${prefix}${String(sequence).padStart(4, '0')}`;
  }
}
