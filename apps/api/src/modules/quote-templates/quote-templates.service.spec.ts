import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { QuoteTemplatesService } from './quote-templates.service';
import { PrismaService } from '@/prisma';

describe('QuoteTemplatesService', () => {
  let service: QuoteTemplatesService;
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

  const mockTemplate = {
    id: 'template-1',
    orgId: 'org-1',
    name: 'Standaard Inspectie Offerte',
    coverBlocks: [{ type: 'text', content: 'Cover' }],
    contentBlocks: [{ type: 'text', content: 'Content' }],
    closingBlocks: [{ type: 'text', content: 'Closing' }],
    defaultValidityDays: 30,
    requiresApproval: false,
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockPrismaService = {
    quoteTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteTemplatesService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<QuoteTemplatesService>(QuoteTemplatesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated results with correct structure', async () => {
      const templates = [mockTemplate];
      mockPrismaService.quoteTemplate.findMany.mockResolvedValue(templates);
      mockPrismaService.quoteTemplate.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { isActive: true, page: 1, limit: 20 });

      expect(result).toEqual({
        data: templates,
        total: 1,
        page: 1,
        limit: 20,
      });
      expect(mockPrismaService.quoteTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isActive: true,
            orgId: 'org-1',
          }),
          orderBy: { name: 'asc' },
          skip: 0,
          take: 20,
        }),
      );
      expect(mockPrismaService.quoteTemplate.count).toHaveBeenCalledWith({
        where: expect.objectContaining({
          isActive: true,
          orgId: 'org-1',
        }),
      });
    });

    it('should bypass org-scoping for SUPERUSER', async () => {
      mockPrismaService.quoteTemplate.findMany.mockResolvedValue([]);
      mockPrismaService.quoteTemplate.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { isActive: true, page: 1, limit: 20 });

      const call = mockPrismaService.quoteTemplate.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
      expect(call.where.isActive).toBe(true);
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return template when found and same org', async () => {
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(
        mockTemplate,
      );

      const result = await service.findOne('template-1', mockUser);

      expect(result).toEqual(mockTemplate);
      expect(mockPrismaService.quoteTemplate.findUnique).toHaveBeenCalledWith({
        where: { id: 'template-1' },
      });
    });

    it('should throw NotFoundException when template not found', async () => {
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Template niet gevonden');
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create template with orgId from user', async () => {
      const createDto = {
        name: 'Nieuwe Template',
        coverBlocks: [{ type: 'heading', content: 'Titel' }],
        defaultValidityDays: 14,
        requiresApproval: true,
      };
      const createdTemplate = {
        ...mockTemplate,
        id: 'template-new',
        name: 'Nieuwe Template',
        defaultValidityDays: 14,
        requiresApproval: true,
      };
      mockPrismaService.quoteTemplate.create.mockResolvedValue(
        createdTemplate,
      );

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(createdTemplate);
      expect(mockPrismaService.quoteTemplate.create).toHaveBeenCalledWith({
        data: {
          orgId: 'org-1',
          name: 'Nieuwe Template',
          coverBlocks: [{ type: 'heading', content: 'Titel' }],
          contentBlocks: undefined,
          closingBlocks: undefined,
          defaultValidityDays: 14,
          requiresApproval: true,
        },
      });
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update template fields', async () => {
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(
        mockTemplate,
      );
      const updatedTemplate = {
        ...mockTemplate,
        name: 'Bijgewerkte Template',
        defaultValidityDays: 60,
      };
      mockPrismaService.quoteTemplate.update.mockResolvedValue(
        updatedTemplate,
      );

      const result = await service.update(
        'template-1',
        { name: 'Bijgewerkte Template', defaultValidityDays: 60 },
        mockUser,
      );

      expect(result.name).toBe('Bijgewerkte Template');
      expect(result.defaultValidityDays).toBe(60);
      expect(mockPrismaService.quoteTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        data: {
          name: 'Bijgewerkte Template',
          defaultValidityDays: 60,
        },
      });
    });
  });

  // ─── deactivate ──────────────────────────────────────────────────────

  describe('deactivate()', () => {
    it('should set isActive to false', async () => {
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(
        mockTemplate,
      );
      const deactivatedTemplate = { ...mockTemplate, isActive: false };
      mockPrismaService.quoteTemplate.update.mockResolvedValue(
        deactivatedTemplate,
      );

      const result = await service.deactivate('template-1', mockUser);

      expect(result.isActive).toBe(false);
      expect(mockPrismaService.quoteTemplate.update).toHaveBeenCalledWith({
        where: { id: 'template-1' },
        data: { isActive: false },
      });
    });
  });

  // ─── ForbiddenException cross-org ────────────────────────────────────

  describe('cross-org access', () => {
    it('should throw ForbiddenException when different org user accesses template', async () => {
      mockPrismaService.quoteTemplate.findUnique.mockResolvedValue(
        mockTemplate,
      );

      await expect(
        service.findOne('template-1', mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
