import { BadRequestException, Injectable } from '@nestjs/common';
import { AssetNodeType, NumberingModel, Prisma, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound, assertSameOrg, orgScope, requireOrg } from '@/common';
import { NumberingService } from '../numbering/numbering.service';
import { TreeService } from './tree.service';
import { CreateAssetNodeDto, MoveAssetNodeDto, UpdateAssetNodeDto } from './dto';

/** Default type-code voor een lazily aangemaakte wortel-LOCATION-node. */
const DEFAULT_ROOT_TYPE_CODE = 'locatie';

/** Raw projectie van een AssetNode incl. de niet-Prisma-selecteerbare ltree `path`. */
export interface AssetNodeRow {
  id: string;
  orgId: string;
  nodeType: AssetNodeType;
  parentId: string | null;
  rootLocationId: string | null;
  typeCode: string;
  nodeNumber: string | null;
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

/** @deprecated interne alias — gebruik {@link AssetNodeRow}. */
type RawNode = AssetNodeRow;

type TreeNode = RawNode & {
  children: TreeNode[];
  childCount: number;
  findingCount: number;
  inScope?: boolean;
};

const NODE_COLUMNS = Prisma.sql`
  id, org_id AS "orgId", node_type AS "nodeType", parent_id AS "parentId",
  root_location_id AS "rootLocationId", type_code AS "typeCode", node_number AS "nodeNumber", name, identifier,
  description, technical_data AS "technicalData", status AS "statusCode", notes,
  sort_order AS "sortOrder", path::text AS path, depth,
  created_at AS "createdAt", updated_at AS "updatedAt"
`;

@Injectable()
export class AssetNodesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: TreeService,
    private readonly numbering: NumberingService,
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
      const root = await this.createRoot(orgId, dto.rootLocationId, user, {
        typeCode: dto.typeCode,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        technicalData: dto.technicalData,
        notes: dto.notes,
        deviceId,
        manual: dto.nodeNumber,
      });
      return this.findById(root.id, user);
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

    // Server-toegekend, uniek-per-org nodenummer (LOCATION_NODE/ASSET_NODE-schema).
    // De ltree path/depth-triggers draaien BEFORE INSERT binnen deze tx; pad/diepte
    // worden dus niet in de service gezet.
    const created = await this.numbering.runWithGeneratedNumber(
      this.numberingModelFor(dto.nodeType),
      orgId,
      {
        manual: dto.nodeNumber,
        loadContext: async () => ({
          typeShortCode: await this.resolveTypeShortCode(orgId, dto.nodeType, dto.typeCode),
        }),
      },
      (tx, nodeNumber) =>
        tx.assetNode.create({
          data: {
            orgId,
            nodeType: dto.nodeType,
            parentId: parent.id,
            typeCode: dto.typeCode,
            nodeNumber,
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
        }),
    );
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

  // ── Plan- & scope-helpers (Fase 2b) ───────────────────────

  /**
   * `rootLocationId` van de boom-wortel waaronder deze node hangt. De wortel is
   * het eerste ltree-label van het pad (`subpath(path, 0, 1)`); diens
   * `root_location_id` is de CRM-hoofdlocatie van de hele boom. `null` als de
   * node niet bestaat (binnen de org-scope).
   */
  async getTreeRootLocationId(
    assetNodeId: string,
    orgId: string | null,
  ): Promise<string | null> {
    const orgFilter = orgId ? Prisma.sql`AND child.org_id = ${orgId}::uuid` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ rootLocationId: string | null }[]>(Prisma.sql`
      SELECT root.root_location_id AS "rootLocationId"
      FROM imp_asset_nodes child
      JOIN imp_asset_nodes root ON root.path = subpath(child.path, 0, 1)
      WHERE child.id = ${assetNodeId}::uuid AND child.deleted_at IS NULL ${orgFilter}
    `);
    return rows[0]?.rootLocationId ?? null;
  }

