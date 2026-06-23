import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { EntitlementsService } from './entitlements.service';
import {
  FEATURE_CATALOG,
  FEATURE_KEYS,
  FeatureKey,
  isFeatureKey,
} from './feature-catalog';
import { CreatePlanDto, UpdatePlanDto } from './dto';

/**
 * SUPERUSER-beheer voor abonnementsplannen (PRD-09 §5.3). Een plan is een
 * template: een verzameling feature-keys uit de {@link FEATURE_CATALOG}. De
 * effectieve set van een org = plan ⊕ per-org-overrides ⊕ closure (zie
 * {@link EntitlementsService}).
 *
 * Elke schrijf invalideert de entitlements-cache: plan-brede wijzigingen raken
 * potentieel meerdere orgs, dus we legen de hele cache ({@link EntitlementsService.clear}).
 * Audit loopt automatisch via de Prisma `$use`-middleware (Plan/PlanFeature staan
 * in de audit-registry), daarom doen we feature-toggles als losse create/delete
 * i.p.v. één geneste write.
 */
@Injectable()
export class PlansService {
  private readonly logger = new Logger(PlansService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Valideert dat alle keys in de catalogus zitten; dedupliceert. */
  private validateFeatureKeys(keys: string[]): FeatureKey[] {
    const unknown = keys.filter((k) => !isFeatureKey(k));
    if (unknown.length > 0) {
      throw new ConflictException(
        `Onbekende feature-keys: ${unknown.join(', ')}`,
      );
    }
    // Dedup + deterministische volgorde volgens de catalogus.
    return FEATURE_KEYS.filter((k) => keys.includes(k));
  }

  async findAll() {
    return this.prisma.plan.findMany({
      include: {
        features: { select: { featureKey: true } },
        _count: { select: { organizations: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    return assertFound(
      await this.prisma.plan.findUnique({
        where: { id },
        include: {
          features: { select: { featureKey: true } },
          _count: { select: { organizations: true } },
        },
      }),
      'Abonnement',
    );
  }

  async create(dto: CreatePlanDto) {
    const featureKeys = this.validateFeatureKeys(dto.featureKeys);

    const existing = await this.prisma.plan.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Slug is al in gebruik');
    }

    // Plan eerst, daarna de features als losse creates zodat elke PlanFeature
    // ook in de audit trail terechtkomt.
    const plan = await this.prisma.plan.create({
      data: {
        name: dto.name,
        slug: dto.slug,
        description: dto.description ?? null,
        isActive: dto.isActive ?? true,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
    for (const featureKey of featureKeys) {
      await this.prisma.planFeature.create({
        data: { planId: plan.id, featureKey },
      });
    }

    this.entitlements.clear();
    return this.findOne(plan.id);
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.findOne(id); // 404 als het plan niet bestaat

    // 1. Meta-velden (alleen de meegegeven).
    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.sortOrder !== undefined) data.sortOrder = dto.sortOrder;
    if (Object.keys(data).length > 0) {
      await this.prisma.plan.update({ where: { id }, data });
    }

    // 2. Feature-set diffen (alleen als featureKeys is meegegeven).
    if (dto.featureKeys !== undefined) {
      const desired = this.validateFeatureKeys(dto.featureKeys);
      const current = await this.prisma.planFeature.findMany({
        where: { planId: id },
        select: { id: true, featureKey: true },
      });
      const currentKeys = current.map((f) => f.featureKey);

      const toAdd = desired.filter((k) => !currentKeys.includes(k));
      const toRemove = current.filter((f) => !desired.includes(f.featureKey as FeatureKey));

      for (const featureKey of toAdd) {
        await this.prisma.planFeature.create({
          data: { planId: id, featureKey },
        });
      }
      for (const row of toRemove) {
        await this.prisma.planFeature.delete({ where: { id: row.id } });
      }
    }

    this.entitlements.clear();
    return this.findOne(id);
  }

  async remove(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
      include: { _count: { select: { organizations: true } } },
    });
    assertFound(plan, 'Abonnement');

    if (plan!._count.organizations > 0) {
      throw new ConflictException(
        'Dit abonnement is nog toegewezen aan organisaties. Wijs ze eerst een ander abonnement toe.',
      );
    }

    // PlanFeature-rijen cascaden mee (onDelete: Cascade).
    await this.prisma.plan.delete({ where: { id } });
    this.entitlements.clear();
    return { id };
  }

  /** Volledige feature-catalogus voor de SUPERUSER-UI (checkbox-lijst + deps). */
  getCatalog() {
    return FEATURE_KEYS.map((key) => FEATURE_CATALOG[key]);
  }
}
