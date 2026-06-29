import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AssetNodeType, Role } from '@prisma/client';
import { InspectionLocationsService } from './inspection-locations.service';
import { PrismaService } from '@/prisma';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

// COMPAT-WRAPPER spec (Fase 2b): InspectionLocationsService maps the old
// `inspection-plans/:planId/locations` API onto the unified AssetNode tree
// (nodeType = LOCATION) by delegating writes to AssetNodesService and mapping
// reads from `prisma.assetNode` back to the old shape (typeCode → locationType,
// parentId → parentLocationId).

describe('InspectionLocationsService', () => {
  let service: InspectionLocationsService;

  const mockPrismaService = {
    assetNode: {
      findFirst: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
    inspectionPlan: {
      findFirst: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAssetNodes = {
    create: jest.fn(),
    update: jest.fn(),
    move: jest.fn(),
    delete: jest.fn(),
    ensureRootNode: jest.fn(),
    listPlanNodes: jest.fn(),
  };

  /** Build a raw AssetNode (the shape the wrapper maps from). */
  const makeNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'n1',
    parentId: null,
    typeCode: 'gebouw',
    name: 'G1',
    identifier: null,
    description: null,
    sortOrder: 0,
    technicalData: {},
    notes: null,
    nodeType: AssetNodeType.LOCATION,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InspectionLocationsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AssetNodesService, useValue: mockAssetNodes },
      ],
    }).compile();

    service = module.get<InspectionLocationsService>(InspectionLocationsService);
  });

  describe('findById', () => {
    it('should map a found LOCATION node back to the old location shape', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(
        makeNode({
          id: 'loc-1',
          parentId: 'parent-1',
          typeCode: 'gebouw',
          parent: { id: 'parent-1', name: 'Terrein', typeCode: 'terrein' },
          children: [
            makeNode({ id: 'child-loc', nodeType: AssetNodeType.LOCATION, typeCode: 'ruimte' }),
            makeNode({ id: 'child-asset', nodeType: AssetNodeType.ASSET, typeCode: 'container' }),
          ],
        }),
      );

      const result = await service.findById('loc-1', mockUser);

      expect(result.id).toBe('loc-1');
      expect(result.locationType).toBe('gebouw');
      expect(result.parentLocationId).toBe('parent-1');
      expect(result.parentLocation).toEqual({
        id: 'parent-1',
        name: 'Terrein',
        locationType: 'terrein',
      });
      expect(result.childLocations).toEqual([
        expect.objectContaining({ id: 'child-loc', locationType: 'ruimte' }),
      ]);
      expect(result.assets).toEqual([
        expect.objectContaining({ id: 'child-asset', locationType: 'container' }),
      ]);
      expect(mockPrismaService.assetNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'loc-1',
            orgId: 'org-1',
            nodeType: AssetNodeType.LOCATION,
            deletedAt: null,
          }),
        }),
      );
    });

    it('should throw NL NotFoundException when scoped out', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.findById('loc-x', mockUser)).rejects.toThrow(NotFoundException);
      await expect(service.findById('loc-x', mockUser)).rejects.toThrow('Locatie niet gevonden');
    });
  });

  describe('getCountByPlan', () => {
    it('should return the count of LOCATION nodes for a plan', async () => {
      mockAssetNodes.listPlanNodes.mockResolvedValue([
        makeNode({ id: 'loc-1' }),
        makeNode({ id: 'loc-2' }),
      ]);

      const result = await service.getCountByPlan('plan-1', mockUser);

      expect(result).toEqual({ count: 2 });
      expect(mockAssetNodes.listPlanNodes).toHaveBeenCalledWith(
        'plan-1',
        mockUser,
        AssetNodeType.LOCATION,
      );
    });
  });

  describe('findAllByPlan', () => {
    it('should list plan LOCATION nodes (flat) with counts mapped to old shape', async () => {
      mockAssetNodes.listPlanNodes.mockResolvedValue([
        makeNode({ id: 'loc-1', parentId: null }),
        makeNode({ id: 'loc-2', parentId: 'loc-1', typeCode: 'ruimte' }),
      ]);
      mockPrismaService.assetNode.groupBy.mockResolvedValue([
        { parentId: 'loc-1', _count: { _all: 4 } },
      ]);

      const result = (await service.findAllByPlan('plan-1', mockUser, { flat: true })) as any[];

      expect(mockAssetNodes.listPlanNodes).toHaveBeenCalledWith(
        'plan-1',
        mockUser,
        AssetNodeType.LOCATION,
      );
      const l1 = result.find((l) => l.id === 'loc-1');
      expect(l1.locationType).toBe('gebouw');
      expect(l1.childCount).toBe(1);
      expect(l1.assetCount).toBe(4);
      const l2 = result.find((l) => l.id === 'loc-2');
      expect(l2.parentLocationId).toBe('loc-1');
    });
  });

  describe('create', () => {
    it('should ensure the plan root node and delegate with mapped fields', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        locationId: 'crm-loc-1',
      });
      mockAssetNodes.ensureRootNode.mockResolvedValue({ id: 'root-1' });
      mockAssetNodes.create.mockResolvedValue(makeNode({ id: 'loc-new', typeCode: 'gebouw' }));

      const result = await service.create(
        'plan-1',
        mockUser,
        { locationType: 'gebouw', name: 'G1', description: 'hoofdgebouw' } as any,
        'device-9',
      );

      expect(result.id).toBe('loc-new');
      expect(result.locationType).toBe('gebouw');
      expect(mockAssetNodes.ensureRootNode).toHaveBeenCalledWith('crm-loc-1', mockUser);
      expect(mockAssetNodes.create).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          parentId: 'root-1',
          nodeType: AssetNodeType.LOCATION,
          typeCode: 'gebouw',
          name: 'G1',
          description: 'hoofdgebouw',
        }),
        'device-9',
      );
    });

    it('should use the explicit parentLocationId without ensuring a root', async () => {
      mockAssetNodes.create.mockResolvedValue(makeNode({ id: 'loc-new' }));

      await service.create(
        'plan-1',
        mockUser,
        { locationType: 'ruimte', name: 'R1', parentLocationId: 'parent-1' } as any,
      );

      expect(mockAssetNodes.ensureRootNode).not.toHaveBeenCalled();
      expect(mockAssetNodes.create).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ parentId: 'parent-1' }),
        undefined,
      );
    });

    it('should throw BadRequest when the plan has no main location', async () => {
      mockPrismaService.inspectionPlan.findFirst.mockResolvedValue({
        id: 'plan-1',
        locationId: null,
      });

      await expect(
        service.create('plan-1', mockUser, { locationType: 'gebouw', name: 'G1' } as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockAssetNodes.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should assert the location node and delegate mapped fields', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'loc-1' });
      mockAssetNodes.update.mockResolvedValue(makeNode({ id: 'loc-1', name: 'Nieuw' }));

      const result = await service.update('loc-1', mockUser, {
        name: 'Nieuw',
        description: 'aangepast',
      } as any);

      expect(result.id).toBe('loc-1');
      expect(mockAssetNodes.update).toHaveBeenCalledWith(
        'loc-1',
        mockUser,
        expect.objectContaining({ name: 'Nieuw', description: 'aangepast' }),
      );
    });

    it('should throw NotFound when the location node is out of scope', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(
        service.update('loc-x', mockUser, { name: 'X' } as any),
      ).rejects.toThrow('Locatie niet gevonden');
      expect(mockAssetNodes.update).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('should reject a move without a new parent', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'loc-1' });

      await expect(service.move('loc-1', mockUser, {} as any)).rejects.toThrow(BadRequestException);
      expect(mockAssetNodes.move).not.toHaveBeenCalled();
    });

    it('should delegate the move and map the result', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'loc-1' });
      mockAssetNodes.move.mockResolvedValue(
        makeNode({ id: 'loc-1', parentId: 'loc-2', sortOrder: 0 }),
      );

      const result = await service.move('loc-1', mockUser, {
        newParentId: 'loc-2',
        sortOrder: 0,
      } as any);

      expect(result.parentLocationId).toBe('loc-2');
      expect(mockAssetNodes.move).toHaveBeenCalledWith('loc-1', mockUser, {
        newParentId: 'loc-2',
        sortOrder: 0,
      });
    });
  });

  describe('reorder', () => {
    it('should reorder locations via a scoped transaction', async () => {
      mockAssetNodes.listPlanNodes.mockResolvedValue([]);
      mockPrismaService.assetNode.update.mockImplementation((args: unknown) => args);
      mockPrismaService.$transaction.mockResolvedValue([]);

      const result = await service.reorder('plan-1', mockUser, {
        locationIds: ['loc-2', 'loc-1'],
      } as any);

      expect(result).toEqual({ reordered: true });
      expect(mockAssetNodes.listPlanNodes).toHaveBeenCalledWith(
        'plan-1',
        mockUser,
        AssetNodeType.LOCATION,
      );
      expect(mockPrismaService.assetNode.update).toHaveBeenCalledWith({
        where: { id: 'loc-2' },
        data: { sortOrder: 0 },
      });
      expect(mockPrismaService.assetNode.update).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('delete', () => {
    it('should assert the node and delegate the subtree delete', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'loc-1' });
      mockAssetNodes.delete.mockResolvedValue(undefined);

      const result = await service.delete('loc-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockAssetNodes.delete).toHaveBeenCalledWith('loc-1', mockUser);
    });

    it('should throw NotFound when the location node is out of scope', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.delete('loc-x', mockUser)).rejects.toThrow('Locatie niet gevonden');
      expect(mockAssetNodes.delete).not.toHaveBeenCalled();
    });
  });
});
