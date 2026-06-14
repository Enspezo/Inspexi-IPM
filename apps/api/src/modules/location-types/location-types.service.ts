import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateLocationTypeDto,
  UpdateLocationTypeDto,
  CreateLocationTypeFieldDto,
  UpdateLocationTypeFieldDto,
  ConstraintItemDto,
} from './dto';

@Injectable()
export class LocationTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alle (zichtbare) locatie-types: eigen org + systeem. Superuser (orgId null) ziet alles. */
  async findAll(user: User, options?: { normType?: string; includeSystem?: boolean }) {
    const orgId = user.orgId;
    const { normType, includeSystem = true } = options || {};

    const where: Prisma.LocationTypeDefinitionWhereInput = orgId
      ? {
          deletedAt: null,
          OR: [
            { orgId },
            ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
          ],
        }
      : { deletedAt: null };

    const locationTypes = await this.prisma.locationTypeDefinition.findMany({
      where,
      include: {
        fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        parentConstraints: {
          include: { allowedParentType: { select: { id: true, code: true, name: true } } },
        },
        _count: { select: { fields: true } },
      },
      orderBy: [{ isSystem: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    if (normType) {
      return locationTypes.filter((lt) => (lt.normTypes as string[]).includes(normType));
    }
    return locationTypes;
  }

  async findById(id: string, user: User) {
    const orgId = user.orgId;
    const locationType = await this.prisma.locationTypeDefinition.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(orgId ? { OR: [{ orgId }, { orgId: null, isSystem: true }] } : {}),
      },
      include: {
        fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        parentConstraints: {
          include: { allowedParentType: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!locationType) throw new NotFoundException('Locatie-type niet gevonden');
    return locationType;
  }

  async findByCode(code: string, user: User) {
    const orgId = user.orgId;
    // Eerst org-specifiek, anders systeem (of alles voor superuser)
    let locationType = orgId
      ? await this.prisma.locationTypeDefinition.findFirst({
          where: { code, orgId, deletedAt: null },
          include: {
            fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            parentConstraints: {
              include: { allowedParentType: { select: { id: true, code: true, name: true } } },
            },
          },
        })
      : null;

    if (!locationType) {
      locationType = await this.prisma.locationTypeDefinition.findFirst({
        where: {
          code,
          ...(orgId ? { orgId: null, isSystem: true } : {}),
          deletedAt: null,
        },
        include: {
          fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
          parentConstraints: {
            include: { allowedParentType: { select: { id: true, code: true, name: true } } },
          },
        },
      });
    }
    return locationType;
  }

  async create(user: User, dto: CreateLocationTypeDto) {
    const orgId = user.orgId;
    const isSystem = orgId === null; // superuser → systeemtype

    const existing = await this.prisma.locationTypeDefinition.findFirst({
      where: { code: dto.code, orgId: isSystem ? null : orgId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`Locatie-type met code '${dto.code}' bestaat al`);
    }

    return this.prisma.locationTypeDefinition.create({
      data: {
        orgId: isSystem ? null : orgId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        normTypes: dto.normTypes ?? [],
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        isSystem,
      },
      include: { fields: true, parentConstraints: true },
    });
  }

  async update(id: string, user: User, dto: UpdateLocationTypeDto) {
    const locationType = await this.findById(id, user);
    this.assertManageable(locationType, user);

    return this.prisma.locationTypeDefinition.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        icon: dto.icon,
        color: dto.color,
        normTypes: dto.normTypes,
        sortOrder: dto.sortOrder,
        isActive: dto.isActive,
      },
      include: {
        fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
        parentConstraints: true,
      },
    });
  }

  async delete(id: string, user: User) {
    const locationType = await this.findById(id, user);
    this.assertManageable(locationType, user);
    return this.prisma.locationTypeDefinition.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Systeemtype kopiëren naar de eigen org (fork). Vereist een org. */
  async duplicate(id: string, user: User) {
    const orgId = user.orgId;
    if (!orgId) {
      throw new ForbiddenException('Een organisatie is vereist om te dupliceren');
    }
    const source = await this.findById(id, user);

    const existing = await this.prisma.locationTypeDefinition.findFirst({
      where: { code: source.code, orgId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`U heeft al een locatie-type met code '${source.code}'`);
    }

    const duplicate = await this.prisma.locationTypeDefinition.create({
      data: {
        orgId,
        code: source.code,
        name: source.name,
        description: source.description,
        icon: source.icon,
        color: source.color,
        normTypes: source.normTypes as string[],
        sortOrder: source.sortOrder,
        isSystem: false,
      },
    });

    for (const field of source.fields) {
      await this.prisma.locationTypeField.create({
        data: {
          locationTypeDefinitionId: duplicate.id,
          fieldKey: field.fieldKey,
          label: field.label,
          description: field.description,
          helpText: field.helpText,
          fieldType: field.fieldType,
          isRequired: field.isRequired,
          defaultValue: field.defaultValue,
          placeholder: field.placeholder,
          validationRules: field.validationRules as Prisma.InputJsonValue,
          unit: field.unit,
          sortOrder: field.sortOrder,
          displayWidth: field.displayWidth,
          groupName: field.groupName,
        },
      });
    }

    for (const constraint of source.parentConstraints) {
      let allowedParentTypeId = constraint.allowedParentTypeId;
      if (allowedParentTypeId) {
        // Als de org dit ouder-type heeft geforkt, wijs naar de org-variant
        const orgParent = await this.prisma.locationTypeDefinition.findFirst({
          where: { code: constraint.allowedParentType?.code, orgId, deletedAt: null },
        });
        if (orgParent) allowedParentTypeId = orgParent.id;
      }
      await this.prisma.locationTypeConstraint.create({
        data: {
          locationTypeDefinitionId: duplicate.id,
          allowedParentTypeId,
          isRequired: constraint.isRequired,
        },
      });
    }

    return this.findById(duplicate.id, user);
  }

  // ── Velden ────────────────────────────────────────────

  async getFields(locationTypeId: string, user: User) {
    await this.findById(locationTypeId, user); // toegangscontrole
    return this.prisma.locationTypeField.findMany({
      where: { locationTypeDefinitionId: locationTypeId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addField(locationTypeId: string, user: User, dto: CreateLocationTypeFieldDto) {
    const locationType = await this.findById(locationTypeId, user);
    this.assertManageable(locationType, user);

    const existing = await this.prisma.locationTypeField.findFirst({
      where: { locationTypeDefinitionId: locationTypeId, fieldKey: dto.fieldKey },
    });
    if (existing) {
      throw new BadRequestException(`Veld met key '${dto.fieldKey}' bestaat al`);
    }

    const maxOrder = await this.prisma.locationTypeField.aggregate({
      where: { locationTypeDefinitionId: locationTypeId },
      _max: { sortOrder: true },
    });

    return this.prisma.locationTypeField.create({
      data: {
        locationTypeDefinitionId: locationTypeId,
        fieldKey: dto.fieldKey,
        label: dto.label,
        description: dto.description,
        helpText: dto.helpText,
        fieldType: dto.fieldType,
        isRequired: dto.isRequired ?? false,
        defaultValue: dto.defaultValue,
        placeholder: dto.placeholder,
        validationRules: (dto.validationRules ?? {}) as Prisma.InputJsonValue,
        unit: dto.unit,
        sortOrder: dto.sortOrder ?? (maxOrder._max.sortOrder ?? 0) + 1,
        displayWidth: dto.displayWidth,
        groupName: dto.groupName,
      },
    });
  }

  async updateField(fieldId: string, user: User, dto: UpdateLocationTypeFieldDto) {
    const field = await this.prisma.locationTypeField.findUnique({
      where: { id: fieldId },
      include: { locationTypeDefinition: true },
    });
    if (!field) throw new NotFoundException('Veld niet gevonden');
    this.assertManageable(field.locationTypeDefinition, user);

    return this.prisma.locationTypeField.update({
      where: { id: fieldId },
      data: {
        label: dto.label,
        description: dto.description,
        helpText: dto.helpText,
        fieldType: dto.fieldType,
        isRequired: dto.isRequired,
        defaultValue: dto.defaultValue,
        placeholder: dto.placeholder,
        validationRules: dto.validationRules as Prisma.InputJsonValue | undefined,
        unit: dto.unit,
        sortOrder: dto.sortOrder,
        displayWidth: dto.displayWidth,
        groupName: dto.groupName,
        isActive: dto.isActive,
      },
    });
  }

  async deleteField(fieldId: string, user: User) {
    const field = await this.prisma.locationTypeField.findUnique({
      where: { id: fieldId },
      include: { locationTypeDefinition: true },
    });
    if (!field) throw new NotFoundException('Veld niet gevonden');
    this.assertManageable(field.locationTypeDefinition, user);

    return this.prisma.locationTypeField.update({
      where: { id: fieldId },
      data: { isActive: false }, // soft-delete
    });
  }

  async reorderFields(locationTypeId: string, user: User, fieldIds: string[]) {
    const locationType = await this.findById(locationTypeId, user);
    this.assertManageable(locationType, user);

    await this.prisma.$transaction(
      fieldIds.map((fieldId, index) =>
        this.prisma.locationTypeField.update({ where: { id: fieldId }, data: { sortOrder: index } }),
      ),
    );
    return this.getFields(locationTypeId, user);
  }

  // ── Parent-constraints ────────────────────────────────

  async getConstraints(locationTypeId: string, user: User) {
    await this.findById(locationTypeId, user);
    return this.prisma.locationTypeConstraint.findMany({
      where: { locationTypeDefinitionId: locationTypeId },
      include: { allowedParentType: { select: { id: true, code: true, name: true } } },
    });
  }

  async setConstraints(locationTypeId: string, user: User, constraints: ConstraintItemDto[]) {
    const locationType = await this.findById(locationTypeId, user);
    this.assertManageable(locationType, user);

    // Tenant-veiligheid: elk genoemd ouder-type moet zichtbaar zijn voor deze org/systeem
    for (const c of constraints) {
      if (c.allowedParentTypeId) await this.findById(c.allowedParentTypeId, user);
    }

    await this.prisma.locationTypeConstraint.deleteMany({
      where: { locationTypeDefinitionId: locationTypeId },
    });
    for (const c of constraints) {
      await this.prisma.locationTypeConstraint.create({
        data: {
          locationTypeDefinitionId: locationTypeId,
          allowedParentTypeId: c.allowedParentTypeId || null,
          isRequired: c.isRequired || false,
        },
      });
    }
    return this.getConstraints(locationTypeId, user);
  }

  /** Valideer of parent toegestaan is voor een locatie-type (gebruikt door PWA bij boom-opbouw). */
  async validateParentConstraint(
    locationTypeCode: string,
    parentLocationTypeCode: string | null,
    user: User,
  ): Promise<{ valid: boolean; message?: string }> {
    const locationType = await this.findByCode(locationTypeCode, user);
    if (!locationType) return { valid: false, message: `Onbekend locatie-type: ${locationTypeCode}` };

    const constraints = locationType.parentConstraints;
    if (constraints.length === 0) return { valid: true };

    if (!parentLocationTypeCode) {
      const canBeRoot = constraints.some((c) => c.allowedParentTypeId === null);
      return canBeRoot
        ? { valid: true }
        : { valid: false, message: `Locatie-type '${locationTypeCode}' kan geen root zijn` };
    }

    const parentType = await this.findByCode(parentLocationTypeCode, user);
    if (!parentType) {
      return { valid: false, message: `Onbekend ouder-type: ${parentLocationTypeCode}` };
    }

    const isAllowed = constraints.some(
      (c) =>
        c.allowedParentTypeId === parentType.id ||
        c.allowedParentType?.code === parentLocationTypeCode,
    );
    if (isAllowed) return { valid: true };

    const allowedParents = constraints
      .filter((c) => c.allowedParentType)
      .map((c) => c.allowedParentType!.name)
      .join(', ');
    return {
      valid: false,
      message: `Locatie-type '${locationType.name}' mag alleen deze ouder-types hebben: ${allowedParents || 'geen (moet root zijn)'}`,
    };
  }

  /** Gemergede lijst: org-rij overschrijft systeemrij met dezelfde code. */
  async getMergedLocationTypes(user: User, normType?: string) {
    const all = await this.findAll(user, { normType, includeSystem: true });
    const byCode = new Map<string, (typeof all)[number]>();
    for (const type of all) {
      const existing = byCode.get(type.code);
      if (!existing || (existing.isSystem && !type.isSystem)) byCode.set(type.code, type);
    }
    return [...byCode.values()].sort((a, b) =>
      a.sortOrder !== b.sortOrder ? a.sortOrder - b.sortOrder : a.name.localeCompare(b.name),
    );
  }

  /** Systeemrijen alleen door superuser; org-rijen alleen door de eigen org. */
  private assertManageable(
    lt: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    if (lt.isSystem) {
      if (user.orgId !== null) {
        throw new ForbiddenException('Systeem-locatie-types zijn alleen-lezen. Dupliceer eerst.');
      }
    } else if (lt.orgId !== user.orgId) {
      throw new ForbiddenException('Dit locatie-type hoort niet bij uw organisatie');
    }
  }
}
