import { Injectable, BadRequestException } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertFound, requireOrg } from '@/common';
import { LocationTypesService } from '../location-types/location-types.service';
import { CreateLocationDto, UpdateLocationDto, MoveLocationDto, ReorderLocationsDto } from './dto';

@Injectable()
export class InspectionLocationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locationTypes: LocationTypesService,
  ) {}

  private async getPlanInOrg(planId: string, user: User) {
    return assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, ...orgScope(user), deletedAt: null },
      }),
      'Inspectieplan',
    );
  }

  /** Locaties per inspectieplan (boom of plat). */
  async findAllByPlan(
    planId: string,
    user: User,
    options?: { parentId?: string; flat?: boolean },
  ) {
    await this.getPlanInOrg(planId, user);

    const where: Prisma.InspectionLocationWhereInput = {
      inspectionPlanId: planId,
      deletedAt: null,
    };
    if (!options?.flat) where.parentLocationId = options?.parentId || null;

    const locations = await this.prisma.inspectionLocation.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        parentLocationId: true,
        locationType: true,
        name: true,
        identifier: true,
        description: true,
        sortOrder: true,
        technicalData: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            childLocations: { where: { deletedAt: null } },
            assets: { where: { deletedAt: null } },
          },
        },
      },
    });

    const mapped = locations.map((l) => this.mapLocation(l));
    return options?.flat ? mapped : this.buildHierarchy(mapped);
  }

  /** Hiërarchische boom van locaties voor een plan. */
  async getTree(planId: string, user: User) {
    return this.findAllByPlan(planId, user, { flat: false });
  }

  /** Aantal locaties voor een plan. */
  async getCountByPlan(planId: string, user: User): Promise<{ count: number }> {
    await this.getPlanInOrg(planId, user);
    const count = await this.prisma.inspectionLocation.count({
      where: { inspectionPlanId: planId, deletedAt: null },
    });
    return { count };
  }

  async findById(id: string, user: User) {
    return assertFound(
      await this.prisma.inspectionLocation.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        include: {
          parentLocation: { select: { id: true, name: true, locationType: true } },
          childLocations: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
          assets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      'Locatie',
    );
  }

  async create(planId: string, user: User, dto: CreateLocationDto, deviceId?: string) {
    requireOrg(user);
    const plan = await this.getPlanInOrg(planId, user);

    // Parent moet binnen hetzelfde plan vallen; type-constraint valideren
    let parentLocationTypeCode: string | null = null;
    if (dto.parentLocationId) {
      const parent = assertFound(
        await this.prisma.inspectionLocation.findFirst({
          where: { id: dto.parentLocationId, inspectionPlanId: planId, deletedAt: null },
        }),
        'Ouder-locatie',
      );
      parentLocationTypeCode = parent.locationType;
    }
    const ok = await this.locationTypes.validateParentConstraint(
      dto.locationType,
      parentLocationTypeCode,
      user,
    );
    if (!ok.valid) throw new BadRequestException(ok.message || 'Ongeldig ouder-type');

    const maxSort = await this.prisma.inspectionLocation.aggregate({
      where: {
        inspectionPlanId: planId,
        parentLocationId: dto.parentLocationId || null,
        deletedAt: null,
      },
      _max: { sortOrder: true },
    });

    return this.prisma.inspectionLocation.create({
      data: {
        orgId: plan.orgId,
        inspectionPlanId: planId,
        parentLocationId: dto.parentLocationId ?? null,
        locationType: dto.locationType,
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        technicalData: (dto.technicalData ?? {}) as Prisma.InputJsonValue,
        notes: dto.notes,
        createdBy: user.id,
        deviceId,
      },
      select: { id: true, createdAt: true },
    });
  }

  async update(id: string, user: User, dto: UpdateLocationDto) {
    requireOrg(user);
    const location = await this.findScoped(id, user);

    return this.prisma.inspectionLocation.update({
      where: { id: location.id },
      data: {
        name: dto.name,
        identifier: dto.identifier,
        description: dto.description,
        sortOrder: dto.sortOrder,
        technicalData: dto.technicalData as Prisma.InputJsonValue | undefined,
        notes: dto.notes,
      },
      select: { id: true, updatedAt: true },
    });
  }

  async move(id: string, user: User, dto: MoveLocationDto) {
    requireOrg(user);
    const location = await this.findScoped(id, user);

    let newParentTypeCode: string | null = null;
    if (dto.newParentId) {
      if (dto.newParentId === id) {
        throw new BadRequestException('Een locatie kan niet naar zichzelf verplaatst worden');
      }
      const newParent = assertFound(
        await this.prisma.inspectionLocation.findFirst({
          where: {
            id: dto.newParentId,
            inspectionPlanId: location.inspectionPlanId,
            deletedAt: null,
          },
        }),
        'Nieuwe ouder-locatie',
      );
      if (await this.isDescendantOf(dto.newParentId, id)) {
        throw new BadRequestException('Een locatie kan niet onder zijn eigen kind geplaatst worden');
      }
      newParentTypeCode = newParent.locationType;
    }

    const ok = await this.locationTypes.validateParentConstraint(
      location.locationType,
      newParentTypeCode,
      user,
    );
    if (!ok.valid) {
      throw new BadRequestException(ok.message || 'Ongeldig ouder-type voor deze locatie');
    }

    return this.prisma.inspectionLocation.update({
      where: { id: location.id },
      data: { parentLocationId: dto.newParentId ?? null, sortOrder: dto.sortOrder },
      select: { id: true, parentLocationId: true, sortOrder: true },
    });
  }

  async reorder(planId: string, user: User, dto: ReorderLocationsDto) {
    requireOrg(user);
    await this.getPlanInOrg(planId, user);
    await this.prisma.$transaction(
      dto.locationIds.map((locationId, index) =>
        this.prisma.inspectionLocation.update({
          where: { id: locationId },
          data: { sortOrder: index },
        }),
      ),
    );
    return { reordered: true };
  }

  async delete(id: string, user: User) {
    requireOrg(user);
    const location = await this.findScoped(id, user);
    const now = new Date();
    // Soft-delete locatie + directe kind-locaties (tombstone voor sync)
    await this.prisma.inspectionLocation.updateMany({
      where: { OR: [{ id: location.id }, { parentLocationId: location.id }] },
      data: { deletedAt: now },
    });
    // Soft-delete assets direct onder deze locatie
    await this.prisma.asset.updateMany({
      where: { locationId: location.id, deletedAt: null },
      data: { deletedAt: now },
    });
    return { deleted: true };
  }

  // ── helpers ──
  private async findScoped(id: string, user: User) {
    return assertFound(
      await this.prisma.inspectionLocation.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
      }),
      'Locatie',
    );
  }

  private async isDescendantOf(locationId: string, ancestorId: string): Promise<boolean> {
    const location = await this.prisma.inspectionLocation.findFirst({
      where: { id: locationId, deletedAt: null },
      select: { parentLocationId: true },
    });
    if (!location?.parentLocationId) return false;
    if (location.parentLocationId === ancestorId) return true;
    return this.isDescendantOf(location.parentLocationId, ancestorId);
  }

  private mapLocation(l: any) {
    return {
      id: l.id,
      parentLocationId: l.parentLocationId,
      locationType: l.locationType,
      name: l.name,
      identifier: l.identifier,
      description: l.description,
      sortOrder: l.sortOrder,
      technicalData: l.technicalData,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
      childCount: l._count?.childLocations ?? 0,
      assetCount: l._count?.assets ?? 0,
    };
  }

  private buildHierarchy(locations: any[], parentId: string | null = null): any[] {
    return locations
      .filter((l) => l.parentLocationId === parentId)
      .map((l) => ({ ...l, children: this.buildHierarchy(locations, l.id) }));
  }
}
