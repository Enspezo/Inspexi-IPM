// Doel in apps/api: src/modules/sync/sync.service.ts
//
// v2 sync — entiteit-gegroepeerd, aligned op Beheer-schema, tenant-veilig.
// Contract: pull → {inspectionPlans, assets, findings, photos, contacts, deletedIds, serverTime}
//           push → {deviceId, clientTime, changes:{inspectionPlans[],assets[],findings[]}}
//           resolve → {deviceId, resolutions:[{entityType,entityId,resolution,mergedData?}]}
//
// Veiligheid: nooit blind data spreaden (whitelist via sync-mapper), orgId server-side
// geïnjecteerd uit de hiërarchie, parent-FK met assertSameOrg gecontroleerd.
// Conflict: optimistic — server.updatedAt > client.syncedAt op een update.

import { Injectable, BadRequestException } from '@nestjs/common';
import { User, Prisma, SyncStatus } from '@prisma/client';
import { PrismaService } from '@/prisma';
import { orgScope, assertSameOrg } from '@/common';
import { PushDto, ResolveDto } from './dto';
import { SYNC_ENTITIES, SyncEntityKey, toDbData, toWire } from './sync-mapper';

type OpResult =
  | { entityType: string; entityId: string; status: 'success' }
  | { entityType: string; entityId: string; status: 'conflict'; clientData: any; serverData: any }
  | { entityType: string; entityId: string; status: 'failed'; error: string };

@Injectable()
export class SyncService {
  constructor(private readonly prisma: PrismaService) {}

  private requireOrg(user: User): string {
    if (!user.orgId) throw new BadRequestException('Selecteer eerst een organisatie');
    return user.orgId;
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
    } as const;

    const [plans, assets, findings] = await Promise.all([
      this.prisma.inspectionPlan.findMany({ where: changedWhere }),
      this.prisma.asset.findMany({ where: changedWhere }),
      this.prisma.finding.findMany({ where: changedWhere }),
    ]);

    const [delPlans, delAssets, delFindings] = await Promise.all([
      this.prisma.inspectionPlan.findMany({ where: { ...scope, deletedAt: { gt: since } }, select: { id: true } }),
      this.prisma.asset.findMany({ where: { ...scope, deletedAt: { gt: since } }, select: { id: true } }),
      this.prisma.finding.findMany({ where: { ...scope, deletedAt: { gt: since } }, select: { id: true } }),
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

    return {
      inspectionPlans: plans.map(toWire),
      assets: assets.map(toWire),
      findings: findings.map(toWire),
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
      deletedIds: {
        inspectionPlans: delPlans.map((x) => x.id),
        assets: delAssets.map((x) => x.id),
        findings: delFindings.map((x) => x.id),
      },
      serverTime: serverTime.toISOString(),
    };
  }

  // ── PUSH ───────────────────────────────────────────────
  async push(user: User, dto: PushDto) {
    const orgId = this.requireOrg(user);
    const results: OpResult[] = [];
    const processed: Record<string, number> = { inspectionPlans: 0, assets: 0, findings: 0 };

    for (const key of Object.keys(SYNC_ENTITIES) as SyncEntityKey[]) {
      const group = dto.changes[key] ?? [];
      for (const change of group) {
        try {
          const r = await this.processChange(key, change.operation, change.data, user, orgId, dto.deviceId);
          results.push(r);
          if (r.status === 'success') processed[key]++;
        } catch (e: any) {
          results.push({
            entityType: SYNC_ENTITIES[key].singular,
            entityId: String((change.data as any)?.id ?? ''),
            status: 'failed',
            error: e?.message ?? 'Onbekende fout',
          });
        }
      }
    }

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
    data: Record<string, unknown>,
    user: User,
    userOrgId: string,
    deviceId: string,
  ): Promise<OpResult> {
    const cfg = SYNC_ENTITIES[key];
    const model = (this.prisma as any)[cfg.model];
    const id = String((data as any).id ?? '');
    if (!id) throw new BadRequestException('Record mist id');
    const ref = { entityType: cfg.singular, entityId: id };

    if (operation === 'delete') {
      const existing = await model.findFirst({ where: { id, ...orgScope(user) } });
      if (!existing) throw new BadRequestException('Record niet gevonden');
      await model.update({ where: { id }, data: { deletedAt: new Date() } });
      return { ...ref, status: 'success' };
    }

    // orgId server-side bepalen (nooit van de client)
    const orgId = await this.resolveOrgId(key, data, userOrgId, user);
    const fields = toDbData(key, data);

    if (operation === 'create') {
      await model.create({
        data: { ...fields, id, orgId, createdBy: (data as any).createdBy ?? user.id },
      });
      return { ...ref, status: 'success' };
    }

    // update
    const existing = await model.findFirst({ where: { id, ...orgScope(user) } });
    if (!existing) throw new BadRequestException('Record niet gevonden');

    // optimistic conflict: server nieuwer dan wat de client laatst zag
    const clientSynced = (data as any).syncedAt ? new Date((data as any).syncedAt as string) : null;
    if (clientSynced && existing.updatedAt > clientSynced) {
      await this.prisma.syncQueue.create({
        data: {
          deviceId, userId: user.id, entityType: cfg.singular, entityId: id,
          operation: 'update', payload: data as Prisma.InputJsonValue, status: SyncStatus.conflict,
          conflictData: {
            serverData: existing, clientData: data, serverVersion: existing.updatedAt.toISOString(),
          } as Prisma.InputJsonValue,
        },
      });
      return { ...ref, status: 'conflict', clientData: data, serverData: existing };
    }

    await model.update({ where: { id }, data: { ...fields, syncedAt: new Date() } });
    return { ...ref, status: 'success' };
  }

  /** orgId uit de hiërarchie + tenant-check op de parent-FK. */
  private async resolveOrgId(
    key: SyncEntityKey,
    data: Record<string, unknown>,
    userOrgId: string,
    user: User,
  ): Promise<string> {
    const cfg = SYNC_ENTITIES[key];
    if (cfg.org.from === 'self') return userOrgId;

    const parentId = (data as any)[cfg.org.fkField] as string | undefined;
    if (!parentId) throw new BadRequestException(`${cfg.org.fkField} ontbreekt`);
    const parentModel = (this.prisma as any)[cfg.org.parentModel];
    await assertSameOrg(parentModel, parentId, user.orgId, 'Bovenliggend item');
    const parent = await parentModel.findUnique({ where: { id: parentId }, select: { orgId: true } });
    if (!parent) throw new BadRequestException('Bovenliggend item niet gevonden');
    return parent.orgId;
  }

  // ── RESOLVE ────────────────────────────────────────────
  async resolve(user: User, dto: ResolveDto) {
    this.requireOrg(user);
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
        const conflict = queueItem.conflictData as any;
        const chosen =
          r.resolution === 'server' ? conflict?.serverData
          : r.resolution === 'client' ? (queueItem.payload as any)
          : (r.mergedData ?? {});

        const existing = await (this.prisma as any)[SYNC_ENTITIES[key].model].findFirst({
          where: { id: r.entityId, ...orgScope(user) },
        });
        if (!existing) throw new BadRequestException('Record niet gevonden');

        await (this.prisma as any)[SYNC_ENTITIES[key].model].update({
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
