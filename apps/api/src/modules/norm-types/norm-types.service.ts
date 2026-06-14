import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/prisma';
import { CreateNormTypeDto, UpdateNormTypeDto } from './dto';

const classificationModelSelect = {
  classificationModel: {
    select: { id: true, code: true, name: true },
  },
} as const;

@Injectable()
export class NormTypesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Globale registry: iedereen leest. Standaard alleen actief + niet verwijderd. */
  async findAll(options?: { includeInactive?: boolean; includeDeleted?: boolean }) {
    return this.prisma.normTypeDefinition.findMany({
      where: {
        ...(options?.includeDeleted ? {} : { deletedAt: null }),
        ...(options?.includeInactive ? {} : { isActive: true }),
      },
      include: classificationModelSelect,
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: string) {
    const normType = await this.prisma.normTypeDefinition.findUnique({
      where: { id },
      include: classificationModelSelect,
    });
    if (!normType || normType.deletedAt) {
      throw new NotFoundException('Normtype niet gevonden');
    }
    return normType;
  }

  async findByCode(code: string) {
    const normType = await this.prisma.normTypeDefinition.findUnique({
      where: { code },
      include: classificationModelSelect,
    });
    if (!normType || normType.deletedAt) {
      throw new NotFoundException('Normtype niet gevonden');
    }
    return normType;
  }

  async create(dto: CreateNormTypeDto, createdBy: string) {
    const existing = await this.prisma.normTypeDefinition.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(`Normtype met code '${dto.code}' bestaat al`);
    }

    if (dto.classificationModelId) {
      await this.assertClassificationModel(dto.classificationModelId);
    }

    return this.prisma.normTypeDefinition.create({
      data: { ...dto, createdBy },
      include: classificationModelSelect,
    });
  }

  async update(id: string, dto: UpdateNormTypeDto) {
    await this.findById(id);

    // Code wijzigen → conflict-check op andere rijen
    if (dto.code) {
      const existing = await this.prisma.normTypeDefinition.findFirst({
        where: { code: dto.code, id: { not: id } },
      });
      if (existing) {
        throw new ConflictException(`Normtype met code '${dto.code}' bestaat al`);
      }
    }

    if (dto.classificationModelId) {
      await this.assertClassificationModel(dto.classificationModelId);
    }

    return this.prisma.normTypeDefinition.update({
      where: { id },
      data: dto,
      include: classificationModelSelect,
    });
  }

  async softDelete(id: string) {
    const normType = await this.findById(id);

    // Blokkeer verwijderen wanneer de normcode nog in gebruik is
    const usageCount = await this.checkUsage(normType.code);
    if (usageCount > 0) {
      throw new BadRequestException(
        `Normtype kan niet worden gearchiveerd: nog in gebruik (${usageCount}). Zet op inactief in plaats daarvan.`,
      );
    }

    return this.prisma.normTypeDefinition.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }

  async restore(id: string) {
    const normType = await this.prisma.normTypeDefinition.findUnique({
      where: { id },
    });
    if (!normType) {
      throw new NotFoundException('Normtype niet gevonden');
    }

    return this.prisma.normTypeDefinition.update({
      where: { id },
      data: { deletedAt: null, isActive: true },
      include: classificationModelSelect,
    });
  }

  /** Tel hoe vaak deze normcode wordt gebruikt over alle norm-gevoelige modellen. */
  private async checkUsage(code: string): Promise<number> {
    const [plans, templates, checklists, sheets] = await Promise.all([
      this.prisma.inspectionPlan.count({
        where: { normTypeCode: code, deletedAt: null },
      }),
      this.prisma.inspectionTemplate.count({ where: { normTypeCode: code } }),
      this.prisma.checklist.count({ where: { normTypeCode: code } }),
      this.prisma.measurementSheetTemplate.count({ where: { normTypeCode: code } }),
    ]);
    return plans + templates + checklists + sheets;
  }

  private async assertClassificationModel(classificationModelId: string): Promise<void> {
    const model = await this.prisma.classificationModel.findUnique({
      where: { id: classificationModelId },
    });
    if (!model || !model.isActive) {
      throw new BadRequestException(
        `Classificatiemodel niet gevonden of inactief: ${classificationModelId}`,
      );
    }
  }
}
