import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import {
  Role,
  User,
  RequestStatus,
  RequestSource,
  Priority,
} from '@prisma/client';
import { RequestsService } from './requests.service';
import { PrismaService } from '@/prisma';
import { QuotesService } from '../quotes/quotes.service';
import { NotificationsService } from '@/modules/notifications/notifications.service';

describe('RequestsService', () => {
  let service: RequestsService;
  let prisma: PrismaService;

  const mockUser: User = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    role: Role.ORG_ADMIN,
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  };

  const mockSuperuser: User = {
    id: 'su-1',
    orgId: null,
    email: 'superuser@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Super',
    lastName: 'User',
    role: Role.SUPERUSER,
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  };

  const mockOtherOrgUser: User = {
    id: 'user-other',
    orgId: 'org-2',
    email: 'other@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Other',
    lastName: 'User',
    role: Role.ORG_ADMIN,
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  };

  const mockRequest = {
    id: 'request-1',
    orgId: 'org-1',
    contactId: 'contact-1',
    locationId: 'location-1',
    assignedTo: 'user-1',
    source: RequestSource.MANUAL,
    title: 'NEN1010 keuring kantoorpand',
    description: 'Inspectie aanvraag',
    priority: Priority.NORMAL,
    status: RequestStatus.NIEUW,
    createdBy: 'user-1',
    isDeleted: false,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockRequestWithIncludes = {
    ...mockRequest,
    contact: {
      id: 'contact-1',
      type: 'COMPANY',
      companyName: 'Acme B.V.',
      firstName: 'Jan',
      lastName: 'Jansen',
      email: 'jan@acme.nl',
    },
    location: {
      id: 'location-1',
      name: 'Hoofdkantoor',
      city: 'Amsterdam',
      street: 'Keizersgracht',
      houseNumber: '100',
      postalCode: '1015AA',
    },
    assignedUser: {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
    createdByUser: {
      id: 'user-1',
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@test.com',
    },
    statusHistory: [
      {
        id: 'history-1',
        requestId: 'request-1',
        fromStatus: null,
        toStatus: RequestStatus.NIEUW,
        changedBy: 'user-1',
        note: null,
        changedAt: new Date('2025-01-01'),
        changedByUser: {
          id: 'user-1',
          firstName: 'Admin',
          lastName: 'User',
          email: 'admin@test.com',
        },
      },
    ],
  };

  const mockContact = {
    id: 'contact-1',
    orgId: 'org-1',
    isDeleted: false,
  };

  const mockLocation = {
    id: 'location-1',
    contactId: 'contact-1',
  };

  // Transaction mock: executes the callback with a mock tx object
  const mockTx = {
    request: {
      create: jest.fn(),
      update: jest.fn(),
    },
    requestStatusHistory: {
      create: jest.fn(),
    },
  };

  const mockPrismaService = {
    request: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contact: {
      findUnique: jest.fn(),
    },
    location: {
      findUnique: jest.fn(),
    },
    requestStatusHistory: {
      create: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: PrismaService, useValue: mockPrismaService },
        {
          provide: QuotesService,
          useValue: { createFromRequest: jest.fn() },
        },
        {
          provide: NotificationsService,
          useValue: { dispatch: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated results with correct structure', async () => {
      const requests = [mockRequest];
      mockPrismaService.request.findMany.mockResolvedValue(requests);
      mockPrismaService.request.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(result).toEqual({ data: requests, total: 1, page: 1, limit: 20 });
      expect(mockPrismaService.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            isDeleted: false,
          }),
          orderBy: { createdAt: 'desc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(mockPrismaService.request.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          orgId: 'org-1',
          isDeleted: false,
        }),
      });
    });

    it('should filter by search term using OR on title and contact name', async () => {
      mockPrismaService.request.findMany.mockResolvedValue([]);
      mockPrismaService.request.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'keuring', page: 1, limit: 20 });

      expect(mockPrismaService.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            orgId: 'org-1',
            isDeleted: false,
            OR: [
              { title: { contains: 'keuring', mode: 'insensitive' } },
              {
                contact: {
                  OR: [
                    { companyName: { contains: 'keuring', mode: 'insensitive' } },
                    { firstName: { contains: 'keuring', mode: 'insensitive' } },
                    { lastName: { contains: 'keuring', mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }),
        }),
      );
    });

    it('should filter by status', async () => {
      mockPrismaService.request.findMany.mockResolvedValue([]);
      mockPrismaService.request.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        status: RequestStatus.IN_BEHANDELING,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: RequestStatus.IN_BEHANDELING,
          }),
        }),
      );
    });

    it('should filter by priority', async () => {
      mockPrismaService.request.findMany.mockResolvedValue([]);
      mockPrismaService.request.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        priority: Priority.HIGH,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            priority: Priority.HIGH,
          }),
        }),
      );
    });

    it('should filter by assignedTo', async () => {
      mockPrismaService.request.findMany.mockResolvedValue([]);
      mockPrismaService.request.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        assignedTo: 'user-1',
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.request.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            assignedTo: 'user-1',
          }),
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return request with all includes', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);

      const result = await service.findOne('request-1', mockUser);

      expect(result).toEqual(mockRequestWithIncludes);
      expect(mockPrismaService.request.findUnique).toHaveBeenCalledWith({
        where: { id: 'request-1' },
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
          location: {
            select: {
              id: true,
              name: true,
              city: true,
              street: true,
              houseNumber: true,
              postalCode: true,
            },
          },
          assignedUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          createdByUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          statusHistory: {
            include: {
              changedByUser: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
            orderBy: { changedAt: 'desc' },
          },
        },
      });
    });

    it('should throw NotFoundException when request not found', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Aanvraag niet gevonden');
    });

    it('should throw ForbiddenException when different org (non-SUPERUSER)', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);

      await expect(
        service.findOne('request-1', mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto = {
      contactId: 'contact-1',
      source: RequestSource.MANUAL,
      title: 'NEN1010 keuring kantoorpand',
      description: 'Inspectie aanvraag',
      priority: Priority.NORMAL as Priority | undefined,
    };

    it('should create request with initial status history entry via $transaction', async () => {
      const createdRequest = {
        id: 'request-new',
        orgId: 'org-1',
        ...createDto,
        status: RequestStatus.NIEUW,
        createdBy: 'user-1',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockTx.request.create.mockResolvedValue(createdRequest);
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(createdRequest);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.request.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          contactId: 'contact-1',
          locationId: undefined,
          assignedTo: undefined,
          source: RequestSource.MANUAL,
          title: 'NEN1010 keuring kantoorpand',
          description: 'Inspectie aanvraag',
          priority: Priority.NORMAL,
          createdBy: 'user-1',
        },
      });
      expect(mockTx.requestStatusHistory.create).toHaveBeenCalledWith({
        data: {
          requestId: 'request-new',
          fromStatus: null,
          toStatus: RequestStatus.NIEUW,
          changedBy: 'user-1',
        },
      });
    });

    it('should set orgId from user and default priority to NORMAL', async () => {
      const dtoWithoutPriority = {
        contactId: 'contact-1',
        source: RequestSource.WEB_FORM,
        title: 'Nieuwe aanvraag',
      };
      const createdRequest = {
        id: 'request-new',
        orgId: 'org-1',
        ...dtoWithoutPriority,
        priority: Priority.NORMAL,
        status: RequestStatus.NIEUW,
        createdBy: 'user-1',
        isDeleted: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockTx.request.create.mockResolvedValue(createdRequest);
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      await service.create(dtoWithoutPriority as any, mockUser);

      expect(mockTx.request.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          priority: Priority.NORMAL,
        }),
      });
    });

    it('should throw NotFoundException for invalid contactId', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(null);

      await expect(
        service.create(createDto, mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.create(createDto, mockUser),
      ).rejects.toThrow('Relatie niet gevonden');
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto = {
      title: 'Bijgewerkte titel',
      priority: Priority.HIGH,
    };

    it('should update request fields via spread pattern', async () => {
      const updatedRequest = {
        ...mockRequest,
        title: 'Bijgewerkte titel',
        priority: Priority.HIGH,
      };
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);
      mockPrismaService.request.update.mockResolvedValue(updatedRequest);

      const result = await service.update('request-1', updateDto, mockUser);

      expect(result.title).toBe('Bijgewerkte titel');
      expect(result.priority).toBe(Priority.HIGH);
      expect(mockPrismaService.request.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: {
          title: 'Bijgewerkte titel',
          priority: Priority.HIGH,
        },
      });
    });

    it('should throw ForbiddenException for cross-org access via findOne check', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);

      await expect(
        service.update('request-1', updateDto, mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);

      expect(mockPrismaService.request.update).not.toHaveBeenCalled();
    });
  });

  // ─── updateStatus ────────────────────────────────────────────────────

  describe('updateStatus()', () => {
    it('should update status and create history entry with from/to', async () => {
      const updatedRequest = {
        ...mockRequest,
        status: RequestStatus.IN_BEHANDELING,
      };
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);
      mockTx.request.update.mockResolvedValue(updatedRequest);
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      const result = await service.updateStatus(
        'request-1',
        { status: RequestStatus.IN_BEHANDELING },
        mockUser,
      );

      expect(result).toEqual(updatedRequest);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
      expect(mockTx.request.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { status: RequestStatus.IN_BEHANDELING },
      });
      expect(mockTx.requestStatusHistory.create).toHaveBeenCalledWith({
        data: {
          requestId: 'request-1',
          fromStatus: RequestStatus.NIEUW,
          toStatus: RequestStatus.IN_BEHANDELING,
          changedBy: 'user-1',
          note: undefined,
        },
      });
    });

    it('should include note in history entry when provided', async () => {
      const updatedRequest = {
        ...mockRequest,
        status: RequestStatus.ON_HOLD,
      };
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);
      mockTx.request.update.mockResolvedValue(updatedRequest);
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      await service.updateStatus(
        'request-1',
        { status: RequestStatus.ON_HOLD, note: 'Wacht op klant' },
        mockUser,
      );

      expect(mockTx.requestStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          note: 'Wacht op klant',
        }),
      });
    });

    it('should set changedBy to user.id in history entry', async () => {
      const updatedRequest = {
        ...mockRequest,
        status: RequestStatus.IN_BEHANDELING,
      };
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);
      mockTx.request.update.mockResolvedValue(updatedRequest);
      mockTx.requestStatusHistory.create.mockResolvedValue({});

      await service.updateStatus(
        'request-1',
        { status: RequestStatus.IN_BEHANDELING },
        mockUser,
      );

      expect(mockTx.requestStatusHistory.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          changedBy: 'user-1',
        }),
      });
    });
  });

  // ─── softDelete ──────────────────────────────────────────────────────

  describe('softDelete()', () => {
    it('should set isDeleted to true', async () => {
      const deletedRequest = { ...mockRequest, isDeleted: true };
      mockPrismaService.request.findUnique.mockResolvedValue(mockRequestWithIncludes);
      mockPrismaService.request.update.mockResolvedValue(deletedRequest);

      const result = await service.softDelete('request-1', mockUser);

      expect(result.isDeleted).toBe(true);
      expect(mockPrismaService.request.update).toHaveBeenCalledWith({
        where: { id: 'request-1' },
        data: { isDeleted: true },
      });
    });

    it('should throw NotFoundException for non-existent request', async () => {
      mockPrismaService.request.findUnique.mockResolvedValue(null);

      await expect(
        service.softDelete('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.softDelete('non-existent', mockUser),
      ).rejects.toThrow('Aanvraag niet gevonden');
    });
  });
});