  /**
   * Valideert dat `assetNodeId` bestaat (zelfde org) en in de boom van het plan
   * zit: de boom-wortel moet `rootLocationId === plan.locationId` hebben. Gooit
   * NotFound (onbekende node / cross-tenant) of BadRequest (verkeerde boom / plan
   * zonder hoofdlocatie). Wordt gebruikt vóór het schrijven van een uitvoerings-
   * record (finding/visual/measurement/sheet).
   */
  async assertNodeInPlanTree(
    assetNodeId: string,
    plan: { id: string; locationId: string | null; orgId: string },
  ): Promise<AssetNodeRow> {
    if (!plan.locationId) {
      throw new BadRequestException('Het inspectieplan heeft geen hoofdlocatie (locationId)');
    }
    const node = assertFound(await this.getNodeRaw(assetNodeId, plan.orgId), 'Asset-node');
    const rootLocationId = await this.getTreeRootLocationId(assetNodeId, plan.orgId);
    if (rootLocationId !== plan.locationId) {
      throw new BadRequestException(
        'De asset-node hoort niet bij de hoofdlocatie van dit inspectieplan',
      );
    }
    return node;
  }

  /**
   * Valideert een scope-deellocatie: node bestaat (zelfde org), is een LOCATION
   * en zit in de boom van `planLocationId`.
   */
  async assertValidScopeLocation(
    assetNodeId: string,
    planLocationId: string,
    orgId: string,
  ): Promise<void> {
    const node = assertFound(await this.getNodeRaw(assetNodeId, orgId), 'Scope-locatie');
    if (node.nodeType !== AssetNodeType.LOCATION) {
      throw new BadRequestException('Een scope-locatie moet een LOCATION-node zijn');
    }
    const rootLocationId = await this.getTreeRootLocationId(assetNodeId, orgId);
    if (rootLocationId !== planLocationId) {
      throw new BadRequestException(
        'De scope-locatie hoort niet bij de hoofdlocatie van dit inspectieplan',
      );
    }
  }

  /**
   * Default-parent voor een node die "vanuit een inspectie" wordt aangemaakt: de
   * enige scope-deellocatie als er precies één is, anders de wortel-LOCATION-node
   * van de boom. De wortel wordt zo nodig lazily aangemaakt (ensureRootNode).
   */
  async resolveDefaultParentForPlan(planId: string, user: User): Promise<string> {
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
    if (!plan.locationId) {
      throw new BadRequestException('Het inspectieplan heeft geen hoofdlocatie (locationId)');
    }
    if (plan.scopeLocations.length === 1) {
      return plan.scopeLocations[0].assetNodeId;
    }
    const root = await this.ensureRootNode(plan.locationId, user);
    return root.id;
  }

  /** Platte lijst van nodes in de boom van een CRM-Locatie (optioneel op nodeType). */
  async listLocationNodes(
    locationId: string,
    user: User,
    nodeType?: AssetNodeType,
  ): Promise<AssetNodeRow[]> {
    const root = await this.ensureRootNode(locationId, user);
    return this.listSubtree(root.id, orgScope(user).orgId ?? null, nodeType);
  }

  /**
   * Read-only variant van {@link listLocationNodes} op basis van orgId i.p.v. een
   * `User` (voor doc-generatie/achtergrondtaken): maakt GEEN wortel aan. Geeft een
   * lege lijst als de boom nog niet bestaat.
   */
  async listLocationNodesByOrg(
    locationId: string,
    orgId: string | null,
    nodeType?: AssetNodeType,
  ): Promise<AssetNodeRow[]> {
    const root = await this.prisma.assetNode.findUnique({
      where: { rootLocationId: locationId },
      select: { id: true },
    });
    if (!root) return [];
    return this.listSubtree(root.id, orgId, nodeType);
  }

