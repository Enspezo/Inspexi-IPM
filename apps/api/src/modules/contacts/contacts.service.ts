import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { EmailService } from '@/common/services/email.service';
import {
  CreateContactDto,
  UpdateContactDto,
  CreateContactAddressDto,
  CreateLocationDto,
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
  ) {}

  async findAll(user: User, query: ListContactsQueryDto) {
    const { search, type, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = {
      isDeleted: false,
    };

    // Org scoping — SUPERUSER sees all, others scoped to own org
    if (user.role !== Role.SUPERUSER) {
      where.orgId = user.orgId!;
    }

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { companyName: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        include: {
          addresses: true,
        },
        orderBy: { createdAt: 'desc' },
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
        locations: true,
        logs: {
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { loggedAt: 'desc' },
        },
        emails: {
          include: { user: { select: { firstName: true, lastName: true } } },
          orderBy: { sentAt: 'desc' },
        },
      },
    });

    if (!contact || contact.isDeleted) {
      throw new NotFoundException('Relatie niet gevonden');
    }

    // Check org scoping
    if (user.role !== Role.SUPERUSER && contact.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return contact;
  }

  async create(dto: CreateContactDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && user.role !== Role.SUPERUSER) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

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
        cocNumber: dto.cocNumber,
        notes: dto.notes,
      },
      include: { addresses: true },
    });
  }

  async update(id: string, dto: UpdateContactDto, user: User) {
    const contact = await this.findOne(id, user);

    return this.prisma.contact.update({
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
        ...(dto.cocNumber !== undefined && { cocNumber: dto.cocNumber }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: { addresses: true },
    });
  }

  async softDelete(id: string, user: User) {
    const contact = await this.findOne(id, user);

    await this.prisma.contact.update({
      where: { id: contact.id },
      data: { isDeleted: true },
    });
  }

  async addAddress(contactId: string, dto: CreateContactAddressDto, user: User) {
    const contact = await this.findOne(contactId, user);

    // If setting as primary, unset other primary addresses in a transaction
    if (dto.isPrimary) {
      return this.prisma.$transaction(async (tx) => {
        await tx.contactAddress.updateMany({
          where: { contactId: contact.id, isPrimary: true },
          data: { isPrimary: false },
        });

        return tx.contactAddress.create({
          data: {
            contactId: contact.id,
            label: dto.label,
            street: dto.street,
            houseNumber: dto.houseNumber,
            postalCode: dto.postalCode,
            city: dto.city,
            country: dto.country ?? 'NL',
            isPrimary: true,
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
      },
    });
  }

  async addLocation(contactId: string, dto: CreateLocationDto, user: User) {
    const contact = await this.findOne(contactId, user);

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

    // Send via Resend (EmailService)
    let resendId: string | undefined;
    try {
      const result = await this.emailService.sendContactEmail(
        contact.email,
        dto.subject,
        dto.bodyHtml,
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
}
