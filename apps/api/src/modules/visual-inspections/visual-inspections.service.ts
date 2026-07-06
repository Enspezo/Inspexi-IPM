// Nieuw in Beheer (in Inspexi-App bestonden visuele inspecties alleen via de
// offline sync-laag, zonder REST). Beheer-conventies (gespiegeld op findings):
//  - status = InspectionExecStatus enum (not_started/in_progress/completed) — GEEN lookup
//  - gedenormaliseerde orgId (overgenomen van de asset)
//  - parent-asset org-scoped via getAssetInOrg → 404 bij cross-tenant
//  - FK-validatie: inspectorId binnen dezelfde org (assertSameOrg)
//  - HARD delete (model heeft geen deletedAt)
//  - X-Device-ID → deviceId bij create

import { Injectable } from '@nestjs/common';
import { User, Prisma, InspectionExecStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertSameOrg, requireOrg, validateJsonColumn } from '@/common';
import { checklistResultsSchema, CHECKLIST_RESULTS_LABEL } from './schemas/checklist-results.schema';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { CreateVisualInspectionDto, UpdateVisualInspectionDto } from './dto';

@Injectable()
export class VisualInspectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  /** Org-scope de parent-asset-node; cross-tenant of onbekend → 404. */
  private async getAssetNodeInOrg(assetNodeId: string, user: User) {
    return assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id: assetNodeId, ...orgScope(user), deletedAt: null },
      }),
      'Asset-node',
    );
  }

  /** Haal een org-scoped visuele inspectie op (geen deletedAt op dit model). */
  private async getInOrg(id: string, user: User) {
    return assertFound(
      await this.prisma.visualInspection.findFirst({ where: { id, ...orgScope(user) } }),
      'Visuele inspectie',
    );
  }

  async findAllByAsset(assetNodeId: string, user: User) {
    await this.getAssetNodeInOrg(assetNodeId, user);

    return this.prisma.visualInspection.findMany({
      where: { assetNodeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        assetNodeId: true,
        inspectionPlanId: true,
        status: true,
        checklistResults: true,
        startedAt: true,
        completedAt: true,
        inspectorId: true,
        createdAt: true,
        updatedAt: true,
        syncedAt: true,
        deviceId: true,
        _count: { select: { findings: true } },
      },
    });
  }

  async findById(id: string, user: User) {
    return assertFound(
      await this.prisma.visualInspection.findFirst({
        where: { id, ...orgScope(user) },
        include: {
          assetNode: { select: { id: true, name: true, typeCode: true } },
          findings: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              shortDescription: true,
              statusCode: true,
              createdAt: true,
            },
          },
        },
      }),
      'Visuele inspectie',
    );
  }

  async create(assetNodeId: string, user: User, dto: CreateVisualInspectionDto, deviceId?: string) {
    const orgId = requireOrg(user);
    validateJsonColumn(checklistResultsSchema, dto.checklistResults, CHECKLIST_RESULTS_LABEL);

    // Plan binnen de org + de asset-node binnen de boom van dit plan.
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: dto.inspectionPlanId, ...orgScope(user), deletedAt: null },
        select: { id: true, orgId: true, locationId: true },
      }),
      'Inspectieplan',
    );
    await this.assetNodes.assertNodeInPlanTree(assetNodeId, plan);

    // FK binnen dezelfde org
    await assertSameOrg(this.prisma.user, dto.inspectorId, orgId, 'Inspecteur');

    return this.prisma.visualInspection.create({
      data: {
        orgId,
        assetNodeId,
        inspectionPlanId: plan.id,
        status: InspectionExecStatus.not_started,
        checklistResults: (dto.checklistResults ?? []) as Prisma.InputJsonValue,
        inspectorId: dto.inspectorId,
        deviceId,
      },
      select: {
        id: true,
        assetNodeId: true,
        inspectionPlanId: true,
        status: true,
        checklistResults: true,
        inspectorId: true,
        deviceId: true,
        createdAt: true,
      },
    });
  }

  async update(id: string, user: User, dto: UpdateVisualInspectionDto) {
    requireOrg(user);
    validateJsonColumn(checklistResultsSchema, dto.checklistResults, CHECKLIST_RESULTS_LABEL);
    const inspection = await this.getInOrg(id, user);

    const data: Prisma.VisualInspectionUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.checklistResults !== undefined) {
      data.checklistResults = dto.checklistResults as Prisma.InputJsonValue;
    }

    return this.prisma.visualInspection.update({
      where: { id: inspection.id },
      data,
      select: {
        id: true,
        status: true,
        checklistResults: true,
        startedAt: true,
        completedAt: true,
        updatedAt: true,
      },
    });
  }

  /** Start de uitvoering: status → in_progress, startedAt = nu, inspecteur = huidige gebruiker indien nog leeg. */
  async start(id: string, user: User) {
    requireOrg(user);
    const inspection = await this.getInOrg(id, user);

    return this.prisma.visualInspection.update({
      where: { id: inspection.id },
      data: {
        status: InspectionExecStatus.in_progress,
        startedAt: new Date(),
        ...(inspection.inspectorId ? {} : { inspector: { connect: { id: user.id } } }),
      },
      select: {
        id: true,
        status: true,
        startedAt: true,
        inspectorId: true,
        updatedAt: true,
      },
    });
  }

  /** Rond af: status → completed, completedAt = nu. */
  async complete(id: string, user: User) {
    requireOrg(user);
    const inspection = await this.getInOrg(id, user);

    return this.prisma.visualInspection.update({
      where: { id: inspection.id },
      data: {
        status: InspectionExecStatus.completed,
        completedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
        completedAt: true,
        updatedAt: true,
      },
    });
  }

  /** Hard delete (model heeft geen deletedAt). */
  async delete(id: string, user: User) {
    requireOrg(user);
    const inspection = await this.getInOrg(id, user);
    await this.prisma.visualInspection.delete({ where: { id: inspection.id } });
    return { deleted: true };
  }
}
