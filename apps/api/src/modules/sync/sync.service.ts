// v3 sync — entiteit-gegroepeerd, aligned op Beheer-schema (unified AssetNode tree), tenant-veilig.
// Contract: pull → {inspectionPlans, assetNodes, findings, visualInspections, measurementRecords,
//                    measurementSheetRecords, standaloneMeasurements, photos, contacts, deletedIds, serverTime}
//           push → {deviceId, clientTime, changes:{<entityKey>[]...}}
//           resolve → {deviceId, resolutions:[{entityType,entityId,resolution,mergedData?}]}
//
// Veiligheid: nooit blind data spreaden (whitelist via sync-mapper), orgId server-side
// geïnjecteerd (elke entiteit heeft een eigen orgId-kolom), FK's met assertSameOrg
// gecontroleerd (cross-tenant). Conflict: optimistic — server.updatedAt > client.syncedAt.

import { Injectable, BadRequestException } from '@nestjs/common';
import { User, Prisma, SyncStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertSameOrg, requireOrg } from '@/common';
import { PushDto, ResolveDto, EntityChangeDto } from './dto';
import {
  SYNC_ENTITIES, SyncEntityKey, SyncModelName, FkCheckModel, SyncRecordData,
  SYNC_CONTRACT_VERSION, toDbData, toChildRows, toWire,
} from './sync-mapper';
import { ChatService } from '../chat/chat.service';

type OpResult =
  | { entityType: string; entityId: string; status: 'success' }
  | { entityType: string; entityId: string; status: 'conflict'; clientData: SyncRecordData; serverData: unknown }
  | { entityType: string; entityId: string; status: 'failed'; error: string };

/** Bestaande db-rij zoals de sync die leest (alleen `updatedAt` wordt expliciet gebruikt). */
interface SyncRow {
  updatedAt: Date;
  [field: string]: unknown;
}

/**
 * Minimale, gedeelde delegate-vorm voor de drie sync-modellen. Prisma's per-model
 * generics unificeren niet bij een dynamische index; deze interface dekt exact de
 * CRUD-subset die de sync gebruikt en is toewijsbaar aan `assertSameOrg`'s delegate
 * (findUnique/findMany), zodat de tenant-check getypeerd blijft.
 */
interface SyncDelegate {
  findFirst(args: { where: Record<string, unknown> }): Promise<SyncRow | null>;
  findUnique(args: { where: { id: string }; select: { orgId: true } }): Promise<{ orgId: string } | null>;
  findMany(args: { where: { id: { in: string[] }; orgId: string }; select: { id: true } }): Promise<Array<{ id: string }>>;
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
  update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
}

/** JSON-kolom (conflictData/payload) veilig als object lezen; niet-objecten → leeg record. */
function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Sorteert een `assetNodes`-push-batch zó dat een ouder altijd vóór z'n kind verwerkt wordt.
 * Nodig omdat een node-create de FK `parent_id` raakt én de BEFORE-trigger die de parent-`path`
 * uitleest: een kind dat vóór z'n in dezelfde push aangemaakte ouder binnenkomt, zou anders falen.
 * Stabiele topologische sort (DFS over de in-batch parent→kind-afhankelijkheid); cycli en
 * id-loze records worden defensief afgehandeld (geen oneindige recursie, niets stilletjes weg).
 */
