// Geport uit Inspexi-App (location-images). Beheer-conventies + Fase 1-schema:
//  - één afbeelding per locatie (LocationImage.locationId @unique) → upsert bij upload
//  - opslag via STORAGE_PROVIDER (storage.upload/delete), key `${orgId}/${uuid}-${filename}`
//  - tenant-scope via de ouder-locatie (orgScope + deletedAt: null op de locatie);
//    LocationImage/-Marker hebben GEEN deletedAt
//  - gedenormaliseerde orgId (overgenomen van de locatie)
//  - FK-validatie: marker.assetId/findingId/standaloneMeasurementId + quick-finding.assetId
//    binnen dezelfde org (assertSameOrg)
//  - X-Device-ID → deviceId op create/upload
//
// NB: opslag-keys worden hier nog teruggegeven; signed URLs komen in Fase 4.

import {
  Injectable,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { User, Prisma, MarkerType, AssetNodeType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '@/prisma';
import {
  orgScope,
  assertFound,
  assertSameOrg,
  requireOrg,
  assertAllowedImageUpload,
} from '@/common';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '@/common/services/storage/storage.interface';
import { AssetsService } from '../assets/assets.service';
import { FindingsService } from '../findings/findings.service';
import { StandaloneMeasurementsService } from '../standalone-measurements/standalone-measurements.service';
import {
  CreateMarkerDto,
  UpdateMarkerDto,
  QuickCreateAssetDto,
  QuickCreateMeasurementDto,
  QuickCreateFindingDto,
} from './dto';

const markerInclude = {
  assetNode: { select: { id: true, name: true, typeCode: true, statusCode: true } },
  finding: {
    select: { id: true, shortDescription: true, statusCode: true, classificationValues: true },
  },
  standaloneMeasurement: {
    select: { id: true, measurementType: true, description: true },
  },
} satisfies Prisma.LocationImageMarkerInclude;

@Injectable()
export class LocationImagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    private readonly assets: AssetsService,
    private readonly findings: FindingsService,
    private readonly measurements: StandaloneMeasurementsService,
  ) {}

  /** LOCATION-node binnen de organisatie (soft-delete-scoped). Bron van orgId. */
  private async getLocationInOrg(locationId: string, user: User) {
    return assertFound(
      await this.prisma.assetNode.findFirst({
        where: {
          id: locationId,
          nodeType: AssetNodeType.LOCATION,
          ...orgScope(user),
          deletedAt: null,
        },
      }),
      'Locatie',
    );
  }

  /** Afbeelding via de ouder-LOCATION-node scopen. Geeft image + bijbehorende node terug. */
  private async getImageInOrg(imageId: string, user: User) {
    const image = assertFound(
      await this.prisma.locationImage.findFirst({
        where: {
          id: imageId,
          node: { nodeType: AssetNodeType.LOCATION, ...orgScope(user), deletedAt: null },
        },
        include: {
          node: {
            select: {
              id: true,
              orgId: true,
              planScopes: {
                select: { inspectionPlanId: true, isPrimary: true },
                orderBy: { isPrimary: 'desc' },
              },
            },
          },
        },
      }),
      'Locatie-afbeelding',
    );
    return image;
  }

  /** Het (primaire) inspectieplan waarin de LOCATION-node valt — voor snelacties. */
  private resolvePlanId(node: { planScopes: { inspectionPlanId: string }[] }): string {
    const planId = node.planScopes[0]?.inspectionPlanId;
    if (!planId) {
      throw new BadRequestException(
        'Locatie is aan geen enkele inspectie gekoppeld; snelactie niet mogelijk',
      );
    }
    return planId;
  }

  // ── Afbeelding ──

  async getImageByLocation(locationId: string, user: User) {
    await this.getLocationInOrg(locationId, user);

    return assertFound(
      await this.prisma.locationImage.findUnique({
        where: { nodeId: locationId },
        include: { markers: { include: markerInclude, orderBy: { createdAt: 'asc' } } },
      }),
      'Locatie-afbeelding',
    );
  }

  /** Ruwe bytes van de locatie-afbeelding (voor inline preview/download). */
  async getImageFile(locationId: string, user: User) {
    await this.getLocationInOrg(locationId, user);

    const image = assertFound(
      await this.prisma.locationImage.findUnique({ where: { nodeId: locationId } }),
      'Locatie-afbeelding',
    );

    const buffer = await this.storage.download(image.storagePath);
    return { buffer, image };
  }

  async uploadImage(
    locationId: string,
    user: User,
    file: Express.Multer.File,
    deviceId?: string,
  ) {
    const location = await this.getLocationInOrg(locationId, user);
    const orgId = location.orgId;

    // Bestaande afbeelding? Oud bestand uit opslag verwijderen.
    const existing = await this.prisma.locationImage.findUnique({ where: { nodeId: locationId } });
    if (existing) {
      await this.storage.delete(existing.storagePath).catch(() => undefined);
      if (existing.thumbnailPath) {
        await this.storage.delete(existing.thumbnailPath).catch(() => undefined);
      }
    }

    // Magic bytes beslissen type + opslagextensie (WP-B4); de extensie komt
    // niet meer uit `originalname` en het opgeslagen mimetype niet meer uit de
    // client-claim.
    const detected = assertAllowedImageUpload(file);
    const storagePath = `${orgId}/${randomUUID()}.${detected.extension}`;
    await this.storage.upload(storagePath, file.buffer, detected.mimeType);

    const data = {
      orgId,
      storagePath,
      originalFilename: file.originalname,
      fileSize: file.size,
      mimeType: detected.mimeType,
      createdBy: user.id,
      deviceId,
    };

    return this.prisma.locationImage.upsert({
      where: { nodeId: locationId },
      create: { nodeId: locationId, ...data },
      update: data,
    });
  }

  async deleteImage(locationId: string, user: User) {
    await this.getLocationInOrg(locationId, user);

    const image = assertFound(
      await this.prisma.locationImage.findUnique({ where: { nodeId: locationId } }),
      'Locatie-afbeelding',
    );

    await this.storage.delete(image.storagePath).catch(() => undefined);
    if (image.thumbnailPath) {
      await this.storage.delete(image.thumbnailPath).catch(() => undefined);
    }

    // Record verwijderen (markers cascaden mee).
    await this.prisma.locationImage.delete({ where: { nodeId: locationId } });
    return { deleted: true };
  }

  // ── Markers ──

  async listMarkers(imageId: string, user: User) {
    await this.getImageInOrg(imageId, user);

    return this.prisma.locationImageMarker.findMany({
      where: { locationImageId: imageId },
      include: markerInclude,
      orderBy: { createdAt: 'asc' },
    });
  }

  async createMarker(imageId: string, user: User, dto: CreateMarkerDto, deviceId?: string) {
    const orgId = requireOrg(user);
    const image = await this.getImageInOrg(imageId, user);

    // FK-vorm valideren tegen markerType + cross-tenant-isolatie.
    this.validateMarkerForeignKeys(dto);
    await assertSameOrg(this.prisma.assetNode, dto.assetId, orgId, 'Asset');
    await assertSameOrg(this.prisma.finding, dto.findingId, orgId, 'Constatering');
    await assertSameOrg(
      this.prisma.standaloneMeasurement,
      dto.standaloneMeasurementId,
      orgId,
      'Meting',
    );

    return this.prisma.locationImageMarker.create({
      data: {
        orgId: image.node.orgId,
        locationImageId: imageId,
        positionX: dto.positionX,
        positionY: dto.positionY,
        markerType: dto.markerType,
        assetNodeId: dto.assetId,
        findingId: dto.findingId,
        standaloneMeasurementId: dto.standaloneMeasurementId,
        annotation: (dto.annotation ?? undefined) as Prisma.InputJsonValue | undefined,
        label: dto.label,
        color: dto.color,
        icon: dto.icon,
        createdBy: user.id,
        deviceId,
      },
    });
  }

  async updateMarker(imageId: string, markerId: string, user: User, dto: UpdateMarkerDto) {
    await this.getImageInOrg(imageId, user);
    const marker = await this.getMarkerScoped(imageId, markerId);

    const data: Prisma.LocationImageMarkerUpdateInput = {};
    if (dto.positionX !== undefined) data.positionX = dto.positionX;
    if (dto.positionY !== undefined) data.positionY = dto.positionY;
    if (dto.annotation !== undefined) data.annotation = dto.annotation as Prisma.InputJsonValue;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.color !== undefined) data.color = dto.color;
    if (dto.icon !== undefined) data.icon = dto.icon;

    return this.prisma.locationImageMarker.update({ where: { id: marker.id }, data });
  }

  async deleteMarker(imageId: string, markerId: string, user: User) {
    await this.getImageInOrg(imageId, user);
    const marker = await this.getMarkerScoped(imageId, markerId);

    await this.prisma.locationImageMarker.delete({ where: { id: marker.id } });
    return { deleted: true, id: markerId };
  }

  // ── Snelacties ──

  async quickCreateAsset(imageId: string, user: User, dto: QuickCreateAssetDto, deviceId?: string) {
    requireOrg(user);
    const image = await this.getImageInOrg(imageId, user);

    // Asset via AssetsService (valideert type-constraints e.d.).
    const asset = await this.assets.create(
      this.resolvePlanId(image.node),
      user,
      {
        assetType: dto.assetType,
        name: dto.name,
        identifier: dto.identifier,
        parentAssetId: dto.parentAssetId,
        technicalData: dto.technicalData,
        notes: dto.notes,
      },
      deviceId,
    );

    // AssetsService.create hangt de asset niet onder de LOCATION-node → koppel hem hier alsnog.
    await this.prisma.assetNode.update({
      where: { id: asset.id },
      data: { parentId: image.node.id },
    });

    const marker = await this.prisma.locationImageMarker.create({
      data: {
        orgId: image.node.orgId,
        locationImageId: imageId,
        positionX: dto.positionX,
        positionY: dto.positionY,
        markerType: MarkerType.ASSET,
        assetNodeId: asset.id,
        label: dto.label,
        createdBy: user.id,
        deviceId,
      },
    });

    return { asset, marker };
  }

  async quickCreateMeasurement(
    imageId: string,
    user: User,
    dto: QuickCreateMeasurementDto,
    deviceId?: string,
  ) {
    requireOrg(user);
    const image = await this.getImageInOrg(imageId, user);

    // Meting via StandaloneMeasurementsService (valideert locatie binnen org).
    const measurement = await this.measurements.create(
      this.resolvePlanId(image.node),
      user,
      {
        locationId: image.node.id,
        measurementType: dto.measurementType,
        description: dto.description,
      },
      deviceId,
    );

    const marker = await this.prisma.locationImageMarker.create({
      data: {
        orgId: image.node.orgId,
        locationImageId: imageId,
        positionX: dto.positionX,
        positionY: dto.positionY,
        markerType: MarkerType.MEASUREMENT,
        standaloneMeasurementId: measurement.id,
        label: dto.label,
        createdBy: user.id,
        deviceId,
      },
    });

    return { measurement, marker };
  }

  async quickCreateFinding(
    imageId: string,
    user: User,
    dto: QuickCreateFindingDto,
    deviceId?: string,
  ) {
    const orgId = requireOrg(user);
    const image = await this.getImageInOrg(imageId, user);

    // Asset moet binnen dezelfde org vallen (cross-tenant-isolatie); FindingsService
    // valideert daarnaast nog op zijn eigen org-scope.
    await assertSameOrg(this.prisma.assetNode, dto.assetId, orgId, 'Asset');

    const finding = await this.findings.create(
      dto.assetId,
      user,
      {
        inspectionPlanId: this.resolvePlanId(image.node),
        inspectionType: dto.inspectionType,
        shortDescription: dto.shortDescription,
        longDescription: dto.longDescription,
        findingTemplateId: dto.findingTemplateId,
        classificationValues: dto.classificationValues,
        recommendation: dto.recommendation,
        normReference: dto.normReference,
      },
      deviceId,
    );

    const marker = await this.prisma.locationImageMarker.create({
      data: {
        orgId: image.node.orgId,
        locationImageId: imageId,
        positionX: dto.positionX,
        positionY: dto.positionY,
        markerType: MarkerType.FINDING,
        findingId: finding.id,
        annotation: (dto.annotation ?? undefined) as Prisma.InputJsonValue | undefined,
        label: dto.label,
        createdBy: user.id,
        deviceId,
      },
    });

    return { finding, marker };
  }

  // ── Helpers ──

  private async getMarkerScoped(imageId: string, markerId: string) {
    return assertFound(
      await this.prisma.locationImageMarker.findFirst({
        where: { id: markerId, locationImageId: imageId },
      }),
      'Marker',
    );
  }

  private validateMarkerForeignKeys(dto: CreateMarkerDto) {
    const { markerType, assetId, findingId, standaloneMeasurementId } = dto;

    if (markerType === MarkerType.ASSET) {
      if (!assetId) throw new BadRequestException('assetId is verplicht voor markertype ASSET');
      if (findingId || standaloneMeasurementId) {
        throw new BadRequestException('Alleen assetId is toegestaan voor markertype ASSET');
      }
    } else if (markerType === MarkerType.FINDING) {
      if (!findingId) throw new BadRequestException('findingId is verplicht voor markertype FINDING');
      if (assetId || standaloneMeasurementId) {
        throw new BadRequestException('Alleen findingId is toegestaan voor markertype FINDING');
      }
    } else if (markerType === MarkerType.MEASUREMENT) {
      if (!standaloneMeasurementId) {
        throw new BadRequestException(
          'standaloneMeasurementId is verplicht voor markertype MEASUREMENT',
        );
      }
      if (assetId || findingId) {
        throw new BadRequestException(
          'Alleen standaloneMeasurementId is toegestaan voor markertype MEASUREMENT',
        );
      }
    }
  }
}
