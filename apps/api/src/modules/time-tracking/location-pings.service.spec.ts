import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Role, TimeActivityType } from '@prisma/client';
import { LocationPingsService } from './location-pings.service';
import { PrismaService } from '@/prisma';

describe('LocationPingsService', () => {
  let service: LocationPingsService;

  const mockPrisma: any = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    timeEntry: { findFirst: jest.fn(), findMany: jest.fn() },
    inspectorLocationPing: { createMany: jest.fn(), groupBy: jest.fn(), findFirst: jest.fn() },
  };

  const ORG = 'org-1';
  const inspecteur = { id: 'insp-1', orgId: ORG, roles: [Role.INSPECTEUR] } as any;
  const manager = { id: 'mgr-1', orgId: ORG, roles: [Role.MANAGER] } as any;

  const ping = (extra: Record<string, unknown> = {}) => ({
    latitude: 52.33,
    longitude: 4.87,
    accuracyM: 15,
    recordedAt: new Date().toISOString(),
    ...extra,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [LocationPingsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(LocationPingsService);

    mockPrisma.user.findUnique.mockResolvedValue({ travelTrackingEnabled: true });
    mockPrisma.timeEntry.findFirst.mockResolvedValue({ id: 'te-travel' });
    mockPrisma.inspectorLocationPing.createMany.mockResolvedValue({ count: 1 });
  });

  describe('setTravelTracking', () => {
    it('zet consent-moment bij aanzetten, niet bij uitzetten', async () => {
      mockPrisma.user.update.mockResolvedValue({});
      await service.setTravelTracking(inspecteur, true);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            travelTrackingEnabled: true,
            travelTrackingConsentAt: expect.any(Date),
          }),
        }),
      );
      mockPrisma.user.update.mockClear();
      await service.setTravelTracking(inspecteur, false);
      expect(mockPrisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { travelTrackingEnabled: false } }),
      );
    });
  });

  describe('ingest — guards zijn een 200-noop, geen error', () => {
    it('tracker uit → accepted 0, geen writes', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ travelTrackingEnabled: false });
      const r = await service.ingest(inspecteur, { pings: [ping()] });
      expect(r).toEqual({ accepted: 0 });
      expect(mockPrisma.inspectorLocationPing.createMany).not.toHaveBeenCalled();
    });

    it('geen lopende REISTIJD-timer → accepted 0', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(null);
      const r = await service.ingest(inspecteur, { pings: [ping()] });
      expect(r).toEqual({ accepted: 0 });
    });

    it('geldige pings worden gekoppeld aan de lopende reistimer', async () => {
      const r = await service.ingest(inspecteur, { pings: [ping(), ping()] });
      expect(r.accepted).toBe(2);
      expect(mockPrisma.inspectorLocationPing.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ userId: inspecteur.id, timeEntryId: 'te-travel' }),
          ]),
        }),
      );
    });

    it('toekomst- en oeroude pings worden gefilterd', async () => {
      const r = await service.ingest(inspecteur, {
        pings: [
          ping({ recordedAt: new Date(Date.now() + 10 * 60_000).toISOString() }),
          ping({ recordedAt: new Date(Date.now() - 2 * 60 * 60_000).toISOString() }),
        ],
      });
      expect(r).toEqual({ accepted: 0 });
      expect(mockPrisma.inspectorLocationPing.createMany).not.toHaveBeenCalled();
    });
  });

  describe('getActive', () => {
    it('markeert alleen REISTIJD + tracker aan + verse ping als live', async () => {
      const base = {
        id: 'te-1',
        userId: 'insp-1',
        startedAt: new Date(),
        notes: null,
        project: null,
        inspectionPlan: null,
      };
      mockPrisma.timeEntry.findMany.mockResolvedValue([
        {
          ...base,
          activityType: TimeActivityType.REISTIJD,
          user: { id: 'insp-1', firstName: 'Tom', lastName: 'Visser', travelTrackingEnabled: true },
        },
        {
          ...base,
          id: 'te-2',
          userId: 'insp-2',
          activityType: TimeActivityType.UITVOERING,
          user: { id: 'insp-2', firstName: 'An', lastName: 'Smit', travelTrackingEnabled: true },
        },
      ]);
      mockPrisma.inspectorLocationPing.groupBy.mockResolvedValue([
        { userId: 'insp-1', _max: { recordedAt: new Date() } },
        { userId: 'insp-2', _max: { recordedAt: new Date() } },
      ]);
      const rows = await service.getActive(manager);
      expect(rows.find((r) => r.userId === 'insp-1')?.hasLiveLocation).toBe(true);
      // UITVOERING levert nooit een kaart-pin, ook mét verse ping.
      expect(rows.find((r) => r.userId === 'insp-2')?.hasLiveLocation).toBe(false);
    });
  });

  describe('getLatestLocation', () => {
    it('geen recente ping → 404', async () => {
      mockPrisma.inspectorLocationPing.findFirst.mockResolvedValue(null);
      await expect(service.getLatestLocation('insp-1', manager)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('levert de pin + bestemming uit plan-GPS met locatie-fallback', async () => {
      mockPrisma.inspectorLocationPing.findFirst.mockResolvedValue({
        latitude: 52.33,
        longitude: 4.87,
        accuracyM: 12,
        recordedAt: new Date(),
        user: { firstName: 'Tom', lastName: 'Visser' },
      });
      mockPrisma.timeEntry.findFirst.mockResolvedValue({
        inspectionPlan: {
          projectName: 'Periodieke keuring',
          gpsLatitude: null,
          gpsLongitude: null,
          addressStreet: null,
          addressHouseNumber: null,
          addressCity: null,
          location: { lat: 52.337, lng: 4.872, street: 'Zuidas 1', city: 'Amsterdam' },
        },
      });
      const result = await service.getLatestLocation('insp-1', manager);
      expect(result.destination).toEqual({
        latitude: 52.337,
        longitude: 4.872,
        label: 'Periodieke keuring — Zuidas 1, Amsterdam',
      });
    });
  });
});
