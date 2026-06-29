import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Asset-nodes (e2e) — exercises the unified AssetNode tree-CRUD endpoints:
 * lazy root creation per CRM-Locatie, child create (LOCATION + ASSET), detail,
 * update, move within the tree, scope-deellocaties on the plan, and soft-delete.
 * path/depth are maintained by the DB trigger, so the API never sets them.
 */
describe('AssetNodes (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testNormCode: string;
  let testLocationTypeCode: string;
  let testAssetTypeCode: string;
  let testCrmLocationId: string;
  let testPlanId: string;
  let accessToken: string;

  let rootNodeId: string;
  let roomNodeId: string;
  let assetNodeId: string;

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
      data: { name: 'E2E AssetNodes Org', slug: 'e2eassetnodes' },
    });
    testOrgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-assetnodes@test.nl',
        passwordHash,
        firstName: 'Node',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E AssetNodes Contact',
        email: 'e2e-assetnodes-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // CRM-Locatie = boom-wortel (1:1 met de wortel-LOCATION-node).
    const crmLocation = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E AssetNodes Hoofdlocatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    testCrmLocationId = crmLocation.id;

    testNormCode = 'e2enormnode';
    await prisma.normTypeDefinition.create({
      data: {
        code: testNormCode,
        label: 'E2E Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });

    // Org type-definitions zonder constraints → elke ouder toegestaan.
    testLocationTypeCode = 'e2elocnode';
    await prisma.locationTypeDefinition.create({
      data: { orgId: org.id, code: testLocationTypeCode, name: 'Ruimte', isSystem: false },
    });
    testAssetTypeCode = 'e2eassetnode';
    await prisma.assetTypeDefinition.create({
      data: { orgId: org.id, code: testAssetTypeCode, name: 'Verdeler', isSystem: false },
    });

    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: crmLocation.id,
        projectName: 'E2E AssetNodes Plan',
        normTypeCode: testNormCode,
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-assetnodes@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // Scope rows (RESTRICT on the node FK) before the tree; then the tree itself
      // (parentId is SET NULL → one deleteMany clears it), then the CRM-Locatie.
      await prisma.inspectionPlanLocation.deleteMany({ where: { orgId: testOrgId } });
      await prisma.assetNode.deleteMany({ where: { orgId: testOrgId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: testNormCode } });
      await prisma.assetTypeDefinition.deleteMany({ where: { orgId: testOrgId } });
      await prisma.locationTypeDefinition.deleteMany({ where: { orgId: testOrgId } });
      await prisma.location.deleteMany({ where: { id: testCrmLocationId } });
      await prisma.contact.deleteMany({ where: { id: testContactId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('GET /api/v1/locations/:locationId/tree', () => {
    it('lazily creates and returns the root LOCATION node for a CRM-Locatie', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/locations/${testCrmLocationId}/tree`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      const root = res.body.data[0];
      expect(root.nodeType).toBe('LOCATION');
      expect(root.parentId).toBeNull();
      expect(root.rootLocationId).toBe(testCrmLocationId);
      rootNodeId = root.id;
    });

    it('returns 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/locations/${testCrmLocationId}/tree`)
        .expect(401);
    });
  });

  describe('POST /api/v1/asset-nodes', () => {
    it('rejects a root node without rootLocationId (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/asset-nodes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ nodeType: 'LOCATION', typeCode: testLocationTypeCode, name: 'Geen wortel' })
        .expect(400);
    });

    it('creates a child LOCATION node under the root', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/asset-nodes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          parentId: rootNodeId,
          nodeType: 'LOCATION',
          typeCode: testLocationTypeCode,
          name: 'Verdeelruimte',
          identifier: 'VR-01',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.nodeType).toBe('LOCATION');
      expect(res.body.data.parentId).toBe(rootNodeId);
      expect(res.body.data.depth).toBe(1);
      roomNodeId = res.body.data.id;
    });

    it('creates an ASSET node under the room LOCATION', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/asset-nodes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          parentId: roomNodeId,
          nodeType: 'ASSET',
          typeCode: testAssetTypeCode,
          name: 'Hoofdverdeler',
          identifier: 'HVK-01',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.nodeType).toBe('ASSET');
      expect(res.body.data.parentId).toBe(roomNodeId);
      assetNodeId = res.body.data.id;
    });

    it('rejects a LOCATION node under an ASSET node (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/asset-nodes')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          parentId: assetNodeId,
          nodeType: 'LOCATION',
          typeCode: testLocationTypeCode,
          name: 'Ongeldige locatie',
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/asset-nodes/:id', () => {
    it('returns node detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/asset-nodes/${assetNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(assetNodeId);
    });

    it('returns 404 for a non-existent node', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/asset-nodes/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/asset-nodes/:id', () => {
    it('updates the node name and status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/asset-nodes/${assetNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Hoofdverdeler (bijgewerkt)', statusCode: 'in_progress' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Hoofdverdeler (bijgewerkt)');
      expect(res.body.data.statusCode).toBe('in_progress');
    });
  });

  describe('POST /api/v1/asset-nodes/:id/move', () => {
    it('moves the asset up under the root LOCATION node', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/asset-nodes/${assetNodeId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newParentId: rootNodeId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBe(rootNodeId);
      expect(res.body.data.depth).toBe(1);
    });

    it('rejects moving the root node (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/asset-nodes/${rootNodeId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newParentId: roomNodeId })
        .expect(400);
    });
  });

  describe('scope-locations on the plan', () => {
    it('adds the room LOCATION node to the plan scope', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/scope-locations/${roomNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((s: { assetNodeId: string }) => s.assetNodeId);
      expect(ids).toContain(roomNodeId);
    });

    it('flags the in-scope node in the plan tree', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${testPlanId}/tree`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const root = res.body.data[0];
      const room = root.children.find((c: { id: string }) => c.id === roomNodeId);
      expect(room).toBeDefined();
      expect(room.inScope).toBe(true);
    });

    it('rejects an ASSET node as a scope-deellocatie (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/scope-locations/${assetNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('removes the room LOCATION node from the plan scope', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/inspection-plans/${testPlanId}/scope-locations/${roomNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const ids = res.body.data.map((s: { assetNodeId: string }) => s.assetNodeId);
      expect(ids).not.toContain(roomNodeId);
    });
  });

  describe('DELETE /api/v1/asset-nodes/:id', () => {
    it('soft-deletes a node (and its subtree) and 404s afterwards', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/asset-nodes/${roomNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/asset-nodes/${roomNodeId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
