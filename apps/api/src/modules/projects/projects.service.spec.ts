import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Role, ProjectStatus } from '@prisma/client';
import { ProjectsService } from './projects.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { NumberingService } from '@/modules/numbering/numbering.service';

describe('ProjectsService', () => {
  let service: ProjectsService;

  const mockPrismaService = {
    project: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    request: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    quote: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    planningItem: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    projectFollower: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    planningFollower: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  // Mirrors the real engine: generate a number then run the create callback inside
  // a transaction. Routing through mockPrismaService.$transaction keeps each test's
  // per-test tx wiring (mockImplementation/mockImplementationOnce) in effect.
  const mockNumberingService = {
    runWithGeneratedNumber: jest.fn(
      async (_model: any, _orgId: any, _opts: any, create: any) =>
        mockPrismaService.$transaction((tx: any) => create(tx, 'P-2026-0001')),
    ),
    validateManualNumber: jest.fn(async (_o: any, _m: any, value: string) =>
      value.trim(),
    ),
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

  const mockProject = {
    id: 'project-1',
    orgId: 'org-1',
    projectNumber: 'P-2026-0001',
    title: 'Test Project',
    status: ProjectStatus.ACTIEF,
    isDeleted: false,
    projectManagerId: 'user-1',
    contactId: 'contact-1',
    locationId: null,
    contact: { id: 'contact-1', type: 'COMPANY', companyName: 'ACME', firstName: null, lastName: null, email: 'acme@test.nl' },
    location: null,
    projectManager: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen', email: 'jan@test.nl', color: '#ff0000', initials: 'JJ' },
    createdByUser: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen', email: 'jan@test.nl' },
    _count: { requests: 0, quotes: 0, planningItems: 0 },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: NumberingService, useValue: mockNumberingService },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    beforeEach(() => {
      mockPrismaService.project.findMany.mockResolvedValue([]);
      mockPrismaService.project.count.mockResolvedValue(0);
    });

    it('should return paginated projects for org user', async () => {
      mockPrismaService.project.findMany.mockResolvedValue([mockProject]);
      mockPrismaService.project.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, {} as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(25);
    });

    it('should filter by orgId for non-superuser', async () => {
      await service.findAll(mockUser, {} as any);

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      await service.findAll(mockSuperuser, {} as any);

      const call = mockPrismaService.project.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by status when provided', async () => {
      await service.findAll(mockUser, { status: ProjectStatus.ACTIEF } as any);

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: ProjectStatus.ACTIEF }),
        }),
      );
    });

    it('should filter by contactId when provided', async () => {
      await service.findAll(mockUser, { contactId: 'contact-1' } as any);

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ contactId: 'contact-1' }),
        }),
      );
    });

    it('should filter by projectManagerId when provided', async () => {
      await service.findAll(mockUser, { projectManagerId: 'user-1' } as any);

      expect(mockPrismaService.project.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectManagerId: 'user-1' }),
        }),
      );
    });

    it('should apply search filter across title, projectNumber and contact fields', async () => {
      await service.findAll(mockUser, { search: 'acme' } as any);

      const call = mockPrismaService.project.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ title: { contains: 'acme', mode: 'insensitive' } }),
          expect.objectContaining({ projectNumber: { contains: 'acme', mode: 'insensitive' } }),
        ]),
      );
    });

    it('should only return non-deleted projects', async () => {
      await service.findAll(mockUser, {} as any);

      const call = mockPrismaService.project.findMany.mock.calls[0][0];
      expect(call.where.isDeleted).toBe(false);
    });

    it('should cap limit at 100', async () => {
      await service.findAll(mockUser, { limit: 500 } as any);

      const call = mockPrismaService.project.findMany.mock.calls[0][0];
      expect(call.take).toBe(100);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a project by id', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);

      const result = await service.findOne('project-1', mockUser);

      expect(result.id).toBe('project-1');
      expect(mockPrismaService.project.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'project-1' } }),
      );
    });

    it('should throw NotFoundException when project does not exist', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when project is soft-deleted', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({ ...mockProject, isDeleted: true });

      await expect(service.findOne('project-1', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when project belongs to a different org', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({ ...mockProject, orgId: 'other-org' });

      await expect(service.findOne('project-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPERUSER to access project from any org', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({ ...mockProject, orgId: 'other-org' });

      const result = await service.findOne('project-1', mockSuperuser);

      expect(result.id).toBe('project-1');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    beforeEach(() => {
      // FK cross-tenant guards resolve to same-org entities for the happy path
      mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });
      // $transaction calls the callback with a mock tx client
      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        const mockTx = {
          project: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockProject),
          },
          request: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
          },
          quote: {
            update: jest.fn().mockResolvedValue({}),
            updateMany: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
          },
          planningItem: {
            updateMany: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(mockTx);
      });
    });

    it('should create a project and dispatch a notification', async () => {
      const dto = { title: 'New Project', contactId: 'contact-1' } as any;

      const result = await service.create(dto, mockUser);

      expect(result.id).toBe('project-1');
      expect(mockNotificationsService.dispatch).toHaveBeenCalled();
    });

    it('should use the current user as project manager when none specified', async () => {
      // Capture the tx mock created in beforeEach so we can assert on its calls
      let capturedTxProject: jest.Mock | undefined;
      mockPrismaService.$transaction.mockImplementationOnce(async (cb: any) => {
        const mockTx = {
          project: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockProject),
          },
          request: { update: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
          quote: { update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
          planningItem: { updateMany: jest.fn().mockResolvedValue({}) },
        };
        capturedTxProject = mockTx.project.create;
        return cb(mockTx);
      });

      await service.create({ title: 'New Project', contactId: 'contact-1' } as any, mockUser);

      expect(capturedTxProject).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ projectManagerId: 'user-1' }),
        }),
      );
    });

    it('should generate a sequential project number', async () => {
      const dto = { title: 'New Project', contactId: 'contact-1' } as any;

      await service.create(dto, mockUser);

      // Check transaction was called
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  // ─── update ──────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('should update a project and return the updated record', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      const updatedProject = { ...mockProject, title: 'Updated Title' };
      mockPrismaService.project.update.mockResolvedValue(updatedProject);
      mockPrismaService.projectFollower.findMany.mockResolvedValue([]);

      const result = await service.update('project-1', { title: 'Updated Title' } as any, mockUser);

      expect(mockPrismaService.project.update).toHaveBeenCalled();
      expect(result.title).toBe('Updated Title');
    });

    it('should throw NotFoundException for a non-existent project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', { title: 'Updated' } as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-org update', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({ ...mockProject, orgId: 'other-org' });

      await expect(
        service.update('project-1', { title: 'hack' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should auto-set endDate when status is changed to AFGEROND', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.project.update.mockResolvedValue({
        ...mockProject,
        status: ProjectStatus.AFGEROND,
        endDate: new Date(),
      });
      mockPrismaService.projectFollower.findMany.mockResolvedValue([]);

      await service.update('project-1', { status: ProjectStatus.AFGEROND } as any, mockUser);

      const updateCall = mockPrismaService.project.update.mock.calls[0][0];
      expect(updateCall.data.endDate).toBeDefined();
    });

    it('should dispatch status change notification to followers and project manager', async () => {
      const projectWithDifferentManager = { ...mockProject, projectManagerId: 'user-2' };
      mockPrismaService.project.findUnique.mockResolvedValue(projectWithDifferentManager);
      mockPrismaService.project.update.mockResolvedValue({
        ...projectWithDifferentManager,
        status: ProjectStatus.AFGEROND,
      });
      mockPrismaService.projectFollower.findMany.mockResolvedValue([
        { userId: 'user-3' },
      ]);

      await service.update('project-1', { status: ProjectStatus.AFGEROND } as any, mockUser);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserIds: expect.arrayContaining(['user-2', 'user-3']),
        }),
      );
    });

    it('should NOT dispatch notification when status is unchanged', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.project.update.mockResolvedValue(mockProject);

      await service.update('project-1', { title: 'New title only' } as any, mockUser);

      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });
  });

  // ─── remove ──────────────────────────────────────────────────────────────────

  describe('remove', () => {
    it('should soft-delete a project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.project.update.mockResolvedValue({});

      await service.remove('project-1', mockUser);

      expect(mockPrismaService.project.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'project-1' },
          data: expect.objectContaining({ isDeleted: true }),
        }),
      );
    });

    it('should throw NotFoundException for a non-existent project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-org delete', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue({ ...mockProject, orgId: 'other-org' });

      await expect(service.remove('project-1', mockUser)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── addFollower ─────────────────────────────────────────────────────────────

  describe('addFollower', () => {
    it('should add an internal follower by userId with all permissions', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findFirst.mockResolvedValue(null);
      const newFollower = {
        id: 'follower-1',
        projectId: 'project-1',
        userId: 'user-2',
        email: null,
        canViewGeneral: true,
        canViewRequests: true,
        canViewQuotes: true,
        canViewPlanning: true,
        canViewDocuments: true,
        user: { id: 'user-2', firstName: 'Piet', lastName: 'Pietersen', email: 'piet@test.nl', color: null, initials: 'PP' },
      };
      mockPrismaService.projectFollower.create.mockResolvedValue(newFollower);

      const result = await service.addFollower('project-1', { userId: 'user-2' } as any, mockUser);

      expect(mockPrismaService.projectFollower.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            canViewGeneral: true,
            canViewRequests: true,
            canViewDocuments: true,
          }),
        }),
      );
      expect(result.userId).toBe('user-2');
    });

    it('should add an external follower by email with restricted defaults', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findFirst.mockResolvedValue(null);
      const externalFollower = {
        id: 'follower-2',
        projectId: 'project-1',
        userId: null,
        email: 'external@client.nl',
        canViewGeneral: true,
        canViewRequests: false,
        canViewDocuments: false,
        user: null,
      };
      mockPrismaService.projectFollower.create.mockResolvedValue(externalFollower);

      const result = await service.addFollower(
        'project-1',
        { email: 'external@client.nl' } as any,
        mockUser,
      );

      expect(mockPrismaService.projectFollower.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            canViewRequests: false,
            canViewDocuments: false,
          }),
        }),
      );
      expect(result.email).toBe('external@client.nl');
    });

    it('should throw BadRequestException when neither userId nor email is provided', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);

      await expect(
        service.addFollower('project-1', {} as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when userId follower already exists', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findFirst.mockResolvedValue({ id: 'existing-follower' });

      await expect(
        service.addFollower('project-1', { userId: 'user-2' } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when email follower already exists', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findFirst.mockResolvedValue({ id: 'existing-follower' });

      await expect(
        service.addFollower('project-1', { email: 'dup@test.nl' } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── removeFollower ──────────────────────────────────────────────────────────

  describe('removeFollower', () => {
    it('should remove a follower', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findUnique.mockResolvedValue({
        id: 'follower-1',
        projectId: 'project-1',
      });
      mockPrismaService.projectFollower.delete.mockResolvedValue({});

      await service.removeFollower('project-1', 'follower-1', mockUser);

      expect(mockPrismaService.projectFollower.delete).toHaveBeenCalledWith({
        where: { id: 'follower-1' },
      });
    });

    it('should throw NotFoundException when follower does not exist', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findUnique.mockResolvedValue(null);

      await expect(
        service.removeFollower('project-1', 'nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when follower belongs to a different project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      mockPrismaService.projectFollower.findUnique.mockResolvedValue({
        id: 'follower-1',
        projectId: 'other-project',
      });

      await expect(
        service.removeFollower('project-1', 'follower-1', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createFromRequest ───────────────────────────────────────────────────────

  describe('createFromRequest', () => {
    it('should throw NotFoundException when request does not exist', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(null);

      await expect(service.createFromRequest('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException when request is already linked to a project', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue({
        id: 'req-1',
        orgId: 'org-1',
        projectId: 'existing-project',
        contact: { id: 'c-1', companyName: 'ACME', firstName: null, lastName: null },
      });

      await expect(service.createFromRequest('req-1', mockUser)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw ForbiddenException when request belongs to a different org', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue({
        id: 'req-1',
        orgId: 'other-org',
        projectId: null,
        contact: { id: 'c-1', companyName: 'ACME', firstName: null, lastName: null },
      });

      await expect(service.createFromRequest('req-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should create a project from request and link the request', async () => {
      const mockRequest = {
        id: 'req-1',
        orgId: 'org-1',
        projectId: null,
        title: 'Inspect Building',
        contactId: 'contact-1',
        locationId: null,
        assignedTo: 'user-1',
        createdBy: 'user-1',
        contact: { id: 'contact-1', companyName: 'ACME', firstName: null, lastName: null },
      };
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequest);

      mockPrismaService.$transaction.mockImplementation(async (cb: any) => {
        const mockTx = {
          project: {
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({ ...mockProject, title: 'ACME - Inspect Building' }),
          },
          request: {
            update: jest.fn().mockResolvedValue({}),
            findMany: jest.fn().mockResolvedValue([]),
          },
          quote: {
            findMany: jest.fn().mockResolvedValue([]),
            updateMany: jest.fn().mockResolvedValue({}),
          },
          planningItem: {
            updateMany: jest.fn().mockResolvedValue({}),
          },
        };
        return cb(mockTx);
      });

      const result = await service.createFromRequest('req-1', mockUser);

      expect(result.title).toBe('ACME - Inspect Building');
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
    });
  });

  // ─── getLinkedRequests ────────────────────────────────────────────────────────

  describe('getLinkedRequests', () => {
    it('should return requests linked to a project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      const mockRequests = [{ id: 'req-1', title: 'Request 1' }];
      mockPrismaService.request.findMany.mockResolvedValue(mockRequests);

      const result = await service.getLinkedRequests('project-1', mockUser);

      expect(result).toHaveLength(1);
      expect(mockPrismaService.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'project-1', isDeleted: false }),
        }),
      );
    });
  });

  // ─── getLinkedQuotes ─────────────────────────────────────────────────────────

  describe('getLinkedQuotes', () => {
    it('should return quotes linked to a project', async () => {
      mockPrismaService.project.findUnique.mockResolvedValue(mockProject);
      const mockQuotes = [{ id: 'quote-1', quoteNumber: 'Q-2026-0001' }];
      mockPrismaService.quote.findMany.mockResolvedValue(mockQuotes);

      const result = await service.getLinkedQuotes('project-1', mockUser);

      expect(result).toHaveLength(1);
      expect(mockPrismaService.quote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ projectId: 'project-1' }),
        }),
      );
    });
  });
});
