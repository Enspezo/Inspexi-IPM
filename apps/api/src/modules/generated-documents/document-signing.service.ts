// Ondertekenflow voor gegenereerde documenten: intern (staf) + publiek (externe
// e-maillink). Beheert de ondertekentokens, de TTL/vervaldatum en de afgeleide
// document-status (SIGNED zodra alle handtekeningen binnen zijn).
//
// De org-scoped document-fetch loopt via de core-service (GeneratedDocumentsService),
// conform het sub-service-patroon (sub-service injecteert de core voor de scoped check).

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { User, GeneratedDocumentStatus, SignatureStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { EmailService } from '@/common/services/email.service';
import { LookupService, LOOKUP_KIND } from '../lookups/lookup.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { RequestSignatureDto, SignDocumentDto, PublicSignDto } from './dto';

const SIGNATURE_TTL_DAYS = 7;

@Injectable()
export class DocumentSigningService {
  private readonly logger = new Logger(DocumentSigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly lookups: LookupService,
    private readonly documents: GeneratedDocumentsService,
  ) {}

  // ── Intern (staf, geauthenticeerd) ─────────────────────
  async requestSignature(id: string, user: User, dto: RequestSignatureDto) {
    const doc = await this.documents.findById(id, user);
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
    const doc = await this.documents.findById(id, user);
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

  // ── Publiek (geen auth) ────────────────────────────────
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

  // ── Helpers ────────────────────────────────────────────
  private contentOf(doc: { isEdited: boolean; editedContent: string | null; htmlContent: string }) {
    return doc.isEdited && doc.editedContent ? doc.editedContent : doc.htmlContent;
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
}
