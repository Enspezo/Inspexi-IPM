import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { MeasurementSheetTemplateStatus, Prisma, Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateMeasurementSheetTemplateDto,
  UpdateMeasurementSheetTemplateDto,
  QueryMeasurementSheetTemplatesDto,
  PublishMeasurementSheetTemplateDto,
  RetireMeasurementSheetTemplateDto,
  NewVersionDto,
  UpdateFinalCheckRulesDto,
} from './dto';

@Injectable()
export class MeasurementSheetTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Schrijftoegang is globaal voorbehouden aan SUPERUSER — deze templates zijn
   * systeem-breed (geen orgId) en gelden voor alle organisaties.
   */
  private assertManageable(user: User): void {
    if (!user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException(
        'Alleen een superuser kan meetstaat-templates beheren',
      );
    }
  }

  /** Controleer dat de opgegeven normcode bestaat (cross-module via Prisma, geen DI). */
  private async assertNormTypeExists(normTypeCode: string): Promise<void> {
    const norm = await this.prisma.normTypeDefinition.findUnique({
      where: { code: normTypeCode },
    });
    if (!norm) {
      throw new BadRequestException(`Onbekende normcode: "${normTypeCode}"`);
    }
  }

  // =====================================================
  // TEMPLATE CRUD
  // =====================================================

  /**
   * Alle meetstaat-templates (globaal, zichtbaar voor iedereen).
   *
   * `includeSections` (WP-B1/B-205): de kale lijst gaf alleen `_count.sections`
   * terug, waardoor de PWA-referentiecache templates zonder invoervelden
   * opsloeg. Met `?include=sections` komen de secties + velden volledig mee en
   * vervalt de N+1 op de detail-route.
   */
  async findAll(
    options?: QueryMeasurementSheetTemplatesDto & { includeSections?: boolean },
  ) {
    const { normType, assetType, status, includeSections = false } = options || {};

    const andConditions: Prisma.MeasurementSheetTemplateWhereInput[] = [];

    if (normType) {
      andConditions.push({ normTypeCode: normType });
    }
    if (status) {
      andConditions.push({ status });
    }
    if (assetType) {
      andConditions.push({ assetTypes: { has: assetType } });
    }

    return this.prisma.measurementSheetTemplate.findMany({
      where: andConditions.length > 0 ? { AND: andConditions } : {},
      include: {
        _count: { select: { sections: true } },
        ...(includeSections
          ? {
              sections: {
                include: { fields: { orderBy: { sortOrder: 'asc' as const } } },
                orderBy: { sortOrder: 'asc' as const },
              },
            }
          : {}),
      },
      orderBy: [{ status: 'asc' }, { name: 'asc' }, { version: 'desc' }],
    });
  }

  /** Eén template met alle secties en velden. */
  async findById(id: string) {
    const template = await this.prisma.measurementSheetTemplate.findUnique({
      where: { id },
      include: {
        sections: {
          include: {
            fields: { orderBy: { sortOrder: 'asc' } },
          },
          orderBy: { sortOrder: 'asc' },
        },
        previousVersion: { select: { id: true, version: true, status: true } },
        nextVersions: { select: { id: true, version: true, status: true } },
      },
    });

    if (!template) {
      throw new NotFoundException('Meetstaat-template niet gevonden');
    }
    return template;
  }

  /**
   * Actief template voor een specifiek asset-type en norm (PWA).
   */
  async getActiveTemplateForAsset(
    normType: string,
    assetType: string,
    locationType?: string,
  ) {
    const whereConditions: Prisma.MeasurementSheetTemplateWhereInput = {
      normTypeCode: normType,
      status: MeasurementSheetTemplateStatus.ACTIEF,
      assetTypes: { has: assetType },
    };

    if (locationType) {
      whereConditions.locationTypes = { has: locationType };
    }

    return this.prisma.measurementSheetTemplate.findFirst({
      where: whereConditions,
      include: {
        sections: {
          include: {
            fields: { orderBy: { sortOrder: 'asc' } },
          },
          orderBy: { sortOrder: 'asc' },
        },
      },
      orderBy: { version: 'desc' },
    });
  }

  /** Bestaat er al een CONCEPT-versie voor deze code? (dubbele-preventie) */
  private async findConceptByCode(code: string) {
    return this.prisma.measurementSheetTemplate.findFirst({
      where: { code, status: MeasurementSheetTemplateStatus.CONCEPT },
    });
  }

  /** Nieuw template aanmaken (alleen SUPERUSER). */
  async create(user: User, dto: CreateMeasurementSheetTemplateDto) {
    this.assertManageable(user);
    await this.assertNormTypeExists(dto.normType);

    const existing = await this.findConceptByCode(dto.code);
    if (existing) {
      throw new BadRequestException(
        `Er bestaat al een conceptversie met code "${dto.code}"`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const newTemplate = await tx.measurementSheetTemplate.create({
        data: {
          code: dto.code,
          name: dto.name,
          description: dto.description,
          normTypeCode: dto.normType,
          assetTypes: dto.assetTypes,
          locationTypes: dto.locationTypes ?? [],
          createdBy: user.id,
          status: MeasurementSheetTemplateStatus.CONCEPT,
          version: '1.0',
        },
      });

      await tx.measurementSheetVersionHistory.create({
        data: {
          templateId: newTemplate.id,
          fromVersion: '1.0',
          toVersion: '1.0',
          fromStatus: MeasurementSheetTemplateStatus.CONCEPT,
          toStatus: MeasurementSheetTemplateStatus.CONCEPT,
          changeDescription: 'Template aangemaakt',
          changedBy: user.id,
          snapshot: {
            name: dto.name,
            code: dto.code,
            description: dto.description ?? null,
            normType: dto.normType,
            assetTypes: dto.assetTypes,
            locationTypes: dto.locationTypes ?? [],
            sections: [],
          },
        },
      });

      return newTemplate;
    });
  }

  /** Template bijwerken (alleen SUPERUSER, alleen CONCEPT). */
  async update(id: string, user: User, dto: UpdateMeasurementSheetTemplateDto) {
    this.assertManageable(user);
    const template = await this.findById(id);

    if (template.status !== MeasurementSheetTemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen templates met status CONCEPT kunnen bewerkt worden',
      );
    }

    if (dto.normType) {
      await this.assertNormTypeExists(dto.normType);
    }

    return this.prisma.measurementSheetTemplate.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        normTypeCode: dto.normType,
        assetTypes: dto.assetTypes,
        locationTypes: dto.locationTypes,
        updatedBy: user.id,
      },
    });
  }

  /** Template verwijderen (alleen SUPERUSER, alleen CONCEPT). */
  async delete(id: string, user: User) {
    this.assertManageable(user);
    const template = await this.findById(id);

    if (template.status !== MeasurementSheetTemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen templates met status CONCEPT kunnen verwijderd worden',
      );
    }

    await this.prisma.measurementSheetTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  // =====================================================
  // VERSIEBEHEER
  // =====================================================

  /** Publiceren (CONCEPT → ACTIEF). */
  async publish(
    id: string,
    user: User,
    dto: PublishMeasurementSheetTemplateDto,
  ) {
    this.assertManageable(user);
    const template = await this.findById(id);

    if (template.status !== MeasurementSheetTemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen CONCEPT-templates kunnen gepubliceerd worden',
      );
    }

    if (template.sections.length === 0) {
      throw new BadRequestException(
        'Een template zonder secties kan niet gepubliceerd worden',
      );
    }

    for (const section of template.sections) {
      if (section.fields.length === 0) {
        throw new BadRequestException(`Sectie "${section.name}" heeft geen velden`);
      }
    }

    const snapshot = this.createSnapshot(template);

    const [updatedTemplate] = await this.prisma.$transaction([
      this.prisma.measurementSheetTemplate.update({
        where: { id },
        data: {
          status: MeasurementSheetTemplateStatus.ACTIEF,
          publishedAt: new Date(),
          updatedBy: user.id,
        },
      }),
      this.prisma.measurementSheetVersionHistory.create({
        data: {
          templateId: id,
          fromVersion: template.version,
          toVersion: template.version,
          fromStatus: MeasurementSheetTemplateStatus.CONCEPT,
          toStatus: MeasurementSheetTemplateStatus.ACTIEF,
          changeDescription: dto.changeDescription,
          approvalReason: dto.approvalReason,
          changedBy: user.id,
          snapshot,
        },
      }),
    ]);

    return updatedTemplate;
  }

  /** Laten vervallen (ACTIEF → VERVALLEN). */
  async retire(id: string, user: User, dto: RetireMeasurementSheetTemplateDto) {
    this.assertManageable(user);
    const template = await this.findById(id);

    if (template.status !== MeasurementSheetTemplateStatus.ACTIEF) {
      throw new BadRequestException(
        'Alleen ACTIEVE templates kunnen vervallen worden verklaard',
      );
    }

    const [updatedTemplate] = await this.prisma.$transaction([
      this.prisma.measurementSheetTemplate.update({
        where: { id },
        data: {
          status: MeasurementSheetTemplateStatus.VERVALLEN,
          retiredAt: new Date(),
          updatedBy: user.id,
        },
      }),
      this.prisma.measurementSheetVersionHistory.create({
        data: {
          templateId: id,
          fromVersion: template.version,
          toVersion: template.version,
          fromStatus: MeasurementSheetTemplateStatus.ACTIEF,
          toStatus: MeasurementSheetTemplateStatus.VERVALLEN,
          changeDescription: dto.changeDescription,
          approvalReason: dto.approvalReason,
          changedBy: user.id,
        },
      }),
    ]);

    return updatedTemplate;
  }

  /** Nieuwe versie van een template maken (clone → CONCEPT, minor bump). */
  async createNewVersion(id: string, user: User, dto: NewVersionDto) {
    this.assertManageable(user);
    const template = await this.findById(id);

    const versionParts = template.version.split('.');
    const major = parseInt(versionParts[0], 10);
    const minor = parseInt(versionParts[1] || '0', 10);
    const newVersion = `${major}.${minor + 1}`;

    const newTemplate = await this.prisma.$transaction(async (tx) => {
      const created = await tx.measurementSheetTemplate.create({
        data: {
          code: template.code,
          name: template.name,
          description: template.description,
          normTypeCode: template.normTypeCode,
          assetTypes: template.assetTypes,
          locationTypes: template.locationTypes,
          version: newVersion,
          status: MeasurementSheetTemplateStatus.CONCEPT,
          previousVersionId: id,
          finalCheckRules: template.finalCheckRules as Prisma.InputJsonValue,
          createdBy: user.id,
        },
      });

      for (const section of template.sections) {
        const newSection = await tx.measurementSheetSection.create({
          data: {
            templateId: created.id,
            code: section.code,
            name: section.name,
            description: section.description,
            isRepeating: section.isRepeating,
            minRows: section.minRows,
            sortOrder: section.sortOrder,
            collapsible: section.collapsible,
            defaultCollapsed: section.defaultCollapsed,
            rowValidationRules:
              section.rowValidationRules as Prisma.InputJsonValue,
          },
        });

        if (section.fields.length > 0) {
          await tx.measurementSheetField.createMany({
            data: section.fields.map((field) => ({
              sectionId: newSection.id,
              code: field.code,
              name: field.name,
              description: field.description,
              fieldType: field.fieldType,
              sortOrder: field.sortOrder,
              placeholder: field.placeholder,
              width: field.width,
              unit: field.unit,
              decimals: field.decimals,
              minValue: field.minValue,
              maxValue: field.maxValue,
              dropdownOptions: field.dropdownOptions as
                | Prisma.InputJsonValue
                | undefined,
              formula: field.formula,
              formulaDependencies: field.formulaDependencies,
              isRequired: field.isRequired,
              passFailEnabled: field.passFailEnabled,
              passFailOperator: field.passFailOperator,
              passFailValue: field.passFailValue,
              passFailMinValue: field.passFailMinValue,
              passFailMaxValue: field.passFailMaxValue,
              passFailValues: field.passFailValues as
                | Prisma.InputJsonValue
                | undefined,
              passFailFailMessage: field.passFailFailMessage,
              autoFindingEnabled: field.autoFindingEnabled,
              autoFindingTemplateId: field.autoFindingTemplateId,
              copyValueOnNewRow: field.copyValueOnNewRow,
              allowBulkEdit: field.allowBulkEdit,
            })),
          });
        }
      }

      await tx.measurementSheetVersionHistory.create({
        data: {
          templateId: created.id,
          fromVersion: template.version,
          toVersion: newVersion,
          fromStatus: template.status,
          toStatus: MeasurementSheetTemplateStatus.CONCEPT,
          changeDescription:
            dto.changeDescription ||
            `Nieuwe versie gemaakt van v${template.version}`,
          changedBy: user.id,
        },
      });

      return created;
    });

    return this.findById(newTemplate.id);
  }

  /** Versiegeschiedenis van een template. */
  async getHistory(id: string) {
    await this.findById(id); // bestaanscontrole
    return this.prisma.measurementSheetVersionHistory.findMany({
      where: { templateId: id },
      orderBy: { changedAt: 'desc' },
    });
  }

  // =====================================================
  // FINAL-CHECK-REGELS
  // =====================================================

  /** Final-check-regels ophalen (Json-veld op het template). */
  async getFinalCheckRules(id: string) {
    const template = await this.findById(id);
    return template.finalCheckRules;
  }

  /** Final-check-regels vervangen (alleen SUPERUSER, alleen CONCEPT). */
  async updateFinalCheckRules(
    id: string,
    user: User,
    dto: UpdateFinalCheckRulesDto,
  ) {
    this.assertManageable(user);
    const template = await this.findById(id);

    if (template.status !== MeasurementSheetTemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen CONCEPT-templates kunnen hun regels bijwerken',
      );
    }

    return this.prisma.measurementSheetTemplate.update({
      where: { id },
      data: {
        finalCheckRules: dto.rules as unknown as Prisma.InputJsonValue,
        updatedBy: user.id,
      },
    });
  }

  // =====================================================
  // HELPERS
  // =====================================================

  /**
   * Controleer dat een template CONCEPT is (gebruikt door sectie-/veld-services).
   * Schrijfgating gebeurt op controller-niveau via @Roles(SUPERUSER).
   */
  async validateConceptStatus(id: string) {
    const template = await this.prisma.measurementSheetTemplate.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!template) {
      throw new NotFoundException('Meetstaat-template niet gevonden');
    }
    if (template.status !== MeasurementSheetTemplateStatus.CONCEPT) {
      throw new BadRequestException(
        'Alleen templates met status CONCEPT kunnen gewijzigd worden',
      );
    }
    return template;
  }

  /** Snapshot van het template voor de versiegeschiedenis. */
  private createSnapshot(template: Awaited<ReturnType<typeof this.findById>>) {
    return {
      name: template.name,
      code: template.code,
      description: template.description,
      normType: template.normTypeCode,
      assetTypes: template.assetTypes,
      locationTypes: template.locationTypes,
      finalCheckRules: template.finalCheckRules,
      sections: template.sections.map((section) => ({
        code: section.code,
        name: section.name,
        description: section.description,
        isRepeating: section.isRepeating,
        minRows: section.minRows,
        sortOrder: section.sortOrder,
        collapsible: section.collapsible,
        defaultCollapsed: section.defaultCollapsed,
        rowValidationRules: section.rowValidationRules,
        fields: section.fields.map((field) => ({
          code: field.code,
          name: field.name,
          description: field.description,
          fieldType: field.fieldType,
          sortOrder: field.sortOrder,
          placeholder: field.placeholder,
          width: field.width,
          unit: field.unit,
          decimals: field.decimals,
          minValue: field.minValue?.toString(),
          maxValue: field.maxValue?.toString(),
          dropdownOptions: field.dropdownOptions,
          formula: field.formula,
          formulaDependencies: field.formulaDependencies,
          isRequired: field.isRequired,
          passFailEnabled: field.passFailEnabled,
          passFailOperator: field.passFailOperator,
          passFailValue: field.passFailValue?.toString(),
          passFailMinValue: field.passFailMinValue?.toString(),
          passFailMaxValue: field.passFailMaxValue?.toString(),
          passFailValues: field.passFailValues,
          passFailFailMessage: field.passFailFailMessage,
          autoFindingEnabled: field.autoFindingEnabled,
          autoFindingTemplateId: field.autoFindingTemplateId,
          copyValueOnNewRow: field.copyValueOnNewRow,
          allowBulkEdit: field.allowBulkEdit,
        })),
      })),
    };
  }
}
