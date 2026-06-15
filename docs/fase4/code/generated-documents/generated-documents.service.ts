// Doel in apps/api: src/modules/generated-documents/generated-documents.service.ts
//
// SKELET met correcte Beheer-conventies + tenant-safety + de volledige lifecycle/signing-flow.
// De HTML-context-opbouw + render-aanroep zijn gemarkeerd als PORT-punten (zie App-bron:
// generated-documents.service.ts, ~1182 regels) — neem die details daar over.
//
// Lifecycle: generate → (edit) → finalize → export(pdf/word) → request-signature → sign.

import { Injectable, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { User, DocumentType, GeneratedDocumentStatus, SignatureStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound } from '@/common';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import { DocumentRenderService, DocumentContext } from '../document-generation/document-render.service';
import { PdfGenerationService } from '../document-generation/pdf-generation.service';
import { WordExportService } from '../document-generation/word-export.service';
import { RequestSignatureDto, SignDocumentDto, PublicSignDto } from './dto';

interface SignedUrlCapable { supportsSignedUrls?: () => true; getSignedUrl?: (k: string, s?: number) => Promise<string>; }

@Injectable()
export class GeneratedDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly render: DocumentRenderService,
    private readonly pdf: PdfGenerationService,
    private readonly word: WordExportService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private requireOrg(user: User): string {
    if (!user.orgId) throw new BadRequestException('Selecteer eerst een organisatie');
    return user.orgId;
  }

  /** >>> PORT: bouw de volledige DocumentContext uit het plan + relaties (App-bron). */
  private async buildContext(planId: string, orgId: string): Promise<{ context: DocumentContext; templateId: string; sections: any[]; template: any }> {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, orgId, deletedAt: null },
        include: { contact: true, organization: true, assets: { where: { deletedAt: null }, include: { findings: { where: { deletedAt: null } } } } },
      }),
      'Inspectieplan',
    );
    if (!plan.inspectionTemplateId) throw new BadRequestException('Plan heeft geen inspectie-template');
    return {
      template: null, sections: [], templateId: '',
      context: {
        organization: plan.organization as any,
        contact: plan.contact as any,
        plan: plan as any,
        assets: plan.assets as any,
        findings: plan.assets.flatMap((a: any) => a.findings) as any,
        generatedAt: new Date().toISOString(),
      },
    };
  }

  async generateDocument(planId: string, type: DocumentType, user: User) {
    const orgId = this.requireOrg(user);
    const { context } = await this.buildContext(planId, orgId);

    // >>> PORT: haal de DocumentTemplate (inspectionTemplateId + type) + secties op en render.
    const template = assertFound(
      await this.prisma.documentTemplate.findFirst({
        where: { documentType: type, inspectionTemplate: { inspectionPlans: { some: { id: planId } } } },
        include: { sections: { orderBy: { sortOrder: 'asc' } } },
      }),
      'Document-template',
    );
    const html = await this.render.renderHtml(template, template.sections, context);

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
    return this.prisma.generatedDocument.findMany({
      where: { inspectionPlanId: planId, ...orgScope(user) },
      orderBy: { generatedAt: 'desc' },
    });
  }

  private async findScoped(id: string, user: User) {
    return assertFound(
      await this.prisma.generatedDocument.findFirst({ where: { id, ...orgScope(user) } }),
      'Document',
    );
  }

  findById(id: string, user: User) { return this.findScoped(id, user); }

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
    await this.prisma.generatedDocument.delete({ where: { id: doc.id } });
  }

  private contentOf(doc: { isEdited: boolean; editedContent: string | null; htmlContent: string }) {
    return doc.isEdited && doc.editedContent ? doc.editedContent : doc.htmlContent;
  }

  async generatePreview(id: string, user: User): Promise<Buffer> {
    const doc = await this.findScoped(id, user);
    return this.pdf.renderPdf(this.contentOf(doc));
  }

  async getHtmlContent(id: string, user: User): Promise<string> {
    return this.contentOf(await this.findScoped(id, user));
  }

  async exportToPdf(id: string, user: User): Promise<string> {
    const doc = await this.findScoped(id, user);
    const buffer = await this.pdf.renderPdf(this.contentOf(doc));
    const key = `${doc.orgId}/documents/${doc.id}.pdf`;
    await this.storage.upload(key, buffer, 'application/pdf');
    await this.prisma.generatedDocument.update({ where: { id: doc.id }, data: { pdfUrl: key } });
    return this.urlFor(key);
  }

  async exportToWord(id: string, user: User): Promise<string> {
    const doc = await this.findScoped(id, user);
    const buffer = await this.word.htmlToDocx(this.contentOf(doc));
    const key = `${doc.orgId}/documents/${doc.id}.docx`;
    await this.storage.upload(key, buffer, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    await this.prisma.generatedDocument.update({ where: { id: doc.id }, data: { wordUrl: key } });
    return this.urlFor(key);
  }

  async finalizeDocument(id: string, user: User) {
    const doc = await this.findScoped(id, user);
    return this.prisma.generatedDocument.update({
      where: { id: doc.id },
      data: { status: GeneratedDocumentStatus.FINALIZED, finalizedAt: new Date() },
    });
  }

  // ── Signing ────────────────────────────────────────────
  async requestSignature(id: string, user: User, dto: RequestSignatureDto) {
    const doc = await this.findScoped(id, user);
    const requestId = randomUUID();
    const sig = await this.prisma.documentSignature.create({
      data: {
        generatedDocumentId: doc.id,
        signerRoleCode: dto.signerRoleCode,
        signerName: dto.signerName,
        signerEmail: dto.signerEmail,
        signerFunction: dto.signerFunction,
        status: SignatureStatus.REQUESTED,
        signatureRequestId: requestId,
        signatureRequestSentAt: new Date(),
        signatureRequestUrl: `${process.env.PUBLIC_URL}/sign/${requestId}`,
      },
    });
    await this.prisma.generatedDocument.update({
      where: { id: doc.id }, data: { status: GeneratedDocumentStatus.PENDING_SIGNATURES },
    });
    // >>> PORT: verstuur de e-mail via Beheer's EmailService (Resend) met signatureRequestUrl.
    return sig;
  }

  async signDocument(id: string, user: User, dto: SignDocumentDto) {
    const doc = await this.findScoped(id, user);
    return this.prisma.documentSignature.create({
      data: {
        generatedDocumentId: doc.id,
        signerRoleCode: dto.signerRoleCode,
        signerName: dto.signerName ?? `${user.firstName} ${user.lastName}`,
        signatureImage: dto.signatureImage,
        signedAt: new Date(),
        status: SignatureStatus.SIGNED,
      },
    });
  }

  // ── Public (geen auth) ─────────────────────────────────
  async getSignatureRequest(requestId: string) {
    const sig = assertFound(
      await this.prisma.documentSignature.findFirst({
        where: { signatureRequestId: requestId },
        include: { generatedDocument: { select: { id: true, documentType: true, htmlContent: true, editedContent: true, isEdited: true } } },
      }),
      'Ondertekenverzoek',
    );
    if (sig.status === SignatureStatus.SIGNED) throw new BadRequestException('Al ondertekend');
    if (sig.status === SignatureStatus.EXPIRED) throw new BadRequestException('Verzoek verlopen');
    return sig;
  }

  async signViaRequest(requestId: string, dto: PublicSignDto) {
    const sig = await this.getSignatureRequest(requestId);
    return this.prisma.documentSignature.update({
      where: { id: sig.id },
      data: {
        signatureImage: dto.signatureImage,
        signerName: dto.signerName ?? sig.signerName,
        signedAt: new Date(),
        status: SignatureStatus.SIGNED,
      },
    });
  }

  private urlFor(key: string): string {
    const s = this.storage as unknown as SignedUrlCapable;
    // Signed URL bij R2; anders een API-download-route (Fase 4: documents/:id/download toevoegen).
    return s.supportsSignedUrls?.() ? key /* await getSignedUrl in de caller */ : `/api/v1/generated-documents/file/${encodeURIComponent(key)}`;
  }
}
