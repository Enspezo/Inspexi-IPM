import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { MeasurementSheetTemplatesService } from './measurement-sheet-templates.service';
import {
  CreateMeasurementSheetSectionDto,
  UpdateMeasurementSheetSectionDto,
} from './dto';

@Injectable()
export class MeasurementSheetSectionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly templatesService: MeasurementSheetTemplatesService,
  ) {}

  /** Sectie aanmaken binnen een template. */
  async create(
    templateId: string,
    userId: string,
    dto: CreateMeasurementSheetSectionDto,
  ) {
    await this.templatesService.validateConceptStatus(templateId);

    const existing = await this.prisma.measurementSheetSection.findFirst({
      where: { templateId, code: dto.code },
    });
    if (existing) {
      throw new BadRequestException(
        `Sectie met code "${dto.code}" bestaat al in dit template`,
      );
    }

    let sortOrder = dto.sortOrder;
    if (sortOrder === undefined) {
      const maxSort = await this.prisma.measurementSheetSection.aggregate({
        where: { templateId },
        _max: { sortOrder: true },
      });
      sortOrder = (maxSort._max.sortOrder ?? -1) + 1;
    }

    const section = await this.prisma.measurementSheetSection.create({
      data: {
        templateId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        isRepeating: dto.isRepeating ?? false,
        minRows: dto.minRows ?? 1,
        sortOrder,
        collapsible: dto.collapsible ?? true,
        defaultCollapsed: dto.defaultCollapsed ?? false,
        rowValidationRules: (dto.rowValidationRules ??
          []) as unknown as Prisma.InputJsonValue,
      },
      include: {
        fields: { orderBy: { sortOrder: 'asc' } },
      },
    });

    await this.prisma.measurementSheetTemplate.update({
      where: { id: templateId },
      data: { updatedBy: userId },
    });

    return section;
  }

  /** Sectie bijwerken. */
  async update(
    sectionId: string,
    userId: string,
    dto: UpdateMeasurementSheetSectionDto,
  ) {
    const section = await this.findById(sectionId);
    await this.templatesService.validateConceptStatus(section.templateId);

    const updated = await this.prisma.measurementSheetSection.update({
      where: { id: sectionId },
      data: {
        name: dto.name,
        description: dto.description,
        isRepeating: dto.isRepeating,
        minRows: dto.minRows,
        collapsible: dto.collapsible,
        defaultCollapsed: dto.defaultCollapsed,
        rowValidationRules: dto.rowValidationRules as unknown as
          | Prisma.InputJsonValue
          | undefined,
      },
      include: {
        fields: { orderBy: { sortOrder: 'asc' } },
      },
    });

    await this.prisma.measurementSheetTemplate.update({
      where: { id: section.templateId },
      data: { updatedBy: userId },
    });

    return updated;
  }

  /** Sectie verwijderen (cascade verwijdert velden). */
  async delete(sectionId: string, userId: string) {
    const section = await this.findById(sectionId);
    await this.templatesService.validateConceptStatus(section.templateId);

    await this.prisma.measurementSheetSection.delete({
      where: { id: sectionId },
    });

    await this.prisma.measurementSheetTemplate.update({
      where: { id: section.templateId },
      data: { updatedBy: userId },
    });

    return { deleted: true };
  }

  /** Secties herordenen binnen een template. */
  async reorder(templateId: string, userId: string, sectionIds: string[]) {
    await this.templatesService.validateConceptStatus(templateId);

    const sections = await this.prisma.measurementSheetSection.findMany({
      where: { templateId },
      select: { id: true },
    });

    const existingIds = new Set(sections.map((s) => s.id));
    for (const id of sectionIds) {
      if (!existingIds.has(id)) {
        throw new BadRequestException(
          `Sectie "${id}" hoort niet bij dit template`,
        );
      }
    }

    await this.prisma.$transaction(
      sectionIds.map((id, index) =>
        this.prisma.measurementSheetSection.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    await this.prisma.measurementSheetTemplate.update({
      where: { id: templateId },
      data: { updatedBy: userId },
    });

    return this.templatesService.findById(templateId);
  }

  /** Secties van een template (gesorteerd, met velden). */
  async getSections(templateId: string) {
    await this.templatesService.findById(templateId); // bestaanscontrole
    return this.prisma.measurementSheetSection.findMany({
      where: { templateId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** Sectie ophalen op id. */
  async findById(sectionId: string) {
    const section = await this.prisma.measurementSheetSection.findUnique({
      where: { id: sectionId },
      include: {
        fields: { orderBy: { sortOrder: 'asc' } },
      },
    });

    if (!section) {
      throw new NotFoundException('Sectie niet gevonden');
    }
    return section;
  }
}
