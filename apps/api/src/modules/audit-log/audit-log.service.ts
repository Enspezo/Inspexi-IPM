import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '@/common';
import {
  ALLOWED_ENTITY_TYPES,
  resolveFkTargetModel,
  displayReference,
  delegateFor,
} from '@/common/audit';

/** UUID v4 pattern */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByUser(
    userId: string,
    orgId: string | null,
    options: {
      entityType?: string;
      action?: string;
      dateFrom?: string;
      dateTo?: string;
      page: number;
      limit: number;
    },
  ) {
    const where: any = { userId };

    // Org-scoping
    if (orgId) {
      where.orgId = orgId;
    }

    if (options.entityType) {
      where.entityType = options.entityType;
    }

    if (options.action) {
      where.action = options.action;
    }

    if (options.dateFrom || options.dateTo) {
      where.createdAt = {};
      if (options.dateFrom) where.createdAt.gte = new Date(options.dateFrom);
      if (options.dateTo) where.createdAt.lte = new Date(options.dateTo);
    }

    const result = await paginate(this.prisma.auditLog, {
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      page: options.page,
      limit: options.limit,
    });

    const enrichedData = await this.resolveDisplayNames(result.data);

    return { ...result, data: enrichedData };
  }

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

    const result = await paginate(this.prisma.auditLog, {
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      page: options.page,
      limit: options.limit,
    });

    // Resolve UUID references to display names
    const enrichedData = await this.resolveDisplayNames(result.data);

    return { ...result, data: enrichedData };
  }

  /**
   * Resolves UUID foreign-key values in changes/snapshot to human-readable
   * display names. The model a column points to is looked up per
   * `(entityType, field)`, so the same column name resolves against the right
   * model on every entity (e.g. `Asset.locationId` → InspectionLocation while
   * `Quote.locationId` → Location).
   */
  private async resolveDisplayNames(entries: any[]): Promise<any[]> {
    // Collect all UUIDs that need resolving, grouped by target model (PascalCase)
    const toResolve = new Map<string, Set<string>>();

    for (const entry of entries) {
      this.collectUuids(entry.entityType, entry.changes, toResolve);
      this.collectUuids(entry.entityType, entry.snapshot, toResolve);
    }

    if (toResolve.size === 0) return entries;

    // Batch-fetch all referenced records, per target model
    const resolved = new Map<string, string>(); // uuid → display name

    for (const [model, ids] of toResolve.entries()) {
      try {
        const delegate = (this.prisma as any)[delegateFor(model)];
        if (!delegate?.findMany) continue;

        const records = await delegate.findMany({
          where: { id: { in: Array.from(ids) } },
        });

        for (const record of records) {
          resolved.set(record.id, displayReference(model, record));
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve display names for ${model}: ${err}`);
      }
    }

    if (resolved.size === 0) return entries;

    // Enrich entries with display names
    return entries.map((entry) => ({
      ...entry,
      changes: this.enrichChanges(entry.entityType, entry.changes, resolved),
      snapshot: this.enrichSnapshot(entry.entityType, entry.snapshot, resolved),
    }));
  }

  private collectUuids(
    entityType: string,
    data: Record<string, any> | null,
    toResolve: Map<string, Set<string>>,
  ) {
    if (!data) return;

    const add = (model: string, val: unknown) => {
      if (typeof val === 'string' && UUID_REGEX.test(val)) {
        if (!toResolve.has(model)) toResolve.set(model, new Set());
        toResolve.get(model)!.add(val);
      }
    };

    for (const [field, value] of Object.entries(data)) {
      const model = resolveFkTargetModel(entityType, field);
      if (!model) continue;

      // For changes the value is { from, to }; for snapshots it is the raw value
      if (value && typeof value === 'object' && ('from' in value || 'to' in value)) {
        add(model, value.from);
        add(model, value.to);
      } else {
        add(model, value);
      }
    }
  }

  private enrichChanges(
    entityType: string,
    changes: Record<string, { from: any; to: any }> | null,
    resolved: Map<string, string>,
  ): Record<string, any> | null {
    if (!changes) return changes;

    const enriched: Record<string, any> = {};
    for (const [field, change] of Object.entries(changes)) {
      enriched[field] = {
        from: this.resolveValue(entityType, field, change.from, resolved),
        to: this.resolveValue(entityType, field, change.to, resolved),
      };
    }
    return enriched;
  }

  private enrichSnapshot(
    entityType: string,
    snapshot: Record<string, any> | null,
    resolved: Map<string, string>,
  ): Record<string, any> | null {
    if (!snapshot) return snapshot;

    const enriched: Record<string, any> = {};
    for (const [field, value] of Object.entries(snapshot)) {
      enriched[field] = this.resolveValue(entityType, field, value, resolved);
    }
    return enriched;
  }

  private resolveValue(
    entityType: string,
    field: string,
    value: any,
    resolved: Map<string, string>,
  ): any {
    if (
      typeof value === 'string' &&
      UUID_REGEX.test(value) &&
      resolveFkTargetModel(entityType, field)
    ) {
      return resolved.get(value) ?? value;
    }
    return value;
  }
}