export function orderAssetNodesParentFirst(changes: EntityChangeDto[]): EntityChangeDto[] {
  const byId = new Map<string, EntityChangeDto>();
  for (const c of changes) {
    const id = String(c.data.id ?? '');
    if (id) byId.set(id, c);
  }
  const ordered: EntityChangeDto[] = [];
  const placed = new Set<string>();
  const visit = (c: EntityChangeDto, stack: Set<string>): void => {
    const id = String(c.data.id ?? '');
    if (id && placed.has(id)) return;
    const parentId = typeof c.data.parentId === 'string' ? c.data.parentId : undefined;
    // Volg alleen een parent die óók in deze batch wordt aangemaakt; `!stack.has` breekt cycli.
    if (parentId && byId.has(parentId) && !stack.has(parentId)) {
      visit(byId.get(parentId)!, new Set(stack).add(id));
    }
    if (!id) {
      ordered.push(c); // id-loos: behoud volgorde, processChange faalt er netjes op
    } else if (!placed.has(id)) {
      placed.add(id);
      ordered.push(c);
    }
  };
  for (const c of changes) visit(c, new Set(c.data.id ? [String(c.data.id)] : []));
  return ordered;
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chat: ChatService,
  ) {}

  /** Expliciete map model-naam → Prisma-delegate, i.p.v. een dynamische `this.prisma[name]`. */
  private delegateFor(model: SyncModelName): SyncDelegate {
    const delegates: Record<SyncModelName, unknown> = {
      inspectionPlan: this.prisma.inspectionPlan,
      assetNode: this.prisma.assetNode,
      finding: this.prisma.finding,
      visualInspection: this.prisma.visualInspection,
      measurementRecord: this.prisma.measurementRecord,
      measurementSheetRecord: this.prisma.measurementSheetRecord,
      standaloneMeasurement: this.prisma.standaloneMeasurement,
    };
    return delegates[model] as SyncDelegate;
  }

  /** Delegate voor de same-org FK-checks (cross-tenant guard op inkomende FK-waarden). */
  private checkDelegate(model: FkCheckModel): SyncDelegate {
    const delegates: Record<FkCheckModel, unknown> = {
      assetNode: this.prisma.assetNode,
      inspectionPlan: this.prisma.inspectionPlan,
      location: this.prisma.location,
    };
    return delegates[model] as SyncDelegate;
  }

  /** Valideer dat alle aanwezige FK-waarden bij de eigen org horen (no-op voor superuser). */
  private async assertFkChecks(key: SyncEntityKey, data: SyncRecordData, user: User): Promise<void> {
    for (const chk of SYNC_ENTITIES[key].fkChecks ?? []) {
      const fkId = data[chk.field] as string | undefined;
      if (!fkId) continue;
      await assertSameOrg(this.checkDelegate(chk.model), fkId, user.orgId, chk.label);
    }
  }

  // ── PULL ───────────────────────────────────────────────
  async pull(user: User, sinceIso?: string) {
    const since = sinceIso ? new Date(sinceIso) : new Date(0);
    const serverTime = new Date();
    const scope = orgScope(user);

    const changedWhere = {
      ...scope,
      deletedAt: null,
      OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
    };

    // Unified AssetNode tree: assetNodes draagt zowel LOCATION- als ASSET-nodes (de PWA
    // smelt zijn assets- en locations-stores samen tot één assetNodes-store).
    const [plans, assetNodes, findings, visualInspections, measurementRecords, measurementSheetRecords, standaloneMeasurements] =
      await Promise.all([
        this.prisma.inspectionPlan.findMany({ where: changedWhere }),
        this.prisma.assetNode.findMany({ where: changedWhere }),
        this.prisma.finding.findMany({ where: changedWhere }),
        this.prisma.visualInspection.findMany({ where: changedWhere }),
        this.prisma.measurementRecord.findMany({ where: changedWhere }),
        this.prisma.measurementSheetRecord.findMany({ where: changedWhere }),
        this.prisma.standaloneMeasurement.findMany({ where: changedWhere, include: { values: true } }),
      ]);

    const deletedWhere = { ...scope, deletedAt: { gt: since } };
    const [delPlans, delNodes, delFindings, delVi, delMr, delMsr, delSm] = await Promise.all([
      this.prisma.inspectionPlan.findMany({ where: deletedWhere, select: { id: true } }),
      this.prisma.assetNode.findMany({ where: deletedWhere, select: { id: true } }),
      this.prisma.finding.findMany({ where: deletedWhere, select: { id: true } }),
      this.prisma.visualInspection.findMany({ where: deletedWhere, select: { id: true } }),
      this.prisma.measurementRecord.findMany({ where: deletedWhere, select: { id: true } }),
      this.prisma.measurementSheetRecord.findMany({ where: deletedWhere, select: { id: true } }),
      this.prisma.standaloneMeasurement.findMany({ where: deletedWhere, select: { id: true } }),
    ]);

    // Foto's (metadata + auth-download-route; PWA cachet de blob lokaal)
    const photos = await this.prisma.photo.findMany({
      where: { ...scope, deletedAt: null, createdAt: { gt: since } },
      select: { id: true, entityType: true, entityId: true },
    });
    const wirePhotoType: Record<string, string> = { asset: 'asset', finding: 'finding', inspection_plan: 'inspectionPlan', location: 'location' };

    // Contacten als read-only referentie (offline naamweergave)
    const contacts = await this.prisma.contact.findMany({
      where: { ...scope, isDeleted: false, updatedAt: { gt: since } },
      select: { id: true, type: true, companyName: true, firstName: true, lastName: true, orgId: true },
    });

    // Meetmiddelen — read-only referentie (pull-only, zoals contacts). Tombstones via
    // isDeleted+updatedAt (dit model heeft geen deletedAt). Kalibraties syncen niet.
    const [measurementInstruments, delInstruments, userDefaults, planDefaults] = await Promise.all([
      this.prisma.measurementInstrument.findMany({
        where: {
          ...scope,
          isDeleted: false,
          OR: [{ createdAt: { gt: since } }, { updatedAt: { gt: since } }],
        },
        select: {
          id: true,
          orgId: true,
          code: true,
          brand: true,
          type: true,
          serialNumber: true,
          status: true,
          assignedToUserId: true,
          calibrationIntervalMonths: true,
          lastCalibrationDate: true,
          nextCalibrationDue: true,
        },
      }),
      this.prisma.measurementInstrument.findMany({
        where: { ...scope, isDeleted: true, updatedAt: { gt: since } },
        select: { id: true },
      }),
      this.prisma.userDefaultInstrument.findMany({
        where: { userId: user.id },
        select: { instrumentId: true },
      }),
      this.prisma.inspectionPlanDefaultInstrument.findMany({
        where: { inspectionPlanId: { in: plans.map((p) => p.id) } },
        select: { inspectionPlanId: true, instrumentId: true },
      }),
    ]);
    const defaultsByPlan = new Map<string, string[]>();
    for (const d of planDefaults) {
      const arr = defaultsByPlan.get(d.inspectionPlanId) ?? [];
      arr.push(d.instrumentId);
      defaultsByPlan.set(d.inspectionPlanId, arr);
    }

    // Additieve chat-uitbreiding (REQ1 PR2): membership-scoped threads/messages +
    // presence. Bestaande keys blijven ongewijzigd; een oude PWA negeert deze.
    const chat = await this.chat.getSyncSnapshot(user, since);

    return {
      inspectionPlans: plans.map((p) => ({
        ...toWire(p),
        // Niveau-2 voorkeur per inspectie (additief; lege array als geen defaults).
        defaultInstrumentIds: defaultsByPlan.get(p.id) ?? [],
      })),
      assetNodes: assetNodes.map(toWire),
      findings: findings.map(toWire),
      visualInspections: visualInspections.map(toWire),
      measurementRecords: measurementRecords.map(toWire),
      measurementSheetRecords: measurementSheetRecords.map(toWire),
      standaloneMeasurements: standaloneMeasurements.map(toWire),
      // Meetmiddelen pull-only + globale (niveau-1) voorkeur van de device-gebruiker.
      measurementInstruments,
      userDefaultInstrumentIds: userDefaults.map((d) => d.instrumentId),
      photos: photos.map((p) => ({
        id: p.id,
        entityType: wirePhotoType[p.entityType] ?? p.entityType,
        entityId: p.entityId,
        url: `/api/v1/photos/${p.id}/download`,
        thumbnailUrl: `/api/v1/photos/${p.id}/download?thumb=1`,
      })),
      contacts: contacts.map((c) => ({
        id: c.id,
        orgId: c.orgId,
        name: c.companyName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '—',
      })),
      // Additief — chat:
      chatThreads: chat.chatThreads,
      chatMessages: chat.chatMessages,
      users: chat.users,
      deletedIds: {
        inspectionPlans: delPlans.map((x) => x.id),
        assetNodes: delNodes.map((x) => x.id),
        findings: delFindings.map((x) => x.id),
        visualInspections: delVi.map((x) => x.id),
        measurementRecords: delMr.map((x) => x.id),
        measurementSheetRecords: delMsr.map((x) => x.id),
        standaloneMeasurements: delSm.map((x) => x.id),
        // Additief — meetmiddel-tombstones:
        measurementInstruments: delInstruments.map((x) => x.id),
        // Additief — chat tombstones:
        chatThreads: chat.deletedThreadIds,
        chatMessages: chat.deletedMessageIds,
      },
      contractVersion: SYNC_CONTRACT_VERSION,
      serverTime: serverTime.toISOString(),
    };
  }

  // ── PUSH ───────────────────────────────────────────────
  async push(user: User, dto: PushDto) {
    const orgId = requireOrg(user);
    const results: OpResult[] = [];
    const processed: Record<string, number> = { chatMessages: 0 };
    for (const key of Object.keys(SYNC_ENTITIES)) processed[key] = 0;

    for (const key of Object.keys(SYNC_ENTITIES) as SyncEntityKey[]) {
      // assetNodes: ouder vóór kind verwerken binnen de batch (FK parent_id + path-trigger).
      const group =
        key === 'assetNodes'
          ? orderAssetNodesParentFirst(dto.changes[key] ?? [])
          : dto.changes[key] ?? [];
      for (const change of group) {
        try {
          const r = await this.processChange(key, change.operation, change.data, user, orgId, dto.deviceId);
          results.push(r);
          if (r.status === 'success') processed[key]++;
        } catch (e: any) {
          results.push({
            entityType: SYNC_ENTITIES[key].singular,
            entityId: String(change.data.id ?? ''),
            status: 'failed',
            error: e?.message ?? 'Onbekende fout',
          });
        }
      }
    }

    // Additief (REQ1 PR2): chat-berichten. Bewust NIET via de generieke mutator —
    // ze vereisen membership-autorisatie + notificatie-dispatch — dus delegeren we
    // naar ChatService (idempotent op client-id).
    let chatMessagesProcessed = 0;
    for (const change of dto.changes.chatMessages ?? []) {
      try {
        const r = await this.chat.applySyncMessage(user, change.operation, change.data);
        results.push({ entityType: 'chatMessage', entityId: r.id, status: 'success' });
        chatMessagesProcessed++;
      } catch (e: any) {
        results.push({
          entityType: 'chatMessage',
          entityId: String(change.data.id ?? ''),
          status: 'failed',
          error: e?.message ?? 'Onbekende fout',
        });
      }
    }
    processed.chatMessages = chatMessagesProcessed;

    return {
      processed,
      conflicts: results.filter((r) => r.status === 'conflict'),
      errors: results.filter((r) => r.status === 'failed'),
      serverTime: new Date().toISOString(),
    };
  }

  private async processChange(
    key: SyncEntityKey,
    operation: 'create' | 'update' | 'delete',
    data: SyncRecordData,
    user: User,
    userOrgId: string,
    deviceId: string,
  ): Promise<OpResult> {
    const cfg = SYNC_ENTITIES[key];
    const model = this.delegateFor(cfg.model);
    const id = String(data.id ?? '');
    if (!id) throw new BadRequestException('Record mist id');
    const ref = { entityType: cfg.singular, entityId: id };

    if (operation === 'delete') {
      const existing = await model.findFirst({ where: { id, ...orgScope(user) } });
      if (!existing) throw new BadRequestException('Record niet gevonden');
      await model.update({ where: { id }, data: { deletedAt: new Date() } });
      return { ...ref, status: 'success' };
    }

    // orgId server-side bepalen (nooit van de client) + cross-tenant FK-check op inkomende FK's
    const orgId = await this.resolveOrgId(key, data, userOrgId, user);
    await this.assertFkChecks(key, data, user);
    const fields = toDbData(key, data);

    // Geneste kind-rijen (bv. StandaloneMeasurementValue) reizen mee in dezelfde payload.
    const childRows = cfg.nestedChild ? toChildRows(cfg.nestedChild, data) : null;

    if (operation === 'create') {
      const createData: Record<string, unknown> = { ...fields, id, orgId };
      if (cfg.injectCreatedBy) createData.createdBy = data.createdBy ?? user.id;
      if (cfg.nestedChild && childRows) createData[cfg.nestedChild.relation] = { create: childRows };
      await model.create({ data: createData });
      return { ...ref, status: 'success' };
    }

    // update
    const existing = await model.findFirst({ where: { id, ...orgScope(user) } });
    if (!existing) throw new BadRequestException('Record niet gevonden');

    // optimistic conflict: server nieuwer dan wat de client laatst zag
    const clientSynced = data.syncedAt ? new Date(data.syncedAt) : null;
    if (clientSynced && existing.updatedAt > clientSynced) {
      // existing bevat Date/Decimal-velden die niet rauw in de Json-kolom mogen;
      // normaliseer naar plain JSON vóór opslag/teruggave.
      const serverData: unknown = JSON.parse(JSON.stringify(existing));
      await this.prisma.syncQueue.create({
        data: {
          deviceId, userId: user.id, entityType: cfg.singular, entityId: id,
          operation: 'update', payload: data as Prisma.InputJsonValue, status: SyncStatus.conflict,
          conflictData: {
            serverData, clientData: data, serverVersion: existing.updatedAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return { ...ref, status: 'conflict', clientData: data, serverData };
    }

    const updateData: Record<string, unknown> = { ...fields, syncedAt: new Date() };
    // replace-on-write: alleen als de client het kind-veld meestuurde.
    if (cfg.nestedChild && childRows) {
      updateData[cfg.nestedChild.relation] = { deleteMany: {}, create: childRows };
    }
    await model.update({ where: { id }, data: updateData });
    return { ...ref, status: 'success' };
  }

  /** orgId uit de hiërarchie + tenant-check op de parent-FK. */
  private async resolveOrgId(
    key: SyncEntityKey,
    data: SyncRecordData,
    userOrgId: string,
    user: User,
  ): Promise<string> {
    const cfg = SYNC_ENTITIES[key];
    if (cfg.org.from === 'self') return userOrgId;

    const parentId = data[cfg.org.fkField] as string | undefined;
    if (!parentId) throw new BadRequestException(`${cfg.org.fkField} ontbreekt`);
    const parentModel = this.delegateFor(cfg.org.parentModel);
    await assertSameOrg(parentModel, parentId, user.orgId, 'Bovenliggend item');
    const parent = await parentModel.findUnique({ where: { id: parentId }, select: { orgId: true } });
    if (!parent) throw new BadRequestException('Bovenliggend item niet gevonden');
    return parent.orgId;
  }

  // ── RESOLVE ────────────────────────────────────────────
  async resolve(user: User, dto: ResolveDto) {
    requireOrg(user);
    let resolved = 0;
    const errors: Array<{ entityType: string; entityId: string; error: string }> = [];

    for (const r of dto.resolutions) {
      try {
        const queueItem = await this.prisma.syncQueue.findFirst({
          where: { entityType: r.entityType, entityId: r.entityId, status: SyncStatus.conflict },
          orderBy: { createdAt: 'desc' },
        });
        if (!queueItem) throw new BadRequestException('Geen conflict gevonden');

        const key = this.singularToKey(r.entityType);
        const conflict = asRecord(queueItem.conflictData);
        const chosen: Record<string, unknown> =
          r.resolution === 'server' ? asRecord(conflict.serverData)
          : r.resolution === 'client' ? asRecord(queueItem.payload)
          : (r.mergedData ?? {});

        const delegate = this.delegateFor(SYNC_ENTITIES[key].model);
        const existing = await delegate.findFirst({
          where: { id: r.entityId, ...orgScope(user) },
        });
        if (!existing) throw new BadRequestException('Record niet gevonden');

        await delegate.update({
          where: { id: r.entityId },
          data: { ...toDbData(key, chosen), syncedAt: new Date() },
        });
        await this.prisma.syncQueue.update({
          where: { id: queueItem.id },
          data: { status: SyncStatus.completed, resolvedAt: new Date(), resolvedBy: user.id },
        });
        resolved++;
      } catch (e: any) {
        errors.push({ entityType: r.entityType, entityId: r.entityId, error: e?.message ?? 'Onbekende fout' });
      }
    }
    return { resolved, errors };
  }

  private singularToKey(singular: string): SyncEntityKey {
    const found = (Object.keys(SYNC_ENTITIES) as SyncEntityKey[]).find(
      (k) => SYNC_ENTITIES[k].singular === singular,
    );
    if (!found) throw new BadRequestException(`Onbekend entityType: ${singular}`);
    return found;
  }
}
