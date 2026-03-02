import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requestContext } from '../common/services/request-context';

/** Models that are audited */
const AUDITED_MODELS = new Set([
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
  'Document',
  'PlanningItem',
  'CustomFieldDefinition',
  'EmailTemplate',
  'Project',
]);

/** Fields excluded from change tracking */
const EXCLUDED_FIELDS = new Set([
  'passwordHash',
  'tokenHash',
  'createdAt',
  'updatedAt',
]);

/** Prisma model → database table mapping */
const MODEL_TABLE_MAP: Record<string, string> = {
  Contact: 'imp_contacts',
  ContactPerson: 'imp_contact_persons',
  Location: 'imp_locations',
  CustomerGroup: 'imp_customer_groups',
  Product: 'imp_products',
  PriceTable: 'imp_price_tables',
  PriceTableItem: 'imp_price_table_items',
  Request: 'imp_requests',
  Quote: 'imp_quotes',
  QuoteLine: 'imp_quote_lines',
  QuoteTemplate: 'imp_quote_templates',
  User: 'imp_users',
  Organization: 'imp_organizations',
  Document: 'imp_documents',
  PlanningItem: 'imp_planning_items',
  CustomFieldDefinition: 'imp_custom_field_definitions',
  EmailTemplate: 'imp_email_templates',
  Project: 'imp_projects',
};

function sanitize(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!EXCLUDED_FIELDS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function computeChanges(
  before: Record<string, any>,
  after: Record<string, any>,
): Record<string, { from: any; to: any }> | null {
  const changes: Record<string, { from: any; to: any }> = {};
  for (const key of Object.keys(after)) {
    if (EXCLUDED_FIELDS.has(key)) continue;
    const oldVal = before[key];
    const newVal = after[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { from: oldVal ?? null, to: newVal ?? null };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    await this.$connect();
    this.setupAuditMiddleware();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private setupAuditMiddleware() {
    this.$use(async (params: Prisma.MiddlewareParams, next) => {
      const model = params.model;
      if (!model || !AUDITED_MODELS.has(model)) {
        return next(params);
      }

      const ctx = requestContext.getStore();
      if (!ctx?.userId) {
        return next(params);
      }

      const action = params.action;

      try {
        if (action === 'create') {
          const result = await next(params);
          await this.writeAuditLog({
            entityType: model,
            entityId: result.id,
            action: 'CREATE',
            snapshot: sanitize(result),
            changes: null,
            userId: ctx.userId,
            orgId: result.orgId ?? ctx.orgId,
            ipAddress: ctx.ipAddress,
          });
          return result;
        }

        if (action === 'update') {
          // Fetch before-state
          const tableName = MODEL_TABLE_MAP[model];
          let before: Record<string, any> | null = null;
          if (tableName && params.args.where) {
            try {
              const whereId = params.args.where.id;
              if (whereId) {
                before = await (this as any)[this.toCamelCase(model)].findUnique({
                  where: { id: whereId },
                });
              }
            } catch {
              // If we can't fetch before-state, proceed without diff
            }
          }

          const result = await next(params);

          if (before) {
            const changes = computeChanges(before, result);
            if (changes) {
              await this.writeAuditLog({
                entityType: model,
                entityId: result.id,
                action: 'UPDATE',
                snapshot: null,
                changes,
                userId: ctx.userId,
                orgId: result.orgId ?? before.orgId ?? ctx.orgId,
                ipAddress: ctx.ipAddress,
              });
            }
          } else {
            // No before-state available, log with snapshot
            await this.writeAuditLog({
              entityType: model,
              entityId: result.id,
              action: 'UPDATE',
              snapshot: sanitize(result),
              changes: null,
              userId: ctx.userId,
              orgId: result.orgId ?? ctx.orgId,
              ipAddress: ctx.ipAddress,
            });
          }

          return result;
        }

        if (action === 'delete') {
          // Fetch before-state
          let before: Record<string, any> | null = null;
          try {
            const whereId = params.args.where?.id;
            if (whereId) {
              before = await (this as any)[this.toCamelCase(model)].findUnique({
                where: { id: whereId },
              });
            }
          } catch {
            // proceed without snapshot
          }

          const result = await next(params);

          await this.writeAuditLog({
            entityType: model,
            entityId: before?.id ?? result?.id ?? params.args.where?.id,
            action: 'DELETE',
            snapshot: before ? sanitize(before) : null,
            changes: null,
            userId: ctx.userId,
            orgId: before?.orgId ?? ctx.orgId,
            ipAddress: ctx.ipAddress,
          });

          return result;
        }
      } catch (auditError) {
        this.logger.error(
          `Audit middleware error for ${model}.${action}: ${auditError}`,
        );
      }

      return next(params);
    });
  }

  private toCamelCase(model: string): string {
    return model.charAt(0).toLowerCase() + model.slice(1);
  }

  async writeAuditLog(data: {
    entityType: string;
    entityId: string;
    action: string;
    snapshot: Record<string, any> | null;
    changes: Record<string, { from: any; to: any }> | null;
    userId: string;
    orgId: string | null;
    ipAddress?: string;
  }): Promise<void> {
    try {
      const id = randomUUID();
      const changesJson = data.changes ? JSON.stringify(data.changes) : null;
      const snapshotJson = data.snapshot ? JSON.stringify(data.snapshot) : null;

      await this.$executeRaw`
        INSERT INTO imp_audit_logs (id, org_id, entity_type, entity_id, action, changes, snapshot, user_id, ip_address, created_at)
        VALUES (
          ${id}::uuid,
          ${data.orgId}::uuid,
          ${data.entityType},
          ${data.entityId}::uuid,
          ${data.action}::"AuditAction",
          ${changesJson}::jsonb,
          ${snapshotJson}::jsonb,
          ${data.userId}::uuid,
          ${data.ipAddress ?? null},
          NOW()
        )
      `;
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err}`);
    }
  }
}
