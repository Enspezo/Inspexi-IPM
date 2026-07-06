import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '@/prisma';

/**
 * Retentie voor sync-tombstones: records die langer dan dit aantal dagen geleden
 * soft-deleted zijn (`deletedAt`) worden hard verwijderd. De PWA houdt tombstones
 * nodig om deletes over te syncen; na de retentie is elk online device allang bij.
 */
export const TOMBSTONE_RETENTION_DAYS = 90;

/**
 * FK-veilige hard-delete-volgorde voor de sync-tombstones (kind → ouder), afgeleid
 * van de seed-opruimvolgorde in `prisma/seed.ts`. Alle uitvoerings-records verwijzen
 * naar `assetNode` én `inspectionPlan` (onDelete: Cascade), dus die twee "ouders"
 * gaan als laatste. `finding` verwijst daarnaast optioneel naar `visualInspection`
 * en `measurementRecord` (SetNull) en gaat daarom als eerste.
 *
 * De unit-test bewijst dat deze volgorde topologisch klopt t.o.v.
 * {@link TOMBSTONE_FK_DEPENDENCIES}.
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
 * FK-afhankelijkheden bínnen de sync-entiteiten: `model` → de sync-modellen waar
 * het naar verwijst. Puur declaratief en alleen door de unit-test gebruikt om te
 * bewijzen dat {@link TOMBSTONE_DELETE_ORDER} elk kind vóór zijn ouder verwijdert.
 * Niet-sync-FK's (location, contact, user) staan hier bewust niet in: die modellen
 * ruimen we in deze job niet op.
 */
export const TOMBSTONE_FK_DEPENDENCIES: Record<TombstoneModel, TombstoneModel[]> = {
  finding: ['visualInspection', 'measurementRecord', 'assetNode', 'inspectionPlan'],
  visualInspection: ['assetNode', 'inspectionPlan'],
  measurementRecord: ['assetNode', 'inspectionPlan'],
  measurementSheetRecord: ['assetNode', 'inspectionPlan'],
  standaloneMeasurement: ['assetNode', 'inspectionPlan'],
  assetNode: [],
  inspectionPlan: [],
};

export type TombstonePurgeSummary = Record<TombstoneModel, number>;

/**
 * Ruimt verlopen sync-tombstones op. Idempotent: `deleteMany` op `deletedAt < cutoff`
 * vindt bij een tweede run niets meer. De twee ouder-entiteiten (`assetNode`,
 * `inspectionPlan`) worden alléén verwijderd als er geen sync-kinderen meer aan
 * hangen — zo kan een verlopen ouder nooit via onDelete: Cascade nog-levende
 * kinderen meesleuren; de boom convergeert bottom-up over meerdere runs.
 */
@Injectable()
export class TombstoneCleanupService {
  private readonly logger = new Logger(TombstoneCleanupService.name);

  constructor(private prisma: PrismaService) {}

  /** Dagelijks om 03:00 — buiten de piek en na de 02:00 offerte-job. */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCron(): Promise<void> {
    const summary = await this.purgeExpiredTombstones();
    const total = Object.values(summary).reduce((a, b) => a + b, 0);
    if (total === 0) {
      this.logger.log('Geen verlopen sync-tombstones om op te ruimen.');
      return;
    }
    this.logger.log(`Sync-tombstones opgeruimd (${total}): ${JSON.stringify(summary)}`);
  }

  /**
   * Hard-delete alle sync-tombstones met `deletedAt` ouder dan de retentie.
   * @param now injecteerbaar voor tests; default = huidige tijd.
   */
  async purgeExpiredTombstones(now: Date = new Date()): Promise<TombstonePurgeSummary> {
    const cutoff = new Date(now.getTime() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = { deletedAt: { lt: cutoff } };

    // Geen sync-kinderen meer → veilig om de ouder hard te verwijderen zonder dat
    // een Cascade nog-levende (deletedAt: null) kinderen meesleurt.
    const noSyncChildren = {
      findings: { none: {} },
      visualInspections: { none: {} },
      measurementRecords: { none: {} },
      measurementSheetRecords: { none: {} },
      standaloneMeasurements: { none: {} },
    };

    // Volgorde = TOMBSTONE_DELETE_ORDER. Kinderen eerst; hun verwijdering laat de
    // `{ none: {} }`-guards van de ouders in dezelfde run alsnog slagen.
    const finding = await this.prisma.finding.deleteMany({ where: expired });
    const visualInspection = await this.prisma.visualInspection.deleteMany({ where: expired });
    const measurementRecord = await this.prisma.measurementRecord.deleteMany({ where: expired });
    const measurementSheetRecord = await this.prisma.measurementSheetRecord.deleteMany({
      where: expired,
    });
    const standaloneMeasurement = await this.prisma.standaloneMeasurement.deleteMany({
      where: expired,
    });
    const assetNode = await this.prisma.assetNode.deleteMany({
      where: { ...expired, ...noSyncChildren, linkedMeasurements: { none: {} }, children: { none: {} } },
    });
    const inspectionPlan = await this.prisma.inspectionPlan.deleteMany({
      where: { ...expired, ...noSyncChildren },
    });

    return {
      finding: finding.count,
      visualInspection: visualInspection.count,
      measurementRecord: measurementRecord.count,
      measurementSheetRecord: measurementSheetRecord.count,
      standaloneMeasurement: standaloneMeasurement.count,
      assetNode: assetNode.count,
      inspectionPlan: inspectionPlan.count,
    };
  }
}
