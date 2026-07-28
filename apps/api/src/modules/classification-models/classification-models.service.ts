import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateClassificationModelDto,
  UpdateClassificationModelDto,
  CreateCharacteristicStandaloneDto,
  UpdateCharacteristicDto,
  CreateOptionStandaloneDto,
  UpdateOptionDto,
} from './dto';

/**
 * Classificatiemodellen zijn een GLOBALE/systeem-registry (geen orgId).
 * Iedereen leest; alleen SUPERUSER schrijft. Geen org-scoping.
 */
@Injectable()
export class ClassificationModelsService {
  constructor(private readonly prisma: PrismaService) {}

  // =====================================================
  // MODEL OPERATIONS
  // =====================================================

  /** Alle actieve classificatiemodellen met kenmerken + opties. */
  async findAll() {
    return this.prisma.classificationModel.findMany({
      where: { isActive: true },
      include: {
        characteristics: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** Alle modellen (inclusief inactieve) — voor beheer. */
  async findAllAdmin() {
    return this.prisma.classificationModel.findMany({
      include: {
        characteristics: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
        _count: { select: { findingTemplates: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  /** Eén classificatiemodel op id (met volledige structuur). */
  async findById(id: string) {
    const model = await this.prisma.classificationModel.findUnique({
      where: { id },
      include: {
        characteristics: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
        _count: { select: { findingTemplates: true } },
      },
    });

    if (!model) {
      throw new NotFoundException('Classificatiemodel niet gevonden');
    }
    return model;
  }

  /** Eén classificatiemodel op code. */
  async findByCode(code: string) {
    const model = await this.prisma.classificationModel.findUnique({
      where: { code },
      include: {
        characteristics: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    if (!model) {
      throw new NotFoundException('Classificatiemodel niet gevonden');
    }
    return model;
  }

  /** Nieuw classificatiemodel met kenmerken + opties (SUPERUSER). */
  async create(dto: CreateClassificationModelDto, createdBy: string) {
    const existing = await this.prisma.classificationModel.findUnique({
      where: { code: dto.code },
    });
    if (existing) {
      throw new ConflictException(
        `Classificatiemodel met code '${dto.code}' bestaat al`,
      );
    }

    return this.prisma.classificationModel.create({
      data: {
        code: dto.code,
        name: dto.name,
        description: dto.description,
        createdBy,
        characteristics: {
          create: dto.characteristics.map((char, charIndex) => ({
            code: char.code,
            name: char.name,
            description: char.description,
            sortOrder: char.sortOrder ?? charIndex + 1,
            options: {
              create: char.options.map((opt, optIndex) => ({
                code: opt.code,
                name: opt.name,
                description: opt.description,
                color: opt.color,
                sortOrder: opt.sortOrder ?? optIndex + 1,
              })),
            },
          })),
        },
      },
      include: {
        characteristics: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /** Model bijwerken (name, description, isActive). */
  async update(id: string, dto: UpdateClassificationModelDto) {
    const model = await this.findById(id);

    // Bij deactiveren: blokkeer als templates dit model gebruiken
    if (dto.isActive === false && model._count.findingTemplates > 0) {
      throw new BadRequestException(
        `Kan model niet deactiveren: het wordt gebruikt door ${model._count.findingTemplates} bevindingstemplate(s)`,
      );
    }

    return this.prisma.classificationModel.update({
      where: { id },
      data: {
        name: dto.name,
        description: dto.description,
        isActive: dto.isActive,
      },
      include: {
        characteristics: {
          orderBy: { sortOrder: 'asc' },
          include: { options: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
  }

  /** Model soft-deleten (isActive = false). */
  async delete(id: string) {
    const model = await this.findById(id);

    if (model._count.findingTemplates > 0) {
      throw new BadRequestException(
        `Kan model niet verwijderen: het wordt gebruikt door ${model._count.findingTemplates} bevindingstemplate(s)`,
      );
    }

    return this.prisma.classificationModel.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // =====================================================
  // CHARACTERISTIC OPERATIONS
  // =====================================================

  /** Kenmerk toevoegen aan een model. */
  async addCharacteristic(modelId: string, dto: CreateCharacteristicStandaloneDto) {
    await this.findById(modelId);

    const existing = await this.prisma.classificationCharacteristic.findUnique({
      where: {
        classificationModelId_code: {
          classificationModelId: modelId,
          code: dto.code,
        },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Kenmerk met code '${dto.code}' bestaat al in dit model`,
      );
    }

    const maxSort = await this.prisma.classificationCharacteristic.aggregate({
      where: { classificationModelId: modelId },
      _max: { sortOrder: true },
    });

    return this.prisma.classificationCharacteristic.create({
      data: {
        classificationModelId: modelId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        options: dto.options
          ? {
              create: dto.options.map((opt, index) => ({
                code: opt.code,
                name: opt.name,
                description: opt.description,
                color: opt.color,
                sortOrder: opt.sortOrder ?? index + 1,
              })),
            }
          : undefined,
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** Kenmerk bijwerken. */
  async updateCharacteristic(characteristicId: string, dto: UpdateCharacteristicDto) {
    const characteristic = await this.prisma.classificationCharacteristic.findUnique({
      where: { id: characteristicId },
    });
    if (!characteristic) {
      throw new NotFoundException('Kenmerk niet gevonden');
    }

    return this.prisma.classificationCharacteristic.update({
      where: { id: characteristicId },
      data: {
        name: dto.name,
        description: dto.description,
        sortOrder: dto.sortOrder,
      },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  /** Kenmerk verwijderen (opties cascaden mee). */
  async deleteCharacteristic(characteristicId: string, warningAcknowledged = false) {
    const characteristic = await this.prisma.classificationCharacteristic.findUnique({
      where: { id: characteristicId },
      include: {
        classificationModel: { include: { findingTemplates: true } },
      },
    });
    if (!characteristic) {
      throw new NotFoundException('Kenmerk niet gevonden');
    }

    // Templates die dit kenmerk in hun default-classificatie gebruiken
    const templatesUsingChar = characteristic.classificationModel.findingTemplates.filter(
      (template) => {
        const defaultClass = template.defaultClassification as Record<string, string>;
        return defaultClass && characteristic.code in defaultClass;
      },
    );

    if (templatesUsingChar.length > 0 && !warningAcknowledged) {
      return {
        warning: true,
        message: `${templatesUsingChar.length} template(s) gebruiken dit kenmerk. Hun standaardwaarden worden verwijderd.`,
        affectedTemplates: templatesUsingChar.length,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const template of templatesUsingChar) {
        const defaultClass = {
          ...(template.defaultClassification as Record<string, string>),
        };
        delete defaultClass[characteristic.code];
        await tx.findingTemplate.update({
          where: { id: template.id },
          data: { defaultClassification: defaultClass as Prisma.InputJsonValue },
        });
      }

      await tx.classificationCharacteristic.delete({
        where: { id: characteristicId },
      });
    });

    return { deleted: true };
  }

  /** Kenmerken herordenen binnen een model. */
  async reorderCharacteristics(modelId: string, characteristicIds: string[]) {
    await this.findById(modelId);

    await this.prisma.$transaction(
      characteristicIds.map((id, index) =>
        this.prisma.classificationCharacteristic.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return this.findById(modelId);
  }

  // =====================================================
  // OPTION OPERATIONS
  // =====================================================

  /** Optie toevoegen aan een kenmerk. */
  async addOption(characteristicId: string, dto: CreateOptionStandaloneDto) {
    const characteristic = await this.prisma.classificationCharacteristic.findUnique({
      where: { id: characteristicId },
    });
    if (!characteristic) {
      throw new NotFoundException('Kenmerk niet gevonden');
    }

    const existing = await this.prisma.classificationOption.findUnique({
      where: {
        characteristicId_code: { characteristicId, code: dto.code },
      },
    });
    if (existing) {
      throw new ConflictException(
        `Optie met code '${dto.code}' bestaat al in dit kenmerk`,
      );
    }

    const maxSort = await this.prisma.classificationOption.aggregate({
      where: { characteristicId },
      _max: { sortOrder: true },
    });

    return this.prisma.classificationOption.create({
      data: {
        characteristicId,
        code: dto.code,
        name: dto.name,
        description: dto.description,
        color: dto.color,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        isCritical: dto.isCritical ?? false,
      },
    });
  }

  /** Optie bijwerken. */
  async updateOption(optionId: string, dto: UpdateOptionDto) {
    const option = await this.prisma.classificationOption.findUnique({
      where: { id: optionId },
    });
    if (!option) {
      throw new NotFoundException('Optie niet gevonden');
    }

    return this.prisma.classificationOption.update({
      where: { id: optionId },
      data: {
        name: dto.name,
        description: dto.description,
        color: dto.color,
        sortOrder: dto.sortOrder,
        isCritical: dto.isCritical,
      },
    });
  }

  /** Optie verwijderen. */
  async deleteOption(optionId: string, warningAcknowledged = false) {
    const option = await this.prisma.classificationOption.findUnique({
      where: { id: optionId },
      include: {
        characteristic: {
          include: {
            classificationModel: { include: { findingTemplates: true } },
          },
        },
      },
    });
    if (!option) {
      throw new NotFoundException('Optie niet gevonden');
    }

    // Templates die deze optie als default-waarde gebruiken
    const templatesUsingOption =
      option.characteristic.classificationModel.findingTemplates.filter((template) => {
        const defaultClass = template.defaultClassification as Record<string, string>;
        return (
          defaultClass &&
          defaultClass[option.characteristic.code] === option.code
        );
      });

    if (templatesUsingOption.length > 0 && !warningAcknowledged) {
      return {
        warning: true,
        message: `${templatesUsingOption.length} template(s) gebruiken deze optie. Hun standaardwaarden worden gewist.`,
        affectedTemplates: templatesUsingOption.length,
      };
    }

    await this.prisma.$transaction(async (tx) => {
      for (const template of templatesUsingOption) {
        const defaultClass = {
          ...(template.defaultClassification as Record<string, string>),
        };
        delete defaultClass[option.characteristic.code];
        await tx.findingTemplate.update({
          where: { id: template.id },
          data: { defaultClassification: defaultClass as Prisma.InputJsonValue },
        });
      }

      await tx.classificationOption.delete({ where: { id: optionId } });
    });

    return { deleted: true };
  }

  /** Opties herordenen binnen een kenmerk. */
  async reorderOptions(characteristicId: string, optionIds: string[]) {
    const characteristic = await this.prisma.classificationCharacteristic.findUnique({
      where: { id: characteristicId },
    });
    if (!characteristic) {
      throw new NotFoundException('Kenmerk niet gevonden');
    }

    await this.prisma.$transaction(
      optionIds.map((id, index) =>
        this.prisma.classificationOption.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );

    return this.prisma.classificationCharacteristic.findUnique({
      where: { id: characteristicId },
      include: { options: { orderBy: { sortOrder: 'asc' } } },
    });
  }
}
