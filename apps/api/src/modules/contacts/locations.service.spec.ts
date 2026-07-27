import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    location: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
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

  const emptyBag = {
    gebruiksfunctie: null,
    bouwjaar: null,
    oppervlakte: null,
    bagId: null,
  };

  const mockGeocodingService = {
    extractCoordsFromPdokData: jest.fn().mockReturnValue(null),
    nominatimGeocode: jest.fn().mockResolvedValue(null),
    extractAdresseerbaarObjectId: jest.fn().mockReturnValue(null),
    bagEnrich: jest.fn().mockResolvedValue(emptyBag),
    lookup: jest.fn(),
    lookupByAddress: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockGeocodingService.extractCoordsFromPdokData.mockReturnValue(null);
    mockGeocodingService.nominatimGeocode.mockResolvedValue(null);
    mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue(null);
    mockGeocodingService.bagEnrich.mockResolvedValue(emptyBag);
    mockGeocodingService.lookupByAddress.mockResolvedValue(null);

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
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      // Own-org location type → usable
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: null,
        scope: 'CRM',
        isActive: true,
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
          gebruiksfunctie: null,
          bouwjaar: null,
          oppervlakte: null,
          bagId: null,
          customFields: null,
        },
        include: { locationType: LOCATION_TYPE_SELECT },
      });
    });

    it('should enrich BAG fields server-side from pdokData on create', async () => {
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1', deletedAt: null, scope: 'CRM', isActive: true,
      });
      mockPrismaService.location.create.mockResolvedValue({ id: 'loc-bag' });
      mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue('0363010000000001');
      mockGeocodingService.bagEnrich.mockResolvedValue({
        gebruiksfunctie: 'woonfunctie', bouwjaar: 2004, oppervlakte: 72, bagId: '0363100012168433',
      });

      await service.addLocation(
        'contact-1',
        { ...locationDto, pdokData: { adresseerbaarobject_id: '0363010000000001' } },
        mockUser,
      );

      expect(mockGeocodingService.bagEnrich).toHaveBeenCalledWith(
        '0363010000000001',
        expect.objectContaining({ operation: 'BAG_ENRICH', orgId: 'org-1', userId: 'user-1' }),
      );
      expect(mockPrismaService.location.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            gebruiksfunctie: 'woonfunctie',
            bouwjaar: 2004,
            oppervlakte: 72,
            bagId: '0363100012168433',
          }),
        }),
      );
    });

    it('should not block create when BAG enrichment fails', async () => {
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1', deletedAt: null, scope: 'CRM', isActive: true,
      });
      mockPrismaService.location.create.mockResolvedValue({ id: 'loc-degraded' });
      mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue('0363010000000001');
      mockGeocodingService.bagEnrich.mockRejectedValue(new Error('PDOK down'));

      await expect(
        service.addLocation(
          'contact-1',
          { ...locationDto, pdokData: { adresseerbaarobject_id: '0363010000000001' } },
          mockUser,
        ),
      ).resolves.toEqual({ id: 'loc-degraded' });
      expect(mockPrismaService.location.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ gebruiksfunctie: null, bagId: null }),
        }),
      );
    });

    it('should reject a location type owned by another org with Forbidden', async () => {
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
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
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: null,
        deletedAt: null,
        scope: 'CRM',
        isActive: true,
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
        scope: 'CRM',
        isActive: true,
      });
      await expect(callAssert('type-1', 'org-1')).resolves.toBeUndefined();
    });

    it('should allow an own-org type', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: null,
        scope: 'CRM',
        isActive: true,
      });
      await expect(callAssert('type-1', 'org-1')).resolves.toBeUndefined();
    });

    it('should allow any type for SUPERUSER (orgId null caller)', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-2',
        deletedAt: null,
        scope: 'CRM',
        isActive: true,
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

    it('should reject a non-CRM (inspection) type with BadRequest', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: null,
        scope: 'INSPECTION',
        isActive: true,
      });
      await expect(callAssert('type-1', 'org-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject an inactive type with BadRequest', async () => {
      mockPrismaService.locationTypeDefinition.findUnique.mockResolvedValue({
        orgId: 'org-1',
        deletedAt: null,
        scope: 'CRM',
        isActive: false,
      });
      await expect(callAssert('type-1', 'org-1')).rejects.toThrow(BadRequestException);
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
      mockPrismaService.contact.findFirst.mockResolvedValue(mockContact);
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

  // ─── pdokRefresh ─────────────────────────────────────────────────────

  describe('pdokRefresh()', () => {
    const baseLocation = {
      id: 'loc-1',
      orgId: 'org-1',
      contactId: 'contact-1',
      name: 'Kantoor',
      street: 'Keizersgracht',
      houseNumber: '100',
      postalCode: '1015 AA',
      city: 'Amsterdam',
      lat: 52.37,
      lng: 4.89,
      pdokData: { id: 'adr-1', adresseerbaarobject_id: '0363010000000001' },
      gebruiksfunctie: null,
      bouwjaar: null,
      oppervlakte: null,
      bagId: null,
    };

    const freshAddress = {
      street: 'Keizersgracht',
      houseNumber: '100',
      postalCode: '1015 AA',
      city: 'Amsterdam',
      lat: 52.37,
      lng: 4.89,
      pdokData: { id: 'adr-1', adresseerbaarobject_id: '0363010000000001' },
    };

    it('should reject a location from another org with the same 404 as not-found (WP-C1)', async () => {
      // Org-scope zit in de where-clausule: het record van een andere org komt
      // simpelweg niet terug — geen 403-existence-oracle meer.
      mockPrismaService.location.findFirst.mockResolvedValue(null);

      await expect(service.pdokRefresh('loc-1', false, mockUser)).rejects.toThrow(
        'Locatie niet gevonden',
      );
      expect(mockPrismaService.location.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'loc-1', orgId: 'org-1' }),
        }),
      );
      expect(mockGeocodingService.lookup).not.toHaveBeenCalled();
      expect(mockPrismaService.location.update).not.toHaveBeenCalled();
    });

    it('should throw NotFound when the location does not exist', async () => {
      mockPrismaService.location.findFirst.mockResolvedValue(null);

      await expect(service.pdokRefresh('missing', false, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should save directly when there was no prior data (no confirm needed)', async () => {
      mockPrismaService.location.findFirst.mockResolvedValue(baseLocation);
      mockGeocodingService.lookup.mockResolvedValue(freshAddress);
      mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue('0363010000000001');
      mockGeocodingService.bagEnrich.mockResolvedValue({
        gebruiksfunctie: 'kantoorfunctie', bouwjaar: 2004, oppervlakte: 12500, bagId: '0363100012168433',
      });
      mockPrismaService.location.update.mockResolvedValue({ id: 'loc-1', bagId: '0363100012168433' });

      const result = await service.pdokRefresh('loc-1', false, mockUser);

      expect(result.applied).toBe(true);
      expect(mockPrismaService.location.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'loc-1' },
          data: expect.objectContaining({
            gebruiksfunctie: 'kantoorfunctie',
            bouwjaar: 2004,
            oppervlakte: 12500,
            bagId: '0363100012168433',
          }),
        }),
      );
    });

    it('should return the diff WITHOUT saving when data differs and confirm is false', async () => {
      mockPrismaService.location.findFirst.mockResolvedValue({
        ...baseLocation,
        gebruiksfunctie: 'kantoorfunctie',
        bouwjaar: 2000,
        oppervlakte: 12500,
        bagId: '0363100012168433',
      });
      mockGeocodingService.lookup.mockResolvedValue(freshAddress);
      mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue('0363010000000001');
      mockGeocodingService.bagEnrich.mockResolvedValue({
        gebruiksfunctie: 'kantoorfunctie', bouwjaar: 2004, oppervlakte: 12500, bagId: '0363100012168433',
      });

      const result = await service.pdokRefresh('loc-1', false, mockUser);

      expect(result.applied).toBe(false);
      expect(result.changes).toEqual([
        expect.objectContaining({ field: 'bouwjaar', oldValue: 2000, newValue: 2004 }),
      ]);
      expect(result.fetched).toBeDefined();
      expect(mockPrismaService.location.update).not.toHaveBeenCalled();
    });

    it('should overwrite when confirm is true', async () => {
      mockPrismaService.location.findFirst.mockResolvedValue({
        ...baseLocation,
        gebruiksfunctie: 'kantoorfunctie',
        bouwjaar: 2000,
        oppervlakte: 12500,
        bagId: '0363100012168433',
      });
      mockGeocodingService.lookup.mockResolvedValue(freshAddress);
      mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue('0363010000000001');
      mockGeocodingService.bagEnrich.mockResolvedValue({
        gebruiksfunctie: 'kantoorfunctie', bouwjaar: 2004, oppervlakte: 12500, bagId: '0363100012168433',
      });
      mockPrismaService.location.update.mockResolvedValue({ id: 'loc-1', bouwjaar: 2004 });

      const result = await service.pdokRefresh('loc-1', true, mockUser);

      expect(result.applied).toBe(true);
      expect(mockPrismaService.location.update).toHaveBeenCalled();
    });

    it('should fall back to address lookup when there is no stored pdok id', async () => {
      mockPrismaService.location.findFirst.mockResolvedValue({
        ...baseLocation,
        pdokData: null,
      });
      mockGeocodingService.lookupByAddress.mockResolvedValue(freshAddress);
      mockGeocodingService.extractAdresseerbaarObjectId.mockReturnValue('0363010000000001');
      mockGeocodingService.bagEnrich.mockResolvedValue(emptyBag);
      mockPrismaService.location.update.mockResolvedValue({ id: 'loc-1' });

      await service.pdokRefresh('loc-1', false, mockUser);

      expect(mockGeocodingService.lookup).not.toHaveBeenCalled();
      expect(mockGeocodingService.lookupByAddress).toHaveBeenCalledWith(
        'Keizersgracht', '100', '1015 AA', 'Amsterdam',
        expect.objectContaining({ operation: 'REFRESH', locationId: 'loc-1' }),
      );
    });

    it('should throw NotFound when PDOK returns no result for the address', async () => {
      mockPrismaService.location.findFirst.mockResolvedValue({
        ...baseLocation,
        pdokData: null,
      });
      mockGeocodingService.lookupByAddress.mockResolvedValue(null);

      await expect(service.pdokRefresh('loc-1', false, mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