  /** Platte lijst van nodes in de boom van een plan (via `plan.locationId`). */
  async listPlanNodes(
    planId: string,
    user: User,
    nodeType?: AssetNodeType,
  ): Promise<AssetNodeRow[]> {
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, ...orgScope(user), deletedAt: null },
        select: { locationId: true },
      }),
      'Inspectieplan',
    );
    if (!plan.locationId) return [];
    return this.listLocationNodes(plan.locationId, user, nodeType);
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
      manual?: string;
    },
  ): Promise<{ id: string }> {
    try {
      // De wortel is altijd een LOCATION → LOCATION_NODE-schema. nodeNumber wordt
      // server-toegekend (uniek-per-org); de ltree-triggers draaien BEFORE INSERT.
      return await this.numbering.runWithGeneratedNumber(
        NumberingModel.LOCATION_NODE,
        orgId,
        {
          manual: data.manual,
          loadContext: async () => ({
            typeShortCode: await this.resolveTypeShortCode(
              orgId,
              AssetNodeType.LOCATION,
              data.typeCode,
            ),
          }),
        },
        (tx, nodeNumber) =>
          tx.assetNode.create({
            data: {
              orgId,
              nodeType: AssetNodeType.LOCATION,
              parentId: null,
              rootLocationId,
              typeCode: data.typeCode,
              nodeNumber,
              name: data.name,
              identifier: data.identifier,
              description: data.description,
              technicalData: (data.technicalData ?? {}) as Prisma.InputJsonValue,
              notes: data.notes,
              createdBy: user.id,
              deviceId: data.deviceId,
            },
            select: { id: true },
          }),
      );
    } catch (e) {
      // Race: een gelijktijdige insert won de unique rootLocationId (de numbering-
      // retry kan zo'n P2002 in een ConflictException veranderd hebben). Lees de
      // bestaande wortel terug als die nu bestaat; anders propageren we de fout.
      const existing = await this.prisma.assetNode.findUnique({
        where: { rootLocationId },
        select: { id: true },
      });
      if (existing) return existing;
      throw e;
    }
  }

  /** NumberingModel dat bij een nodeType hoort. */
  private numberingModelFor(nodeType: AssetNodeType): NumberingModel {
    return nodeType === AssetNodeType.LOCATION
      ? NumberingModel.LOCATION_NODE
      : NumberingModel.ASSET_NODE;
  }

  /**
   * Shortcode (`[typecode]`) van het type-def dat bij `typeCode` hoort: een
   * org-specifieke definitie heeft voorrang op een systeem-/globale (orgId null).
   * `null` als er geen match of geen shortcode is (de placeholder valt dan veilig
   * terug op een lege string).
   */
  private async resolveTypeShortCode(
    orgId: string,
    nodeType: AssetNodeType,
    typeCode: string,
  ): Promise<string | null> {
    if (nodeType === AssetNodeType.ASSET) {
      const defs = await this.prisma.assetTypeDefinition.findMany({
        where: { code: typeCode, OR: [{ orgId }, { orgId: null }], deletedAt: null },
        select: { orgId: true, shortCode: true },
      });
      const match = defs.find((d) => d.orgId === orgId) ?? defs[0];
      return match?.shortCode ?? null;
    }
    const defs = await this.prisma.locationTypeDefinition.findMany({
      where: { code: typeCode, OR: [{ orgId }, { orgId: null }], deletedAt: null },
      select: { orgId: true, shortCode: true },
    });
    const match = defs.find((d) => d.orgId === orgId) ?? defs[0];
    return match?.shortCode ?? null;
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

  /** Platte, op `path` geordende subtree-lijst (incl. wortel), optioneel op nodeType. */
  private async listSubtree(
    rootId: string,
    orgId: string | null,
    nodeType?: AssetNodeType,
  ): Promise<AssetNodeRow[]> {
    const root = await this.getNodeRaw(rootId, orgId);
    if (!root) return [];
    const orgFilter = orgId ? Prisma.sql`AND org_id = ${orgId}::uuid` : Prisma.empty;
    const typeFilter = nodeType
      ? Prisma.sql`AND node_type = ${nodeType}::"AssetNodeType"`
      : Prisma.empty;
    return this.prisma.$queryRaw<AssetNodeRow[]>(Prisma.sql`
      SELECT ${NODE_COLUMNS}
      FROM imp_asset_nodes
      WHERE deleted_at IS NULL AND path <@ ${root.path}::ltree ${typeFilter} ${orgFilter}
      ORDER BY path
    `);
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
    // Bucket per parentId in één pass (O(n)) i.p.v. een filter per node (O(n²)).
    // De inkomende `rows` zijn al ORDER BY path gesorteerd, dus de push-volgorde
    // binnen elke bucket blijft correct.
    const byParent = new Map<string | null, Array<RawNode & { findingCount: number }>>();
    for (const r of rows) {
      const bucket = byParent.get(r.parentId);
      if (bucket) bucket.push(r);
      else byParent.set(r.parentId, [r]);
    }
    const build = (pid: string | null): TreeNode[] =>
      (byParent.get(pid) ?? []).map((r) => {
        const children = build(r.id);
        return { ...r, children, childCount: children.length };
      });
    return build(parentId);
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
