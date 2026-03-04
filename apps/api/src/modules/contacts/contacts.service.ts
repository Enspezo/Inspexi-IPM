import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { requestContext } from '@/common/services/request-context';
import { EmailService } from '@/common/services/email.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import { GeocodingService } from '@/modules/geocoding/geocoding.service';
import {
  CreateContactDto,
  UpdateContactDto,
  CreateContactAddressDto,
  UpdateContactAddressDto,
  CreateContactPersonDto,
  UpdateContactPersonDto,
  CreateLocationDto,
  UpdateLocationDto,
  CreateContactLogDto,
  SendContactEmailDto,
  ListContactsQueryDto,
  ListContactPersonsQueryDto,
} from './dto';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private customFieldsValidator: CustomFieldsValidator,
    private geocodingService: GeocodingService,
  ) {}

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

  /**
   * Alleen de eigenaar van de relatie, een ORG_ADMIN of SUPERUSER
   * mag de eigenaar wijzigen of de relatie verwijderen.
   */
  private assertOwnerOrAdmin(
    contact: { ownerId?: string | null },
    user: User,
  ): void {
    if (user.roles.some(r => r === Role.SUPERUSER || r === Role.ORG_ADMIN)) return;
    if (contact.ownerId && contact.ownerId === user.id) return;
    throw new ForbiddenException(
      'Alleen de eigenaar, organisatie-admin of superadmin mag dit doen',
    );
  }

  async findAll(user: User, query: ListContactsQueryDto) {
    const { search, type, onlyMine, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['type', 'email', 'phone', 'createdAt'];
    const orderBy = (sortBy && ALLOWED_SORT_FIELDS.includes(sortBy))
      ? { [sortBy]: sortOrder }
      : { createdAt: 'desc' as const };
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = {
      isDeleted: false,
    };

    // Org scoping — SUPERUSER sees all, others scoped to own org
    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (type) {
      where.type = type;
    }

    // "Mijn relaties" filter
    if (onlyMine === 'true') {
      where.ownerId = user.id;
    }

    if (search && search.length >= 3) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { addresses: { some: { city: { contains: search, mode: 'insensitive' } } } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: {
          addresses: true,
          owner: { select: { id: true, firstName: true, lastName: true } },
          customerGroups: {
            include: {
              customerGroup: { select: { id: true, name: true } },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        addresses: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        contactPersons: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
        },
        customerGroups: {
          include: {
            customerGroup: { select: { id: true, name: true } },
          },
        },
        locations: true,
        logs: {
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { loggedAt: 'desc' },
        },
        emails: {
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { sentAt: 'desc' },
        },
        quotes: {
          include: {
            createdByUser: { select: { id: true, firstName: true, lastName: true, email: true } },
            location: { select: { id: true, name: true, city: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        requests: {
          where: { isDeleted: false },
          include: {
            assignedUser: { select: { id: true, firstName: true, lastName: true } },
            location: { select: { id: true, name: true, city: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }

    // Check org scoping
    if (!user.roles.includes(Role.SUPERUSER) && contact.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return contact;
  }

  async create(dto: CreateContactDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    const customFields = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(orgId!, 'CONTACT', dto.customFields)
      : null;

    return this.prisma.contact.create({
      data: {
        orgId: orgId!,
        type: dto.type,
        companyName: dto.companyName,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        website: dto.website,
        vatNumber: dto.vatNumber,
        vatValidation: (dto.vatValidation ?? null) as any,
        cocNumber: dto.cocNumber,
        notes: dto.notes,
        ownerId: dto.ownerId ?? user.id,
        customFields: customFields as any,
      },
      include: { addresses: true },
    });
  }

  async update(id: string, dto: UpdateContactDto, user: User) {
    const contact = await this.findOne(id, user);

    // Eigenaar wijzigen: alleen eigenaar, ORG_ADMIN of SUPERUSER
    if (dto.ownerId !== undefined) {
      this.assertOwnerOrAdmin(contact, user);
    }

    const oldCompanyName = contact.companyName;

    let customFieldsData: any = undefined;
    if (dto.customFields !== undefined) {
      const merged = {
        ...((contact.customFields as Record<string, any>) ?? {}),
        ...dto.customFields,
      };
      customFieldsData = await this.customFieldsValidator.validateAndSanitize(
        contact.orgId, 'CONTACT', merged,
      );
    }

    const updated = await this.prisma.contact.update({
      where: { id: contact.id },
      data: {
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.companyName !== undefined && { companyName: dto.companyName }),
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.website !== undefined && { website: dto.website }),
        ...(dto.vatNumber !== undefined && { vatNumber: dto.vatNumber }),
        ...(dto.vatValidation !== undefined && { vatValidation: dto.vatValidation as any }),
        ...(dto.cocNumber !== undefined && { cocNumber: dto.cocNumber }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.ownerId !== undefined && { ownerId: dto.ownerId || null }),
        ...(customFieldsData !== undefined && { customFields: customFieldsData as any }),
      },
      include: { addresses: true },
    });

    if (dto.viesNameApplied && dto.companyName && oldCompanyName !== dto.companyName) {
      const ctx = requestContext.getStore();
      if (ctx?.userId) {
        this.prisma.writeAuditLog({
          entityType: 'Contact',
          entityId: updated.id,
          action: 'UPDATE',
          snapshot: null,
          changes: { viesNaamOverschreven: { from: oldCompanyName ?? null, to: dto.companyName } },
          userId: ctx.userId,
          orgId: updated.orgId ?? ctx.orgId,
          ipAddress: ctx.ipAddress,
        }).catch((err) => this.logger.error(`VIES audit log error: ${err}`));
      }
    }

    return updated;
  }

  async softDelete(id: string, user: User) {
    const contact = await this.findOne(id, user);

    // Verwijderen: alleen eigenaar, ORG_ADMIN of SUPERUSER
    this.assertOwnerOrAdmin(contact, user);

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: { isDeleted: true },
    });
  }

  async addAddress(contactId: string, dto: CreateContactAddressDto, user: User) {
    const contact = await this.findOne(contactId, user);
    const cfData = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(contact.orgId, 'CONTACT_ADDRESS', dto.customFields)
      : null;

    const needsTransaction = dto.isPrimary || dto.isPostal || dto.isInvoice;

    if (needsTransaction) {
      return this.prisma.$transaction(async (tx) => {
        // If setting as primary, unset other primary addresses
        if (dto.isPrimary) {
          await tx.contactAddress.updateMany({
            where: { contactId: contact.id, isPrimary: true },
            data: { isPrimary: false },
          });
        }
        // If setting as postal, unset other postal addresses
        if (dto.isPostal) {
          await tx.contactAddress.updateMany({
            where: { contactId: contact.id, isPostal: true },
            data: { isPostal: false },
          });
        }
        // If setting as invoice, unset other invoice addresses
        if (dto.isInvoice) {
          await tx.contactAddress.updateMany({
            where: { contactId: contact.id, isInvoice: true },
            data: { isInvoice: false },
          });
        }

        return tx.contactAddress.create({
          data: {
            contactId: contact.id,
            label: dto.label,
            street: dto.street,
            houseNumber: dto.houseNumber,
            postalCode: dto.postalCode,
            city: dto.city,
            country: dto.country ?? 'NL',
            isPrimary: dto.isPrimary ?? false,
            isPostal: dto.isPostal ?? false,
            isInvoice: dto.isInvoice ?? false,
            customFields: cfData as any,
          },
        });
      });
    }

    return this.prisma.contactAddress.create({
      data: {
        contactId: contact.id,
        label: dto.label,
        street: dto.street,
        houseNumber: dto.houseNumber,
        postalCode: dto.postalCode,
        city: dto.city,
        country: dto.country ?? 'NL',
        isPrimary: dto.isPrimary ?? false,
        isPostal: dto.isPostal ?? false,
        isInvoice: dto.isInvoice ?? false,
        customFields: cfData as any,
      },
    });
  }

  async updateAddress(
    addressId: string,
    dto: UpdateContactAddressDto,
    user: User,
  ) {
    const address = await this.prisma.contactAddress.findUnique({
      where: { id: addressId },
      include: { contact: true },
    });

    if (!address) {
      throw new NotFoundException('Adres niet gevonden');
    }

    // Verify org scoping via contact
    await this.findOne(address.contactId, user);

    let cfData: any = undefined;
    if (dto.customFields !== undefined) {
      const merged = { ...((address.customFields as Record<string, any>) ?? {}), ...dto.customFields };
      cfData = await this.customFieldsValidator.validateAndSanitize(address.contact.orgId, 'CONTACT_ADDRESS', merged);
    }

    const needsTransaction = dto.isPrimary || dto.isPostal || dto.isInvoice;

    if (needsTransaction) {
      return this.prisma.$transaction(async (tx) => {
        if (dto.isPrimary) {
          await tx.contactAddress.updateMany({
            where: { contactId: address.contactId, isPrimary: true, id: { not: addressId } },
            data: { isPrimary: false },
          });
        }
        if (dto.isPostal) {
          await tx.contactAddress.updateMany({
            where: { contactId: address.contactId, isPostal: true, id: { not: addressId } },
            data: { isPostal: false },
          });
        }
        if (dto.isInvoice) {
          await tx.contactAddress.updateMany({
            where: { contactId: address.contactId, isInvoice: true, id: { not: addressId } },
            data: { isInvoice: false },
          });
        }

        return tx.contactAddress.update({
          where: { id: addressId },
          data: {
            ...(dto.label !== undefined && { label: dto.label }),
            ...(dto.street !== undefined && { street: dto.street }),
            ...(dto.houseNumber !== undefined && { houseNumber: dto.houseNumber }),
            ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
            ...(dto.city !== undefined && { city: dto.city }),
            ...(dto.country !== undefined && { country: dto.country }),
            ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
            ...(dto.isPostal !== undefined && { isPostal: dto.isPostal }),
            ...(dto.isInvoice !== undefined && { isInvoice: dto.isInvoice }),
            ...(cfData !== undefined && { customFields: cfData as any }),
          },
        });
      });
    }

    return this.prisma.contactAddress.update({
      where: { id: addressId },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.street !== undefined && { street: dto.street }),
        ...(dto.houseNumber !== undefined && { houseNumber: dto.houseNumber }),
        ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
        ...(dto.city !== undefined && { city: dto.city }),
        ...(dto.country !== undefined && { country: dto.country }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.isPostal !== undefined && { isPostal: dto.isPostal }),
        ...(dto.isInvoice !== undefined && { isInvoice: dto.isInvoice }),
        ...(cfData !== undefined && { customFields: cfData as any }),
      },
    });
  }

  async deleteAddress(addressId: string, user: User) {
    const address = await this.prisma.contactAddress.findUnique({
      where: { id: addressId },
    });

    if (!address) {
      throw new NotFoundException('Adres niet gevonden');
    }

    // Verify org scoping via contact
    await this.findOne(address.contactId, user);

    await this.prisma.contactAddress.delete({
      where: { id: addressId },
    });
  }

  // ─── Contact Persons ───────────────────────────────────

  async findAllContactPersons(user: User, query: ListContactPersonsQueryDto) {
    const { search, role, contactId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactPersonWhereInput = {
      isDeleted: false,
    };

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (contactId) {
      where.contactId = contactId;
    }

    if (role) {
      where.role = role;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contactPerson.findMany({
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
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.contactPerson.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async addContactPerson(contactId: string, dto: CreateContactPersonDto, user: User) {
    const contact = await this.findOne(contactId, user);

    return this.prisma.contactPerson.create({
      data: {
        contactId: contact.id,
        orgId: contact.orgId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        role: dto.role,
        notes: dto.notes,
      },
    });
  }

  async findContactPerson(id: string, user: User) {
    const person = await this.prisma.contactPerson.findUnique({
      where: { id },
      include: { contact: true },
    });

    if (!person || person.isDeleted) {
      throw new NotFoundException('Contactpersoon niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && person.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return person;
  }

  async updateContactPerson(id: string, dto: UpdateContactPersonDto, user: User) {
    const person = await this.findContactPerson(id, user);

    return this.prisma.contactPerson.update({
      where: { id: person.id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
    });
  }

  async deleteContactPerson(id: string, user: User) {
    const person = await this.findContactPerson(id, user);

    await this.prisma.contactPerson.update({
      where: { id: person.id },
      data: { isDeleted: true },
    });
  }

  async addLocation(contactId: string, dto: CreateLocationDto, user: User) {
    const contact = await this.findOne(contactId, user);
    const cfData = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(contact.orgId, 'LOCATION', dto.customFields)
      : null;

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
        objectType: dto.objectType,
        notes: dto.notes,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pdokData: (dto.pdokData ?? null) as any,
        lat,
        lng,
        customFields: cfData as any,
      },
    });
  }

  async findLocations(contactId: string, user: User) {
    const contact = await this.findOne(contactId, user);

    return this.prisma.location.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateLocation(locationId: string, dto: UpdateLocationDto, user: User) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Locatie niet gevonden');
    }

    // Verify org scoping
    if (!user.roles.includes(Role.SUPERUSER) && location.orgId !== user.orgId) {
      throw new ForbiddenException();
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
        ...(dto.objectType !== undefined && { objectType: dto.objectType }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...(dto.pdokData !== undefined && { pdokData: dto.pdokData as any }),
        ...(newLat !== undefined && { lat: newLat }),
        ...(newLng !== undefined && { lng: newLng }),
        ...(cfData !== undefined && { customFields: cfData as any }),
      },
    });
  }

  async deleteLocation(locationId: string, user: User) {
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });

    if (!location) {
      throw new NotFoundException('Locatie niet gevonden');
    }

    // Verify org scoping
    if (!user.roles.includes(Role.SUPERUSER) && location.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    await this.prisma.location.delete({
      where: { id: locationId },
    });
  }

  async addLog(contactId: string, dto: CreateContactLogDto, user: User) {
    const contact = await this.findOne(contactId, user);

    return this.prisma.contactLog.create({
      data: {
        contactId: contact.id,
        orgId: contact.orgId,
        userId: user.id,
        type: dto.type,
        subject: dto.subject,
        body: dto.body,
        loggedAt: dto.loggedAt ? new Date(dto.loggedAt) : new Date(),
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });
  }

  async findLogs(contactId: string, user: User) {
    const contact = await this.findOne(contactId, user);

    return this.prisma.contactLog.findMany({
      where: { contactId: contact.id },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { loggedAt: 'desc' },
    });
  }

  async sendEmail(contactId: string, dto: SendContactEmailDto, user: User) {
    const contact = await this.findOne(contactId, user);

    if (!contact.email) {
      throw new BadRequestException(
        'Deze relatie heeft geen e-mailadres',
      );
    }

    // Fetch org sender config
    const org = user.orgId
      ? await this.prisma.organization.findUnique({
          where: { id: user.orgId },
          select: { senderName: true, senderEmail: true },
        })
      : null;

    // Send via Resend (EmailService)
    let resendId: string | undefined;
    try {
      const result = await this.emailService.sendContactEmail(
        contact.email,
        dto.subject,
        dto.bodyHtml,
        { senderName: org?.senderName, senderEmail: org?.senderEmail },
      );
      resendId = result?.id;
    } catch (error) {
      this.logger.error(`Failed to send email to ${contact.email}`, error);
      throw new BadRequestException('E-mail versturen mislukt');
    }

    // Save to database
    return this.prisma.contactEmail.create({
      data: {
        contactId: contact.id,
        orgId: contact.orgId,
        userId: user.id,
        resendId,
        subject: dto.subject,
        bodyHtml: dto.bodyHtml,
      },
      include: {
        user: { select: { firstName: true, lastName: true } },
      },
    });
  }

  // ─── Customer Group Assignment ────────────────────────

  async setContactGroups(contactId: string, groupIds: string[], user: User) {
    const contact = await this.findOne(contactId, user);

    // Remove all existing group assignments, then re-create
    await this.prisma.$transaction([
      this.prisma.contactCustomerGroup.deleteMany({
        where: { contactId: contact.id },
      }),
      ...groupIds.map((groupId) =>
        this.prisma.contactCustomerGroup.create({
          data: {
            contactId: contact.id,
            customerGroupId: groupId,
          },
        }),
      ),
    ]);

    // Return updated contact
    return this.findOne(contactId, user);
  }
}
