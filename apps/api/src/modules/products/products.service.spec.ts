import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { ProductsService } from './products.service';
import { PrismaService } from '@/prisma';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;

  const mockUser: User = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    role: Role.ORG_ADMIN,
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  };

  const mockSuperuser: User = {
    id: 'su-1',
    orgId: null,
    email: 'superuser@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Super',
    lastName: 'User',
    role: Role.SUPERUSER,
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  };

  const mockOtherOrgUser: User = {
    id: 'user-other',
    orgId: 'org-2',
    email: 'other@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Other',
    lastName: 'User',
    role: Role.ORG_ADMIN,
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  };

  const mockProduct = {
    id: 'product-1',
    orgId: 'org-1',
    name: 'NEN1010 Inspectie',
    unit: 'uur',
    description: 'Elektrische inspectie',
    defaultVat: 21,
    category: 'inspectie',
    isActive: true,
    createdAt: new Date('2025-01-01'),
  };

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated results with correct structure', async () => {
      const products = [mockProduct];
      mockPrismaService.product.findMany.mockResolvedValue(products);
      mockPrismaService.product.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(result).toEqual({ data: products, total: 1, page: 1, limit: 20 });
      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(mockPrismaService.product.count).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
      });
    });

    it('should filter by search term using OR on name and category', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'test', page: 1, limit: 20 });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 'org-1',
            OR: [
              { name: { contains: 'test', mode: 'insensitive' } },
              { category: { contains: 'test', mode: 'insensitive' } },
            ],
          },
        }),
      );
    });

    it('should filter by category', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        category: 'inspectie',
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'inspectie',
          }),
        }),
      );
    });

    it('should filter by isActive', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        isActive: true,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
          }),
        }),
      );
    });

    it('should scope by orgId for non-SUPERUSER', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should not add orgId filter for SUPERUSER', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 });

      const calledWhere =
        mockPrismaService.product.findMany.mock.calls[0][0].where;
      expect(calledWhere.orgId).toBeUndefined();
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return product when found', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-1', mockUser);

      expect(result).toEqual(mockProduct);
      expect(mockPrismaService.product.findUnique).toHaveBeenCalledWith({
        where: { id: 'product-1' },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Product niet gevonden');
    });

    it('should throw ForbiddenException when different org (non-SUPERUSER)', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

      await expect(
        service.findOne('product-1', mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPERUSER to access any org product', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-1', mockSuperuser);

      expect(result).toEqual(mockProduct);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto = {
      name: 'NEN3140 Inspectie',
      unit: 'uur',
      description: 'Arbeidsmiddelen inspectie',
      category: 'inspectie',
    };

    it('should create product with orgId from user', async () => {
      const createdProduct = {
        id: 'product-new',
        orgId: 'org-1',
        ...createDto,
        defaultVat: 21,
        isActive: true,
        createdAt: new Date(),
      };
      mockPrismaService.product.create.mockResolvedValue(createdProduct);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(createdProduct);
      expect(mockPrismaService.product.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          name: createDto.name,
          unit: createDto.unit,
          description: createDto.description,
          defaultVat: 21,
          category: createDto.category,
          isActive: true,
        },
      });
    });

    it('should throw ForbiddenException if no orgId and not SUPERUSER', async () => {
      const userNoOrg: User = {
        ...mockUser,
        id: 'user-no-org',
        orgId: null,
        role: Role.ORG_ADMIN,
      };

      await expect(
        service.create(createDto, userNoOrg),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.create(createDto, userNoOrg),
      ).rejects.toThrow('Geen organisatie gekoppeld');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto = {
      name: 'Updated product',
      isActive: false,
    };

    it('should update product fields via spread pattern', async () => {
      const updatedProduct = {
        ...mockProduct,
        name: 'Updated product',
        isActive: false,
      };
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.product.update.mockResolvedValue(updatedProduct);

      const result = await service.update('product-1', updateDto, mockUser);

      expect(result.name).toBe('Updated product');
      expect(result.isActive).toBe(false);
      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: { id: 'product-1' },
        data: {
          name: 'Updated product',
          isActive: false,
        },
      });
    });

    it('should call findOne first for access check', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(mockProduct);
      mockPrismaService.product.update.mockResolvedValue(mockProduct);

      await service.update('product-1', updateDto, mockUser);

      expect(mockPrismaService.product.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.product.update).toHaveBeenCalledTimes(1);
    });
  });
});
