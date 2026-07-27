import {
  Injectable,
  Logger,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { User, Role, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope } from '@/common';
import {
  CreateDocumentTagDto,
  UpdateDocumentTagDto,
  ListDocumentTagsQueryDto,
} from './dto';

@Injectable()
export class DocumentTagsService {
  private readonly logger = new Logger(DocumentTagsService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(user: User, query: ListDocumentTagsQueryDto) {
    const { search, page = 1, limit = 50 } = query;

    const where: Prisma.DocumentTagWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }

    return paginate(this.prisma.documentTag, {
      where,
      include: {
        _count: { select: { documents: { where: { document: { isDeleted: false } } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      page,
      limit,
    });
  }

  /** Compact list for tag pickers (upload/edit document). */
  async findAllCompact(user: User) {
    const where: Prisma.DocumentTagWhereInput = {
      ...orgScope(user),
      isDeleted: false,
    };

    return this.prisma.documentTag.findMany({
      where,
      select: { id: true, name: true, color: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string, user: User) {
    // WP-C1 (B-105): org-scope in de query — cross-tenant id → zelfde 404.
    const tag = await this.prisma.documentTag.findFirst({
      where: { id, ...orgScope(user) },
      include: { _count: { select: { documents: { where: { document: { isDeleted: false } } } } } },
    });

    if (!tag || tag.isDeleted) {
      throw new NotFoundException('Document-tag niet gevonden');
    }

    return tag;
  }

  async create(dto: CreateDocumentTagDto, user: User) {
    const orgId = user.orgId!;
    const name = dto.name.trim();
    await this.assertNameAvailable(orgId, name);

    // The `@@unique([orgId, name])` index also covers soft-deleted rows, so a
    // previously deleted name would otherwise be permanently unusable. Revive
    // that row instead of inserting a colliding one.
    const archived = await this.prisma.documentTag.findFirst({
      where: { orgId, name, isDeleted: true },
      select: { id: true },
    });
    if (archived) {
      return this.prisma.documentTag.update({
        where: { id: archived.id },
        data: {
          isDeleted: false,
          color: dto.color,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    }

    try {
      return await this.prisma.documentTag.create({
        data: {
          orgId,
          name,
          color: dto.color,
          sortOrder: dto.sortOrder ?? 0,
        },
      });
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async update(id: string, dto: UpdateDocumentTagDto, user: User) {
    const tag = await this.findOne(id, user);

    if (dto.name !== undefined && dto.name.trim() !== tag.name) {
      await this.assertNameAvailable(tag.orgId, dto.name, tag.id);
    }

    try {
      return await this.prisma.documentTag.update({
        where: { id: tag.id },
        data: {
          ...(dto.name !== undefined && { name: dto.name.trim() }),
          ...(dto.color !== undefined && { color: dto.color }),
          ...(dto.sortOrder !== undefined && { sortOrder: dto.sortOrder }),
        },
      });
    } catch (err) {
      throw this.mapUniqueViolation(err);
    }
  }

  async softDelete(id: string, user: User) {
    const tag = await this.findOne(id, user);

    // Soft-delete the tag and drop its assignments so it disappears from
    // documents while the documents themselves remain untouched.
    await this.prisma.$transaction([
      this.prisma.documentTagAssignment.deleteMany({
        where: { documentTagId: tag.id },
      }),
      this.prisma.documentTag.update({
        where: { id: tag.id },
        data: { isDeleted: true },
      }),
    ]);
  }

  /** Reject a duplicate name within the org (excluding the tag being updated). */
  private async assertNameAvailable(
    orgId: string,
    name: string,
    excludeId?: string,
  ) {
    const existing = await this.prisma.documentTag.findFirst({
      where: {
        orgId,
        name: { equals: name.trim(), mode: 'insensitive' },
        isDeleted: false,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('Een tag met deze naam bestaat al');
    }
  }

  /**
   * Translate the `@@unique([orgId, name])` violation (P2002) into a friendly
   * conflict. This backstops the race / soft-deleted-name edge that the
   * `assertNameAvailable` pre-check (active tags only) cannot see.
   */
  private mapUniqueViolation(err: unknown): Error {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException('Een tag met deze naam bestaat al');
    }
    return err as Error;
  }
}
