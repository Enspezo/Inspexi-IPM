import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Role, ContactType } from '@prisma/client';
import { LocationsService } from './locations.service';
import { ContactsService } from './contacts.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';

const LOCATION_TYPE_SELECT = {
  select: { id: true, code: true, name: true, color: true, icon: true },
};

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
    locationTypeDefinition: {
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
      locationTypeId: '11111111-1111-1111-1111-111111111111',
      notes: 'Toegang via achterdeur',
    };

    it('should create location linked to contact and org (with locationType include)', async () => {
      const createdLocation = {
        id: 'loc-1',
        contactId: 'contact-1',
        orgId: 'org-1',
        ...locationDto,
        createdAt: new Date(),
      };
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      // Own-org location type → usable
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: null,
      });
      mockPrismaService.location.create.mockResolvedValue(createdLocation);

      const result = await service.addLocation('contact-1', locationDto, mockUser);

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
          locationTypeId: locationDto.locationTypeId,
          notes: locationDto.notes,
          pdokData: null,
          lat: null,
          lng: null,
          customFields: null,
        },
        include: { locationType: LOCATION_TYPE_SELECT },
      });
    });

    it('should reject a location type owned by another org with Forbidden', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-2',
        deletedAt: null,
      });

      await expect(service.addLocation('contact-1', locationDto, mockUser)).rejects.toThrow(
        ForbiddenException,
      );
      expect(mockPrismaService.location.create).not.toHaveBeenCalled();
    });

    it('should allow a system location type (orgId null)', async () => {
      mockPrismaService.contact.findUnique.mockResolvedValue(mockContact);
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: null,
        deletedAt: null,
      });
      mockPrismaService.location.create.mockResolvedValue({ id: 'loc-2' });

      await expect(service.addLocation('contact-1', locationDto, mockUser)).resolves.toEqual({
        id: 'loc-2',
      });
      expect(mockPrismaService.location.create).toHaveBeenCalled();
    });
  });

  // ─── assertLocationTypeUsable ────────────────────────────────────────

  describe('assertLocationTypeUsable()', () => {
    const callAssert = (locationTypeId: string | null | undefined, orgId: string | null) =>
      (service as any).assertLocationTypeUsable(locationTypeId, orgId);

    it('should be a no-op when no locationTypeId is given', async () => {
      await expect(callAssert(undefined, 'org-1')).resolves.toBeUndefined();
      await expect(callAssert(null, 'org-1')).resolves.toBeUndefined();
      expect(mockPrismaService.locationTypeDefinition.findUnique).not.toHaveBeenCalled();
    });

    it('should allow a system type (orgId null) for any org', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: null,
        deletedAt: null,
      });
      await expect(callAssert('type-1', 'org-1')).resolves.toBeUndefined();
    });

    it('should allow an own-org type', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: null,
      });
      await expect(callAssert('type-1', 'org-1')).resolves.toBeUndefined();
    });

    it('should allow any type for SUPERUSER (orgId null caller)', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-2',
        deletedAt: null,
      });
      await expect(callAssert('type-1', null)).resolves.toBeUndefined();
    });

    it('should reject another org’s type with Forbidden', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-2',
        deletedAt: null,
      });
      await expect(callAssert('type-1', 'org-1')).rejects.toThrow(ForbiddenException);
    });

    it('should reject a missing type with NotFound', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue(null);
      await expect(callAssert('type-1', 'org-1')).rejects.toThrow(NotFoundException);
    });

    it('should reject a soft-deleted type with NotFound', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: new Date(),
      });
      await expect(callAssert('type-1', 'org-1')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── findLocations ───────────────────────────────────────────────────

  describe('findLocations()', () => {
    it('should return locations for contact (with locationType include)', async () => {
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
        include: { locationType: LOCATION_TYPE_SELECT },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
