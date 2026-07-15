import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AvailabilityExceptionType, EmploymentType, Role } from '@prisma/client';
import { AvailabilityResolutionService } from './availability-resolution.service';
import { PrismaService } from '@/prisma';

/** @db.Date-veld: UTC-middernacht. */
const day = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('AvailabilityResolutionService', () => {
  let service: AvailabilityResolutionService;

  const mockPrisma = {
    user: { findMany: jest.fn() },
    userScheduleAssignment: { findMany: jest.fn() },
    availabilityException: { findMany: jest.fn() },
  };

  const actor = { id: 'mgr', orgId: 'org-1', roles: [Role.MANAGER] } as any;
  const INSP = 'insp-1';
  const inspector = { id: INSP, orgId: 'org-1', roles: [Role.INSPECTEUR] } as any;

  const slot = (weekday: number, startMinute: number, endMinute: number) => ({
    weekday,
    startMinute,
    endMinute,
  });

  function setup(opts: {
    employmentType: EmploymentType | null;
    assignments?: any[];
    exceptions?: any[];
  }) {
    mockPrisma.user.findMany.mockImplementation((args: any) => {
      if (args.select?.employmentType) {
        return Promise.resolve([{ id: INSP, employmentType: opts.employmentType }]);
      }
      return Promise.resolve([{ id: INSP }]); // scopeUserIds
    });
    mockPrisma.userScheduleAssignment.findMany.mockResolvedValue(opts.assignments ?? []);
    mockPrisma.availabilityException.findMany.mockResolvedValue(opts.exceptions ?? []);
  }

  const findDay = (rows: any[], date: string) => rows.find((r) => r.date === date);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityResolutionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AvailabilityResolutionService);
  });

  it('dienstverband + weekschema levert de templateslots per weekdag', async () => {
    setup({
      employmentType: EmploymentType.DIENSTVERBAND,
      assignments: [
        {
          userId: INSP,
          templateId: 't1',
          validFrom: day('2026-01-01'),
          validUntil: null,
          template: { slots: [slot(1, 480, 1050)] }, // maandag 08:00–17:30
        },
      ],
    });

    // 2026-07-20 is maandag, 2026-07-21 dinsdag.
    const rows = await service.resolve(actor, '2026-07-20', '2026-07-21', [INSP]);
    const mon = findDay(rows, '2026-07-20');
    const tue = findDay(rows, '2026-07-21');
    expect(mon.intervals).toEqual([{ startMinute: 480, endMinute: 1050 }]);
    expect(mon.isAvailable).toBe(true);
    expect(mon.sources).toContainEqual({ kind: 'TEMPLATE', id: 't1' });
    expect(tue.intervals).toEqual([]); // geen dinsdag-slot
    expect(tue.isAvailable).toBe(false);
  });

  it('dienstverband + wekelijkse blokkade snijdt de werkdag', async () => {
    setup({
      employmentType: EmploymentType.DIENSTVERBAND,
      assignments: [
        {
          userId: INSP,
          templateId: 't1',
          validFrom: day('2026-01-01'),
          validUntil: null,
          template: { slots: [slot(1, 60, 300)] }, // maandag 01:00–05:00
        },
      ],
      exceptions: [
        {
          id: 'x1',
          userId: INSP,
          type: AvailabilityExceptionType.GEBLOKKEERD,
          isRecurring: true,
          weekdays: [1],
          startMinute: 120,
          endMinute: 180, // 02:00–03:00 geblokkeerd
          intervalWeeks: 1,
          recurStartDate: day('2026-01-05'),
          recurEndDate: null,
          allDay: false,
          startsAt: null,
          endsAt: null,
        },
      ],
    });

    const rows = await service.resolve(actor, '2026-07-20', '2026-07-20', [INSP]);
    expect(findDay(rows, '2026-07-20').intervals).toEqual([
      { startMinute: 60, endMinute: 120 },
      { startMinute: 180, endMinute: 300 },
    ]);
  });

  it('freelancer zonder excepties → lege dagen; met BESCHIKBAAR-exceptie → gevuld', async () => {
    setup({
      employmentType: EmploymentType.FREELANCE,
      exceptions: [
        {
          id: 'x2',
          userId: INSP,
          type: AvailabilityExceptionType.BESCHIKBAAR,
          isRecurring: true,
          weekdays: [2], // dinsdag
          startMinute: 540,
          endMinute: 960,
          intervalWeeks: 1,
          recurStartDate: day('2026-01-06'),
          recurEndDate: null,
          allDay: false,
          startsAt: null,
          endsAt: null,
        },
      ],
    });

    const rows = await service.resolve(actor, '2026-07-20', '2026-07-21', [INSP]);
    expect(findDay(rows, '2026-07-20').intervals).toEqual([]); // maandag, geen baseline
    expect(findDay(rows, '2026-07-21').intervals).toEqual([{ startMinute: 540, endMinute: 960 }]); // dinsdag
  });

  it('template-wissel op validFrom: dag ervoor oude, dag zelf nieuwe template', async () => {
    setup({
      employmentType: EmploymentType.DIENSTVERBAND,
      assignments: [
        {
          userId: INSP,
          templateId: 'old',
          validFrom: day('2026-01-01'),
          validUntil: day('2026-07-21'), // afgesloten op de wisseldag
          template: { slots: [slot(1, 480, 1050), slot(2, 480, 1050)] },
        },
        {
          userId: INSP,
          templateId: 'new',
          validFrom: day('2026-07-21'),
          validUntil: null,
          template: { slots: [slot(1, 420, 900), slot(2, 420, 900)] },
        },
      ],
    });

    const rows = await service.resolve(actor, '2026-07-20', '2026-07-21', [INSP]);
    // 20 juli (ma) valt nog onder 'old'; 21 juli (di) onder 'new'.
    expect(findDay(rows, '2026-07-20').intervals).toEqual([{ startMinute: 480, endMinute: 1050 }]);
    expect(findDay(rows, '2026-07-20').sources).toContainEqual({ kind: 'TEMPLATE', id: 'old' });
    expect(findDay(rows, '2026-07-21').intervals).toEqual([{ startMinute: 420, endMinute: 900 }]);
    expect(findDay(rows, '2026-07-21').sources).toContainEqual({ kind: 'TEMPLATE', id: 'new' });
  });

  it('weigert een bereik groter dan 3 maanden (400)', async () => {
    await expect(service.resolve(actor, '2026-01-01', '2026-06-01', [INSP])).rejects.toThrow(
      BadRequestException,
    );
  });

  describe('check', () => {
    it('binnen de beschikbaarheid → available true', async () => {
      setup({
        employmentType: EmploymentType.DIENSTVERBAND,
        assignments: [
          {
            userId: INSP,
            templateId: 't1',
            validFrom: day('2026-01-01'),
            validUntil: null,
            template: { slots: [slot(1, 480, 1050)] },
          },
        ],
      });
      const res = await service.check(
        actor,
        INSP,
        '2026-07-20T09:00:00.000Z',
        '2026-07-20T11:00:00.000Z',
      );
      expect(res.available).toBe(true);
      expect(res.conflicts).toEqual([]);
    });

    it('op een blokkade → available false met een reden', async () => {
      setup({
        employmentType: EmploymentType.DIENSTVERBAND,
        assignments: [
          {
            userId: INSP,
            templateId: 't1',
            validFrom: day('2026-01-01'),
            validUntil: null,
            template: { slots: [slot(1, 480, 1050)] },
          },
        ],
        exceptions: [
          {
            id: 'blk',
            userId: INSP,
            type: AvailabilityExceptionType.GEBLOKKEERD,
            isRecurring: false,
            startsAt: new Date('2026-07-20T10:00:00.000Z'),
            endsAt: new Date('2026-07-20T12:00:00.000Z'),
            allDay: false,
            weekdays: [],
            startMinute: null,
            endMinute: null,
            intervalWeeks: 1,
            recurStartDate: null,
            recurEndDate: null,
            reason: 'Tandarts',
          },
        ],
      });
      const res = await service.check(
        actor,
        INSP,
        '2026-07-20T09:00:00.000Z',
        '2026-07-20T11:00:00.000Z',
      );
      expect(res.available).toBe(false);
      expect(res.conflicts).toHaveLength(1);
      expect(res.conflicts[0].reason).toBe('Tandarts');
    });
  });

  // ─── Self-access voor de INSPECTEUR (PRD-12 §12.8c) ────────

  describe('inspecteur self-access', () => {
    it('lets an INSPECTEUR resolve their own availability', async () => {
      setup({ employmentType: EmploymentType.FREELANCE });
      const rows = await service.resolve(inspector, '2026-07-20', '2026-07-20', [INSP]);
      expect(rows).toHaveLength(1);
      expect(rows[0].userId).toBe(INSP);
    });

    it("forbids an INSPECTEUR from resolving someone else's availability", async () => {
      setup({ employmentType: null });
      await expect(
        service.resolve(inspector, '2026-07-20', '2026-07-20', ['other-user']),
      ).rejects.toThrow(ForbiddenException);
    });

    it('forbids an INSPECTEUR from resolving org-wide (no userIds)', async () => {
      setup({ employmentType: null });
      await expect(
        service.resolve(inspector, '2026-07-20', '2026-07-20'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('lets an INSPECTEUR check their own availability', async () => {
      setup({ employmentType: EmploymentType.FREELANCE });
      const res = await service.check(
        inspector,
        INSP,
        '2026-07-20T08:00:00.000Z',
        '2026-07-20T09:00:00.000Z',
      );
      // Freelancer zonder beschikbaarheid → niet beschikbaar, maar wél toegestaan te lezen.
      expect(res.available).toBe(false);
    });

    it("forbids an INSPECTEUR from checking someone else's availability", async () => {
      setup({ employmentType: null });
      await expect(
        service.check(
          inspector,
          'other-user',
          '2026-07-20T08:00:00.000Z',
          '2026-07-20T09:00:00.000Z',
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
