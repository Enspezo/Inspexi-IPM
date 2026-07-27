import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { ProductsService } from './products.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { NumberingService } from '@/modules/numbering/numbering.service';
import { PrismaService } from '@/prisma';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockSuperuser = {
    id: 'su-1',
    orgId: null,
    email: 'superuser@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Super',
    lastName: 'User',
    roles: [Role.SUPERUSER],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockOtherOrgUser = {
    id: 'user-other',
    orgId: 'org-2',
    email: 'other@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Other',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockProduct = {
    id: 'product-1',
    orgId: 'org-1',
    name: 'NEN1010 Inspectie',
    unit: 'uur',
    description: 'Elektrische inspectie',
    defaultVat: 21,
    productGroupId: null,
    customFields: null,
    isActive: true,
    createdAt: new Date('2025-01-01'),
  };

  const mockPrismaService = {
    product: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockCustomFieldsValidator = {
    validateAndSanitize: jest.fn().mockResolvedValue(null),
  };

  // Invokes the create callback with a deterministic generated code so the
  // service's create path runs exactly as in production (minus the real engine).
  const mockNumberingService = {
    runWithGeneratedNumber: jest.fn(async (_model, _orgId, _opts, create) =>
      create(mockPrismaService, 'PRD-0001'),
    ),
    validateManualNumber: jest.fn(async (_o, _m, value: string) => value.trim()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CustomFieldsValidator, useValue: mockCustomFieldsValidator },
        { provide: NumberingService, useValue: mockNumberingService },
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
        include: {
          productGroup: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        skip: 0,
        take: 20,
      });
      expect(mockPrismaService.product.count).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
      });
    });

    it('should filter by search term using OR on name and product group name', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'test', page: 1, limit: 20 });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 'org-1',
            OR: [
              { name: { contains: 'test', mode: 'insensitive' } },
              { productCode: { contains: 'test', mode: 'insensitive' } },
              { productGroup: { name: { contains: 'test', mode: 'insensitive' } } },
            ],
          },
        }),
      );
    });

    it('should filter by productGroupId', async () => {
      mockPrismaService.product.findMany.mockResolvedValue([]);
      mockPrismaService.product.count.mockResolvedValue(0);

      const groupId = 'group-uuid-123';
      await service.findAll(mockUser, {
        productGroupId: groupId,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            productGroupId: groupId,
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
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

      const result = await service.findOne('product-1', mockUser);

      expect(result).toEqual(mockProduct);
      expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith({
        where: { id: 'product-1', orgId: 'org-1' },
        include: {
          productGroup: { select: { id: true, name: true } },
        },
      });
    });

    it('should throw NotFoundException when product not found', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Product niet gevonden');
    });

    it('should throw NotFoundException when different org (WP-C1: 404-oracle, geen 403)', async () => {
      // Org-scope in de where-clausule: andermans product komt niet terug.
      mockPrismaService.product.findFirst.mockResolvedValue(null);

      await expect(
        service.findOne('product-1', mockOtherOrgUser),
      ).rejects.toThrow('Product niet gevonden');
      expect(mockPrismaService.product.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-2' }),
        }),
      );
    });

    it('should allow SUPERUSER to access any org product', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);

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
    };

    it('should create product with orgId from user', async () => {
      const createdProduct = {
        id: 'product-new',
        orgId: 'org-1',
        ...createDto,
        defaultVat: 21,
        productGroupId: null,
        customFields: null,
        isActive: true,
        createdAt: new Date(),
      };
      mockPrismaService.product.create.mockResolvedValue(createdProduct);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(createdProduct);
      expect(mockPrismaService.product.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          productCode: 'PRD-0001',
          name: createDto.name,
          unit: createDto.unit,
          description: createDto.description,
          defaultVat: 21,
          productGroupId: null,
          isActive: true,
          customFields: null,
        },
        include: {
          productGroup: { select: { id: true, name: true } },
        },
      });
    });

    it('should throw BadRequestException if no orgId (WP-B3)', async () => {
      const userNoOrg = {
        ...mockUser,
        id: 'user-no-org',
        orgId: null,
        roles: [Role.ORG_ADMIN],
      } as any;

      await expect(
        service.create(createDto, userNoOrg),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create(createDto, userNoOrg),
      ).rejects.toThrow('Selecteer eerst een organisatie');
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
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
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
        include: {
          productGroup: { select: { id: true, name: true } },
        },
      });
    });

    it('should call findOne first for access check', async () => {
      mockPrismaService.product.findFirst.mockResolvedValue(mockProduct);
      mockPrismaService.product.update.mockResolvedValue(mockProduct);

      await service.update('product-1', updateDto, mockUser);

      expect(mockPrismaService.product.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.product.update).toHaveBeenCalledTimes(1);
    });
  });
});
