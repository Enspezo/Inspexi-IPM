import {
  Injectable,
  Logger,
  Inject,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  computeCalibrationStatus,
  addMonths,
  DEFAULT_CALIBRATION_WARN_DAYS,
  type CalibrationStatus,
} from '@inspexi/calibration';
import { PrismaService } from '@/prisma';
import {
  STORAGE_PROVIDER,
  type StorageProvider,
} from '@/common/services/storage/storage.interface';
import {
  paginate,
  buildOrderBy,
  orgScope,
  assertSameOrg,
  assertAllSameOrg,
  requireOrg,
  USER_SUMMARY_SELECT,
  assertAllowedPdfOrImageUpload,
} from '@/common';
import {
  CreateMeasurementInstrumentDto,
  UpdateMeasurementInstrumentDto,
  QueryMeasurementInstrumentsDto,
  CreateCalibrationDto,
  UpdateCalibrationDto,
} from './dto';

/** Reads carry the assigned inspector so overviews can label the holder. */
const instrumentInclude = {
  assignedTo: { select: USER_SUMMARY_SELECT },
} satisfies Prisma.MeasurementInstrumentInclude;

type InstrumentRow = Prisma.MeasurementInstrumentGetPayload<{
  include: typeof instrumentInclude;
}>;

const ALLOWED_SORT_FIELDS = [
  'code',
  'brand',
  'type',
  'serialNumber',
  'status',
  'lastCalibrationDate',
  'nextCalibrationDue',
  'createdAt',
];

@Injectable()
export class MeasurementInstrumentsService {
  private readonly logger = new Logger(MeasurementInstrumentsService.name);

  /** Waarschuwingsdrempel (dagen) voor "verloopt binnenkort"; env-configureerbaar. */
  private readonly warnDays =
    Number(process.env.MEETMIDDEL_KALIBRATIE_DREMPEL_DAGEN) ||
    DEFAULT_CALIBRATION_WARN_DAYS;

  constructor(
    private prisma: PrismaService,
    @Inject(STORAGE_PROVIDER) private storage: StorageProvider,
  ) {}

  // ─── Instrument reads ───────────────────────────────────

