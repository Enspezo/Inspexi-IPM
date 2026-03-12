import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role, NotificationType, ErrorReportStatus } from '@prisma/client';
import { ErrorReportsService } from './error-reports.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';

describe('ErrorReportsService', () => {
  let service: ErrorReportsService;

  const mockPrismaService = {
    errorReport: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockOrgUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'user@test.nl',
    roles: [Role.BACKOFFICE],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  const mockReport = {
    id: 'report-1',
    orgId: 'org-1',
    userId: 'user-1',
    errorMessage: 'Something went wrong',
    stackTrace: 'Error at line 42',
    componentStack: null,
    userDescription: null,
    pageUrl: 'http://localhost:5173/dashboard',
    userAgent: 'Mozilla/5.0',
    metadata: null,
    status: ErrorReportStatus.OPEN,
    createdAt: new Date('2026-03-12T10:00:00Z'),
    user: { id: 'user-1', firstName: 'Jan', lastName: 'de Vries', email: 'user@test.nl' },
    organization: { id: 'org-1', name: 'Test Org', slug: 'testorg' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ErrorReportsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
      ],
    }).compile();

    service = module.get<ErrorReportsService>(ErrorReportsService);
  });

  describe('create', () => {
    it('should create an error report and return it', async () => {
      mockPrismaService.errorReport.create.mockResolvedValue(mockReport);
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'super-1' }]);

      const dto = {
        errorMessage: 'Something went wrong',
        stackTrace: 'Error at line 42',
        pageUrl: 'http://localhost:5173/dashboard',
        userAgent: 'Mozilla/5.0',
      };

      const result = await service.create(dto as any, mockOrgUser);

      expect(result.id).toBe('report-1');
      expect(mockPrismaService.errorReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            userId: 'user-1',
            errorMessage: 'Something went wrong',
          }),
        }),
      );
    });

    it('should dispatch notification to superusers when org user creates report', async () => {
      mockPrismaService.errorReport.create.mockResolvedValue(mockReport);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'super-1' },
        { id: 'super-2' },
      ]);

      await service.create({ errorMessage: 'Test error' } as any, mockOrgUser);

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            roles: { has: Role.SUPERUSER },
            isDeleted: false,
            isActive: true,
          }),
        }),
      );
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.FOUTMELDING_INGEDIEND,
          orgId: 'org-1',
          recipientUserIds: ['super-1', 'super-2'],
          entityType: 'ErrorReport',
          entityId: 'report-1',
        }),
      );
    });

    it('should NOT dispatch notification when superuser creates report', async () => {
      const superuserReport = { ...mockReport, orgId: null };
      mockPrismaService.errorReport.create.mockResolvedValue(superuserReport);

      await service.create({ errorMessage: 'Test error' } as any, mockSuperuser);

      expect(mockPrismaService.user.findMany).not.toHaveBeenCalled();
      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should NOT dispatch notification when no superusers found', async () => {
      mockPrismaService.errorReport.create.mockResolvedValue(mockReport);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.create({ errorMessage: 'Test error' } as any, mockOrgUser);

      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should store null for optional fields when not provided', async () => {
      mockPrismaService.errorReport.create.mockResolvedValue(mockReport);
      mockPrismaService.user.findMany.mockResolvedValue([]);

      await service.create({ errorMessage: 'Minimal error' } as any, mockOrgUser);

      expect(mockPrismaService.errorReport.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            stackTrace: null,
            componentStack: null,
            userDescription: null,
            pageUrl: null,
            userAgent: null,
            metadata: null,
          }),
        }),
      );
    });

    it('should truncate notification body to 120 characters of error message', async () => {
      const longMessage = 'A'.repeat(200);
      mockPrismaService.errorReport.create.mockResolvedValue({ ...mockReport, errorMessage: longMessage });
      mockPrismaService.user.findMany.mockResolvedValue([{ id: 'super-1' }]);

      await service.create({ errorMessage: longMessage } as any, mockOrgUser);

      const dispatchCall = mockNotificationsService.dispatch.mock.calls[0][0];
      // The service slices the message to 120 chars; the body prefix adds ~36 chars
      expect(dispatchCall.body).toContain('A'.repeat(120));
      expect(dispatchCall.body).not.toContain('A'.repeat(121));
    });
  });

  describe('findAll', () => {
    it('should return paginated error reports', async () => {
      mockPrismaService.errorReport.findMany.mockResolvedValue([mockReport]);
      mockPrismaService.errorReport.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should filter by status when provided', async () => {
      mockPrismaService.errorReport.findMany.mockResolvedValue([]);
      mockPrismaService.errorReport.count.mockResolvedValue(0);

      await service.findAll({ status: ErrorReportStatus.OPEN, page: 1, limit: 20 } as any);

      expect(mockPrismaService.errorReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: ErrorReportStatus.OPEN },
        }),
      );
    });

    it('should not filter by status when not provided', async () => {
      mockPrismaService.errorReport.findMany.mockResolvedValue([]);
      mockPrismaService.errorReport.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 } as any);

      const call = mockPrismaService.errorReport.findMany.mock.calls[0][0];
      expect(call.where).toEqual({});
    });

    it('should include user and organization in results', async () => {
      mockPrismaService.errorReport.findMany.mockResolvedValue([mockReport]);
      mockPrismaService.errorReport.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20 } as any);

      expect(mockPrismaService.errorReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            user: expect.objectContaining({ select: expect.any(Object) }),
            organization: expect.objectContaining({ select: expect.any(Object) }),
          }),
        }),
      );
    });

    it('should use default page and limit values', async () => {
      mockPrismaService.errorReport.findMany.mockResolvedValue([]);
      mockPrismaService.errorReport.count.mockResolvedValue(0);

      const result = await service.findAll({} as any);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('should sort by createdAt desc by default', async () => {
      mockPrismaService.errorReport.findMany.mockResolvedValue([]);
      mockPrismaService.errorReport.count.mockResolvedValue(0);

      await service.findAll({ page: 1, limit: 20 } as any);

      expect(mockPrismaService.errorReport.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a single error report by ID', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(mockReport);

      const result = await service.findOne('report-1');

      expect(result.id).toBe('report-1');
      expect(result.errorMessage).toBe('Something went wrong');
      expect(mockPrismaService.errorReport.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'report-1' } }),
      );
    });

    it('should throw NotFoundException when report does not exist', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });

    it('should include user and organization', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(mockReport);

      await service.findOne('report-1');

      expect(mockPrismaService.errorReport.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            user: expect.any(Object),
            organization: expect.any(Object),
          }),
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update the status of a report', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(mockReport);
      const updatedReport = { ...mockReport, status: ErrorReportStatus.IN_BEHANDELING };
      mockPrismaService.errorReport.update.mockResolvedValue(updatedReport);

      const result = await service.updateStatus('report-1', {
        status: ErrorReportStatus.IN_BEHANDELING,
      });

      expect(result.status).toBe(ErrorReportStatus.IN_BEHANDELING);
      expect(mockPrismaService.errorReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'report-1' },
          data: { status: ErrorReportStatus.IN_BEHANDELING },
        }),
      );
    });

    it('should update status to OPGELOST', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(mockReport);
      const updatedReport = { ...mockReport, status: ErrorReportStatus.OPGELOST };
      mockPrismaService.errorReport.update.mockResolvedValue(updatedReport);

      const result = await service.updateStatus('report-1', {
        status: ErrorReportStatus.OPGELOST,
      });

      expect(result.status).toBe(ErrorReportStatus.OPGELOST);
    });

    it('should throw NotFoundException when report does not exist', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus('nonexistent', { status: ErrorReportStatus.OPGELOST }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should include user and organization in updated report', async () => {
      mockPrismaService.errorReport.findUnique.mockResolvedValue(mockReport);
      mockPrismaService.errorReport.update.mockResolvedValue({
        ...mockReport,
        status: ErrorReportStatus.OPGELOST,
      });

      await service.updateStatus('report-1', { status: ErrorReportStatus.OPGELOST });

      expect(mockPrismaService.errorReport.update).toHaveBeenCalledWith(
        expect.objectContaining({
          include: expect.objectContaining({
            user: expect.any(Object),
            organization: expect.any(Object),
          }),
        }),
      );
    });
  });
});
