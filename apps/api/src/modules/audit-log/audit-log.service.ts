import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { paginate } from '@/common';

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
  'PlanningItem',
  'CustomFieldDefinition',
  'EmailTemplate',
  'Project',
  'WorkOrder',
  'WorkOrderLine',
]);

/**
 * Maps FK field names to the Prisma model and the fields used to build a display name.
 * The resolver will look up the referenced record and produce a human-readable label.
 */
interface RefConfig {
  model: string; // Prisma delegate name (camelCase)
  display: (record: any) => string;
}

const FK_FIELD_RESOLVERS: Record<string, RefConfig> = {
  contactId: {
    model: 'contact',
    display: (r) => r.companyName || `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.name || r.id,
  },
  priceTableId: {
    model: 'priceTable',
    display: (r) => r.name || r.id,
  },
  ownerId: {
    model: 'user',
    display: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email || r.id,
  },
  assignedTo: {
    model: 'user',
    display: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email || r.id,
  },
  createdBy: {
    model: 'user',
    display: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email || r.id,
  },
  locationId: {
    model: 'location',
    display: (r) => {
      const parts = [r.street, r.houseNumber, r.city].filter(Boolean);
      return parts.length > 0 ? parts.join(' ') : r.objectType || r.id;
    },
  },
  orgId: {
    model: 'organization',
    display: (r) => r.name || r.slug || r.id,
  },
  templateId: {
    model: 'quoteTemplate',
    display: (r) => r.name || r.id,
  },
  requestId: {
    model: 'request',
    display: (r) => r.title || `Aanvraag #${r.id.substring(0, 8)}`,
  },
  quoteId: {
    model: 'quote',
    display: (r) => r.quoteNumber || r.subject || `Offerte #${r.id.substring(0, 8)}`,
  },
  productId: {
    model: 'product',
    display: (r) => r.name || r.id,
  },
  customerGroupId: {
    model: 'customerGroup',
    display: (r) => r.name || r.id,
  },
  userId: {
    model: 'user',
    display: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email || r.id,
  },
  projectId: {
    model: 'project',
    display: (r) => r.projectNumber || r.title || r.id,
  },
  projectManagerId: {
    model: 'user',
    display: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim() || r.email || r.id,
  },
  planningItemId: {
    model: 'planningItem',
    display: (r) => r.productName || `Planning #${r.id.substring(0, 8)}`,
  },
  workOrderId: {
    model: 'workOrder',
    display: (r) => r.workOrderNumber || `Werkbon #${r.id.substring(0, 8)}`,
  },
  lostReasonId: {
    model: 'lostReason',
    display: (r) => r.label || r.code || r.id,
  },
  roleId: {
    model: 'contactPersonRoleOption',
    display: (r) => r.label || r.code || r.id,
  },
};

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
   * Resolves UUID foreign-key values in changes/snapshot to human-readable display names.
   * Adds a `_display` suffix field for each resolved FK (e.g., contactId → contactId_display).
   */
  private async resolveDisplayNames(entries: any[]): Promise<any[]> {
    // Collect all UUIDs that need resolving, grouped by model
    const toResolve = new Map<string, Set<string>>(); // model → Set<uuid>

    for (const entry of entries) {
      this.collectUuids(entry.changes, toResolve);
      this.collectUuids(entry.snapshot, toResolve);
    }

    if (toResolve.size === 0) return entries;

    // Batch-fetch all referenced records
    const resolved = new Map<string, string>(); // uuid → display name

    for (const [model, ids] of toResolve.entries()) {
      try {
        const delegate = (this.prisma as any)[model];
        if (!delegate?.findMany) continue;

        const records = await delegate.findMany({
          where: { id: { in: Array.from(ids) } },
        });

        // Find the display function for this model
        const refConfig = Object.values(FK_FIELD_RESOLVERS).find(
          (cfg) => cfg.model === model,
        );

        for (const record of records) {
          const displayName = refConfig
            ? refConfig.display(record)
            : record.name || record.id;
          resolved.set(record.id, displayName);
        }
      } catch (err) {
        this.logger.warn(`Failed to resolve display names for ${model}: ${err}`);
      }
    }

    if (resolved.size === 0) return entries;

    // Enrich entries with display names
    return entries.map((entry) => ({
      ...entry,
      changes: this.enrichWithDisplayNames(entry.changes, resolved),
      snapshot: this.enrichSnapshotWithDisplayNames(entry.snapshot, resolved),
    }));
  }

  private collectUuids(
    data: Record<string, any> | null,
    toResolve: Map<string, Set<string>>,
  ) {
    if (!data) return;

    for (const [field, value] of Object.entries(data)) {
      const config = FK_FIELD_RESOLVERS[field];
      if (!config) continue;

      // For changes: value is { from, to }
      if (value && typeof value === 'object' && ('from' in value || 'to' in value)) {
        for (const val of [value.from, value.to]) {
          if (typeof val === 'string' && UUID_REGEX.test(val)) {
            if (!toResolve.has(config.model)) {
              toResolve.set(config.model, new Set());
            }
            toResolve.get(config.model)!.add(val);
          }
        }
      }
      // For snapshot: value is the raw value
      else if (typeof value === 'string' && UUID_REGEX.test(value)) {
        if (!toResolve.has(config.model)) {
          toResolve.set(config.model, new Set());
        }
        toResolve.get(config.model)!.add(value);
      }
    }
  }

  private enrichWithDisplayNames(
    changes: Record<string, { from: any; to: any }> | null,
    resolved: Map<string, string>,
  ): Record<string, any> | null {
    if (!changes) return changes;

    const enriched: Record<string, any> = {};
    for (const [field, change] of Object.entries(changes)) {
      enriched[field] = {
        from: this.resolveValue(change.from, field, resolved),
        to: this.resolveValue(change.to, field, resolved),
      };
    }
    return enriched;
  }

  private enrichSnapshotWithDisplayNames(
    snapshot: Record<string, any> | null,
    resolved: Map<string, string>,
  ): Record<string, any> | null {
    if (!snapshot) return snapshot;

    const enriched: Record<string, any> = {};
    for (const [field, value] of Object.entries(snapshot)) {
      enriched[field] = this.resolveValue(value, field, resolved);
    }
    return enriched;
  }

  private resolveValue(
    value: any,
    field: string,
    resolved: Map<string, string>,
  ): any {
    if (
      typeof value === 'string' &&
      UUID_REGEX.test(value) &&
      FK_FIELD_RESOLVERS[field]
    ) {
      const displayName = resolved.get(value);
      return displayName ?? value;
    }
    return value;
  }
}
