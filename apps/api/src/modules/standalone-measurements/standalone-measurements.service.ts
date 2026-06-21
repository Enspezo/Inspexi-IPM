import { Injectable, BadRequestException } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, assertSameOrg, requireOrg } from '@/common';
import { LookupService, LOOKUP_KIND } from '../lookups/lookup.service';
import {
  CreateStandaloneMeasurementDto,
  UpdateStandaloneMeasurementDto,
  AddValueDto,
  LinkAssetDto,
} from './dto';

@Injectable()
export class StandaloneMeasurementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lookups: LookupService,
  ) {}

  /** Valideert een optionele passFailCode tegen de pass-fail-status lookup. */
  private async assertPassFail(code: string | undefined, orgId: string): Promise<void> {
    if (!code) return;
    const row = await this.lookups.resolveLookup(LOOKUP_KIND.PASS_FAIL_STATUS_TYPES, code, orgId);
    if (!row) throw new BadRequestException(`Onbekende pass/fail-status: ${code}`);
  }

  private async getPlanInOrg(planId: string, user: User) {
    return assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, ...orgScope(user), deletedAt: null },
      }),
      'Inspectieplan',
    );
  }

  /** Ad-hoc metingen onder een inspectieplan (optioneel gefilterd op locatie). */
  async findAllByPlan(planId: string, user: User, options?: { locationId?: string }) {
    await this.getPlanInOrg(planId, user);

    return this.prisma.standaloneMeasurement.findMany({
      where: {
        inspectionPlanId: planId,
        ...orgScope(user),
        deletedAt: null,
        ...(options?.locationId ? { locationId: options.locationId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        values: { orderBy: { fieldName: 'asc' } },
        location: { select: { id: true, name: true, locationType: true } },
        linkedAsset: { select: { id: true, name: true, assetType: true } },
      },
    });
  }

  async findById(id: string, user: User) {
    return assertFound(
      await this.prisma.standaloneMeasurement.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        include: {
          values: { orderBy: { fieldName: 'asc' } },
          location: { select: { id: true, name: true, locationType: true } },
          linkedAsset: { select: { id: true, name: true, assetType: true } },
        },
      }),
      'Meting',
    );
  }

  async create(
    planId: string,
    user: User,
    dto: CreateStandaloneMeasurementDto,
    deviceId?: string,
  ) {
    const orgId = requireOrg(user);
    const plan = await this.getPlanInOrg(planId, user);

    // Locatie moet binnen dezelfde organisatie vallen
    await assertSameOrg(this.prisma.inspectionLocation, dto.locationId, orgId, 'Locatie');

    // Optionele pass/fail-codes op de meegegeven waarden valideren (lookup)
    for (const v of dto.values ?? []) {
      await this.assertPassFail(v.passFailCode, orgId);
    }

    return this.prisma.standaloneMeasurement.create({
      data: {
        orgId: plan.orgId,
        inspectionPlanId: planId,
        locationId: dto.locationId,
        measurementType: dto.measurementType,
        description: dto.description,
        createdBy: user.id,
        deviceId,
        ...(dto.values?.length
          ? {
              values: {
                create: dto.values.map((v) => ({
                  fieldName: v.fieldName,
                  fieldType: v.fieldType,
                  value: v.value,
                  unit: v.unit,
                  passFailCode: v.passFailCode,
                })),
              },
            }
          : {}),
      },
      include: { values: { orderBy: { fieldName: 'asc' } } },
    });
  }

  async update(id: string, user: User, dto: UpdateStandaloneMeasurementDto) {
    requireOrg(user);
    const measurement = await this.findScoped(id, user);

    return this.prisma.standaloneMeasurement.update({
      where: { id: measurement.id },
      data: {
        measurementType: dto.measurementType,
        description: dto.description,
      },
    });
  }

  async delete(id: string, user: User) {
    requireOrg(user);
    const measurement = await this.findScoped(id, user);

    await this.prisma.standaloneMeasurement.update({
      where: { id: measurement.id },
      data: { deletedAt: new Date() },
    });

    return { deleted: true };
  }

  async addValue(id: string, user: User, dto: AddValueDto) {
    const orgId = requireOrg(user);
    const measurement = await this.findScoped(id, user);
    await this.assertPassFail(dto.passFailCode, orgId);

    return this.prisma.standaloneMeasurementValue.create({
      data: {
        standaloneMeasurementId: measurement.id,
        fieldName: dto.fieldName,
        fieldType: dto.fieldType,
        value: dto.value,
        unit: dto.unit,
        passFailCode: dto.passFailCode,
      },
    });
  }

  async linkAsset(id: string, user: User, dto: LinkAssetDto) {
    const orgId = requireOrg(user);
    const measurement = await this.findScoped(id, user);

    // Asset moet binnen dezelfde organisatie vallen
    await assertSameOrg(this.prisma.asset, dto.assetId, orgId, 'Asset');

    return this.prisma.standaloneMeasurement.update({
      where: { id: measurement.id },
      data: { linkedAssetId: dto.assetId },
    });
  }

  // ── helpers ──
  private async findScoped(id: string, user: User) {
    return assertFound(
      await this.prisma.standaloneMeasurement.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
      }),
      'Meting',
    );
  }
}
