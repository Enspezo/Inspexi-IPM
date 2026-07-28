// COMPAT-WRAPPER (Fase 2b). De losse `InspectionLocation`-tabel is opgegaan in
// de unified `AssetNode`-boom (nodeType = LOCATION). Deze service houdt de oude
// `inspection-plans/:planId/locations`-endpoints in stand door te mappen op
// AssetNodesService. Wordt verwijderd ná de PWA-cutover
// (zie docs/fase3/PWA-CUTOVER-ASSET-NODE.md).
//
// Veld-mapping (oud → AssetNode): locationType → typeCode, parentLocationId →
// parentId. `description` blijft `description`. Pad/diepte worden door de
// DB-trigger onderhouden (AssetNodesService).

import { Injectable, BadRequestException } from '@nestjs/common';
import { AssetNodeType, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, requireOrg } from '@/common';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import { CreateLocationDto, UpdateLocationDto, MoveLocationDto, ReorderLocationsDto } from './dto';

/** AssetNode (raw of prisma) → oude InspectionLocation-vorm. */
interface NodeLike {
  id: string;
  parentId: string | null;
  typeCode: string;
  name: string;
  identifier: string | null;
  description: string | null;
  sortOrder: number;
  technicalData: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class InspectionLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  private toLocation(node: NodeLike) {
    return {
      id: node.id,
      parentLocationId: node.parentId,
      locationType: node.typeCode,
      name: node.name,
      identifier: node.identifier,
      description: node.description,
      sortOrder: node.sortOrder,
      technicalData: node.technicalData,
      notes: node.notes,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  /** Wortel-LOCATION-node van het plan (lazily aangemaakt); default-parent voor nieuwe locaties. */
  private async getPlanRootNodeId(planId: string, user: User): Promise<string> {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, ...orgScope(user), deletedAt: null },
        select: { locationId: true },
      }),
      'Inspectieplan',
    );
    if (!plan.locationId) {
      throw new BadRequestException('Het inspectieplan heeft geen hoofdlocatie (locationId)');
    }
    const root = await this.assetNodes.ensureRootNode(plan.locationId, user);
    return root.id;
  }

  /** Locaties per inspectieplan (boom of plat). */
  async findAllByPlan(
    planId: string,
    user: User,
    options?: { parentId?: string; flat?: boolean },
  ) {
    const nodes = await this.assetNodes.listPlanNodes(planId, user, AssetNodeType.LOCATION);
    const ids = nodes.map((n) => n.id);

    const childCountByNode = new Map<string, number>();
    for (const n of nodes) {
      if (n.parentId) childCountByNode.set(n.parentId, (childCountByNode.get(n.parentId) ?? 0) + 1);
    }
    const assetCounts = ids.length
      ? await this.prisma.assetNode.groupBy({
          by: ['parentId'],
          where: { parentId: { in: ids }, nodeType: AssetNodeType.ASSET, deletedAt: null },
          _count: { _all: true },
        })
      : [];
    const assetCountByNode = new Map(
      assetCounts.map((c) => [c.parentId as string, c._count._all]),
    );

    const mapped = nodes.map((n) => ({
      ...this.toLocation(n),
      childCount: childCountByNode.get(n.id) ?? 0,
      assetCount: assetCountByNode.get(n.id) ?? 0,
    }));

    if (options?.flat) return mapped;
    const nodeIds = new Set(ids);
    return this.buildHierarchy(mapped, options?.parentId ?? null, nodeIds);
  }

  /** Hiërarchische boom van locaties voor een plan. */
  async getTree(planId: string, user: User) {
    return this.findAllByPlan(planId, user, { flat: false });
  }

  /** Aantal locaties voor een plan. */
  async getCountByPlan(planId: string, user: User): Promise<{ count: number }> {
    const nodes = await this.assetNodes.listPlanNodes(planId, user, AssetNodeType.LOCATION);
    return { count: nodes.length };
  }

  async findById(id: string, user: User) {
    const node = assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id, ...orgScope(user), nodeType: AssetNodeType.LOCATION, deletedAt: null },
        include: {
          parent: { select: { id: true, name: true, typeCode: true } },
          children: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      'Locatie',
    );

    const childLocations = node.children.filter((c) => c.nodeType === AssetNodeType.LOCATION);
    const assets = node.children.filter((c) => c.nodeType === AssetNodeType.ASSET);
    return {
      ...this.toLocation(node),
      parentLocation: node.parent
        ? { id: node.parent.id, name: node.parent.name, locationType: node.parent.typeCode }
        : null,
      childLocations: childLocations.map((c) => this.toLocation(c)),
      assets: assets.map((c) => this.toLocation(c)),
    };
  }

  async create(planId: string, user: User, dto: CreateLocationDto, deviceId?: string) {
    requireOrg(user);
    const parentId = dto.parentLocationId ?? (await this.getPlanRootNodeId(planId, user));

    const created = await this.assetNodes.create(
      user,
      {
        parentId,
        nodeType: AssetNodeType.LOCATION,
        typeCode: dto.locationType,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        technicalData: dto.technicalData,
        notes: dto.notes,
        sortOrder: dto.sortOrder,
      },
      deviceId,
    );
    return this.toLocation(created);
  }

  async update(id: string, user: User, dto: UpdateLocationDto) {
    requireOrg(user);
    await this.assertLocationNode(id, user);
    const updated = await this.assetNodes.update(id, user, {
      name: dto.name,
      identifier: dto.identifier,
      description: dto.description,
      technicalData: dto.technicalData,
      notes: dto.notes,
      sortOrder: dto.sortOrder,
    });
    return this.toLocation(updated);
  }

  async move(id: string, user: User, dto: MoveLocationDto) {
    requireOrg(user);
    await this.assertLocationNode(id, user);
    if (!dto.newParentId) {
      throw new BadRequestException('Een locatie moet onder een andere locatie hangen');
    }
    const moved = await this.assetNodes.move(id, user, {
      newParentId: dto.newParentId,
      sortOrder: dto.sortOrder,
    });
    return this.toLocation(moved);
  }

  async reorder(planId: string, user: User, dto: ReorderLocationsDto) {
    requireOrg(user);
    const planNodes = await this.assetNodes.listPlanNodes(planId, user, AssetNodeType.LOCATION);
    // Elke opgegeven locatie moet in de boom van dit plan zitten (de update draait
    // op `where: { id }`; zonder deze check kon een ander plan/org geraakt worden).
    const allowed = new Set(planNodes.map((n) => n.id));
    if (!dto.locationIds.every((locationId) => allowed.has(locationId))) {
      throw new BadRequestException('Een of meer locaties horen niet bij dit inspectieplan');
    }
    await this.prisma.$transaction(
      dto.locationIds.map((locationId, index) =>
        this.prisma.assetNode.update({ where: { id: locationId }, data: { sortOrder: index } }),
      ),
    );
    return { reordered: true };
  }

  async delete(id: string, user: User) {
    requireOrg(user);
    await this.assertLocationNode(id, user);
    // Soft-delete de hele subtree (locatie + onderliggende locaties én assets).
    await this.assetNodes.delete(id, user);
    return { deleted: true };
  }

  // ── helpers ──
  private async assertLocationNode(id: string, user: User) {
    return assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id, ...orgScope(user), nodeType: AssetNodeType.LOCATION, deletedAt: null },
        select: { id: true },
      }),
      'Locatie',
    );
  }

  private buildHierarchy(
    locations: Array<ReturnType<InspectionLocationsService['toLocation']> & { childCount: number }>,
    parentId: string | null,
    nodeIds: Set<string>,
  ): unknown[] {
    return locations
      .filter((l) =>
        parentId === null
          ? l.parentLocationId === null || !nodeIds.has(l.parentLocationId)
          : l.parentLocationId === parentId,
      )
      .map((l) => ({ ...l, children: this.buildHierarchy(locations, l.id, nodeIds) }));
  }
}
