import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CustomFieldEntityType, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { CreateCustomFieldDto, UpdateCustomFieldDto } from './dto';

@Injectable()
export class CustomFieldsService {
  private readonly logger = new Logger(CustomFieldsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(orgId: string) {
    return this.prisma.customFieldDefinition.findMany({
      where: { orgId, isDeleted: false },
      orderBy: [{ entityType: 'asc' }, { sortOrder: 'asc' }],
    });
  }

  async findByEntityType(orgId: string, entityType: CustomFieldEntityType) {
    return this.prisma.customFieldDefinition.findMany({
      where: { orgId, entityType, isDeleted: false },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(orgId: string, dto: CreateCustomFieldDto) {
    await this.validateLimits(orgId, dto.entityType);

    const fieldName = this.generateFieldName(dto.label);

    if (dto.fieldType === 'SELECT' && (!dto.options || dto.options.length === 0)) {
      throw new BadRequestException(
        'Keuzelijst-velden moeten minstens 1 optie hebben',
      );
    }

    const existing = await this.prisma.customFieldDefinition.findUnique({
      where: {
        orgId_entityType_fieldName: { orgId, entityType: dto.entityType, fieldName },
      },
    });
    if (existing && !existing.isDeleted) {
      throw new ConflictException('Er bestaat al een veld met deze naam');
    }

    const maxSort = await this.prisma.customFieldDefinition.aggregate({
      where: { orgId, entityType: dto.entityType, isDeleted: false },
      _max: { sortOrder: true },
    });

    // If a soft-deleted field with the same name exists, reuse the record
    if (existing && existing.isDeleted) {
      return this.prisma.customFieldDefinition.update({
        where: { id: existing.id },
        data: {
          label: dto.label,
          fieldType: dto.fieldType,
          options: dto.options ?? Prisma.JsonNull,
          isRequired: dto.isRequired ?? false,
          sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
          isDeleted: false,
        },
      });
    }

    return this.prisma.customFieldDefinition.create({
      data: {
        orgId,
        entityType: dto.entityType,
        fieldName,
        label: dto.label,
        fieldType: dto.fieldType,
        options: dto.options ?? undefined,
        isRequired: dto.isRequired ?? false,
        sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      },
    });
  }

  async update(id: string, orgId: string, dto: UpdateCustomFieldDto) {
    const field = await this.findOneOrFail(id, orgId);

    if (
      dto.options !== undefined &&
      field.fieldType === 'SELECT' &&
      dto.options.length === 0
    ) {
      throw new BadRequestException(
        'Keuzelijst-velden moeten minstens 1 optie hebben',
      );
    }

    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.options !== undefined && { options: dto.options }),
        ...(dto.isRequired !== undefined && { isRequired: dto.isRequired }),
      },
    });
  }

  async remove(id: string, orgId: string) {
    await this.findOneOrFail(id, orgId);
    return this.prisma.customFieldDefinition.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async reorder(orgId: string, orderedIds: string[]) {
    // Every id must belong to the caller's org — the update runs on `where: { id }`,
    // so without this check a caller could rewrite another org's field ordering.
    const count = await this.prisma.customFieldDefinition.count({
      where: { id: { in: orderedIds }, orgId, isDeleted: false },
    });
    if (count !== new Set(orderedIds).size) {
      throw new BadRequestException('Een of meer velden horen niet bij uw organisatie');
    }
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.customFieldDefinition.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
  }

  private async findOneOrFail(id: string, orgId: string) {
    const field = await this.prisma.customFieldDefinition.findFirst({
      where: { id, orgId, isDeleted: false },
    });
    if (!field) {
      throw new NotFoundException('Eigen veld niet gevonden');
    }
    return field;
  }

  private async validateLimits(
    orgId: string,
    entityType: CustomFieldEntityType,
  ) {
    const [entityCount, totalCount] = await Promise.all([
      this.prisma.customFieldDefinition.count({
        where: { orgId, entityType, isDeleted: false },
      }),
      this.prisma.customFieldDefinition.count({
        where: { orgId, isDeleted: false },
      }),
    ]);

    if (entityCount >= 5) {
      throw new BadRequestException(
        `Maximaal 5 eigen velden per type. ${entityType} heeft er al ${entityCount}.`,
      );
    }
    if (totalCount >= 10) {
      throw new BadRequestException(
        `Maximaal 10 eigen velden per organisatie. U heeft er al ${totalCount}.`,
      );
    }
  }

  private generateFieldName(label: string): string {
    return label
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 50);
  }
}
