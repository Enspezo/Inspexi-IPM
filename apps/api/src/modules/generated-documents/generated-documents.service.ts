// Generated Documents — core lifecycle (generate → edit → finalize → export pdf/word).
// Tenant-veilig via assertSameOrg/orgScope. De render-context wordt door
// GenerationContextService opgebouwd; de ondertekenflow zit in DocumentSigningService.
// PDF-/Word-rendering blijft in de document-generation module (hier alleen orchestratie).

import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, DocumentType, GeneratedDocumentStatus, SignatureStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertSameOrg, requireOrg, escapeHtml, isSafeDataImage } from '@/common';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import { DocumentRenderService } from '../document-generation/document-render.service';
import { PdfGenerationService } from '../document-generation/pdf-generation.service';
import { WordExportService } from '../document-generation/word-export.service';
import type { PdfOptions } from '../document-generation/types';
import { GenerationContextService } from './generation-context.service';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Duck-type voor providers die signed-URLs ondersteunen (R2). Lokaal → download-route. */
interface SignedUrlCapable {
  supportsSignedUrls?: () => boolean;
  getSignedUrl?: (key: string, expiresInSeconds?: number) => Promise<string>;
}

@Injectable()
export class GeneratedDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: GenerationContextService,
    private readonly render: DocumentRenderService,
    private readonly pdf: PdfGenerationService,
    private readonly word: WordExportService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────
  async generateDocument(planId: string, type: DocumentType, user: User) {
    const orgId = requireOrg(user);
    await assertSameOrg(this.prisma.inspectionPlan, planId, orgId, 'Inspectieplan');

    const inspectionTemplateId = await this.context.getPlanInspectionTemplateId(planId, orgId);
    if (!inspectionTemplateId) {
      throw new BadRequestException('Plan heeft geen inspectie-template');
    }

    const template = assertFound(
      await this.prisma.documentTemplate.findFirst({
        where: { documentType: type, inspectionTemplateId },
        include: {
          sections: {
            orderBy: { sortOrder: 'asc' },
            include: { childSections: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      }),
      'Document-template',
    );

    // De include-breedte van de context volgt de template-mode: SECTIONS krijgt de
    // volledige context, BLOCKS/DOCX (die de context negeren) alleen de plan-header.
    const context = await this.context.buildForPlan(planId, orgId, template.templateMode);
    const html = this.render.renderHtml(template, template.sections, context);

    return this.prisma.generatedDocument.create({
      data: {
        orgId,
        documentTemplateId: template.id,
        inspectionPlanId: planId,
        documentType: type,
        htmlContent: html,
        status: GeneratedDocumentStatus.DRAFT,
        generatedBy: user.id,
      },
    });
  }

  async findByInspectionPlan(planId: string, user: User) {
    // Alleen lijst-metadata selecteren: de zware @db.Text-kolommen (htmlContent,
    // editedContent en per-signature signatureImage/base64) horen niet in een lijst
    // en worden pas op detail/preview opgehaald.
    return this.prisma.generatedDocument.findMany({
      where: { inspectionPlanId: planId, ...orgScope(user) },
      select: {
        id: true,
        orgId: true,
        documentTemplateId: true,
        inspectionPlanId: true,
        documentType: true,
        status: true,
        isEdited: true,
        editedAt: true,
        pdfUrl: true,
        wordUrl: true,
        generatedAt: true,
        generatedBy: true,
        finalizedAt: true,
        signatures: {
          select: {
            id: true,
            signerRoleCode: true,
            signerName: true,
            status: true,
            signedAt: true,
            signatureRequestUrl: true,
          },
        },
      },
      orderBy: { generatedAt: 'desc' },
    });
  }

  /** Org-scoped fetch; gooit 403 bij een vreemd document (assertSameOrg-conventie). */
  private async findScoped(id: string, user: User) {
    await assertSameOrg(this.prisma.generatedDocument, id, user.orgId, 'Document');
    return assertFound(
      await this.prisma.generatedDocument.findFirst({ where: { id, ...orgScope(user) } }),
      'Document',
    );
  }

  findById(id: string, user: User) {
    return this.findScoped(id, user);
  }

  async updateEditedContent(id: string, user: User, editedContent: string) {
    const doc = await this.findScoped(id, user);
    if (doc.status === GeneratedDocumentStatus.FINALIZED) {
      throw new ForbiddenException('Gefinaliseerd document kan niet bewerkt worden');
    }
    return this.prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { isEdited: true, editedContent, editedBy: user.id, editedAt: new Date() },
    });
  }

  async delete(id: string, user: User) {
    const doc = await this.findScoped(id, user);
    if (doc.status === GeneratedDocumentStatus.FINALIZED) {
      throw new ForbiddenException('Gefinaliseerd document kan niet verwijderd worden');
    }
    // Best-effort opruimen van geëxporteerde bestanden.
    for (const key of [doc.pdfUrl, doc.wordUrl]) {
      if (key && !key.startsWith('http') && !key.startsWith('/')) {
        await this.storage.delete(key).catch(() => undefined);
      }
    }
    await this.prisma.generatedDocument.delete({ where: { id: doc.id } });
  }

  private contentOf(doc: { isEdited: boolean; editedContent: string | null; htmlContent: string }) {
    return doc.isEdited && doc.editedContent ? doc.editedContent : doc.htmlContent;
  }

  async generatePreview(id: string, user: User): Promise<Buffer> {
    const doc = await this.findScoped(id, user);
    const html = await this.injectSignaturesIntoHtml(doc.id, this.contentOf(doc));
    return this.pdf.renderPdf(html, await this.pdfOptionsFor(doc.documentTemplateId));
  }

  async getHtmlContent(id: string, user: User): Promise<string> {
    return this.contentOf(await this.findScoped(id, user));
  }

  async exportToPdf(id: string, user: User): Promise<string> {
    const doc = await this.findScoped(id, user);
    const html = await this.injectSignaturesIntoHtml(doc.id, this.contentOf(doc));
    const buffer = await this.pdf.renderPdf(html, await this.pdfOptionsFor(doc.documentTemplateId));
    const key = `${doc.orgId}/documents/${doc.id}.pdf`;
    await this.storage.upload(key, buffer, 'application/pdf');
    await this.prisma.generatedDocument.update({ where: { id: doc.id }, data: { pdfUrl: key } });
    return this.resolveFileUrl(doc.id, 'pdf', key);
  }

  async exportToWord(id: string, user: User): Promise<string> {
    const doc = await this.findScoped(id, user);
    const buffer = await this.word.htmlToDocx(this.contentOf(doc));
    const key = `${doc.orgId}/documents/${doc.id}.docx`;
    await this.storage.upload(key, buffer, WORD_MIME);
    await this.prisma.generatedDocument.update({ where: { id: doc.id }, data: { wordUrl: key } });
    return this.resolveFileUrl(doc.id, 'word', key);
  }

  /** Stream-bron voor de auth download-route; exporteert on-demand als de key nog ontbreekt. */
  async downloadFile(
    id: string,
    user: User,
    format: 'pdf' | 'word',
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const doc = await this.findScoped(id, user);
    const isWord = format === 'word';
    let key = isWord ? doc.wordUrl : doc.pdfUrl;
    if (!key) {
      if (isWord) await this.exportToWord(id, user);
      else await this.exportToPdf(id, user);
      const fresh = await this.findScoped(id, user);
      key = isWord ? fresh.wordUrl : fresh.pdfUrl;
    }
    if (!key) throw new BadRequestException('Bestand kon niet worden gegenereerd');
    const buffer = await this.storage.download(key);
    return {
      buffer,
      mimeType: isWord ? WORD_MIME : 'application/pdf',
      filename: `document-${doc.id}.${isWord ? 'docx' : 'pdf'}`,
    };
  }

  async finalizeDocument(id: string, user: User) {
    const doc = await this.findScoped(id, user);
    return this.prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { status: GeneratedDocumentStatus.FINALIZED, finalizedAt: new Date() },
    });
  }

  // ── Export-helpers ─────────────────────────────────────
  /** Signed-URL bij R2; anders de auth download-route. */
  private async resolveFileUrl(docId: string, format: 'pdf' | 'word', key: string): Promise<string> {
    const s = this.storage as StorageProvider & SignedUrlCapable;
    if (s.supportsSignedUrls?.() && s.getSignedUrl) return s.getSignedUrl(key);
    return `/api/v1/generated-documents/${docId}/download?format=${format}`;
  }

  private async pdfOptionsFor(documentTemplateId: string): Promise<PdfOptions> {
    const t = await this.prisma.documentTemplate.findUnique({ where: { id: documentTemplateId } });
    if (!t) return {};
    const format = t.pageSize === 'A3' || t.pageSize === 'Letter' ? t.pageSize : 'A4';
    return {
      format,
      landscape: t.orientation === 'landscape',
      marginTopMm: t.marginTop,
      marginBottomMm: t.marginBottom,
      marginLeftMm: t.marginLeft,
      marginRightMm: t.marginRight,
      headerHtml: t.headerHtml || undefined,
      footerHtml: t.footerHtml || undefined,
    };
  }

  /** Vervangt/voegt een handtekeningenblok met de SIGNED handtekeningen toe aan de HTML. */
  private async injectSignaturesIntoHtml(documentId: string, html: string): Promise<string> {
    const signatures = await this.prisma.documentSignature.findMany({
      where: { generatedDocumentId: documentId, status: SignatureStatus.SIGNED },
    });
    if (signatures.length === 0) return html;

    let block =
      '<div class="signatures" style="margin-top:48pt;"><h3 style="margin-bottom:24pt;">Handtekeningen</h3>' +
      '<div style="display:flex;flex-wrap:wrap;gap:48pt;">';
    for (const sig of signatures) {
      // Defensieve laag: alle door de ondertekenaar aangeleverde strings worden
      // ge-escaped, en de afbeelding wordt alleen ingesloten als het een veilige
      // base64 data-URL is (geen file:/http(s):/tag-injectie → SSRF-mitigatie).
      const name = escapeHtml(sig.signerName ?? sig.signerRoleCode);
      const fn = sig.signerFunction ? escapeHtml(sig.signerFunction) : '';
      const safeImage = isSafeDataImage(sig.signatureImage) ? sig.signatureImage : null;
      block +=
        '<div style="flex:1;min-width:200pt;margin-bottom:24pt;">' +
        `<p style="font-weight:bold;margin-bottom:6pt;">${name}</p>` +
        (fn ? `<p style="font-size:9pt;color:#666;margin-bottom:6pt;">${fn}</p>` : '') +
        (safeImage
          ? `<div style="border:1px solid #ddd;padding:8pt;margin-bottom:6pt;background:#fafafa;">` +
            `<img src="${safeImage}" alt="Handtekening" style="max-width:200pt;max-height:80pt;" /></div>`
          : '') +
        `<p style="font-size:9pt;color:#666;">Ondertekend op: ${this.formatDate(sig.signedAt)}</p>` +
        '</div>';
    }
    block += '</div></div>';

    const sectionRegex = /<section[^>]*class="[^"]*signature-block[^"]*"[^>]*>[\s\S]*?<\/section>/i;
    const divRegex = /<div[^>]*class="[^"]*signatures[^"]*"[^>]*>[\s\S]*?<\/div>\s*<\/div>/i;
    if (sectionRegex.test(html)) {
      return html.replace(sectionRegex, `<section class="signature-block">${block}</section>`);
    }
    if (divRegex.test(html)) return html.replace(divRegex, block);
    if (html.includes('</body>')) return html.replace('</body>', `${block}</body>`);
    return html + block;
  }

  private formatDate(date: Date | null): string {
    if (!date) return '-';
    return new Intl.DateTimeFormat('nl-NL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  }
}
