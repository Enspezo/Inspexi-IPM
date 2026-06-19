// Doel in apps/api: src/modules/asset-types/asset-types.service.ts
//
// GOLDEN PATH voor CONFIG-modules (org + isSystem merge). Geport uit Inspexi-App,
// omgezet naar Beheer-conventies:
//  - organizationId → user.orgId  (superuser = orgId null → ziet/beheert systeemrijen)
//  - org ziet eigen rijen + systeemrijen (orgId null); /merged overlayt op `code`
//  - mutaties: systeemrijen alleen door superuser; org-rijen alleen door eigen org
//  - soft-delete via deletedAt; velden soft-delete via isActive=false
//
// Hetzelfde patroon geldt voor location-types, categories, checklists,
// finding-templates, classification-models en inspection-templates.

import {
  Injectable, NotFoundException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateAssetTypeDto, UpdateAssetTypeDto,
  CreateAssetTypeFieldDto, UpdateAssetTypeFieldDto, ConstraintItemDto,
} from './dto';

@Injectable()
export class AssetTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Alle (zichtbare) asset-types: eigen org + systeem. Superuser (orgId null) ziet alles. */
  async findAll(user: User, options?: { normType?: string; includeSystem?: boolean }) {
    const orgId = user.orgId;
    const { normType, includeSystem = true } = options || {};

    const where: Prisma.AssetTypeDefinitionWhereInput = orgId
      ? {
          deletedAt: null,
          OR: [
            { orgId },
            ...(includeSystem ? [{ orgId: null, isSystem: true }] : []),
          ],
        }
      : { deletedAt: null };

    const assetTypes = await this.prisma.assetTypeDefinition.findMany({
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
      return assetTypes.filter((at) => (at.normTypes as string[]).includes(normType));
    }
    return assetTypes;
  }

  async findById(id: string, user: User) {
    const orgId = user.orgId;
    const assetType = await this.prisma.assetTypeDefinition.findFirst({
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
        measurementConfigs: {
          include: { measurementFieldTemplate: true },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    if (!assetType) throw new NotFoundException('Asset-type niet gevonden');
    return assetType;
  }

  async findByCode(code: string, user: User) {
    const orgId = user.orgId;
    // Eerst org-specifiek, anders systeem (of alles voor superuser)
    let assetType = orgId
      ? await this.prisma.assetTypeDefinition.findFirst({
          where: { code, orgId, deletedAt: null },
          include: {
            fields: { where: { isActive: true }, orderBy: { sortOrder: 'asc' } },
            parentConstraints: {
              include: { allowedParentType: { select: { id: true, code: true, name: true } } },
            },
          },
        })
      : null;

    if (!assetType) {
      assetType = await this.prisma.assetTypeDefinition.findFirst({
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
    return assetType;
  }

  async create(user: User, dto: CreateAssetTypeDto) {
    const orgId = user.orgId;
    const isSystem = orgId === null; // superuser → systeemtype

    const existing = await this.prisma.assetTypeDefinition.findFirst({
      where: { code: dto.code, orgId: isSystem ? null : orgId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`Asset-type met code '${dto.code}' bestaat al`);
    }

    return this.prisma.assetTypeDefinition.create({
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

  async update(id: string, user: User, dto: UpdateAssetTypeDto) {
    const assetType = await this.findById(id, user);
    this.assertManageable(assetType, user);

    return this.prisma.assetTypeDefinition.update({
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
    const assetType = await this.findById(id, user);
    this.assertManageable(assetType, user);
    return this.prisma.assetTypeDefinition.update({
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

    const existing = await this.prisma.assetTypeDefinition.findFirst({
      where: { code: source.code, orgId, deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`U heeft al een asset-type met code '${source.code}'`);
    }

    const duplicate = await this.prisma.assetTypeDefinition.create({
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
      await this.prisma.assetTypeField.create({
        data: {
          assetTypeDefinitionId: duplicate.id,
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
        const orgParent = await this.prisma.assetTypeDefinition.findFirst({
          where: { code: constraint.allowedParentType?.code, orgId, deletedAt: null },
        });
        if (orgParent) allowedParentTypeId = orgParent.id;
      }
      await this.prisma.assetTypeConstraint.create({
        data: {
          assetTypeDefinitionId: duplicate.id,
          allowedParentTypeId,
          isRequired: constraint.isRequired,
        },
      });
    }

    return this.findById(duplicate.id, user);
  }

  // ── Velden ────────────────────────────────────────────

  async getFields(assetTypeId: string, user: User) {
    await this.findById(assetTypeId, user); // toegangscontrole
    return this.prisma.assetTypeField.findMany({
      where: { assetTypeDefinitionId: assetTypeId, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async addField(assetTypeId: string, user: User, dto: CreateAssetTypeFieldDto) {
    const assetType = await this.findById(assetTypeId, user);
    this.assertManageable(assetType, user);

    const existing = await this.prisma.assetTypeField.findFirst({
      where: { assetTypeDefinitionId: assetTypeId, fieldKey: dto.fieldKey },
    });
    if (existing) {
      throw new BadRequestException(`Veld met key '${dto.fieldKey}' bestaat al`);
    }

    const maxOrder = await this.prisma.assetTypeField.aggregate({
      where: { assetTypeDefinitionId: assetTypeId },
      _max: { sortOrder: true },
    });

    return this.prisma.assetTypeField.create({
      data: {
        assetTypeDefinitionId: assetTypeId,
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

  async updateField(fieldId: string, user: User, dto: UpdateAssetTypeFieldDto) {
    const field = await this.prisma.assetTypeField.findUnique({
      where: { id: fieldId },
      include: { assetTypeDefinition: true },
    });
    if (!field) throw new NotFoundException('Veld niet gevonden');
    this.assertManageable(field.assetTypeDefinition, user);

    return this.prisma.assetTypeField.update({
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
    const field = await this.prisma.assetTypeField.findUnique({
      where: { id: fieldId },
      include: { assetTypeDefinition: true },
    });
    if (!field) throw new NotFoundException('Veld niet gevonden');
    this.assertManageable(field.assetTypeDefinition, user);

    return this.prisma.assetTypeField.update({
      where: { id: fieldId },
      data: { isActive: false }, // soft-delete
    });
  }

  async reorderFields(assetTypeId: string, user: User, fieldIds: string[]) {
    const assetType = await this.findById(assetTypeId, user);
    this.assertManageable(assetType, user);

    await this.prisma.$transaction(
      fieldIds.map((fieldId, index) =>
        this.prisma.assetTypeField.update({ where: { id: fieldId }, data: { sortOrder: index } }),
      ),
    );
    return this.getFields(assetTypeId, user);
  }

  // ── Parent-constraints ────────────────────────────────

  async getConstraints(assetTypeId: string, user: User) {
    await this.findById(assetTypeId, user);
    return this.prisma.assetTypeConstraint.findMany({
      where: { assetTypeDefinitionId: assetTypeId },
      include: { allowedParentType: { select: { id: true, code: true, name: true } } },
    });
  }

  async setConstraints(assetTypeId: string, user: User, constraints: ConstraintItemDto[]) {
    const assetType = await this.findById(assetTypeId, user);
    this.assertManageable(assetType, user);

    // Tenant-veiligheid: elk genoemd ouder-type moet zichtbaar zijn voor deze org/systeem
    for (const c of constraints) {
      if (c.allowedParentTypeId) await this.findById(c.allowedParentTypeId, user);
    }

    await this.prisma.assetTypeConstraint.deleteMany({
      where: { assetTypeDefinitionId: assetTypeId },
    });
    for (const c of constraints) {
      await this.prisma.assetTypeConstraint.create({
        data: {
          assetTypeDefinitionId: assetTypeId,
          allowedParentTypeId: c.allowedParentTypeId || null,
          isRequired: c.isRequired || false,
        },
      });
    }
    return this.getConstraints(assetTypeId, user);
  }

  /** Valideer of parent toegestaan is voor een asset-type (gebruikt door PWA bij boom-opbouw). */
  async validateParentConstraint(
    assetTypeCode: string,
    parentAssetTypeCode: string | null,
    user: User,
  ): Promise<{ valid: boolean; message?: string }> {
    const assetType = await this.findByCode(assetTypeCode, user);
    if (!assetType) return { valid: false, message: `Onbekend asset-type: ${assetTypeCode}` };

    const constraints = assetType.parentConstraints;
    if (constraints.length === 0) return { valid: true };

    if (!parentAssetTypeCode) {
      const canBeRoot = constraints.some((c) => c.allowedParentTypeId === null);
      return canBeRoot
        ? { valid: true }
        : { valid: false, message: `Asset-type '${assetTypeCode}' kan geen root zijn` };
    }

    const parentType = await this.findByCode(parentAssetTypeCode, user);
    if (!parentType) {
      return { valid: false, message: `Onbekend ouder-type: ${parentAssetTypeCode}` };
    }

    const isAllowed = constraints.some(
      (c) =>
        c.allowedParentTypeId === parentType.id ||
        c.allowedParentType?.code === parentAssetTypeCode,
    );
    if (isAllowed) return { valid: true };

    const allowedParents = constraints
      .filter((c) => c.allowedParentType)
      .map((c) => c.allowedParentType!.name)
      .join(', ');
    return {
      valid: false,
      message: `Asset-type '${assetType.name}' mag alleen deze ouder-types hebben: ${allowedParents || 'geen (moet root zijn)'}`,
    };
  }

  /** Gemergede lijst: org-rij overschrijft systeemrij met dezelfde code. */
  async getMergedAssetTypes(user: User, normType?: string) {
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
    at: { isSystem: boolean; orgId: string | null },
    user: User,
  ): void {
    if (at.isSystem) {
      if (user.orgId !== null) {
        throw new ForbiddenException('Systeem-asset-types zijn alleen-lezen. Dupliceer eerst.');
      }
    } else if (at.orgId !== user.orgId) {
      throw new ForbiddenException('Dit asset-type hoort niet bij uw organisatie');
    }
  }
}
