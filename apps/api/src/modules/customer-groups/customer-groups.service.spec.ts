import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { CustomerGroupsService } from './customer-groups.service';
import { PrismaService } from '@/prisma';

describe('CustomerGroupsService', () => {
  let service: CustomerGroupsService;

  const mockPrismaService = {
    customerGroup: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contactCustomerGroup: {
      upsert: jest.fn(),
      deleteMany: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
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
        CustomerGroupsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CustomerGroupsService>(CustomerGroupsService);
  });

  describe('findAll', () => {
    it('should return paginated customer groups', async () => {
      const mockGroups = [{ id: 'g-1', name: 'VIP', _count: { contacts: 5 } }];
      mockPrismaService.customerGroup.findMany.mockResolvedValue(mockGroups);
      mockPrismaService.customerGroup.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 50 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.customerGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', isDeleted: false }),
        }),
      );
    });

    it('should filter by search term', async () => {
      mockPrismaService.customerGroup.findMany.mockResolvedValue([]);
      mockPrismaService.customerGroup.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'VIP', page: 1, limit: 50 } as any);

      expect(mockPrismaService.customerGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            name: { contains: 'VIP', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.customerGroup.findMany.mockResolvedValue([]);
      mockPrismaService.customerGroup.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 50 } as any);

      const call = mockPrismaService.customerGroup.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('should return a customer group with contacts', async () => {
      const mockGroup = {
        id: 'g-1',
        orgId: 'org-1',
        name: 'VIP',
        isDeleted: false,
        contacts: [],
        _count: { contacts: 0 },
      };
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(mockGroup);

      const result = await service.findOne('g-1', mockUser);

      expect(result.id).toBe('g-1');
    });

    it('should throw NotFoundException for missing group', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for soft-deleted group', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 'g-1',
        isDeleted: true,
      });

      await expect(service.findOne('g-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException for cross-org access (WP-C1: 404-oracle)', async () => {
      // Org-scope in de where-clausule: andermans groep komt niet terug.
      mockPrismaService.customerGroup.findFirst.mockResolvedValue(null);

      await expect(service.findOne('g-1', mockUser)).rejects.toThrow(
        'Klantgroep niet gevonden',
      );
      expect(mockPrismaService.customerGroup.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'g-1', orgId: 'org-1' }),
        }),
      );
    });
  });

  describe('create', () => {
    it('should create a customer group', async () => {
      const mockGroup = { id: 'g-new', name: 'New Group', orgId: 'org-1' };
      mockPrismaService.customerGroup.create.mockResolvedValue(mockGroup);

      const result = await service.create({ name: 'New Group' } as any, mockUser);

      expect(result.name).toBe('New Group');
      expect(mockPrismaService.customerGroup.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ orgId: 'org-1', name: 'New Group' }),
      });
    });
  });

  describe('update', () => {
    it('should update a customer group', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 'g-1',
        orgId: 'org-1',
        isDeleted: false,
        contacts: [],
        _count: { contacts: 0 },
      });
      mockPrismaService.customerGroup.update.mockResolvedValue({
        id: 'g-1',
        name: 'Updated',
      });

      const result = await service.update('g-1', { name: 'Updated' } as any, mockUser);

      expect(mockPrismaService.customerGroup.update).toHaveBeenCalled();
    });
  });

  describe('softDelete', () => {
    it('should soft-delete a customer group', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 'g-1',
        orgId: 'org-1',
        isDeleted: false,
        contacts: [],
        _count: { contacts: 0 },
      });
      mockPrismaService.customerGroup.update.mockResolvedValue({});

      await service.softDelete('g-1', mockUser);

      expect(mockPrismaService.customerGroup.update).toHaveBeenCalledWith({
        where: { id: 'g-1' },
        data: { isDeleted: true },
      });
    });
  });

  describe('addContact', () => {
    it('should add a contact to the group', async () => {
      mockPrismaService.customerGroup.findFirst
        .mockResolvedValueOnce({
          id: 'g-1',
          orgId: 'org-1',
          isDeleted: false,
          contacts: [],
          _count: { contacts: 0 },
        })
        .mockResolvedValueOnce({
          id: 'g-1',
          orgId: 'org-1',
          isDeleted: false,
          contacts: [{ contact: { id: 'c-1' } }],
          _count: { contacts: 1 },
        });

      mockPrismaService.contact.findUnique.mockResolvedValue({
        id: 'c-1',
        orgId: 'org-1',
        isDeleted: false,
      });
      mockPrismaService.contactCustomerGroup.upsert.mockResolvedValue({});

      const result = await service.addContact('g-1', 'c-1', mockUser);

      expect(mockPrismaService.contactCustomerGroup.upsert).toHaveBeenCalled();
    });

    it('should throw NotFoundException for missing contact', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 'g-1',
        orgId: 'org-1',
        isDeleted: false,
        contacts: [],
        _count: { contacts: 0 },
      });
      mockPrismaService.contact.findUnique.mockResolvedValue(null);

      await expect(service.addContact('g-1', 'c-1', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org contact', async () => {
      mockPrismaService.customerGroup.findFirst.mockResolvedValue({
        id: 'g-1',
        orgId: 'org-1',
        isDeleted: false,
        contacts: [],
        _count: { contacts: 0 },
      });
      mockPrismaService.contact.findUnique.mockResolvedValue({
        id: 'c-1',
        orgId: 'other-org',
        isDeleted: false,
      });

      await expect(service.addContact('g-1', 'c-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('removeContact', () => {
    it('should remove a contact from the group', async () => {
      mockPrismaService.customerGroup.findFirst
        .mockResolvedValueOnce({
          id: 'g-1',
          orgId: 'org-1',
          isDeleted: false,
          contacts: [],
          _count: { contacts: 1 },
        })
        .mockResolvedValueOnce({
          id: 'g-1',
          orgId: 'org-1',
          isDeleted: false,
          contacts: [],
          _count: { contacts: 0 },
        });
      mockPrismaService.contactCustomerGroup.deleteMany.mockResolvedValue({});

      await service.removeContact('g-1', 'c-1', mockUser);

      expect(mockPrismaService.contactCustomerGroup.deleteMany).toHaveBeenCalledWith({
        where: { contactId: 'c-1', customerGroupId: 'g-1' },
      });
    });
  });

  describe('findAllCompact', () => {
    it('should return compact list of groups', async () => {
      mockPrismaService.customerGroup.findMany.mockResolvedValue([
        { id: 'g-1', name: 'VIP' },
        { id: 'g-2', name: 'Regulier' },
      ]);

      const result = await service.findAllCompact(mockUser);

      expect(result).toHaveLength(2);
      expect(mockPrismaService.customerGroup.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: { id: true, name: true },
        }),
      );
    });
  });
});
