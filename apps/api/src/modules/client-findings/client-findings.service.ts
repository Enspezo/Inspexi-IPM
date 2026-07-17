// Klant-constateringen: detail, oplossen (FindingResolution), foto-upload (STORAGE_PROVIDER)
// en het terugtrekken van een nog niet geverifieerde resolutie. Tenant-veilig: finding
// org-scoped opgehaald, daarna ClientAccess-check op het inspectieplan van het asset.
// Geport uit ../Inspexi-App/.../client-findings, aangepast aan het Beheer-schema
// (FindingResolution.statusCode i.p.v. status; foto's via STORAGE_PROVIDER-key).

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import type { CurrentClientUserData } from '@/common/decorators/current-client-user.decorator';
import { ClientInspectionsService } from '../client-inspections/client-inspections.service';
import { ResolveFindingDto } from './dto';

const PENDING = 'PENDING_VERIFICATION';
const MAX_PHOTOS = 5;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };

/** Publieke URL naar de authenticated foto-download-route (verbergt de storage-key). */
function photoDownloadUrl(id: string): string {
  return `/api/v1/client/findings/resolution-photos/${id}`;
}

@Injectable()
export class ClientFindingsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly inspections: ClientInspectionsService,
  ) {}

  /** Org-scoped fetch + ClientAccess-check via het inspectieplan van het asset. */
  private async getWithAccessCheck(user: CurrentClientUserData, orgId: string | null, findingId: string) {
    const org = this.inspections.requireOrg(orgId);
    const finding = await this.prisma.finding.findFirst({
      where: { id: findingId, orgId: org, deletedAt: null },
      include: {
        assetNode: { select: { id: true, name: true, description: true } },
      },
    });
    if (!finding) throw new NotFoundException('Constatering niet gevonden');
    await this.inspections.assertInspectionAccess(user.id, org, finding.inspectionPlanId);
    return finding;
  }

  async getDetail(user: CurrentClientUserData, orgId: string | null, findingId: string) {
    await this.getWithAccessCheck(user, orgId, findingId);
    const finding = await this.prisma.finding.findUnique({
      where: { id: findingId },
      include: {
        assetNode: { select: { id: true, name: true, description: true } },
        resolutions: {
          orderBy: { resolvedAt: 'desc' },
          include: {
            photos: { orderBy: { uploadedAt: 'asc' } },
            resolvedByClientUser: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!finding) throw new NotFoundException('Constatering niet gevonden');

    // Storage-keys verbergen: elke foto krijgt een download-URL.
    // Anonimiteit (PRD-14 §14.3 besluit 4): bij herstel-flow-resoluties
    // (REPORTED/CONFLICT) mag het klantportaal nooit zien wíe herstelde —
    // ook niet wanneer een ingelogde klant de hersteller was. Staf ziet de
    // invullergegevens wél (via de staf-serializer in findings.service).
    return {
      ...finding,
      resolutions: finding.resolutions.map((r) => {
        const anonymous = r.statusCode === 'REPORTED' || r.statusCode === 'CONFLICT';
        return {
          ...r,
          resolvedByClientUserId: anonymous ? null : r.resolvedByClientUserId,
          resolvedByClientUser: anonymous ? null : r.resolvedByClientUser,
          photos: r.photos.map((p) => ({
            id: p.id,
            caption: p.caption,
            uploadedAt: p.uploadedAt,
            url: photoDownloadUrl(p.id),
          })),
        };
      }),
    };
  }

  /** Constatering als opgelost melden → FindingResolution (PENDING_VERIFICATION). */
  async resolve(user: CurrentClientUserData, orgId: string | null, findingId: string, dto: ResolveFindingDto) {
    await this.getWithAccessCheck(user, orgId, findingId);

    const existingPending = await this.prisma.findingResolution.findFirst({
      where: { findingId, statusCode: PENDING },
      select: { id: true },
    });
    if (existingPending) {
      throw new BadRequestException('Er is al een openstaande resolutie voor deze constatering');
    }

    return this.prisma.findingResolution.create({
      data: {
        findingId,
        resolvedByClientUserId: user.id,
        description: dto.description ?? null,
        statusCode: PENDING,
      },
    });
  }

  /** Foto's bij de laatste openstaande resolutie (max 5). Opslag via STORAGE_PROVIDER. */
  async uploadResolutionPhotos(
    user: CurrentClientUserData,
    orgId: string | null,
    findingId: string,
    files: Express.Multer.File[],
  ) {
    const finding = await this.getWithAccessCheck(user, orgId, findingId);

    const resolution = await this.prisma.findingResolution.findFirst({
      where: { findingId, resolvedByClientUserId: user.id, statusCode: PENDING },
      orderBy: { resolvedAt: 'desc' },
      include: { photos: true },
    });
    if (!resolution) {
      throw new BadRequestException(
        'Geen openstaande resolutie gevonden. Meld eerst de constatering als opgelost.',
      );
    }
    if (resolution.photos.length + files.length > MAX_PHOTOS) {
      throw new BadRequestException(
        `Maximaal ${MAX_PHOTOS} foto's toegestaan. U heeft er al ${resolution.photos.length}.`,
      );
    }

    const created = await Promise.all(
      files.map(async (file) => {
        const ext = EXT[file.mimetype] ?? 'jpg';
        const key = `${finding.orgId}/finding-photos/${randomUUID()}.${ext}`;
        await this.storage.upload(key, file.buffer, file.mimetype);
        return this.prisma.findingResolutionPhoto.create({
          data: { resolutionId: resolution.id, photoUrl: key },
        });
      }),
    );

    return created.map((p) => ({ id: p.id, uploadedAt: p.uploadedAt, url: photoDownloadUrl(p.id) }));
  }

  /** Verwijder de eigen, nog niet geverifieerde resolutie (+ foto's uit storage). */
  async deleteResolution(user: CurrentClientUserData, orgId: string | null, findingId: string) {
    await this.getWithAccessCheck(user, orgId, findingId);

    const resolution = await this.prisma.findingResolution.findFirst({
      where: { findingId, resolvedByClientUserId: user.id, statusCode: PENDING },
      include: { photos: true },
    });
    if (!resolution) {
      throw new BadRequestException(
        "Geen verwijderbare resolutie gevonden. Alleen resoluties met status 'wacht op verificatie' kunnen verwijderd worden.",
      );
    }

    for (const photo of resolution.photos) {
      await this.storage.delete(photo.photoUrl).catch(() => undefined);
    }
    // Foto's cascaden mee (onDelete: Cascade).
    await this.prisma.findingResolution.delete({ where: { id: resolution.id } });
    return { deleted: true };
  }

  /** Buffer + mime voor de authenticated foto-download-route (org + ClientAccess gescoped). */
  async getResolutionPhoto(
    user: CurrentClientUserData,
    orgId: string | null,
    photoId: string,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const org = this.inspections.requireOrg(orgId);
    const photo = await this.prisma.findingResolutionPhoto.findFirst({
      where: { id: photoId, resolution: { finding: { orgId: org } } },
      select: {
        photoUrl: true,
        resolution: {
          select: { finding: { select: { inspectionPlanId: true } } },
        },
      },
    });
    if (!photo) throw new NotFoundException('Foto niet gevonden');
    await this.inspections.assertInspectionAccess(
      user.id,
      org,
      photo.resolution.finding.inspectionPlanId,
    );
    const buffer = await this.storage.download(photo.photoUrl);
    return { buffer, mimeType: photo.photoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg' };
  }
}
