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
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
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
    expect(data.contractVersion).toBe(3);
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
    expect(res.body.data.conflicts[0].entityType).toBe('inspectionPlan');
    expect(res.body.data.conflicts[0].entityId).toBe(planId);

    // A conflict row is parked in the sync queue.
    const queued = await prisma.syncQueue.findFirst({
      where: { entityId: planId, status: 'conflict' },
    });
    expect(queued).not.toBeNull();

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

    const queued = await prisma.syncQueue.findFirst({
      where: { entityId: planId },
      orderBy: { createdAt: 'desc' },
    });
    expect(queued?.status).toBe('completed');

    const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(plan?.projectName).toBe('CLIENT EDIT');
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
});
