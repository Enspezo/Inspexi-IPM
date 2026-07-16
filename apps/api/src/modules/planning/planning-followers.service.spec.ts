import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role, PlanningStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PlanningFollowersService } from './planning-followers.service';
import { PlanningService } from './planning.service';
import { PrismaService } from '@/prisma';
import { NotificationsService } from '../notifications/notifications.service';
import { WorkOrdersService } from '../work-orders/work-orders.service';
import { PlanningEmailService } from './planning-email.service';
import { EntitlementsService } from '@/modules/entitlements/entitlements.service';
import { AvailabilityResolutionService } from '@/modules/availability/availability-resolution.service';

describe('PlanningFollowersService', () => {
  let service: PlanningFollowersService;

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
    planningFollower: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
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
        PlanningFollowersService,
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

    service = module.get<PlanningFollowersService>(PlanningFollowersService);

    // Default: fire-and-forget services resolve quietly
    mockPrismaService.planningHistory.create.mockResolvedValue({});
  });

  // ─── addFollower ────────────────────────────────────────────

  describe('addFollower', () => {
    it('should add a follower by userId', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.planningFollower.findFirst.mockResolvedValue(null);
      const newFollower = {
        id: 'follower-1',
        planningItemId: 'plan-1',
        userId: 'user-2',
        email: null,
        name: null,
        user: { id: 'user-2', firstName: 'User', lastName: 'Two', email: 'user2@test.nl' },
      };
      mockPrismaService.planningFollower.create.mockResolvedValue(newFollower);

      const result = await service.addFollower(
        'plan-1',
        { userId: 'user-2' } as any,
        mockUser,
      );

      expect(result.userId).toBe('user-2');
    });

    it('should throw BadRequestException when neither userId nor email is provided', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);

      await expect(
        service.addFollower('plan-1', {} as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when follower already exists', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-1' });
      mockPrismaService.planningFollower.findFirst.mockResolvedValue({ id: 'follower-existing' });

      await expect(
        service.addFollower('plan-1', { userId: 'user-2' } as any, mockUser),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject a follower userId from another organization', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      // The referenced user lives in a different org.
      mockPrismaService.user.findUnique.mockResolvedValue({ orgId: 'org-2' });

      await expect(
        service.addFollower('plan-1', { userId: 'foreign-user' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
      expect(mockPrismaService.planningFollower.create).not.toHaveBeenCalled();
    });
  });

  // ─── removeFollower ─────────────────────────────────────────

  describe('removeFollower', () => {
    it('should remove a follower', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.planningFollower.findUnique.mockResolvedValue({
        id: 'follower-1',
        planningItemId: 'plan-1',
      });
      mockPrismaService.planningFollower.delete.mockResolvedValue({});

      await service.removeFollower('plan-1', 'follower-1', mockUser);

      expect(mockPrismaService.planningFollower.delete).toHaveBeenCalledWith({
        where: { id: 'follower-1' },
      });
    });

    it('should throw NotFoundException when follower does not exist', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      mockPrismaService.planningFollower.findUnique.mockResolvedValue(null);

      await expect(
        service.removeFollower('plan-1', 'nonexistent', mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
