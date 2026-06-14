// Doel in apps/api: src/modules/lookups/lookup.service.ts
//
// Generieke service voor de 11 per-org overschrijfbare lookup-tabellen uit Fase 1.
// - resolveLookup(kind, code, orgId)  → één rij (org-override wint van systeemdefault)
// - listMerged(kind, user)            → systeem-defaults + org-rijen, org wint op `code`
// - create/update/remove              → org-admin beheert org-rijen; superuser de defaults
//
// Andere services injecteren LookupService voor validatie/resolutie van *Code-velden.
// De portal/PWA halen listMerged op en bouwen er hun eigen StatusMap (label+kleur) mee.

import {
  Injectable,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { Role, User } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { assertFound } from '@/common';
import { CreateLookupDto, UpdateLookupDto } from './dto';

/** URL-segment per lookup-soort → Prisma-model (delegate). */
export const LOOKUP_KINDS = {
  'inspection-types': 'inspectionTypeOption',
  'plan-status-types': 'planStatusType',
  'asset-status-types': 'assetStatusType',
  'finding-status-types': 'findingStatusType',
  'report-status-types': 'reportStatusType',
  'signatory-types': 'signatoryTypeOption',
  'signer-roles': 'signerRoleOption',
  'pass-fail-status-types': 'passFailStatusType',
  'resolution-status-types': 'resolutionStatusType',
  'client-request-types': 'clientRequestTypeOption',
  'client-request-status-types': 'clientRequestStatusType',
} as const;

export type LookupKind = keyof typeof LOOKUP_KINDS;

/** Minimale rij-vorm die alle lookup-tabellen delen. */
export interface LookupRow {
  id: string;
  orgId: string | null;
  code: string;
  label: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
}

@Injectable()
export class LookupService {
  constructor(private prisma: PrismaService) {}

  private delegate(kind: LookupKind): any {
    const model = LOOKUP_KINDS[kind];
    if (!model) throw new BadRequestException(`Onbekende lookup: ${kind}`);
    // Alle 11 modellen delen dezelfde velden; delegate is structureel identiek.
    return (this.prisma as any)[model];
  }

  /**
   * Resolveer één code naar de toepasselijke rij met org-voorrang:
   * org-specifieke rij wint van de globale systeemdefault (orgId null).
   */
  async resolveLookup(
    kind: LookupKind,
    code: string,
    orgId: string | null,
  ): Promise<LookupRow | null> {
    const rows: LookupRow[] = await this.delegate(kind).findMany({
      where: {
        code,
        isActive: true,
        OR: [{ orgId }, { orgId: null }],
      },
      orderBy: [{ orgId: { sort: 'desc', nulls: 'last' } }],
      take: 1,
    });
    return rows[0] ?? null;
  }

  /**
   * Lijst voor een org: globale systeemdefaults + eigen org-rijen, waarbij een
   * org-rij met dezelfde `code` de default overschrijft. Gesorteerd op sortOrder.
   * SUPERUSER (orgId null) ziet alleen de systeemdefaults.
   */
  async listMerged(kind: LookupKind, user: User): Promise<LookupRow[]> {
    const orgId = user.roles.includes(Role.SUPERUSER) ? null : user.orgId;

    const rows: LookupRow[] = await this.delegate(kind).findMany({
      where: { OR: [{ orgId: null }, ...(orgId ? [{ orgId }] : [])] },
      orderBy: [{ sortOrder: 'asc' }],
    });

    const byCode = new Map<string, LookupRow>();
    for (const row of rows) {
      const existing = byCode.get(row.code);
      // org-rij (orgId != null) wint van systeemdefault
      if (!existing || (row.orgId && !existing.orgId)) byCode.set(row.code, row);
    }
    return [...byCode.values()].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Beheer-lijst (ruwe rijen, ongemerged) voor de instellingen-UI. */
  async listRaw(kind: LookupKind, user: User): Promise<LookupRow[]> {
    const orgId = user.roles.includes(Role.SUPERUSER) ? null : user.orgId;
    return this.delegate(kind).findMany({
      where: { OR: [{ orgId: null }, ...(orgId ? [{ orgId }] : [])] },
      orderBy: [{ orgId: { sort: 'desc', nulls: 'last' } }, { sortOrder: 'asc' }],
    });
  }

  async create(kind: LookupKind, dto: CreateLookupDto, user: User): Promise<LookupRow> {
    const isSuper = user.roles.includes(Role.SUPERUSER);
    // SUPERUSER maakt globale systeemdefault (orgId null); org-admin maakt org-rij.
    const orgId = isSuper ? null : user.orgId!;
    return this.delegate(kind).create({
      data: {
        orgId,
        code: dto.code,
        label: dto.label,
        color: dto.color ?? null,
        sortOrder: dto.sortOrder ?? 0,
        isActive: dto.isActive ?? true,
        isSystem: isSuper,
      },
    });
  }

  async update(
    kind: LookupKind,
    id: string,
    dto: UpdateLookupDto,
    user: User,
  ): Promise<LookupRow> {
    const row: LookupRow = assertFound(
      await this.delegate(kind).findUnique({ where: { id } }),
      'Lookup-waarde',
    );
    this.assertManageable(row, user);
    return this.delegate(kind).update({
      where: { id },
      data: {
        label: dto.label ?? undefined,
        color: dto.color === undefined ? undefined : dto.color,
        sortOrder: dto.sortOrder ?? undefined,
        isActive: dto.isActive ?? undefined,
      },
    });
  }

  async remove(kind: LookupKind, id: string, user: User): Promise<void> {
    const row: LookupRow = assertFound(
      await this.delegate(kind).findUnique({ where: { id } }),
      'Lookup-waarde',
    );
    this.assertManageable(row, user);
    await this.delegate(kind).delete({ where: { id } });
  }

  /** Org-admin mag alleen eigen org-rijen; systeemdefaults zijn superuser-only. */
  private assertManageable(row: LookupRow, user: User): void {
    if (user.roles.includes(Role.SUPERUSER)) return;
    if (row.orgId === null || row.isSystem) {
      throw new ForbiddenException('Systeemwaarden kunnen niet gewijzigd worden');
    }
    if (row.orgId !== user.orgId) {
      throw new ForbiddenException('Deze waarde hoort niet bij uw organisatie');
    }
  }
}
