import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { NumberingModel, NumberingScheme, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { UpdateNumberingSchemeDto } from './dto';
import {
  DEFAULT_SCHEMES,
  NUMBERING_MODELS,
  NumberingContext,
  composeNumber,
  periodKeyFor,
  randomCandidate,
  sampleContext,
  validateAffix,
} from './numbering.helpers';

/** Minimal Prisma client surface needed for the atomic counter bump (PrismaService or a tx client). */
type RawClient = Pick<PrismaService, '$queryRaw'>;

/**
 * Central numbering engine. One generator for every model, race-free via an atomic
 * `INSERT ... ON CONFLICT` counter (no `max+1` scan) and a per-org unique constraint
 * as the final guard (P2002 → regenerate). See docs/CONFIGURABLE-NUMBERING.md.
 */
@Injectable()
export class NumberingService {
  /** Bounded retries: SEQUENTIAL advances past a taken slot, RANDOM re-rolls. */
  private static readonly MAX_ATTEMPTS = 10;

  constructor(private readonly prisma: PrismaService) {}

  // ─── Scheme management (config) ───────────────────────────────────────────

  /** Return the org scheme for a model, lazily provisioning the default if absent. */
  async ensureScheme(orgId: string, model: NumberingModel): Promise<NumberingScheme> {
    const d = DEFAULT_SCHEMES[model];
    // upsert (not findUnique-then-create) so two concurrent first-uses can't race.
    return this.prisma.numberingScheme.upsert({
      where: { orgId_model: { orgId, model } },
      create: { orgId, model, ...d },
      update: {},
    });
  }

  /** All four schemes for an org (provisioning any that are missing), stable order. */
  async listSchemes(orgId: string): Promise<NumberingScheme[]> {
    await Promise.all(NUMBERING_MODELS.map((m) => this.ensureScheme(orgId, m)));
    return this.prisma.numberingScheme.findMany({
      where: { orgId },
      orderBy: { model: 'asc' },
    });
  }

  getScheme(orgId: string, model: NumberingModel): Promise<NumberingScheme> {
    return this.ensureScheme(orgId, model);
  }

  async updateScheme(
    orgId: string,
    model: NumberingModel,
    dto: UpdateNumberingSchemeDto,
  ): Promise<NumberingScheme> {
    const scheme = await this.ensureScheme(orgId, model);

    if (dto.prefix !== undefined) this.assertAffix(dto.prefix, model, 'Prefix');
    if (dto.suffix !== undefined) this.assertAffix(dto.suffix, model, 'Suffix');

    const data: Prisma.NumberingSchemeUpdateInput = {
      ...(dto.prefix !== undefined && { prefix: dto.prefix }),
      ...(dto.suffix !== undefined && { suffix: dto.suffix }),
      ...(dto.mode !== undefined && { mode: dto.mode }),
      ...(dto.start !== undefined && { start: dto.start }),
      ...(dto.interval !== undefined && { interval: dto.interval }),
      ...(dto.digits !== undefined && { digits: dto.digits }),
      ...(dto.resetPolicy !== undefined && { resetPolicy: dto.resetPolicy }),
      ...(dto.allowManualEntry !== undefined && {
        allowManualEntry: dto.allowManualEntry,
      }),
      ...(dto.isActive !== undefined && { isActive: dto.isActive }),
    };

    return this.prisma.numberingScheme.update({ where: { id: scheme.id }, data });
  }

  /** A sample number for the settings UI (no counter mutation). */
  async preview(orgId: string, model: NumberingModel): Promise<{ example: string }> {
    const scheme = await this.ensureScheme(orgId, model);
    return { example: this.buildPreview(scheme) };
  }

  private buildPreview(scheme: NumberingScheme): string {
    const value = scheme.mode === 'RANDOM' ? randomCandidate(scheme.digits) : scheme.start;
    return composeNumber(scheme, value, sampleContext(scheme.model), new Date());
  }

  private assertAffix(value: string, model: NumberingModel, label: string): void {
    const result = validateAffix(value, model, label);
    if (!result.valid) throw new BadRequestException(result.error);
  }

  // ─── Generation ───────────────────────────────────────────────────────────

  /**
   * Generate a unique number for `model`/`orgId` and run `create` with it inside a
   * transaction. Centralizes manual-entry handling, the atomic counter and the
   * P2002 → regenerate retry so every consumer stays a one-liner.
   *
   * - `manual` set + scheme allows it  → use as-is (uniqueness via DB constraint → 409).
   * - `manual` set + scheme forbids it → 400.
   * - otherwise                        → generate; SEQUENTIAL advances past taken
   *   slots (counter committed per attempt, gaps tolerated), RANDOM re-rolls.
   */
  async runWithGeneratedNumber<T>(
    model: NumberingModel,
    orgId: string,
    opts: { context?: NumberingContext; manual?: string | null },
    create: (tx: Prisma.TransactionClient, value: string) => Promise<T>,
  ): Promise<T> {
    const scheme = await this.ensureScheme(orgId, model);
    const ctx = opts.context ?? {};
    const manual = opts.manual?.trim() || null;

    if (manual) {
      if (!scheme.allowManualEntry) {
        throw new BadRequestException(
          'Handmatige nummering is niet toegestaan voor dit type',
        );
      }
      try {
        return await this.prisma.$transaction((tx) => create(tx, manual));
      } catch (err) {
        if (this.isUniqueViolation(err)) {
          throw new ConflictException(`Nummer "${manual}" bestaat al`);
        }
        throw err;
      }
    }

    for (let attempt = 0; attempt < NumberingService.MAX_ATTEMPTS; attempt++) {
      const number = await this.generateCandidate(scheme, ctx);
      try {
        return await this.prisma.$transaction((tx) => create(tx, number));
      } catch (err) {
        if (this.isUniqueViolation(err)) continue; // collision → next value / re-roll
        throw err;
      }
    }

    throw new ConflictException(
      'Kon geen uniek nummer genereren. Verhoog het aantal cijfers of probeer opnieuw.',
    );
  }

  /**
   * Public, transaction-free generation when the caller manages its own transaction
   * boundary differently (also used by the backfill script). Commits the counter
   * bump immediately; the caller is responsible for the uniqueness retry.
   */
  async generateNumber(
    orgId: string,
    model: NumberingModel,
    context: NumberingContext = {},
  ): Promise<string> {
    const scheme = await this.ensureScheme(orgId, model);
    return this.generateCandidate(scheme, context);
  }

  /**
   * Produce one candidate number. For SEQUENTIAL the counter is bumped on the base
   * client (committed immediately) so a retry advances past a taken slot instead of
   * re-issuing the same value; gaps on a failed create are acceptable for numbering.
   */
  private async generateCandidate(
    scheme: NumberingScheme,
    ctx: NumberingContext,
  ): Promise<string> {
    const date = ctx.date ?? new Date();
    if (scheme.mode === 'RANDOM') {
      return composeNumber(scheme, randomCandidate(scheme.digits), ctx, date);
    }
    const periodKey = periodKeyFor(scheme.resetPolicy, date);
    const value = await this.bumpCounter(
      this.prisma,
      scheme.id,
      periodKey,
      scheme.start,
      scheme.interval,
    );
    return composeNumber(scheme, value, ctx, date);
  }

  /**
   * Atomically claim the next counter value for (scheme, period). A single
   * statement: insert `start` for a brand-new period, otherwise `value + interval`.
   * Returns the issued value. Race-free regardless of concurrency.
   */
  private async bumpCounter(
    client: RawClient,
    schemeId: string,
    periodKey: string,
    start: number,
    interval: number,
  ): Promise<number> {
    const rows = await client.$queryRaw<{ value: number }[]>(Prisma.sql`
      INSERT INTO imp_numbering_counters (id, scheme_id, period_key, value, updated_at)
      VALUES (gen_random_uuid(), ${schemeId}::uuid, ${periodKey}, ${start}, now())
      ON CONFLICT (scheme_id, period_key)
      DO UPDATE SET value = imp_numbering_counters.value + ${interval}, updated_at = now()
      RETURNING value
    `);
    return Number(rows[0].value);
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
    );
  }
}
