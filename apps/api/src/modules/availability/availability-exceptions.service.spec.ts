import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AvailabilityExceptionType, Role } from '@prisma/client';
import { AvailabilityExceptionsService } from './availability-exceptions.service';
import { AvailabilityNotifier } from './availability-notifier.service';
import { PrismaService } from '@/prisma';

describe('AvailabilityExceptionsService', () => {
  let service: AvailabilityExceptionsService;

  const mockPrisma = {
    user: { findUnique: jest.fn() },
    availabilityException: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const notifier = { exceptionChanged: jest.fn() };

  const ORG = 'org-1';
  const u = (id: string, roles: Role[], orgId: string | null = ORG) =>
    ({ id, orgId, roles, email: `${id}@t.nl`, firstName: 'A', lastName: 'B' }) as any;
  const manager = u('mgr-1', [Role.MANAGER]);
  const inspecteur = u('insp-1', [Role.INSPECTEUR]);
  const other = u('insp-2', [Role.INSPECTEUR]);

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AvailabilityExceptionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AvailabilityNotifier, useValue: notifier },
      ],
    }).compile();
    service = module.get(AvailabilityExceptionsService);
    mockPrisma.user.findUnique.mockResolvedValue({ id: inspecteur.id, orgId: ORG });
  });

  const oneOffDto = (userId: string) => ({
    userId,
    type: AvailabilityExceptionType.GEBLOKKEERD,
    isRecurring: false,
    startsAt: '2026-08-03T00:00:00.000Z',
    endsAt: '2026-08-04T00:00:00.000Z',
    allDay: true,
    reason: 'Verlof',
  });

  describe('create — autorisatie', () => {
    it('inspecteur mag een eigen uitzondering aanmaken', async () => {
      mockPrisma.availabilityException.create.mockResolvedValue({ id: 'e1', userId: inspecteur.id });
      await service.create(inspecteur, oneOffDto(inspecteur.id) as any);
      expect(mockPrisma.availabilityException.create).toHaveBeenCalled();
      expect(notifier.exceptionChanged).toHaveBeenCalledWith(
        inspecteur,
        inspecteur.id,
        ORG,
        'e1',
        'aangemaakt',
      );
    });

    it('inspecteur mag geen uitzondering voor een ander aanmaken (403)', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: other.id, orgId: ORG });
      await expect(service.create(inspecteur, oneOffDto(other.id) as any)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('manager mag een uitzondering voor een ander aanmaken', async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: inspecteur.id, orgId: ORG });
      mockPrisma.availabilityException.create.mockResolvedValue({ id: 'e2', userId: inspecteur.id });
      await service.create(manager, oneOffDto(inspecteur.id) as any);
      expect(mockPrisma.availabilityException.create).toHaveBeenCalled();
    });
  });

  describe('create — XOR validatie', () => {
    it('weigert eenmalig én herhalende velden tegelijk (400)', async () => {
      const dto = { ...oneOffDto(inspecteur.id), isRecurring: false, weekdays: [1] };
      await expect(service.create(inspecteur, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('weigert een herhalende uitzondering zonder weekdagen (400)', async () => {
      const dto = {
        userId: inspecteur.id,
        type: AvailabilityExceptionType.BESCHIKBAAR,
        isRecurring: true,
        startMinute: 540,
        endMinute: 960,
        recurStartDate: '2026-01-01',
      };
      await expect(service.create(inspecteur, dto as any)).rejects.toThrow(BadRequestException);
    });

    it('weigert een eenmalige uitzondering met startsAt >= endsAt (400)', async () => {
      const dto = {
        ...oneOffDto(inspecteur.id),
        startsAt: '2026-08-04T00:00:00.000Z',
        endsAt: '2026-08-03T00:00:00.000Z',
        allDay: false,
      };
      await expect(service.create(inspecteur, dto as any)).rejects.toThrow(BadRequestException);
    });
  });

  describe('update — partial patch', () => {
    const existing = {
      id: 'e5',
      orgId: ORG,
      userId: inspecteur.id,
      type: AvailabilityExceptionType.GEBLOKKEERD,
      isRecurring: false,
      startsAt: new Date('2026-08-03T00:00:00.000Z'),
      endsAt: new Date('2026-08-04T00:00:00.000Z'),
      allDay: true,
      weekdays: [],
      startMinute: null,
      endMinute: null,
      intervalWeeks: 1,
      recurStartDate: null,
      recurEndDate: null,
      reason: 'Verlof',
      isDeleted: false,
    };

    it('behoudt de bestaande reden wanneer de patch die niet meegeeft', async () => {
      mockPrisma.availabilityException.findUnique.mockResolvedValue(existing);
      mockPrisma.availabilityException.update.mockImplementation((args: any) =>
        Promise.resolve({ ...existing, ...args.data, id: existing.id }),
      );

      await service.update(existing.id, inspecteur, {
        endsAt: '2026-08-05T00:00:00.000Z',
      } as any);

      expect(mockPrisma.availabilityException.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: 'Verlof' }) }),
      );
    });

    it('wist de reden bij een lege string', async () => {
      mockPrisma.availabilityException.findUnique.mockResolvedValue(existing);
      mockPrisma.availabilityException.update.mockImplementation((args: any) =>
        Promise.resolve({ ...existing, ...args.data, id: existing.id }),
      );

      await service.update(existing.id, inspecteur, { reason: '   ' } as any);

      expect(mockPrisma.availabilityException.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ reason: null }) }),
      );
    });
  });

  describe('remove — org-scoping', () => {
    it('een uitzondering uit een andere org lekt niet (404)', async () => {
      mockPrisma.availabilityException.findUnique.mockResolvedValue({
        id: 'e9',
        userId: 'x',
        orgId: 'other-org',
        isDeleted: false,
      });
      await expect(service.remove('e9', manager)).rejects.toThrow(NotFoundException);
    });
  });
});
