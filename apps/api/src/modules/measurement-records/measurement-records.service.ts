// Nieuw in Beheer (in Inspexi-App bestond dit alleen via de offline sync-laag).
// REST gemodelleerd naar de findings-module, maar als uitvoerings-variant:
//   - status (enum InspectionExecStatus, default not_started) i.p.v. lookup-code
//   - gedenormaliseerde orgId (overgenomen van de asset)
//   - inspectorId FK-validatie binnen dezelfde org
//   - HARD delete (geen deletedAt op dit model)
//
// NB: foto-URL's / signed URLs vallen buiten dit model; metingen worden als JSON bewaard.

import { Injectable } from '@nestjs/common';
import { User, Prisma, InspectionExecStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertSameOrg, requireOrg, validateJsonColumn } from '@/common';
import { measurementsSchema, MEASUREMENTS_LABEL } from './schemas/measurements.schema';
import { AssetNodesService } from '../asset-nodes/asset-nodes.service';
import {
  CreateMeasurementRecordDto,
  UpdateMeasurementRecordDto,
} from './dto';

@Injectable()
export class MeasurementRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetNodes: AssetNodesService,
  ) {}

  private async getAssetNodeInOrg(assetNodeId: string, user: User) {
    return assertFound(
      await this.prisma.assetNode.findFirst({
        where: { id: assetNodeId, ...orgScope(user), deletedAt: null },
      }),
      'Asset-node',
    );
  }

  async findAllByAsset(assetNodeId: string, user: User) {
    await this.getAssetNodeInOrg(assetNodeId, user);

    return this.prisma.measurementRecord.findMany({
      where: { assetNodeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        assetNodeId: true,
        inspectionPlanId: true,
        status: true,
        measurements: true,
        instrumentType: true,
        instrumentSerial: true,
        calibrationDate: true,
        startedAt: true,
        completedAt: true,
        inspectorId: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findById(id: string, user: User) {
    return assertFound(
      await this.prisma.measurementRecord.findFirst({
        where: { id, ...orgScope(user) },
        include: {
          assetNode: { select: { id: true, name: true, typeCode: true } },
          findings: {
            where: { deletedAt: null },
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              shortDescription: true,
              statusCode: true,
              createdAt: true,
            },
          },
        },
      }),
      'Meting',
    );
  }

  async create(
    assetNodeId: string,
    user: User,
    dto: CreateMeasurementRecordDto,
    deviceId?: string,
  ) {
    const orgId = requireOrg(user);
    validateJsonColumn(measurementsSchema, dto.measurements, MEASUREMENTS_LABEL);

    // Plan binnen de org + de asset-node binnen de boom van dit plan.
    const plan = assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: dto.inspectionPlanId, ...orgScope(user), deletedAt: null },
        select: { id: true, orgId: true, locationId: true },
      }),
      'Inspectieplan',
    );
    await this.assetNodes.assertNodeInPlanTree(assetNodeId, plan);

    if (dto.inspectorId) {
      await assertSameOrg(this.prisma.user, dto.inspectorId, orgId, 'Inspecteur');
    }

    return this.prisma.measurementRecord.create({
      data: {
        orgId,
        assetNodeId,
        inspectionPlanId: plan.id,
        status: InspectionExecStatus.not_started,
        measurements: (dto.measurements ?? []) as Prisma.InputJsonValue,
        instrumentType: dto.instrumentType,
        instrumentSerial: dto.instrumentSerial,
        calibrationDate: dto.calibrationDate ? new Date(dto.calibrationDate) : undefined,
        inspectorId: dto.inspectorId,
        deviceId,
      },
      select: { id: true, status: true, measurements: true, createdAt: true },
    });
  }

  async update(id: string, user: User, dto: UpdateMeasurementRecordDto) {
    requireOrg(user);
    validateJsonColumn(measurementsSchema, dto.measurements, MEASUREMENTS_LABEL);
    const record = assertFound(
      await this.prisma.measurementRecord.findFirst({ where: { id, ...orgScope(user) } }),
      'Meting',
    );

    const data: Prisma.MeasurementRecordUpdateInput = {};
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.measurements !== undefined) data.measurements = dto.measurements as Prisma.InputJsonValue;
    if (dto.instrumentType !== undefined) data.instrumentType = dto.instrumentType;
    if (dto.instrumentSerial !== undefined) data.instrumentSerial = dto.instrumentSerial;
    if (dto.calibrationDate !== undefined) {
      data.calibrationDate = dto.calibrationDate ? new Date(dto.calibrationDate) : null;
    }

    return this.prisma.measurementRecord.update({
      where: { id: record.id },
      data,
      select: {
        id: true,
        status: true,
        measurements: true,
        instrumentType: true,
        instrumentSerial: true,
        calibrationDate: true,
        updatedAt: true,
      },
    });
  }

  async start(id: string, user: User) {
    requireOrg(user);
    const record = assertFound(
      await this.prisma.measurementRecord.findFirst({ where: { id, ...orgScope(user) } }),
      'Meting',
    );

    return this.prisma.measurementRecord.update({
      where: { id: record.id },
      data: {
        status: InspectionExecStatus.in_progress,
        startedAt: new Date(),
        // Inspecteur vastleggen als die nog niet gezet is
        inspectorId: record.inspectorId ?? user.id,
      },
      select: { id: true, status: true, startedAt: true, inspectorId: true },
    });
  }

  async complete(id: string, user: User) {
    requireOrg(user);
    const record = assertFound(
      await this.prisma.measurementRecord.findFirst({ where: { id, ...orgScope(user) } }),
      'Meting',
    );

    return this.prisma.measurementRecord.update({
      where: { id: record.id },
      data: {
        status: InspectionExecStatus.completed,
        completedAt: new Date(),
      },
      select: { id: true, status: true, completedAt: true },
    });
  }

  async delete(id: string, user: User) {
    requireOrg(user);
    const record = assertFound(
      await this.prisma.measurementRecord.findFirst({ where: { id, ...orgScope(user) } }),
      'Meting',
    );
    await this.prisma.measurementRecord.delete({ where: { id: record.id } });
    return { deleted: true };
  }
}
