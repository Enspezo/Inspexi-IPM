import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { delegateFor, ENTITY_DISPLAYS } from '@/common/audit';
import { FavoriteKeyDto, ListFavoritesQueryDto } from './dto';
import {
  FAVORITABLE_ENTITY_TYPES,
  FavoritableEntityType,
  isFavoritableEntityType,
} from './favorites.constants';

export interface FavoriteListItem {
  id: string;
  entityType: string;
  entityId: string;
  name: string;
  createdAt: Date;
}

export interface FavoriteGroup {
  entityType: FavoritableEntityType;
  items: FavoriteListItem[];
}

/**
 * Favoritable models that carry an `isDeleted` soft-delete flag. Their enrichment
 * lookups filter on it so a soft-deleted record falls back to "(verwijderd)" —
 * consistent with global search, which also filters `isDeleted: false`.
 */
const SOFT_DELETABLE_FAVORITE_TYPES: ReadonlySet<string> = new Set([
  'Contact',
  'ContactPerson',
  'Request',
  'Project',
]);

@Injectable()
export class FavoritesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Resolve a favoritable model name to its prisma delegate. The structural-cast
   * pattern is required because the delegate name is computed at runtime.
   */
  private getDelegate(model: string) {
    return (this.prisma as unknown as Record<string, any>)[delegateFor(model)];
  }

  /**
   * Cross-tenant ownership check. MUST run before any write.
   *
   * Mirrors `assertSameOrg` semantics (404 when missing / 403 when other org) but
   * also returns the entity's real orgId so that SUPERUSER favorites (user.orgId
   * null) still persist the entity's actual organization.
   */
  private async authorizeAndResolveOrgId(
    entityType: string,
    entityId: string,
    user: User,
  ): Promise<string> {
    const entity = await this.getDelegate(entityType).findUnique({
      where: { id: entityId },
      select: { orgId: true },
    });

    assertFound(entity, 'Record');

    if (user.orgId && entity.orgId !== user.orgId) {
      throw new ForbiddenException('Record hoort niet bij uw organisatie');
    }

    return entity.orgId as string;
  }

  /** Add a favorite (idempotent). */
  async add(dto: FavoriteKeyDto, user: User) {
    if (!isFavoritableEntityType(dto.entityType)) {
      throw new BadRequestException('Onbekend entiteitstype');
    }

    const orgId = await this.authorizeAndResolveOrgId(
      dto.entityType,
      dto.entityId,
      user,
    );

    return this.prisma.favorite.upsert({
      where: {
        userId_entityType_entityId: {
          userId: user.id,
          entityType: dto.entityType,
          entityId: dto.entityId,
        },
      },
      create: {
        userId: user.id,
        orgId,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
      update: {},
    });
  }

  /** Remove a favorite (idempotent — no error when nothing matches). */
  async remove(dto: FavoriteKeyDto, user: User): Promise<void> {
    await this.prisma.favorite.deleteMany({
      where: {
        userId: user.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
      },
    });
  }

  /** Lightweight (entityType, entityId) pairs for the current user. */
  async getKeys(user: User): Promise<{ entityType: string; entityId: string }[]> {
    return this.prisma.favorite.findMany({
      where: { userId: user.id },
      select: { entityType: true, entityId: true },
    });
  }

  /**
   * Set of `${entityType}:${entityId}` reference strings — consumed by the search
   * module to mark and bubble favorited results.
   */
  async getFavoriteRefSet(user: User): Promise<Set<string>> {
    const keys = await this.getKeys(user);
    return new Set(keys.map((k) => `${k.entityType}:${k.entityId}`));
  }

  /**
   * Grouped, name-enriched list of the user's favorites, ordered by the canonical
   * FAVORITABLE_ENTITY_TYPES order; items within a group are newest-first.
   */
  async list(
    user: User,
    query: ListFavoritesQueryDto,
  ): Promise<{ groups: FavoriteGroup[] }> {
    const where: { userId: string; entityType?: string } = { userId: user.id };
    if (query.entityType) {
      where.entityType = query.entityType;
    }

    const favorites = await this.prisma.favorite.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Batch-fetch the referenced records per entity type so the display fn has its
    // full record (mirrors notes' enrichWithEntityNames batching approach).
    const idsByType = new Map<string, string[]>();
    for (const fav of favorites) {
      const list = idsByType.get(fav.entityType) ?? [];
      list.push(fav.entityId);
      idsByType.set(fav.entityType, list);
    }

    const recordsByType = new Map<string, Map<string, Record<string, any>>>();
    await Promise.all(
      [...idsByType.entries()].map(async ([type, ids]) => {
        const where: Record<string, unknown> = { id: { in: ids } };
        if (SOFT_DELETABLE_FAVORITE_TYPES.has(type)) {
          where.isDeleted = false;
        }
        const records: Array<Record<string, any>> = await this.getDelegate(
          type,
        ).findMany({ where });
        recordsByType.set(type, new Map(records.map((r) => [r.id, r])));
      }),
    );

    const itemsByType = new Map<string, FavoriteListItem[]>();
    for (const fav of favorites) {
      const record = recordsByType.get(fav.entityType)?.get(fav.entityId);
      const name = record
        ? ENTITY_DISPLAYS.get(fav.entityType)?.(record) ?? '(verwijderd)'
        : '(verwijderd)';
      const list = itemsByType.get(fav.entityType) ?? [];
      list.push({
        id: fav.id,
        entityType: fav.entityType,
        entityId: fav.entityId,
        name,
        createdAt: fav.createdAt,
      });
      itemsByType.set(fav.entityType, list);
    }

    const groups: FavoriteGroup[] = FAVORITABLE_ENTITY_TYPES.filter((type) =>
      itemsByType.has(type),
    ).map((type) => ({
      entityType: type,
      items: itemsByType.get(type)!,
    }));

    return { groups };
  }
}
