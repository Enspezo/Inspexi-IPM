import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { MeasurementSheetFieldType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { MeasurementSheetSectionsService } from './measurement-sheet-sections.service';
import { MeasurementSheetTemplatesService } from './measurement-sheet-templates.service';
import {
  CreateMeasurementSheetFieldDto,
  UpdateMeasurementSheetFieldDto,
} from './dto';

@Injectable()
export class MeasurementSheetFieldsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sectionsService: MeasurementSheetSectionsService,
    private readonly templatesService: MeasurementSheetTemplatesService,
  ) {}

  /** Veld aanmaken binnen een sectie. */
  async create(
    sectionId: string,
    userId: string,
    dto: CreateMeasurementSheetFieldDto,
  ) {
    const section = await this.sectionsService.findById(sectionId);
    await this.templatesService.validateConceptStatus(section.templateId);

    const existing = await this.prisma.measurementSheetField.findFirst({
      where: { sectionId, code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `Veld met code "${dto.code}" bestaat al in deze sectie`,
      );
    }

    this.validateFieldTypeOptions(dto);

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const maxSort = await this.prisma.measurementSheetField.aggregate({
        where: { sectionId },
        _max: { sortOrder: true },
      });
      sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    }

    const field = await this.prisma.measurementSheetField.create({
      data: {
        sectionId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        fieldType: dto.fieldType,
        sortOrder,
        placeholder: dto.placeholder,
        width: dto.width,
        unit: dto.unit,
        decimals: dto.decimals,
        minValue: dto.minValue ?? null,
        maxValue: dto.maxValue ?? null,
        dropdownOptions: dto.dropdownOptions as unknown as
          | Prisma.InputJsonValue
          | undefined,
        formula: dto.formula,
        formulaDependencies: dto.formulaDependencies ?? [],
        isRequired: dto.isRequired ?? false,
        passFailEnabled: dto.passFailEnabled ?? false,
        passFailOperator: dto.passFailOperator,
        passFailValue: dto.passFailValue ?? null,
        passFailMinValue: dto.passFailMinValue ?? null,
        passFailMaxValue: dto.passFailMaxValue ?? null,
        passFailValues: dto.passFailValues as unknown as
          | Prisma.InputJsonValue
          | undefined,
        passFailFailMessage: dto.passFailFailMessage,
        autoFindingEnabled: dto.autoFindingEnabled ?? false,
        autoFindingTemplateId: dto.autoFindingTemplateId,
        copyValueOnNewRow: dto.copyValueOnNewRow ?? false,
        allowBulkEdit: dto.allowBulkEdit ?? false,
      },
    });

    await this.prisma.measurementSheetTemplate.update({
      where: { id: section.templateId },
      data: { updatedBy: userId },
    });

    return field;
  }

  /** Veld bijwerken. */
  async update(
    fieldId: string,
    userId: string,
    dto: UpdateMeasurementSheetFieldDto,
  ) {
    const field = await this.findById(fieldId);
    const section = await this.sectionsService.findById(field.sectionId);
    await this.templatesService.validateConceptStatus(section.templateId);

    if (dto.fieldType) {
      this.validateFieldTypeOptions({
        ...dto,
        fieldType: dto.fieldType,
        code: field.code,
        name: dto.name || field.name,
      } as CreateMeasurementSheetFieldDto);
    }

    const updated = await this.prisma.measurementSheetField.update({
      where: { id: fieldId },
      data: {
        name: dto.name,
        description: dto.description,
        fieldType: dto.fieldType,
        placeholder: dto.placeholder,
        width: dto.width,
        unit: dto.unit,
        decimals: dto.decimals,
        minValue: dto.minValue,
        maxValue: dto.maxValue,
        dropdownOptions: dto.dropdownOptions as unknown as
          | Prisma.InputJsonValue
          | undefined,
        formula: dto.formula,
        formulaDependencies: dto.formulaDependencies,
        isRequired: dto.isRequired,
        passFailEnabled: dto.passFailEnabled,
        passFailOperator: dto.passFailOperator,
        passFailValue: dto.passFailValue,
        passFailMinValue: dto.passFailMinValue,
        passFailMaxValue: dto.passFailMaxValue,
        passFailValues: dto.passFailValues as unknown as
          | Prisma.InputJsonValue
          | undefined,
        passFailFailMessage: dto.passFailFailMessage,
        autoFindingEnabled: dto.autoFindingEnabled,
        autoFindingTemplateId: dto.autoFindingTemplateId,
        copyValueOnNewRow: dto.copyValueOnNewRow,
        allowBulkEdit: dto.allowBulkEdit,
      },
    });

    await this.prisma.measurementSheetTemplate.update({
      where: { id: section.templateId },
      data: { updatedBy: userId },
    });

    return updated;
  }

  /** Veld verwijderen. */
  async delete(fieldId: string, userId: string) {
    const field = await this.findById(fieldId);
    const section = await this.sectionsService.findById(field.sectionId);
    await this.templatesService.validateConceptStatus(section.templateId);

    await this.prisma.measurementSheetField.delete({ where: { id: fieldId } });

    await this.prisma.measurementSheetTemplate.update({
      where: { id: section.templateId },
      data: { updatedBy: userId },
    });

    return { deleted: true };
  }

  /** Velden herordenen binnen een sectie. */
  async reorder(sectionId: string, userId: string, fieldIds: string[]) {
    const section = await this.sectionsService.findById(sectionId);
    await this.templatesService.validateConceptStatus(section.templateId);

    const fields = await this.prisma.measurementSheetField.findMany({
      where: { sectionId },
      select: { id: true },
    });

    const existingIds = new Set(fields.map((f) => f.id));
    for (const id of fieldIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(
          `Veld "${id}" hoort niet bij deze sectie`,
        );
      }
    }

    await this.prisma.$transaction(
      fieldIds.map((id, index) =>
        this.prisma.measurementSheetField.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    await this.prisma.measurementSheetTemplate.update({
      where: { id: section.templateId },
      data: { updatedBy: userId },
    });

    return this.sectionsService.findById(sectionId);
  }

  /** Velden van een sectie (gesorteerd). */
  async getFields(sectionId: string) {
    await this.sectionsService.findById(sectionId); // bestaanscontrole
    return this.prisma.measurementSheetField.findMany({
      where: { sectionId },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Veld ophalen op id. */
  async findById(fieldId: string) {
    const field = await this.prisma.measurementSheetField.findUnique({
      where: { id: fieldId },
    });
    if (!field) {
      throw new NotFoundException('Veld niet gevonden');
    }
    return field;
  }

  /** Validatie van veldtype-specifieke opties. */
  private validateFieldTypeOptions(dto: CreateMeasurementSheetFieldDto) {
    const {
      fieldType,
      dropdownOptions,
      formula,
      passFailEnabled,
      passFailOperator,
    } = dto;

    if (fieldType === MeasurementSheetFieldType.DROPDOWN) {
      if (!dropdownOptions || dropdownOptions.length === 0) {
        throw new BadRequestException(
          'Dropdown-velden moeten minstens één optie hebben',
        );
      }
    }

    if (fieldType === MeasurementSheetFieldType.CALCULATED) {
      if (!formula || formula.trim() === '') {
        throw new BadRequestException(
          'Berekende velden moeten een formule hebben',
        );
      }
    }

    if (passFailEnabled && !passFailOperator) {
      throw new BadRequestException(
        'Pass/fail-velden moeten een operator hebben',
      );
    }

    if (passFailEnabled && fieldType !== MeasurementSheetFieldType.NUMBER) {
      throw new BadRequestException(
        'Pass/fail-criteria kunnen alleen bij NUMBER-velden gebruikt worden',
      );
    }
  }
}
