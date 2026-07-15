import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import {
  Role,
  PlanningStatus,
  AcceptanceStatus,
  NotificationType,
  SessionStatus,
} from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PlanningService } from './planning.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { PlanningEmailService } from './planning-email.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { AvailabilityResolutionService } from '@/modules/availability/availability-resolution.service';
import { ConflictException } from '@nestjs/common';

describe('PlanningService', () => {
  let service: PlanningService;
  const mockAvailabilityService = {
    checkPlanningDay: jest.fn().mockResolvedValue([]),
  };

  const mockPrismaService = {
    planningItem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    planningInspector: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    planningSessionInspector: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      upsert: jest.fn(),
    },
    planningSession: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    planningHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    planningFollower: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    quoteLine: {
      findFirst: jest.fn(),
    },
    quote: {
      findUnique: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    location: {
      findUnique: jest.fn(),
    },
    contactPerson: {
      findUnique: jest.fn(),
    },
    product: {
      findUnique: jest.fn(),
    },
    document: {
      findMany: jest.fn(),
    },
    rescheduleRequest: {
      create: jest.fn(),
    },
  };

  const mockNotificationsService = {
    dispatch: jest.fn(),
  };

  const mockWorkOrdersService = {
    createFromPlanningItem: jest.fn(),
  };

  const mockPlanningEmailService = {
    sendConfirmation: jest.fn(),
    sendRescheduleNotification: jest.fn(),
    sendAcceptationRequest: jest.fn(),
    sendSessionConfirmation: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn().mockReturnValue('http://localhost:5173'),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    firstName: 'Admin',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    firstName: 'Super',
    lastName: 'User',
    roles: [Role.SUPERUSER],
  } as any;

  // A minimal planning item with all fields needed by PLANNING_INCLUDE
  const mockPlanningItem = {
    id: 'plan-1',
    orgId: 'org-1',
    contactId: 'contact-1',
    locationId: 'location-1',
    productName: 'NEN1010 Inspectie',
    status: PlanningStatus.NOG_TE_PLANNEN,
    isCancelled: false,
    isMultiDay: false,
    sessionCount: null,
    scheduledDate: new Date('2026-04-01T09:00:00Z'),
    durationHours: 2,
    internalNotes: null,
    labels: [],
    createdBy: 'user-1',
    quoteId: null,
    productId: null,
    publicToken: 'token-abc',
    replacesId: null,
    replacedById: null,
    originalDate: null,
    contact: {
      id: 'contact-1',
      type: 'COMPANY',
      companyName: 'ACME BV',
      firstName: null,
      lastName: null,
      email: 'acme@example.nl',
    },
    contactPerson: null,
    location: {
      id: 'location-1',
      name: 'Hoofdkantoor',
      street: 'Hoofdstraat',
      houseNumber: '1',
      city: 'Amsterdam',
      postalCode: '1000AA',
      lat: null,
      lng: null,
    },
    createdByUser: { id: 'user-1', firstName: 'Admin', lastName: 'User', email: 'admin@test.nl' },
    inspectors: [],
    followers: [],
    history: [],
    sessions: [],
    project: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlanningService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WorkOrdersService, useValue: mockWorkOrdersService },
        { provide: PlanningEmailService, useValue: mockPlanningEmailService },
        { provide: ConfigService, useValue: mockConfigService },
        {
          provide: EntitlementsService,
          useValue: { assertFeature: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: AvailabilityResolutionService, useValue: mockAvailabilityService },
      ],
    }).compile();

    service = module.get<PlanningService>(PlanningService);

    // Default FK-ownership checks resolve to the same org as mockUser
    mockPrismaService.contact.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.location.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.contactPerson.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.product.findUnique.mockResolvedValue({ orgId: 'org-1' });
    mockPrismaService.quote.findUnique.mockResolvedValue({ orgId: 'org-1' });

    // Default: geen beschikbaarheidsconflicten (PRD-12 §12.9)
    mockAvailabilityService.checkPlanningDay.mockResolvedValue([]);

    // Default: fire-and-forget services resolve quietly
    mockPrismaService.planningHistory.create.mockResolvedValue({});
    mockWorkOrdersService.createFromPlanningItem.mockResolvedValue(undefined);
    mockPlanningEmailService.sendConfirmation.mockResolvedValue(undefined);
    mockPlanningEmailService.sendRescheduleNotification.mockResolvedValue(undefined);
    mockPlanningEmailService.sendAcceptationRequest.mockResolvedValue(undefined);
    mockPlanningEmailService.sendSessionConfirmation.mockResolvedValue(undefined);
  });

  // ─── findAll ────────────────────────────────────────────────

  describe('findAll', () => {
    it('should return paginated planning items for org user', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([mockPlanningItem]);
      mockPrismaService.planningItem.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 25 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(mockPrismaService.planningItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1', isCancelled: false }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([]);
      mockPrismaService.planningItem.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 25 } as any);

      const call = mockPrismaService.planningItem.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by status', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([]);
      mockPrismaService.planningItem.count.mockResolvedValue(0);

      await service.findAll(mockUser, { status: PlanningStatus.GEPLAND, page: 1, limit: 25 } as any);

      expect(mockPrismaService.planningItem.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: PlanningStatus.GEPLAND }),
        }),
      );
    });

    it('should filter by contactId', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([]);
      mockPrismaService.planningItem.count.mockResolvedValue(0);

      await service.findAll(mockUser, { contactId: 'contact-99', page: 1, limit: 25 } as any);

      const call = mockPrismaService.planningItem.findMany.mock.calls[0][0];
      expect(call.where.contactId).toBe('contact-99');
    });

    it('should include cancelled items when showCancelled is true', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([]);
      mockPrismaService.planningItem.count.mockResolvedValue(0);

      await service.findAll(mockUser, { showCancelled: 'true', page: 1, limit: 25 } as any);

      const call = mockPrismaService.planningItem.findMany.mock.calls[0][0];
      expect(call.where.isCancelled).toBeUndefined();
    });

    it('should add search filter with AND condition when search >= 3 chars', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([]);
      mockPrismaService.planningItem.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'NEN', page: 1, limit: 25 } as any);

      const call = mockPrismaService.planningItem.findMany.mock.calls[0][0];
      expect(call.where.AND).toBeDefined();
      expect(call.where.AND[0].OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ productName: expect.any(Object) }),
        ]),
      );
    });

    it('should respect custom sortBy field', async () => {
      mockPrismaService.planningItem.findMany.mockResolvedValue([]);
      mockPrismaService.planningItem.count.mockResolvedValue(0);

      await service.findAll(mockUser, { sortBy: 'status', sortOrder: 'asc', page: 1, limit: 25 } as any);

      const call = mockPrismaService.planningItem.findMany.mock.calls[0][0];
      expect(call.orderBy).toEqual([{ status: 'asc' }]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────

  describe('findOne', () => {
    it('should return a planning item for org user', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);

      const result = await service.findOne('plan-1', mockUser);

      expect(result.id).toBe('plan-1');
    });

    it('should throw NotFoundException when item does not exist', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-org access', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        ...mockPlanningItem,
        orgId: 'other-org',
      });

      await expect(service.findOne('plan-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPERUSER to access any org', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        ...mockPlanningItem,
        orgId: 'other-org',
      });

      const result = await service.findOne('plan-1', mockSuperuser);

      expect(result.id).toBe('plan-1');
    });
  });

  // ─── create ─────────────────────────────────────────────────

  describe('create', () => {
    it('should create a single-day planning item', async () => {
      mockPrismaService.planningItem.create.mockResolvedValue(mockPlanningItem);
      // findOne is called after create
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);

      const dto = {
        contactId: 'contact-1',
        locationId: 'location-1',
        productName: 'NEN1010 Inspectie',
        scheduledDate: '2026-04-01T09:00:00Z',
      } as any;

      const result = await service.create(dto, mockUser);

      expect(result.id).toBe('plan-1');
      expect(mockPrismaService.planningItem.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            contactId: 'contact-1',
            productName: 'NEN1010 Inspectie',
            status: PlanningStatus.NOG_TE_PLANNEN,
            isMultiDay: false,
          }),
        }),
      );
    });

    it('should create a multi-day planning item and auto-create session stubs', async () => {
      const multiDayItem = { ...mockPlanningItem, isMultiDay: true, sessionCount: 3, scheduledDate: null };
      mockPrismaService.planningItem.create.mockResolvedValue(multiDayItem);
      mockPrismaService.planningSession.create.mockResolvedValue({});
      mockPrismaService.planningItem.findUnique.mockResolvedValue(multiDayItem);

      const dto = {
        contactId: 'contact-1',
        locationId: 'location-1',
        productName: 'NEN1010 Inspectie',
        isMultiDay: true,
        sessionCount: 3,
      } as any;

      await service.create(dto, mockUser);

      // Should create 3 sessions
      expect(mockPrismaService.planningSession.create).toHaveBeenCalledTimes(3);
    });

    it('should throw BadRequestException for multi-day with sessionCount < 2', async () => {
      const dto = {
        contactId: 'contact-1',
        locationId: 'location-1',
        productName: 'NEN1010 Inspectie',
        isMultiDay: true,
        sessionCount: 1,
      } as any;

      await expect(service.create(dto, mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ─────────────────────────────────────────────────

  describe('update', () => {
    it('should update a planning item', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      const updatedItem = { ...mockPlanningItem, internalNotes: 'Updated notes' };
      mockPrismaService.planningItem.update.mockResolvedValue(updatedItem);

      const result = await service.update('plan-1', { internalNotes: 'Updated notes' } as any, mockUser);

      expect(result.internalNotes).toBe('Updated notes');
      expect(mockPrismaService.planningItem.update).toHaveBeenCalled();
    });

    it('should dispatch AFSPRAAK_VERPLAATST notification when date changes with assigned inspectors', async () => {
      const itemWithInspectors = {
        ...mockPlanningItem,
        status: PlanningStatus.CONCEPT,
        inspectors: [{ userId: 'user-2' }],
      };
      mockPrismaService.planningItem.findUnique.mockResolvedValue(itemWithInspectors);
      const updatedItem = {
        ...itemWithInspectors,
        scheduledDate: new Date('2026-05-01T09:00:00Z'),
      };
      mockPrismaService.planningItem.update.mockResolvedValue(updatedItem);

      await service.update(
        'plan-1',
        { scheduledDate: '2026-05-01T09:00:00Z' } as any,
        mockUser,
      );

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.AFSPRAAK_VERPLAATST,
          recipientUserIds: ['user-2'],
        }),
      );
    });

    it('should not notify when date does not change', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.CONCEPT,
        inspectors: [{ userId: 'user-2' }],
      });
      mockPrismaService.planningItem.update.mockResolvedValue(mockPlanningItem);

      await service.update('plan-1', { internalNotes: 'Some note' } as any, mockUser);

      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    it('should throw ForbiddenException for cross-org update', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        ...mockPlanningItem,
        orgId: 'other-org',
      });

      await expect(
        service.update('plan-1', { productName: 'Hack' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── assignInspectors ───────────────────────────────────────

  describe('assignInspectors', () => {
    it('should assign inspectors and advance status from NOG_TE_PLANNEN to CONCEPT', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.planningInspector.deleteMany.mockResolvedValue({});
      mockPrismaService.planningInspector.upsert.mockResolvedValue({});
      mockPrismaService.planningItem.update.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.CONCEPT,
      });
      mockPrismaService.user.findMany.mockResolvedValue([
        { email: 'inspector@test.nl', firstName: 'Jan', lastName: 'Inspecteur' },
      ]);
      mockPrismaService.organization.findUnique.mockResolvedValue({ name: 'Test Org' });
      // For the final findOne call
      const conceptItem = {
        ...mockPlanningItem,
        status: PlanningStatus.CONCEPT,
        inspectors: [{ userId: 'inspector-1' }],
      };
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(mockPlanningItem)  // findOne in assignInspectors
        .mockResolvedValueOnce(conceptItem);       // final findOne

      const dto = { inspectorIds: ['inspector-1'], primaryInspectorId: 'inspector-1' } as any;

      await service.assignInspectors('plan-1', dto, mockUser);

      expect(mockPrismaService.planningInspector.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.planningItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: PlanningStatus.CONCEPT },
        }),
      );
    });

    it('should send notification to inspectors (excluding actor)', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.planningInspector.deleteMany.mockResolvedValue({});
      mockPrismaService.planningInspector.upsert.mockResolvedValue({});
      mockPrismaService.planningItem.update.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.CONCEPT,
      });
      mockPrismaService.user.findMany.mockResolvedValue([
        { email: 'inspector@test.nl', firstName: 'Jan', lastName: 'Janssen' },
      ]);
      mockPrismaService.organization.findUnique.mockResolvedValue({ name: 'Test Org' });
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(mockPlanningItem)
        .mockResolvedValueOnce(mockPlanningItem);

      const dto = { inspectorIds: ['user-2'], primaryInspectorId: 'user-2' } as any;

      await service.assignInspectors('plan-1', dto, mockUser);

      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: NotificationType.AFSPRAAK_ACCEPTATIE_VERZOEK,
          recipientUserIds: ['user-2'],
        }),
      );
    });

    it('should not notify when actor assigns only themselves', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.planningInspector.deleteMany.mockResolvedValue({});
      mockPrismaService.planningInspector.upsert.mockResolvedValue({});
      mockPrismaService.planningItem.update.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.CONCEPT,
      });
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(mockPlanningItem)
        .mockResolvedValueOnce(mockPlanningItem);

      const dto = { inspectorIds: ['user-1'], primaryInspectorId: 'user-1' } as any;

      await service.assignInspectors('plan-1', dto, mockUser);

      expect(mockNotificationsService.dispatch).not.toHaveBeenCalled();
    });

    // ─── PRD-12 §12.9: beschikbaarheids-soft-check ─────────────

    it('throws ConflictException with warnings when an inspector is unavailable and no override', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-2', firstName: 'Tom', lastName: 'Visser' },
      ]);
      mockAvailabilityService.checkPlanningDay.mockResolvedValue([
        { userId: 'user-2', date: '2026-04-01', reason: 'Verlof — hele dag geblokkeerd' },
      ]);

      const dto = { inspectorIds: ['user-2'], primaryInspectorId: 'user-2' } as any;

      await expect(service.assignInspectors('plan-1', dto, mockUser)).rejects.toThrow(ConflictException);
      // The write must be aborted — no inspector upsert happened.
      expect(mockPrismaService.planningInspector.upsert).not.toHaveBeenCalled();

      try {
        await service.assignInspectors('plan-1', dto, mockUser);
      } catch (err: any) {
        const body = err.getResponse();
        expect(body.warnings).toEqual([
          { userId: 'user-2', name: 'Tom Visser', date: '2026-04-01', reason: 'Verlof — hele dag geblokkeerd' },
        ]);
      }
    });

    it('assigns and writes an AVAILABILITY_OVERRIDE history record when override is set', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(mockPlanningItem) // findOne
        .mockResolvedValueOnce(mockPlanningItem); // final findOne
      mockPrismaService.planningInspector.deleteMany.mockResolvedValue({});
      mockPrismaService.planningInspector.upsert.mockResolvedValue({});
      mockPrismaService.planningItem.update.mockResolvedValue({ ...mockPlanningItem, status: PlanningStatus.CONCEPT });
      mockPrismaService.organization.findUnique.mockResolvedValue({ name: 'Test Org' });
      // Serves all three user.findMany calls: org-check, availability names, notify emails.
      mockPrismaService.user.findMany.mockResolvedValue([
        { id: 'user-2', firstName: 'Tom', lastName: 'Visser', email: 'tom@test.nl' },
      ]);
      mockAvailabilityService.checkPlanningDay.mockResolvedValue([
        { userId: 'user-2', date: '2026-04-01', reason: 'Verlof — hele dag geblokkeerd' },
      ]);

      const dto = {
        inspectorIds: ['user-2'],
        primaryInspectorId: 'user-2',
        overrideAvailabilityWarnings: true,
      } as any;

      await service.assignInspectors('plan-1', dto, mockUser);

      expect(mockPrismaService.planningInspector.upsert).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.planningHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ action: 'AVAILABILITY_OVERRIDE' }),
        }),
      );
    });

    it('does not check availability when the item has no scheduledDate', async () => {
      const noDateItem = { ...mockPlanningItem, scheduledDate: null };
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(noDateItem)
        .mockResolvedValueOnce(noDateItem);
      mockPrismaService.planningInspector.deleteMany.mockResolvedValue({});
      mockPrismaService.planningInspector.upsert.mockResolvedValue({});
      mockPrismaService.planningItem.update.mockResolvedValue({ ...noDateItem, status: PlanningStatus.CONCEPT });

      const dto = { inspectorIds: ['user-1'], primaryInspectorId: 'user-1' } as any;

      await service.assignInspectors('plan-1', dto, mockUser);

      expect(mockAvailabilityService.checkPlanningDay).not.toHaveBeenCalled();
    });
  });

  // ─── acceptPlanning ─────────────────────────────────────────

  describe('acceptPlanning', () => {
    it('should accept a planning item and notify creator', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce({ isMultiDay: false })  // guard check
        .mockResolvedValueOnce({ orgId: 'org-1', createdBy: 'user-creator', productName: 'NEN' }) // notify check
        .mockResolvedValueOnce({ ...mockPlanningItem }); // checkAllAccepted findUnique

      mockPrismaService.planningInspector.findUnique.mockResolvedValue({
        planningItemId: 'plan-1',
        userId: 'user-inspector',
        acceptanceStatus: AcceptanceStatus.PENDING,
      });
      mockPrismaService.planningInspector.update.mockResolvedValue({});
      mockPrismaService.planningInspector.findMany.mockResolvedValue([
        { acceptanceStatus: AcceptanceStatus.ACCEPTED },
      ]);

      const inspectorUser = { ...mockUser, id: 'user-inspector' };

      await service.acceptPlanning('plan-1', inspectorUser);

      expect(mockPrismaService.planningInspector.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ acceptanceStatus: AcceptanceStatus.ACCEPTED }),
        }),
      );
    });

    it('should throw ForbiddenException when user is not assigned', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({ isMultiDay: false });
      mockPrismaService.planningInspector.findUnique.mockResolvedValue(null);

      await expect(service.acceptPlanning('plan-1', mockUser)).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when already responded', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({ isMultiDay: false });
      mockPrismaService.planningInspector.findUnique.mockResolvedValue({
        planningItemId: 'plan-1',
        userId: 'user-1',
        acceptanceStatus: AcceptanceStatus.ACCEPTED,
      });

      await expect(service.acceptPlanning('plan-1', mockUser)).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException for multi-day item', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({ isMultiDay: true });

      await expect(service.acceptPlanning('plan-1', mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── rejectPlanning ─────────────────────────────────────────

  describe('rejectPlanning', () => {
    it('should reject a planning item and notify creator', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce({ isMultiDay: false })
        .mockResolvedValueOnce({ orgId: 'org-1', createdBy: 'user-creator', productName: 'NEN' });

      mockPrismaService.planningInspector.findUnique.mockResolvedValue({
        planningItemId: 'plan-1',
        userId: 'user-inspector',
        acceptanceStatus: AcceptanceStatus.PENDING,
      });
      mockPrismaService.planningInspector.update.mockResolvedValue({});

      const inspectorUser = { ...mockUser, id: 'user-inspector' };

      await service.rejectPlanning('plan-1', { reason: 'Niet beschikbaar' }, inspectorUser);

      expect(mockPrismaService.planningInspector.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            acceptanceStatus: AcceptanceStatus.REJECTED,
            rejectionNote: 'Niet beschikbaar',
          }),
        }),
      );
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.AFSPRAAK_GEWEIGERD }),
      );
    });

    it('should throw ForbiddenException when not assigned', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({ isMultiDay: false });
      mockPrismaService.planningInspector.findUnique.mockResolvedValue(null);

      await expect(
        service.rejectPlanning('plan-1', { reason: 'test' }, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException for multi-day item', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({ isMultiDay: true });

      await expect(
        service.rejectPlanning('plan-1', { reason: 'test' }, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── completePlanning ───────────────────────────────────────

  describe('completePlanning', () => {
    it('should mark planning item as AFGEROND', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.planningItem.update.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.AFGEROND,
      });

      await service.completePlanning('plan-1', mockUser);

      expect(mockPrismaService.planningItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: PlanningStatus.AFGEROND },
        }),
      );
    });

    it('should throw BadRequestException when already AFGEROND', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.AFGEROND,
      });

      await expect(service.completePlanning('plan-1', mockUser)).rejects.toThrow(BadRequestException);
    });
  });

  // ─── updatePlanningStatus ───────────────────────────────────

  describe('updatePlanningStatus', () => {
    it('should update planning status and return updated item', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(mockPlanningItem) // findOne
        .mockResolvedValueOnce({ ...mockPlanningItem, status: PlanningStatus.GEPLAND }); // final findOne

      mockPrismaService.planningItem.update.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.GEPLAND,
      });

      const result = await service.updatePlanningStatus(
        'plan-1',
        { status: PlanningStatus.GEPLAND },
        mockUser,
      );

      expect(mockPrismaService.planningItem.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PlanningStatus.GEPLAND } }),
      );
    });

    it('should throw BadRequestException when status is unchanged', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);

      await expect(
        service.updatePlanningStatus(
          'plan-1',
          { status: PlanningStatus.NOG_TE_PLANNEN },
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should auto-create work order when transitioning to GEPLAND', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(mockPlanningItem) // findOne
        .mockResolvedValueOnce({ ...mockPlanningItem, status: PlanningStatus.GEPLAND }); // final findOne

      mockPrismaService.planningItem.update.mockResolvedValue({
        ...mockPlanningItem,
        status: PlanningStatus.GEPLAND,
      });

      await service.updatePlanningStatus(
        'plan-1',
        { status: PlanningStatus.GEPLAND },
        mockUser,
      );

      expect(mockWorkOrdersService.createFromPlanningItem).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'plan-1' }),
      );
    });
  });

  // ─── reschedulePlanning ─────────────────────────────────────

  describe('reschedulePlanning', () => {
    it('should cancel existing item and create a new replacement', async () => {
      const singleDayItem = { ...mockPlanningItem, isMultiDay: false };
      // reschedulePlanning calls findOne (→ findUnique once) then doSendRescheduleEmails (→ findUnique once)
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(singleDayItem)  // findOne
        .mockResolvedValueOnce(null);           // fullItem fetch in doSendRescheduleEmails (null → skip emails)

      mockPrismaService.planningItem.update.mockResolvedValue({});
      const newItem = { ...mockPlanningItem, id: 'plan-new', publicToken: 'token-new' };
      mockPrismaService.planningItem.create.mockResolvedValue(newItem);

      const dto = { reason: 'Klant verzoek' } as any;

      const result = await service.reschedulePlanning('plan-1', dto, mockUser);

      expect(mockPrismaService.planningItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCancelled: true,
            status: PlanningStatus.VERVALLEN,
          }),
        }),
      );
      expect(result.id).toBe('plan-new');
    });

    it('should throw BadRequestException for multi-day items', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        ...mockPlanningItem,
        isMultiDay: true,
      });

      await expect(
        service.reschedulePlanning('plan-1', { reason: 'test' } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });
  });

});
