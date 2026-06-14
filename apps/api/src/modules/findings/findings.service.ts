// Geport uit Inspexi-App. Beheer-conventies + Fase 1-schema:
//  - status (enum) → statusCode (lookup 'finding-status-types'); systeemcode 'resolved'
//    stuurt de resolutie-logica (Fase 1 §3a)
//  - gedenormaliseerde orgId (overgenomen van de asset)
//  - FK-validatie: asset/template/visual/measurement binnen dezelfde org
//  - soft-delete via deletedAt
//
// NB: foto-URL's worden hier nog als opslag-key teruggegeven; signed URLs komen
//     in Fase 4 (R2StorageProvider.getSignedUrl).

import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound } from '@/common';
import { LookupService } from '../lookups/lookup.service';
import { CreateFindingDto, UpdateFindingDto } from './dto';

const STATUS_RESOLVED = 'resolved';

@Injectable()
export class FindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookups: LookupService,
  ) {}

  private requireOrg(user: User): string {
    if (!user.orgId) throw new BadRequestException('Selecteer eerst een organisatie');
    return user.orgId;
  }

  private async assertStatus(code: string | undefined, orgId: string): Promise<void> {
    if (!code) return;
    const row = await this.lookups.resolveLookup('finding-status-types', code, orgId);
    if (!row) throw new BadRequestException(`Onbekende constatering-status: ${code}`);
  }

  private async getAssetInOrg(assetId: string, user: User) {
    return assertFound(
      await this.prisma.asset.findFirst({ where: { id: assetId, ...orgScope(user), deletedAt: null } }),
      'Asset',
    );
  }

  async findAllByAsset(assetId: string, user: User) {
    await this.getAssetInOrg(assetId, user);

    const findings = await this.prisma.finding.findMany({
      where: { assetId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, assetId: true, inspectionType: true, findingTemplateId: true,
        shortDescription: true, longDescription: true, classificationValues: true,
        locationDescription: true, recommendation: true, recommendationCustom: true,
        normReference: true, statusCode: true, resolvedAt: true, resolutionNotes: true,
        createdAt: true, updatedAt: true, createdBy: true,
        findingTemplate: {
          select: {
            id: true, code: true, shortDescription: true,
            classificationModel: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    // Foto's per constatering (polymorf op entityType='finding')
    const findingIds = findings.map((f) => f.id);
    const photos = findingIds.length
      ? await this.prisma.photo.findMany({
          where: { entityType: 'finding', entityId: { in: findingIds }, deletedAt: null },
          select: { id: true, entityId: true, storagePath: true, thumbnailPath: true },
        })
      : [];
    const photosByFinding = photos.reduce<Record<string, any[]>>((acc, p) => {
      (acc[p.entityId] ||= []).push({ id: p.id, thumbnailUrl: p.thumbnailPath, fullUrl: p.storagePath });
      return acc;
    }, {});

    // createdBy-namen
    const userIds = [...new Set(findings.map((f) => f.createdBy).filter(Boolean))] as string[];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const usersById = new Map(users.map((u) => [u.id, u]));

    return findings.map((f) => {
      const u = f.createdBy ? usersById.get(f.createdBy) : null;
      return {
        ...f,
        createdByUser: u ? { id: u.id, name: `${u.firstName} ${u.lastName}` } : null,
        photos: photosByFinding[f.id] || [],
      };
    });
  }

  async findById(id: string, user: User) {
    const finding = assertFound(
      await this.prisma.finding.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        include: {
          asset: { select: { id: true, name: true, assetType: true } },
          findingTemplate: {
            select: {
              id: true, code: true, shortDescription: true, longDescription: true,
              classificationModel: {
                select: {
                  id: true, code: true, name: true,
                  characteristics: { include: { options: true }, orderBy: { sortOrder: 'asc' } },
                },
              },
            },
          },
        },
      }),
      'Constatering',
    );

    const [createdByUser, resolvedByUser] = await Promise.all([
      finding.createdBy
        ? this.prisma.user.findUnique({ where: { id: finding.createdBy }, select: { id: true, firstName: true, lastName: true } })
        : null,
      finding.resolvedBy
        ? this.prisma.user.findUnique({ where: { id: finding.resolvedBy }, select: { id: true, firstName: true, lastName: true } })
        : null,
    ]);

    return { ...finding, createdByUser, resolvedByUser };
  }

  async create(assetId: string, user: User, dto: CreateFindingDto, deviceId?: string) {
    this.requireOrg(user);
    const asset = await this.getAssetInOrg(assetId, user);

    // FK's binnen dezelfde asset / org
    if (dto.visualInspectionId) {
      assertFound(
        await this.prisma.visualInspection.findFirst({ where: { id: dto.visualInspectionId, assetId } }),
        'Visuele inspectie',
      );
    }
    if (dto.measurementRecordId) {
      assertFound(
        await this.prisma.measurementRecord.findFirst({ where: { id: dto.measurementRecordId, assetId } }),
        'Meting',
      );
    }
    if (dto.findingTemplateId) {
      assertFound(
        await this.prisma.findingTemplate.findFirst({
          where: { id: dto.findingTemplateId, OR: [{ orgId: asset.orgId }, { orgId: null, isSystem: true }] },
        }),
        'Constatering-template',
      );
    }

    return this.prisma.finding.create({
      data: {
        orgId: asset.orgId,
        assetId,
        inspectionType: dto.inspectionType,
        visualInspectionId: dto.visualInspectionId,
        measurementRecordId: dto.measurementRecordId,
        findingTemplateId: dto.findingTemplateId,
        shortDescription: dto.shortDescription,
        longDescription: dto.longDescription,
        classificationValues: (dto.classificationValues ?? {}) as Prisma.InputJsonValue,
        locationDescription: dto.locationDescription,
        recommendation: dto.recommendation,
        recommendationCustom: dto.recommendationCustom,
        normReference: dto.normReference,
        checklistItemId: dto.checklistItemId,
        statusCode: 'open',
        createdBy: user.id,
        deviceId,
      },
      select: { id: true, classificationValues: true, statusCode: true, createdAt: true },
    });
  }

  async update(id: string, user: User, dto: UpdateFindingDto) {
    const orgId = this.requireOrg(user);
    const finding = assertFound(
      await this.prisma.finding.findFirst({ where: { id, ...orgScope(user), deletedAt: null } }),
      'Constatering',
    );
    await this.assertStatus(dto.statusCode, orgId);

    const data: Prisma.FindingUpdateInput = {};
    if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription;
    if (dto.longDescription !== undefined) data.longDescription = dto.longDescription;
    if (dto.classificationValues !== undefined) data.classificationValues = dto.classificationValues as Prisma.InputJsonValue;
    if (dto.locationDescription !== undefined) data.locationDescription = dto.locationDescription;
    if (dto.recommendation !== undefined) data.recommendation = dto.recommendation;
    if (dto.recommendationCustom !== undefined) data.recommendationCustom = dto.recommendationCustom;
    if (dto.normReference !== undefined) data.normReference = dto.normReference;
    if (dto.statusCode !== undefined) data.statusCode = dto.statusCode;

    // Resolutie: bij overgang naar systeemcode 'resolved'
    if (dto.statusCode === STATUS_RESOLVED && finding.statusCode !== STATUS_RESOLVED) {
      data.resolvedAt = new Date();
      data.resolvedByUser = { connect: { id: user.id } };
      data.resolutionNotes = dto.resolutionNotes;
    }

    return this.prisma.finding.update({
      where: { id: finding.id },
      data,
      select: { id: true, classificationValues: true, statusCode: true, resolvedAt: true, updatedAt: true },
    });
  }

  async delete(id: string, user: User) {
    this.requireOrg(user);
    const finding = assertFound(
      await this.prisma.finding.findFirst({ where: { id, ...orgScope(user), deletedAt: null } }),
      'Constatering',
    );
    await this.prisma.finding.update({ where: { id: finding.id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }
}
