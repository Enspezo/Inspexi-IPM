import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';

/**
 * Retentie voor sync-tombstones: records die langer dan dit aantal dagen geleden
 * soft-deleted zijn (`deletedAt`) worden hard verwijderd. De PWA houdt tombstones
 * nodig om deletes over te syncen; na de retentie is elk online device allang bij.
 */
export const TOMBSTONE_RETENTION_DAYS = 90;

/**
 * Env-kill-switch. Default aan; alleen de expliciete waarden `'0'` en `'false'`
 * (case-insensitief) schakelen de cron uit. Gedocumenteerd in `.env.example`.
 */
export const TOMBSTONE_CLEANUP_ENABLED_ENV = 'TOMBSTONE_CLEANUP_ENABLED';

/**
 * FK-veilige hard-delete-volgorde voor de sync-tombstones (kind → ouder). Alle
 * uitvoerings-records verwijzen naar `assetNode` én `inspectionPlan`, dus die twee
 * "ouders" gaan als laatste. `finding` verwijst daarnaast optioneel naar
 * `visualInspection` en `measurementRecord` en gaat daarom als eerste.
 *
 * De unit-test leidt de vereiste volgorde-constraints uit de DMMF af en bewijst dat
 * deze lijst elk kind vóór zijn sync-ouder verwijdert.
 */
export const TOMBSTONE_DELETE_ORDER = [
  'finding',
  'visualInspection',
  'measurementRecord',
  'measurementSheetRecord',
  'standaloneMeasurement',
  'assetNode',
  'inspectionPlan',
] as const;

export type TombstoneModel = (typeof TOMBSTONE_DELETE_ORDER)[number];

/**
 * Guards per ouder-entiteit: back-relation-veldnamen waarop `{ <relatie>: { none: {} } }`
 * moet gelden vóórdat de ouder hard verwijderd mag worden. Twee soorten dekking:
 *
 *  - **RESTRICT-inbound FK** (verplichte relatie zónder `onDelete` in het schema →
 *    effectief `Restrict`): een resterende referrer laat `deleteMany` een P2003 gooien
 *    en blokkeert daarmee de HELE batch. Guards: `planScopes` (InspectionPlanLocation),
 *    `standaloneMeasurements` (StandaloneMeasurement.locationNode) op `assetNode`;
 *    `reports` (Report), `generatedDocuments` (GeneratedDocument),
 *    `measurementSheetRecords` (MeasurementSheetRecord) op `inspectionPlan`.
 *  - **CASCADE-inbound FK vanuit een sync-kind**: het verwijderen van de getombstonede
 *    ouder zou nog-levende (niet-getombstonede) kinderen mee-cascaden. Guards:
 *    `findings`, `visualInspections`, `measurementRecords`.
 *  - **SetNull-inbound** die we behoudend guarden om levende data niet los te koppelen:
 *    `children` (subtree onder een LOCATION-node) en `linkedMeasurements`
 *    (StandaloneMeasurement.linkedAssetNode).
 *
 * De unit-test leidt de RESTRICT/NoAction-guards af uit de DMMF en faalt als deze map
 * er één mist — bijvoorbeeld wanneer iemand een nieuwe verplichte relatie zonder
 * `onDelete` naar een gepurged model toevoegt.
 */
export const TOMBSTONE_PARENT_GUARDS = {
  assetNode: [
    'findings',
    'visualInspections',
    'measurementRecords',
    'measurementSheetRecords',
    'standaloneMeasurements',
    'linkedMeasurements',
    'children',
    'planScopes',
  ],
  inspectionPlan: [
    'findings',
    'visualInspections',
    'measurementRecords',
    'measurementSheetRecords',
    'standaloneMeasurements',
    'reports',
    'generatedDocuments',
  ],
} satisfies Partial<Record<TombstoneModel, readonly string[]>>;

export type TombstonePurgeSummary = Record<TombstoneModel, number>;

/**
 * Ruimt verlopen sync-tombstones op. Idempotent: `deleteMany` op `deletedAt < cutoff`
 * vindt bij een tweede run niets meer. De ouder-entiteiten worden alléén verwijderd
 * als er geen guarded referrers (zie {@link TOMBSTONE_PARENT_GUARDS}) meer aan hangen —
 * zo blokkeert een RESTRICT-FK de batch niet en sleurt een `onDelete: Cascade` nooit
 * nog-levende kinderen mee. De boom convergeert bottom-up over meerdere dagelijkse runs.
 */
@Injectable()
export class TombstoneCleanupService {
  private readonly logger = new Logger(TombstoneCleanupService.name);

  constructor(private prisma: PrismaService) {}

