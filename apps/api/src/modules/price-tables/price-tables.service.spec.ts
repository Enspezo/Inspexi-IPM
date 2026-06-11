import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, User, PriceType } from '@prisma/client';
import { PriceTablesService } from './price-tables.service';
import { PrismaService } from '@/prisma';

describe('PriceTablesService', () => {
  let service: PriceTablesService;
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

  const mockPriceTable = {
    id: 'pt-1',
    orgId: 'org-1',
    name: 'Standaard prijstabel',
    description: 'Standaard tarieven',
    isDefault: false,
    createdAt: new Date('2025-01-01'),
    items: [],
    contactPriceTables: [],
  };

  const mockContact = {
    id: 'contact-1',
    orgId: 'org-1',
    isDeleted: false,
  };

  const mockPrismaService = {
    priceTable: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    priceTableItem: {
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    priceTier: {
      deleteMany: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    contactPriceTable: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset $transaction to use the same mock prisma
    mockPrismaService.$transaction.mockImplementation((fn: any) =>
      fn(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PriceTablesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<PriceTablesService>(PriceTablesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated results with correct structure', async () => {
      const tables = [mockPriceTable];
      mockPrismaService.priceTable.findMany.mockResolvedValue(tables);
      mockPrismaService.priceTable.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(result).toEqual({ data: tables, total: 1, page: 1, limit: 20 });
      expect(mockPrismaService.priceTable.findMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1' },
        include: {
          _count: { select: { items: true } },
        },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        skip: 0,
        take: 20,
      });
    });

    it('should filter by search on name', async () => {
      mockPrismaService.priceTable.findMany.mockResolvedValue([]);
      mockPrismaService.priceTable.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'test', page: 1, limit: 20 });

      expect(mockPrismaService.priceTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            orgId: 'org-1',
            name: { contains: 'test', mode: 'insensitive' },
          },
        }),
      );
    });

    it('should scope by orgId for non-SUPERUSER', async () => {
      mockPrismaService.priceTable.findMany.mockResolvedValue([]);
      mockPrismaService.priceTable.count.mockResolvedValue(0);

      await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(mockPrismaService.priceTable.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should not add orgId filter for SUPERUSER', async () => {
      mockPrismaService.priceTable.findMany.mockResolvedValue([]);
      mockPrismaService.priceTable.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 });

      const calledWhere =
        mockPrismaService.priceTable.findMany.mock.calls[0][0].where;
      expect(calledWhere.orgId).toBeUndefined();
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return price table with items, tiers and contacts', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);

      const result = await service.findOne('pt-1', mockUser);

      expect(result).toEqual(mockPriceTable);
      expect(mockPrismaService.priceTable.findUnique).toHaveBeenCalledWith({
        where: { id: 'pt-1' },
        include: {
          items: {
            include: {
              product: true,
              tiers: { orderBy: { fromQty: 'asc' } },
            },
            orderBy: { product: { name: 'asc' } },
          },
          contactPriceTables: {
            include: {
              contact: {
                select: {
                  id: true,
                  type: true,
                  companyName: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      });
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Prijstabel niet gevonden');
    });

    it('should throw ForbiddenException when different org', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);

      await expect(
        service.findOne('pt-1', mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create basic price table', async () => {
      const createDto = { name: 'Nieuwe prijstabel', description: 'Test' };
      const created = {
        id: 'pt-new',
        orgId: 'org-1',
        ...createDto,
        isDefault: false,
        createdAt: new Date(),
      };
      mockPrismaService.priceTable.create.mockResolvedValue(created);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(created);
      expect(mockPrismaService.priceTable.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          name: createDto.name,
          description: createDto.description,
          isDefault: false,
        },
      });
    });

    it('should use transaction when isDefault is true (unsets others)', async () => {
      const createDto = { name: 'Default tabel', isDefault: true };
      const created = {
        id: 'pt-default',
        orgId: 'org-1',
        name: createDto.name,
        description: undefined,
        isDefault: true,
        createdAt: new Date(),
      };
      mockPrismaService.priceTable.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.priceTable.create.mockResolvedValue(created);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(created);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.priceTable.updateMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
      expect(mockPrismaService.priceTable.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          name: createDto.name,
          description: undefined,
          isDefault: true,
        },
      });
    });

    it('should throw ForbiddenException if no orgId and not SUPERUSER', async () => {
      const userNoOrg = {
        ...mockUser,
        id: 'user-no-org',
        orgId: null,
        roles: [Role.ORG_ADMIN],
      } as any;

      await expect(
        service.create({ name: 'Test' }, userNoOrg),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.create({ name: 'Test' }, userNoOrg),
      ).rejects.toThrow('Geen organisatie gekoppeld');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update basic fields', async () => {
      const updateDto = { name: 'Updated naam' };
      const updated = { ...mockPriceTable, name: 'Updated naam' };
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.priceTable.update.mockResolvedValue(updated);

      const result = await service.update('pt-1', updateDto, mockUser);

      expect(result.name).toBe('Updated naam');
      expect(mockPrismaService.priceTable.update).toHaveBeenCalledWith({
        where: { id: 'pt-1' },
        data: { name: 'Updated naam' },
      });
    });

    it('should use transaction when isDefault is true', async () => {
      const updateDto = { name: 'Now default', isDefault: true };
      const updated = { ...mockPriceTable, name: 'Now default', isDefault: true };
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.priceTable.updateMany.mockResolvedValue({ count: 1 });
      mockPrismaService.priceTable.update.mockResolvedValue(updated);

      const result = await service.update('pt-1', updateDto, mockUser);

      expect(result).toEqual(updated);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.priceTable.updateMany).toHaveBeenCalledWith({
        where: { orgId: 'org-1', isDefault: true },
        data: { isDefault: false },
      });
    });
  });

  // ─── setItems ────────────────────────────────────────────────────────

  describe('setItems()', () => {
    it('should delete old items+tiers then create new ones in transaction', async () => {
      const setItemsDto = {
        items: [
          {
            productId: 'prod-1',
            priceType: PriceType.FIXED,
            basePrice: 85,
          },
          {
            productId: 'prod-2',
            priceType: PriceType.TIERED,
            tiers: [
              { fromQty: 1, toQty: 10, price: 50 },
              { fromQty: 11, price: 40 },
            ],
          },
        ],
      };
      const resultTable = {
        ...mockPriceTable,
        items: [
          { productId: 'prod-1', priceType: PriceType.FIXED, basePrice: 85 },
        ],
      };

      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.priceTier.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.priceTableItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrismaService.priceTableItem.create.mockResolvedValue({});

      // After the for-loop, findUnique is called again to return the full table
      // The first call is from findOne, subsequent from the transaction
      // We need findUnique to return the price table on first call (findOne)
      // and resultTable on second call (inside transaction at the end)
      mockPrismaService.priceTable.findUnique
        .mockResolvedValueOnce(mockPriceTable) // findOne
        .mockResolvedValueOnce(resultTable); // final return in transaction

      const result = await service.setItems('pt-1', setItemsDto, mockUser);

      expect(result).toEqual(resultTable);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.priceTier.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.priceTableItem.deleteMany).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.priceTableItem.create).toHaveBeenCalledTimes(2);
    });
  });

  // ─── assignToContact ─────────────────────────────────────────────────

  describe('assignToContact()', () => {
    it('should assign price table to contact successfully', async () => {
      const assignment = {
        contactId: 'contact-1',
        priceTableId: 'pt-1',
        contact: { id: 'contact-1' },
        priceTable: mockPriceTable,
      };
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactPriceTable.findUnique.mockResolvedValue(null);
      mockPrismaService.contactPriceTable.create.mockResolvedValue(assignment);

      const result = await service.assignToContact('pt-1', 'contact-1', mockUser);

      expect(result).toEqual(assignment);
      expect(mockPrismaService.contactPriceTable.create).toHaveBeenCalledWith({
        data: {
          contactId: 'contact-1',
          priceTableId: 'pt-1',
        },
        include: {
          contact: {
            select: {
              id: true,
              type: true,
              companyName: true,
              firstName: true,
              lastName: true,
            },
          },
          priceTable: true,
        },
      });
    });

    it('should throw BadRequestException when already assigned (duplicate)', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactPriceTable.findUnique.mockResolvedValue({
        contactId: 'contact-1',
        priceTableId: 'pt-1',
      });

      await expect(
        service.assignToContact('pt-1', 'contact-1', mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.assignToContact('pt-1', 'contact-1', mockUser),
      ).rejects.toThrow('Prijstabel is al gekoppeld aan deze relatie');
    });

    it('should throw NotFoundException when contact not found', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.contact.findUnique.mockResolvedValue(null);

      await expect(
        service.assignToContact('pt-1', 'non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.assignToContact('pt-1', 'non-existent', mockUser),
      ).rejects.toThrow('Relatie niet gevonden');
    });
  });

  // ─── removeFromContact ───────────────────────────────────────────────

  describe('removeFromContact()', () => {
    it('should remove assignment successfully', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.contactPriceTable.findUnique.mockResolvedValue({
        contactId: 'contact-1',
        priceTableId: 'pt-1',
      });
      mockPrismaService.contactPriceTable.delete.mockResolvedValue({});

      await service.removeFromContact('pt-1', 'contact-1', mockUser);

      expect(mockPrismaService.contactPriceTable.delete).toHaveBeenCalledWith({
        where: {
          contactId_priceTableId: {
            contactId: 'contact-1',
            priceTableId: 'pt-1',
          },
        },
      });
    });

    it('should throw NotFoundException when assignment not found', async () => {
      mockPrismaService.priceTable.findUnique.mockResolvedValue(mockPriceTable);
      mockPrismaService.contactPriceTable.findUnique.mockResolvedValue(null);

      await expect(
        service.removeFromContact('pt-1', 'contact-1', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.removeFromContact('pt-1', 'contact-1', mockUser),
      ).rejects.toThrow('Koppeling niet gevonden');
    });
  });

  // ─── findForContact ──────────────────────────────────────────────────

  describe('findForContact()', () => {
    it('should return assigned price tables', async () => {
      const assignments = [
        { priceTable: { ...mockPriceTable, items: [] } },
      ];
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactPriceTable.findMany.mockResolvedValue(assignments);

      const result = await service.findForContact('contact-1', mockUser);

      expect(result).toEqual([{ ...mockPriceTable, items: [] }]);
      expect(mockPrismaService.contactPriceTable.findMany).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        include: {
          priceTable: {
            include: {
              items: {
                include: {
                  product: true,
                  tiers: { orderBy: { fromQty: 'asc' } },
                },
                orderBy: { product: { name: 'asc' } },
              },
            },
          },
        },
      });
    });

    it('should fall back to org default when none assigned', async () => {
      const defaultTable = {
        ...mockPriceTable,
        id: 'pt-default',
        isDefault: true,
        items: [],
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactPriceTable.findMany.mockResolvedValue([]);
      mockPrismaService.priceTable.findFirst.mockResolvedValue(defaultTable);

      const result = await service.findForContact('contact-1', mockUser);

      expect(result).toEqual([defaultTable]);
      expect(mockPrismaService.priceTable.findFirst).toHaveBeenCalledWith({
        where: { orgId: 'org-1', isDefault: true },
        include: {
          items: {
            include: {
              product: true,
              tiers: { orderBy: { fromQty: 'asc' } },
            },
            orderBy: { product: { name: 'asc' } },
          },
        },
      });
    });

    it('should return empty array when no assignment and no default', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactPriceTable.findMany.mockResolvedValue([]);
      mockPrismaService.priceTable.findFirst.mockResolvedValue(null);

      const result = await service.findForContact('contact-1', mockUser);

      expect(result).toEqual([]);
    });
  });
});
