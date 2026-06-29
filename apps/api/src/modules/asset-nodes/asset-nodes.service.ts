import { BadRequestException, Injectable } from '@nestjs/common';
import { AssetNodeType, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertSameOrg, orgScope, requireOrg } from '@/common';
import { TreeService } from './tree.service';
import { CreateAssetNodeDto, MoveAssetNodeDto, UpdateAssetNodeDto } from './dto';

/** Default type-code voor een lazily aangemaakte wortel-LOCATION-node. */
const DEFAULT_ROOT_TYPE_CODE = 'locatie';

/** Raw projectie van een AssetNode incl. de niet-Prisma-selecteerbare ltree `path`. */
interface RawNode {
  id: string;
  orgId: string;
  nodeType: AssetNodeType;
  parentId: string | null;
  rootLocationId: string | null;
  typeCode: string;
  name: string;
  identifier: string | null;
  description: string | null;
  technicalData: Prisma.JsonValue;
  statusCode: string;
  notes: string | null;
  sortOrder: number;
  path: string;
  depth: number;
  createdAt: Date;
  updatedAt: Date;
}

type TreeNode = RawNode & {
  children: TreeNode[];
  childCount: number;
  findingCount: number;
  inScope?: boolean;
};

const NODE_COLUMNS = Prisma.sql`
  id, org_id AS "orgId", node_type AS "nodeType", parent_id AS "parentId",
  root_location_id AS "rootLocationId", type_code AS "typeCode", name, identifier,
  description, technical_data AS "technicalData", status AS "statusCode", notes,
  sort_order AS "sortOrder", path::text AS path, depth,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class AssetNodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
  ) {}

  // ── Tree reads ────────────────────────────────────────────

  /** Hele boom voor een CRM-Locatie (maakt de wortel aan als die nog ontbreekt). */
  async getTreeForLocation(locationId: string, user: User): Promise<TreeNode[]> {
    const root = await this.ensureRootNode(locationId, user);
    return this.getSubtree(root.id, user);
  }

  /** Boom voor de hoofdlocatie van een inspectieplan, met scope-deellocaties gemarkeerd. */
  async getTreeForPlan(planId: string, user: User): Promise<TreeNode[]> {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, ...orgScope(user), deletedAt: null },
        select: {
          locationId: true,
          scopeLocations: { select: { assetNodeId: true } },
        },
      }),
      'Inspectieplan',
    );
    if (!plan.locationId) return [];

    const root = await this.ensureRootNode(plan.locationId, user);
    const tree = await this.getSubtree(root.id, user);

    const scopeIds = new Set(plan.scopeLocations.map((s) => s.assetNodeId));
    if (scopeIds.size) this.flagScope(tree, scopeIds);
    return tree;
  }

  async findById(id: string, user: User): Promise<TreeNode> {
    const node = assertFound(await this.getNodeRaw(id, orgScope(user).orgId ?? null), 'Node');
    const [enriched] = await this.enrich([node]);
    return { ...enriched, children: [], childCount: 0 };
  }

  // ── Writes ────────────────────────────────────────────────

  async create(user: User, dto: CreateAssetNodeDto, deviceId?: string) {
    const orgId = requireOrg(user);

    // Wortel-node aanmaken (geen parent) → moet een LOCATION met rootLocationId zijn.
    if (!dto.parentId) {
      this.tree.assertParentTypeAllowed(dto.nodeType, null);
      if (!dto.rootLocationId) {
        throw new BadRequestException('rootLocationId is verplicht voor een wortel-node');
      }
      await assertSameOrg(this.prisma.location, dto.rootLocationId, orgId, 'Locatie');
      return this.createRoot(orgId, dto.rootLocationId, user, {
        typeCode: dto.typeCode,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        technicalData: dto.technicalData,
        notes: dto.notes,
        deviceId,
      });
    }

    // Child-node onder een bestaande parent.
    if (dto.rootLocationId) {
      throw new BadRequestException('rootLocationId mag alleen op een wortel-node');
    }
    await assertSameOrg(this.prisma.assetNode, dto.parentId, orgId, 'Ouder-node');
    const parent = assertFound(await this.getNodeRaw(dto.parentId, orgId), 'Ouder-node');

    this.tree.assertParentTypeAllowed(dto.nodeType, parent.nodeType);
    await this.tree.validateTypeConstraint(
      { nodeType: dto.nodeType, typeCode: dto.typeCode },
      { nodeType: parent.nodeType, typeCode: parent.typeCode },
      user,
    );

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(parent.id));

    const created = await this.prisma.assetNode.create({
      data: {
        orgId,
        nodeType: dto.nodeType,
        parentId: parent.id,
        typeCode: dto.typeCode,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        technicalData: (dto.technicalData ?? {}) as Prisma.InputJsonValue,
        notes: dto.notes,
        sortOrder,
        createdBy: user.id,
        deviceId,
      },
      select: { id: true },
    });
    return this.findById(created.id, user);
  }

  async update(id: string, user: User, dto: UpdateAssetNodeDto) {
    const orgId = requireOrg(user);
    const node = assertFound(await this.getNodeRaw(id, orgId), 'Node');

    await this.prisma.assetNode.update({
      where: { id: node.id },
      data: {
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        statusCode: dto.statusCode,
        technicalData: dto.technicalData as Prisma.InputJsonValue | undefined,
        notes: dto.notes,
        sortOrder: dto.sortOrder,
      },
      select: { id: true },
    });
    return this.findById(node.id, user);
  }

  /**
   * Verplaatst een node naar een nieuwe parent binnen dezelfde boom. De raw
   * UPDATE van `parent_id` activeert de DB-triggers: de BEFORE-trigger herschrijft
   * het pad/diepte van de node zelf, de AFTER-trigger die van de hele subtree.
   * Pad/diepte worden dus NIET in de service berekend.
   */
  async move(id: string, user: User, dto: MoveAssetNodeDto) {
    const orgId = requireOrg(user);
    const node = assertFound(await this.getNodeRaw(id, orgId), 'Node');

    if (node.parentId === null) {
      throw new BadRequestException('De wortel-node kan niet verplaatst worden');
    }
    if (dto.newParentId === id) {
      throw new BadRequestException('Een node kan niet naar zichzelf verplaatst worden');
    }

    await assertSameOrg(this.prisma.assetNode, dto.newParentId, orgId, 'Nieuwe ouder-node');
    const newParent = assertFound(await this.getNodeRaw(dto.newParentId, orgId), 'Nieuwe ouder-node');

    if (!this.tree.sameTree(node.path, newParent.path)) {
      throw new BadRequestException('Een node kan niet naar een andere boom verplaatst worden');
    }
    if (this.tree.isSelfOrDescendant(newParent.path, node.path)) {
      throw new BadRequestException('Een node kan niet onder zijn eigen afstammeling geplaatst worden');
    }

    this.tree.assertParentTypeAllowed(node.nodeType, newParent.nodeType);
    await this.tree.validateTypeConstraint(
      { nodeType: node.nodeType, typeCode: node.typeCode },
      { nodeType: newParent.nodeType, typeCode: newParent.typeCode },
      user,
    );

    const sortOrder = dto.sortOrder ?? (await this.nextSortOrder(newParent.id));
    // Triggers onderhouden path + depth voor de node én alle afstammelingen.
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE imp_asset_nodes
      SET parent_id = ${dto.newParentId}::uuid, sort_order = ${sortOrder}
      WHERE id = ${id}::uuid
    `);
    return this.findById(id, user);
  }

  /** Soft-delete van de node + de hele subtree (tombstone voor sync) via `path <@`. */
  async delete(id: string, user: User) {
    const orgId = requireOrg(user);
    const node = assertFound(await this.getNodeRaw(id, orgId), 'Node');

    const orgFilter = orgId ? Prisma.sql`AND org_id = ${orgId}::uuid` : Prisma.empty;
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE imp_asset_nodes
      SET deleted_at = now()
      WHERE deleted_at IS NULL AND path <@ ${node.path}::ltree ${orgFilter}
    `);
    return { deleted: true, affected: count };
  }

  // ── ensureRootNode ────────────────────────────────────────

  /**
   * Maakt (idempotent) de wortel-LOCATION-node voor een CRM-Locatie aan. De race
   * wordt afgevangen door de `rootLocationId @unique`-constraint: bij een
   * gelijktijdige insert (P2002) lezen we de bestaande wortel terug.
   */
  async ensureRootNode(locationId: string, user: User): Promise<{ id: string }> {
    const orgId = requireOrg(user);
    const location = assertFound(
      await this.prisma.location.findFirst({
        where: { id: locationId, orgId },
        select: { id: true, name: true, locationTypeId: true },
      }),
      'Locatie',
    );

    const existing = await this.prisma.assetNode.findUnique({
      where: { rootLocationId: location.id },
      select: { id: true, deletedAt: true },
    });
    if (existing) {
      if (existing.deletedAt) {
        await this.prisma.assetNode.update({
          where: { id: existing.id },
          data: { deletedAt: null },
        });
      }
      return { id: existing.id };
    }

    let typeCode = DEFAULT_ROOT_TYPE_CODE;
    if (location.locationTypeId) {
      const lt = await this.prisma.locationTypeDefinition.findUnique({
        where: { id: location.locationTypeId },
        select: { code: true },
      });
      if (lt) typeCode = lt.code;
    }

    return this.createRoot(orgId, location.id, user, { typeCode, name: location.name });
  }

  // ── Helpers ───────────────────────────────────────────────

  private async createRoot(
    orgId: string,
    rootLocationId: string,
    user: User,
    data: {
      typeCode: string;
      name: string;
      identifier?: string;
      description?: string;
      technicalData?: Record<string, unknown>;
      notes?: string;
      deviceId?: string;
    },
  ): Promise<{ id: string }> {
    try {
      const node = await this.prisma.assetNode.create({
        data: {
          orgId,
          nodeType: AssetNodeType.LOCATION,
          parentId: null,
          rootLocationId,
          typeCode: data.typeCode,
          name: data.name,
          identifier: data.identifier,
          description: data.description,
          technicalData: (data.technicalData ?? {}) as Prisma.InputJsonValue,
          notes: data.notes,
          createdBy: user.id,
          deviceId: data.deviceId,
        },
        select: { id: true },
      });
      return node;
    } catch (e) {
      // Race: een gelijktijdige insert won de unique rootLocationId — lees terug.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const row = assertFound(
          await this.prisma.assetNode.findUnique({
            where: { rootLocationId },
            select: { id: true },
          }),
          'Boom-wortel',
        );
        return row;
      }
      throw e;
    }
  }

  private async getNodeRaw(id: string, orgId: string | null): Promise<RawNode | null> {
    const orgFilter = orgId ? Prisma.sql`AND org_id = ${orgId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<RawNode[]>(Prisma.sql`
      SELECT ${NODE_COLUMNS}
      FROM imp_asset_nodes
      WHERE id = ${id}::uuid AND deleted_at IS NULL ${orgFilter}
    `);
    return rows[0] ?? null;
  }

  /** Subtree (incl. wortel) als geneste boom, ltree-geordend op `path`. */
  private async getSubtree(rootId: string, user: User): Promise<TreeNode[]> {
    const orgId = orgScope(user).orgId ?? null;
    const root = await this.getNodeRaw(rootId, orgId);
    if (!root) return [];

    const orgFilter = orgId ? Prisma.sql`AND org_id = ${orgId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<RawNode[]>(Prisma.sql`
      SELECT ${NODE_COLUMNS}
      FROM imp_asset_nodes
      WHERE deleted_at IS NULL AND path <@ ${root.path}::ltree ${orgFilter}
      ORDER BY path
    `);

    const enriched = await this.enrich(rows);
    return this.buildHierarchy(enriched, root.parentId);
  }

  /** Voegt findingCount toe via één grouped query over de subtree-nodes. */
  private async enrich(rows: RawNode[]): Promise<Array<RawNode & { findingCount: number }>> {
    if (rows.length === 0) return [];
    const counts = await this.prisma.finding.groupBy({
      by: ['assetNodeId'],
      where: { assetNodeId: { in: rows.map((r) => r.id) }, deletedAt: null },
      _count: { _all: true },
    });
    const byNode = new Map(counts.map((c) => [c.assetNodeId, c._count._all]));
    return rows.map((r) => ({ ...r, findingCount: byNode.get(r.id) ?? 0 }));
  }

  private buildHierarchy(
    rows: Array<RawNode & { findingCount: number }>,
    parentId: string | null,
  ): TreeNode[] {
    return rows
      .filter((r) => r.parentId === parentId)
      .map((r) => {
        const children = this.buildHierarchy(rows, r.id);
        return { ...r, children, childCount: children.length };
      });
  }

  private flagScope(nodes: TreeNode[], scopeIds: Set<string>): void {
    for (const node of nodes) {
      node.inScope = scopeIds.has(node.id);
      this.flagScope(node.children, scopeIds);
    }
  }

  private async nextSortOrder(parentId: string): Promise<number> {
    const max = await this.prisma.assetNode.aggregate({
      where: { parentId, deletedAt: null },
      _max: { sortOrder: true },
    });
    return (max._max.sortOrder ?? 0) + 1;
  }
}
