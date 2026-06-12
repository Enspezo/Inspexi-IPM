import { Test, TestingModule } from '@nestjs/testing';
import { Role, ContactType } from '@prisma/client';
import { LocationsService } from './locations.service';
import { ContactsService } from './contacts.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

describe('LocationsService', () => {
  let service: LocationsService;
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
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    location: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockEmailService = {
    sendContactEmail: jest.fn().mockResolvedValue({ id: 'resend-123' }),
  };

  const mockCustomFieldsValidator = {
    validateAndSanitize: jest.fn().mockResolvedValue(null),
  };

  const mockGeocodingService = {
    extractCoordsFromPdokData: jest.fn().mockReturnValue(null),
    nominatimGeocode: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGeocodingService.extractCoordsFromPdokData.mockReturnValue(null);
    mockGeocodingService.nominatimGeocode.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocationsService,
        ContactsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
        { provide: CustomFieldsValidator, useValue: mockCustomFieldsValidator },
        { provide: GeocodingService, useValue: mockGeocodingService },
      ],
    }).compile();

    service = module.get<LocationsService>(LocationsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  // ─── addLocation ─────────────────────────────────────────────────────

  describe('addLocation()', () => {
    const locationDto = {
      name: 'Hoofdkantoor Amsterdam',
      street: 'Keizersgracht',
      houseNumber: '100',
      postalCode: '1015 AA',
      city: 'Amsterdam',
      objectType: 'kantoor',
      notes: 'Toegang via achterdeur',
    };

    it('should create location linked to contact and org', async () => {
      const createdLocation = {
        id: 'loc-1',
        contactId: 'contact-1',
        orgId: 'org-1',
        ...locationDto,
        createdAt: new Date(),
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.location.create.mockResolvedValue(createdLocation);

      const result = await service.addLocation(
        'contact-1',
        locationDto,
        mockUser,
      );

      expect(result).toEqual(createdLocation);
      expect(mockPrismaService.location.create).toHaveBeenCalledWith({
        data: {
          contactId: 'contact-1',
          orgId: 'org-1',
          name: locationDto.name,
          street: locationDto.street,
          houseNumber: locationDto.houseNumber,
          postalCode: locationDto.postalCode,
          city: locationDto.city,
          objectType: locationDto.objectType,
          notes: locationDto.notes,
          pdokData: null,
          lat: null,
          lng: null,
          customFields: null,
        },
      });
    });
  });

  // ─── findLocations ───────────────────────────────────────────────────

  describe('findLocations()', () => {
    it('should return locations for contact', async () => {
      const locations = [
        {
          id: 'loc-1',
          contactId: 'contact-1',
          orgId: 'org-1',
          name: 'Kantoor',
          createdAt: new Date(),
        },
      ];
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.location.findMany.mockResolvedValue(locations);

      const result = await service.findLocations('contact-1', mockUser);

      expect(result).toEqual(locations);
      expect(mockPrismaService.location.findMany).toHaveBeenCalledWith({
        where: { contactId: 'contact-1' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
