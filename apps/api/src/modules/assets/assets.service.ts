// COMPAT-WRAPPER (Fase 2b). De losse `Asset`-tabel is opgegaan in de unified
// `AssetNode`-boom. Deze service houdt de oude `assets`-endpoints in stand door
// te mappen op AssetNodesService (nodeType = ASSET). Wordt verwijderd ná de
// PWA-cutover (zie docs/fase3/PWA-CUTOVER-ASSET-NODE.md).
//
// Veld-mapping (oud → AssetNode): assetType → typeCode, parentAssetId → parentId,
// locationDescription → description. Pad/diepte worden door de DB-trigger
// onderhouden (AssetNodesService).

import { Injectable, BadRequestException } from '@nestjs/common';
import { AssetNodeType, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, requireOrg } from '@/common';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import {
  CreateAssetDto,
  UpdateAssetDto,
  MoveAssetDto,
  ReorderAssetsDto,
  ListAssetsQueryDto,
} from './dto';

/** AssetNode (raw of prisma) → oude Asset-vorm voor API-compatibiliteit. */
interface NodeLike {
  id: string;
  parentId: string | null;
  typeCode: string;
  name: string;
  identifier: string | null;
  description: string | null;
  sortOrder: number;
  statusCode: string;
  technicalData: Prisma.JsonValue;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  private toAsset(node: NodeLike) {
    return {
      id: node.id,
      parentAssetId: node.parentId,
      assetType: node.typeCode,
      name: node.name,
      identifier: node.identifier,
      locationDescription: node.description,
      sortOrder: node.sortOrder,
      statusCode: node.statusCode,
      technicalData: node.technicalData,
      notes: node.notes,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    };
  }

  /** Organisatie-breed asset-register (portal). Assets zijn nu losgekoppeld van
   * plannen; contact-scoping verhuist naar de boom-/locatieweergave (Fase 4). */
  async findAllForOrganization(user: User, q: ListAssetsQueryDto) {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 50, 200);

