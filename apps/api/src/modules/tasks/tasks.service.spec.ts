import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { Role, TaskEntityType, TaskStatus, NotificationType } from '@prisma/client';
import { TasksService } from './tasks.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';

describe('TasksService', () => {
  let service: TasksService;

  const mockPrismaService = {
    task: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    contact: { findMany: jest.fn() },
    request: { findMany: jest.fn() },
    quote: { findMany: jest.fn() },
    planningItem: { findMany: jest.fn() },
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);

    // Default enrichment mocks
    mockPrismaService.contact.findMany.mockResolvedValue([]);
    mockPrismaService.request.findMany.mockResolvedValue([]);
    mockPrismaService.quote.findMany.mockResolvedValue([]);
    mockPrismaService.planningItem.findMany.mockResolvedValue([]);
  });

  describe('findAll', () => {
    it('should return paginated tasks for org user', async () => {
      const mockTasks = [
        {
          id: 'task-1',
          title: 'Test task',
          entityType: TaskEntityType.CONTACT,
          entityId: 'c-1',
          orgId: 'org-1',
        },
      ];
      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.task.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 } as any);

      const call = mockPrismaService.task.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by status', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll(mockUser, { status: TaskStatus.TE_DOEN, page: 1, limit: 20 } as any);

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: TaskStatus.TE_DOEN }),
        }),
      );
    });

    it('should filter by onlyMine', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll(mockUser, { onlyMine: 'true', page: 1, limit: 20 } as any);

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ assigneeId: 'user-1' }),
        }),
      );
    });

    it('should filter by search', async () => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'important', page: 1, limit: 20 } as any);

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { contains: 'important', mode: 'insensitive' },
          }),
        }),
      );
    });

    it('should enrich tasks with entity names', async () => {
      const mockTasks = [
        { id: 'task-1', entityType: TaskEntityType.CONTACT, entityId: 'c-1', orgId: 'org-1' },
      ];
      mockPrismaService.task.findMany.mockResolvedValue(mockTasks);
      mockPrismaService.task.count.mockResolvedValue(1);
      mockPrismaService.contact.findMany.mockResolvedValue([
        { id: 'c-1', companyName: 'ACME' },
      ]);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data[0].entityName).toBe('ACME');
    });
  });

  describe('findOne', () => {
    it('should return a task with entity name', async () => {
      const mockTask = {
        id: 'task-1',
        orgId: 'org-1',
        entityType: TaskEntityType.REQUEST,
        entityId: 'req-1',
        assignee: null,
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);
      mockPrismaService.request.findMany.mockResolvedValue([
        { id: 'req-1', title: 'Test Request' },
      ]);

      const result = await service.findOne('task-1', mockUser);

      expect(result.entityName).toBe('Test Request');
    });

    it('should throw NotFoundException for missing task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org access', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 'task-1',
        orgId: 'other-org',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
      });

      await expect(service.findOne('task-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow SUPERUSER cross-org access', async () => {
      const mockTask = {
        id: 'task-1',
        orgId: 'other-org',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        assignee: null,
        createdBy: { id: 'user-2', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.findUnique.mockResolvedValue(mockTask);

      const result = await service.findOne('task-1', mockSuperuser);

      expect(result.id).toBe('task-1');
    });
  });

  describe('create', () => {
    it('should create a task and return it', async () => {
      const mockTask = {
        id: 'task-new',
        title: 'New Task',
        orgId: 'org-1',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        assigneeId: null,
        createdById: 'user-1',
        assignee: null,
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.create.mockResolvedValue(mockTask);

      const result = await service.create(
        { title: 'New Task', entityType: TaskEntityType.CONTACT, entityId: 'c-1' } as any,
        mockUser,
      );

      expect(result.id).toBe('task-new');
      expect(mockPrismaService.task.create).toHaveBeenCalled();
    });

    it('should dispatch notification when assigned to another user', async () => {
      const mockTask = {
        id: 'task-new',
        title: 'Assigned Task',
        orgId: 'org-1',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        assigneeId: 'user-2',
        createdById: 'user-1',
        assignee: { id: 'user-2', firstName: 'C', lastName: 'D', email: 'c@d.nl' },
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.create.mockResolvedValue(mockTask);

      await service.create(
        {
          title: 'Assigned Task',
          entityType: TaskEntityType.CONTACT,
          entityId: 'c-1',
          assigneeId: 'user-2',
        } as any,
        mockUser,
      );

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.TAAK_TOEGEWEZEN,
          recipientUserIds: ['user-2'],
        }),
      );
    });

    it('should NOT notify when assigned to self', async () => {
      const mockTask = {
        id: 'task-new',
        title: 'Self Task',
        orgId: 'org-1',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        assigneeId: 'user-1',
        createdById: 'user-1',
        assignee: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.create.mockResolvedValue(mockTask);

      await service.create(
        {
          title: 'Self Task',
          entityType: TaskEntityType.CONTACT,
          entityId: 'c-1',
          assigneeId: 'user-1',
        } as any,
        mockUser,
      );

      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update a task', async () => {
      const existing = {
        id: 'task-1',
        orgId: 'org-1',
        status: TaskStatus.TE_DOEN,
        assigneeId: null,
      };
      mockPrismaService.task.findUnique.mockResolvedValue(existing);
      const updated = {
        ...existing,
        title: 'Updated',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        createdById: 'user-1',
        assignee: null,
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.update.mockResolvedValue(updated);

      const result = await service.update('task-1', { title: 'Updated' } as any, mockUser);

      expect(mockPrismaService.task.update).toHaveBeenCalled();
    });

    it('should dispatch notification on assignment change', async () => {
      const existing = {
        id: 'task-1',
        orgId: 'org-1',
        status: TaskStatus.TE_DOEN,
        assigneeId: null,
      };
      mockPrismaService.task.findUnique.mockResolvedValue(existing);
      const updated = {
        ...existing,
        assigneeId: 'user-2',
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        title: 'Test',
        createdById: 'user-1',
        assignee: { id: 'user-2', firstName: 'C', lastName: 'D', email: 'c@d.nl' },
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.update.mockResolvedValue(updated);

      await service.update('task-1', { assigneeId: 'user-2' } as any, mockUser);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.TAAK_TOEGEWEZEN,
          recipientUserIds: ['user-2'],
        }),
      );
    });

    it('should dispatch notification on status change', async () => {
      const existing = {
        id: 'task-1',
        orgId: 'org-1',
        status: TaskStatus.TE_DOEN,
        assigneeId: 'user-2',
      };
      mockPrismaService.task.findUnique.mockResolvedValue(existing);
      const updated = {
        ...existing,
        status: TaskStatus.VOLTOOID,
        entityType: TaskEntityType.CONTACT,
        entityId: 'c-1',
        title: 'Test',
        createdById: 'user-1',
        assignee: { id: 'user-2', firstName: 'C', lastName: 'D', email: 'c@d.nl' },
        createdBy: { id: 'user-1', firstName: 'A', lastName: 'B', email: 'a@b.nl' },
      };
      mockPrismaService.task.update.mockResolvedValue(updated);

      await service.update('task-1', { status: TaskStatus.VOLTOOID } as any, mockUser);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.TAAK_STATUS_GEWIJZIGD,
        }),
      );
    });

    it('should throw ForbiddenException for cross-org update', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 'task-1',
        orgId: 'other-org',
        status: TaskStatus.TE_DOEN,
        assigneeId: null,
      });

      await expect(
        service.update('task-1', { title: 'hack' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('remove', () => {
    it('should delete a task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 'task-1',
        orgId: 'org-1',
      });
      mockPrismaService.task.delete.mockResolvedValue({});

      await service.remove('task-1', mockUser);

      expect(mockPrismaService.task.delete).toHaveBeenCalledWith({
        where: { id: 'task-1' },
      });
    });

    it('should throw NotFoundException for missing task', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org delete', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue({
        id: 'task-1',
        orgId: 'other-org',
      });

      await expect(service.remove('task-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
