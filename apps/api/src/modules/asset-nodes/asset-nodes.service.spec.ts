import { BadRequestException } from '@nestjs/common';
import { AssetNodeType, Prisma, User } from '@prisma/client';
import { AssetNodesService } from './asset-nodes.service';
import { TreeService } from './tree.service';
import { NumberingService } from '../numbering/numbering.service';

const user = { id: 'u1', orgId: 'org1', roles: ['ORG_ADMIN'] } as unknown as User;

// Raw node fixtures (paths use hyphen-stripped-UUID-like labels).
const ROOT = {
  id: 'root', orgId: 'org1', nodeType: AssetNodeType.LOCATION, parentId: null,
  rootLocationId: 'loc1', typeCode: 'gebouw', name: 'Root', identifier: null,
  description: null, technicalData: {}, statusCode: 'new', notes: null, sortOrder: 0,
  path: 'root', depth: 0, createdAt: new Date(), updatedAt: new Date(),
};
const LOC_A = { ...ROOT, id: 'locA', nodeType: AssetNodeType.LOCATION, parentId: 'root', rootLocationId: null, typeCode: 'ruimte', path: 'root.locA', depth: 1 };
const LOC_B = { ...ROOT, id: 'locB', nodeType: AssetNodeType.LOCATION, parentId: 'root', rootLocationId: null, typeCode: 'ruimte', path: 'root.locB', depth: 1 };
const ASSET_X = { ...ROOT, id: 'assetX', nodeType: AssetNodeType.ASSET, parentId: 'locA', rootLocationId: null, typeCode: 'verdeler', path: 'root.locA.assetX', depth: 2 };
const ASSET_Y = { ...ROOT, id: 'assetY', nodeType: AssetNodeType.ASSET, parentId: 'locA', rootLocationId: null, typeCode: 'verdeler', path: 'root.locA.assetY', depth: 2 };
const ASSET_CHILD = { ...ROOT, id: 'assetChild', nodeType: AssetNodeType.ASSET, parentId: 'assetX', rootLocationId: null, typeCode: 'groep', path: 'root.locA.assetX.assetChild', depth: 3 };
const OTHER_TREE = { ...ROOT, id: 'other', nodeType: AssetNodeType.LOCATION, parentId: null, rootLocationId: 'loc2', path: 'other', depth: 0 };

