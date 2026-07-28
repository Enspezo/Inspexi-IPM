import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Sync v2 round-trip suite (Fase 3).
 *
 * One org + one INSPECTEUR user + one contact. Exercises the full PWA sync
 * contract from docs/fase3/FASE3-SYNC.md §1:
 *   pull (empty + since) → push (create/update/delete) → conflict → resolve.
 *
 * Requests hit 127.0.0.1 (unknown host) so the TenantGuard does not scope
 * these; isolation under test elsewhere. orgId is injected server-side and is
 * NEVER sent by the client.
 */
describe('Sync v2 round-trip (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgAId: string;
  let userAId: string;
  let contactAId: string;
  let token: string;

  // Client-generated record ids (the PWA sends client UUIDs).
  let planId: string;
  let assetId: string;
  let findingId: string;

  const deviceId = 'dev-1';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({
      data: { name: 'E2E Sync Org A', slug: 'e2esyncorga' },
    });
    orgAId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-sync-a@test.nl',
        passwordHash,
        firstName: 'Sync',
        lastName: 'Tester',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    userAId = user.id;

    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Sync Contact A',
        email: 'e2e-sync-contact@test.nl',
        ownerId: user.id,
      },
    });
    contactAId = contact.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-sync-a@test.nl', password: 'TestPass123!' });
    token = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    const orgIds = [orgAId];
    const userIds = [userAId];

    try {
      // Children first (creates write auditLog rows for audited models).
      await prisma.photo.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      // Execution entities. standaloneMeasurement RESTRICTs on locationNodeId, so it
      // (its values cascade) must go before assetNode. The sheet-template has no orgId
      // and is RESTRICT-referenced by its records → delete records first, then template.
      await prisma.standaloneMeasurement.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.visualInspection.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.measurementRecord.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.measurementSheetRecord.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.measurementSheetTemplate.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      // Sync-create van assetNodes auto-provisioneert numbering-schemas (+counters).
      await prisma.numberingCounter.deleteMany({ where: { scheme: { orgId: { in: orgIds } } } });
      await prisma.numberingScheme.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.syncQueue.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await app.close();
    }
  });

  it('1. pull (empty) returns the v3 contract keys + this org\'s contact', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(Array.isArray(data.inspectionPlans)).toBe(true);
    expect(Array.isArray(data.assetNodes)).toBe(true);
    expect(Array.isArray(data.findings)).toBe(true);
    expect(Array.isArray(data.visualInspections)).toBe(true);
    expect(Array.isArray(data.measurementRecords)).toBe(true);
    expect(Array.isArray(data.measurementSheetRecords)).toBe(true);
    expect(Array.isArray(data.standaloneMeasurements)).toBe(true);
    expect(Array.isArray(data.photos)).toBe(true);
    expect(Array.isArray(data.contacts)).toBe(true);
    expect(Array.isArray(data.openConflicts)).toBe(true);
    expect(data.contractVersion).toBe(4);
    expect(data.deletedIds).toBeDefined();
    expect(Array.isArray(data.deletedIds.inspectionPlans)).toBe(true);
    expect(Array.isArray(data.deletedIds.assetNodes)).toBe(true);
    expect(Array.isArray(data.deletedIds.findings)).toBe(true);
    expect(typeof data.serverTime).toBe('string');

    const contactIds = data.contacts.map((c: { id: string }) => c.id);
    expect(contactIds).toContain(contactAId);
  });

  it('2. push create plan → processed, persisted with server-injected orgId', async () => {
    planId = randomUUID();

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          inspectionPlans: [
            {
              operation: 'create',
              data: {
                id: planId,
                contactId: contactAId,
                projectName: 'E2E Plan',
                normTypeCode: 'NEN1010',
              },
            },
          ],
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.processed.inspectionPlans).toBe(1);
    expect(res.body.data.errors).toHaveLength(0);
    expect(res.body.data.conflicts).toHaveLength(0);

    const persisted = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(persisted).not.toBeNull();
    expect(persisted?.orgId).toBe(orgAId);
    expect(persisted?.projectName).toBe('E2E Plan');

    // v4 (WP-D1): elke serverwrite vult synced_at (middleware/sync-pad) en de
    // push-respons draagt de nieuwe base-versie per record (applied[]).
    expect(persisted?.syncedAt).not.toBeNull();
    expect(res.body.data.applied).toEqual([
      {
        entityType: 'inspectionPlan',
        entityId: planId,
        serverVersion: persisted!.updatedAt.toISOString(),
      },
    ]);
  });

  it('3. push create asset node + finding → both processed', async () => {
    assetId = randomUUID();
    findingId = randomUUID();

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          // Unified tree: an ASSET node (no plan/location link on the node itself).
          assetNodes: [
            {
              operation: 'create',
              data: {
                id: assetId,
                nodeType: 'ASSET',
                typeCode: 'electrical_installation',
                name: 'Board',
              },
            },
          ],
          // Finding references the node + the plan directly (v3).
          findings: [
            {
              operation: 'create',
              data: {
                id: findingId,
                assetNodeId: assetId,
                inspectionPlanId: planId,
                inspectionType: 'visual',
                shortDescription: 'Defect',
              },
            },
          ],
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.processed.assetNodes).toBe(1);
    expect(res.body.data.processed.findings).toBe(1);
    expect(res.body.data.errors).toHaveLength(0);
    expect(res.body.data.conflicts).toHaveLength(0);
  });

  it('4. pull (since before pushes) returns the created plan/asset/finding', async () => {
    const since = new Date(Date.now() - 3600_000).toISOString();

    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .query({ since })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.success).toBe(true);
    const data = res.body.data;
    expect(data.inspectionPlans.map((p: { id: string }) => p.id)).toContain(planId);
    expect(data.assetNodes.map((a: { id: string }) => a.id)).toContain(assetId);
    expect(data.findings.map((f: { id: string }) => f.id)).toContain(findingId);
  });

  it('5. conflict: stale syncedAt update is held, not applied', async () => {
    // Bump server copy (sets updatedAt = now).
    await prisma.inspectionPlan.update({
      where: { id: planId },
      data: { projectName: 'SERVER EDIT' },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          inspectionPlans: [
            {
              operation: 'update',
              data: {
                id: planId,
                projectName: 'CLIENT EDIT',
                syncedAt: new Date(Date.now() - 86400_000).toISOString(),
              },
            },
          ],
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.conflicts).toHaveLength(1);
    const conflict = res.body.data.conflicts[0];
    expect(conflict.entityType).toBe('inspectionPlan');
    expect(conflict.entityId).toBe(planId);
    // Gedeeld contract: elk conflict draagt serverVersion (ISO) + serverData + clientData.
    expect(typeof conflict.serverVersion).toBe('string');
    expect(new Date(conflict.serverVersion).toISOString()).toBe(conflict.serverVersion);
    expect(conflict.serverData.projectName).toBe('SERVER EDIT');
    expect(conflict.clientData.projectName).toBe('CLIENT EDIT');

    // Push hetzelfde conflict nogmaals → detectie herhaalt zich, maar de queue-rij
    // wordt geüpdatet i.p.v. gestapeld (dedup).
    const res2 = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          inspectionPlans: [
            {
              operation: 'update',
              data: {
                id: planId,
                projectName: 'CLIENT EDIT 2',
                syncedAt: new Date(Date.now() - 86400_000).toISOString(),
              },
            },
          ],
        },
      })
      .expect(201);
    expect(res2.body.data.conflicts).toHaveLength(1);

    // Dedup: hooguit één open conflictrij ondanks twee pushes van hetzelfde record.
    const queued = await prisma.syncQueue.findMany({
      where: { entityId: planId, status: 'conflict' },
    });
    expect(queued).toHaveLength(1);
    // De queue-rij draagt de laatst-gepushte client-payload.
    expect((queued[0].payload as { projectName?: string }).projectName).toBe('CLIENT EDIT 2');

    // Server copy is untouched (client payload not applied).
    const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(plan?.projectName).toBe('SERVER EDIT');
  });

  it('6. resolve (client) applies the client payload + completes the queue row', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/resolve')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        resolutions: [
          { entityType: 'inspectionPlan', entityId: planId, resolution: 'client' },
        ],
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.resolved).toBe(1);
    expect(res.body.data.errors).toHaveLength(0);
    // Gat 2: results[] draagt per opgelost item de nieuwe base-versie (ISO updatedAt).
    expect(res.body.data.results).toHaveLength(1);
    const resolvedResult = res.body.data.results[0];
    expect(resolvedResult.entityType).toBe('inspectionPlan');
    expect(resolvedResult.entityId).toBe(planId);
    expect(typeof resolvedResult.serverVersion).toBe('string');
    expect(new Date(resolvedResult.serverVersion).toISOString()).toBe(resolvedResult.serverVersion);

    const queued = await prisma.syncQueue.findFirst({
      where: { entityId: planId },
      orderBy: { createdAt: 'desc' },
    });
    expect(queued?.status).toBe('completed');

    const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    // De client koos 'client' → de laatst-gepushte payload ('CLIENT EDIT 2') wint.
    expect(plan?.projectName).toBe('CLIENT EDIT 2');
    // De nieuwe serverVersion lijnt uit met de daadwerkelijke updatedAt.
    expect(plan?.updatedAt.toISOString()).toBe(resolvedResult.serverVersion);

    // Regressie: de conflict-resolve moet een geldige UPDATE-audit-row opleveren.
    // Vóór de fix deed resolve() de update met `select: { updatedAt: true }`,
    // waardoor de audit-middleware geen entityId had en de write stil faalde
    // op entity_id NOT NULL (23502) — de audit van elke resolve ging verloren.
    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: 'InspectionPlan', entityId: planId, action: 'UPDATE' },
      orderBy: { createdAt: 'desc' },
    });
    expect(auditRow).not.toBeNull();
    const changes = auditRow?.changes as Record<string, { from: unknown; to: unknown }>;
    expect(changes.projectName).toEqual({ from: 'SERVER EDIT', to: 'CLIENT EDIT 2' });
    // Geen bogus `id → null`-diff (de narrow-select-symptomen).
    expect(changes.id).toBeUndefined();
  });

  it('6b. B-209: a server-side edit after the pull conflicts on an ANCHOR-LESS push (fail-closed) instead of being silently overwritten', async () => {
    // Portal/backoffice wijzigt het record ná de laatste pull van de PWA…
    await prisma.inspectionPlan.update({
      where: { id: planId },
      data: { projectName: 'BACKOFFICE CORRECTIE' },
    });

    // …en de PWA pusht daarna zijn eigen versie ZONDER versie-anker (het
    // B-209-scenario: lokaal syncedAt undefined → vóór WP-D1 een stille
    // overschrijving zonder conflictrij).
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          inspectionPlans: [
            { operation: 'update', data: { id: planId, projectName: 'STALE CLIENTVERSIE' } },
          ],
        },
      })
      .expect(201);

    expect(res.body.data.conflicts).toHaveLength(1);
    expect(res.body.data.conflicts[0].entityId).toBe(planId);
    expect(res.body.data.processed.inspectionPlans).toBe(0);

    // De backoffice-correctie staat er nog; er is een open conflictrij mét org-scope.
    const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(plan?.projectName).toBe('BACKOFFICE CORRECTIE');
    const queued = await prisma.syncQueue.findFirst({
      where: { entityId: planId, status: 'conflict' },
    });
    expect(queued).not.toBeNull();
    expect(queued?.orgId).toBe(orgAId);
  });

  it('6c. B-223e: the open conflict travels in the pull envelope (visible in a fresh session) and disappears after resolve', async () => {
    // Verse sessie/nieuw toestel = een kale pull (geen lokale sync_queue).
    const pullRes = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const open = pullRes.body.data.openConflicts;
    expect(Array.isArray(open)).toBe(true);
    const conflict = open.find((c: { entityId: string }) => c.entityId === planId);
    expect(conflict).toBeDefined();
    expect(conflict.entityType).toBe('inspectionPlan');
    expect(conflict.serverData.projectName).toBe('BACKOFFICE CORRECTIE');
    expect(conflict.clientData.projectName).toBe('STALE CLIENTVERSIE');
    expect(typeof conflict.serverVersion).toBe('string');
    expect(typeof conflict.conflictAt).toBe('string');

    // Ná resolve (serverversie behouden) verdwijnt het conflict uit de envelope.
    const resolveRes = await request(app.getHttpServer())
      .post('/api/v1/sync/resolve')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        resolutions: [
          { entityType: 'inspectionPlan', entityId: planId, resolution: 'server' },
        ],
      })
      .expect(201);
    expect(resolveRes.body.data.resolved).toBe(1);

    const pullAfter = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      pullAfter.body.data.openConflicts.filter(
        (c: { entityId: string }) => c.entityId === planId,
      ),
    ).toHaveLength(0);

    // Serverversie is behouden gebleven.
    const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(plan?.projectName).toBe('BACKOFFICE CORRECTIE');
  });

  it('6d. v4: an update carrying the fresh baseVersion applies cleanly (no conflict)', async () => {
    const current = await prisma.inspectionPlan.findUnique({ where: { id: planId } });

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          inspectionPlans: [
            {
              operation: 'update',
              data: {
                id: planId,
                projectName: 'V4 CLIENT EDIT',
                baseVersion: current!.updatedAt.toISOString(),
              },
            },
          ],
        },
      })
      .expect(201);

    expect(res.body.data.conflicts).toHaveLength(0);
    expect(res.body.data.errors).toHaveLength(0);
    expect(res.body.data.processed.inspectionPlans).toBe(1);
    // applied[] draagt de nieuwe base = de geschreven updatedAt (gedeelde stempel).
    const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(plan?.projectName).toBe('V4 CLIENT EDIT');
    expect(res.body.data.applied).toEqual([
      {
        entityType: 'inspectionPlan',
        entityId: planId,
        serverVersion: plan!.updatedAt.toISOString(),
      },
    ]);
    expect(plan?.syncedAt?.toISOString()).toBe(plan?.updatedAt.toISOString());
  });

  it('7. push delete finding → tombstone surfaces in pull deletedIds', async () => {
    const beforeDelete = new Date(Date.now() - 1000).toISOString();

    const pushRes = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          findings: [{ operation: 'delete', data: { id: findingId } }],
        },
      })
      .expect(201);

    expect(pushRes.body.success).toBe(true);
    expect(pushRes.body.data.processed.findings).toBe(1);

    const pullRes = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .query({ since: beforeDelete })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(pullRes.body.data.deletedIds.findings).toContain(findingId);
  });

  it('8. push assetNodes with child before parent → server orders parent-first, both succeed', async () => {
    const since = new Date(Date.now() - 1000).toISOString();
    const parentNodeId = randomUUID();
    const childNodeId = randomUUID();

    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          // Child appears BEFORE its (same-batch) parent. orderAssetNodesParentFirst
          // must reorder so the parent (and its path-trigger) is processed first.
          assetNodes: [
            {
              operation: 'create',
              data: {
                id: childNodeId,
                nodeType: 'ASSET',
                typeCode: 'electrical_installation',
                name: 'Child node',
                parentId: parentNodeId,
              },
            },
            {
              operation: 'create',
              data: {
                id: parentNodeId,
                nodeType: 'ASSET',
                typeCode: 'electrical_installation',
                name: 'Parent node',
                // Child of the existing root asset created in test 3.
                parentId: assetId,
              },
            },
          ],
        },
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.processed.assetNodes).toBe(2);
    expect(res.body.data.errors).toHaveLength(0);
    expect(res.body.data.conflicts).toHaveLength(0);

    const pull = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .query({ since })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const byId = new Map<string, { id: string; parentId: string | null }>(
      pull.body.data.assetNodes.map((n: { id: string; parentId: string | null }) => [n.id, n]),
    );
    expect(byId.get(parentNodeId)?.parentId).toBe(assetId);
    expect(byId.get(childNodeId)?.parentId).toBe(parentNodeId);
  });

  it('9. push→pull the four execution entities (with nested values + a delete tombstone)', async () => {
    const since = new Date(Date.now() - 1000).toISOString();

    // A LOCATION node to root the standalone measurement on, and a minimal
    // measurement-sheet template (no orgId column) for the sheet record snapshot.
    const locationNodeId = randomUUID();
    const tmpl = await prisma.measurementSheetTemplate.create({
      data: {
        code: `E2E-MS-${randomUUID().slice(0, 8)}`,
        name: 'E2E Meetstaat',
        normTypeCode: 'NEN1010',
        createdBy: userAId,
      },
    });

    const viId = randomUUID();
    const mrId = randomUUID();
    const msrId = randomUUID();
    const smId = randomUUID();

    const pushRes = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: {
          assetNodes: [
            {
              operation: 'create',
              data: { id: locationNodeId, nodeType: 'LOCATION', typeCode: 'distribution_room', name: 'Meetlocatie' },
            },
          ],
          visualInspections: [
            {
              operation: 'create',
              data: {
                id: viId,
                assetNodeId: assetId,
                inspectionPlanId: planId,
                status: 'completed',
                checklistResults: [{ itemCode: 'cover', result: 'pass' }],
              },
            },
          ],
          measurementRecords: [
            {
              operation: 'create',
              data: {
                id: mrId,
                assetNodeId: assetId,
                inspectionPlanId: planId,
                status: 'completed',
                measurements: [{ name: 'R_iso', value: 210 }],
              },
            },
          ],
          measurementSheetRecords: [
            {
              operation: 'create',
              data: {
                id: msrId,
                assetNodeId: assetId,
                inspectionPlanId: planId,
                templateId: tmpl.id,
                templateVersion: tmpl.version,
                templateSnapshot: { sections: [] },
                status: 'COMPLETED',
                data: {},
              },
            },
          ],
          standaloneMeasurements: [
            {
              operation: 'create',
              data: {
                id: smId,
                inspectionPlanId: planId,
                locationNodeId,
                measurementType: 'isolatieweerstand',
                description: 'E2E standalone meting',
                linkedAssetNodeId: assetId,
                values: [
                  { fieldName: 'R_iso', fieldType: 'number', value: '210', unit: 'MΩ', passFailCode: 'pass' },
                  { fieldName: 'U_test', fieldType: 'number', value: '500', unit: 'V' },
                ],
              },
            },
          ],
        },
      })
      .expect(201);

    expect(pushRes.body.success).toBe(true);
    expect(pushRes.body.data.processed.assetNodes).toBe(1);
    expect(pushRes.body.data.processed.visualInspections).toBe(1);
    expect(pushRes.body.data.processed.measurementRecords).toBe(1);
    expect(pushRes.body.data.processed.measurementSheetRecords).toBe(1);
    expect(pushRes.body.data.processed.standaloneMeasurements).toBe(1);
    expect(pushRes.body.data.errors).toHaveLength(0);
    expect(pushRes.body.data.conflicts).toHaveLength(0);

    const pull = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .query({ since })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const d = pull.body.data;
    expect(d.visualInspections.map((x: { id: string }) => x.id)).toContain(viId);
    expect(d.measurementRecords.map((x: { id: string }) => x.id)).toContain(mrId);
    expect(d.measurementSheetRecords.map((x: { id: string }) => x.id)).toContain(msrId);

    const sm = d.standaloneMeasurements.find((x: { id: string }) => x.id === smId);
    expect(sm).toBeDefined();
    expect(sm.values.map((v: { fieldName: string }) => v.fieldName).sort()).toEqual(['R_iso', 'U_test']);

    // delete one execution entity → its id surfaces in pull deletedIds.
    const beforeDelete = new Date(Date.now() - 1000).toISOString();
    const delRes = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({
        deviceId,
        changes: { visualInspections: [{ operation: 'delete', data: { id: viId } }] },
      })
      .expect(201);
    expect(delRes.body.data.processed.visualInspections).toBe(1);

    const pull2 = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .query({ since: beforeDelete })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(pull2.body.data.deletedIds.visualInspections).toContain(viId);
  });
});
