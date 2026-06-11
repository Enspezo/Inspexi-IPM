import { Test, TestingModule } from '@nestjs/testing';
import { Role, TaskEntityType, DocumentEntityType } from '@prisma/client';
import { SearchService } from './search.service';
import { SearchEntityType } from './dto/search-query.dto';
import { PrismaService } from '@/prisma';

describe('SearchService', () => {
  let service: SearchService;

  const mockPrismaService = {
    contact: { findMany: jest.fn(), count: jest.fn() },
    contactPerson: { findMany: jest.fn(), count: jest.fn() },
    request: { findMany: jest.fn(), count: jest.fn() },
    quote: { findMany: jest.fn(), count: jest.fn() },
    task: { findMany: jest.fn(), count: jest.fn() },
    document: { findMany: jest.fn(), count: jest.fn() },
    product: { findMany: jest.fn(), count: jest.fn() },
    location: { findMany: jest.fn(), count: jest.fn() },
    planningItem: { findMany: jest.fn(), count: jest.fn() },
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockInspecteur = {
    id: 'user-2',
    orgId: 'org-1',
    roles: [Role.INSPECTEUR],
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
        SearchService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<SearchService>(SearchService);

    // Default empty results
    for (const key of Object.keys(mockPrismaService)) {
      const model = mockPrismaService[key as keyof typeof mockPrismaService];
      if (model.findMany) model.findMany.mockResolvedValue([]);
      if (model.count) model.count.mockResolvedValue(0);
    }
  });

  describe('search — all types', () => {
    it('should search across all entity types for admin users', async () => {
      const result = await service.search(mockUser, { q: 'test', limit: 4, page: 1 } as any);

      expect(result.groups).toBeDefined();
      // Should have searched contacts, contactPersons, requests, quotes, tasks, documents, products
      expect(mockPrismaService.contact.findMany).toHaveBeenCalled();
      expect(mockPrismaService.contactPerson.findMany).toHaveBeenCalled();
      expect(mockPrismaService.request.findMany).toHaveBeenCalled();
      expect(mockPrismaService.quote.findMany).toHaveBeenCalled();
      expect(mockPrismaService.task.findMany).toHaveBeenCalled();
      expect(mockPrismaService.document.findMany).toHaveBeenCalled();
      expect(mockPrismaService.product.findMany).toHaveBeenCalled();
    });

    it('should hide products from INSPECTEUR role', async () => {
      const result = await service.search(mockInspecteur, { q: 'test', limit: 4, page: 1 } as any);

      expect(mockPrismaService.product.findMany).not.toHaveBeenCalled();
      expect(
        result.groups.find((g: any) => g.type === SearchEntityType.PRODUCT),
      ).toBeUndefined();
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      await service.search(mockSuperuser, { q: 'test', limit: 4, page: 1 } as any);

      // Check that contacts search was called without orgId
      const contactCall = mockPrismaService.contact.findMany.mock.calls[0][0];
      expect(contactCall.where.orgId).toBeUndefined();
    });
  });

  describe('search — single type', () => {
    it('should only search contacts when type filter is CONTACT', async () => {
      await service.search(mockUser, {
        q: 'test',
        type: SearchEntityType.CONTACT,
        limit: 4,
        page: 1,
      } as any);

      expect(mockPrismaService.contact.findMany).toHaveBeenCalled();
      expect(mockPrismaService.request.findMany).not.toHaveBeenCalled();
      expect(mockPrismaService.quote.findMany).not.toHaveBeenCalled();
    });

    it('should only search tasks when type filter is TASK', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Test task',
          entityType: TaskEntityType.CONTACT,
          entityId: 'c-1',
        },
      ];
      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.task.count.mockResolvedValue(1);

      const result = await service.search(mockUser, {
        q: 'test',
        type: SearchEntityType.TASK,
        limit: 4,
        page: 1,
      } as any);

      expect(mockPrismaService.task.findMany).toHaveBeenCalled();
      expect(mockPrismaService.contact.findMany).toHaveBeenCalledTimes(1); // Entity name resolution only
    });
  });

  describe('search results', () => {
    it('should return contacts with matching company name', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'Test Corp', addresses: [] },
      ]);
      mockPrismaService.contact.count.mockResolvedValue(1);

      const result = await service.search(mockUser, {
        q: 'Test',
        type: SearchEntityType.CONTACT,
        limit: 4,
        page: 1,
      } as any);

      const contactGroup = result.groups.find((g: any) => g.type === SearchEntityType.CONTACT);
      expect(contactGroup).toBeDefined();
      expect(contactGroup!.total).toBe(1);
      expect(contactGroup!.items).toHaveLength(1);
    });

    it('should enrich task results with entity names', async () => {
      const tasks = [
        { id: 't-1', title: 'Task', entityType: TaskEntityType.CONTACT, entityId: 'c-1' },
      ];
      mockPrismaService.task.findMany.mockResolvedValue(tasks);
      mockPrismaService.task.count.mockResolvedValue(1);
      // Entity enrichment
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'ACME' },
      ]);

      const result = await service.search(mockUser, {
        q: 'Task',
        type: SearchEntityType.TASK,
        limit: 4,
        page: 1,
      } as any);

      const taskGroup = result.groups.find((g: any) => g.type === SearchEntityType.TASK);
      expect((taskGroup!.items[0] as any).entityName).toBe('ACME');
    });

    it('should enrich document results with entity names', async () => {
      const docs = [
        {
          id: 'd-1',
          originalName: 'test.pdf',
          entityType: DocumentEntityType.REQUEST,
          entityId: 'req-1',
        },
      ];
      mockPrismaService.document.findMany.mockResolvedValue(docs);
      mockPrismaService.document.count.mockResolvedValue(1);
      mockPrismaService.request.findMany.mockResolvedValue([
        { id: 'req-1', title: 'Test Request' },
      ]);

      const result = await service.search(mockUser, {
        q: 'test',
        type: SearchEntityType.DOCUMENT,
        limit: 4,
        page: 1,
      } as any);

      const docGroup = result.groups.find((g: any) => g.type === SearchEntityType.DOCUMENT);
      expect((docGroup!.items[0] as any).entityName).toBe('Test Request');
    });
  });

  describe('org scoping', () => {
    it('should add orgId filter for org users', async () => {
      await service.search(mockUser, { q: 'test', limit: 4, page: 1 } as any);

      const contactCall = mockPrismaService.contact.findMany.mock.calls[0][0];
      expect(contactCall.where.orgId).toBe('org-1');
    });
  });
});
