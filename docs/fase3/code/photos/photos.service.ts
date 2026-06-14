// Doel in apps/api: src/modules/photos/photos.service.ts
//
// Foto-upload (PWA) + authenticated download. Opslag via STORAGE_PROVIDER (lokaal of R2).
// orgId + entiteit-bestaan worden server-side gecontroleerd (tenant-veilig).
// Polymorf: entityType wire 'inspectionPlan' → enum 'inspection_plan'.

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { User, PhotoEntityType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound } from '@/common';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';
import type { StorageProvider } from '@/common/services/storage/storage.interface';
import { PhotoUploadDto } from './dto';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const WIRE_TO_ENUM: Record<string, PhotoEntityType> = {
  asset: PhotoEntityType.asset,
  finding: PhotoEntityType.finding,
  inspectionPlan: PhotoEntityType.inspection_plan,
};

@Injectable()
export class PhotosService {
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
    const where = { id: entityId, ...orgScope(user) };
    const model =
      entityType === 'asset' ? this.prisma.asset
      : entityType === 'finding' ? this.prisma.finding
      : this.prisma.inspectionPlan;
    const entity = assertFound(await (model as any).findFirst({ where, select: { orgId: true } }), 'Entiteit');
    return entity.orgId;
  }

  async upload(
    file: { buffer: Buffer; mimetype: string; size: number },
    dto: PhotoUploadDto,
    user: User,
    deviceId?: string,
  ) {
    if (!file) throw new BadRequestException('Geen bestand ontvangen');
    if (!ALLOWED_MIME.has(file.mimetype)) {
      throw new BadRequestException('Alleen JPEG, PNG of WebP toegestaan');
    }
    const orgId = await this.resolveEntityOrg(dto.entityType, dto.entityId, user);
    const key = `${orgId}/photos/${randomUUID()}.${EXT[file.mimetype]}`;
    await this.storage.upload(key, file.buffer, file.mimetype);

    const photo = await this.prisma.photo.create({
      data: {
        orgId,
        entityType: WIRE_TO_ENUM[dto.entityType],
        entityId: dto.entityId,
        storagePath: key,
        thumbnailPath: key, // TODO Fase 4: thumbnail genereren (sharp)
        mimeType: file.mimetype,
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

    return {
      id: photo.id,
      url: `/api/v1/photos/${photo.id}/download`,
      thumbnailUrl: `/api/v1/photos/${photo.id}/download?thumb=1`,
    };
  }

  /** Buffer + mime voor de download-route (org-scoped). */
  async getFile(id: string, user: User): Promise<{ buffer: Buffer; mimeType: string }> {
    const photo = assertFound(
      await this.prisma.photo.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        select: { storagePath: true, mimeType: true },
      }),
      'Foto',
    );
    const buffer = await this.storage.download(photo.storagePath);
    return { buffer, mimeType: photo.mimeType };
  }
}
