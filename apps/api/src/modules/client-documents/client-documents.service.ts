// Klant-documenten: detail (HTML-preview), authenticated download-stream (via STORAGE_PROVIDER)
// en ondertekening. Sluit aan op Fase 4 generated-documents (DocumentSignature-lifecycle +
// document-status). Tenant-veilig: document org-scoped opgehaald, daarna ClientAccess-check
// op het inspectieplan. Geport uit ../Inspexi-App/.../client-inspections (sign/download).

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { GeneratedDocumentStatus, SignatureStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';
import { ClientSignDocumentDto } from './dto';

const CLIENT_ROLE = 'CLIENT';

@Injectable()
export class ClientDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly inspections: ClientInspectionsService,
  ) {}

  /** Org-scoped fetch + ClientAccess-check via het inspectieplan. */
  private async getWithAccessCheck(user: CurrentClientUserData, orgId: string | null, documentId: string) {
    const org = this.inspections.requireOrg(orgId);
    const document = await this.prisma.generatedDocument.findFirst({
      where: { id: documentId, orgId: org },
      include: {
        signatures: true,
        inspectionPlan: {
          select: {
            id: true,
            projectName: true,
            referenceNumber: true,
            normTypeCode: true,
            addressCity: true,
            statusCode: true,
          },
        },
      },
    });
    if (!document) throw new NotFoundException('Document niet gevonden');
    await this.inspections.assertInspectionAccess(user.id, org, document.inspectionPlanId);
    // B-412 (WP-B9): documenten van een nog niet gereviewd rapport zijn niet
    // klant-zichtbaar — zelfde 404 als een onbekend document (geen oracle).
    if (!(await this.inspections.isContentReleased(org, document.inspectionPlan.statusCode))) {
      throw new NotFoundException('Document niet gevonden');
    }
    return document;
  }

  async getDetail(user: CurrentClientUserData, orgId: string | null, documentId: string) {
    const document = await this.getWithAccessCheck(user, orgId, documentId);
    // B-406a: teken-recht meesturen zodat de UI de knop kan verbergen en de
    // klant niet pas ná het tekenen een 403 krijgt.
    const canSign = await this.inspections.hasSignAccess(
      user.id,
      this.inspections.requireOrg(orgId),
      document.inspectionPlanId,
    );
    const { statusCode: _planStatus, ...inspectionPlan } = document.inspectionPlan;
    void _planStatus;
    return {
      id: document.id,
      documentType: document.documentType,
      status: document.status,
      htmlContent: document.isEdited && document.editedContent ? document.editedContent : document.htmlContent,
      pdfUrl: document.pdfUrl,
      generatedAt: document.generatedAt,
      finalizedAt: document.finalizedAt,
      inspectionPlan,
      canSign,
      signatures: document.signatures.map((s) => ({
        id: s.id,
        signerRoleCode: s.signerRoleCode,
        signerName: s.signerName,
        signerFunction: s.signerFunction,
        status: s.status,
        signedAt: s.signedAt,
      })),
    };
  }

  /** Buffer + headers voor de authenticated download-route (org + ClientAccess gescoped). */
  async download(
    user: CurrentClientUserData,
    orgId: string | null,
    documentId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const document = await this.getWithAccessCheck(user, orgId, documentId);
    if (!document.pdfUrl) throw new NotFoundException('PDF nog niet gegenereerd');
    const buffer = await this.storage.download(document.pdfUrl);
    const ref = document.inspectionPlan.referenceNumber || document.id.substring(0, 8);
    return { buffer, mimeType: 'application/pdf', filename: `document-${ref}.pdf` };
  }

  /** Ondertekening door de klant — vult de PENDING/REQUESTED CLIENT-handtekening in. */
  async sign(
    user: CurrentClientUserData,
    orgId: string | null,
    documentId: string,
    dto: ClientSignDocumentDto,
    ip?: string,
  ) {
    const document = await this.getWithAccessCheck(user, orgId, documentId);
    // Ondertekenen vereist expliciet canSign-recht, niet alleen inzage (SEC-11).
    await this.inspections.assertSignAccess(
      user.id,
      this.inspections.requireOrg(orgId),
      document.inspectionPlanId,
    );
    if (document.status === GeneratedDocumentStatus.FINALIZED) {
      throw new BadRequestException('Gefinaliseerd document kan niet meer ondertekend worden');
    }

    const clientSig = document.signatures.find(
      (s) =>
        s.signerRoleCode === CLIENT_ROLE &&
        (s.status === SignatureStatus.PENDING || s.status === SignatureStatus.REQUESTED),
    );
    if (!clientSig) {
      const already = document.signatures.find(
        (s) => s.signerRoleCode === CLIENT_ROLE && s.status === SignatureStatus.SIGNED,
      );
      throw new BadRequestException(
        already ? 'Document is al ondertekend' : 'Geen handtekening vereist voor dit document',
      );
    }

    const updated = await this.prisma.documentSignature.update({
      where: { id: clientSig.id },
      data: {
        signatureImage: dto.signatureImage,
        signerName: dto.signerName || `${user.firstName} ${user.lastName}`,
        signerEmail: user.email,
        signedIpAddress: ip ?? null,
        status: SignatureStatus.SIGNED,
        signedAt: new Date(),
      },
    });

    const documentFullySigned = await this.checkAndUpdateDocumentStatus(documentId);
    return {
      signatureId: updated.id,
      status: updated.status,
      signedAt: updated.signedAt,
      documentFullySigned,
    };
  }

  /** Zet het document op SIGNED zodra alle handtekeningen SIGNED zijn (Fase 4-logica). */
  private async checkAndUpdateDocumentStatus(documentId: string): Promise<boolean> {
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
    return allSigned;
  }
}
