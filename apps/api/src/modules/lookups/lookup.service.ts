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

/** Benoemde handvatten voor de lookup-codes — i.p.v. losse string-literals. */
export const LOOKUP_KIND = {
  INSPECTION_TYPES: 'inspection-types',
  PLAN_STATUS_TYPES: 'plan-status-types',
  ASSET_STATUS_TYPES: 'asset-status-types',
  FINDING_STATUS_TYPES: 'finding-status-types',
  REPORT_STATUS_TYPES: 'report-status-types',
  SIGNATORY_TYPES: 'signatory-types',
  SIGNER_ROLES: 'signer-roles',
  PASS_FAIL_STATUS_TYPES: 'pass-fail-status-types',
  RESOLUTION_STATUS_TYPES: 'resolution-status-types',
  CLIENT_REQUEST_TYPES: 'client-request-types',
  CLIENT_REQUEST_STATUS_TYPES: 'client-request-status-types',
} as const satisfies Record<string, LookupKind>;

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

/** Publieke item-vorm (subset van LookupRow) zoals de inspecteur-PWA die verwacht. */
export interface LookupItem {
  code: string;
  label: string;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * Gegroepeerde lookups-vorm voor de bare `GET /lookups`-collectie. Sleutels en
 * waardetypes komen exact overeen met het `Lookups`-contract van de inspecteur-PWA
 * (Inspexi-App `apps/inspectie-app/src/services/api/lookupsApi.ts`).
 */
export interface GroupedLookups {
  findingStatuses: LookupItem[];
  projectStatuses: LookupItem[];
  assetStatuses: LookupItem[];
  planStatuses: LookupItem[];
  reportStatuses: LookupItem[];
  clientRequestStatuses: LookupItem[];
  passFailStatuses: LookupItem[];
  resolutionStatuses: LookupItem[];
  inspectionTypes: LookupItem[];
  clientRequestTypes: LookupItem[];
  signatoryTypes: LookupItem[];
  signerRoles: LookupItem[];
  normTypes: LookupItem[];
}

/**
 * Map van PWA-sleutel → lookup-kind. Dekt 11 van de 13 sleutels; `projectStatuses`
 * en `normTypes` komen niet uit de lookup-tabellen (zie listAllGrouped).
 */
const GROUPED_KEY_TO_KIND = {
  findingStatuses: 'finding-status-types',
  assetStatuses: 'asset-status-types',
  planStatuses: 'plan-status-types',
  reportStatuses: 'report-status-types',
  clientRequestStatuses: 'client-request-status-types',
  passFailStatuses: 'pass-fail-status-types',
  resolutionStatuses: 'resolution-status-types',
  inspectionTypes: 'inspection-types',
  clientRequestTypes: 'client-request-types',
  signatoryTypes: 'signatory-types',
  signerRoles: 'signer-roles',
} as const satisfies Record<string, LookupKind>;

/**
 * Minimale delegate-vorm die de 11 structureel identieke lookup-modellen delen.
 * Prisma genereert per model een eigen, generiek delegate-type, dus een dynamische
 * index levert geen bruikbaar gemeenschappelijk type op. We benaderen de gedeelde
 * CRUD-subset via deze interface zodat de call-sites getypeerd blijven (LookupRow).
 */
interface LookupDelegate {
  findMany(args: {
    where?: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
  }): Promise<LookupRow[]>;
  findUnique(args: { where: { id: string } }): Promise<LookupRow | null>;
  create(args: { data: Record<string, unknown> }): Promise<LookupRow>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<LookupRow>;
  delete(args: { where: { id: string } }): Promise<LookupRow>;
}

@Injectable()
export class LookupService {
  constructor(private prisma: PrismaService) {}

  private delegate(kind: LookupKind): LookupDelegate {
    const model = LOOKUP_KINDS[kind];
    if (!model) throw new BadRequestException(`Onbekende lookup: ${kind}`);
    // Cast via `unknown` (geen `any`): de 11 delegates zijn structureel identiek aan
    // LookupDelegate, maar Prisma's per-model generics unificeren niet bij een
    // dynamische index. De gedeelde velden (LookupRow) maken dit runtime-veilig.
    return this.prisma[model] as unknown as LookupDelegate;
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
    return this.listMergedByOrg(kind, orgId);
  }

  /**
   * Zelfde merge-logica als listMerged, maar org-scope rechtstreeks via orgId i.p.v. een
   * staf-User. Gebruikt door de client-realm (orgId uit @CurrentTenant/subdomein), die geen
   * staf-User heeft maar wel de status/type-labels nodig heeft voor <LookupBadge>.
   */
  async listMergedByOrg(kind: LookupKind, orgId: string | null): Promise<LookupRow[]> {
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

  /**
   * Alle lookup-categorieën in één gegroepeerd object, in de vorm die de inspecteur-PWA
   * (`Lookups`-type) verwacht. Org-voorrang per categorie via listMergedByOrg; SUPERUSER
   * (orgId null) ziet alleen systeemdefaults. Twee sleutels wijken af van de lookup-tabellen:
   * - `projectStatuses`: in Beheer een enum (`Project.status`), geen lookup-tabel → lege lijst.
   * - `normTypes`: komt uit `NormTypeDefinition` (globaal, geen org-scope, geen kleur).
   */
  async listAllGrouped(user: User): Promise<GroupedLookups> {
    const orgId = user.roles.includes(Role.SUPERUSER) ? null : user.orgId;
    const toItem = (r: LookupRow): LookupItem => ({
      code: r.code,
      label: r.label,
      color: r.color,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    });

    const keys = Object.keys(GROUPED_KEY_TO_KIND) as (keyof typeof GROUPED_KEY_TO_KIND)[];
    const [lists, normTypes] = await Promise.all([
      Promise.all(keys.map((key) => this.listMergedByOrg(GROUPED_KEY_TO_KIND[key], orgId))),
      this.listNormTypes(),
    ]);
    const grouped = {} as Record<keyof typeof GROUPED_KEY_TO_KIND, LookupItem[]>;
    keys.forEach((key, i) => {
      grouped[key] = lists[i].map(toItem);
    });

    return {
      ...grouped,
      projectStatuses: [],
      normTypes,
    };
  }

  /** Norm-typedefinities als LookupItem[] (globaal, niet org-scoped, tombstones uitgesloten). */
  private async listNormTypes(): Promise<LookupItem[]> {
    const rows = await this.prisma.normTypeDefinition.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { code: true, label: true, sortOrder: true, isActive: true },
    });
    return rows.map((r) => ({
      code: r.code,
      label: r.label,
      color: null,
      sortOrder: r.sortOrder,
      isActive: r.isActive,
    }));
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
