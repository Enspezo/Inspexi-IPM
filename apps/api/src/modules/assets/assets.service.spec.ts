import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AssetNodeType, Role } from '@prisma/client';
import { AssetsService } from './assets.service';
import { PrismaService } from '@/prisma';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';

// COMPAT-WRAPPER spec (Fase 2b): AssetsService maps the old `assets` API onto the
// unified AssetNode tree (nodeType = ASSET) by delegating writes to
// AssetNodesService and mapping reads from `prisma.assetNode` back to the old
// shape (typeCode → assetType, parentId → parentAssetId, description →
// locationDescription).

describe('AssetsService', () => {
  let service: AssetsService;

  const mockPrismaService = {
    assetNode: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      update: jest.fn(),
    },
    inspectionPlan: {
      findFirst: jest.fn(),
    },
    finding: {
      groupBy: jest.fn(),
    },
    visualInspection: {
      findMany: jest.fn(),
    },
    measurementRecord: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockAssetNodes = {
    create: jest.fn(),
    update: jest.fn(),
    move: jest.fn(),
    delete: jest.fn(),
    resolveDefaultParentForPlan: jest.fn(),
    listPlanNodes: jest.fn(),
  };

  /** Build a raw AssetNode (the shape the wrapper maps from). */
  const makeNode = (overrides: Record<string, unknown> = {}) => ({
    id: 'n1',
    parentId: null,
    typeCode: 'verdeler',
    name: 'X',
    identifier: null,
    description: null,
    sortOrder: 0,
    statusCode: 'new',
    technicalData: {},
    notes: null,
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
        AssetsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AssetNodesService, useValue: mockAssetNodes },
      ],
    }).compile();

    service = module.get<AssetsService>(AssetsService);
  });

  describe('findById', () => {
    it('should map a found ASSET node back to the old asset shape', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(
        makeNode({
          id: 'asset-1',
          parentId: 'parent-1',
          typeCode: 'container',
          description: 'achterin',
          visualInspections: [{ id: 'vi-1' }],
          measurementRecords: [{ id: 'mr-1' }],
          findings: [{ id: 'f-1' }],
          children: [makeNode({ id: 'child-1', parentId: 'asset-1' })],
        }),
      );

      const result = await service.findById('asset-1', mockUser);

      // Mapped to old shape.
      expect(result.id).toBe('asset-1');
      expect(result.assetType).toBe('container');
      expect(result.parentAssetId).toBe('parent-1');
      expect(result.locationDescription).toBe('achterin');
      expect(result.childAssets).toEqual([
        expect.objectContaining({ id: 'child-1', parentAssetId: 'asset-1' }),
      ]);
      // Scoped to ASSET nodes.
      expect(mockPrismaService.assetNode.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'asset-1',
            orgId: 'org-1',
            nodeType: AssetNodeType.ASSET,
            deletedAt: null,
          }),
        }),
      );
    });

    it('should throw NL NotFoundException when scoped out', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.findById('asset-x', mockUser)).rejects.toThrow(NotFoundException);
      await expect(service.findById('asset-x', mockUser)).rejects.toThrow('Asset niet gevonden');
    });
  });

  describe('findAllForOrganization', () => {
    it('should query ASSET nodes org-wide and map rows to the old shape', async () => {
      mockPrismaService.assetNode.findMany.mockResolvedValue([
        makeNode({ id: 'asset-1', typeCode: 'container', _count: { findings: 1 } }),
      ]);
      mockPrismaService.assetNode.count.mockResolvedValue(1);

      const result = await service.findAllForOrganization(mockUser, {} as any);

      expect(result.total).toBe(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'asset-1', assetType: 'container', _count: { findings: 1 } }),
      );
      expect(mockPrismaService.assetNode.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            nodeType: AssetNodeType.ASSET,
            deletedAt: null,
          }),
        }),
      );
    });
  });

  describe('findAllByPlan', () => {
    it('should list plan ASSET nodes (flat) with enriched counts mapped to old shape', async () => {
      mockAssetNodes.listPlanNodes.mockResolvedValue([
        makeNode({ id: 'asset-1', parentId: null, typeCode: 'container' }),
        makeNode({ id: 'asset-2', parentId: 'asset-1', typeCode: 'cabinet' }),
      ]);
      mockPrismaService.finding.groupBy.mockResolvedValue([
        { assetNodeId: 'asset-1', _count: { _all: 3 } },
      ]);
      mockPrismaService.visualInspection.findMany.mockResolvedValue([
        { assetNodeId: 'asset-1', status: 'done' },
      ]);
      mockPrismaService.measurementRecord.findMany.mockResolvedValue([
        { assetNodeId: 'asset-2', status: 'in_progress' },
      ]);

      const result = (await service.findAllByPlan('plan-1', mockUser, { flat: true })) as any[];

      expect(mockAssetNodes.listPlanNodes).toHaveBeenCalledWith(
        'plan-1',
        mockUser,
        AssetNodeType.ASSET,
      );
      const a1 = result.find((a) => a.id === 'asset-1');
      expect(a1.assetType).toBe('container');
      expect(a1.findingCount).toBe(3);
      expect(a1.visualInspectionStatus).toBe('done');
      const a2 = result.find((a) => a.id === 'asset-2');
      expect(a2.parentAssetId).toBe('asset-1');
      expect(a2.measurementStatus).toBe('in_progress');
    });
  });

  describe('create', () => {
    it('should resolve the default parent and delegate with mapped fields', async () => {
      mockAssetNodes.resolveDefaultParentForPlan.mockResolvedValue('root-1');
      mockAssetNodes.create.mockResolvedValue(makeNode({ id: 'asset-new', typeCode: 'container' }));

      const result = await service.create(
        'plan-1',
        mockUser,
        { assetType: 'container', name: 'C1', locationDescription: 'achterin' } as any,
        'device-9',
      );

      expect(result.id).toBe('asset-new');
      expect(result.assetType).toBe('container');
      expect(mockAssetNodes.resolveDefaultParentForPlan).toHaveBeenCalledWith('plan-1', mockUser);
      expect(mockAssetNodes.create).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({
          parentId: 'root-1',
          nodeType: AssetNodeType.ASSET,
          typeCode: 'container',
          name: 'C1',
          description: 'achterin',
        }),
        'device-9',
      );
    });

    it('should use the explicit parentAssetId without resolving a default', async () => {
      mockAssetNodes.create.mockResolvedValue(makeNode({ id: 'asset-new' }));

      await service.create(
        'plan-1',
        mockUser,
        { assetType: 'container', name: 'C1', parentAssetId: 'parent-1' } as any,
      );

      expect(mockAssetNodes.resolveDefaultParentForPlan).not.toHaveBeenCalled();
      expect(mockAssetNodes.create).toHaveBeenCalledWith(
        mockUser,
        expect.objectContaining({ parentId: 'parent-1' }),
        undefined,
      );
    });
  });

  describe('update', () => {
    it('should assert the asset node and delegate mapped fields', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'asset-1' });
      mockAssetNodes.update.mockResolvedValue(
        makeNode({ id: 'asset-1', statusCode: 'in_progress' }),
      );

      const result = await service.update('asset-1', mockUser, {
        locationDescription: 'voorin',
        statusCode: 'in_progress',
      } as any);

      expect(result.statusCode).toBe('in_progress');
      expect(mockAssetNodes.update).toHaveBeenCalledWith(
        'asset-1',
        mockUser,
        expect.objectContaining({ description: 'voorin', statusCode: 'in_progress' }),
      );
    });

    it('should throw NotFound when the asset node is out of scope', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(
        service.update('asset-x', mockUser, { name: 'X' } as any),
      ).rejects.toThrow('Asset niet gevonden');
      expect(mockAssetNodes.update).not.toHaveBeenCalled();
    });
  });

  describe('move', () => {
    it('should reject a move without a new parent', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'asset-1' });

      await expect(
        service.move('asset-1', mockUser, {} as any),
      ).rejects.toThrow(BadRequestException);
      expect(mockAssetNodes.move).not.toHaveBeenCalled();
    });

    it('should delegate the move and map the result', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'asset-1' });
      mockAssetNodes.move.mockResolvedValue(
        makeNode({ id: 'asset-1', parentId: 'asset-2', sortOrder: 0 }),
      );

      const result = await service.move('asset-1', mockUser, {
        newParentId: 'asset-2',
        sortOrder: 0,
      } as any);

      expect(result.parentAssetId).toBe('asset-2');
      expect(mockAssetNodes.move).toHaveBeenCalledWith('asset-1', mockUser, {
        newParentId: 'asset-2',
        sortOrder: 0,
      });
    });
  });

  describe('reorder', () => {
    it('should reorder assets via a scoped transaction', async () => {
      mockAssetNodes.listPlanNodes.mockResolvedValue([]);
      mockPrismaService.assetNode.update.mockImplementation((args: unknown) => args);
      mockPrismaService.$transaction.mockResolvedValue([]);

      const result = await service.reorder('plan-1', mockUser, {
        assetIds: ['asset-2', 'asset-1'],
      } as any);

      expect(result).toEqual({ reordered: true });
      expect(mockAssetNodes.listPlanNodes).toHaveBeenCalledWith(
        'plan-1',
        mockUser,
        AssetNodeType.ASSET,
      );
      expect(mockPrismaService.assetNode.update).toHaveBeenCalledWith({
        where: { id: 'asset-2' },
        data: { sortOrder: 0 },
      });
      expect(mockPrismaService.assetNode.update).toHaveBeenCalledWith({
        where: { id: 'asset-1' },
        data: { sortOrder: 1 },
      });
    });
  });

  describe('delete', () => {
    it('should assert the node and delegate the subtree delete', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue({ id: 'asset-1' });
      mockAssetNodes.delete.mockResolvedValue(undefined);

      const result = await service.delete('asset-1', mockUser);

      expect(result).toEqual({ deleted: true });
      expect(mockAssetNodes.delete).toHaveBeenCalledWith('asset-1', mockUser);
    });

    it('should throw NotFound when the asset node is out of scope', async () => {
      mockPrismaService.assetNode.findFirst.mockResolvedValue(null);

      await expect(service.delete('asset-x', mockUser)).rejects.toThrow('Asset niet gevonden');
      expect(mockAssetNodes.delete).not.toHaveBeenCalled();
    });
  });
});
