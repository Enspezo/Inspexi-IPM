import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Role, WorkOrderStatus } from '@prisma/client';
import { WorkOrdersService } from './work-orders.service';
import { PrismaService } from '@/prisma';
import { NumberingService } from '@/modules/numbering/numbering.service';

describe('WorkOrdersService', () => {
  let service: WorkOrdersService;

  // Transaction mock: executes the callback with a mock tx object
  const mockTx = {
    workOrderLine: {
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    workOrder: {
      findUnique: jest.fn(),
    },
  };

  const mockPrismaService = {
    workOrder: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    location: {
      findUnique: jest.fn(),
    },
    planningItem: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn((cb: (tx: typeof mockTx) => Promise<unknown>) =>
      cb(mockTx),
    ),
  };

  // Engine mock: invokes the create callback with a deterministic number, passing
  // the prisma mock as the tx (the service now creates via `tx.workOrder.create`).
  const mockNumberingService = {
    runWithGeneratedNumber: jest.fn(async (_model, _orgId, _opts, create) =>
      create(mockPrismaService, 'WB-2026-0001'),
    ),
    validateManualNumber: jest.fn(async (_o, _m, value: string) => value.trim()),
  };

  const mockUser = {
    id: 'user-1',
    orgId: 'org-1',
    email: 'admin@test.nl',
    roles: [Role.ORG_ADMIN],
  } as any;

  const mockSuperuser = {
    id: 'super-1',
    orgId: null,
    email: 'superuser@inspexi.nl',
    roles: [Role.SUPERUSER],
  } as any;

  const mockWorkOrder = {
    id: 'wo-1',
    orgId: 'org-1',
    workOrderNumber: 'WB-1234567001',
    status: WorkOrderStatus.IN_VOORBEREIDING,
    planningItemId: null,
    internalNotes: null,
    startTime: null,
    endTime: null,
    createdBy: 'user-1',
    createdByUser: { id: 'user-1', firstName: 'Jan', lastName: 'Jansen', email: 'admin@test.nl' },
    lines: [],
    planningItem: null,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkOrdersService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: NumberingService, useValue: mockNumberingService },
      ],
    }).compile();

    service = module.get<WorkOrdersService>(WorkOrdersService);
  });

  describe('findAll', () => {
    it('should return paginated work orders for org user', async () => {
      const mockWorkOrders = [mockWorkOrder];
      mockPrismaService.workOrder.findMany.mockResolvedValue(mockWorkOrders);
      mockPrismaService.workOrder.count.mockResolvedValue(1);

      const result = await service.findAll(mockUser, { page: 1, limit: 20 } as any);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: 'org-1' }),
        }),
      );
    });

    it('should skip orgId filter for SUPERUSER', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.findAll(mockSuperuser, { page: 1, limit: 20 } as any);

      const call = mockPrismaService.workOrder.findMany.mock.calls[0][0];
      expect(call.where.orgId).toBeUndefined();
    });

    it('should filter by status', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        status: WorkOrderStatus.IN_UITVOERING,
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: WorkOrderStatus.IN_UITVOERING }),
        }),
      );
    });

    it('should filter by planningItemId', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        planningItemId: 'plan-1',
        page: 1,
        limit: 20,
      } as any);

      expect(mockPrismaService.workOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ planningItemId: 'plan-1' }),
        }),
      );
    });

    it('should filter by inspectorId', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        inspectorId: 'user-2',
        page: 1,
        limit: 20,
      } as any);

      const call = mockPrismaService.workOrder.findMany.mock.calls[0][0];
      expect(call.where.planningItem).toEqual(
        expect.objectContaining({
          inspectors: { some: { userId: 'user-2' } },
        }),
      );
    });

    it('should filter by search term', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.findAll(mockUser, {
        search: 'acme',
        page: 1,
        limit: 20,
      } as any);

      const call = mockPrismaService.workOrder.findMany.mock.calls[0][0];
      expect(call.where.OR).toBeDefined();
      expect(call.where.OR).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            workOrderNumber: { contains: 'acme', mode: 'insensitive' },
          }),
        ]),
      );
    });

    it('should use default pagination values', async () => {
      mockPrismaService.workOrder.findMany.mockResolvedValue([]);
      mockPrismaService.workOrder.count.mockResolvedValue(0);

      await service.findAll(mockUser, {} as any);

      const call = mockPrismaService.workOrder.findMany.mock.calls[0][0];
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });
  });

  describe('findOne', () => {
    it('should return a work order by id', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);

      const result = await service.findOne('wo-1', mockUser);

      expect(result.id).toBe('wo-1');
      expect(mockPrismaService.workOrder.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'wo-1' } }),
      );
    });

    it('should throw NotFoundException when not found', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org access', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue({
        ...mockWorkOrder,
        orgId: 'other-org',
      });

      await expect(service.findOne('wo-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow SUPERUSER cross-org access', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue({
        ...mockWorkOrder,
        orgId: 'other-org',
      });

      const result = await service.findOne('wo-1', mockSuperuser);

      expect(result.id).toBe('wo-1');
    });
  });

  describe('create', () => {
    it('should create a work order without planning item', async () => {
      const created = { ...mockWorkOrder };
      mockPrismaService.workOrder.create.mockResolvedValue(created);

      const result = await service.create({} as any, mockUser);

      expect(result.id).toBe('wo-1');
      expect(mockPrismaService.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            createdBy: 'user-1',
          }),
        }),
      );
    });

    it('should create a work order with a valid planning item', async () => {
      const mockPlanningItem = {
        id: 'plan-1',
        orgId: 'org-1',
        location: { postalCode: '1234AB', houseNumber: '10' },
      };
      mockPrismaService.planningItem.findUnique.mockResolvedValue(mockPlanningItem);
      const created = { ...mockWorkOrder, planningItemId: 'plan-1' };
      mockPrismaService.workOrder.create.mockResolvedValue(created);

      const result = await service.create({ planningItemId: 'plan-1' } as any, mockUser);

      expect(result.planningItemId).toBe('plan-1');
      expect(mockPrismaService.planningItem.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'plan-1' } }),
      );
    });

    it('should throw NotFoundException when planning item not found', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue(null);

      await expect(
        service.create({ planningItemId: 'bad-plan' } as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-org planning item', async () => {
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        id: 'plan-x',
        orgId: 'other-org',
        location: null,
      });

      await expect(
        service.create({ planningItemId: 'plan-x' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('delegates number generation to the numbering engine', async () => {
      mockPrismaService.workOrder.create.mockResolvedValue({ ...mockWorkOrder });

      await service.create({} as any, mockUser);

      expect(mockNumberingService.runWithGeneratedNumber).toHaveBeenCalledWith(
        'WORK_ORDER',
        'org-1',
        expect.any(Object),
        expect.any(Function),
      );
    });
  });

  describe('update', () => {
    it('should update a work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      const updated = { ...mockWorkOrder, internalNotes: 'Updated notes' };
      mockPrismaService.workOrder.update.mockResolvedValue(updated);

      const result = await service.update(
        'wo-1',
        { internalNotes: 'Updated notes' } as any,
        mockUser,
      );

      expect(mockPrismaService.workOrder.update).toHaveBeenCalled();
      expect(result.internalNotes).toBe('Updated notes');
    });

    it('should throw NotFoundException for non-existent work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.update('nonexistent', {} as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException for cross-org update', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue({
        ...mockWorkOrder,
        orgId: 'other-org',
      });

      await expect(
        service.update('wo-1', {} as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException when linked planning item does not exist', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      mockPrismaService.planningItem.findUnique.mockResolvedValue(null);

      await expect(
        service.update('wo-1', { planningItemId: 'bad-plan' } as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when linking to cross-org planning item', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      mockPrismaService.planningItem.findUnique.mockResolvedValue({
        id: 'plan-x',
        orgId: 'other-org',
      });

      await expect(
        service.update('wo-1', { planningItemId: 'plan-x' } as any, mockUser),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateStatus', () => {
    it('should update the status of a work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      const updated = { ...mockWorkOrder, status: WorkOrderStatus.IN_UITVOERING };
      mockPrismaService.workOrder.update.mockResolvedValue(updated);

      const result = await service.updateStatus(
        'wo-1',
        { status: WorkOrderStatus.IN_UITVOERING } as any,
        mockUser,
      );

      expect(result.status).toBe(WorkOrderStatus.IN_UITVOERING);
      expect(mockPrismaService.workOrder.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: WorkOrderStatus.IN_UITVOERING },
        }),
      );
    });

    it('should throw BadRequestException when status is already set to the given value', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue({
        ...mockWorkOrder,
        status: WorkOrderStatus.IN_VOORBEREIDING,
      });

      await expect(
        service.updateStatus(
          'wo-1',
          { status: WorkOrderStatus.IN_VOORBEREIDING } as any,
          mockUser,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException for non-existent work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.updateStatus(
          'nonexistent',
          { status: WorkOrderStatus.IN_UITVOERING } as any,
          mockUser,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('setLines', () => {
    it('should replace work order lines in a transaction', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      mockTx.workOrderLine.deleteMany.mockResolvedValue({});
      mockTx.workOrderLine.createMany.mockResolvedValue({});
      mockTx.workOrder.findUnique.mockResolvedValue({
        ...mockWorkOrder,
        lines: [
          {
            id: 'line-1',
            description: 'Inspectie',
            quantity: 2,
            unit: 'uur',
            unitPrice: 75,
            vatRate: 21,
            lineTotal: 150,
            sortOrder: 0,
            product: null,
          },
        ],
      });

      const dto = {
        lines: [
          {
            description: 'Inspectie',
            quantity: 2,
            unit: 'uur',
            unitPrice: 75,
            vatRate: 21,
          },
        ],
      } as any;

      const result = await service.setLines('wo-1', dto, mockUser);

      expect(result).toBeDefined();
      expect(mockPrismaService.$transaction).toHaveBeenCalled();
      expect(mockTx.workOrderLine.deleteMany).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1' },
      });
      expect(mockTx.workOrderLine.createMany).toHaveBeenCalled();
    });

    it('should handle empty lines array (clears all lines without createMany)', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      mockTx.workOrderLine.deleteMany.mockResolvedValue({});
      mockTx.workOrder.findUnique.mockResolvedValue({ ...mockWorkOrder, lines: [] });

      const result = await service.setLines('wo-1', { lines: [] } as any, mockUser);

      expect(result).toBeDefined();
      expect(mockTx.workOrderLine.deleteMany).toHaveBeenCalledWith({
        where: { workOrderId: 'wo-1' },
      });
      // createMany should NOT be called when lines array is empty
      expect(mockTx.workOrderLine.createMany).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException for non-existent work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(null);

      await expect(
        service.setLines('nonexistent', { lines: [] } as any, mockUser),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete a work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(mockWorkOrder);
      mockPrismaService.workOrder.delete.mockResolvedValue({});

      await service.remove('wo-1', mockUser);

      expect(mockPrismaService.workOrder.delete).toHaveBeenCalledWith({
        where: { id: 'wo-1' },
      });
    });

    it('should throw NotFoundException for non-existent work order', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue(null);

      await expect(service.remove('nonexistent', mockUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException for cross-org delete', async () => {
      mockPrismaService.workOrder.findUnique.mockResolvedValue({
        ...mockWorkOrder,
        orgId: 'other-org',
      });

      await expect(service.remove('wo-1', mockUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('createFromPlanningItem', () => {
    it('should return existing work order if one already exists for the planning item', async () => {
      mockPrismaService.workOrder.findFirst.mockResolvedValue(mockWorkOrder);

      const result = await service.createFromPlanningItem({
        id: 'plan-1',
        orgId: 'org-1',
        locationId: null,
        createdBy: 'user-1',
      });

      expect(result).toStrictEqual(mockWorkOrder);
      expect(mockPrismaService.workOrder.create).not.toHaveBeenCalled();
    });

    it('should create a new work order from planning item without location', async () => {
      mockPrismaService.workOrder.findFirst.mockResolvedValue(null);
      const created = { ...mockWorkOrder, planningItemId: 'plan-1' };
      mockPrismaService.workOrder.create.mockResolvedValue(created);

      const result = await service.createFromPlanningItem({
        id: 'plan-1',
        orgId: 'org-1',
        locationId: null,
        createdBy: 'user-1',
      });

      expect(result.planningItemId).toBe('plan-1');
      expect(mockPrismaService.workOrder.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            orgId: 'org-1',
            planningItemId: 'plan-1',
          }),
        }),
      );
    });

    it('provides a numbering context that resolves location postcode + huisnummer', async () => {
      mockPrismaService.workOrder.findFirst.mockResolvedValue(null);
      mockPrismaService.location.findUnique.mockResolvedValue({
        postalCode: '1234AB',
        houseNumber: '42',
      });
      mockPrismaService.workOrder.create.mockResolvedValue({
        ...mockWorkOrder,
        planningItemId: 'plan-1',
      });

      await service.createFromPlanningItem({
        id: 'plan-1',
        orgId: 'org-1',
        locationId: 'loc-1',
        createdBy: 'user-1',
      });

      // The engine only fetches location data lazily (when the scheme needs it):
      // invoke the supplied loadContext to confirm it resolves the location fields.
      const opts = mockNumberingService.runWithGeneratedNumber.mock.calls[0][2];
      const ctx = await opts.loadContext();
      expect(ctx).toEqual({ postcode: '1234AB', huisnummer: '42' });
      expect(mockPrismaService.location.findUnique).toHaveBeenCalledWith({
        where: { id: 'loc-1' },
        select: { postalCode: true, houseNumber: true },
      });
    });
  });
});
