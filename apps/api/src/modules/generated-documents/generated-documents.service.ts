// Generated Documents — lifecycle (generate → edit → finalize → export pdf/word) + ondertekening
// (intern + publieke e-maillink). Tenant-veilig via assertSameOrg/orgScope.
//
// De DocumentContext-opbouw (`buildContext`) is geport uit de App-bron
// (document-generation/document-render.service.ts → gatherData) en aangepast aan het
// Beheer-schema (Contact i.p.v. client; normTypeCode/statusCode; Organization zonder adres/kvk).
// De render-aanroep gebruikt Beheer's DocumentRenderService.renderHtml (context wordt meegegeven).

import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import {
  User,
  DocumentType,
  GeneratedDocumentStatus,
  SignatureStatus,
  AssetNodeType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertSameOrg, requireOrg } from '@/common';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import { EmailService } from '@/common/services/email.service';
import { LookupService, LOOKUP_KIND } from '../lookups/lookup.service';
import { DocumentRenderService } from '../document-generation/document-render.service';
import { PdfGenerationService } from '../document-generation/pdf-generation.service';
import { WordExportService } from '../document-generation/word-export.service';
import type {
  DocumentData,
  OrganizationData,
  ClientData,
  LocationData,
  PlanData,
  InspectorData,
  ReviewerData,
  AssetData,
  FindingData,
  PhotoData,
  MeasurementSheetData,
  UsedInstrumentData,
  FindingSummary,
  PdfOptions,
} from '../document-generation/types';
import { RequestSignatureDto, SignDocumentDto, PublicSignDto } from './dto';

const WORD_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const SIGNATURE_TTL_DAYS = 7;

/** Duck-type voor providers die signed-URLs ondersteunen (R2). Lokaal → download-route. */
interface SignedUrlCapable {
  supportsSignedUrls?: () => boolean;
  getSignedUrl?: (key: string, expiresInSeconds?: number) => Promise<string>;
}

/** Relaties die `buildContext` nodig heeft uit het inspectieplan. */
const PLAN_INCLUDE = {
  organization: true,
  contact: { include: { addresses: true, contactPersons: { where: { isDeleted: false } } } },
  assignedUser: true,
  reviewer: true,
  inspectionTemplate: {
    include: {
      classificationModel: { include: { characteristics: { include: { options: true } } } },
    },
  },
  measurementSheetRecords: { include: { template: true, assetNode: true } },
} satisfies Prisma.InspectionPlanInclude;

type PlanWithRelations = Prisma.InspectionPlanGetPayload<{ include: typeof PLAN_INCLUDE }>;
type FindingRow = Prisma.FindingGetPayload<true>;
type SheetRecordRow = Prisma.MeasurementSheetRecordGetPayload<{ include: { template: true } }>;

/**
 * Geassembleerde asset (oude `plan.assets`-vorm) — de losse Asset-tabel is opgegaan
 * in de AssetNode-boom (Fase 2b). We bouwen deze vorm in `buildContext` op uit de
 * ASSET-nodes van de boom + de findings/meetstaten die `inspectionPlanId` dragen.
 */
interface AssetWithRelations {
  id: string;
  name: string;
  assetType: string;
  identifier: string | null;
  locationDescription: string | null;
  statusCode: string;
  parentAssetId: string | null;
  technicalData: Prisma.JsonValue;
  findings: FindingRow[];
  measurementSheetRecords: SheetRecordRow[];
}
type ClassificationModelLite = {
  characteristics: Array<{ code: string; options: Array<{ code: string; name: string; color: string }> }>;
} | null;

