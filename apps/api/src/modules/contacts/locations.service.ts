import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User, Role, Prisma, LocationTypeScope } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound } from '@/common';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';
import { ContactsService } from './contacts.service';
import {
  CreateLocationDto,
  UpdateLocationDto,
  ListLocationsQueryDto,
  CreateLocationContactPersonDto,
  UpdateLocationContactPersonDto,
} from './dto';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private customFieldsValidator: CustomFieldsValidator,
    private geocodingService: GeocodingService,
    private contactsService: ContactsService,
  ) {}

  /** Standaard `locationType`-select voor alle locatie-responses. */
  private static readonly LOCATION_TYPE_SELECT = {
    select: { id: true, code: true, name: true, color: true, icon: true },
  } as const;

  /**
   * Valideer of een locatietype bruikbaar is voor de gegeven org.
   * Systeem-types (orgId null) zijn gedeeld en altijd toegestaan; een
   * type van een andere org wordt geweigerd met 403. Gebruik NOOIT de
   * generieke `assertSameOrg` helper hier — die zou systeem-types weigeren.
   */
  private async assertLocationTypeUsable(
    locationTypeId: string | null | undefined,
    orgId: string | null,
  ): Promise<void> {
    if (!locationTypeId) return;
    const type = await this.prisma.locationTypeDefinition.findUnique({
      where: { id: locationTypeId },
      select: { orgId: true, deletedAt: true, scope: true, isActive: true },
    });
    if (!type || type.deletedAt) throw new NotFoundException('Locatietype niet gevonden');
    // Cross-tenant: een type van een andere org is verboden. Systeem-types
    // (orgId null) zijn gedeeld; SUPERUSER (orgId null) mag alles.
    if (type.orgId !== null && orgId !== null && type.orgId !== orgId) {
      throw new ForbiddenException('Locatietype hoort niet bij uw organisatie');
    }
    // Een relatie-locatie mag alleen een actief CRM-type koppelen — geen
    // inspectie-types (scope-scheiding) en geen gearchiveerde types.
    if (type.scope !== LocationTypeScope.CRM || !type.isActive) {
      throw new BadRequestException('Ongeldig locatietype voor een relatie-locatie');
    }
  }

  /**
   * Bepaal lat/lng voor een locatie.
   * Prioriteit: (1) expliciet meegegeven → (2) pdokData centroide → (3) Nominatim fallback.
   * Retourneert { lat, lng } of { lat: null, lng: null } bij mislukken.
   */
  private async resolveCoords(
    street: string,
    houseNumber: string,
    postalCode: string,
    city: string,
    pdokData?: Record<string, unknown> | null,
    explicitLat?: number | null,
    explicitLng?: number | null,
  ): Promise<{ lat: number | null; lng: number | null }> {
    if (explicitLat != null && explicitLng != null) {
      return { lat: explicitLat, lng: explicitLng };
    }
    if (pdokData) {
      const coords = this.geocodingService.extractCoordsFromPdokData(pdokData);
      if (coords) return coords;
    }
    const coords = await this.geocodingService.nominatimGeocode(street, houseNumber, postalCode, city);
    return coords ?? { lat: null, lng: null };
  }

  async addLocation(contactId: string, dto: CreateLocationDto, user: User) {
    const contact = await this.contactsService.findOne(contactId, user);
    const cfData = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(contact.orgId, 'LOCATION', dto.customFields)
      : null;

    await this.assertLocationTypeUsable(dto.locationTypeId, contact.orgId);

    const { lat, lng } = await this.resolveCoords(
      dto.street, dto.houseNumber, dto.postalCode, dto.city,
      dto.pdokData, dto.lat, dto.lng,
    );

    return this.prisma.location.create({
      data: {
        contactId: contact.id,
        orgId: contact.orgId,
        name: dto.name,
        street: dto.street,
        houseNumber: dto.houseNumber,
        postalCode: dto.postalCode,
        city: dto.city,
        locationTypeId: dto.locationTypeId,
        notes: dto.notes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdokData: (dto.pdokData ?? null) as any,
        lat,
        lng,
        customFields: cfData as any,
      },
      include: { locationType: LocationsService.LOCATION_TYPE_SELECT },
    });
  }

  async findAllLocations(user: User, query: ListLocationsQueryDto) {
    const { search, contactId, locationTypeId, page = 1, limit = 20 } = query;

    const where: Prisma.LocationWhereInput = { ...orgScope(user) };

    if (contactId) {
      where.contactId = contactId;
    }

    if (locationTypeId) {
      where.locationTypeId = locationTypeId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { street: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { postalCode: { contains: search, mode: 'insensitive' } },
      ];
    }

    return paginate(this.prisma.location, {
      where,
      include: {
        contact: {
          select: {
            id: true,
            type: true,
            companyName: true,
            firstName: true,
            lastName: true,
          },
        },
        locationType: LocationsService.LOCATION_TYPE_SELECT,
      },
      orderBy: { createdAt: 'desc' },
      page,
      limit,
    });
  }

  async findLocation(locationId: string, user: User) {
    const location = assertFound(
      await this.prisma.location.findUnique({
        where: { id: locationId },
        include: {
          contact: {
            select: {
              id: true,
              type: true,
              companyName: true,
              firstName: true,
              lastName: true,
            },
          },
          locationType: LocationsService.LOCATION_TYPE_SELECT,
        },
      }),
      'Locatie',
    );

    if (!user.roles.includes(Role.SUPERUSER) && location.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return location;
  }

  async findLocations(contactId: string, user: User) {
    const contact = await this.contactsService.findOne(contactId, user);

    return this.prisma.location.findMany({
      where: { contactId: contact.id },
      include: { locationType: LocationsService.LOCATION_TYPE_SELECT },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLocation(locationId: string, dto: UpdateLocationDto, user: User) {
    const location = assertFound(
      await this.prisma.location.findUnique({
        where: { id: locationId },
      }),
      'Locatie',
    );

    // Verify org scoping
    if (!user.roles.includes(Role.SUPERUSER) && location.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    if (dto.locationTypeId) {
      await this.assertLocationTypeUsable(dto.locationTypeId, location.orgId);
    }

    let cfData: any = undefined;
    if (dto.customFields !== undefined) {
      const merged = { ...((location.customFields as Record<string, any>) ?? {}), ...dto.customFields };
      cfData = await this.customFieldsValidator.validateAndSanitize(location.orgId, 'LOCATION', merged);
    }

    // Determine new coords when relevant fields change
    let newLat: number | null | undefined = undefined;
    let newLng: number | null | undefined = undefined;

    if (dto.lat != null && dto.lng != null) {
      // Explicit coords provided (e.g. saved from frontend Nominatim geocoding)
      newLat = dto.lat;
      newLng = dto.lng;
    } else if (dto.pdokData !== undefined) {
      // pdokData updated → re-extract coords from WKT centroide
      const coords = dto.pdokData
        ? this.geocodingService.extractCoordsFromPdokData(dto.pdokData)
        : null;
      newLat = coords?.lat ?? null;
      newLng = coords?.lng ?? null;
    } else if (location.lat == null) {
      // No coords yet and address may have changed → try to geocode
      const street = dto.street ?? location.street;
      const houseNumber = dto.houseNumber ?? location.houseNumber;
      const postalCode = dto.postalCode ?? location.postalCode;
      const city = dto.city ?? location.city;
      const coords = await this.geocodingService.nominatimGeocode(street, houseNumber, postalCode, city);
      if (coords) { newLat = coords.lat; newLng = coords.lng; }
    }

    return this.prisma.location.update({
      where: { id: locationId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.street !== undefined && { street: dto.street }),
        ...(dto.houseNumber !== undefined && { houseNumber: dto.houseNumber }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.locationTypeId !== undefined && { locationTypeId: dto.locationTypeId }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.pdokData !== undefined && { pdokData: dto.pdokData as any }),
        ...(newLat !== undefined && { lat: newLat }),
        ...(newLng !== undefined && { lng: newLng }),
        ...(cfData !== undefined && { customFields: cfData as any }),
      },
      include: { locationType: LocationsService.LOCATION_TYPE_SELECT },
    });
  }

  async addLocationContactPerson(locationId: string, dto: CreateLocationContactPersonDto, user: User) {
    const location = await this.findLocation(locationId, user);

    const contactPerson = await this.prisma.contactPerson.findUnique({
      where: { id: dto.contactPersonId },
    });

    if (!contactPerson || contactPerson.isDeleted) {
      throw new NotFoundException('Contactpersoon niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && contactPerson.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return this.prisma.locationContactPerson.create({
      data: {
        locationId: location.id,
        contactPersonId: dto.contactPersonId,
        orgId: location.orgId,
        notes: dto.notes,
      },
      include: {
        contactPerson: {
          include: {
            role: { select: { id: true, code: true, label: true } },
            contact: {
              select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  async findLocationContactPersons(locationId: string, user: User) {
    const location = await this.findLocation(locationId, user);

    return this.prisma.locationContactPerson.findMany({
      where: { locationId: location.id },
      include: {
        contactPerson: {
          include: {
            role: { select: { id: true, code: true, label: true } },
            contact: {
              select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async updateLocationContactPerson(linkId: string, dto: UpdateLocationContactPersonDto, user: User) {
    const link = assertFound(
      await this.prisma.locationContactPerson.findUnique({
        where: { id: linkId },
      }),
      'Koppeling',
    );

    if (!user.roles.includes(Role.SUPERUSER) && link.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return this.prisma.locationContactPerson.update({
      where: { id: linkId },
      data: { notes: dto.notes ?? null },
      include: {
        contactPerson: {
          include: {
            role: { select: { id: true, code: true, label: true } },
            contact: {
              select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });
  }

  async removeLocationContactPerson(linkId: string, user: User) {
    const link = assertFound(
      await this.prisma.locationContactPerson.findUnique({
        where: { id: linkId },
      }),
      'Koppeling',
    );

    if (!user.roles.includes(Role.SUPERUSER) && link.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    await this.prisma.locationContactPerson.delete({ where: { id: linkId } });
  }

  async deleteLocation(locationId: string, user: User) {
    const location = assertFound(
      await this.prisma.location.findUnique({
        where: { id: locationId },
      }),
      'Locatie',
    );

    // Verify org scoping
    if (!user.roles.includes(Role.SUPERUSER) && location.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    await this.prisma.location.delete({
      where: { id: locationId },
    });
  }
}
