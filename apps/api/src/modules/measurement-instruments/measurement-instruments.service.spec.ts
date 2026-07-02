import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { MeasurementInstrumentsService } from './measurement-instruments.service';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER } from '@/common/services/storage/storage.interface';

describe('MeasurementInstrumentsService', () => {
  let service: MeasurementInstrumentsService;

  const mockPrisma = {
    measurementInstrument: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    calibration: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    user: { findUnique: jest.fn() },
    inspectionPlan: { findUnique: jest.fn() },
    userDefaultInstrument: { findMany: jest.fn(), deleteMany: jest.fn(), createMany: jest.fn() },
    inspectionPlanDefaultInstrument: { deleteMany: jest.fn(), createMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  };

  const mockStorage = { upload: jest.fn(), download: jest.fn(), delete: jest.fn(), exists: jest.fn() };

  const ORG = 'org-1';
  const inspector = { id: 'insp-1', orgId: ORG, roles: [Role.INSPECTEUR], email: 'i@t.nl' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MeasurementInstrumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: STORAGE_PROVIDER, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(MeasurementInstrumentsService);
  });

  // ─── recomputeInstrumentCache: forward-only notify reset ──

  describe('recomputeInstrumentCache', () => {
    it('resets the notify stage when the due date moves FORWARD (new calibration)', async () => {
      mockPrisma.measurementInstrument.findUnique.mockResolvedValue({
        calibrationIntervalMonths: 12,
        nextCalibrationDue: new Date('2026-01-01'),
      });
      mockPrisma.calibration.findFirst.mockResolvedValue({ calibrationDate: new Date('2026-06-01') });

      await service.recomputeInstrumentCache('mi-1');

      const data = mockPrisma.measurementInstrument.update.mock.calls[0][0].data;
      expect(data.nextCalibrationDue).toEqual(new Date('2027-06-01'));
      expect(data.lastExpiryNotifiedStage).toBeNull();
      expect(data.lastExpiryNotifiedAt).toBeNull();
    });

    it('does NOT reset the notify stage when the due date moves BACKWARD (deletion)', async () => {
      mockPrisma.measurementInstrument.findUnique.mockResolvedValue({
        calibrationIntervalMonths: 12,
        nextCalibrationDue: new Date('2027-06-01'),
      });
      // Latest remaining calibration is now older → due moves earlier.
      mockPrisma.calibration.findFirst.mockResolvedValue({ calibrationDate: new Date('2025-06-01') });

      await service.recomputeInstrumentCache('mi-1');

      const data = mockPrisma.measurementInstrument.update.mock.calls[0][0].data;
      expect(data.nextCalibrationDue).toEqual(new Date('2026-06-01'));
      expect(data).not.toHaveProperty('lastExpiryNotifiedStage');
      expect(data).not.toHaveProperty('lastExpiryNotifiedAt');
    });

    it('clears the cache when there are no calibrations', async () => {
      mockPrisma.measurementInstrument.findUnique.mockResolvedValue({
        calibrationIntervalMonths: 12,
        nextCalibrationDue: new Date('2027-06-01'),
      });
      mockPrisma.calibration.findFirst.mockResolvedValue(null);

      await service.recomputeInstrumentCache('mi-1');

      const data = mockPrisma.measurementInstrument.update.mock.calls[0][0].data;
      expect(data.lastCalibrationDate).toBeNull();
      expect(data.nextCalibrationDue).toBeNull();
    });
  });

  // ─── Cross-tenant guards ───────────────────────────────

  describe('create — cross-tenant assignee guard', () => {
    it('rejects assigning an instrument to a user from another org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ orgId: 'org-2' }); // andere org
      await expect(
        service.create(inspector, {
          code: 'MM-9',
          brand: 'X',
          type: 'Y',
          calibrationIntervalMonths: 12,
          assignedToUserId: 'user-other-org',
        } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(mockPrisma.measurementInstrument.create).not.toHaveBeenCalled();
    });
  });

  describe('setMyDefaults — cross-tenant instrument guard', () => {
    it('rejects instrument-ids that belong to another org', async () => {
      // assertAllSameOrg: findMany returns fewer rows than requested → forbidden
      mockPrisma.measurementInstrument.findMany.mockResolvedValue([{ id: 'mi-1' }]);
      await expect(service.setMyDefaults(inspector, ['mi-1', 'mi-foreign'])).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(mockPrisma.userDefaultInstrument.createMany).not.toHaveBeenCalled();
    });

    it('replaces the full set when all ids are in-org', async () => {
      mockPrisma.measurementInstrument.findMany.mockResolvedValue([{ id: 'mi-1' }, { id: 'mi-2' }]);
      const result = await service.setMyDefaults(inspector, ['mi-1', 'mi-2']);
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual(['mi-1', 'mi-2']);
    });
  });
});
