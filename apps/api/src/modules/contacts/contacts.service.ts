import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, buildOrderBy, orgScope, assertSameOrg, assertAllSameOrg, requireOrg } from '@/common';
import { requestContext } from '@/common/services/request-context';
import { EmailService } from '@/common/services/email.service';
import { CustomFieldsValidator } from '@/modules/custom-fields/custom-fields.validator';
import {
  CreateContactDto,
  UpdateContactDto,
  CreateContactLogDto,
  SendContactEmailDto,
  ListContactsQueryDto,
} from './dto';

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
    private customFieldsValidator: CustomFieldsValidator,
  ) {}

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
    const { search, type, onlyMine, supplierOnly, page = 1, limit = 20, sortBy, sortOrder = 'desc' } = query;
    const ALLOWED_SORT_FIELDS = ['type', 'email', 'phone', 'createdAt'];
    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS);

    // Org scoping — SUPERUSER sees all, others scoped to own org
    const where: Prisma.ContactWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (type) {
      where.type = type;
    }

    // "Mijn relaties" filter
    if (onlyMine === 'true') {
      where.ownerId = user.id;
    }

    // "Alleen leveranciers" filter
    if (supplierOnly === 'true') {
      where.isSupplier = true;
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

    return paginate(this.prisma.contact, {
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
      page,
      limit,
    });
  }

  async findOne(id: string, user: User) {
    // WP-C1 (B-105): org-scope in de query zelf — een relatie van een andere
    // org valt buiten het filter en geeft dezelfde 404 als "bestaat niet".
    const contact = await this.prisma.contact.findFirst({
      where: { id, ...orgScope(user) },
      include: {
        addresses: true,
        owner: { select: { id: true, firstName: true, lastName: true } },
        contactPersons: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          include: {
            role: { select: { id: true, code: true, label: true } },
          },
        },
        customerGroups: {
          include: {
            customerGroup: { select: { id: true, name: true } },
          },
        },
        locations: {
          include: {
            locationType: { select: { id: true, code: true, name: true, color: true, icon: true } },
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

    return contact;
  }

  async create(dto: CreateContactDto, user: User) {
    // WP-B3 (B-503): effectieve org — voor een SUPERUSER op een org-subdomein
    // is dat de tenant-org (via de TenantGuard); zonder org een nette NL-400
    // in plaats van een Prisma-fout (500).
    const orgId = requireOrg(user);

    const customFields = dto.customFields
      ? await this.customFieldsValidator.validateAndSanitize(orgId, 'CONTACT', dto.customFields)
      : null;

    // A supplied owner is read back by findOne — verify it is a user in the caller's org.
    await assertSameOrg(this.prisma.user, dto.ownerId, orgId, 'Eigenaar');

    return this.prisma.contact.create({
      data: {
        orgId,
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
        isSupplier: dto.isSupplier ?? false,
        supplierCustomerNumber: dto.supplierCustomerNumber,
        purchaseConditions: dto.purchaseConditions,
        supplierRating: dto.supplierRating,
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
      // The new owner is read back by findOne — verify it is a user in the caller's org.
      await assertSameOrg(this.prisma.user, dto.ownerId, user.orgId, 'Eigenaar');
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
        ...(dto.isSupplier !== undefined && { isSupplier: dto.isSupplier }),
        ...(dto.supplierCustomerNumber !== undefined && { supplierCustomerNumber: dto.supplierCustomerNumber }),
        ...(dto.purchaseConditions !== undefined && { purchaseConditions: dto.purchaseConditions }),
        ...(dto.supplierRating !== undefined && { supplierRating: dto.supplierRating }),
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

    // Customer groups must belong to the same organization as the contact
    await assertAllSameOrg(this.prisma.customerGroup, groupIds, contact.orgId, 'klantgroepen');

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
