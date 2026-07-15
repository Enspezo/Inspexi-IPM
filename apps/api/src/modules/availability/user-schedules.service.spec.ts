import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { UserSchedulesService } from './user-schedules.service';
import { PrismaService } from '@/prisma';
import { AvailabilityNotifier } from './availability-notifier.service';

describe('UserSchedulesService', () => {
  let service: UserSchedulesService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    availabilityTemplate: { findUnique: jest.fn() },
    userScheduleAssignment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(async (ops: any[]) => Promise.all(ops)),
  };

  const ORG = 'org-1';
  const u = (id: string, roles: Role[], orgId: string | null = ORG) =>
    ({ id, orgId, roles, email: `${id}@test.nl` }) as any;
  const admin = u('admin-1', [Role.ORG_ADMIN]);
  const superuser = u('su-1', [Role.SUPERUSER], null);

  const TARGET = 'insp-1';

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserSchedulesService,
        { provide: PrismaService, useValue: mockPrisma },
        {
          provide: AvailabilityNotifier,
          useValue: { managerChangedForUser: jest.fn(), exceptionChanged: jest.fn() },
        },
      ],
    }).compile();
    service = module.get(UserSchedulesService);

    // Default: target user exists in the same org.
    mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET, orgId: ORG });
  });

  // ─── getSchedule ───────────────────────────────────────

  describe('getSchedule', () => {
    it('returns assignments for a same-org user', async () => {
      mockPrisma.userScheduleAssignment.findMany.mockResolvedValue([{ id: 'a1' }]);
      const res = await service.getSchedule(TARGET, admin);
      expect(res).toEqual([{ id: 'a1' }]);
    });

    it('404 for a user in another org', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: TARGET, orgId: 'org-2' });
      await expect(service.getSchedule(TARGET, admin)).rejects.toThrow(NotFoundException);
    });
  });

  // ─── assign ────────────────────────────────────────────

  describe('assign', () => {
    beforeEach(() => {
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        orgId: ORG,
        isDeleted: false,
      });
      mockPrisma.userScheduleAssignment.create.mockResolvedValue({ id: 'new-1' });
      mockPrisma.userScheduleAssignment.update.mockResolvedValue({ id: 'old-1' });
    });

    it('closes the open predecessor and creates the new assignment (2 ops)', async () => {
      mockPrisma.userScheduleAssignment.findFirst.mockResolvedValue({
        id: 'old-1',
        validFrom: new Date('2026-01-01'),
        validUntil: null,
      });
      const res = await service.assign(TARGET, admin, {
        templateId: 'tpl-1',
        validFrom: '2026-06-01',
      });
      expect(mockPrisma.userScheduleAssignment.update).toHaveBeenCalledWith({
        where: { id: 'old-1' },
        data: { validUntil: expect.any(Date) },
      });
      expect(mockPrisma.userScheduleAssignment.create).toHaveBeenCalled();
      expect(res).toEqual({ id: 'new-1' });
    });

    it('creates without closing when there is no open assignment (1 op)', async () => {
      mockPrisma.userScheduleAssignment.findFirst.mockResolvedValue(null);
      const res = await service.assign(TARGET, admin, {
        templateId: 'tpl-1',
        validFrom: '2026-06-01',
      });
      expect(mockPrisma.userScheduleAssignment.update).not.toHaveBeenCalled();
      expect(res).toEqual({ id: 'new-1' });
    });

    it('rejects a validFrom not after the current assignment', async () => {
      mockPrisma.userScheduleAssignment.findFirst.mockResolvedValue({
        id: 'old-1',
        validFrom: new Date('2026-06-01'),
        validUntil: null,
      });
      await expect(
        service.assign(TARGET, admin, { templateId: 'tpl-1', validFrom: '2026-06-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it("rejects a template from another org (assertSameOrg → 403)", async () => {
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        orgId: 'org-2',
      });
      await expect(
        service.assign(TARGET, admin, { templateId: 'tpl-1', validFrom: '2026-06-01' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a soft-deleted template (404)', async () => {
      mockPrisma.userScheduleAssignment.findFirst.mockResolvedValue(null);
      // assertSameOrg passes (org matches), but the template is deleted.
      mockPrisma.availabilityTemplate.findUnique.mockResolvedValue({
        id: 'tpl-1',
        orgId: ORG,
        isDeleted: true,
      });
      await expect(
        service.assign(TARGET, admin, { templateId: 'tpl-1', validFrom: '2026-06-01' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lets a superuser assign within the target user org', async () => {
      mockPrisma.userScheduleAssignment.findFirst.mockResolvedValue(null);
      const res = await service.assign(TARGET, superuser, {
        templateId: 'tpl-1',
        validFrom: '2026-06-01',
      });
      expect(res).toEqual({ id: 'new-1' });
    });
  });

  // ─── remove ────────────────────────────────────────────

  describe('remove', () => {
    it('deletes a future assignment and reopens the predecessor', async () => {
      const validFrom = new Date('2999-01-01');
      mockPrisma.userScheduleAssignment.findUnique.mockResolvedValue({
        id: 'fut-1',
        userId: TARGET,
        orgId: ORG,
        validFrom,
      });
      await service.remove(TARGET, 'fut-1', admin);
      expect(mockPrisma.userScheduleAssignment.delete).toHaveBeenCalledWith({
        where: { id: 'fut-1' },
      });
      expect(mockPrisma.userScheduleAssignment.updateMany).toHaveBeenCalledWith({
        where: { userId: TARGET, validUntil: validFrom },
        data: { validUntil: null },
      });
    });

    it('rejects deleting a current/past assignment (400)', async () => {
      mockPrisma.userScheduleAssignment.findUnique.mockResolvedValue({
        id: 'old-1',
        userId: TARGET,
        orgId: ORG,
        validFrom: new Date('2000-01-01'),
      });
      await expect(service.remove(TARGET, 'old-1', admin)).rejects.toThrow(
        BadRequestException,
      );
      expect(mockPrisma.userScheduleAssignment.delete).not.toHaveBeenCalled();
    });

    it('404 when the assignment belongs to another user', async () => {
      mockPrisma.userScheduleAssignment.findUnique.mockResolvedValue({
        id: 'x',
        userId: 'someone-else',
        orgId: ORG,
        validFrom: new Date('2999-01-01'),
      });
      await expect(service.remove(TARGET, 'x', admin)).rejects.toThrow(NotFoundException);
    });
  });
});
