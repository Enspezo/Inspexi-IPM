import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('InspectionLocations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testNormCode: string;
  let testLocationTypeCode: string;
  let testCrmLocationId: string;
  let testPlanId: string;
  let accessToken: string;
  let rootLocationId: string;
  let childLocationId: string;

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
      data: { name: 'E2E Locations Org', slug: 'e2elocations' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-locations@test.nl',
        passwordHash,
        firstName: 'Location',
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
        companyName: 'E2E Locations Contact',
        email: 'e2e-locations-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // CRM-Locatie = hoofdlocatie / boom-wortel van de AssetNode-boom. De compat
    // inspection-locations-endpoints hangen nieuwe locaties onder de (lazily
    // aangemaakte) wortel-LOCATION-node van plan.locationId.
    const crmLocation = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E Locations CRM-Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    testCrmLocationId = crmLocation.id;

    // Global norm-type definition
    testNormCode = 'e2enormloc';
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
        locationId: crmLocation.id,
        projectName: 'E2E Locations Plan',
        normTypeCode: testNormCode,
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Org location-type definition (no constraints → any parent allowed)
    testLocationTypeCode = 'e2egebouw';
    await prisma.locationTypeDefinition.create({
      data: {
        orgId: org.id,
        code: testLocationTypeCode,
        name: 'Gebouw',
        isSystem: false,
      },
    });

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-locations@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // Children first, then the rest in FK order. AssetNode.parentId is SET NULL,
      // so a single deleteMany clears the whole LOCATION tree (incl. the root node).
      await prisma.assetNode.deleteMany({ where: { orgId: testOrgId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: testNormCode } });
      await prisma.locationTypeDefinition.deleteMany({
        where: { orgId: testOrgId, code: testLocationTypeCode },
      });
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

  describe('POST /api/v1/inspection-plans/:planId/locations', () => {
    it('should create a location under a plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/locations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ locationType: testLocationTypeCode, name: 'G1' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      rootLocationId = res.body.data.id;
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/locations`)
        .send({ locationType: testLocationTypeCode, name: 'NoAuth' })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/locations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No type' })
        .expect(400);
    });
  });

  describe('GET /api/v1/inspection-plans/:planId/locations', () => {
    it('should list locations for a plan (tree)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${testPlanId}/locations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/inspection-plans/:planId/locations/tree', () => {
    it('should return the hierarchical tree', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${testPlanId}/locations/tree`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });

  describe('GET /api/v1/inspection-plans/:planId/locations/count', () => {
    it('should return the location count', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${testPlanId}/locations/count`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.count).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/locations/:id', () => {
    it('should return location detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/locations/${rootLocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(rootLocationId);
    });

    it('should return 404 for non-existent location', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/locations/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('child location, move & reorder', () => {
    it('should create a child location', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/locations`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ locationType: testLocationTypeCode, name: 'Child', parentLocationId: rootLocationId })
        .expect(201);

      expect(res.body.success).toBe(true);
      childLocationId = res.body.data.id;
    });

    it('should move the child up under the root LOCATION node', async () => {
      // Locations live in the unified tree; moving "to root" now means re-parenting
      // onto the plan's root LOCATION node (the 1:1 node for plan.locationId), not
      // a null parent (a LOCATION must always hang under another LOCATION).
      const rootNode = await prisma.assetNode.findUnique({
        where: { rootLocationId: testCrmLocationId },
        select: { id: true },
      });
      expect(rootNode).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/locations/${childLocationId}/move`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ newParentId: rootNode!.id })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parentLocationId).toBe(rootNode!.id);
    });

    it('should reorder locations within the plan', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${testPlanId}/locations/reorder`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ locationIds: [childLocationId, rootLocationId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reordered).toBe(true);
    });
  });

  describe('PATCH /api/v1/locations/:id', () => {
    it('should update the location name', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/locations/${rootLocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'G1 bijgewerkt' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(rootLocationId);
    });
  });

  describe('DELETE /api/v1/locations/:id', () => {
    it('should soft-delete a location and 404 afterwards', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/locations/${rootLocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/locations/${rootLocationId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
