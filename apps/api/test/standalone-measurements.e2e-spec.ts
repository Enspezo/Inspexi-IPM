import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Standalone Measurements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testNormCode: string;
  let testPlanId: string;
  let testCrmLocationId: string;
  let testLocationNodeId: string;
  let testAssetNodeId: string;
  let accessToken: string;
  let measurementId: string;

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
      data: { name: 'E2E SM Org', slug: 'e2esm' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-sm@test.nl',
        passwordHash,
        firstName: 'Meting',
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
        companyName: 'E2E SM Contact',
        email: 'e2e-sm-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Global norm-type definition
    testNormCode = 'e2esmnorm';
    await prisma.normTypeDefinition.create({
      data: {
        code: testNormCode,
        label: 'E2E SM Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });

    // CRM-Locatie = hoofdlocatie / boom-wortel van de AssetNode-boom. De plan
    // krijgt locationId zodat de standalone-create de LOCATION-node binnen de boom
    // van plan.locationId kan valideren.
    const crmLocation = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E SM Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    testCrmLocationId = crmLocation.id;

    // Inspection plan (met hoofdlocatie zodat de boom-wortel kan ontstaan)
    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: crmLocation.id,
        projectName: 'E2E SM Plan',
        normTypeCode: testNormCode,
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Wortel-LOCATION-node (1:1 met de CRM-locatie) — doel voor de meting.
    // PARENT VOOR CHILD: eerst de wortel, dan de asset-node eronder.
    const rootNode = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'LOCATION',
        rootLocationId: crmLocation.id,
        typeCode: 'locatie',
        name: 'Wortel',
        createdBy: user.id,
      },
    });
    testLocationNodeId = rootNode.id;

    // ASSET-node onder de wortel — doel voor link-asset.
    const assetNode = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'ASSET',
        parentId: rootNode.id,
        typeCode: 'kast',
        name: 'Asset',
        createdBy: user.id,
      },
    });
    testAssetNodeId = assetNode.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-sm@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // Children first, then the rest in FK order. StandaloneMeasurement RESTRICTs
      // op de node-FK, dus die moet weg vóór assetNode. AssetNode.parentId is SET
      // NULL, dus één deleteMany ruimt de hele boom (wortel + asset) op.
      await prisma.standaloneMeasurementValue.deleteMany({
        where: { standaloneMeasurement: { inspectionPlanId: testPlanId } },
      });
      await prisma.standaloneMeasurement.deleteMany({ where: { inspectionPlanId: testPlanId } });
      await prisma.assetNode.deleteMany({ where: { orgId: testOrgId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: testNormCode } });
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

  describe('POST /api/v1/inspection-plans/:planId/standalone-measurements', () => {
    it('should create a measurement under a plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/standalone-measurements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ locationId: testLocationNodeId, measurementType: 'isolatiemeting' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      measurementId = res.body.data.id;
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/standalone-measurements`)
        .send({ locationId: testLocationNodeId, measurementType: 'isolatiemeting' })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/standalone-measurements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ measurementType: 'no-location' })
        .expect(400);
    });
  });

  describe('GET /api/v1/inspection-plans/:planId/standalone-measurements', () => {
    it('should list measurements for a plan', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${testPlanId}/standalone-measurements`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should filter by locationId (LOCATION-node)', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/inspection-plans/${testPlanId}/standalone-measurements?locationId=${testLocationNodeId}`,
        )
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.every((m: any) => m.locationNodeId === testLocationNodeId)).toBe(true);
    });
  });

  describe('GET /api/v1/standalone-measurements/:id', () => {
    it('should return measurement detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/standalone-measurements/${measurementId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(measurementId);
    });

    it('should return 404 for non-existent measurement', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/standalone-measurements/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/standalone-measurements/:id/values', () => {
    it('should add a value to the measurement', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/standalone-measurements/${measurementId}/values`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fieldName: 'isolatieweerstand', fieldType: 'number', value: '500', unit: 'MOhm' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.fieldName).toBe('isolatieweerstand');
    });
  });

  describe('POST /api/v1/standalone-measurements/:id/link-asset', () => {
    it('should link an asset to the measurement', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/standalone-measurements/${measurementId}/link-asset`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetId: testAssetNodeId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.linkedAssetNodeId).toBe(testAssetNodeId);
    });
  });

  describe('PATCH /api/v1/standalone-measurements/:id', () => {
    it('should update the measurementType', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/standalone-measurements/${measurementId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ measurementType: 'continuiteitsmeting' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.measurementType).toBe('continuiteitsmeting');
    });
  });

  describe('DELETE /api/v1/standalone-measurements/:id', () => {
    it('should soft-delete a measurement and 404 afterwards', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/standalone-measurements/${measurementId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/standalone-measurements/${measurementId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
