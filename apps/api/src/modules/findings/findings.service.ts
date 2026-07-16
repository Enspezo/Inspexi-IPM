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
import {
  orgScope,
  assertFound,
  requireOrg,
  validateJsonColumn,
  STATUS_OPEN,
  STATUS_RESOLVED,
  computeFindingIsCritical,
  loadPlanCriticalModel,
} from '@/common';
import { LookupService, LOOKUP_KIND } from '../lookups/lookup.service';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { CreateFindingDto, UpdateFindingDto } from './dto';
import { classificationValuesSchema, CLASSIFICATION_VALUES_LABEL } from './schemas/classification-values.schema';

@Injectable()
export class FindingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookups: LookupService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  private async assertStatus(code: string | undefined, orgId: string): Promise<void> {
    if (!code) return;
    const row = await this.lookups.resolveLookup(LOOKUP_KIND.FINDING_STATUS_TYPES, code, orgId);
    if (!row) throw new BadRequestException(`Onbekende constatering-status: ${code}`);
  }

  /** Org-scope de asset-node; cross-tenant of onbekend → 404. */
  private async getAssetNodeInOrg(assetNodeId: string, user: User) {
    return assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id: assetNodeId, ...orgScope(user), deletedAt: null },
      }),
      'Asset-node',
    );
  }

  async findAllByAsset(assetNodeId: string, user: User) {
    await this.getAssetNodeInOrg(assetNodeId, user);

    const findings = await this.prisma.finding.findMany({
      where: { assetNodeId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, assetNodeId: true, inspectionPlanId: true, inspectionType: true, findingTemplateId: true,
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
          assetNode: { select: { id: true, name: true, typeCode: true } },
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

  async create(assetNodeId: string, user: User, dto: CreateFindingDto, deviceId?: string) {
    const orgId = requireOrg(user);
    validateJsonColumn(classificationValuesSchema, dto.classificationValues, CLASSIFICATION_VALUES_LABEL);

    // Plan binnen de org + de asset-node binnen de boom van dit plan (rootLocationId === plan.locationId).
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: dto.inspectionPlanId, ...orgScope(user), deletedAt: null },
        select: { id: true, orgId: true, locationId: true },
      }),
      'Inspectieplan',
    );
    await this.assetNodes.assertNodeInPlanTree(assetNodeId, plan);

    // FK's binnen dezelfde asset-node / org
    if (dto.visualInspectionId) {
      assertFound(
        await this.prisma.visualInspection.findFirst({ where: { id: dto.visualInspectionId, assetNodeId } }),
        'Visuele inspectie',
      );
    }
    if (dto.measurementRecordId) {
      assertFound(
        await this.prisma.measurementRecord.findFirst({ where: { id: dto.measurementRecordId, assetNodeId } }),
        'Meting',
      );
    }
    if (dto.findingTemplateId) {
      assertFound(
        await this.prisma.findingTemplate.findFirst({
          where: { id: dto.findingTemplateId, OR: [{ orgId }, { orgId: null, isSystem: true }] },
        }),
        'Constatering-template',
      );
    }
    // Checklist-item: eigen org of een systeem-item (cross-tenant guard).
    if (dto.checklistItemId) {
      assertFound(
        await this.prisma.checklistItem.findFirst({
          where: { id: dto.checklistItemId, OR: [{ orgId }, { orgId: null, isSystem: true }] },
        }),
        'Checklist-item',
      );
    }

    // Finding.isCritical is server-owned (PRD-14): afgeleid van classificationValues
    // × de isCritical-vlaggen van het classificatiemodel van het plan.
    const isCritical = computeFindingIsCritical(
      dto.classificationValues ?? {},
      await loadPlanCriticalModel(this.prisma, plan.id),
    );

    return this.prisma.finding.create({
      data: {
        orgId,
        assetNodeId,
        inspectionPlanId: plan.id,
        isCritical,
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
        statusCode: STATUS_OPEN,
        createdBy: user.id,
        deviceId,
      },
      select: { id: true, classificationValues: true, statusCode: true, createdAt: true },
    });
  }

  async update(id: string, user: User, dto: UpdateFindingDto) {
    const orgId = requireOrg(user);
    validateJsonColumn(classificationValuesSchema, dto.classificationValues, CLASSIFICATION_VALUES_LABEL);
    const finding = assertFound(
      await this.prisma.finding.findFirst({ where: { id, ...orgScope(user), deletedAt: null } }),
      'Constatering',
    );
    await this.assertStatus(dto.statusCode, orgId);

    const data: Prisma.FindingUpdateInput = {};
    if (dto.shortDescription !== undefined) data.shortDescription = dto.shortDescription;
    if (dto.longDescription !== undefined) data.longDescription = dto.longDescription;
    if (dto.classificationValues !== undefined) {
      data.classificationValues = dto.classificationValues as Prisma.InputJsonValue;
      // isCritical volgt de classificatie (PRD-14, server-owned)
      data.isCritical = computeFindingIsCritical(
        dto.classificationValues,
        await loadPlanCriticalModel(this.prisma, finding.inspectionPlanId),
      );
    }
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

    const updated = await this.prisma.finding.update({
      where: { id: finding.id },
      data,
      select: { id: true, classificationValues: true, statusCode: true, resolvedAt: true, updatedAt: true },
    });

    // Heropen-reset (PRD-14 besluit 9): gaat een kritieke constatering van 'resolved'
    // terug naar een open status, dan mag de "alle kritieke punten hersteld"-trigger
    // opnieuw vuren → criticalRepairNotifiedAt leegmaken.
    if (
      dto.statusCode !== undefined &&
      dto.statusCode !== STATUS_RESOLVED &&
      finding.statusCode === STATUS_RESOLVED &&
      finding.isCritical
    ) {
      await this.prisma.inspectionPlan.updateMany({
        where: { id: finding.inspectionPlanId, criticalRepairNotifiedAt: { not: null } },
        data: { criticalRepairNotifiedAt: null },
      });
    }

    return updated;
  }

  async delete(id: string, user: User) {
    requireOrg(user);
    const finding = assertFound(
      await this.prisma.finding.findFirst({ where: { id, ...orgScope(user), deletedAt: null } }),
      'Constatering',
    );
    await this.prisma.finding.update({ where: { id: finding.id }, data: { deletedAt: new Date() } });
    return { deleted: true };
  }
}
