import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound } from '@/common';
import { ContactsService } from './contacts.service';
import {
  CreateContactPersonDto,
  UpdateContactPersonDto,
  ListContactPersonsQueryDto,
} from './dto';

@Injectable()
export class ContactPersonsService {
  constructor(
    private prisma: PrismaService,
    private contactsService: ContactsService,
  ) {}

  async findAllContactPersons(user: User, query: ListContactPersonsQueryDto) {
    const { search, roleId, contactId, page = 1, limit = 20 } = query;

    const where: Prisma.ContactPersonWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (contactId) {
      where.contactId = contactId;
    }

    if (roleId) {
      where.roleId = roleId;
    }

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    return paginate(this.prisma.contactPerson, {
      where,
      include: {
        role: { select: { id: true, code: true, label: true } },
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
      page,
      limit,
    });
  }

  /**
   * Valideert dat een rol-ID bestaat en hoort bij de org van de gebruiker
   * of een globale default is. Geeft de rol-ID terug, of de "Algemeen"-default
   * wanneer er geen is opgegeven.
   */
  private async resolveContactPersonRoleId(
    roleId: string | undefined,
    orgId: string | null,
  ): Promise<string | null> {
    // Bouw de scope expliciet zodat een null orgId niet per ongeluk alle orgs matcht
    const scope = orgId ? [{ orgId: null }, { orgId }] : [{ orgId: null }];

    if (roleId) {
      const role = assertFound(
        await this.prisma.contactPersonRoleOption.findFirst({
          where: { id: roleId, OR: scope },
        }),
        'Rol',
      );
      return role.id;
    }

    // Geen rol opgegeven → val terug op de "Algemeen"-default (org-specifiek of globaal)
    const fallback = await this.prisma.contactPersonRoleOption.findFirst({
      where: { code: 'ALGEMEEN', OR: scope },
      orderBy: { orgId: { sort: 'desc', nulls: 'last' } },
    });
    return fallback?.id ?? null;
  }

  async addContactPerson(contactId: string, dto: CreateContactPersonDto, user: User) {
    const contact = await this.contactsService.findOne(contactId, user);
    const roleId = await this.resolveContactPersonRoleId(dto.roleId, contact.orgId);

    return this.prisma.contactPerson.create({
      data: {
        contactId: contact.id,
        orgId: contact.orgId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email,
        phone: dto.phone,
        roleId,
        notes: dto.notes,
      },
      include: {
        role: { select: { id: true, code: true, label: true } },
      },
    });
  }

  async findContactPerson(id: string, user: User) {
    const person = await this.prisma.contactPerson.findUnique({
      where: { id },
      include: {
        contact: true,
        role: { select: { id: true, code: true, label: true } },
      },
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

    const roleId =
      dto.roleId !== undefined
        ? await this.resolveContactPersonRoleId(dto.roleId, person.orgId)
        : undefined;

    return this.prisma.contactPerson.update({
      where: { id: person.id },
      data: {
        ...(dto.firstName !== undefined && { firstName: dto.firstName }),
        ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(roleId !== undefined && { roleId }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
      },
      include: {
        role: { select: { id: true, code: true, label: true } },
      },
    });
  }

  /** Lijst van actieve contactpersoon-rollen (globaal + org-specifiek). */
  async findContactPersonRoles(user: User) {
    const scope = user.orgId
      ? [{ orgId: null }, { orgId: user.orgId }]
      : [{ orgId: null }];
    return this.prisma.contactPersonRoleOption.findMany({
      where: { isActive: true, OR: scope },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
    });
  }

  async deleteContactPerson(id: string, user: User) {
    const person = await this.findContactPerson(id, user);

    await this.prisma.contactPerson.update({
      where: { id: person.id },
      data: { isDeleted: true },
    });
  }

  async findContactPersonLocations(contactPersonId: string, user: User) {
    const person = await this.findContactPerson(contactPersonId, user);

    return this.prisma.locationContactPerson.findMany({
      where: { contactPersonId: person.id },
      include: {
        location: {
          select: {
            id: true,
            name: true,
            street: true,
            houseNumber: true,
            postalCode: true,
            city: true,
            objectType: true,
            contactId: true,
            contact: {
              select: { id: true, type: true, companyName: true, firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
