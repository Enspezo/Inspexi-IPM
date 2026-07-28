// Foto-upload (PWA) + authenticated download. Opslag via STORAGE_PROVIDER (lokaal of R2).
// orgId + entiteit-bestaan worden server-side gecontroleerd (tenant-veilig).
// Polymorf: entityType wire 'inspectionPlan' → enum 'inspection_plan'.

import { Injectable, Inject, BadRequestException, Logger } from '@nestjs/common';
import { User, PhotoEntityType, AssetNodeType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertAllowedImageUpload } from '@/common';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import { PhotoUploadDto } from './dto';
import { makeThumbnail } from './thumbnail.util';

/** Duck-type voor providers die signed-URLs ondersteunen (R2). Lokaal → download-route. */
interface SignedUrlCapable {
  supportsSignedUrls?: () => boolean;
  getSignedUrl?: (key: string, expiresInSeconds?: number) => Promise<string>;
}

const WIRE_TO_ENUM: Record<string, PhotoEntityType> = {
  asset: PhotoEntityType.asset,
  finding: PhotoEntityType.finding,
  inspectionPlan: PhotoEntityType.inspection_plan,
};

@Injectable()
export class PhotosService {
  private readonly logger = new Logger(PhotosService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  /** Resolve het doel-entiteit binnen de org en geef de orgId terug. */
  private async resolveEntityOrg(
    entityType: PhotoUploadDto['entityType'],
    entityId: string,
    user: User,
  ): Promise<string> {
    if (entityType === 'asset') {
      const entity = assertFound(
        await this.prisma.assetNode.findFirst({
          where: { id: entityId, ...orgScope(user), nodeType: AssetNodeType.ASSET },
          select: { orgId: true },
        }),
        'Entiteit',
      );
      return entity.orgId;
    }
    const where = { id: entityId, ...orgScope(user) };
    const entity = assertFound(
      entityType === 'finding'
        ? await this.prisma.finding.findFirst({ where, select: { orgId: true } })
        : await this.prisma.inspectionPlan.findFirst({ where, select: { orgId: true } }),
      'Entiteit',
    );
    return entity.orgId;
  }

  async upload(
    file: { buffer: Buffer; mimetype: string; size: number },
    dto: PhotoUploadDto,
    user: User,
    deviceId?: string,
  ) {
    if (!file) throw new BadRequestException('Geen bestand ontvangen');
    // Magic bytes beslissen type + extensie (WP-B4); `file.mimetype` is
    // client-supplied en telt alleen als whitelist-poort.
    const detected = assertAllowedImageUpload(file);
    const orgId = await this.resolveEntityOrg(dto.entityType, dto.entityId, user);
    const uuid = randomUUID();
    const key = `${orgId}/photos/${uuid}.${detected.extension}`;
    await this.storage.upload(key, file.buffer, detected.mimeType);

    // Thumbnail (Fase 4) — fail-soft: bij een onleesbare/corrupte afbeelding vallen we terug
    // op de originele key, zodat de upload zelf nooit faalt op de thumbnail-stap.
    let thumbnailPath = key;
    try {
      const thumb = await makeThumbnail(file.buffer);
      const thumbKey = `${orgId}/photos/thumb/${uuid}.jpg`;
      await this.storage.upload(thumbKey, thumb, 'image/jpeg');
      thumbnailPath = thumbKey;
    } catch (e) {
      this.logger.warn(
        `Thumbnail-generatie mislukt (val terug op origineel): ${(e as Error).message}`,
      );
    }

    const photo = await this.prisma.photo.create({
      data: {
        orgId,
        entityType: WIRE_TO_ENUM[dto.entityType],
        entityId: dto.entityId,
        storagePath: key,
        thumbnailPath,
        mimeType: detected.mimeType,
        fileSize: file.size,
        caption: dto.caption,
        capturedAt: dto.capturedAt ? new Date(dto.capturedAt) : null,
        gpsLatitude: dto.gpsLatitude as unknown as Prisma.Decimal,
        gpsLongitude: dto.gpsLongitude as unknown as Prisma.Decimal,
        uploadedBy: user.id,
        deviceId,
      },
      select: { id: true },
    });

    return { id: photo.id, ...(await this.buildPhotoUrls(photo.id, key, thumbnailPath)) };
  }

  /**
   * Geeft signed-URLs als de provider die ondersteunt (R2), anders de authenticated
   * download-routes (lokale opslag).
   */
  private async buildPhotoUrls(
    id: string,
    storageKey: string,
    thumbKey: string,
  ): Promise<{ url: string; thumbnailUrl: string }> {
    const s = this.storage as StorageProvider & SignedUrlCapable;
    if (s.supportsSignedUrls?.() && s.getSignedUrl) {
      return {
        url: await s.getSignedUrl(storageKey),
        thumbnailUrl: await s.getSignedUrl(thumbKey),
      };
    }
    return {
      url: `/api/v1/photos/${id}/download`,
      thumbnailUrl: `/api/v1/photos/${id}/download?thumb=1`,
    };
  }

  /** Buffer + mime voor de download-route (org-scoped). `thumb` → de thumbnail-variant. */
  async getFile(
    id: string,
    user: User,
    thumb = false,
  ): Promise<{ buffer: Buffer; mimeType: string }> {
    const photo = assertFound(
      await this.prisma.photo.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        select: { storagePath: true, thumbnailPath: true, mimeType: true },
      }),
      'Foto',
    );
    // Alleen een echte thumbnail (afwijkende key, JPEG) als zodanig serveren.
    const useThumb = thumb && !!photo.thumbnailPath && photo.thumbnailPath !== photo.storagePath;
    const path = useThumb ? photo.thumbnailPath! : photo.storagePath;
    const buffer = await this.storage.download(path);
    return { buffer, mimeType: useThumb ? 'image/jpeg' : photo.mimeType };
  }
}
