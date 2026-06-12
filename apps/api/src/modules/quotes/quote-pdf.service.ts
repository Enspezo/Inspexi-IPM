import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { User, Role, QuoteStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { StorageProvider, STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import { DocxRendererService } from '../quote-templates/docx-renderer.service';
import { PdfService } from './pdf.service';
import { QUOTE_INCLUDE, findQuoteForUser, getPublicUrl } from './quotes.helpers';

@Injectable()
export class QuotePdfService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
    private docxRenderer: DocxRendererService,
    private pdfService: PdfService,
  ) {}

  // ─── DOCX Rendering ──────────────────────────────────

  async renderQuoteDocx(id: string, user: User): Promise<{ buffer: Buffer; quoteNumber: string }> {
    const quote = assertFound(await this.prisma.quote.findUnique({
      where: { id },
      include: {
        template: true,
        contact: { select: { companyName: true, firstName: true, lastName: true, email: true } },
        lines: { orderBy: { sortOrder: 'asc' as const } },
      },
    }), 'Offerte');
    if (!user.roles.includes(Role.SUPERUSER) && quote.orgId !== user.orgId) throw new ForbiddenException();

    const template = quote.template;
    if (!template || template.templateType !== 'DOCX' || !template.docxStorageKey) {
      throw new BadRequestException('Offerte heeft geen DOCX sjabloon');
    }

    const org = await this.prisma.organization.findUnique({ where: { id: quote.orgId }, select: { name: true } });
    const createdByUser = await this.prisma.user.findUnique({ where: { id: quote.createdBy }, select: { firstName: true, lastName: true, email: true } });

    const templateBuffer = await this.storage.download(template.docxStorageKey);
    const renderData = this.docxRenderer.buildRenderData({
      quote: {
        quoteNumber: quote.quoteNumber,
        subject: quote.subject,
        subtotal: quote.subtotal,
        discountTotal: quote.discountTotal,
        vatTotal: quote.vatTotal,
        total: quote.total,
        validUntil: quote.validUntil,
        createdAt: quote.createdAt,
        lines: quote.lines,
      },
      contact: quote.contact,
      organization: { name: org?.name ?? 'InspeXi' },
      user: { firstName: createdByUser?.firstName, lastName: createdByUser?.lastName, email: createdByUser?.email ?? '' },
    });

    const renderedBuffer = this.docxRenderer.renderTemplate(templateBuffer, renderData);
    return { buffer: renderedBuffer, quoteNumber: quote.quoteNumber };
  }

  async renderQuotePdf(id: string, user: User): Promise<{ buffer: Buffer; quoteNumber: string }> {
    const { buffer: docxBuffer, quoteNumber } = await this.renderQuoteDocx(id, user);
    const pdfBuffer = await this.pdfService.convertDocxToPdf(docxBuffer);
    return { buffer: pdfBuffer, quoteNumber };
  }

  // ─── PDF Generation ─────────────────────────────────

  async generatePdf(id: string, user: User): Promise<{ buffer: Buffer; quoteNumber: string }> {
    const quote = await findQuoteForUser(this.prisma, id, user);

    // For DOCX templates, use LibreOffice conversion
    const template = quote.template as { templateType: string; docxStorageKey: string | null } | null;
    if (template?.templateType === 'DOCX' && template.docxStorageKey) {
      return this.renderQuotePdf(id, user);
    }

    // For BLOCKS templates, use Puppeteer
    if (!quote.publicToken) throw new BadRequestException('Offerte heeft geen publiek token. Verstuur de offerte eerst.');
    const puppeteer = await import('puppeteer');
    const publicUrl = getPublicUrl(this.config, `/offerte/${quote.publicToken}`);
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

  // ─── Public PDF download ────────────────────────────

  async downloadPublicPdf(token: string) {
    const quote = assertFound(await this.prisma.quote.findUnique({
      where: { publicToken: token },
      select: {
        id: true, orgId: true, status: true, pdfStorageKey: true, quoteNumber: true,
        templateId: true,
        template: { select: { id: true, templateType: true, docxStorageKey: true } },
      },
    }), 'PDF');
    const unavailable: QuoteStatus[] = [QuoteStatus.CONCEPT, QuoteStatus.TER_GOEDKEURING, QuoteStatus.GOEDGEKEURD];
    if (unavailable.includes(quote.status)) throw new ForbiddenException('Offerte is niet beschikbaar');

    // If a stored PDF exists, serve it directly
    if (quote.pdfStorageKey) {
      const buffer = await this.storage.download(quote.pdfStorageKey);
      return { buffer, quoteNumber: quote.quoteNumber };
    }

    // Fallback: generate on-the-fly for DOCX templates without stored PDF
    if (quote.template?.templateType === 'DOCX' && quote.template.docxStorageKey) {
      const fullQuote = await this.prisma.quote.findUnique({
        where: { id: quote.id },
        include: { ...QUOTE_INCLUDE, organization: { select: { id: true, name: true } } },
      });
      if (!fullQuote) throw new NotFoundException();
      const templateBuffer = await this.storage.download(quote.template.docxStorageKey);
      const renderData = this.docxRenderer.buildRenderData({
        quote: { quoteNumber: fullQuote.quoteNumber, subject: fullQuote.subject, subtotal: fullQuote.subtotal, discountTotal: fullQuote.discountTotal, vatTotal: fullQuote.vatTotal, total: fullQuote.total, validUntil: fullQuote.validUntil, createdAt: fullQuote.createdAt, lines: fullQuote.lines },
        contact: fullQuote.contact ?? { companyName: '', firstName: '', lastName: '', email: '' },
        organization: fullQuote.organization ?? { name: '' },
        user: { firstName: '', lastName: '', email: '' },
      });
      const renderedDocx = this.docxRenderer.renderTemplate(templateBuffer, renderData);
      const pdfBuffer = await this.pdfService.convertDocxToPdf(renderedDocx);

      // Store for future requests
      const pdfKey = `${fullQuote.orgId}/quotes/${fullQuote.id}/offerte-${fullQuote.quoteNumber}.pdf`;
      await this.storage.upload(pdfKey, pdfBuffer, 'application/pdf');
      await this.prisma.quote.update({ where: { id: fullQuote.id }, data: { pdfStorageKey: pdfKey } });

      return { buffer: pdfBuffer, quoteNumber: fullQuote.quoteNumber };
    }

    throw new NotFoundException('PDF niet gevonden');
  }
}
