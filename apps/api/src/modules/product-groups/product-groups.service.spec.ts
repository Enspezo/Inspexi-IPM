import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException, BadRequestException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { ProductGroupsService } from './product-groups.service';
import { PrismaService } from '@/prisma';

describe('ProductGroupsService', () => {
  let service: ProductGroupsService;

  const mockPrismaService = {
    productGroup: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    product: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    roles: [Role.SUPERUSER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductGroupsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProductGroupsService>(ProductGroupsService);
  });

  describe('findAll', () => {
    it('should return paginated product groups', async () => {
      mockPrismaService.productGroup.findMany.mockResolvedValue([
        { id: 'pg-1', name: 'Inspections', _count: { products: 3 } },
      ]);
      mockPrismaService.productGroup.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 50 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.productGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', isDeleted: false }),
        }),
      );
    });

    it('should filter by search', async () => {
      mockPrismaService.productGroup.findMany.mockResolvedValue([]);
      mockPrismaService.productGroup.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'inspect', page: 1, limit: 50 } as any);

      expect(mockPrismaService.productGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'inspect', mode: 'insensitive' },
          }),
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a product group with products', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue({
        id: 'pg-1',
        orgId: 'org-1',
        name: 'Inspections',
        isDeleted: false,
        products: [],
        _count: { products: 0 },
      });

      const result = await service.findOne('pg-1', mockUser);

      expect(result.id).toBe('pg-1');
    });

    it('should throw NotFoundException for missing group', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for soft-deleted group', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue({
        id: 'pg-1',
        isDeleted: true,
      });

      await expect(service.findOne('pg-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for cross-org access (WP-C1: 404-oracle)', async () => {
      // Org-scope in de where-clausule: andermans groep komt niet terug.
      mockPrismaService.productGroup.findFirst.mockResolvedValue(null);

      await expect(service.findOne('pg-1', mockUser)).rejects.toThrow(
        'Productgroep niet gevonden',
      );
      expect(mockPrismaService.productGroup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'pg-1', orgId: 'org-1' }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a product group', async () => {
      mockPrismaService.productGroup.create.mockResolvedValue({
        id: 'pg-new',
        name: 'New Group',
        orgId: 'org-1',
        _count: { products: 0 },
      });

      const result = await service.create({ name: 'New Group' } as any, mockUser);

      expect(result.name).toBe('New Group');
    });

    it('should throw BadRequestException when user has no orgId (WP-B3)', async () => {
      const userNoOrg = { id: 'u-1', orgId: null, roles: [Role.BACKOFFICE] } as any;

      await expect(
        service.create({ name: 'Test' } as any, userNoOrg),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('softDelete', () => {
    it('should soft-delete a group without active products', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue({
        id: 'pg-1',
        orgId: 'org-1',
        isDeleted: false,
        products: [],
        _count: { products: 0 },
      });
      mockPrismaService.product.count.mockResolvedValue(0);
      mockPrismaService.productGroup.update.mockResolvedValue({});

      await service.softDelete('pg-1', mockUser);

      expect(mockPrismaService.productGroup.update).toHaveBeenCalledWith({
        where: { id: 'pg-1' },
        data: { isDeleted: true },
      });
    });

    it('should throw ConflictException when group has active products', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue({
        id: 'pg-1',
        orgId: 'org-1',
        isDeleted: false,
        products: [],
        _count: { products: 3 },
      });
      mockPrismaService.product.count.mockResolvedValue(3);

      await expect(service.softDelete('pg-1', mockUser)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('addProduct', () => {
    it('should add a product to the group', async () => {
      mockPrismaService.productGroup.findFirst
        .mockResolvedValueOnce({
          id: 'pg-1',
          orgId: 'org-1',
          isDeleted: false,
          products: [],
          _count: { products: 0 },
        })
        .mockResolvedValueOnce({
          id: 'pg-1',
          orgId: 'org-1',
          isDeleted: false,
          products: [{ id: 'p-1' }],
          _count: { products: 1 },
        });
      mockPrismaService.product.findUnique.mockResolvedValue({
        id: 'p-1',
        orgId: 'org-1',
      });
      mockPrismaService.product.update.mockResolvedValue({});

      await service.addProduct('pg-1', 'p-1', mockUser);

      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { productGroupId: 'pg-1' },
      });
    });

    it('should throw NotFoundException for missing product', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue({
        id: 'pg-1',
        orgId: 'org-1',
        isDeleted: false,
        products: [],
        _count: { products: 0 },
      });
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.addProduct('pg-1', 'p-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removeProduct', () => {
    it('should remove a product from the group', async () => {
      mockPrismaService.productGroup.findFirst
        .mockResolvedValueOnce({
          id: 'pg-1',
          orgId: 'org-1',
          isDeleted: false,
          products: [],
          _count: { products: 1 },
        })
        .mockResolvedValueOnce({
          id: 'pg-1',
          orgId: 'org-1',
          isDeleted: false,
          products: [],
          _count: { products: 0 },
        });
      mockPrismaService.product.findFirst.mockResolvedValue({
        id: 'p-1',
        orgId: 'org-1',
        productGroupId: 'pg-1',
      });
      mockPrismaService.product.update.mockResolvedValue({});

      await service.removeProduct('pg-1', 'p-1', mockUser);

      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: { id: 'p-1' },
        data: { productGroupId: null },
      });
    });

    it('should throw NotFoundException for product not in group', async () => {
      mockPrismaService.productGroup.findFirst.mockResolvedValue({
        id: 'pg-1',
        orgId: 'org-1',
        isDeleted: false,
        products: [],
        _count: { products: 0 },
      });
      mockPrismaService.product.findFirst.mockResolvedValue({
        id: 'p-1',
        orgId: 'org-1',
        productGroupId: 'pg-other',
      });

      await expect(service.removeProduct('pg-1', 'p-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findAllCompact', () => {
    it('should return compact list', async () => {
      mockPrismaService.productGroup.findMany.mockResolvedValue([
        { id: 'pg-1', name: 'Group A' },
      ]);

      const result = await service.findAllCompact(mockUser);

      expect(result).toHaveLength(1);
      expect(mockPrismaService.productGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, name: true },
        }),
      );
    });
  });
});
