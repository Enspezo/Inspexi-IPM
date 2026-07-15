import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { AvailabilityTemplatesService } from './availability-templates.service';
import { validateTemplateSlots } from './availability.helpers';
import { PrismaService } from '@/prisma';

describe('AvailabilityTemplatesService', () => {
  let service: AvailabilityTemplatesService;

  const mockPrisma: any = {
    availabilityTemplate: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    availabilityTemplateSlot: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    userScheduleAssignment: { count: jest.fn() },
    $transaction: jest.fn(async (cb: any) => cb(mockPrisma)),
  };

  const ORG = 'org-1';
  const u = (id: string, roles: Role[], orgId: string | null = ORG) =>
    ({ id, orgId, roles, email: `${id}@test.nl` }) as any;
  const admin = u('admin-1', [Role.ORG_ADMIN]);
  const superuser = u('su-1', [Role.SUPERUSER], null);

  const template = (over: Partial<any> = {}) => ({
    id: 'tpl-1',
    orgId: ORG,
    name: 'Standaard',
    description: null,
    isActive: true,
    isDeleted: false,
    slots: [],
    _count: { assignments: 0 },
    ...over,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityTemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get(AvailabilityTemplatesService);
  });

  // ─── Slot validation (pure helper) ─────────────────────

  describe('validateTemplateSlots', () => {
    it('accepts non-overlapping slots within a weekday', () => {
      expect(() =>
        validateTemplateSlots([
          { weekday: 1, startMinute: 480, endMinute: 720 },
          { weekday: 1, startMinute: 780, endMinute: 1050 },
        ]),
      ).not.toThrow();
    });

    it('rejects start >= end', () => {
      expect(() =>
        validateTemplateSlots([{ weekday: 1, startMinute: 600, endMinute: 600 }]),
      ).toThrow(BadRequestException);
    });

    it('rejects end > 1440', () => {
      expect(() =>
        validateTemplateSlots([{ weekday: 1, startMinute: 0, endMinute: 1500 }]),
      ).toThrow(BadRequestException);
    });

    it('rejects an out-of-range weekday', () => {
      expect(() =>
        validateTemplateSlots([{ weekday: 8, startMinute: 0, endMinute: 60 }]),
      ).toThrow(BadRequestException);
    });

    it('rejects overlapping slots on the same weekday', () => {
      expect(() =>
        validateTemplateSlots([
          { weekday: 2, startMinute: 480, endMinute: 720 },
          { weekday: 2, startMinute: 700, endMinute: 900 },
        ]),
      ).toThrow(BadRequestException);
    });

    it('allows identical time-windows on different weekdays', () => {
      expect(() =>
        validateTemplateSlots([
          { weekday: 1, startMinute: 480, endMinute: 1050 },
          { weekday: 2, startMinute: 480, endMinute: 1050 },
        ]),
      ).not.toThrow();
    });
  });

  // ─── create ────────────────────────────────────────────

  describe('create', () => {
    it('rejects overlapping slots before writing', async () => {
      await expect(
        service.create(admin, {
          name: 'X',
          slots: [
            { weekday: 1, startMinute: 480, endMinute: 720 },
            { weekday: 1, startMinute: 600, endMinute: 900 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockPrisma.availabilityTemplate.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate name (409)', async () => {
      mockPrisma.availabilityTemplate.findFirst.mockResolvedValue({ id: 'other' });
      await expect(
        service.create(admin, {
          name: 'Standaard',
          slots: [{ weekday: 1, startMinute: 480, endMinute: 1050 }],
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('creates the template with nested slots', async () => {
      mockPrisma.availabilityTemplate.findFirst.mockResolvedValue(null);
      mockPrisma.availabilityTemplate.create.mockResolvedValue(template());
      const res = await service.create(admin, {
        name: 'Standaard',
        slots: [{ weekday: 1, startMinute: 480, endMinute: 1050 }],
      });
      expect(mockPrisma.availabilityTemplate.create).toHaveBeenCalled();
      expect(res.assignmentCount).toBe(0);
      expect(res).not.toHaveProperty('_count');
    });

    it('rejects a superuser without an org (no org selected)', async () => {
      await expect(
        service.create(superuser, {
          name: 'X',
          slots: [{ weekday: 1, startMinute: 480, endMinute: 1050 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── update ────────────────────────────────────────────

  describe('update', () => {
    it('replaces slots inside the transaction', async () => {
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue(template());
      mockPrisma.availabilityTemplate.update.mockResolvedValue(template({ name: 'Nieuw' }));
      await service.update('tpl-1', admin, {
        slots: [{ weekday: 2, startMinute: 480, endMinute: 720 }],
      });
      expect(mockPrisma.availabilityTemplateSlot.deleteMany).toHaveBeenCalledWith({
        where: { templateId: 'tpl-1' },
      });
      expect(mockPrisma.availabilityTemplateSlot.createMany).toHaveBeenCalled();
    });

    it('404 when the template is in another org', async () => {
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue(
        template({ orgId: 'org-2' }),
      );
      await expect(service.update('tpl-1', admin, { name: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── remove (delete-guard) ─────────────────────────────

  describe('remove', () => {
    it('blocks deletion while active assignments exist (409)', async () => {
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue(template());
      mockPrisma.userScheduleAssignment.count.mockResolvedValue(2);
      await expect(service.remove('tpl-1', admin)).rejects.toThrow(ConflictException);
      expect(mockPrisma.availabilityTemplate.update).not.toHaveBeenCalled();
    });

    it('soft-deletes and mangles the name so a new template can reuse it', async () => {
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue(template());
      mockPrisma.userScheduleAssignment.count.mockResolvedValue(0);
      mockPrisma.availabilityTemplate.update.mockResolvedValue(template({ isDeleted: true }));
      await service.remove('tpl-1', admin);
      expect(mockPrisma.availabilityTemplate.update).toHaveBeenCalledWith({
        where: { id: 'tpl-1' },
        data: {
          isDeleted: true,
          // Naam-mangling: de DB-unique (orgId, name) kent geen isDeleted,
          // dus de oude naam moet vrijkomen voor een nieuwe template.
          name: expect.stringMatching(/^Standaard \(verwijderd .+\)$/),
        },
      });
    });
  });

  // ─── findAll (serialize) ───────────────────────────────

  describe('findAll', () => {
    it('org-scopes and maps _count → assignmentCount', async () => {
      mockPrisma.availabilityTemplate.findMany.mockResolvedValue([
        template({ _count: { assignments: 3 } }),
      ]);
      mockPrisma.availabilityTemplate.count.mockResolvedValue(1);
      const res = await service.findAll(admin, {});
      expect(mockPrisma.availabilityTemplate.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orgId: ORG, isDeleted: false }) }),
      );
      expect(res.data[0].assignmentCount).toBe(3);
    });
  });
});
