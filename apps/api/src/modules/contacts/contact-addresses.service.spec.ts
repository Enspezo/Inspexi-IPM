import { Test, TestingModule } from '@nestjs/testing';
import { Role, ContactType } from '@prisma/client';
import { ContactAddressesService } from './contact-addresses.service';
import { ContactsService } from './contacts.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

describe('ContactAddressesService', () => {
  let service: ContactAddressesService;
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
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    contactAddress: {
      create: jest.fn(),
      updateMany: jest.fn(),
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
        ContactAddressesService,
        ContactsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: CustomFieldsValidator, useValue: mockCustomFieldsValidator },
      ],
    }).compile();

    service = module.get<ContactAddressesService>(ContactAddressesService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── addAddress ──────────────────────────────────────────────────────

  describe('addAddress()', () => {
    const addressDto = {
      label: 'Factuuradres',
      street: 'Industrieweg',
      houseNumber: '42',
      postalCode: '1234 AB',
      city: 'Amsterdam',
      isPrimary: false,
    };

    it('should create address for contact', async () => {
      const createdAddress = {
        id: 'addr-1',
        contactId: 'contact-1',
        ...addressDto,
        country: 'NL',
      };
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.contactAddress.create.mockResolvedValue(createdAddress);

      const result = await service.addAddress(
        'contact-1',
        addressDto,
        mockUser,
      );

      expect(result).toEqual(createdAddress);
      expect(mockPrismaService.contactAddress.create).toHaveBeenCalledWith({
        data: {
          contactId: 'contact-1',
          label: addressDto.label,
          street: addressDto.street,
          houseNumber: addressDto.houseNumber,
          postalCode: addressDto.postalCode,
          city: addressDto.city,
          country: 'NL',
          isPrimary: false,
          isPostal: false,
          isInvoice: false,
          customFields: null,
        },
      });
    });

    it('should unset other primary addresses in transaction when isPrimary=true', async () => {
      const primaryDto = { ...addressDto, isPrimary: true };
      const createdAddress = {
        id: 'addr-2',
        contactId: 'contact-1',
        ...primaryDto,
        country: 'NL',
      };

      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.$transaction.mockImplementation(async (fn) => {
        const tx = {
          contactAddress: {
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
            create: jest.fn().mockResolvedValue(createdAddress),
          },
        };
        return fn(tx);
      });

      const result = await service.addAddress(
        'contact-1',
        primaryDto,
        mockUser,
      );

      expect(result).toEqual(createdAddress);
      expect(mockPrismaService.$transaction).toHaveBeenCalledTimes(1);
    });

    it('should create normally when isPrimary=false', async () => {
      const createdAddress = {
        id: 'addr-3',
        contactId: 'contact-1',
        ...addressDto,
        country: 'NL',
      };
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.contactAddress.create.mockResolvedValue(createdAddress);

      await service.addAddress('contact-1', addressDto, mockUser);

      expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
      expect(mockPrismaService.contactAddress.create).toHaveBeenCalled();
    });
  });
});
