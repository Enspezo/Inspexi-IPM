import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { User, Role, Prisma, LocationTypeScope } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound } from '@/common';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import {
  GeocodingService,
  BagBuildingData,
} from '@/modules/geocoding/geocoding.service';
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
  private readonly logger = new Logger(LocationsService.name);

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

    // Server-side BAG-verrijking uit de meegegeven PDOK-data (vertrouw niet op
    // de client voor de bouwgegevens). Een PDOK-fout mag het aanmaken NIET
    // blokkeren — `enrichFromPdok` degradeert netjes naar lege velden.
    const bag = await this.enrichFromPdok(
      dto.pdokData ?? null,
      { orgId: contact.orgId, userId: user.id, operation: 'BAG_ENRICH' },
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
        gebruiksfunctie: bag.gebruiksfunctie,
        bouwjaar: bag.bouwjaar,
        oppervlakte: bag.oppervlakte,
        bagId: bag.bagId,
        customFields: cfData as any,
      },
      include: { locationType: LocationsService.LOCATION_TYPE_SELECT },
    });
  }

  /**
   * Haal BAG-bouwgegevens op uit opgeslagen/meegegeven PDOK-data. Fail-soft:
   * bij ontbrekend adresseerbaar-object-id of een PDOK-fout retourneert dit
   * lege velden zonder te gooien (zodat create/refresh niet blokkeert).
   */
  private async enrichFromPdok(
    pdokData: Record<string, unknown> | null,
    ctx: { orgId: string | null; userId?: string | null; locationId?: string | null; operation: 'BAG_ENRICH' | 'REFRESH' },
  ): Promise<BagBuildingData> {
    const empty: BagBuildingData = {
      gebruiksfunctie: null,
      bouwjaar: null,
      oppervlakte: null,
      bagId: null,
    };
    const vboId = this.geocodingService.extractAdresseerbaarObjectId(pdokData);
    if (!vboId) return empty;
    try {
      return await this.geocodingService.bagEnrich(vboId, ctx);
    } catch (err) {
      this.logger.warn(
        `BAG-verrijking mislukt voor adresseerbaar object ${vboId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return empty;
    }
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

  /** De BAG-velden die in de refresh-diff vergeleken worden, met NL-label. */
  private static readonly PDOK_DIFF_FIELDS: ReadonlyArray<{
    field: 'gebruiksfunctie' | 'bouwjaar' | 'oppervlakte' | 'bagId' | 'lat' | 'lng';
    label: string;
  }> = [
    { field: 'gebruiksfunctie', label: 'Gebruiksfunctie' },
    { field: 'bouwjaar', label: 'Bouwjaar' },
    { field: 'oppervlakte', label: 'Oppervlakte' },
    { field: 'bagId', label: 'BAG-ID' },
    { field: 'lat', label: 'Breedtegraad' },
    { field: 'lng', label: 'Lengtegraad' },
  ];

  /** Normaliseer een waarde voor diff-vergelijking (coördinaten afgerond). */
  private normalizeForDiff(field: string, value: unknown): string | null {
    if (value == null) return null;
    if (field === 'lat' || field === 'lng') {
      const n = typeof value === 'number' ? value : parseFloat(String(value));
      return Number.isFinite(n) ? n.toFixed(6) : null;
    }
    return String(value);
  }

  /**
   * Ververs (of vul) de PDOK/BAG-gegevens van een locatie.
   *
   * - Haalt verse adres- + BAG-data op (via opgeslagen pdok-id of het adres);
   * - berekent de diff t.o.v. de huidige velden;
   * - bij een diff én `confirm !== true` én reeds bestaande data → retourneert
   *   `{ applied: false, changes, fetched }` ZONDER op te slaan (UI vraagt om
   *   overschrijven);
   * - anders → slaat op en retourneert `{ applied: true, changes, location }`
   *   (de audit-middleware legt de wijziging vast).
   */
  async pdokRefresh(locationId: string, confirm: boolean, user: User) {
    const location = assertFound(
      await this.prisma.location.findUnique({ where: { id: locationId } }),
      'Locatie',
    );

    // Org-scope / ownership (zelfde patroon als de overige locatie-methodes).
    if (!user.roles.includes(Role.SUPERUSER) && location.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    const logCtx = {
      operation: 'REFRESH' as const,
      orgId: location.orgId,
      userId: user.id,
      locationId: location.id,
    };

    // 1) Verse adresdata: eerst via opgeslagen PDOK-id, anders via het adres.
    const storedPdok = (location.pdokData as Record<string, unknown> | null) ?? null;
    const storedPdokId = storedPdok?.id ? String(storedPdok.id) : null;

    let parsed = null as Awaited<ReturnType<GeocodingService['lookup']>> | null;
    if (storedPdokId) {
      try {
        parsed = await this.geocodingService.lookup(storedPdokId, logCtx);
      } catch {
        parsed = null;
      }
    }
    if (!parsed) {
      parsed = await this.geocodingService.lookupByAddress(
        location.street, location.houseNumber, location.postalCode, location.city,
        logCtx,
      );
    }
    if (!parsed) {
      throw new NotFoundException('Geen PDOK-resultaat gevonden voor dit adres');
    }

    // 2) BAG-bouwgegevens (fail-soft).
    const bag = await this.enrichFromPdok(parsed.pdokData, logCtx);

    const fetched = {
      gebruiksfunctie: bag.gebruiksfunctie,
      bouwjaar: bag.bouwjaar,
      oppervlakte: bag.oppervlakte,
      bagId: bag.bagId,
      lat: parsed.lat,
      lng: parsed.lng,
    };

    // 3) Diff t.o.v. de huidige velden.
    const changes = LocationsService.PDOK_DIFF_FIELDS.flatMap(({ field, label }) => {
      const oldNorm = this.normalizeForDiff(field, (location as any)[field]);
      const newNorm = this.normalizeForDiff(field, (fetched as any)[field]);
      if (oldNorm === newNorm) return [];
      return [{
        field,
        label,
        oldValue: (location as any)[field] ?? null,
        newValue: (fetched as any)[field] ?? null,
      }];
    });

    const hadData =
      location.gebruiksfunctie != null ||
      location.bouwjaar != null ||
      location.oppervlakte != null ||
      location.bagId != null;

    // Bij bestaande data + afwijking + geen bevestiging → niet opslaan.
    if (changes.length > 0 && confirm !== true && hadData) {
      return { applied: false, changes, fetched };
    }

    // 4) Opslaan (ook bij geen diff: ververst pdokData/coördinaten).
    const updated = await this.prisma.location.update({
      where: { id: locationId },
      data: {
        gebruiksfunctie: fetched.gebruiksfunctie,
        bouwjaar: fetched.bouwjaar,
        oppervlakte: fetched.oppervlakte,
        bagId: fetched.bagId,
        lat: fetched.lat ?? location.lat,
        lng: fetched.lng ?? location.lng,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdokData: parsed.pdokData as any,
      },
      include: { locationType: LocationsService.LOCATION_TYPE_SELECT },
    });

    return { applied: true, changes, location: updated };
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
