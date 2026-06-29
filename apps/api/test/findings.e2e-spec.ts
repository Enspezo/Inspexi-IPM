import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Findings (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testAssetTypeId: string;
  let testNormTypeId: string;
  let testLocationId: string;
  let testPlanId: string;
  let testAssetId: string;
  let accessToken: string;
  const createdFindingIds: string[] = [];

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
      data: { name: 'E2E Findings Org', slug: 'e2efindings' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-findings@test.nl',
        passwordHash,
        firstName: 'Finding',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Contact
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Findings Contact',
        email: 'e2e-findings-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Org-scoped asset type definition (no constraints → assets can be created freely)
    const assetType = await prisma.assetTypeDefinition.create({
      data: {
        orgId: org.id,
        code: 'e2ekast',
        name: 'Kast',
        isSystem: false,
      },
    });
    testAssetTypeId = assetType.id;

    // Global norm type definition referenced by the plan
    const normType = await prisma.normTypeDefinition.create({
      data: {
        code: 'e2enorm',
        label: 'E2E Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });
    testNormTypeId = normType.id;

    // CRM-Locatie = hoofdlocatie / boom-wortel van de AssetNode-boom. Het plan
    // verwijst hiernaar via locationId; finding-create valideert dat de asset-node
    // binnen de boom van plan.locationId zit (assertNodeInPlanTree).
    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E Findings Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    testLocationId = location.id;

    // Inspection plan (met hoofdlocatie zodat de boom-wortel kan ontstaan)
    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: location.id,
        projectName: 'E2E Findings Plan',
        normTypeCode: 'e2enorm',
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Wortel-LOCATION-node (1:1 aan de CRM-Locatie). Parent vóór child invoegen zodat
    // de DB-trigger path/depth invult.
    const rootNode = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'LOCATION',
        rootLocationId: location.id,
        typeCode: 'locatie',
        name: 'Wortel',
        createdBy: user.id,
      },
    });

    // ASSET-node onder de wortel — vervangt de oude "asset id".
    const asset = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'ASSET',
        parentId: rootNode.id,
        typeCode: 'e2ekast',
        name: 'Asset',
        createdBy: user.id,
      },
    });
    testAssetId = asset.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-findings@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.finding.deleteMany({ where: { id: { in: createdFindingIds } } });
      // AssetNode.parentId is SET NULL, dus één deleteMany ruimt de hele boom op
      // (wortel-LOCATION + asset). Findings RESTRICT'en niet (al verwijderd hierboven).
      await prisma.assetNode.deleteMany({ where: { orgId: testOrgId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { id: testNormTypeId } });
      await prisma.assetTypeDefinition.deleteMany({ where: { id: testAssetTypeId } });
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

  describe('POST /api/v1/assets/:assetId/findings', () => {
    it('should create a finding on the asset', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/findings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ inspectionPlanId: testPlanId, inspectionType: 'visual', shortDescription: 'Test' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.statusCode).toBe('open');
      createdFindingIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/findings`)
        .send({ inspectionPlanId: testPlanId, inspectionType: 'visual', shortDescription: 'Test' })
        .expect(401);
    });

    it('should return 400 when inspectionPlanId is missing', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/findings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ inspectionType: 'visual', shortDescription: 'No plan' })
        .expect(400);
    });
  });

  describe('GET /api/v1/assets/:assetId/findings', () => {
    it('should list findings for the asset', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assets/${testAssetId}/findings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/findings/:id', () => {
    it('should return finding details', async () => {
      const id = createdFindingIds[0];
      if (!id) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/findings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.assetNode).toBeDefined();
    });

    it('should return 404 for non-existent finding', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/findings/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/findings/:id', () => {
    it('should update a finding to resolved and set resolvedAt', async () => {
      const id = createdFindingIds[0];
      if (!id) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/findings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'resolved', resolutionNotes: 'Fixed' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.statusCode).toBe('resolved');
      expect(res.body.data.resolvedAt).not.toBeNull();
    });

    it('should return 400 for an unknown statusCode', async () => {
      const id = createdFindingIds[0];
      if (!id) return;

      await request(app.getHttpServer())
        .patch(`/api/v1/findings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'definitely-not-a-status' })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/findings/:id', () => {
    it('should soft-delete a finding and then return 404', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/findings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ inspectionPlanId: testPlanId, inspectionType: 'visual', shortDescription: 'To delete' })
        .expect(201);

      const id = createRes.body.data.id;
      createdFindingIds.push(id);

      await request(app.getHttpServer())
        .delete(`/api/v1/findings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/findings/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