    const where: Prisma.AssetNodeWhereInput = {
      ...orgScope(user),
      nodeType: AssetNodeType.ASSET,
      deletedAt: null,
      ...(q.assetTypeCode ? { typeCode: q.assetTypeCode } : {}),
      ...(q.statusCode ? { statusCode: q.statusCode } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { identifier: { contains: q.search, mode: 'insensitive' } },
              { typeCode: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.assetNode.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          parentId: true,
          typeCode: true,
          name: true,
          identifier: true,
          description: true,
          sortOrder: true,
          statusCode: true,
          technicalData: true,
          notes: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              findings: { where: { deletedAt: null } },
              measurementRecords: true,
              visualInspections: true,
            },
          },
        },
      }),
      this.prisma.assetNode.count({ where }),
    ]);

    const data = rows.map((r) => ({ ...this.toAsset(r), _count: r._count }));
    return { data, total, page, limit };
  }

  /** Assets per inspectieplan (boom of plat) — via de boom van plan.locationId. */
  async findAllByPlan(
    planId: string,
    user: User,
    options?: { parentId?: string; flat?: boolean },
  ) {
    const nodes = await this.assetNodes.listPlanNodes(planId, user, AssetNodeType.ASSET);
    const ids = nodes.map((n) => n.id);

    const [findingCounts, visuals, measurements] = await Promise.all([
      ids.length
        ? this.prisma.finding.groupBy({
            by: ['assetNodeId'],
            where: { assetNodeId: { in: ids }, deletedAt: null },
            _count: { _all: true },
          })
        : [],
      ids.length
        ? this.prisma.visualInspection.findMany({
            where: { assetNodeId: { in: ids } },
            select: { assetNodeId: true, status: true },
          })
        : [],
      ids.length
        ? this.prisma.measurementRecord.findMany({
            where: { assetNodeId: { in: ids } },
            select: { assetNodeId: true, status: true },
          })
        : [],
    ]);

    const findingByNode = new Map(findingCounts.map((c) => [c.assetNodeId, c._count._all]));
    const visualByNode = new Map(visuals.map((v) => [v.assetNodeId, v.status]));
    const measByNode = new Map(measurements.map((m) => [m.assetNodeId, m.status]));
    const childCountByNode = new Map<string, number>();
    for (const n of nodes) {
      if (n.parentId) childCountByNode.set(n.parentId, (childCountByNode.get(n.parentId) ?? 0) + 1);
    }

    const mapped = nodes.map((n) => ({
      ...this.toAsset(n),
      childCount: childCountByNode.get(n.id) ?? 0,
      findingCount: findingByNode.get(n.id) ?? 0,
      visualInspectionStatus: visualByNode.get(n.id) ?? 'not_started',
      measurementStatus: measByNode.get(n.id) ?? 'not_started',
    }));

    if (options?.flat) return mapped;

    // Niet-plat: alleen de assets direct onder `parentId` (of de eerste asset-laag).
    const parentId = options?.parentId ?? null;
    const rootParents = new Set(nodes.map((n) => n.id));
    return this.buildHierarchy(
      mapped,
      // Asset-nodes hangen onder LOCATION- of ASSET-nodes; "wortel" van de
      // asset-laag = een asset waarvan de parent geen asset is.
      parentId ?? null,
      rootParents,
    );
  }

  async findById(id: string, user: User) {
    const node = assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id, ...orgScope(user), nodeType: AssetNodeType.ASSET, deletedAt: null },
        include: {
          visualInspections: true,
          measurementRecords: true,
          findings: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
          children: {
            where: { deletedAt: null, nodeType: AssetNodeType.ASSET },
            orderBy: { sortOrder: 'asc' },
          },
        },
      }),
      'Asset',
    );

    return {
      ...this.toAsset(node),
      visualInspections: node.visualInspections,
      measurementRecords: node.measurementRecords,
      findings: node.findings,
      childAssets: node.children.map((c) => this.toAsset(c)),
    };
  }

  async create(planId: string, user: User, dto: CreateAssetDto, deviceId?: string) {
    requireOrg(user);
    const parentId =
      dto.parentAssetId ?? (await this.assetNodes.resolveDefaultParentForPlan(planId, user));

    const created = await this.assetNodes.create(
      user,
      {
        parentId,
        nodeType: AssetNodeType.ASSET,
        typeCode: dto.assetType,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.locationDescription,
        technicalData: dto.technicalData,
        notes: dto.notes,
        sortOrder: dto.sortOrder,
      },
      deviceId,
    );
    return this.toAsset(created);
  }

  async update(id: string, user: User, dto: UpdateAssetDto) {
    requireOrg(user);
    await this.assertAssetNode(id, user);
    const updated = await this.assetNodes.update(id, user, {
      name: dto.name,
      identifier: dto.identifier,
      description: dto.locationDescription,
      statusCode: dto.statusCode,
      technicalData: dto.technicalData,
      notes: dto.notes,
      sortOrder: dto.sortOrder,
    });
    return this.toAsset(updated);
  }

  async move(id: string, user: User, dto: MoveAssetDto) {
    requireOrg(user);
    await this.assertAssetNode(id, user);
    if (!dto.newParentId) {
      throw new BadRequestException('Een asset moet onder een locatie- of asset-node hangen');
    }
    const moved = await this.assetNodes.move(id, user, {
      newParentId: dto.newParentId,
      sortOrder: dto.sortOrder,
    });
    return this.toAsset(moved);
  }

  async reorder(planId: string, user: User, dto: ReorderAssetsDto) {
    requireOrg(user);
    // Org-scope-check via het plan (404 bij cross-tenant).
    await this.assetNodes.listPlanNodes(planId, user, AssetNodeType.ASSET);
    await this.prisma.$transaction(
      dto.assetIds.map((assetId, index) =>
        this.prisma.assetNode.update({ where: { id: assetId }, data: { sortOrder: index } }),
      ),
    );
    return { reordered: true };
  }

  async delete(id: string, user: User) {
    requireOrg(user);
    await this.assertAssetNode(id, user);
    await this.assetNodes.delete(id, user);
    return { deleted: true };
  }

  // ── helpers ──
  private async assertAssetNode(id: string, user: User) {
    return assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id, ...orgScope(user), nodeType: AssetNodeType.ASSET, deletedAt: null },
        select: { id: true },
      }),
      'Asset',
    );
  }

  private buildHierarchy(
    assets: Array<ReturnType<AssetsService['toAsset']> & { childCount: number }>,
    parentId: string | null,
    assetIds: Set<string>,
  ): unknown[] {
    return assets
      .filter((a) =>
        parentId === null
          ? a.parentAssetId === null || !assetIds.has(a.parentAssetId)
          : a.parentAssetId === parentId,
      )
      .map((a) => ({ ...a, children: this.buildHierarchy(assets, a.id, assetIds) }));
  }
}
