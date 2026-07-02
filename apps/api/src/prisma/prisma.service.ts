import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { requestContext } from '../common/services/request-context';
import { AUDITED_MODELS, scalarSelect, getModelScalarFields, relationScalarColumns } from '../common/audit';

/** Fields excluded from change tracking */
const EXCLUDED_FIELDS = new Set([
  'passwordHash',
  'tokenHash',
  'createdAt',
  'updatedAt',
]);

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
  // Iterate the `before` keys: the before-state is fetched with a select limited to
  // the columns the update touches (+ id/orgId), so those are exactly the fields that
  // can change. `after` (the full write result) carries a value for each of them.
  for (const key of Object.keys(before)) {
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

      // Capture before-state for update/delete (best-effort; never blocks the op).
      // M7: fetch only the columns we actually diff/snapshot instead of the whole row —
      // no large JSON blobs, no sensitive columns (passwordHash/tokenHash) in memory.
      let before: Record<string, any> | null = null;
      if (action === 'update' || action === 'delete') {
        try {
          const whereId = params.args?.where?.id;
          if (whereId) {
            const delegate = (this as any)[this.toCamelCase(model)];
            const select = this.beforeStateSelect(model, action, params.args?.data);
            before = await delegate.findUnique({
              where: { id: whereId },
              ...(select ? { select } : {}),
            });
          }
        } catch {
          // proceed without before-state
        }
      }

      // Run the actual operation exactly once. Its errors must propagate untouched
      // so callers can act on them — e.g. the numbering engine catches P2002 to
      // regenerate. (Previously a thrown op was swallowed and `next` re-run, which
      // re-executed against an aborted transaction and masked the real error.)
      const result = await next(params);

      // Audit write is best-effort and must never turn a successful op into a failure.
      try {
        if (action === 'create') {
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
        } else if (action === 'update') {
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
        } else if (action === 'delete') {
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
        }
      } catch (auditError) {
        this.logger.error(
          `Audit middleware error for ${model}.${action}: ${auditError}`,
        );
      }

      return result;
    });
  }

  private toCamelCase(model: string): string {
    return model.charAt(0).toLowerCase() + model.slice(1);
  }

  /**
   * Minimal `select` for the audit before-state (M7).
   * - update: `id` + `orgId` + the scalar columns the update actually writes — exactly
   *   the fields `computeChanges` compares, so nothing is over-fetched and no spurious
   *   diff appears for a column we didn't read. A relation-write names the relation
   *   (`{ contact: { connect }}`), not the scalar FK column, so those keys are mapped
   *   back to their FK column(s) via the datamodel — otherwise a connect/disconnect
   *   FK change would silently drop out of the audit diff.
   * - delete: every scalar column except the excluded ones (createdAt/updatedAt +
   *   sensitive hashes), which is what the DELETE snapshot needs — minus the noise.
   * Returns `undefined` for an unknown model → caller falls back to a full fetch.
   */
  private beforeStateSelect(
    model: string,
    action: string,
    data: unknown,
  ): Record<string, true> | undefined {
    if (action === 'delete') {
      const scalars = getModelScalarFields(model);
      if (!scalars) return undefined;
      return scalarSelect(
        model,
        [...scalars].filter((f) => !EXCLUDED_FIELDS.has(f)),
      );
    }
    const dataKeys =
      data && typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : [];
    const fields = ['orgId'];
    for (const key of dataKeys) {
      if (EXCLUDED_FIELDS.has(key)) continue;
      // Relation-write key (contact/assignedUser/…) → its scalar FK column(s); a plain
      // scalar column passes through (scalarSelect drops anything that isn't a real column).
      const relationCols = relationScalarColumns(model, key);
      if (relationCols) fields.push(...relationCols);
      else fields.push(key);
    }
    return scalarSelect(model, fields);
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