  /** Dagelijks om 03:00 — buiten de piek en na de 02:00 offerte-job. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    if (!TombstoneCleanupService.isEnabled()) {
      this.logger.log(
        `Tombstone-cleanup overgeslagen: uitgeschakeld via ${TOMBSTONE_CLEANUP_ENABLED_ENV}.`,
      );
      return;
    }

    // Vangnet: per-model fouten worden al binnen purgeExpiredTombstones gevangen,
    // maar de cron mag onder geen beding een unhandled rejection produceren.
    try {
      const summary = await this.purgeExpiredTombstones();
      const total = Object.values(summary).reduce((a, b) => a + b, 0);
      if (total === 0) {
        this.logger.log('Geen verlopen sync-tombstones om op te ruimen.');
        return;
      }
      this.logger.log(`Sync-tombstones opgeruimd (${total}): ${JSON.stringify(summary)}`);
    } catch (err) {
      this.logger.error('Tombstone-cleanup cron faalde onverwacht.', this.stack(err));
    }
  }

  /**
   * Hard-delete alle sync-tombstones met `deletedAt` ouder dan de retentie, in de
   * FK-veilige volgorde. Elke stap heeft een eigen try/catch: een fout op één model
   * (bv. een nog niet-geguarde RESTRICT-FK) wordt gelogd en telt als 0, terwijl de
   * overige modellen gewoon doorgaan.
   * @param now injecteerbaar voor tests; default = huidige tijd.
   */
  async purgeExpiredTombstones(now: Date = new Date()): Promise<TombstonePurgeSummary> {
    const cutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = { deletedAt: { lt: cutoff } };

    // Volgorde = TOMBSTONE_DELETE_ORDER. Kinderen eerst; hun verwijdering laat de
    // `{ none: {} }`-guards van de ouders in dezelfde run alsnog slagen.
    const finding = await this.safeDelete('finding', () =>
      this.prisma.finding.deleteMany({ where: expired }),
    );
    const visualInspection = await this.safeDelete('visualInspection', () =>
      this.prisma.visualInspection.deleteMany({ where: expired }),
    );
    const measurementRecord = await this.safeDelete('measurementRecord', () =>
      this.prisma.measurementRecord.deleteMany({ where: expired }),
    );
    const measurementSheetRecord = await this.safeDelete('measurementSheetRecord', () =>
      this.prisma.measurementSheetRecord.deleteMany({ where: expired }),
    );
    const standaloneMeasurement = await this.safeDelete('standaloneMeasurement', () =>
      this.prisma.standaloneMeasurement.deleteMany({ where: expired }),
    );
    const assetNode = await this.safeDelete('assetNode', () =>
      this.prisma.assetNode.deleteMany({
        where: { ...expired, ...this.noneGuards('assetNode') } as Prisma.AssetNodeWhereInput,
      }),
    );
    const inspectionPlan = await this.safeDelete('inspectionPlan', () =>
      this.prisma.inspectionPlan.deleteMany({
        where: {
          ...expired,
          ...this.noneGuards('inspectionPlan'),
        } as Prisma.InspectionPlanWhereInput,
      }),
    );

    return {
      finding,
      visualInspection,
      measurementRecord,
      measurementSheetRecord,
      standaloneMeasurement,
      assetNode,
      inspectionPlan,
    };
  }

  /** `{ <relatie>: { none: {} } }` voor elke guard van dit model (single source of truth). */
  private noneGuards(model: TombstoneModel): Record<string, { none: Record<string, never> }> {
    const relations: readonly string[] =
      model in TOMBSTONE_PARENT_GUARDS
        ? TOMBSTONE_PARENT_GUARDS[model as keyof typeof TOMBSTONE_PARENT_GUARDS]
        : [];
    return Object.fromEntries(relations.map((rel) => [rel, { none: {} }]));
  }

  /** Draait één deleteMany-stap en vangt fouten af zodat de cron niet omvalt. */
  private async safeDelete(
    model: TombstoneModel,
    run: () => Promise<{ count: number }>,
  ): Promise<number> {
    try {
      const { count } = await run();
      return count;
    } catch (err) {
      this.logger.error(
        `Tombstone-purge faalde voor '${model}'; overige modellen gaan door.`,
        this.stack(err),
      );
      return 0;
    }
  }

  private stack(err: unknown): string {
    return err instanceof Error ? (err.stack ?? err.message) : String(err);
  }

  /** Default aan; alleen '0'/'false' (case-insensitief) schakelt uit. */
  private static isEnabled(): boolean {
    const raw = process.env[TOMBSTONE_CLEANUP_ENABLED_ENV]?.trim().toLowerCase();
    return raw !== '0' && raw !== 'false';
  }
}