  async findAll(user: User, query: QueryMeasurementInstrumentsDto) {
    const {
      search,
      status,
      assignedToUserId,
      calibrationStatus,
      onlyMine,
      page = 1,
      limit = 20,
      sortBy,
      sortOrder = 'desc',
    } = query;

    const orderBy = buildOrderBy(sortBy, sortOrder, ALLOWED_SORT_FIELDS, {
      nextCalibrationDue: 'asc',
    });

    const where: Prisma.MeasurementInstrumentWhereInput = {
      ...orgScope(user),
      isDeleted: false,
      ...(status ? { status } : {}),
      ...(onlyMine
        ? { assignedToUserId: user.id }
        : assignedToUserId
          ? { assignedToUserId }
          : {}),
      ...this.calibrationStatusWhere(calibrationStatus),
    };

    if (search) {
      where.AND = [
        {
          OR: [
            { code: { contains: search, mode: 'insensitive' } },
            { brand: { contains: search, mode: 'insensitive' } },
            { type: { contains: search, mode: 'insensitive' } },
            { serialNumber: { contains: search, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const result = await paginate(this.prisma.measurementInstrument, {
      where,
      include: instrumentInclude,
      orderBy,
      page,
      limit,
    });

    return {
      ...result,
      data: (result.data as InstrumentRow[]).map((i) => this.enrich(i)),
    };
  }

  async findOne(id: string, user: User) {
    const instrument = await this.prisma.measurementInstrument.findUnique({
      where: { id },
      include: {
        assignedTo: { select: USER_SUMMARY_SELECT },
        calibrations: {
          where: { isDeleted: false },
          orderBy: { calibrationDate: 'desc' },
        },
      },
    });
    this.assertAccessible(instrument, user);
    const { calibrations, ...rest } = instrument!;
    return {
      ...this.enrich(rest),
      calibrationCount: calibrations.length,
      calibrations: calibrations.map((c) => this.serializeCalibration(c)),
    };
  }

  // ─── Instrument writes ──────────────────────────────────

  async create(user: User, dto: CreateMeasurementInstrumentDto) {
    const orgId = requireOrg(user);
    await assertSameOrg(this.prisma.user, dto.assignedToUserId, orgId, 'Gebruiker');

    try {
      const created = await this.prisma.measurementInstrument.create({
        data: {
          orgId,
          code: dto.code.trim(),
          brand: dto.brand,
          type: dto.type,
          serialNumber: dto.serialNumber?.trim() || null,
          calibrationIntervalMonths: dto.calibrationIntervalMonths,
          status: dto.status ?? 'ACTIEF',
          assignedToUserId: dto.assignedToUserId ?? null,
          notes: dto.notes?.trim() || null,
          createdById: user.id,
        },
        include: instrumentInclude,
      });
      return this.enrich(created);
    } catch (e) {
      throw this.translateUniqueCode(e, dto.code);
    }
  }

  async update(id: string, user: User, dto: UpdateMeasurementInstrumentDto) {
    const instrument = await this.getOwnedInstrument(id, user);
    if (dto.assignedToUserId) {
      await assertSameOrg(this.prisma.user, dto.assignedToUserId, instrument.orgId, 'Gebruiker');
    }

    const data: Prisma.MeasurementInstrumentUpdateInput = {};
    if (dto.code !== undefined) data.code = dto.code.trim();
    if (dto.brand !== undefined) data.brand = dto.brand;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.serialNumber !== undefined) data.serialNumber = dto.serialNumber?.trim() || null;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    if (dto.assignedToUserId !== undefined) {
      data.assignedTo = dto.assignedToUserId
        ? { connect: { id: dto.assignedToUserId } }
        : { disconnect: true };
    }
    // Interval-wijziging verschuift de verloopdatum → herbereken.
    const intervalChanged =
      dto.calibrationIntervalMonths !== undefined &&
      dto.calibrationIntervalMonths !== instrument.calibrationIntervalMonths;
    if (dto.calibrationIntervalMonths !== undefined) {
      data.calibrationIntervalMonths = dto.calibrationIntervalMonths;
    }

    try {
      const updated = await this.prisma.measurementInstrument.update({
        where: { id },
        data,
        include: instrumentInclude,
      });
      if (intervalChanged) {
        const recomputed = await this.recomputeInstrumentCache(id);
        return this.enrich({ ...updated, ...recomputed });
      }
      return this.enrich(updated);
    } catch (e) {
      throw this.translateUniqueCode(e, dto.code ?? instrument.code);
    }
  }

  /** Soft-delete; eventueel toegewezen blijft, kalibraties blijven (verborgen via instrument). */
  async remove(id: string, user: User) {
    await this.getOwnedInstrument(id, user);
    await this.prisma.measurementInstrument.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  // ─── Calibrations (subresource) ─────────────────────────

  async listCalibrations(instrumentId: string, user: User) {
    await this.getOwnedInstrument(instrumentId, user);
    const calibrations = await this.prisma.calibration.findMany({
      where: { instrumentId, isDeleted: false },
      orderBy: { calibrationDate: 'desc' },
    });
    return calibrations.map((c) => this.serializeCalibration(c));
  }

  async createCalibration(
    instrumentId: string,
    user: User,
    dto: CreateCalibrationDto,
    file: Express.Multer.File | undefined,
  ) {
    const instrument = await this.getOwnedInstrument(instrumentId, user);
    const fileFields = file ? await this.storeFile(instrument.orgId, instrumentId, file) : {};

    const created = await this.prisma.calibration.create({
      data: {
        orgId: instrument.orgId,
        instrumentId,
        calibrationDate: new Date(dto.calibrationDate),
        performedBy: dto.performedBy,
        certificateNumber: dto.certificateNumber?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdById: user.id,
        ...fileFields,
      },
    });

    await this.recomputeInstrumentCache(instrumentId);
    return this.serializeCalibration(created);
  }

  async updateCalibration(
    instrumentId: string,
    calId: string,
    user: User,
    dto: UpdateCalibrationDto,
    file: Express.Multer.File | undefined,
  ) {
    await this.getOwnedInstrument(instrumentId, user);
    const calibration = await this.getOwnedCalibration(instrumentId, calId);

    const data: Prisma.CalibrationUpdateInput = {};
    if (dto.calibrationDate !== undefined && dto.calibrationDate !== '') {
      data.calibrationDate = new Date(dto.calibrationDate);
    }
    if (dto.performedBy !== undefined) data.performedBy = dto.performedBy;
    if (dto.certificateNumber !== undefined) {
      data.certificateNumber = dto.certificateNumber?.trim() || null;
    }
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;

    if (file) {
      const fileFields = await this.storeFile(calibration.orgId, instrumentId, file);
      Object.assign(data, fileFields);
      if (calibration.storageKey) await this.safeDelete(calibration.storageKey);
    }

    const updated = await this.prisma.calibration.update({ where: { id: calId }, data });
    await this.recomputeInstrumentCache(instrumentId);
    return this.serializeCalibration(updated);
  }

  /** Soft-delete van de kalibratie + opslag-opruiming; daarna cache herberekenen. */
  async removeCalibration(instrumentId: string, calId: string, user: User) {
    await this.getOwnedInstrument(instrumentId, user);
    const calibration = await this.getOwnedCalibration(instrumentId, calId);
    if (calibration.storageKey) await this.safeDelete(calibration.storageKey);
    await this.prisma.calibration.update({
      where: { id: calId },
      data: { isDeleted: true, storageKey: null },
    });
    await this.recomputeInstrumentCache(instrumentId);
  }

  /** Alleen het certificaat verwijderen; de kalibratie blijft. */
  async removeCalibrationDocument(instrumentId: string, calId: string, user: User) {
    await this.getOwnedInstrument(instrumentId, user);
    const calibration = await this.getOwnedCalibration(instrumentId, calId);
    if (!calibration.storageKey) {
      throw new NotFoundException('Geen certificaat gekoppeld aan deze kalibratie');
    }
    await this.safeDelete(calibration.storageKey);
    const updated = await this.prisma.calibration.update({
      where: { id: calId },
      data: { storageKey: null, fileName: null, originalName: null, mimeType: null, size: null },
    });
    return this.serializeCalibration(updated);
  }

  /** Bestand-buffer + metadata voor de download-stream. */
  async getCalibrationDocument(instrumentId: string, calId: string, user: User) {
    await this.getOwnedInstrument(instrumentId, user);
    const calibration = await this.getOwnedCalibration(instrumentId, calId);
    if (!calibration.storageKey || !calibration.originalName || !calibration.mimeType) {
      throw new NotFoundException('Geen certificaat gekoppeld aan deze kalibratie');
    }
    const buffer = await this.storage.download(calibration.storageKey);
    return { buffer, calibration };
  }

  // ─── Suggestions ────────────────────────────────────────

  async getSuggestions(
    user: User,
    field: 'brand' | 'type' | 'performedBy',
    q?: string,
  ): Promise<string[]> {
    const like = q ? { contains: q, mode: 'insensitive' as const } : undefined;

    if (field === 'performedBy') {
      const rows = await this.prisma.calibration.findMany({
        where: { ...orgScope(user), isDeleted: false, ...(like ? { performedBy: like } : {}) },
        select: { performedBy: true },
        distinct: ['performedBy'],
        orderBy: { performedBy: 'asc' },
        take: 20,
      });
      return rows.map((r) => r.performedBy);
    }

    const base = { ...orgScope(user), isDeleted: false };
    if (field === 'brand') {
      const rows = await this.prisma.measurementInstrument.findMany({
        where: { ...base, ...(like ? { brand: like } : {}) },
        select: { brand: true },
        distinct: ['brand'],
        orderBy: { brand: 'asc' },
        take: 20,
      });
      return rows.map((r) => r.brand);
    }

    const rows = await this.prisma.measurementInstrument.findMany({
      where: { ...base, ...(like ? { type: like } : {}) },
      select: { type: true },
      distinct: ['type'],
      orderBy: { type: 'asc' },
      take: 20,
    });
    return rows.map((r) => r.type);
  }

  // ─── Voorkeuren (niveau 1: inspecteur; niveau 2: inspectie) ──

  async getMyDefaults(user: User): Promise<string[]> {
    const rows = await this.prisma.userDefaultInstrument.findMany({
      where: { userId: user.id, instrument: { isDeleted: false } },
      select: { instrumentId: true },
    });
    return rows.map((r) => r.instrumentId);
  }

  async setMyDefaults(user: User, instrumentIds: string[]): Promise<string[]> {
    const orgId = requireOrg(user);
    await assertAllSameOrg(this.prisma.measurementInstrument, instrumentIds, orgId, 'meetmiddelen');
    const ids = [...new Set(instrumentIds)];
    await this.prisma.$transaction([
      this.prisma.userDefaultInstrument.deleteMany({ where: { userId: user.id } }),
      ...(ids.length
        ? [
            this.prisma.userDefaultInstrument.createMany({
              data: ids.map((instrumentId) => ({ orgId, userId: user.id, instrumentId })),
            }),
          ]
        : []),
    ]);
    return ids;
  }

  async getPlanDefaults(planId: string, user: User): Promise<string[]> {
    await assertSameOrg(this.prisma.inspectionPlan, planId, user.orgId, 'Inspectieplan');
    const rows = await this.prisma.inspectionPlanDefaultInstrument.findMany({
      where: { inspectionPlanId: planId, instrument: { isDeleted: false } },
      select: { instrumentId: true },
    });
    return rows.map((r) => r.instrumentId);
  }

  async setPlanDefaults(planId: string, user: User, instrumentIds: string[]): Promise<string[]> {
    const orgId = requireOrg(user);
    await assertSameOrg(this.prisma.inspectionPlan, planId, orgId, 'Inspectieplan');
    await assertAllSameOrg(this.prisma.measurementInstrument, instrumentIds, orgId, 'meetmiddelen');
    const ids = [...new Set(instrumentIds)];
    await this.prisma.$transaction([
      this.prisma.inspectionPlanDefaultInstrument.deleteMany({
        where: { inspectionPlanId: planId },
      }),
      ...(ids.length
        ? [
            this.prisma.inspectionPlanDefaultInstrument.createMany({
              data: ids.map((instrumentId) => ({ orgId, inspectionPlanId: planId, instrumentId })),
            }),
          ]
        : []),
    ]);
    return ids;
  }

  // ─── Cache-herberekening ────────────────────────────────

  /**
   * Herbereken `lastCalibrationDate` (= max kalibratiedatum) en `nextCalibrationDue`
   * (= laatste + interval). Reset de verloop-notificatiestage UITSLUITEND wanneer de
   * verloopdatum vooruit schuift (een nieuwe, latere kalibratie); een delete die de
   * datum naar voren haalt mag een reeds verzonden "expired"-stage niet wissen.
   */
  async recomputeInstrumentCache(instrumentId: string): Promise<{
    lastCalibrationDate: Date | null;
    nextCalibrationDue: Date | null;
  }> {
    const [instrument, latest] = await Promise.all([
      this.prisma.measurementInstrument.findUnique({
        where: { id: instrumentId },
        select: { calibrationIntervalMonths: true, nextCalibrationDue: true },
      }),
      this.prisma.calibration.findFirst({
        where: { instrumentId, isDeleted: false },
        orderBy: { calibrationDate: 'desc' },
        select: { calibrationDate: true },
      }),
    ]);
    if (!instrument) return { lastCalibrationDate: null, nextCalibrationDue: null };

    const lastCalibrationDate = latest?.calibrationDate ?? null;
    const nextCalibrationDue = lastCalibrationDate
      ? addMonths(lastCalibrationDate, instrument.calibrationIntervalMonths)
      : null;

    const movedForward =
      nextCalibrationDue !== null &&
      (instrument.nextCalibrationDue === null ||
        nextCalibrationDue.getTime() > instrument.nextCalibrationDue.getTime());

    await this.prisma.measurementInstrument.update({
      where: { id: instrumentId },
      data: {
        lastCalibrationDate,
        nextCalibrationDue,
        ...(movedForward ? { lastExpiryNotifiedStage: null, lastExpiryNotifiedAt: null } : {}),
      },
    });

    return { lastCalibrationDate, nextCalibrationDue };
  }

  // ─── Helpers ────────────────────────────────────────────

  /** Fetch + tenant/soft-delete-check; cross-tenant id → 404 (bestaan niet lekken). */
  private async getOwnedInstrument(id: string, user: User): Promise<InstrumentRow> {
    const instrument = await this.prisma.measurementInstrument.findUnique({
      where: { id },
      include: instrumentInclude,
    });
    this.assertAccessible(instrument, user);
    return instrument!;
  }

  private assertAccessible(
    instrument: { orgId: string; isDeleted: boolean } | null,
    user: User,
  ): void {
    if (!instrument || instrument.isDeleted) {
      throw new NotFoundException('Meetmiddel niet gevonden');
    }
    if (user.orgId !== null && instrument.orgId !== user.orgId) {
      throw new NotFoundException('Meetmiddel niet gevonden');
    }
  }

  private async getOwnedCalibration(instrumentId: string, calId: string) {
    const calibration = await this.prisma.calibration.findUnique({ where: { id: calId } });
    if (!calibration || calibration.isDeleted || calibration.instrumentId !== instrumentId) {
      throw new NotFoundException('Kalibratie niet gevonden');
    }
    return calibration;
  }

  /** Storage-sleutel: `{orgId}/measurement-instruments/{instrumentId}/calibrations/{uuid}.{ext}`. */
  private async storeFile(orgId: string, instrumentId: string, file: Express.Multer.File) {
    // Magic bytes beslissen type + opslagextensie (WP-B4); `originalname`
    // blijft alleen als weergavenaam bewaard.
    const detected = assertAllowedPdfOrImageUpload(file);
    const storageKey = `${orgId}/measurement-instruments/${instrumentId}/calibrations/${randomUUID()}.${detected.extension}`;
    await this.storage.upload(storageKey, file.buffer, detected.mimeType);
    return {
      storageKey,
      fileName: file.originalname,
      originalName: file.originalname,
      mimeType: detected.mimeType,
      size: file.size,
    };
  }

  private async safeDelete(key: string): Promise<void> {
    try {
      await this.storage.delete(key);
    } catch {
      this.logger.warn(`Kon kalibratiecertificaat niet verwijderen: ${key}`);
    }
  }

  /** Voegt de afgeleide kalibratiestatus toe aan een meetmiddel. */
  private enrich<T extends { lastCalibrationDate: Date | null; nextCalibrationDue: Date | null }>(
    instrument: T,
  ): T & { calibrationStatus: CalibrationStatus } {
    return {
      ...instrument,
      calibrationStatus: computeCalibrationStatus(
        {
          lastCalibrationDate: instrument.lastCalibrationDate,
          nextCalibrationDue: instrument.nextCalibrationDue,
        },
        this.warnDays,
      ),
    };
  }

  /** Strip de interne `storageKey` en expose `hasDocument`. */
  private serializeCalibration<T extends { storageKey: string | null }>(calibration: T) {
    const { storageKey, ...rest } = calibration;
    return { ...rest, hasDocument: !!storageKey };
  }

  /** Vertaal een afgeleide-status-filter naar een where op de gecachte datums. */
  private calibrationStatusWhere(
    status: 'GEEN_KALIBRATIE' | 'GELDIG' | 'BINNENKORT' | 'VERLOPEN' | undefined,
  ): Prisma.MeasurementInstrumentWhereInput {
    if (!status) return {};
    const now = new Date();
    const threshold = new Date(now.getTime() + this.warnDays * 24 * 60 * 60 * 1000);
    switch (status) {
      case 'GEEN_KALIBRATIE':
        return { lastCalibrationDate: null };
      case 'VERLOPEN':
        return { nextCalibrationDue: { lt: now } };
      case 'BINNENKORT':
        return { nextCalibrationDue: { gte: now, lte: threshold } };
      case 'GELDIG':
        return { nextCalibrationDue: { gt: threshold } };
    }
  }

  private translateUniqueCode(error: unknown, code: string): unknown {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      return new ConflictException(`Nummer "${code}" is al in gebruik binnen uw organisatie`);
    }
    return error;
  }
}
