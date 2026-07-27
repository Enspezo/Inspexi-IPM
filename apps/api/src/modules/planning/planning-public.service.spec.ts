import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { PlanningStatus, NotificationType } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PlanningPublicService } from './planning-public.service';
import { PlanningService } from './planning.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { PlanningEmailService } from './planning-email.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { AvailabilityResolutionService } from '@/modules/availability/availability-resolution.service';

describe('PlanningPublicService', () => {
  let service: PlanningPublicService;

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
    planningHistory: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    quote: {
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
        PlanningPublicService,
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
        {
          provide: AvailabilityResolutionService,
          useValue: { checkPlanningDay: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<PlanningPublicService>(PlanningPublicService);

    // Default: fire-and-forget services resolve quietly
    mockPrismaService.planningHistory.create.mockResolvedValue({});
  });

  // ─── findByPublicToken ──────────────────────────────────────

  describe('findByPublicToken', () => {
    // Select-vormig resultaat zoals Prisma dat met de B-306-allowlist teruggeeft.
    const selectShapedItem = {
      id: 'plan-1',
      orgId: 'org-1',
      status: PlanningStatus.NOG_TE_PLANNEN,
      productName: 'NEN1010 Inspectie',
      scheduledDate: new Date('2026-04-01T09:00:00Z'),
      durationHours: 2,
      isMultiDay: false,
      labels: [],
      contact: { id: 'contact-1', type: 'COMPANY', companyName: 'ACME BV', firstName: null, lastName: null },
      location: {
        id: 'location-1',
        name: 'Hoofdkantoor',
        street: 'Hoofdstraat',
        houseNumber: '1',
        city: 'Amsterdam',
        postalCode: '1000AA',
      },
      inspectors: [],
      organization: { id: 'org-1', name: 'Test', logoUrl: null, primaryColor: null },
      sessions: [],
    };

    it('should return a planning item by public token with documents', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(selectShapedItem)  // findByPublicToken
        .mockResolvedValueOnce({ id: 'plan-1', quoteId: null }); // getSharedDocuments
      // Org-modus voor inspecteur-contactresolutie (apart opgehaald, lekt niet naar de response).
      mockPrismaService.organization.findUnique.mockResolvedValue({
        inspectorPhoneDisplay: 'NONE',
        inspectorEmailDisplay: 'NONE',
        inspectorStaticPhone: null,
        inspectorStaticEmail: null,
      });
      mockPrismaService.document.findMany.mockResolvedValue([]);

      const result = await service.findByPublicToken('token-abc');

      expect(result.id).toBe('plan-1');
      expect(result.documents).toEqual([]);
    });

    it('B-306: gebruikt een expliciete select-allowlist zonder internalNotes en stript orgId', async () => {
      mockPrismaService.planningItem.findUnique
        .mockResolvedValueOnce(selectShapedItem)
        .mockResolvedValueOnce({ id: 'plan-1', quoteId: null });
      mockPrismaService.organization.findUnique.mockResolvedValue({
        inspectorPhoneDisplay: 'NONE',
        inspectorEmailDisplay: 'NONE',
        inspectorStaticPhone: null,
        inspectorStaticEmail: null,
      });
      mockPrismaService.document.findMany.mockResolvedValue([]);

      const result = await service.findByPublicToken('token-abc');

      // De query moet een select-allowlist gebruiken (geen include+spread meer)
      // en mag interne velden zoals internalNotes nooit opvragen.
      const queryArg = mockPrismaService.planningItem.findUnique.mock.calls[0][0];
      expect(queryArg.include).toBeUndefined();
      expect(queryArg.select).toBeDefined();
      expect(queryArg.select.internalNotes).toBeUndefined();
      expect(queryArg.select.createdBy).toBeUndefined();
      expect(queryArg.select.cancelReason).toBeUndefined();

      // orgId is intern (contactresolutie) en wordt uit de response gestript.
      expect(result).not.toHaveProperty('orgId');
      expect(result).not.toHaveProperty('internalNotes');
    });

    it('should throw NotFoundException for unknown token', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(null);

      await expect(service.findByPublicToken('unknown-token')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createRescheduleRequest ────────────────────────────────

  describe('createRescheduleRequest', () => {
    it('should create a reschedule request from public portal', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        createdBy: 'user-1',
        productName: 'NEN Inspectie',
        isCancelled: false,
      });
      mockPrismaService.rescheduleRequest.create.mockResolvedValue({ id: 'rr-1' });

      const dto = {
        clientName: 'Klant Naam',
        preferredDate: '2026-05-01',
        reason: 'Vakantie',
      } as any;

      const result = await service.createRescheduleRequest('token-abc', dto);

      expect(result.id).toBe('rr-1');
      expect(mockNotificationsService.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.AFSPRAAK_VERZETTEN_VERZOEK }),
      );
    });

    it('should throw NotFoundException for unknown token', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(null);

      await expect(
        service.createRescheduleRequest('bad-token', { preferredDate: '2026-05-01', reason: 'x' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when item is already cancelled', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        id: 'plan-1',
        orgId: 'org-1',
        createdBy: 'user-1',
        productName: 'NEN',
        isCancelled: true,
      });

      await expect(
        service.createRescheduleRequest('token-abc', { preferredDate: '2026-05-01', reason: 'x' } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