describe('AssetNodesService', () => {
  let service: AssetNodesService;
  let prisma: any;
  let tree: TreeService;
  let numbering: NumberingService;
  let nodes: Record<string, any>;

  beforeEach(() => {
    nodes = { root: ROOT, locA: LOC_A, locB: LOC_B, assetX: ASSET_X, assetY: ASSET_Y, assetChild: ASSET_CHILD, other: OTHER_TREE };
    prisma = {
      assetNode: {
        findUnique: jest.fn().mockResolvedValue({ orgId: 'org1' }), // assertSameOrg
        aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
        create: jest.fn(),
        update: jest.fn(),
      },
      location: { findFirst: jest.fn() },
      locationTypeDefinition: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      assetTypeDefinition: { findMany: jest.fn().mockResolvedValue([]) },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    tree = new TreeService(
      { validateParentConstraint: jest.fn().mockResolvedValue({ valid: true }) } as never,
      { validateParentConstraint: jest.fn().mockResolvedValue({ valid: true }) } as never,
    );
    // Fake numbering engine: voert de create-callback uit met een vast/handmatig
    // nummer en geeft `prisma` als tx-client door (waar assetNode.create gemockt is).
    numbering = {
      runWithGeneratedNumber: jest.fn(
        async (_model: unknown, _org: unknown, opts: any, create: any) =>
          create(prisma, opts.manual ?? 'NUM-0001'),
      ),
    } as unknown as NumberingService;
    service = new AssetNodesService(prisma, tree, numbering);

    // getNodeRaw is the single raw read used by move/create/update; stub it from fixtures.
    jest.spyOn(service as any, 'getNodeRaw').mockImplementation(async (...args: unknown[]) => nodes[args[0] as string] ?? null);
    // findById is the response shaper; stub it so move tests stay focused on logic.
    jest.spyOn(service, 'findById').mockImplementation(async (...args: unknown[]) => ({ id: args[0] as string }) as never);
  });

  describe('move', () => {
    it('moves an asset under a new same-tree parent and rewrites via the parent_id UPDATE', async () => {
      // assetChild (under assetX) → move under assetY (sibling subtree, same tree)
      await service.move('assetChild', user, { newParentId: 'assetY' });

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      const sql: Prisma.Sql = prisma.$executeRaw.mock.calls[0][0];
      // The raw UPDATE sets parent_id (triggering the DB path/depth rewrite for the whole subtree).
      expect(sql.values).toContain('assetY'); // new parent
      expect(sql.values).toContain('assetChild'); // moved node
    });

    it('uses the next sort order under the new parent when none is given', async () => {
      await service.move('assetChild', user, { newParentId: 'assetY' });
      const sql: Prisma.Sql = prisma.$executeRaw.mock.calls[0][0];
      expect(sql.values).toContain(5); // aggregate max 4 + 1
    });

    it('rejects moving the root node', async () => {
      await expect(service.move('root', user, { newParentId: 'locA' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects moving a node onto itself', async () => {
      await expect(service.move('assetX', user, { newParentId: 'assetX' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects moving a node into its own descendant', async () => {
      // assetX → under assetChild (which is assetX's own descendant)
      await expect(service.move('assetX', user, { newParentId: 'assetChild' })).rejects.toThrow(
        /afstammeling/,
      );
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('rejects moving a node into a different tree', async () => {
      await expect(service.move('assetX', user, { newParentId: 'other' })).rejects.toThrow(
        /andere boom/,
      );
    });

    it('enforces the LOCATION-under-LOCATION invariant', async () => {
      // locB (LOCATION, sibling of locA) → under assetX (ASSET) is invalid (invariant 3)
      await expect(service.move('locB', user, { newParentId: 'assetX' })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('enforces the asset→asset type constraint', async () => {
      (tree.validateTypeConstraint as unknown) = jest
        .fn()
        .mockRejectedValue(new BadRequestException('ongeldig'));
      await expect(service.move('assetChild', user, { newParentId: 'assetY' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('ensureRootNode', () => {
    beforeEach(() => {
      prisma.location.findFirst.mockResolvedValue({ id: 'loc1', name: 'Hoofdkantoor', locationTypeId: null });
    });

    it('creates the root LOCATION node when none exists', async () => {
      prisma.assetNode.findUnique.mockResolvedValueOnce(null); // existing-root check
      prisma.assetNode.create.mockResolvedValue({ id: 'newRoot' });

      const res = await service.ensureRootNode('loc1', user);

      expect(res).toEqual({ id: 'newRoot' });
      expect(prisma.assetNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            nodeType: AssetNodeType.LOCATION,
            parentId: null,
            rootLocationId: 'loc1',
          }),
        }),
      );
    });

    it('returns the existing root without creating a new one', async () => {
      prisma.assetNode.findUnique.mockResolvedValueOnce({ id: 'root', deletedAt: null });
      const res = await service.ensureRootNode('loc1', user);
      expect(res).toEqual({ id: 'root' });
      expect(prisma.assetNode.create).not.toHaveBeenCalled();
    });

    it('revives a soft-deleted root', async () => {
      prisma.assetNode.findUnique.mockResolvedValueOnce({ id: 'root', deletedAt: new Date() });
      prisma.assetNode.update.mockResolvedValue({ id: 'root' });
      const res = await service.ensureRootNode('loc1', user);
      expect(res).toEqual({ id: 'root' });
      expect(prisma.assetNode.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { deletedAt: null } }),
      );
    });

    it('recovers from a concurrent insert (P2002) by reading the winner', async () => {
      prisma.assetNode.findUnique
        .mockResolvedValueOnce(null) // existing-root check
        .mockResolvedValueOnce({ id: 'raceWinner' }); // catch-block re-read
      prisma.assetNode.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('dup', {
          code: 'P2002',
          clientVersion: '5.22.0',
        }),
      );

      const res = await service.ensureRootNode('loc1', user);
      expect(res).toEqual({ id: 'raceWinner' });
    });
  });

  describe('create — server-assigned nodeNumber', () => {
    it('numbers an ASSET child via the ASSET_NODE scheme and stores nodeNumber', async () => {
      prisma.assetNode.create.mockResolvedValue({ id: 'newAsset' });

      await service.create(user, {
        parentId: 'locA',
        nodeType: AssetNodeType.ASSET,
        typeCode: 'verdeler',
        name: 'Hoofdverdeler',
      });

      expect(numbering.runWithGeneratedNumber).toHaveBeenCalledWith(
        'ASSET_NODE',
        'org1',
        expect.any(Object),
        expect.any(Function),
      );
      expect(prisma.assetNode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ nodeNumber: 'NUM-0001', typeCode: 'verdeler' }),
        }),
      );
    });

    it('honours a manual nodeNumber when supplied', async () => {
      prisma.assetNode.create.mockResolvedValue({ id: 'newAsset' });

      await service.create(user, {
        parentId: 'locA',
        nodeType: AssetNodeType.ASSET,
        typeCode: 'verdeler',
        name: 'Hoofdverdeler',
        nodeNumber: 'EIGEN-1',
      });

      expect(prisma.assetNode.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ nodeNumber: 'EIGEN-1' }) }),
      );
    });
  });
});
