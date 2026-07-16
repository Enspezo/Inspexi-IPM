// Online herstel van constateringen (PRD-14) — sessies, lookup, claim-flow & foto's.
//
// Eén sessiemodel voor beide toegangsvormen: de anonieme lookup (rapportnummer +
// postcode) en de ingelogde klant starten allebei een RepairSession; daarna lopen
// alle herstel-endpoints via het sessietoken (RepairSessionGuard).
//
// Kernbesluiten (PRD §14.3):
//  - besluit 2/3: een claim flipt Finding.statusCode atomisch 'open' → 'resolved'
//    (first-wins via updateMany); de verliezer krijgt een CONFLICT-resolutie + 409.
//  - besluit 4: herstelde constateringen tonen werkzaamheden + foto's, nooit wie.
//  - besluit 11: de anonieme lookup faalt ALTIJD met dezelfde generieke melding.

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import type { Prisma, RepairSession } from '@prisma/client';
import { RepairAccessType, RepairSessionStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import {
  getMainClassification,
  resolveInspectorContact,
  ONLINE_HERSTEL_FEATURE,
  REPAIR_LOOKUP_GENERIC_ERROR,
  REPAIR_CONFLICT_ERROR,
  REPAIR_SESSION_TTL_MS,
  RESOLUTION_REPORTED,
  RESOLUTION_CONFLICT,
  STATUS_OPEN,
  STATUS_RESOLVED,
  type SeverityClassificationModel,
} from '@/common';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';
import { RepairEventsService } from './repair-events.service';
import { RepairLookupDto, RepairResolveDto, StartRepairSessionDto } from './dto';

const MAX_PHOTOS = 5;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Publieke URL naar de sessie-gescopede foto-stream (verbergt storage-keys). */
function photoUrl(id: string): string {
  return `/api/v1/client/repair/photos/${id}`;
}

/** Postcode-normalisatie: hoofdletters, spaties strippen (PRD §14.3 besluit 1). */
function normalizePostalCode(value: string | null | undefined): string {
  return (value ?? '').toUpperCase().replace(/\s+/g, '');
}

type PlanWithClassification = Prisma.InspectionPlanGetPayload<{
  include: {
    location: { select: { postalCode: true } };
    assignedUser: {
      select: {
        id: true;
        firstName: true;
        lastName: true;
        contactPhone: true;
        contactEmail: true;
        sharePhoneWithClients: true;
        shareEmailWithClients: true;
      };
    };
    organization: {
      select: {
        inspectorPhoneDisplay: true;
        inspectorEmailDisplay: true;
        inspectorStaticPhone: true;
        inspectorStaticEmail: true;
      };
    };
    inspectionTemplate: {
      select: {
        classificationModel: {
          select: {
            characteristics: {
              select: {
                code: true;
                options: {
                  select: { code: true; name: true; color: true; isCritical: true };
                };
              };
            };
          };
        };
      };
    };
  };
}>;

@Injectable()
export class ClientRepairService {
  private readonly logger = new Logger(ClientRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly inspections: ClientInspectionsService,
    private readonly entitlements: EntitlementsService,
    private readonly events: RepairEventsService,
  ) {}

  // ── Sessies ─────────────────────────────────────────────

  /**
   * Anonieme toegang: rapportnummer + postcode → ANONYMOUS-sessie + token.
   * Elke mislukking (onbekend nummer, foute postcode, plan-vlag uit, entitlement
   * uit, geen org-subdomein) geeft exact dezelfde generieke NotFoundException.
   */
  async lookup(orgId: string | null, dto: RepairLookupDto, ip?: string) {
    const fail = (reason: string): never => {
      this.logger.warn(`Herstel-lookup geweigerd (${reason}) — ip=${ip ?? 'onbekend'}`);
      throw new NotFoundException(REPAIR_LOOKUP_GENERIC_ERROR);
    };

    if (!orgId) fail('geen org-subdomein');

    const features = await this.entitlements.getEnabledFeatures(orgId as string);
    if (!features.includes(ONLINE_HERSTEL_FEATURE)) fail('entitlement uit');

    const ref = dto.referenceNumber.trim();
    const postal = normalizePostalCode(dto.postalCode);
    if (!ref || !postal) fail('lege invoer');

    const plan = await this.prisma.inspectionPlan.findFirst({
      where: {
        orgId: orgId as string,
        deletedAt: null,
        onlineRepairEnabled: true,
        referenceNumber: { equals: ref, mode: 'insensitive' },
      },
      select: {
        id: true,
        addressPostalCode: true,
        location: { select: { postalCode: true } },
      },
    });
    if (!plan) fail('plan niet gevonden of vlag uit');

    const candidates = [plan!.addressPostalCode, plan!.location?.postalCode]
      .map(normalizePostalCode)
      .filter(Boolean);
    if (!candidates.includes(postal)) fail('postcode-mismatch');

    const session = await this.prisma.repairSession.create({
      data: {
        orgId: orgId as string,
        inspectionPlanId: plan!.id,
        accessType: RepairAccessType.ANONYMOUS,
        token: randomBytes(48).toString('hex'),
        expiresAt: new Date(Date.now() + REPAIR_SESSION_TTL_MS),
        createdIpAddress: ip ?? null,
      },
    });

    return { token: session.token, expiresAt: session.expiresAt, ...(await this.getSessionView(session)) };
  }

  /** Ingelogde klant: CLIENT_USER-sessie op een toegankelijk plan met de vlag aan. */
  async startClientSession(
    user: CurrentClientUserData,
    orgId: string | null,
    dto: StartRepairSessionDto,
  ) {
    const org = this.inspections.requireOrg(orgId);
    await this.inspections.assertInspectionAccess(user.id, org, dto.inspectionPlanId);

    const plan = await this.prisma.inspectionPlan.findFirst({
      where: { id: dto.inspectionPlanId, orgId: org, deletedAt: null },
      select: { id: true, onlineRepairEnabled: true },
    });
    if (!plan) throw new NotFoundException('Inspectie niet gevonden');
    if (!plan.onlineRepairEnabled) {
      throw new BadRequestException('Online herstel is niet beschikbaar voor deze inspectie');
    }

    const session = await this.prisma.repairSession.create({
      data: {
        orgId: org,
        inspectionPlanId: plan.id,
        accessType: RepairAccessType.CLIENT_USER,
        token: randomBytes(48).toString('hex'),
        clientUserId: user.id,
        contactName: `${user.firstName} ${user.lastName}`.trim(),
        email: user.email,
        expiresAt: new Date(Date.now() + REPAIR_SESSION_TTL_MS),
      },
    });

    return { token: session.token, expiresAt: session.expiresAt, ...(await this.getSessionView(session)) };
  }

  private assertActive(session: RepairSession): void {
    if (session.status !== RepairSessionStatus.ACTIVE) {
      throw new BadRequestException('Deze herstelsessie is al afgerond');
    }
  }

  // ── Sessie-overzicht ────────────────────────────────────

  async getSessionView(session: RepairSession) {
    const plan = (await this.prisma.inspectionPlan.findFirst({
      where: { id: session.inspectionPlanId, orgId: session.orgId, deletedAt: null },
      include: {
        location: { select: { postalCode: true } },
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            contactPhone: true,
            contactEmail: true,
            sharePhoneWithClients: true,
            shareEmailWithClients: true,
          },
        },
        organization: {
          select: {
            inspectorPhoneDisplay: true,
            inspectorEmailDisplay: true,
            inspectorStaticPhone: true,
            inspectorStaticEmail: true,
          },
        },
        inspectionTemplate: {
          select: {
            classificationModel: {
              select: {
                characteristics: {
                  select: {
                    code: true,
                    options: {
                      select: { code: true, name: true, color: true, isCritical: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    })) as PlanWithClassification | null;
    if (!plan) throw new NotFoundException('Inspectie niet gevonden');

    const classificationModel: SeverityClassificationModel =
      plan.inspectionTemplate?.classificationModel ?? null;

    // Constateringen in deterministische volgorde: volgnummer = positie (PRD §14.7).
    const findings = await this.prisma.finding.findMany({
      where: { inspectionPlanId: plan.id, orgId: session.orgId, deletedAt: null },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        shortDescription: true,
        longDescription: true,
        locationDescription: true,
        normReference: true,
        recommendation: true,
        statusCode: true,
        isCritical: true,
        resolvedAt: true,
        classificationValues: true,
        resolutions: {
          orderBy: { resolvedAt: 'asc' },
          select: {
            id: true,
            statusCode: true,
            description: true,
            resolvedAt: true,
            repairSessionId: true,
            photos: { orderBy: { uploadedAt: 'asc' }, select: { id: true } },
          },
        },
      },
    });

    // Constatering-foto's (polymorf Photo-model, entityType 'finding').
    const findingIds = findings.map((f) => f.id);
    const photos = findingIds.length
      ? await this.prisma.photo.findMany({
          where: { entityType: 'finding', entityId: { in: findingIds }, deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: { id: true, entityId: true },
        })
      : [];
    const photosByFinding = photos.reduce<Record<string, Array<{ id: string; url: string }>>>(
      (acc, p) => {
        (acc[p.entityId] ||= []).push({ id: p.id, url: photoUrl(p.id) });
        return acc;
      },
      {},
    );

    // Samenvatting per classificatie-groep + weergave per constatering.
    const groups = new Map<
      string,
      {
        code: string;
        label: string;
        color: string;
        isCritical: boolean;
        openCount: number;
        resolvedCount: number;
      }
    >();

    const findingViews = findings.map((finding, index) => {
      const classification = getMainClassification(
        finding.classificationValues as Record<string, string> | null,
        classificationModel,
      );

      const group = groups.get(classification.code) ?? {
        code: classification.code,
        label: classification.name,
        color: classification.color,
        isCritical: classification.isCritical,
        openCount: 0,
        resolvedCount: 0,
      };
      if (finding.statusCode === STATUS_OPEN) group.openCount += 1;
      if (finding.statusCode === STATUS_RESOLVED) group.resolvedCount += 1;
      groups.set(classification.code, group);

      // Herstel-info: de REPORTED-resolutie (van welke sessie dan ook) — zonder
      // herstellergegevens (PRD §14.3 besluit 4). CONFLICT-meldingen zijn alleen
      // zichtbaar voor de eigen sessie.
      const reported = finding.resolutions.find((r) => r.statusCode === RESOLUTION_REPORTED);
      const myConflict = finding.resolutions.find(
        (r) => r.statusCode === RESOLUTION_CONFLICT && r.repairSessionId === session.id,
      );

      return {
        id: finding.id,
        seq: index + 1,
        shortDescription: finding.shortDescription,
        longDescription: finding.longDescription,
        locationDescription: finding.locationDescription,
        normReference: finding.normReference,
        recommendation: finding.recommendation,
        statusCode: finding.statusCode,
        isCritical: finding.isCritical,
        classification,
        photos: photosByFinding[finding.id] ?? [],
        repair: reported
          ? {
              resolutionId: reported.id,
              description: reported.description,
              reportedAt: reported.resolvedAt,
              photos: reported.photos.map((p) => ({ id: p.id, url: photoUrl(p.id) })),
              isMine: reported.repairSessionId === session.id,
            }
          : null,
        myConflict: myConflict
          ? {
              resolutionId: myConflict.id,
              description: myConflict.description,
              reportedAt: myConflict.resolvedAt,
              photos: myConflict.photos.map((p) => ({ id: p.id, url: photoUrl(p.id) })),
            }
          : null,
      };
    });

    const inspector = plan.assignedUser
      ? {
          firstName: plan.assignedUser.firstName,
          lastName: plan.assignedUser.lastName,
          ...resolveInspectorContact(plan.organization, plan.assignedUser),
        }
      : null;

    return {
      session: {
        id: session.id,
        accessType: session.accessType,
        status: session.status,
        contactName: session.contactName,
        companyName: session.companyName,
        email: session.email,
        generatedDocumentId: session.generatedDocumentId,
        expiresAt: session.expiresAt,
        completedAt: session.completedAt,
      },
      plan: {
        id: plan.id,
        projectName: plan.projectName,
        referenceNumber: plan.referenceNumber,
        addressStreet: plan.addressStreet,
        addressHouseNumber: plan.addressHouseNumber,
        addressPostalCode: plan.addressPostalCode,
        addressCity: plan.addressCity,
        plannedDate: plan.plannedDate,
        inspector,
      },
      summary: [...groups.values()],
      findings: findingViews,
    };
  }

  // ── Claim (first-wins) ──────────────────────────────────

  /**
   * Herstelmelding op één constatering. Atomisch first-wins (PRD §14.3 besluit 3):
   * de updateMany raakt alleen een rij die nog 'open' is; nul rijen = verloren
   * race → invoer bewaren als CONFLICT + 409 met NL-melding.
   */
  async claimFinding(session: RepairSession, findingId: string, dto: RepairResolveDto) {
    this.assertActive(session);

    const finding = await this.prisma.finding.findFirst({
      where: {
        id: findingId,
        orgId: session.orgId,
        inspectionPlanId: session.inspectionPlanId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!finding) throw new NotFoundException('Constatering niet gevonden');

    // Dubbelclaim binnen dezelfde sessie is een invoerfout, geen conflict.
    const mine = await this.prisma.findingResolution.findFirst({
      where: { findingId, repairSessionId: session.id },
      select: { id: true },
    });
    if (mine) {
      throw new BadRequestException('U heeft deze constatering al hersteld gemeld');
    }

    const { won, resolution } = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.finding.updateMany({
        where: {
          id: findingId,
          orgId: session.orgId,
          inspectionPlanId: session.inspectionPlanId,
          statusCode: STATUS_OPEN,
          deletedAt: null,
        },
        data: { statusCode: STATUS_RESOLVED, resolvedAt: new Date() },
      });
      const wonRace = updated.count === 1;
      const created = await tx.findingResolution.create({
        data: {
          findingId,
          repairSessionId: session.id,
          resolvedByClientUserId: session.clientUserId,
          description: dto.description,
          statusCode: wonRace ? RESOLUTION_REPORTED : RESOLUTION_CONFLICT,
        },
      });
      return { won: wonRace, resolution: created };
    });

    if (!won) {
      // Na commit: conflictdispatch fire-and-forget (fase 3 vult de inhoud in).
      this.events
        .onRepairConflict(session, findingId, resolution)
        .catch((err) => this.logger.error('Conflictdispatch mislukt', err));
      throw new ConflictException(REPAIR_CONFLICT_ERROR);
    }

    // Kritiek-check fire-and-forget (PRD §14.6): eenmalige herinspectie-trigger.
    this.checkCriticalRepaired(session).catch((err) =>
      this.logger.error('Kritiek-check mislukt', err),
    );

    return {
      resolution: {
        id: resolution.id,
        findingId,
        statusCode: resolution.statusCode,
        description: resolution.description,
        reportedAt: resolution.resolvedAt,
      },
    };
  }

  /**
   * Eenmalige herinspectie-trigger (PRD §14.3 besluit 9): geen open kritieke
   * constateringen meer én nog niet gemeld → timestamp atomisch zetten
   * (updateMany-guard tegen dubbele triggers) + dispatch (fase 3).
   * Vuurt alleen wanneer het plan überhaupt kritieke constateringen heeft.
   */
  private async checkCriticalRepaired(session: RepairSession): Promise<void> {
    const [openCritical, totalCritical] = await Promise.all([
      this.prisma.finding.count({
        where: {
          inspectionPlanId: session.inspectionPlanId,
          orgId: session.orgId,
          isCritical: true,
          statusCode: STATUS_OPEN,
          deletedAt: null,
        },
      }),
      this.prisma.finding.count({
        where: {
          inspectionPlanId: session.inspectionPlanId,
          orgId: session.orgId,
          isCritical: true,
          deletedAt: null,
        },
      }),
    ]);
    if (openCritical > 0 || totalCritical === 0) return;

    const flipped = await this.prisma.inspectionPlan.updateMany({
      where: { id: session.inspectionPlanId, criticalRepairNotifiedAt: null },
      data: { criticalRepairNotifiedAt: new Date() },
    });
    if (flipped.count === 1) {
      await this.events.onAllCriticalRepaired(session.inspectionPlanId, session.orgId);
    }
  }

  // ── Foto's ──────────────────────────────────────────────

  /** Foto's bij een eigen REPORTED/CONFLICT-melding van deze sessie (max 5). */
  async uploadResolutionPhotos(
    session: RepairSession,
    findingId: string,
    files: Express.Multer.File[],
  ) {
    this.assertActive(session);

    const resolution = await this.prisma.findingResolution.findFirst({
      where: {
        findingId,
        repairSessionId: session.id,
        statusCode: { in: [RESOLUTION_REPORTED, RESOLUTION_CONFLICT] },
      },
      orderBy: { resolvedAt: 'desc' },
      include: { photos: { select: { id: true } } },
    });
    if (!resolution) {
      throw new BadRequestException('Geen herstelmelding gevonden. Meld eerst de constatering als hersteld.');
    }
    if (resolution.photos.length + files.length > MAX_PHOTOS) {
      throw new BadRequestException(
        `Maximaal ${MAX_PHOTOS} foto's toegestaan. U heeft er al ${resolution.photos.length}.`,
      );
    }

    const created = await Promise.all(
      files.map(async (file) => {
        const ext = EXT[file.mimetype] ?? 'jpg';
        const key = `${session.orgId}/finding-photos/${randomUUID()}.${ext}`;
        await this.storage.upload(key, file.buffer, file.mimetype);
        return this.prisma.findingResolutionPhoto.create({
          data: { resolutionId: resolution.id, photoUrl: key },
        });
      }),
    );

    return created.map((p) => ({ id: p.id, uploadedAt: p.uploadedAt, url: photoUrl(p.id) }));
  }

  /**
   * Foto-stream binnen de sessie-scope: resolutiefoto's van het plan (CONFLICT
   * alleen van de eigen sessie) én constatering-foto's (Photo, entityType
   * 'finding') van het plan.
   */
  async getPhoto(
    session: RepairSession,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const resolutionPhoto = await this.prisma.findingResolutionPhoto.findFirst({
      where: {
        id: photoId,
        resolution: {
          finding: { inspectionPlanId: session.inspectionPlanId, orgId: session.orgId },
        },
      },
      select: {
        photoUrl: true,
        resolution: { select: { statusCode: true, repairSessionId: true } },
      },
    });
    if (resolutionPhoto) {
      // Conflict-concepten zijn privé voor de indienende sessie (PRD §14.9.2).
      if (
        resolutionPhoto.resolution.statusCode === RESOLUTION_CONFLICT &&
        resolutionPhoto.resolution.repairSessionId !== session.id
      ) {
        throw new NotFoundException('Foto niet gevonden');
      }
      const buffer = await this.storage.download(resolutionPhoto.photoUrl);
      return {
        buffer,
        mimeType: resolutionPhoto.photoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg',
      };
    }

    const photo = await this.prisma.photo.findFirst({
      where: { id: photoId, entityType: 'finding', orgId: session.orgId, deletedAt: null },
      select: { entityId: true, storagePath: true, mimeType: true },
    });
    if (photo) {
      const finding = await this.prisma.finding.findFirst({
        where: {
          id: photo.entityId,
          inspectionPlanId: session.inspectionPlanId,
          orgId: session.orgId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (finding) {
        const buffer = await this.storage.download(photo.storagePath);
        return { buffer, mimeType: photo.mimeType };
      }
    }

    throw new NotFoundException('Foto niet gevonden');
  }
}
