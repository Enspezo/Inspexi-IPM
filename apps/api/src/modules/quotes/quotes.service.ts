import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { User, Role, Prisma, QuoteStatus, QuoteTemplate, RequestStatus, NotificationType, TaskType, TaskEntityType, TaskStatus, FollowUpAssigneeType, ApprovalKind, ApprovalStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, orgScope, assertFound, assertSameOrg, assertAllSameOrg, resolvePhaseLink, PROJECT_FASEN_FEATURE, PROJECT_FASEN_REQUIRED_MESSAGE } from '@/common';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { NumberingService } from '@/modules/numbering/numbering.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { StorageProvider, STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { PdfService } from './pdf.service';
import { QuotePdfService } from './quote-pdf.service';
import {
  CreateQuoteDto,
  UpdateQuoteDto,
  SetQuoteLinesDto,
  ListQuotesQueryDto,
  SendQuoteDto,
} from './dto';
import { MAX_QUOTE_AMOUNT, VALID_TRANSITIONS, assertTemplateLinked, calculateLineTotal, findQuoteForUser, getPublicUrl, isQuoteApprovalRequired, resolveTemplateData, serializeQuote } from './quotes.helpers';

@Injectable()
export class QuotesService {
  private readonly logger = new Logger(QuotesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    private config: ConfigService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private customFieldsValidator: CustomFieldsValidator,
    private pdfService: PdfService,
    private quotePdfService: QuotePdfService,
    private emailTemplatesService: EmailTemplatesService,
    private numbering: NumberingService,
    private entitlements: EntitlementsService,
  ) {}

