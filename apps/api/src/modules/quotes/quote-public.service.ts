import { Injectable, Logger, ForbiddenException, BadRequestException, Inject } from '@nestjs/common';
import { Role, QuoteStatus, NotificationType } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '@/common/services/email.service';
import { StorageProvider, STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { PlanningService } from '../planning/planning.service';
import { ProjectsService } from '../projects/projects.service';
import { EmailTemplatesService } from '../email-templates/email-templates.service';
import { PdfService } from './pdf.service';
import { SignQuoteDto } from './dto';
import { QUOTE_INCLUDE, serializeQuote } from './quotes.helpers';

@Injectable()
export class QuotePublicService {
  private readonly logger = new Logger(QuotePublicService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private emailService: EmailService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private planningService: PlanningService,
    private projectsService: ProjectsService,
    private pdfService: PdfService,
    private emailTemplatesService: EmailTemplatesService,
  ) {}

  // Publieke webviewer
  async findByPublicToken(token: string) {
    const quote = assertFound(await this.prisma.quote.findUnique({
      where: { publicToken: token },
      include: {
        ...QUOTE_INCLUDE,
        organization: { select: { id: true, name: true, logoUrl: true, primaryColor: true } },
      },
    }), 'Offerte');
    const notSentStatuses: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (notSentStatuses.includes(quote.status)) {
      throw new ForbiddenException('Offerte is nog niet verstuurd');
    }
    if (!quote.viewedAt) {
      const updated = await this.prisma.quote.update({
        where: { id: quote.id },
        data: { viewedAt: new Date(), status: quote.status === QuoteStatus.VERSTUURD ? QuoteStatus.BEKEKEN : quote.status },
      });
      this.notifications.dispatch({ type: NotificationType.OFFERTE_BEKEKEN, orgId: quote.orgId, recipientUserIds: [quote.createdBy], title: 'Offerte bekeken', body: `Klant heeft offerte ${quote.quoteNumber} voor het eerst geopend.`, entityType: 'quote', entityId: quote.id });
      quote.viewedAt = updated.viewedAt;
      quote.status = updated.status;
    }
    return serializeQuote(quote);
  }

  async signQuote(token: string, dto: SignQuoteDto, clientIp?: string, userAgent?: string) {
    const quote = assertFound(await this.prisma.quote.findUnique({
      where: { publicToken: token },
      include: {
        organization: { select: { name: true, senderName: true, senderEmail: true } },
        contact: { select: { id: true, email: true, companyName: true, firstName: true, lastName: true } },
        template: { select: { acceptedEmailTemplateId: true, acceptedEmailEnabled: true } },
      },
    }), 'Offerte');
    if (quote.status !== QuoteStatus.VERSTUURD && quote.status !== QuoteStatus.BEKEKEN) throw new BadRequestException('Offerte kan niet worden ondertekend in de huidige status');
    if (quote.signedAt) throw new BadRequestException('Offerte is al ondertekend');
    const signedAt = new Date();
    const updated = await this.prisma.quote.update({
      where: { id: quote.id },
      data: { status: QuoteStatus.GEACCEPTEERD, signedAt, clientName: dto.clientName, clientSignature: dto.signature || null, clientIp: clientIp || null, clientUserAgent: userAgent || null, viewedAt: quote.viewedAt ?? new Date() },
    });
    const managers = await this.prisma.user.findMany({ where: { orgId: quote.orgId, roles: { hasSome: [Role.MANAGER, Role.ORG_ADMIN] }, isActive: true }, select: { id: true } });
    const recipientIds = [...new Set([quote.createdBy, ...managers.map((m) => m.id)])];
    this.notifications.dispatch({ type: NotificationType.OFFERTE_ONDERTEKEND, orgId: quote.orgId, recipientUserIds: recipientIds, title: 'Offerte ondertekend', body: `${dto.clientName} heeft offerte ${quote.quoteNumber} ondertekend.`, entityType: 'quote', entityId: quote.id });

    // Generate signed PDF with signature stamp
    if (quote.pdfStorageKey && dto.signature) {
      try {
        const pdfBuf = await this.storage.download(quote.pdfStorageKey);
        const signedPdf = await this.pdfService.stampSignature(pdfBuf, dto.signature, dto.clientName, signedAt, clientIp);
        const signedKey = `${quote.orgId}/quotes/${quote.id}/offerte-${quote.quoteNumber}-ondertekend.pdf`;
        await this.storage.upload(signedKey, signedPdf, 'application/pdf');
        await this.prisma.quote.update({ where: { id: quote.id }, data: { signedPdfStorageKey: signedKey } });

        // Send confirmation email with signed PDF
        const contactEmail = (quote as any).contact?.email;
        if (contactEmail) {
          // Check for per-template email template
          let customHtml: string | undefined;
          let customSubject: string | undefined;
          const acceptedTemplateId = (quote as any).template?.acceptedEmailTemplateId;
          const acceptedEmailEnabled = (quote as any).template?.acceptedEmailEnabled !== false;
          if (acceptedTemplateId && acceptedEmailEnabled) {
            const orgName = (quote as any).organization?.name ?? 'InspeXi';
            const emailVars = {
              organisatie: { naam: orgName, email: (quote as any).organization?.senderEmail ?? '' },
              contact: { bedrijfsnaam: (quote as any).contact?.companyName ?? '', voornaam: (quote as any).contact?.firstName ?? '', achternaam: (quote as any).contact?.lastName ?? '', email: contactEmail },
              offerte: { nummer: quote.quoteNumber, onderwerp: '', totaal: '', vervalDatum: '', url: '' },
              gebruiker: { voornaam: dto.clientName, achternaam: '', email: contactEmail },
            };
            const rendered = await this.emailTemplatesService.tryRenderById(acceptedTemplateId, emailVars, orgName);
            if (rendered) {
              customHtml = rendered.html;
              customSubject = rendered.subject;
            }
          }
          this.emailService.sendSignedQuoteEmail({
            to: contactEmail,
            quoteNumber: quote.quoteNumber,
            clientName: dto.clientName,
            orgName: (quote as any).organization?.name ?? 'InspeXi',
            senderName: (quote as any).organization?.senderName,
            senderEmail: (quote as any).organization?.senderEmail,
            orgId: quote.orgId,
            attachment: { filename: `Offerte-${quote.quoteNumber}-ondertekend.pdf`, content: signedPdf },
            customHtml,
            customSubject,
          }).catch((err) => this.logger.error('Failed to send signed quote email', err));
        }
      } catch (err) {
        this.logger.error('Failed to generate signed PDF', err);
      }
    }

    // Auto-create project on quote acceptance (if not already part of a project)
    const projectId = await this.projectsService.createFromQuote({
      id: quote.id,
      orgId: quote.orgId,
      contactId: quote.contactId,
      locationId: quote.locationId ?? null,
      createdBy: quote.createdBy,
      quoteNumber: quote.quoteNumber,
      requestId: quote.requestId ?? null,
    }).catch((err) => { this.logger.error('Failed to create project for quote', err); return null; });

    // Auto-create planning item on quote acceptance
    this.planningService.createFromQuote({
      id: quote.id,
      orgId: quote.orgId,
      contactId: quote.contactId,
      locationId: quote.locationId ?? null,
      createdBy: quote.createdBy,
      quoteNumber: quote.quoteNumber,
      projectId: projectId ?? undefined,
    }).catch((err) => this.logger.error('Failed to create planning item for quote', err));
    return { success: true, signedAt: updated.signedAt };
  }
}
