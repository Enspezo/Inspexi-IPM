import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('MeasurementRecords (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testAssetTypeId: string;
  let testNormTypeId: string;
  let testPlanId: string;
  let testAssetId: string;
  let accessToken: string;
  const createdRecordIds: string[] = [];

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
      data: { name: 'E2E Measurements Org', slug: 'e2emeasurements' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-measurements@test.nl',
        passwordHash,
        firstName: 'Measurement',
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
        companyName: 'E2E Measurements Contact',
        email: 'e2e-measurements-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Org-scoped asset type definition
    const assetType = await prisma.assetTypeDefinition.create({
      data: {
        orgId: org.id,
        code: 'e2emeaskast',
        name: 'Kast',
        isSystem: false,
      },
    });
    testAssetTypeId = assetType.id;

    // Global norm type definition referenced by the plan
    const normType = await prisma.normTypeDefinition.create({
      data: {
        code: 'e2emeasnorm',
        label: 'E2E Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });
    testNormTypeId = normType.id;

    // Inspection plan
    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        projectName: 'E2E Measurements Plan',
        normTypeCode: 'e2emeasnorm',
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Asset under the plan
    const asset = await prisma.asset.create({
      data: {
        orgId: org.id,
        inspectionPlanId: plan.id,
        assetType: 'e2emeaskast',
        name: 'Kast 1',
        createdBy: user.id,
      },
    });
    testAssetId = asset.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-measurements@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.measurementRecord.deleteMany({ where: { id: { in: createdRecordIds } } });
      await prisma.asset.deleteMany({ where: { id: testAssetId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { id: testNormTypeId } });
      await prisma.assetTypeDefinition.deleteMany({ where: { id: testAssetTypeId } });
      await prisma.contact.deleteMany({ where: { id: testContactId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/assets/:assetId/measurement-records', () => {
    it('should create a measurement record on the asset (status not_started)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/measurement-records`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ instrumentType: 'Megger MIT430', calibrationDate: '2026-01-15' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('not_started');
      createdRecordIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/measurement-records`)
        .send({ instrumentType: 'X' })
        .expect(401);
    });

    it('should return 404 for an asset in another org (cross-tenant)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/assets/00000000-0000-0000-0000-000000000000/measurement-records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ instrumentType: 'X' })
        .expect(404);
    });
  });

  describe('GET /api/v1/assets/:assetId/measurement-records', () => {
    it('should list measurement records for the asset', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/assets/${testAssetId}/measurement-records`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/measurement-records/:id', () => {
    it('should return measurement record details (incl. findings)', async () => {
      const id = createdRecordIds[0];
      if (!id) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.asset).toBeDefined();
      expect(Array.isArray(res.body.data.findings)).toBe(true);
    });

    it('should return 404 for a non-existent record', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/measurement-records/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/measurement-records/:id/start', () => {
    it('should start the record (status in_progress) and set inspectorId', async () => {
      const id = createdRecordIds[0];
      if (!id) return;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-records/${id}/start`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('in_progress');
      expect(res.body.data.startedAt).not.toBeNull();
      expect(res.body.data.inspectorId).toBe(testUserId);
    });
  });

  describe('PATCH /api/v1/measurement-records/:id', () => {
    it('should update measurements', async () => {
      const id = createdRecordIds[0];
      if (!id) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/measurement-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ measurements: [{ label: 'Riso', value: 1.2 }] })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.measurements).toEqual([{ label: 'Riso', value: 1.2 }]);
    });

    it('should return 400 for an invalid status enum value', async () => {
      const id = createdRecordIds[0];
      if (!id) return;

      await request(app.getHttpServer())
        .patch(`/api/v1/measurement-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ status: 'definitely-not-a-status' })
        .expect(400);
    });
  });

  describe('POST /api/v1/measurement-records/:id/complete', () => {
    it('should complete the record (status completed)', async () => {
      const id = createdRecordIds[0];
      if (!id) return;

      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-records/${id}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('completed');
      expect(res.body.data.completedAt).not.toBeNull();
    });
  });

  describe('DELETE /api/v1/measurement-records/:id', () => {
    it('should hard-delete a record and then return 404', async () => {
      const createRes = await request(app.getHttpServer())
        .post(`/api/v1/assets/${testAssetId}/measurement-records`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ instrumentType: 'To delete' })
        .expect(201);

      const id = createRes.body.data.id;
      createdRecordIds.push(id);

      await request(app.getHttpServer())
        .delete(`/api/v1/measurement-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/measurement-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
