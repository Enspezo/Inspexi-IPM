import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const ALLOWED_ENTITY_TYPES = new Set([
  'Contact',
  'ContactPerson',
  'Location',
  'CustomerGroup',
  'Product',
  'PriceTable',
  'PriceTableItem',
  'Request',
  'Quote',
  'QuoteLine',
  'QuoteTemplate',
  'User',
  'Organization',
]);

@Injectable()
export class AuditLogService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEntity(
    entityType: string,
    entityId: string,
    orgId: string | null,
    options: { page: number; limit: number },
  ) {
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) {
      throw new BadRequestException(`Invalid entityType: ${entityType}`);
    }

    const where: any = {
      entityType,
      entityId,
    };

    // Org-scoping (SUPERUSER passes orgId = null to skip)
    if (orgId) {
      where.orgId = orgId;
    }

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      total,
      page: options.page,
      limit: options.limit,
    };
  }
}
