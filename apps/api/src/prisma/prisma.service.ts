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
  'WorkOrder',
  'WorkOrderLine',
  // Inspectiedomein (Fase 1)
  'InspectionPlan',
  'Asset',
  'Finding',
  'InspectionLocation',
  'Checklist',
  'ChecklistItem',
  'Category',
  'FindingTemplate',
  'ClassificationModel',
  'NormTypeDefinition',
  'AssetTypeDefinition',
  'LocationTypeDefinition',
  'InspectionTemplate',
  'MeasurementSheetTemplate',
  'MeasurementSheetRecord',
  // Inspectiedomein (Fase 2 — uitvoering)
  'VisualInspection',
  'MeasurementRecord',
  'StandaloneMeasurement',
  'LocationImage',
  'GeneratedDocument',
  'ClientRequest',
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
  WorkOrder: 'imp_work_orders',
  WorkOrderLine: 'imp_work_order_lines',
  // Inspectiedomein (Fase 1)
  InspectionPlan: 'imp_inspection_plans',
  Asset: 'imp_assets',
  Finding: 'imp_findings',
  InspectionLocation: 'imp_inspection_locations',
  Checklist: 'imp_checklists',
  ChecklistItem: 'imp_checklist_items',
  Category: 'imp_categories',
  FindingTemplate: 'imp_finding_templates',
  ClassificationModel: 'imp_classification_models',
  NormTypeDefinition: 'imp_norm_type_definitions',
  AssetTypeDefinition: 'imp_asset_type_definitions',
  LocationTypeDefinition: 'imp_location_type_definitions',
  InspectionTemplate: 'imp_inspection_templates',
  MeasurementSheetTemplate: 'imp_measurement_sheet_templates',
  MeasurementSheetRecord: 'imp_measurement_sheet_records',
  // Inspectiedomein (Fase 2 — uitvoering)
  VisualInspection: 'imp_visual_inspections',
  MeasurementRecord: 'imp_measurement_records',
  StandaloneMeasurement: 'imp_standalone_measurements',
  LocationImage: 'imp_location_images',
  GeneratedDocument: 'imp_generated_documents',
  ClientRequest: 'imp_client_requests',
};

/** Audit-failure alerting thresholds (in-memory, single process) */
const AUDIT_FAILURE_THRESHOLD = 5; // failures within the window before alerting
const AUDIT_FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const AUDIT_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 60 minutes between alerts

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

  /** Timestamps (ms) of recent audit-write failures within the rolling window */
  private auditFailureTimestamps: number[] = [];
  /** Timestamp (ms) of the last superuser alert that was dispatched */
  private lastAuditAlertAt = 0;
  /** Guards against double-dispatch while an alert is in flight */
  private auditAlertInFlight = false;

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
      // Whole alerting path is fire-and-forget and exception-safe:
      // it must never break (or delay) the original operation.
      this.recordAuditFailure();
    }
  }

  /**
   * Tracks audit-write failures in-memory. When failures pile up structurally
   * (>= AUDIT_FAILURE_THRESHOLD within AUDIT_FAILURE_WINDOW_MS) a single alert is
   * dispatched to superusers, then repeat alerts are suppressed for a cooldown
   * period to avoid notification spam. Single-process / in-memory by design.
   */
  private recordAuditFailure(): void {
    try {
      const now = Date.now();
      this.auditFailureTimestamps.push(now);
      // Drop timestamps that fell outside the rolling window; cap the size so
      // the failure path stays O(1) even when every request fails
      const windowStart = now - AUDIT_FAILURE_WINDOW_MS;
      this.auditFailureTimestamps = this.auditFailureTimestamps
        .filter((ts) => ts >= windowStart)
        .slice(-AUDIT_FAILURE_THRESHOLD);

      if (this.auditFailureTimestamps.length < AUDIT_FAILURE_THRESHOLD) {
        return;
      }

      // Threshold reached — respect cooldown to avoid spamming superusers,
      // and don't double-dispatch while an alert is already in flight
      if (this.auditAlertInFlight || now - this.lastAuditAlertAt < AUDIT_ALERT_COOLDOWN_MS) {
        return;
      }

      const failureCount = this.auditFailureTimestamps.length;
      this.auditAlertInFlight = true;

      this.logger.error(
        `ALERT: audit-logging is structurally failing — ${failureCount} failures ` +
          `within the last ${AUDIT_FAILURE_WINDOW_MS / 60000} minutes. ` +
          `Notifying superusers.`,
      );

      // Fire-and-forget: never await, never let it throw into the caller.
      // Cooldown/window pas resetten als de dispatch slaagt — bij falen mag
      // de volgende batch het opnieuw proberen.
      this.dispatchAuditFailureAlert(failureCount)
        .then(() => {
          this.lastAuditAlertAt = Date.now();
          this.auditFailureTimestamps = [];
        })
        .catch((err) => {
          this.logger.error(`Failed to dispatch audit-failure alert: ${err}`);
        })
        .finally(() => {
          this.auditAlertInFlight = false;
        });
    } catch (err) {
      // Alerting must never break the original operation
      this.logger.error(`Audit-failure tracking error: ${err}`);
    }
  }

  /**
   * Writes Notification rows for all active superusers directly via raw SQL.
   * Done with $executeRaw (like writeAuditLog) to avoid a DI cycle:
   * NotificationsService depends on PrismaService, so PrismaService cannot
   * depend on it. Reuses the existing FOUTMELDING_INGEDIEND notification type
   * since no migration may be added here.
   */
  private async dispatchAuditFailureAlert(failureCount: number): Promise<void> {
    const superusers = await this.$queryRaw<{ id: string }[]>`
      SELECT id FROM imp_users
      WHERE 'SUPERUSER' = ANY(roles)
        AND is_deleted = false
        AND is_active = true
    `;

    if (superusers.length === 0) {
      this.logger.error(
        'Audit-logging is failing but no active superuser exists to notify.',
      );
      return;
    }

    const title = 'Audit-logging faalt';
    const body =
      `Het wegschrijven van audit-logregels faalt structureel ` +
      `(${failureCount} fouten in ${AUDIT_FAILURE_WINDOW_MS / 60000} minuten). ` +
      `Controleer de database en de serverlogs. ` +
      `Verdere meldingen worden ${AUDIT_ALERT_COOLDOWN_MS / 60000} minuten onderdrukt.`;

    for (const su of superusers) {
      const id = randomUUID();
      try {
        await this.$executeRaw`
          INSERT INTO imp_notifications (id, org_id, user_id, type, title, body, entity_type, entity_id, is_read, created_at)
          VALUES (
            ${id}::uuid,
            ${null},
            ${su.id}::uuid,
            ${'FOUTMELDING_INGEDIEND'}::"NotificationType",
            ${title},
            ${body},
            ${'AuditLog'},
            ${null},
            false,
            NOW()
          )
        `;
      } catch (err) {
        this.logger.error(
          `Failed to insert audit-failure notification for superuser ${su.id}: ${err}`,
        );
      }
    }
  }
}