  async findAll(user: User, query: ListQuotesQueryDto) {
    const { search, status, contactId, createdBy, templateId, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['quoteNumber', 'subject', 'status', 'total', 'validUntil', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS);
    const where: Prisma.QuoteWhereInput = { ...orgScope(user) };
    if (status) where.status = status;
    if (contactId) where.contactId = contactId;
    if (createdBy) where.createdBy = createdBy;
    if (templateId) where.templateId = templateId === 'none' ? null : templateId;
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { quoteNumber: { contains: search, mode: 'insensitive' } },
        { contact: { OR: [{ companyName: { contains: search, mode: 'insensitive' } }, { firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }] } },
      ];
    }
    const result = await paginate(this.prisma.quote, {
      where,
      include: {
        contact: { select: { id: true, type: true, companyName: true, firstName: true, lastName: true, email: true } },
        template: { select: { id: true, name: true } },
        createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
        projectPhase: { select: { id: true, name: true, sortOrder: true, status: true } },
      },
      orderBy,
      page,
      limit,
    });
    return { ...result, data: result.data.map((q) => serializeQuote(q)) };
  }

  async findOne(id: string, user: User) {
    const quote = await findQuoteForUser(this.prisma, id, user);
    // Effectieve goedkeuringsplicht (B-304): org-drempel ÓF template-vlag, server-side
    // berekend zodat de portal één bron van waarheid heeft (actiemenu + verstuurgate).
    const org = await this.prisma.organization.findUnique({
      where: { id: quote.orgId },
      select: { quoteApprovalThreshold: true, quoteApprovalRequiredRole: true },
    });
    return {
      ...serializeQuote(quote),
      approvalRequired: org ? isQuoteApprovalRequired(org, quote) : quote.requiresApproval,
    };
  }

  async create(dto: CreateQuoteDto, user: User) {
    let orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) throw new ForbiddenException('Geen organisatie gekoppeld');
    const contact = await this.prisma.contact.findUnique({ where: { id: dto.contactId } });
    if (!contact || contact.isDeleted) throw new NotFoundException('Relatie niet gevonden');
    if (!orgId && user.roles.includes(Role.SUPERUSER)) orgId = contact.orgId;
    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== orgId) throw new ForbiddenException('Relatie behoort niet tot uw organisatie');
    if (dto.locationId) {
      const location = assertFound(await this.prisma.location.findUnique({ where: { id: dto.locationId } }), 'Locatie');
      if (location.contactId !== dto.contactId) throw new ForbiddenException('Locatie behoort niet tot deze relatie');
    }
    // Linked request must belong to the same org (cross-tenant guard)
    await assertSameOrg(this.prisma.request, dto.requestId, orgId, 'Aanvraag');
    let templateData: ReturnType<typeof resolveTemplateData> = {};
    if (dto.templateId) {
      const template = await this.loadActiveTemplate(dto.templateId, orgId, user);
      templateData = resolveTemplateData(template);
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

    return this.numbering.runWithGeneratedNumber(
      'QUOTE',
      orgId!,
      {
        manual: dto.quoteNumber,
        loadContext: () => this.numberingContext(contact, dto.locationId),
      },
      async (tx, quoteNumber) =>
        serializeQuote(
          await tx.quote.create({
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
          }),
        ),
    );
  }

  /** Build numbering placeholder context (contact name + location postcode) for a quote. */
  private async numberingContext(
    contact: { companyName: string | null; firstName: string | null; lastName: string | null },
    locationId?: string | null,
  ) {
    const postcode = locationId
      ? (
          await this.prisma.location.findUnique({
            where: { id: locationId },
            select: { postalCode: true },
          })
        )?.postalCode
      : undefined;
    return {
      contact:
        contact.companyName ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' '),
      postcode,
    };
  }

  async update(id: string, dto: UpdateQuoteDto, user: User) {
    const quote = await this.findOne(id, user);
    // Fase-koppelen mag in élke offertestatus (PRD-12): een patch die uitsluitend
    // `projectPhaseId` bevat passeert de CONCEPT-guard. Alle overige velden
    // (subject, blocks, template, nummer, ...) blijven alleen bij CONCEPT bewerkbaar.
    const definedKeys = Object.keys(dto).filter(
      (key) => (dto as Record<string, unknown>)[key] !== undefined,
    );
    const isPhaseLinkOnly =
      definedKeys.length > 0 && definedKeys.every((key) => key === 'projectPhaseId');
    if (quote.status !== QuoteStatus.CONCEPT && !isPhaseLinkOnly) {
      throw new BadRequestException('Alleen offertes met status CONCEPT kunnen bewerkt worden');
    }

    // Cross-tenant guard on re-pointed FKs.
    await Promise.all([
      assertSameOrg(this.prisma.contact, dto.contactId, user.orgId, 'Relatie'),
      assertSameOrg(this.prisma.location, dto.locationId, user.orgId, 'Locatie'),
    ]);

    // Projectfase-koppeling (PRD-12): alleen bij een DAADWERKELIJKE wijziging van
    // projectPhaseId eerst de PROJECT_FASEN-entitlement afdwingen (§Fase E) —
    // gewone updates (veld onaangeroerd) blijven werken na een downgrade.
    if (dto.projectPhaseId !== undefined) {
      await this.entitlements.assertFeature(
        user.orgId, PROJECT_FASEN_FEATURE, PROJECT_FASEN_REQUIRED_MESSAGE,
      );
    }
    // Valideer org + projectconsistentie en cascadeer het project van de fase naar
    // de offerte wanneer die er nog geen heeft.
    const phaseLink = await resolvePhaseLink(
      this.prisma.projectPhase, dto.projectPhaseId, user.orgId, quote.projectId,
    );

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

    // Template switch — only reachable while CONCEPT (guarded above). Re-applies
    // the new template's blocks just like create(); offerteregels are never touched.
    const templateSwitchData = await this.resolveTemplateSwitch(quote, dto, user);

    // Manual renumber — gated on the scheme's allowManualEntry + uniqueness check.
    let manualNumber: string | undefined;
    if (dto.quoteNumber !== undefined && dto.quoteNumber.trim() !== quote.quoteNumber) {
      manualNumber = await this.numbering.validateManualNumber(
        quote.orgId, 'QUOTE', dto.quoteNumber, quote.id,
      );
    }

    return serializeQuote(await this.prisma.quote.update({
      where: { id: quote.id },
      data: {
        ...(manualNumber !== undefined && { quoteNumber: manualNumber }),
        ...(dto.subject !== undefined && { subject: dto.subject }),
        ...(dto.contactId !== undefined && { contactId: dto.contactId }),
        ...(dto.locationId !== undefined && { locationId: dto.locationId }),
        ...(dto.validUntil !== undefined && { validUntil: new Date(dto.validUntil) }),
        ...(dto.internalNotes !== undefined && { internalNotes: dto.internalNotes }),
        ...(dto.coverBlocks !== undefined && { coverBlocks: dto.coverBlocks }),
        ...(dto.contentBlocks !== undefined && { contentBlocks: dto.contentBlocks }),
        ...(dto.closingBlocks !== undefined && { closingBlocks: dto.closingBlocks }),
        ...(customFieldsData !== undefined && { customFields: customFieldsData as any }),
        ...(phaseLink !== undefined && {
          projectPhaseId: phaseLink.phaseId,
          ...(phaseLink.projectId && quote.projectId == null && { projectId: phaseLink.projectId }),
        }),
        // Applied last so a template switch wins over any blocks in the same payload.
        ...templateSwitchData,
      },
    }));
  }

  /**
   * Load an active quote template scoped to the user's org. Shared by create()
   * and the update() template switch so the existence/active/org checks live in
   * one place. Returns the validated template.
   */
  private async loadActiveTemplate(templateId: string, orgId: string | null, user: User): Promise<QuoteTemplate> {
    const template = await this.prisma.quoteTemplate.findUnique({ where: { id: templateId } });
    if (!template || !template.isActive) throw new NotFoundException('Template niet gevonden');
    if (!user.roles.includes(Role.SUPERUSER) && template.orgId !== orgId) throw new ForbiddenException('Template behoort niet tot uw organisatie');
    return template;
  }

  /**
   * Compute the Prisma update fields for a template switch on a CONCEPT quote.
   * - `templateId` absent or unchanged → `{}` (no-op).
   * - `templateId` null/empty → unlink template, leave blocks untouched.
   * - new template → validate, then re-apply blocks (BLOCKS) or clear them (DOCX)
   *   plus `requiresApproval`, exactly like create().
   * `validUntil` is intentionally left untouched (may have been set manually).
   */
  private async resolveTemplateSwitch(
    quote: { templateId: string | null; orgId: string },
    dto: UpdateQuoteDto,
    user: User,
  ): Promise<Prisma.QuoteUncheckedUpdateInput> {
    if (dto.templateId === undefined || dto.templateId === quote.templateId) return {};

    // Unlink: clear the template (blocks stay as-is). Reset requiresApproval —
    // without a template there is no approval policy to enforce.
    if (!dto.templateId) return { templateId: null, requiresApproval: false };

    const template = await this.loadActiveTemplate(dto.templateId, quote.orgId, user);
    const templateData = resolveTemplateData(template);
    // BLOCKS → re-apply template blocks; DOCX → clear blocks (rendered from .docx).
    const toBlockField = (value: QuoteTemplate['coverBlocks'] | undefined) =>
      value == null ? Prisma.DbNull : (value as Prisma.InputJsonValue);
    return {
      templateId: template.id,
      coverBlocks: toBlockField(templateData.coverBlocks),
      contentBlocks: toBlockField(templateData.contentBlocks),
      closingBlocks: toBlockField(templateData.closingBlocks),
      requiresApproval: templateData.requiresApproval ?? false,
    };
  }

  async setLines(id: string, dto: SetQuoteLinesDto, user: User) {
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.CONCEPT) throw new BadRequestException('Offerteregels kunnen alleen bij status CONCEPT gewijzigd worden');
    // Verify every referenced product belongs to the caller's org (the product is
    // read back through QUOTE_INCLUDE, so an unvalidated id leaks another org's catalog).
    await assertAllSameOrg(
      this.prisma.product,
      dto.lines.map((l) => l.productId).filter((pid): pid is string => !!pid),
      user.orgId,
      'producten',
    );
    return this.prisma.$transaction(async (tx) => {
      await tx.quoteLine.deleteMany({ where: { quoteId: quote.id } });
      let subtotal = 0, vatTotal = 0, discountTotal = 0;
      const lineData = dto.lines.map((line, index) => {
        const vatRate = line.vatRate ?? 21;
        const discountPct = line.discountPct ?? 0;
        const lineTotal = calculateLineTotal(line.quantity, line.unitPrice, discountPct);
        // B-303: bewaak het berekende regeltotaal vóór de write — de kolommen zijn
        // numeric(12,2); zonder deze guard gooit Postgres "numeric field overflow" (500).
        if (Math.abs(lineTotal) > MAX_QUOTE_AMOUNT) {
          throw new BadRequestException(
            `Het regeltotaal van regel ${index + 1} is te groot (maximaal € 9.999.999.999,99). Verlaag het aantal of de eenheidsprijs.`,
          );
        }
        const fullPrice = Math.round(line.quantity * line.unitPrice * 100) / 100;
        subtotal += lineTotal;
        vatTotal += Math.round((lineTotal * vatRate) / 100 * 100) / 100;
        discountTotal += Math.round((fullPrice - lineTotal) * 100) / 100;
        return { quoteId: quote.id, productId: line.productId || undefined, description: line.description, quantity: line.quantity, unit: line.unit, unitPrice: line.unitPrice, vatRate, discountPct, lineTotal, sortOrder: line.sortOrder ?? index };
      });
      const total = Math.round((subtotal + vatTotal) * 100) / 100;
      // B-303: ook subtotaal/btw/korting/totaal moeten binnen numeric(12,2) blijven.
      if ([subtotal, vatTotal, discountTotal, total].some((v) => Math.abs(v) > MAX_QUOTE_AMOUNT)) {
        throw new BadRequestException(
          'Het offertetotaal is te groot (maximaal € 9.999.999.999,99). Verlaag het aantal of de eenheidsprijs.',
        );
      }
      if (lineData.length > 0) await tx.quoteLine.createMany({ data: lineData });
      return serializeQuote(await tx.quote.update({ where: { id: quote.id }, data: { subtotal, vatTotal, discountTotal, total }, include: { lines: { orderBy: { sortOrder: 'asc' } } } }));
    });
  }

  /**
   * Verplichte goedkeuringsgate (REQ5). Gooit een BadRequestException wanneer de
   * offerte goedkeuring vereist (bedrag boven de org-drempel óf template-
   * `requiresApproval`) en er nog géén GOEDGEKEURD verplicht (THRESHOLD) verzoek is.
   * Centraal punt voor álle paden die een offerte goedkeuren/versturen.
   */
  private async assertApprovalSatisfied(quote: { id: string; orgId: string; total: unknown; requiresApproval: boolean }) {
    const org = await this.prisma.organization.findUnique({
      where: { id: quote.orgId },
      select: { quoteApprovalThreshold: true, quoteApprovalRequiredRole: true },
    });
    if (org && isQuoteApprovalRequired(org, quote)) {
      const approved = await this.prisma.quoteApprovalRequest.findFirst({
        where: { quoteId: quote.id, kind: ApprovalKind.THRESHOLD, status: ApprovalStatus.APPROVED },
      });
      if (!approved) {
        throw new BadRequestException(
          'Deze offerte vereist goedkeuring (bedrag boven de goedkeuringsgrens of sjabloon vereist het) en kan pas verstuurd worden nadat een bevoegde collega de offerte heeft goedgekeurd.',
        );
      }
    }
  }

  async updateStatus(id: string, status: QuoteStatus, user: User) {
    const quote = await this.findOne(id, user);
    const validTargets = VALID_TRANSITIONS[quote.status];
    if (!validTargets.includes(status)) throw new BadRequestException(`Statusovergang van ${quote.status} naar ${status} is niet toegestaan`);
    // A CONCEPT quote may not move forward without a template linked.
    if (quote.status === QuoteStatus.CONCEPT && status !== QuoteStatus.CONCEPT) assertTemplateLinked(quote);
    // Verplichte goedkeuringsgate (REQ5): markeer een offerte niet als goedgekeurd/verstuurd
    // zonder een GOEDGEKEURD verplicht (THRESHOLD) verzoek. Dit sluit de bypass via
    // handmatige statuswijziging (de mandatory flow loopt via approve()).
    if (status === QuoteStatus.GOEDGEKEURD || status === QuoteStatus.VERSTUURD) {
      await this.assertApprovalSatisfied(quote);
    }
    const updated = await this.prisma.quote.update({ where: { id: quote.id }, data: { status } });
    if (status === QuoteStatus.VERSTUURD) {
      this.notifications.dispatch({ type: NotificationType.OFFERTE_VERSTUURD, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte verstuurd', body: `Offerte ${quote.quoteNumber} is naar de klant verstuurd.`, entityType: 'quote', entityId: quote.id });
    }
    return serializeQuote(updated);
  }

  async sendQuote(id: string, dto: SendQuoteDto, user: User) {
    const quote = await this.findOne(id, user);
    // B-308: idempotentie — een al verstuurde offerte mag nooit een tweede keer
    // (dubbele klant-e-mail) de deur uit.
    if (quote.sentAt) {
      throw new BadRequestException('Deze offerte is al verstuurd');
    }
    if (quote.status !== QuoteStatus.GOEDGEKEURD && quote.status !== QuoteStatus.CONCEPT) {
      throw new BadRequestException('Alleen offertes met status CONCEPT of GOEDGEKEURD kunnen verstuurd worden');
    }
    // Sending a CONCEPT quote moves it forward — a template must be linked.
    if (quote.status === QuoteStatus.CONCEPT) assertTemplateLinked(quote);
    // B-315: een offerte zonder regels (totaal € 0,00) hoort niet naar de klant te gaan.
    if ((quote.lines?.length ?? 0) === 0) {
      throw new BadRequestException(
        'Deze offerte heeft geen offerteregels en kan niet verstuurd worden. Voeg eerst regels toe.',
      );
    }
    // Verplichte goedkeuringsgate (REQ5): boven de org-drempel (of bij template-`requiresApproval`)
    // mag niet verstuurd worden zonder een GOEDGEKEURD verplicht (THRESHOLD) verzoek.
    // Vrijwillige (VOLUNTARY_*) verzoeken tellen hier nooit mee.
    await this.assertApprovalSatisfied(quote);

    // ── Race-vrije claim (B-308) ──
    // Twee gelijktijdige requests lezen hierboven allebei een onverzonden offerte;
    // deze conditionele updateMany is één atomisch UPDATE-statement, dus precies
    // één request "wint" de claim (count === 1) en mag mailen. De verliezer krijgt
    // dezelfde nette 400 als hierboven. De statusovergang zelf gebeurt ná het
    // mailen via een gewone (geauditeerde) update — alleen de winnaar komt daar.
    const sentAt = new Date();
    const claimed = await this.prisma.quote.updateMany({
      where: {
        id: quote.id,
        orgId: quote.orgId,
        sentAt: null,
        status: { in: [QuoteStatus.CONCEPT, QuoteStatus.GOEDGEKEURD] },
      },
      data: { sentAt },
    });
    if (claimed.count !== 1) {
      throw new BadRequestException('Deze offerte is al verstuurd');
    }

    try {
      return await this.deliverQuote(quote, dto, user, sentAt);
    } catch (err) {
      // Claim terugdraaien zodat de offerte na een mislukte verzending opnieuw
      // verstuurd kan worden (status is nog niet gewijzigd op dit punt).
      await this.prisma.quote
        .updateMany({ where: { id: quote.id, sentAt }, data: { sentAt: null } })
        .catch((revertErr) => this.logger.error('Failed to revert send claim', revertErr));
      throw err;
    }
  }

  /**
   * Daadwerkelijke verzending (PDF, bijlagen, e-mail, statusovergang, notificatie,
   * follow-ups). Alleen aangeroepen door de claim-winnaar in `sendQuote()`.
   */
  private async deliverQuote(
    quote: Awaited<ReturnType<QuotesService['findOne']>>,
    dto: SendQuoteDto,
    user: User,
    sentAt: Date,
  ) {
    const org = await this.prisma.organization.findUnique({ where: { id: quote.orgId }, select: { name: true, senderName: true, senderEmail: true } });
    let token = quote.publicToken;
    if (!token) {
      token = randomUUID();
      await this.prisma.quote.update({ where: { id: quote.id }, data: { publicToken: token } });
    }
    const quoteUrl = getPublicUrl(this.config, `/offerte/${token}`);

    // For DOCX templates: render template → PDF → store
    const template = quote.template as { id: string; name: string; templateType: string; docxStorageKey: string | null; sendEmailTemplateId: string | null; sendEmailEnabled: boolean; acceptedEmailTemplateId: string | null; acceptedEmailEnabled: boolean } | null;
    if (template?.templateType === 'DOCX' && template.docxStorageKey) {
      try {
        const { buffer: docxBuf } = await this.quotePdfService.renderQuoteDocx(quote.id, user);
        const pdfBuf = await this.pdfService.convertDocxToPdf(docxBuf);
        const pdfKey = `${quote.orgId}/quotes/${quote.id}/offerte-${quote.quoteNumber}.pdf`;
        await this.storage.upload(pdfKey, pdfBuf, 'application/pdf');
        await this.prisma.quote.update({ where: { id: quote.id }, data: { pdfStorageKey: pdfKey } });
      } catch (err) {
        this.logger.error('Failed to generate PDF for DOCX quote', err);
      }
    }

    // Copy template attachments to quote (if not already done)
    await this.copyTemplateAttachments(quote);

    // Build email attachments (PDF + quote attachments)
    const updatedQuote = await this.prisma.quote.findUnique({ where: { id: quote.id }, select: { pdfStorageKey: true } });
    const emailAttachments = await this.buildEmailAttachments(quote.id, quote.quoteNumber, updatedQuote?.pdfStorageKey ?? null);

    // Check for per-template email template override
    const contactName = quote.contact?.companyName || `${quote.contact?.firstName ?? ''} ${quote.contact?.lastName ?? ''}`.trim();
    if (template?.sendEmailTemplateId && template.sendEmailEnabled) {
      const emailVars = {
        organisatie: { naam: org?.name ?? 'InspeXi', email: org?.senderEmail ?? '' },
        contact: { bedrijfsnaam: quote.contact?.companyName ?? '', voornaam: quote.contact?.firstName ?? '', achternaam: quote.contact?.lastName ?? '', email: quote.contact?.email ?? dto.to },
        offerte: { nummer: quote.quoteNumber, onderwerp: dto.subject, totaal: `€ ${Number(quote.total).toFixed(2)}`, vervalDatum: quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('nl-NL') : '', url: quoteUrl },
        gebruiker: { voornaam: user.firstName ?? '', achternaam: user.lastName ?? '', email: user.email },
      };
      const rendered = await this.emailTemplatesService.tryRenderById(template.sendEmailTemplateId, emailVars, org?.name);
      if (rendered) {
        await this.emailService.sendQuoteEmail({
          to: dto.to, cc: dto.cc, subject: rendered.subject, bodyText: dto.bodyText, quoteUrl,
          orgName: org?.name ?? 'InspeXi', senderName: org?.senderName, senderEmail: org?.senderEmail,
          orgId: quote.orgId, quoteNumber: quote.quoteNumber, contactName,
          customHtml: rendered.html,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });
      } else {
        // Template not found or inactive, fall back to default
        await this.emailService.sendQuoteEmail({
          to: dto.to, cc: dto.cc, subject: dto.subject, bodyText: dto.bodyText, quoteUrl,
          orgName: org?.name ?? 'InspeXi', senderName: org?.senderName, senderEmail: org?.senderEmail,
          orgId: quote.orgId, quoteNumber: quote.quoteNumber, contactName,
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
        });
      }
    } else {
      await this.emailService.sendQuoteEmail({
        to: dto.to, cc: dto.cc, subject: dto.subject, bodyText: dto.bodyText, quoteUrl,
        orgName: org?.name ?? 'InspeXi', senderName: org?.senderName, senderEmail: org?.senderEmail,
        orgId: quote.orgId, quoteNumber: quote.quoteNumber, contactName,
        attachments: emailAttachments.length > 0 ? emailAttachments : undefined,
      });
    }
    // `sentAt` is al gezet door de claim in sendQuote(); hier alleen nog de
    // (geauditeerde) statusovergang → VERSTUURD.
    const updated = await this.prisma.quote.update({ where: { id: quote.id }, data: { status: QuoteStatus.VERSTUURD } });
    this.notifications.dispatch({ type: NotificationType.OFFERTE_VERSTUURD, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte verstuurd', body: `Offerte ${quote.quoteNumber} is naar ${dto.to} verstuurd.`, entityType: 'quote', entityId: quote.id });

    // Fire-and-forget: create follow-up tasks from template rules
    if (quote.templateId) {
      this.createFollowUpTasks(quote.id, quote.templateId, quote.quoteNumber, quote.orgId, quote.createdBy, sentAt, user).catch((err) =>
        this.logger.error('Failed to create follow-up tasks', err),
      );
    }

    return serializeQuote(updated);
  }

  private async createFollowUpTasks(
    quoteId: string,
    templateId: string,
    quoteNumber: string,
    orgId: string,
    createdBy: string,
    sentAt: Date,
    user: User,
  ): Promise<void> {
    const followUpRules = await this.prisma.quoteTemplateFollowUp.findMany({
      where: { templateId, isActive: true },
      include: {
        emailTemplate: { select: { id: true, name: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    for (const rule of followUpRules) {
      const deadline = new Date(sentAt);
      deadline.setDate(deadline.getDate() + rule.delayDays);

      let assigneeId: string | null = null;
      if (rule.assigneeType === FollowUpAssigneeType.QUOTE_OWNER) {
        assigneeId = createdBy;
      } else if (rule.assigneeType === FollowUpAssigneeType.SPECIFIC_USER && rule.assigneeUserId) {
        assigneeId = rule.assigneeUserId;
      }
      // SYSTEM → null (will be processed by cron)

      const taskType = rule.type === 'EMAIL' ? TaskType.EMAIL : TaskType.TELEFOONGESPREK;

      let title: string;
      let description: string | undefined;

      if (rule.type === 'EMAIL') {
        const templateName = rule.emailTemplate?.name ?? 'onbekend';
        title = `Follow-up e-mail: ${templateName} (${quoteNumber})`;
        description = rule.emailTemplateId
          ? `E-mailsjabloon: ${templateName}\nAutomatisch aangemaakt bij versturen offerte ${quoteNumber}.`
          : `Automatisch aangemaakt bij versturen offerte ${quoteNumber}.`;
      } else {
        title = `Follow-up telefoongesprek: ${quoteNumber}`;
        description = rule.defaultNotes || `Automatisch aangemaakt bij versturen offerte ${quoteNumber}.`;
      }

      await this.prisma.task.create({
        data: {
          title,
          description,
          status: TaskStatus.TE_DOEN,
          taskType,
          entityType: TaskEntityType.QUOTE,
          entityId: quoteId,
          assigneeId,
          deadline,
          orgId,
          createdById: user.id,
        },
      });
    }
  }

  async remove(id: string, user: User) {
    const quote = await this.findOne(id, user);
    if (quote.status !== QuoteStatus.CONCEPT) throw new BadRequestException('Alleen offertes met status CONCEPT kunnen verwijderd worden');
    await this.prisma.quote.delete({ where: { id: quote.id } });
    return { deleted: true };
  }

  // Price resolution
  async resolvePrice(productId: string, contactId: string, quantity: number, user: User) {
    // WP-C1 (B-105): org-scope in de query — cross-tenant id → zelfde 404.
    const product = assertFound(
      await this.prisma.product.findFirst({ where: { id: productId, ...orgScope(user) } }),
      'Product',
    );
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
    // Herkomst-metadata voor de editor (B-309): welke prijsbron is toegepast en —
    // bij een staffel — welke tier (zodat de UI "staffel 10–49: € 10,00" kan tonen).
    let priceType: 'FIXED' | 'TIERED' | null = null;
    let tier: { fromQty: number; toQty: number | null } | null = null;
    if (priceTableItem) {
      if (priceTableItem.priceType === 'FIXED') {
        unitPrice = priceTableItem.basePrice != null ? Number(priceTableItem.basePrice) : 0;
        priceType = 'FIXED';
      } else if (priceTableItem.priceType === 'TIERED') {
        priceType = 'TIERED';
        for (const t of priceTableItem.tiers) {
          if (quantity >= t.fromQty && (t.toQty === null || quantity <= t.toQty)) {
            unitPrice = Number(t.price);
            tier = { fromQty: t.fromQty, toQty: t.toQty };
            break;
          }
        }
      }
    }
    return { unitPrice, vatRate: product.defaultVat, unit: product.unit, priceType, tier };
  }

  async createFromRequest(requestId: string, user: User) {
    // WP-C1 (B-105): org-scope in de query — cross-tenant id → zelfde 404.
    const request = await this.prisma.request.findFirst({
      where: { id: requestId, ...orgScope(user) },
    });
    if (!request || request.isDeleted) throw new NotFoundException('Aanvraag niet gevonden');
    const org = await this.prisma.organization.findUnique({ where: { id: request.orgId } });
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + (org?.defaultValidityDays ?? 30));
    return this.numbering.runWithGeneratedNumber(
      'QUOTE',
      request.orgId,
      {
        loadContext: async () => {
          const contact = await this.prisma.contact.findUnique({
            where: { id: request.contactId },
            select: { companyName: true, firstName: true, lastName: true },
          });
          return this.numberingContext(
            contact ?? { companyName: null, firstName: null, lastName: null },
            request.locationId,
          );
        },
      },
      async (tx, quoteNumber) => {
        const quote = await tx.quote.create({
          data: { orgId: request.orgId, quoteNumber, requestId: request.id, contactId: request.contactId, locationId: request.locationId || undefined, subject: request.title, validUntil, createdBy: user.id, publicToken: randomUUID() },
        });
        await tx.request.update({ where: { id: request.id }, data: { status: RequestStatus.OFFERTE_GEMAAKT } });
        await tx.requestStatusHistory.create({ data: { requestId: request.id, fromStatus: request.status, toStatus: RequestStatus.OFFERTE_GEMAAKT, changedBy: user.id, note: `Offerte ${quoteNumber} aangemaakt` } });
        return serializeQuote(quote);
      },
    );
  }

  // ─── Template attachment helpers ────────────────────

  private async copyTemplateAttachments(quote: { id: string; templateId: string | null; orgId: string }) {
    if (!quote.templateId) return;
    const existing = await this.prisma.quoteAttachment.count({ where: { quoteId: quote.id, isStandard: true } });
    if (existing > 0) return; // already copied

    const templateAtts = await this.prisma.quoteTemplateAttachment.findMany({
      where: { templateId: quote.templateId },
      orderBy: { sortOrder: 'asc' },
    });

    for (const att of templateAtts) {
      try {
        const buffer = await this.storage.download(att.storageKey);
        const newKey = `${quote.orgId}/quotes/${quote.id}/${randomUUID()}-${att.fileName}`;
        await this.storage.upload(newKey, buffer, att.mimeType);
        await this.prisma.quoteAttachment.create({
          data: {
            quoteId: quote.id, storageKey: newKey, fileName: att.fileName,
            mimeType: att.mimeType, fileSize: att.fileSize,
            isStandard: true, sortOrder: att.sortOrder,
          },
        });
      } catch (err) {
        this.logger.error(`Failed to copy template attachment ${att.fileName}`, err);
      }
    }
  }

  private async buildEmailAttachments(
    quoteId: string,
    quoteNumber: string,
    pdfStorageKey: string | null,
  ): Promise<Array<{ filename: string; content: Buffer }>> {
    const attachments: Array<{ filename: string; content: Buffer }> = [];

    // Add PDF if available
    if (pdfStorageKey) {
      try {
        const pdfBuf = await this.storage.download(pdfStorageKey);
        attachments.push({ filename: `Offerte-${quoteNumber}.pdf`, content: pdfBuf });
      } catch (err) {
        this.logger.error('Failed to load PDF for email attachment', err);
      }
    }

    // Add quote attachments (including standard/template attachments)
    const quoteAtts = await this.prisma.quoteAttachment.findMany({
      where: { quoteId },
      orderBy: { sortOrder: 'asc' },
    });
    for (const att of quoteAtts) {
      try {
        const buf = await this.storage.download(att.storageKey);
        attachments.push({ filename: att.fileName, content: buf });
      } catch (err) {
        this.logger.error(`Failed to load attachment ${att.fileName} for email`, err);
      }
    }

    return attachments;
  }
}
