import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuditLogService', () => {
  let service: AuditLogService;

  const mockPrismaService = {
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    contact: { findMany: jest.fn() },
    user: { findMany: jest.fn() },
    organization: { findMany: jest.fn() },
    request: { findMany: jest.fn() },
    quote: { findMany: jest.fn() },
    product: { findMany: jest.fn() },
    priceTable: { findMany: jest.fn() },
    quoteTemplate: { findMany: jest.fn() },
    location: { findMany: jest.fn() },
    customerGroup: { findMany: jest.fn() },
    assetNode: { findMany: jest.fn() },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
  });

  describe('findByUser', () => {
    it('should return paginated audit logs for a user', async () => {
      const mockEntries = [
        {
          id: 'log-1',
          userId: 'user-1',
          entityType: 'Contact',
          action: 'CREATE',
          changes: null,
          snapshot: { companyName: 'ACME' },
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);

      const result = await service.findByUser('user-1', 'org-1', { page: 1, limit: 10 });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: 'user-1', orgId: 'org-1' }),
        }),
      );
    });

    it('should skip orgId when null (SUPERUSER)', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findByUser('user-1', null, { page: 1, limit: 10 });

      const call = mockPrismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by entityType', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findByUser('user-1', 'org-1', {
        entityType: 'Contact',
        page: 1,
        limit: 10,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ entityType: 'Contact' }),
        }),
      );
    });

    it('should filter by action', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findByUser('user-1', 'org-1', {
        action: 'UPDATE',
        page: 1,
        limit: 10,
      });

      expect(mockPrismaService.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ action: 'UPDATE' }),
        }),
      );
    });

    it('should filter by date range', async () => {
      mockPrismaService.auditLog.findMany.mockResolvedValue([]);
      mockPrismaService.auditLog.count.mockResolvedValue(0);

      await service.findByUser('user-1', 'org-1', {
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
        page: 1,
        limit: 10,
      });

      const call = mockPrismaService.auditLog.findMany.mock.calls[0][0];
      expect(call.where.createdAt.gte).toBeInstanceOf(Date);
      expect(call.where.createdAt.lte).toBeInstanceOf(Date);
    });
  });

  describe('findByEntity', () => {
    it('should return audit logs for a specific entity', async () => {
      const mockEntries = [
        {
          id: 'log-1',
          entityType: 'Contact',
          entityId: 'c-1',
          changes: { companyName: { from: 'Old', to: 'New' } },
          snapshot: null,
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);

      const result = await service.findByEntity('Contact', 'c-1', 'org-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should throw BadRequestException for invalid entity type', async () => {
      await expect(
        service.findByEntity('InvalidType', 'id-1', 'org-1', { page: 1, limit: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept all valid entity types', async () => {
      const validTypes = [
        'Contact',
        'ContactPerson',
        'Location',
        'CustomerGroup',
        'Product',
        'PriceTable',
        'PriceTableItem',
        'Request',
        'Quote',
        'QuoteLine',
        'QuoteTemplate',
        'User',
        'Organization',
        'PlanningItem',
      ];

      for (const type of validTypes) {
        mockPrismaService.auditLog.findMany.mockResolvedValue([]);
        mockPrismaService.auditLog.count.mockResolvedValue(0);

        await expect(
          service.findByEntity(type, 'id-1', 'org-1', { page: 1, limit: 10 }),
        ).resolves.not.toThrow();
      }
    });
  });

  describe('UUID resolution', () => {
    it('should resolve contactId UUIDs to display names', async () => {
      const mockEntries = [
        {
          id: 'log-1',
          entityType: 'Request',
          entityId: 'req-1',
          changes: {
            contactId: {
              from: '11111111-1111-1111-1111-111111111111',
              to: '22222222-2222-2222-2222-222222222222',
            },
          },
          snapshot: null,
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: '11111111-1111-1111-1111-111111111111', companyName: 'Old Corp' },
        { id: '22222222-2222-2222-2222-222222222222', companyName: 'New Corp' },
      ]);

      const result = await service.findByEntity('Request', 'req-1', 'org-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].changes.contactId.from).toBe('Old Corp');
      expect(result.data[0].changes.contactId.to).toBe('New Corp');
    });

    it('should resolve ownerId UUIDs to user names', async () => {
      const mockEntries = [
        {
          id: 'log-1',
          entityType: 'Contact',
          entityId: 'c-1',
          changes: null,
          snapshot: { ownerId: '33333333-3333-3333-3333-333333333333' },
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: '33333333-3333-3333-3333-333333333333', firstName: 'Piet', lastName: 'Jansen' },
      ]);

      const result = await service.findByEntity('Contact', 'c-1', 'org-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].snapshot.ownerId).toBe('Piet Jansen');
    });

    it('should resolve Finding.assetNodeId against the AssetNode tree', async () => {
      const nodeId = '55555555-5555-5555-5555-555555555555';
      const mockEntries = [
        {
          id: 'log-1',
          entityType: 'Finding',
          entityId: 'finding-1',
          changes: null,
          snapshot: { assetNodeId: nodeId },
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);
      mockPrismaService.assetNode.findMany.mockResolvedValue([
        { id: nodeId, name: 'Hal 3', identifier: 'L-3' },
      ]);

      const result = await service.findByEntity('Finding', 'finding-1', 'org-1', {
        page: 1,
        limit: 10,
      });

      // Resolved via the assetNode delegate, NOT the Beheer location delegate
      expect(mockPrismaService.assetNode.findMany).toHaveBeenCalled();
      expect(mockPrismaService.location.findMany).not.toHaveBeenCalled();
      expect(result.data[0].snapshot.assetNodeId).toBe('Hal 3');
    });

    it('should return entries unchanged when no UUIDs to resolve', async () => {
      const mockEntries = [
        {
          id: 'log-1',
          entityType: 'Contact',
          entityId: 'c-1',
          changes: { companyName: { from: 'Old', to: 'New' } },
          snapshot: null,
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);

      const result = await service.findByEntity('Contact', 'c-1', 'org-1', {
        page: 1,
        limit: 10,
      });

      expect(result.data[0].changes.companyName.from).toBe('Old');
      expect(result.data[0].changes.companyName.to).toBe('New');
    });

    it('should keep unresolved UUIDs as-is when lookup fails', async () => {
      const uuid = '44444444-4444-4444-4444-444444444444';
      const mockEntries = [
        {
          id: 'log-1',
          entityType: 'Request',
          entityId: 'req-1',
          changes: { contactId: { from: null, to: uuid } },
          snapshot: null,
          user: { id: 'user-1', firstName: 'Jan', lastName: 'Test' },
        },
      ];
      mockPrismaService.auditLog.findMany.mockResolvedValue(mockEntries);
      mockPrismaService.auditLog.count.mockResolvedValue(1);
      mockPrismaService.contact.findMany.mockResolvedValue([]); // No match

      const result = await service.findByEntity('Request', 'req-1', 'org-1', {
        page: 1,
        limit: 10,
      });

      // UUID stays as the raw value when not resolved
      expect(result.data[0].changes.contactId.to).toBe(uuid);
    });
  });
});
