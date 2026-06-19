import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, User, ContactType, LogType } from '@prisma/client';
import { ContactsService } from './contacts.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

describe('ContactsService', () => {
  let service: ContactsService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Admin',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockSuperuser = {
    id: 'user-super',
    orgId: null,
    email: 'superuser@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Super',
    lastName: 'User',
    roles: [Role.SUPERUSER],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockOtherOrgUser = {
    id: 'user-other',
    orgId: 'org-2',
    email: 'other@test.com',
    passwordHash: '$2b$10$hashedpassword',
    firstName: 'Other',
    lastName: 'User',
    roles: [Role.ORG_ADMIN],
    isActive: true,
    emailVerifiedAt: new Date('2025-01-01'),
    createdAt: new Date('2025-01-01'),
  } as any;

  const mockContact = {
    id: 'contact-1',
    orgId: 'org-1',
    type: ContactType.COMPANY,
    companyName: 'Test BV',
    firstName: null,
    lastName: null,
    email: 'info@test.nl',
    phone: '+31 20 123 4567',
    website: null,
    vatNumber: null,
    cocNumber: null,
    notes: null,
    priceTableId: null,
    isDeleted: false,
    createdAt: new Date('2025-01-01'),
    addresses: [],
    locations: [],
    logs: [],
    emails: [],
  };

  const mockPrismaService = {
    contact: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contactAddress: {
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    location: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    contactLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    contactEmail: {
      create: jest.fn(),
    },
    organization: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailService = {
    sendContactEmail: jest.fn().mockResolvedValue({ id: 'resend-123' }),
  };

  const mockCustomFieldsValidator = {
    validateAndSanitize: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContactsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: CustomFieldsValidator, useValue: mockCustomFieldsValidator },
      ],
    }).compile();

    service = module.get<ContactsService>(ContactsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── findAll ─────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return paginated results with correct structure', async () => {
      const contacts = [mockContact];
      mockPrismaService.contact.findMany.mockResolvedValue(contacts);
      mockPrismaService.contact.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(result).toEqual({ data: contacts, total: 1, page: 1, limit: 20 });
      expect(mockPrismaService.contact.findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, orgId: 'org-1' },
        include: {
          addresses: true,
          owner: { select: { id: true, firstName: true, lastName: true } },
          customerGroups: {
            include: {
              customerGroup: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: 0,
        take: 20,
      });
      expect(mockPrismaService.contact.count).toHaveBeenCalledWith({
        where: { isDeleted: false, orgId: 'org-1' },
      });
    });

    it('should filter by search term using OR on companyName, firstName, lastName, email, phone and city', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([]);
      mockPrismaService.contact.count.mockResolvedValue(0);

      await service.findAll(mockUser, { search: 'test', page: 1, limit: 20 });

      expect(mockPrismaService.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isDeleted: false,
            orgId: 'org-1',
            OR: [
              { companyName: { contains: 'test', mode: 'insensitive' } },
              { firstName: { contains: 'test', mode: 'insensitive' } },
              { lastName: { contains: 'test', mode: 'insensitive' } },
              { email: { contains: 'test', mode: 'insensitive' } },
              { phone: { contains: 'test', mode: 'insensitive' } },
              { addresses: { some: { city: { contains: 'test', mode: 'insensitive' } } } },
            ],
          },
        }),
      );
    });

    it('should filter by type', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([]);
      mockPrismaService.contact.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        type: ContactType.INDIVIDUAL,
        page: 1,
        limit: 20,
      });

      expect(mockPrismaService.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            type: ContactType.INDIVIDUAL,
          }),
        }),
      );
    });

    it('should scope by orgId for non-SUPERUSER', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([]);
      mockPrismaService.contact.count.mockResolvedValue(0);

      await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(mockPrismaService.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should not add orgId filter for SUPERUSER', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([]);
      mockPrismaService.contact.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 });

      const calledWhere =
        mockPrismaService.contact.findMany.mock.calls[0][0].where;
      expect(calledWhere.orgId).toBeUndefined();
      expect(calledWhere.isDeleted).toBe(false);
    });

    it('should exclude soft-deleted contacts', async () => {
      mockPrismaService.contact.findMany.mockResolvedValue([]);
      mockPrismaService.contact.count.mockResolvedValue(0);

      await service.findAll(mockUser, { page: 1, limit: 20 });

      expect(mockPrismaService.contact.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ isDeleted: false }),
        }),
      );
    });
  });

  // ─── findOne ─────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return contact with all relations', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);

      const result = await service.findOne('contact-1', mockUser);

      expect(result).toEqual(mockContact);
      expect(mockPrismaService.contact.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'contact-1' },
          include: expect.objectContaining({
            addresses: true,
            owner: { select: { id: true, firstName: true, lastName: true } },
            locations: {
              include: {
                locationType: {
                  select: { id: true, code: true, name: true, color: true, icon: true },
                },
              },
            },
            logs: {
              include: { user: { select: { firstName: true, lastName: true } } },
              orderBy: { loggedAt: 'desc' },
            },
            emails: {
              include: { user: { select: { firstName: true, lastName: true } } },
              orderBy: { sentAt: 'desc' },
            },
          }),
        }),
      );
    });

    it('should throw NotFoundException for non-existent contact', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(null);

      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('non-existent', mockUser),
      ).rejects.toThrow('Relatie niet gevonden');
    });

    it('should throw NotFoundException for soft-deleted contact', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue({
        ...mockContact,
        isDeleted: true,
      });

      await expect(
        service.findOne('contact-1', mockUser),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.findOne('contact-1', mockUser),
      ).rejects.toThrow('Relatie niet gevonden');
    });

    it('should throw ForbiddenException when different org (non-SUPERUSER)', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);

      await expect(
        service.findOne('contact-1', mockOtherOrgUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow SUPERUSER to access any org contact', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);

      const result = await service.findOne('contact-1', mockSuperuser);

      expect(result).toEqual(mockContact);
    });
  });

  // ─── create ──────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto = {
      type: ContactType.COMPANY,
      companyName: 'New BV',
      email: 'new@test.nl',
      phone: '+31 20 999 0000',
    };

    it('should create contact with orgId from user', async () => {
      const createdContact = {
        id: 'contact-new',
        orgId: 'org-1',
        ...createDto,
        firstName: undefined,
        lastName: undefined,
        website: undefined,
        vatNumber: undefined,
        cocNumber: undefined,
        notes: undefined,
        isDeleted: false,
        createdAt: new Date(),
        addresses: [],
      };
      mockPrismaService.contact.create.mockResolvedValue(createdContact);

      const result = await service.create(createDto, mockUser);

      expect(result).toEqual(createdContact);
      expect(mockPrismaService.contact.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orgId: 'org-1',
          type: createDto.type,
          companyName: createDto.companyName,
          email: createDto.email,
          phone: createDto.phone,
        }),
        include: { addresses: true },
      });
    });

    it('should return created contact with addresses included', async () => {
      const createdContact = {
        id: 'contact-new',
        orgId: 'org-1',
        ...createDto,
        isDeleted: false,
        createdAt: new Date(),
        addresses: [],
      };
      mockPrismaService.contact.create.mockResolvedValue(createdContact);

      const result = await service.create(createDto, mockUser);

      expect(result.addresses).toEqual([]);
      expect(mockPrismaService.contact.create).toHaveBeenCalledWith(
        expect.objectContaining({ include: { addresses: true } }),
      );
    });
  });

  // ─── update ──────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto = {
      companyName: 'Updated BV',
      phone: '+31 20 111 2222',
    };

    it('should update contact fields', async () => {
      const updatedContact = {
        ...mockContact,
        companyName: 'Updated BV',
        phone: '+31 20 111 2222',
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contact.update.mockResolvedValue(updatedContact);

      const result = await service.update('contact-1', updateDto, mockUser);

      expect(result.companyName).toBe('Updated BV');
      expect(mockPrismaService.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: expect.objectContaining({
          companyName: 'Updated BV',
          phone: '+31 20 111 2222',
        }),
        include: { addresses: true },
      });
    });

    it('should call findOne first to verify access', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contact.update.mockResolvedValue(mockContact);

      await service.update('contact-1', updateDto, mockUser);

      expect(mockPrismaService.contact.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.contact.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─── softDelete ──────────────────────────────────────────────────────

  describe('softDelete()', () => {
    it('should set isDeleted to true', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contact.update.mockResolvedValue({
        ...mockContact,
        isDeleted: true,
      });

      await service.softDelete('contact-1', mockUser);

      expect(mockPrismaService.contact.update).toHaveBeenCalledWith({
        where: { id: 'contact-1' },
        data: { isDeleted: true },
      });
    });

    it('should call findOne first to verify access', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contact.update.mockResolvedValue({
        ...mockContact,
        isDeleted: true,
      });

      await service.softDelete('contact-1', mockUser);

      expect(mockPrismaService.contact.findUnique).toHaveBeenCalledTimes(1);
      expect(mockPrismaService.contact.update).toHaveBeenCalledTimes(1);
    });
  });

  // ─── addLog ──────────────────────────────────────────────────────────

  describe('addLog()', () => {
    const logDto = {
      type: LogType.PHONE,
      subject: 'Besproken offerte #123',
      body: 'Klant wil aanpassing in de prijs',
      loggedAt: '2026-02-22T14:00:00Z',
    };

    it('should create log with userId from current user', async () => {
      const createdLog = {
        id: 'log-1',
        contactId: 'contact-1',
        orgId: 'org-1',
        userId: 'user-1',
        type: LogType.PHONE,
        subject: logDto.subject,
        body: logDto.body,
        loggedAt: new Date(logDto.loggedAt!),
        createdAt: new Date(),
        user: { firstName: 'Admin', lastName: 'User' },
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactLog.create.mockResolvedValue(createdLog);

      const result = await service.addLog('contact-1', logDto, mockUser);

      expect(result).toEqual(createdLog);
      expect(mockPrismaService.contactLog.create).toHaveBeenCalledWith({
        data: {
          contactId: 'contact-1',
          orgId: 'org-1',
          userId: 'user-1',
          type: LogType.PHONE,
          subject: logDto.subject,
          body: logDto.body,
          loggedAt: new Date('2026-02-22T14:00:00Z'),
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      });
    });

    it('should use provided loggedAt date', async () => {
      const createdLog = {
        id: 'log-2',
        contactId: 'contact-1',
        orgId: 'org-1',
        userId: 'user-1',
        type: LogType.PHONE,
        subject: logDto.subject,
        body: logDto.body,
        loggedAt: new Date('2026-02-22T14:00:00Z'),
        user: { firstName: 'Admin', lastName: 'User' },
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactLog.create.mockResolvedValue(createdLog);

      await service.addLog('contact-1', logDto, mockUser);

      expect(mockPrismaService.contactLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            loggedAt: new Date('2026-02-22T14:00:00Z'),
          }),
        }),
      );
    });

    it('should default loggedAt to now() when not provided', async () => {
      const logDtoNoDate = {
        type: LogType.NOTE,
        subject: 'Quick note',
      };
      const createdLog = {
        id: 'log-3',
        contactId: 'contact-1',
        orgId: 'org-1',
        userId: 'user-1',
        type: LogType.NOTE,
        subject: 'Quick note',
        body: undefined,
        loggedAt: new Date(),
        user: { firstName: 'Admin', lastName: 'User' },
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactLog.create.mockResolvedValue(createdLog);

      await service.addLog('contact-1', logDtoNoDate, mockUser);

      const calledData =
        mockPrismaService.contactLog.create.mock.calls[0][0].data;
      expect(calledData.loggedAt).toBeInstanceOf(Date);
      // Should be approximately "now" (within 2 seconds)
      expect(calledData.loggedAt.getTime()).toBeCloseTo(Date.now(), -3);
    });
  });

  // ─── findLogs ────────────────────────────────────────────────────────

  describe('findLogs()', () => {
    it('should return logs for contact ordered by loggedAt desc', async () => {
      const logs = [
        {
          id: 'log-1',
          contactId: 'contact-1',
          type: LogType.PHONE,
          subject: 'Call',
          loggedAt: new Date('2026-02-22'),
          user: { firstName: 'Admin', lastName: 'User' },
        },
        {
          id: 'log-2',
          contactId: 'contact-1',
          type: LogType.NOTE,
          subject: 'Note',
          loggedAt: new Date('2026-02-21'),
          user: { firstName: 'Admin', lastName: 'User' },
        },
      ];
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.contactLog.findMany.mockResolvedValue(logs);

      const result = await service.findLogs('contact-1', mockUser);

      expect(result).toEqual(logs);
      expect(mockPrismaService.contactLog.findMany).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
        orderBy: { loggedAt: 'desc' },
      });
    });
  });

  // ─── sendEmail ───────────────────────────────────────────────────────

  describe('sendEmail()', () => {
    const emailDto = {
      subject: 'Offerte voor inspectie',
      bodyHtml: '<p>Beste klant, hierbij de offerte...</p>',
    };

    it('should call EmailService.sendContactEmail and save ContactEmail record', async () => {
      const savedEmail = {
        id: 'email-1',
        contactId: 'contact-1',
        orgId: 'org-1',
        userId: 'user-1',
        resendId: 'resend-123',
        subject: emailDto.subject,
        bodyHtml: emailDto.bodyHtml,
        sentAt: new Date(),
        user: { firstName: 'Admin', lastName: 'User' },
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.organization.findUnique.mockResolvedValue({
        senderName: null,
        senderEmail: null,
      });
      mockEmailService.sendContactEmail.mockResolvedValue({ id: 'resend-123' });
      mockPrismaService.contactEmail.create.mockResolvedValue(savedEmail);

      const result = await service.sendEmail('contact-1', emailDto, mockUser);

      expect(result).toEqual(savedEmail);
      expect(mockEmailService.sendContactEmail).toHaveBeenCalledWith(
        'info@test.nl',
        emailDto.subject,
        emailDto.bodyHtml,
        { senderName: null, senderEmail: null },
      );
      expect(mockPrismaService.contactEmail.create).toHaveBeenCalledWith({
        data: {
          contactId: 'contact-1',
          orgId: 'org-1',
          userId: 'user-1',
          resendId: 'resend-123',
          subject: emailDto.subject,
          bodyHtml: emailDto.bodyHtml,
        },
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      });
    });

    it('should throw BadRequestException when contact has no email', async () => {
      const contactNoEmail = { ...mockContact, email: null };
      mockPrismaService.contact.findUnique.mockResolvedValue(contactNoEmail);

      await expect(
        service.sendEmail('contact-1', emailDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendEmail('contact-1', emailDto, mockUser),
      ).rejects.toThrow('Deze relatie heeft geen e-mailadres');
    });

    it('should throw BadRequestException when email sending fails', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockEmailService.sendContactEmail.mockRejectedValue(
        new Error('SMTP error'),
      );

      await expect(
        service.sendEmail('contact-1', emailDto, mockUser),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.sendEmail('contact-1', emailDto, mockUser),
      ).rejects.toThrow('E-mail versturen mislukt');
    });
  });
});