@Injectable()
export class GeneratedDocumentsService {
  private readonly logger = new Logger(GeneratedDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly render: DocumentRenderService,
    private readonly pdf: PdfGenerationService,
    private readonly word: WordExportService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly lookups: LookupService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  // ── Lifecycle ──────────────────────────────────────────
  async generateDocument(planId: string, type: DocumentType, user: User) {
    const orgId = requireOrg(user);
    await assertSameOrg(this.prisma.inspectionPlan, planId, orgId, 'Inspectieplan');

    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, orgId, deletedAt: null },
        include: PLAN_INCLUDE,
      }),
      'Inspectieplan',
    );
    if (!plan.inspectionTemplateId) {
      throw new BadRequestException('Plan heeft geen inspectie-template');
    }

    const template = assertFound(
      await this.prisma.documentTemplate.findFirst({
        where: { documentType: type, inspectionTemplateId: plan.inspectionTemplateId },
        include: {
          sections: {
            orderBy: { sortOrder: 'asc' },
            include: { childSections: { orderBy: { sortOrder: 'asc' } } },
          },
        },
      }),
      'Document-template',
    );

    const context = await this.buildContext(plan);
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
    return this.prisma.generatedDocument.findMany({
      where: { inspectionPlanId: planId, ...orgScope(user) },
      include: { signatures: true },
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

  // ── Signing ────────────────────────────────────────────
  async requestSignature(id: string, user: User, dto: RequestSignatureDto) {
    const doc = await this.findScoped(id, user);
    if (doc.status === GeneratedDocumentStatus.FINALIZED) {
      throw new BadRequestException('Gefinaliseerd document kan niet meer ondertekend worden');
    }
    const role = await this.lookups.resolveLookup(LOOKUP_KIND.SIGNER_ROLES, dto.signerRoleCode, doc.orgId);
    if (!role) throw new BadRequestException(`Onbekende ondertekenrol: ${dto.signerRoleCode}`);

    const requestId = randomUUID();
    const baseUrl = this.config.get<string>('PUBLIC_URL', 'http://localhost:5173');
    const signatureRequestUrl = `${baseUrl}/sign/${requestId}`;

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
        signatureRequestUrl,
      },
    });

    if (doc.status === GeneratedDocumentStatus.DRAFT) {
      await this.prisma.generatedDocument.update({
        where: { id: doc.id },
        data: { status: GeneratedDocumentStatus.PENDING_SIGNATURES },
      });
    }

    // Mail met de publieke ondertekenlink (fire-and-forget — blokkeert de operatie niet).
    this.email
      .sendNotificationEmail(
        dto.signerEmail,
        'Ondertekenverzoek',
        `Er staat een document voor u klaar om te ondertekenen (${role.label}). ` +
          `Open de beveiligde link om te ondertekenen: <a href="${signatureRequestUrl}">${signatureRequestUrl}</a>`,
        { orgId: doc.orgId },
      )
      .catch((e) => this.logger.error(`Versturen ondertekenverzoek mislukt: ${(e as Error).message}`));

    return sig;
  }

  async signDocument(id: string, user: User, dto: SignDocumentDto) {
    const doc = await this.findScoped(id, user);
    if (doc.status === GeneratedDocumentStatus.FINALIZED) {
      throw new BadRequestException('Gefinaliseerd document kan niet meer ondertekend worden');
    }
    const sig = await this.prisma.documentSignature.create({
      data: {
        generatedDocumentId: doc.id,
        signerRoleCode: dto.signerRoleCode,
        signerName: dto.signerName ?? `${user.firstName} ${user.lastName}`,
        signerEmail: user.email,
        signatureImage: dto.signatureImage,
        signedAt: new Date(),
        status: SignatureStatus.SIGNED,
      },
    });
    await this.checkAndUpdateDocumentStatus(doc.id);
    return sig;
  }

  // ── Public (geen auth) ─────────────────────────────────
  /** Gecontroleerde respons: alléén document-HTML + ondertekenvelden — geen overige org-data. */
  async getSignatureRequest(requestId: string) {
    const sig = assertFound(
      await this.prisma.documentSignature.findFirst({
        where: { signatureRequestId: requestId },
        include: {
          generatedDocument: {
            select: {
              id: true,
              documentType: true,
              htmlContent: true,
              editedContent: true,
              isEdited: true,
              inspectionPlan: { select: { projectName: true, referenceNumber: true } },
            },
          },
        },
      }),
      'Ondertekenverzoek',
    );

    // Lazy expiry: REQUESTED ouder dan TTL → EXPIRED.
    let status = sig.status;
    if (status === SignatureStatus.REQUESTED && sig.signatureRequestSentAt) {
      const expiresAt = new Date(sig.signatureRequestSentAt);
      expiresAt.setDate(expiresAt.getDate() + SIGNATURE_TTL_DAYS);
      if (new Date() > expiresAt) {
        await this.prisma.documentSignature.update({
          where: { id: sig.id },
          data: { status: SignatureStatus.EXPIRED },
        });
        status = SignatureStatus.EXPIRED;
      }
    }

    if (status === SignatureStatus.SIGNED) throw new BadRequestException('Al ondertekend');
    if (status === SignatureStatus.EXPIRED) throw new BadRequestException('Verzoek verlopen');

    const doc = sig.generatedDocument;
    return {
      requestId,
      documentId: doc.id,
      documentType: doc.documentType,
      projectName: doc.inspectionPlan.projectName,
      referenceNumber: doc.inspectionPlan.referenceNumber,
      signerRoleCode: sig.signerRoleCode,
      signerName: sig.signerName,
      status,
      expiresAt: sig.signatureRequestSentAt
        ? new Date(
            sig.signatureRequestSentAt.getTime() + SIGNATURE_TTL_DAYS * 24 * 60 * 60 * 1000,
          ).toISOString()
        : undefined,
      html: this.contentOf(doc),
    };
  }

  async signViaRequest(requestId: string, dto: PublicSignDto) {
    const sig = assertFound(
      await this.prisma.documentSignature.findFirst({ where: { signatureRequestId: requestId } }),
      'Ondertekenverzoek',
    );
    if (sig.status === SignatureStatus.SIGNED) throw new BadRequestException('Al ondertekend');
    if (sig.status === SignatureStatus.EXPIRED) throw new BadRequestException('Verzoek verlopen');
    if (sig.signatureRequestSentAt) {
      const expiresAt = new Date(sig.signatureRequestSentAt);
      expiresAt.setDate(expiresAt.getDate() + SIGNATURE_TTL_DAYS);
      if (new Date() > expiresAt) {
        await this.prisma.documentSignature.update({
          where: { id: sig.id },
          data: { status: SignatureStatus.EXPIRED },
        });
        throw new BadRequestException('Verzoek verlopen');
      }
    }

    const updated = await this.prisma.documentSignature.update({
      where: { id: sig.id },
      data: {
        signatureImage: dto.signatureImage,
        signerName: dto.signerName ?? sig.signerName,
        signedAt: new Date(),
        status: SignatureStatus.SIGNED,
      },
    });
    await this.checkAndUpdateDocumentStatus(sig.generatedDocumentId);
    return updated;
  }

  /** Zet het document op SIGNED zodra alle handtekeningen SIGNED zijn. */
  private async checkAndUpdateDocumentStatus(documentId: string) {
    const signatures = await this.prisma.documentSignature.findMany({
      where: { generatedDocumentId: documentId },
    });
    const allSigned =
      signatures.length > 0 && signatures.every((s) => s.status === SignatureStatus.SIGNED);
    if (allSigned) {
      const doc = await this.prisma.generatedDocument.findUnique({ where: { id: documentId } });
      if (doc && doc.status !== GeneratedDocumentStatus.FINALIZED) {
        await this.prisma.generatedDocument.update({
          where: { id: documentId },
          data: { status: GeneratedDocumentStatus.SIGNED },
        });
      }
    }
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
      block +=
        '<div style="flex:1;min-width:200pt;margin-bottom:24pt;">' +
        `<p style="font-weight:bold;margin-bottom:6pt;">${sig.signerName ?? sig.signerRoleCode}</p>` +
        (sig.signerFunction
          ? `<p style="font-size:9pt;color:#666;margin-bottom:6pt;">${sig.signerFunction}</p>`
          : '') +
        (sig.signatureImage
          ? `<div style="border:1px solid #ddd;padding:8pt;margin-bottom:6pt;background:#fafafa;">` +
            `<img src="${sig.signatureImage}" alt="Handtekening" style="max-width:200pt;max-height:80pt;" /></div>`
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

  /**
   * Assembleert de oude `plan.assets`-vorm uit de AssetNode-boom (Fase 2b): alle
   * ASSET-nodes onder `plan.locationId`, met de findings/meetstaten die
   * `inspectionPlanId = plan.id` dragen eronder gegroepeerd.
   */
  private async assemblePlanAssets(plan: PlanWithRelations): Promise<AssetWithRelations[]> {
    const nodes = plan.locationId
      ? await this.assetNodes.listLocationNodesByOrg(
          plan.locationId,
          plan.orgId,
          AssetNodeType.ASSET,
        )
      : [];
    if (!nodes.length) return [];

    const [findings, sheetRecords] = await Promise.all([
      this.prisma.finding.findMany({
        where: { inspectionPlanId: plan.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.measurementSheetRecord.findMany({
        where: { inspectionPlanId: plan.id },
        include: { template: true },
      }),
    ]);

    const findingsByNode = new Map<string, FindingRow[]>();
    for (const f of findings) {
      (findingsByNode.get(f.assetNodeId) ?? findingsByNode.set(f.assetNodeId, []).get(f.assetNodeId)!).push(f);
    }
    const sheetsByNode = new Map<string, SheetRecordRow[]>();
    for (const r of sheetRecords) {
      (sheetsByNode.get(r.assetNodeId) ?? sheetsByNode.set(r.assetNodeId, []).get(r.assetNodeId)!).push(r);
    }

    return nodes.map((n) => ({
      id: n.id,
      name: n.name,
      assetType: n.typeCode,
      identifier: n.identifier,
      locationDescription: n.description,
      statusCode: n.statusCode,
      parentAssetId: n.parentId,
      technicalData: n.technicalData,
      findings: findingsByNode.get(n.id) ?? [],
      measurementSheetRecords: sheetsByNode.get(n.id) ?? [],
    }));
  }

  // ── DocumentContext-opbouw (geport uit App-bron, aangepast aan Beheer-schema) ──
  private async buildContext(plan: PlanWithRelations): Promise<DocumentData> {
    const planAssets = await this.assemblePlanAssets(plan);

    // Foto's voor assets + findings ophalen en per entiteit groeperen.
    const assetIds = planAssets.map((a) => a.id);
    const findingIds = planAssets.flatMap((a) => a.findings.map((f) => f.id));
    const photos = await this.prisma.photo.findMany({
      where: {
        deletedAt: null,
        OR: [
          { entityType: 'asset', entityId: { in: assetIds } },
          { entityType: 'finding', entityId: { in: findingIds } },
        ],
      },
      orderBy: { sortOrder: 'asc' },
    });
    const photosByEntity = new Map<string, PhotoData[]>();
    for (const photo of photos) {
      const key = `${photo.entityType}:${photo.entityId}`;
      const arr = photosByEntity.get(key) ?? [];
      arr.push({
        id: photo.id,
        url: `/api/v1/photos/${photo.id}/download`,
        thumbnailUrl: `/api/v1/photos/${photo.id}/download?thumb=1`,
        caption: photo.caption || undefined,
        capturedAt: photo.capturedAt || undefined,
      });
      photosByEntity.set(key, arr);
    }

    // Norm-type label.
    const normType = await this.prisma.normTypeDefinition.findFirst({
      where: { code: plan.normTypeCode },
    });

    // Organisatie (Beheer-Organization heeft geen adres/kvk/telefoon).
    const org = plan.organization;
    const organization: OrganizationData = {
      name: org.name,
      logo: org.logoUrl || undefined,
      email: org.senderEmail || undefined,
    };

    // Opdrachtgever uit Contact (COMPANY → companyName; INDIVIDUAL → voor/achternaam).
    const contact = plan.contact;
    const primaryAddress = contact.addresses.find((a) => a.isPrimary) ?? contact.addresses[0];
    const primaryPerson = contact.contactPersons[0];
    const contactName =
      contact.companyName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
      'Onbekend';
    const client: ClientData = {
      name: contactName,
      contactPerson: primaryPerson
        ? `${primaryPerson.firstName} ${primaryPerson.lastName}`
        : undefined,
      address: primaryAddress
        ? [primaryAddress.street, primaryAddress.houseNumber].filter(Boolean).join(' ')
        : undefined,
      postalCode: primaryAddress?.postalCode || undefined,
      city: primaryAddress?.city || undefined,
      phone: contact.phone || primaryPerson?.phone || undefined,
      email: contact.email || primaryPerson?.email || undefined,
    };

    const location: LocationData = {
      name: plan.projectName,
      address: [plan.addressStreet, plan.addressHouseNumber].filter(Boolean).join(' '),
      postalCode: plan.addressPostalCode || undefined,
      city: plan.addressCity || undefined,
    };

    const planData: PlanData = {
      id: plan.id,
      reference: plan.referenceNumber || plan.id.substring(0, 8).toUpperCase(),
      projectName: plan.projectName,
      date: plan.startedAt || plan.plannedDate || plan.createdAt,
      plannedDate: plan.plannedDate || undefined,
      scope: plan.description || undefined,
      description: plan.description || undefined,
      normType: plan.normTypeCode,
      normTypeName: normType?.label || plan.normTypeCode,
      status: plan.statusCode,
    };

    const inspector: InspectorData = plan.assignedUser
      ? { name: `${plan.assignedUser.firstName} ${plan.assignedUser.lastName}`, email: plan.assignedUser.email }
      : { name: 'Niet toegewezen' };
    const reviewer: ReviewerData | undefined = plan.reviewer
      ? { name: `${plan.reviewer.firstName} ${plan.reviewer.lastName}`, email: plan.reviewer.email }
      : undefined;

    const classificationModel = (plan.inspectionTemplate?.classificationModel ??
      null) as ClassificationModelLite;
    const assets = this.buildAssetTree(planAssets, photosByEntity, classificationModel);
    const findings = planAssets.flatMap((asset) =>
      asset.findings.map((f) => this.mapFinding(f, asset, photosByEntity, classificationModel)),
    );
    const findingsSummary = this.buildFindingsSummary(findings);

    // Gebruikte meetmiddelen: snapshot-first (historische juistheid); val terug op
    // één batch-query op de live meetmiddelen voor records zonder snapshot.
    const fallbackIds = [
      ...new Set(
        plan.measurementSheetRecords
          .filter((r) => !this.readInstrumentSnapshot(r.data))
          .flatMap((r) => r.usedInstrumentIds ?? []),
      ),
    ];
    const liveInstruments = fallbackIds.length
      ? await this.prisma.measurementInstrument.findMany({
          where: { id: { in: fallbackIds }, orgId: plan.orgId },
          select: {
            id: true,
            code: true,
            brand: true,
            type: true,
            serialNumber: true,
            lastCalibrationDate: true,
            nextCalibrationDue: true,
          },
        })
      : [];
    const liveById = new Map(liveInstruments.map((i) => [i.id, i]));

    const measurementSheets: MeasurementSheetData[] = plan.measurementSheetRecords.map((record) => ({
      id: record.id,
      name: record.template.name,
      templateCode: record.template.code,
      assetId: record.assetNodeId || undefined,
      assetName: record.assetNode?.name || undefined,
      date: record.completedAt || record.createdAt,
      inspector: inspector.name,
      sections: this.parseMeasurementData(record.data as Record<string, unknown>),
      usedInstruments:
        this.readInstrumentSnapshot(record.data) ??
        (record.usedInstrumentIds ?? [])
          .map((id) => liveById.get(id))
          .filter((i): i is NonNullable<typeof i> => Boolean(i))
          .map((i) => ({
            id: i.id,
            code: i.code,
            brand: i.brand,
            type: i.type,
            serialNumber: i.serialNumber,
            lastCalibrationDate: i.lastCalibrationDate,
            nextCalibrationDue: i.nextCalibrationDue,
          })),
    }));

    const now = new Date();
    return {
      organization,
      client,
      location,
      plan: planData,
      inspector,
      reviewer,
      assets,
      findings,
      findingsSummary,
      measurementSheets,
      currentDate: now,
      generatedAt: now,
    };
  }

  private buildAssetTree(
    assets: AssetWithRelations[],
    photosByEntity: Map<string, PhotoData[]>,
    classificationModel: ClassificationModelLite,
  ): AssetData[] {
    const assetMap = new Map<string, AssetData>();
    for (const asset of assets) {
      assetMap.set(asset.id, {
        id: asset.id,
        name: asset.name,
        type: asset.assetType,
        typeName: asset.assetType,
        identifier: asset.identifier || undefined,
        locationDescription: asset.locationDescription || undefined,
        status: asset.statusCode,
        photos: photosByEntity.get(`asset:${asset.id}`) || [],
        findings: asset.findings.map((f) => this.mapFinding(f, asset, photosByEntity, classificationModel)),
        measurements: this.aggregateMeasurements(asset.measurementSheetRecords),
        technicalData: asset.technicalData as Record<string, unknown>,
        children: [],
      });
    }

    const rootAssets: AssetData[] = [];
    for (const asset of assets) {
      const assetData = assetMap.get(asset.id)!;
      if (asset.parentAssetId && assetMap.has(asset.parentAssetId)) {
        assetMap.get(asset.parentAssetId)!.children!.push(assetData);
      } else {
        rootAssets.push(assetData);
      }
    }
    return rootAssets;
  }

  private mapFinding(
    finding: FindingRow,
    asset: { id: string; name: string; locationDescription: string | null },
    photosByEntity: Map<string, PhotoData[]>,
    classificationModel: ClassificationModelLite,
  ): FindingData {
    const classValues = finding.classificationValues as Record<string, string> | null;
    const classification = this.getMainClassification(classValues, classificationModel);
    return {
      id: finding.id,
      reference: finding.normReference || undefined,
      shortDescription: finding.shortDescription,
      longDescription: finding.longDescription || undefined,
      classification: classification.code,
      classificationColor: classification.color,
      classificationName: classification.name,
      assetId: asset.id,
      assetName: asset.name,
      locationDescription: finding.locationDescription || asset.locationDescription || undefined,
      photos: photosByEntity.get(`finding:${finding.id}`) || [],
      recommendation: finding.recommendation || undefined,
      status: finding.statusCode,
      normReference: finding.normReference || undefined,
    };
  }

  private getMainClassification(
    classificationValues: Record<string, string> | null,
    classificationModel: ClassificationModelLite,
  ): { code: string; name: string; color: string } {
    if (!classificationValues || Object.keys(classificationValues).length === 0) {
      return { code: '-', name: 'Niet geclassificeerd', color: '#666666' };
    }
    const mainCharCode =
      Object.keys(classificationValues).find((k) =>
        ['CLASSIFICATIE', 'RISICO', 'SEVERITY', 'PRIORITEIT'].includes(k.toUpperCase()),
      ) ?? Object.keys(classificationValues)[0];
    const code = classificationValues[mainCharCode];

    if (classificationModel) {
      const characteristic = classificationModel.characteristics.find((c) => c.code === mainCharCode);
      const option = characteristic?.options.find((o) => o.code === code);
      if (option) return { code, name: option.name, color: option.color };
    }

    const defaultColors: Record<string, string> = {
      '1': '#dc2626',
      '2': '#ea580c',
      '3': '#ca8a04',
      '4': '#16a34a',
      A: '#dc2626',
      B: '#ea580c',
      C: '#ca8a04',
      D: '#2563eb',
      E: '#16a34a',
    };
    return { code, name: code, color: defaultColors[code] || '#666666' };
  }

  private aggregateMeasurements(records: Array<{ data: Prisma.JsonValue }>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const record of records) {
      const formData = record.data as Record<string, unknown> | null;
      if (formData) Object.assign(result, formData);
    }
    return result;
  }

  /** Leest het ingebakken meetmiddel-snapshot uit record.data (of null). */
  private readInstrumentSnapshot(data: unknown): UsedInstrumentData[] | null {
    const snap = (data as Record<string, unknown> | null)?.__usedInstrumentsSnapshot;
    return Array.isArray(snap) ? (snap as UsedInstrumentData[]) : null;
  }

  private parseMeasurementData(
    formData: Record<string, unknown>,
  ): Array<{ name: string; fields: Record<string, unknown> }> {
    if (formData && Array.isArray(formData.sections)) {
      return formData.sections as Array<{ name: string; fields: Record<string, unknown> }>;
    }
    return [{ name: 'Meetgegevens', fields: formData ?? {} }];
  }

  private buildFindingsSummary(findings: FindingData[]): FindingSummary {
    const byClassification: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    for (const finding of findings) {
      byClassification[finding.classification] = (byClassification[finding.classification] || 0) + 1;
      byStatus[finding.status] = (byStatus[finding.status] || 0) + 1;
    }
    return { total: findings.length, byClassification, byStatus };
  }
}
