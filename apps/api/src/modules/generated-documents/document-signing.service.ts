// Ondertekenflow voor gegenereerde documenten: intern (staf) + publiek (externe
// e-maillink). Beheert de ondertekentokens, de TTL/vervaldatum en de afgeleide
// document-status (SIGNED zodra alle handtekeningen binnen zijn).
//
// De org-scoped document-fetch loopt via de core-service (GeneratedDocumentsService),
// conform het sub-service-patroon (sub-service injecteert de core voor de scoped check).

import { Injectable, Logger, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { User, Role, GeneratedDocumentStatus, SignatureStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { REVIEW_ROLES } from '@/common/auth/roles';
import { hasRole } from '@/common/auth/role-helpers';
import { EmailService } from '@/common/services/email.service';
import { LookupService, LOOKUP_KIND } from '../lookups/lookup.service';
import { GeneratedDocumentsService } from './generated-documents.service';
import { RequestSignatureDto, SignDocumentDto, PublicSignDto } from './dto';

const SIGNATURE_TTL_DAYS = 7;

/**
 * WP-A3 (B-101): signer-rollen die staf ÍNTERN (via POST …/sign) mag zetten.
 * Alle overige rollen uit de signer-roles-lookup (CLIENT,
 * INSTALLATION_RESPONSIBLE, HERSTELLER, org-eigen rollen, …) zijn extern en
 * lopen uitsluitend via het publieke ondertekenverzoek (signViaRequest) of hun
 * eigen flow (client-portal, online herstel).
 */
const INTERNAL_SIGNER_ROLE_CODES = ['INSPECTOR', 'REVIEWER'] as const;

/** Welke interne signer-rolcodes mag deze staf-gebruiker zetten? */
function allowedInternalSignerCodes(user: User): readonly string[] {
  // REVIEW_ROLES (vier-ogen-rollen) mogen als INSPECTOR én als REVIEWER tekenen.
  if (hasRole(user, REVIEW_ROLES)) return INTERNAL_SIGNER_ROLE_CODES;
  // De uitvoerende INSPECTEUR tekent alleen als INSPECTOR — nooit als REVIEWER
  // (vier-ogen-principe) en nooit namens de klant.
  if (hasRole(user, [Role.INSPECTEUR])) return ['INSPECTOR'];
  // BACKOFFICE heeft geen interne ondertekenrol (wel: verzoeken versturen).
  return [];
}

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

  /**
   * Intern ondertekenen door staf (WP-A3, B-101). De route-guard is bewust breed
   * (STAFF); hier gelden de inhoudelijke poorten:
   *  1. rolcode moet bestaan in de signer-roles-lookup (zelfde check als
   *     requestSignature) → 400;
   *  2. de stafrol bepaalt welke signer-rol gezet mag worden (INSPECTEUR →
   *     alleen INSPECTOR; REVIEW_ROLES → ook REVIEWER; klant-rollen nooit
   *     intern) → 403;
   *  3. per (document, rolcode) hooguit één handtekening: een openstaande
   *     PENDING/REQUESTED-rij wordt bijgewerkt i.p.v. dat er een tweede rij
   *     bijkomt; een reeds SIGNED rol weigert → 400;
   *  4. herleidbaarheid: signedByUserId + signedIpAddress worden vastgelegd.
   */
  async signDocument(id: string, user: User, dto: SignDocumentDto, ipAddress?: string) {
    const doc = await this.documents.findById(id, user);
    if (doc.status === GeneratedDocumentStatus.FINALIZED) {
      throw new BadRequestException('Gefinaliseerd document kan niet meer ondertekend worden');
    }

    // (1) Rolcode moet een bestaande, actieve ondertekenrol zijn (org of systeem).
    const role = await this.lookups.resolveLookup(LOOKUP_KIND.SIGNER_ROLES, dto.signerRoleCode, doc.orgId);
    if (!role) throw new BadRequestException(`Onbekende ondertekenrol: ${dto.signerRoleCode}`);

    // (2) Stafrol → toegestane signer-rollen.
    const allowed = allowedInternalSignerCodes(user);
    if (!allowed.includes(dto.signerRoleCode)) {
      if ((INTERNAL_SIGNER_ROLE_CODES as readonly string[]).includes(dto.signerRoleCode)) {
        throw new ForbiddenException(
          `U mag dit document niet ondertekenen namens de rol '${role.label}'`,
        );
      }
      throw new ForbiddenException(
        `De rol '${role.label}' kan alleen ondertekenen via een ondertekenverzoek (externe ondertekenlink)`,
      );
    }

    // (3) Hooguit één handtekening per (document, rol): bestaande open rij
    // (PENDING/REQUESTED) claimen i.p.v. een tweede rij inserten; een rol die al
    // getekend heeft is definitief. Bewust service-level en géén
    // @@unique([generatedDocumentId, signerRoleCode]): een verlopen (EXPIRED)
    // of geweigerd (DECLINED) verzoek mag legitiem een tweede rij voor dezelfde
    // rol opleveren via een nieuw ondertekenverzoek.
    const existing = await this.prisma.documentSignature.findMany({
      where: { generatedDocumentId: doc.id, signerRoleCode: dto.signerRoleCode },
    });
    if (existing.some((s) => s.status === SignatureStatus.SIGNED)) {
      throw new BadRequestException(
        `Er staat al een handtekening voor de rol '${role.label}' onder dit document`,
      );
    }
    const open = existing.find(
      (s) => s.status === SignatureStatus.PENDING || s.status === SignatureStatus.REQUESTED,
    );

    // (4) Herleidbaar vastleggen wie er tekende, vanaf welk adres.
    const signedData = {
      signerName: dto.signerName ?? `${user.firstName} ${user.lastName}`,
      signerEmail: user.email,
      signatureImage: dto.signatureImage,
      signedAt: new Date(),
      signedIpAddress: ipAddress ?? null,
      signedByUserId: user.id,
      status: SignatureStatus.SIGNED,
    };
    const sig = open
      ? await this.prisma.documentSignature.update({ where: { id: open.id }, data: signedData })
      : await this.prisma.documentSignature.create({
          data: { generatedDocumentId: doc.id, signerRoleCode: dto.signerRoleCode, ...signedData },
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

  async signViaRequest(requestId: string, dto: PublicSignDto, ipAddress?: string) {
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
        // B-408: audit trail — zelfde vastlegging als de staf-/klantportaal-routes.
        signedIpAddress: ipAddress ?? null,
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
