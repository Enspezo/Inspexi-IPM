import { Injectable, BadRequestException } from '@nestjs/common';
import { User, Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { paginate, orgScope, assertFound } from '@/common';
import { AssetTypesService } from '../asset-types/asset-types.service';
import { LookupService, LOOKUP_KIND } from '../lookups/lookup.service';
import {
  CreateAssetDto,
  UpdateAssetDto,
  MoveAssetDto,
  ReorderAssetsDto,
  ListAssetsQueryDto,
} from './dto';

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly assetTypes: AssetTypesService,
    private readonly lookups: LookupService,
  ) {}

  private requireOrg(user: User): string {
    if (!user.orgId) throw new BadRequestException('Selecteer eerst een organisatie');
    return user.orgId;
  }

  private async getPlanInOrg(planId: string, user: User) {
    return assertFound(
      await this.prisma.inspectionPlan.findFirst({
        where: { id: planId, ...orgScope(user), deletedAt: null },
      }),
      'Inspectieplan',
    );
  }

  private async assertStatus(code: string | undefined, orgId: string): Promise<void> {
    if (!code) return;
    const row = await this.lookups.resolveLookup(LOOKUP_KIND.ASSET_STATUS_TYPES, code, orgId);
    if (!row) throw new BadRequestException(`Onbekende asset-status: ${code}`);
  }

  /** Organisatie-breed asset-register (portal). */
  async findAllForOrganization(user: User, q: ListAssetsQueryDto) {
    const page = q.page ?? 1;
    const limit = Math.min(q.limit ?? 50, 200);

    const where: Prisma.AssetWhereInput = {
      ...orgScope(user),
      deletedAt: null,
      inspectionPlan: {
        deletedAt: null,
        ...(q.contactId ? { contactId: q.contactId } : {}),
      },
      ...(q.assetTypeCode ? { assetType: q.assetTypeCode } : {}),
      ...(q.statusCode ? { statusCode: q.statusCode } : {}),
      ...(q.search
        ? {
            OR: [
              { name: { contains: q.search, mode: 'insensitive' } },
              { identifier: { contains: q.search, mode: 'insensitive' } },
              { assetType: { contains: q.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    return paginate(this.prisma.asset, {
      where,
      orderBy: { updatedAt: 'desc' },
      page,
      limit,
      select: {
        id: true,
        assetType: true,
        name: true,
        identifier: true,
        locationDescription: true,
        statusCode: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        inspectionPlan: {
          select: {
            id: true,
            projectName: true,
            normTypeCode: true,
            statusCode: true,
            contact: {
              select: { id: true, companyName: true, firstName: true, lastName: true },
            },
          },
        },
        _count: {
          select: {
            findings: { where: { deletedAt: null } },
            measurementRecords: true,
            visualInspections: true,
          },
        },
      },
    });
  }

  /** Assets per inspectieplan (boom of plat). */
  async findAllByPlan(
    planId: string,
    user: User,
    options?: { parentId?: string; flat?: boolean },
  ) {
    await this.getPlanInOrg(planId, user);

    const where: Prisma.AssetWhereInput = { inspectionPlanId: planId, deletedAt: null };
    if (!options?.flat) where.parentAssetId = options?.parentId || null;

    const assets = await this.prisma.asset.findMany({
      where,
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        parentAssetId: true,
        assetType: true,
        name: true,
        identifier: true,
        locationDescription: true,
        sortOrder: true,
        statusCode: true,
        technicalData: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            childAssets: { where: { deletedAt: null } },
            findings: { where: { deletedAt: null } },
          },
        },
        visualInspections: { take: 1, select: { status: true } },
        measurementRecords: { take: 1, select: { status: true } },
      },
    });

    const mapped = assets.map((a) => this.mapAsset(a));
    return options?.flat ? mapped : this.buildHierarchy(mapped);
  }

  async findById(id: string, user: User) {
    return assertFound(
      await this.prisma.asset.findFirst({
        where: { id, ...orgScope(user), deletedAt: null },
        include: {
          visualInspections: true,
          measurementRecords: true,
          findings: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
          childAssets: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        },
      }),
      'Asset',
    );
  }

  async create(planId: string, user: User, dto: CreateAssetDto, deviceId?: string) {
    this.requireOrg(user);
    const plan = await this.getPlanInOrg(planId, user);

    // Parent moet binnen hetzelfde plan vallen; type-constraint valideren
    let parentAssetTypeCode: string | null = null;
    if (dto.parentAssetId) {
      const parent = assertFound(
        await this.prisma.asset.findFirst({
          where: { id: dto.parentAssetId, inspectionPlanId: planId, deletedAt: null },
        }),
        'Ouder-asset',
      );
      parentAssetTypeCode = parent.assetType;
    }
    const ok = await this.assetTypes.validateParentConstraint(
      dto.assetType,
      parentAssetTypeCode,
      user,
    );
    if (!ok.valid) throw new BadRequestException(ok.message || 'Ongeldig ouder-type');

    const maxSort = await this.prisma.asset.aggregate({
      where: { inspectionPlanId: planId, parentAssetId: dto.parentAssetId || null, deletedAt: null },
      _max: { sortOrder: true },
    });

    return this.prisma.asset.create({
      data: {
        orgId: plan.orgId,
        inspectionPlanId: planId,
        parentAssetId: dto.parentAssetId ?? null,
        assetType: dto.assetType,
        name: dto.name,
        identifier: dto.identifier,
        locationDescription: dto.locationDescription,
        sortOrder: dto.sortOrder ?? (maxSort._max.sortOrder ?? 0) + 1,
        technicalData: (dto.technicalData ?? {}) as Prisma.InputJsonValue,
        notes: dto.notes,
        createdBy: user.id,
        deviceId,
      },
      select: { id: true, statusCode: true, createdAt: true },
    });
  }

  async update(id: string, user: User, dto: UpdateAssetDto) {
    const orgId = this.requireOrg(user);
    const asset = await this.findScoped(id, user);
    await this.assertStatus(dto.statusCode, orgId);

    return this.prisma.asset.update({
      where: { id: asset.id },
      data: {
        name: dto.name,
        identifier: dto.identifier,
        locationDescription: dto.locationDescription,
        sortOrder: dto.sortOrder,
        statusCode: dto.statusCode,
        technicalData: dto.technicalData as Prisma.InputJsonValue | undefined,
        notes: dto.notes,
      },
      select: { id: true, statusCode: true, updatedAt: true },
    });
  }

  async move(id: string, user: User, dto: MoveAssetDto) {
    this.requireOrg(user);
    const asset = await this.findScoped(id, user);

    let newParentTypeCode: string | null = null;
    if (dto.newParentId) {
      if (dto.newParentId === id) {
        throw new BadRequestException('Een asset kan niet naar zichzelf verplaatst worden');
      }
      const newParent = assertFound(
        await this.prisma.asset.findFirst({
          where: { id: dto.newParentId, inspectionPlanId: asset.inspectionPlanId, deletedAt: null },
        }),
        'Nieuwe ouder-asset',
      );
      if (await this.isDescendantOf(dto.newParentId, id)) {
        throw new BadRequestException('Een asset kan niet onder zijn eigen kind geplaatst worden');
      }
      newParentTypeCode = newParent.assetType;
    }

    const ok = await this.assetTypes.validateParentConstraint(
      asset.assetType,
      newParentTypeCode,
      user,
    );
    if (!ok.valid) {
      throw new BadRequestException(ok.message || 'Ongeldig ouder-type voor deze asset');
    }

    return this.prisma.asset.update({
      where: { id: asset.id },
      data: { parentAssetId: dto.newParentId ?? null, sortOrder: dto.sortOrder },
      select: { id: true, parentAssetId: true, sortOrder: true },
    });
  }

  async reorder(planId: string, user: User, dto: ReorderAssetsDto) {
    this.requireOrg(user);
    await this.getPlanInOrg(planId, user);
    await this.prisma.$transaction(
      dto.assetIds.map((assetId, index) =>
        this.prisma.asset.update({ where: { id: assetId }, data: { sortOrder: index } }),
      ),
    );
    return { reordered: true };
  }

  async delete(id: string, user: User) {
    this.requireOrg(user);
    const asset = await this.findScoped(id, user);
    // Soft-delete asset + directe kinderen (tombstone voor sync)
    await this.prisma.asset.updateMany({
      where: { OR: [{ id: asset.id }, { parentAssetId: asset.id }] },
      data: { deletedAt: new Date() },
    });
    return { deleted: true };
  }

  // ── helpers ──
  private async findScoped(id: string, user: User) {
    return assertFound(
      await this.prisma.asset.findFirst({ where: { id, ...orgScope(user), deletedAt: null } }),
      'Asset',
    );
  }

  private async isDescendantOf(assetId: string, ancestorId: string): Promise<boolean> {
    const asset = await this.prisma.asset.findFirst({
      where: { id: assetId, deletedAt: null },
      select: { parentAssetId: true },
    });
    if (!asset?.parentAssetId) return false;
    if (asset.parentAssetId === ancestorId) return true;
    return this.isDescendantOf(asset.parentAssetId, ancestorId);
  }

  private mapAsset(a: any) {
    return {
      id: a.id,
      parentAssetId: a.parentAssetId,
      assetType: a.assetType,
      name: a.name,
      identifier: a.identifier,
      locationDescription: a.locationDescription,
      sortOrder: a.sortOrder,
      statusCode: a.statusCode,
      technicalData: a.technicalData,
      notes: a.notes,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      childCount: a._count?.childAssets ?? 0,
      findingCount: a._count?.findings ?? 0,
      visualInspectionStatus: a.visualInspections?.[0]?.status || 'not_started',
      measurementStatus: a.measurementRecords?.[0]?.status || 'not_started',
    };
  }

  private buildHierarchy(assets: any[], parentId: string | null = null): any[] {
    return assets
      .filter((a) => a.parentAssetId === parentId)
      .map((a) => ({ ...a, children: this.buildHierarchy(assets, a.id) }));
  }
}
