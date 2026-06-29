import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Assets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testNormCode: string;
  let testAssetTypeCode: string;
  let testLocationId: string;
  let testPlanId: string;
  let accessToken: string;
  let rootAssetId: string;
  let childAssetId: string;

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

    // Org
    const org = await prisma.organization.create({
      data: { name: 'E2E Assets Org', slug: 'e2eassets' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-assets@test.nl',
        passwordHash,
        firstName: 'Asset',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Contact (opdrachtgever)
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Assets Contact',
        email: 'e2e-assets-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // CRM-Locatie = hoofdlocatie / boom-wortel van de AssetNode-boom. De compat
    // assets-endpoints hangen nieuwe assets onder de (lazily aangemaakte)
    // wortel-LOCATION-node van plan.locationId.
    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E Assets Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    testLocationId = location.id;

    // Global norm-type definition
    testNormCode = 'e2enorm2';
    await prisma.normTypeDefinition.create({
      data: {
        code: testNormCode,
        label: 'E2E Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });

    // Inspection plan (met hoofdlocatie zodat de boom-wortel kan ontstaan)
    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: location.id,
        projectName: 'E2E Assets Plan',
        normTypeCode: testNormCode,
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Org asset-type definition (no constraints → any parent allowed)
    testAssetTypeCode = 'e2econtainer';
    await prisma.assetTypeDefinition.create({
      data: {
        orgId: org.id,
        code: testAssetTypeCode,
        name: 'Container',
        isSystem: false,
      },
    });

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-assets@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // Children first, then the rest in FK order. AssetNode.parentId is SET NULL,
      // so a single deleteMany clears the whole tree (root LOCATION + assets).
      await prisma.assetNode.deleteMany({ where: { orgId: testOrgId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: testNormCode } });
      await prisma.assetTypeDefinition.deleteMany({
        where: { orgId: testOrgId, code: testAssetTypeCode },
      });
      await prisma.location.deleteMany({ where: { id: testLocationId } });
      await prisma.contact.deleteMany({ where: { id: testContactId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/inspection-plans/:planId/assets', () => {
    it('should create an asset under a plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetType: testAssetTypeCode, name: 'C1' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      rootAssetId = res.body.data.id;
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/assets`)
        .send({ assetType: testAssetTypeCode, name: 'NoAuth' })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No type' })
        .expect(400);
    });
  });

  describe('GET /api/v1/inspection-plans/:planId/assets', () => {
    it('should list assets for a plan (tree)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${testPlanId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/assets', () => {
    it('should return a paginated org-wide list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/assets')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
      expect(res.body.data.page).toBeDefined();
      expect(res.body.data.limit).toBeDefined();
    });
  });

  describe('GET /api/v1/assets/:id', () => {
    it('should return asset detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assets/${rootAssetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(rootAssetId);
    });

    it('should return 404 for non-existent asset', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/assets/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('child asset, move & reorder', () => {
    it('should create a child asset', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/assets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetType: testAssetTypeCode, name: 'Child', parentAssetId: rootAssetId })
        .expect(201);

      expect(res.body.success).toBe(true);
      childAssetId = res.body.data.id;
    });

    it('should move the child up under the root LOCATION node', async () => {
      // Assets are no longer plan-rooted; they hang under the unified tree. Moving
      // "to root" now means re-parenting onto the plan's root LOCATION node (the
      // lazily-created 1:1 node for plan.locationId), not a null parent.
      const rootNode = await prisma.assetNode.findUnique({
        where: { rootLocationId: testLocationId },
        select: { id: true },
      });
      expect(rootNode).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/assets/${childAssetId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newParentId: rootNode!.id })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parentAssetId).toBe(rootNode!.id);
    });

    it('should reorder assets within the plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/assets/reorder`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetIds: [childAssetId, rootAssetId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reordered).toBe(true);
    });
  });

  describe('PATCH /api/v1/assets/:id', () => {
    it('should update statusCode to in_progress', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/assets/${rootAssetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'in_progress' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.statusCode).toBe('in_progress');
    });
  });

  describe('DELETE /api/v1/assets/:id', () => {
    it('should soft-delete an asset and 404 afterwards', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/assets/${rootAssetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/assets/${rootAssetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
