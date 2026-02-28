import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import {
  CreateQuoteTemplateDto,
  UpdateQuoteTemplateDto,
  ListQuoteTemplatesQueryDto,
} from './dto';

@Injectable()
export class QuoteTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListQuoteTemplatesQueryDto) {
    const { search, isActive, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.QuoteTemplateWhereInput = {};

    if (isActive !== undefined) {
      where.isActive = isActive;
    }

    if (!user.roles.includes(Role.SUPERUSER)) {
      where.orgId = user.orgId!;
    }

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    const [data, total] = await Promise.all([
      this.prisma.quoteTemplate.findMany({
        where,
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.quoteTemplate.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  async findOne(id: string, user: User) {
    const template = await this.prisma.quoteTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      throw new NotFoundException('Template niet gevonden');
    }

    if (!user.roles.includes(Role.SUPERUSER) && template.orgId !== user.orgId) {
      throw new ForbiddenException();
    }

    return template;
  }

  async create(dto: CreateQuoteTemplateDto, user: User) {
    const orgId = user.orgId;
    if (!orgId && !user.roles.includes(Role.SUPERUSER)) {
      throw new ForbiddenException('Geen organisatie gekoppeld');
    }

    return this.prisma.quoteTemplate.create({
      data: {
        orgId: orgId!,
        name: dto.name,
        coverBlocks: dto.coverBlocks ?? undefined,
        contentBlocks: dto.contentBlocks ?? undefined,
        closingBlocks: dto.closingBlocks ?? undefined,
        defaultValidityDays: dto.defaultValidityDays ?? 30,
        requiresApproval: dto.requiresApproval ?? false,
      },
    });
  }

  async update(id: string, dto: UpdateQuoteTemplateDto, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.coverBlocks !== undefined && { coverBlocks: dto.coverBlocks }),
        ...(dto.contentBlocks !== undefined && {
          contentBlocks: dto.contentBlocks,
        }),
        ...(dto.closingBlocks !== undefined && {
          closingBlocks: dto.closingBlocks,
        }),
        ...(dto.defaultValidityDays !== undefined && {
          defaultValidityDays: dto.defaultValidityDays,
        }),
        ...(dto.requiresApproval !== undefined && {
          requiresApproval: dto.requiresApproval,
        }),
      },
    });
  }

  async deactivate(id: string, user: User) {
    const template = await this.findOne(id, user);

    return this.prisma.quoteTemplate.update({
      where: { id: template.id },
      data: { isActive: false },
    });
  }
}
