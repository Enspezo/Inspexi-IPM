import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('MeasurementSheetRecords (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testAssetTypeId: string;
  let testNormTypeId: string;
  let testPlanId: string;
  let testAssetId: string;
  let testTemplateId: string;
  let testSectionId: string;
  let testFieldId: string;
  let accessToken: string;
  const createdRecordIds: string[] = [];
  let completedRecordId: string;

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
      data: { name: 'E2E MSR Org', slug: 'e2emsr' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-msr@test.nl',
        passwordHash,
        firstName: 'Sheet',
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
        companyName: 'E2E MSR Contact',
        email: 'e2e-msr-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Org-scoped asset type definition
    const assetType = await prisma.assetTypeDefinition.create({
      data: { orgId: org.id, code: 'e2emsrkast', name: 'Kast', isSystem: false },
    });
    testAssetTypeId = assetType.id;

    // Global norm type definition
    const normType = await prisma.normTypeDefinition.create({
      data: {
        code: 'e2emsrnorm',
        label: 'E2E MSR Norm',
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
        projectName: 'E2E MSR Plan',
        normTypeCode: 'e2emsrnorm',
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Asset under the plan
    const asset = await prisma.asset.create({
      data: {
        orgId: org.id,
        inspectionPlanId: plan.id,
        assetType: 'e2emsrkast',
        name: 'Kast 1',
        createdBy: user.id,
      },
    });
    testAssetId = asset.id;

    // Global measurement sheet template (ACTIEF) + 1 section + 1 required field
    const template = await prisma.measurementSheetTemplate.create({
      data: {
        code: 'E2E-MSR-TPL',
        name: 'E2E Meetstaat Template',
        normTypeCode: 'e2emsrnorm',
        version: '1.0',
        status: 'ACTIEF',
        finalCheckRules: [{ type: 'allFieldsRequired' }],
        createdBy: user.id,
      },
    });
    testTemplateId = template.id;

    const section = await prisma.measurementSheetSection.create({
      data: {
        templateId: template.id,
        code: 'algemeen',
        name: 'Algemeen',
        sortOrder: 0,
      },
    });
    testSectionId = section.id;

    const field = await prisma.measurementSheetField.create({
      data: {
        sectionId: section.id,
        code: 'spanning',
        name: 'Spanning',
        fieldType: 'NUMBER',
        sortOrder: 0,
        isRequired: true,
      },
    });
    testFieldId = field.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-msr@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.measurementSheetRecord.deleteMany({ where: { templateId: testTemplateId } });
      await prisma.measurementSheetField.deleteMany({ where: { id: testFieldId } });
      await prisma.measurementSheetSection.deleteMany({ where: { id: testSectionId } });
      await prisma.measurementSheetTemplate.deleteMany({ where: { id: testTemplateId } });
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

  describe('POST /api/v1/measurement-sheet-records', () => {
    it('should create a record and snapshot the template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-records')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('X-Device-ID', 'device-e2e')
        .send({
          templateId: testTemplateId,
          assetId: testAssetId,
          inspectionPlanId: testPlanId,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('IN_PROGRESS');
      expect(res.body.data.templateVersion).toBe('1.0');
      // snapshot + initialised data
      expect(res.body.data.templateSnapshot.sections[0].code).toBe('algemeen');
      expect(res.body.data.data.algemeen['0'].spanning).toEqual({
        value: null,
        passFail: null,
      });
      expect(res.body.data.deviceId).toBe('device-e2e');
      createdRecordIds.push(res.body.data.id);
      completedRecordId = res.body.data.id;
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-records')
        .send({ templateId: testTemplateId, assetId: testAssetId })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetId: testAssetId })
        .expect(400);
    });
  });

  describe('GET /api/v1/measurement-sheet-records', () => {
    it('should list records (filtered by assetId)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-records?assetId=${testAssetId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /api/v1/measurement-sheet-records/:id', () => {
    it('should return record details incl. snapshot', async () => {
      const id = createdRecordIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.templateSnapshot).toBeDefined();
    });

    it('should return 404 for non-existent record', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/measurement-sheet-records/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/measurement-sheet-records/:id', () => {
    it('should update record data (IN_PROGRESS)', async () => {
      const id = createdRecordIds[0];
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/measurement-sheet-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ data: { algemeen: { '0': { spanning: { value: 230 } } } } })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.algemeen['0'].spanning.value).toBe(230);
      expect(res.body.data.syncedAt).not.toBeNull();
    });
  });

  describe('POST /api/v1/measurement-sheet-records/:id/validate', () => {
    it('should validate the record against the snapshot (valid)', async () => {
      const id = createdRecordIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-records/${id}/validate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
      expect(res.body.data.errors).toHaveLength(0);
    });
  });

  describe('POST /api/v1/measurement-sheet-records/:id/complete', () => {
    it('should complete the record (final-check passes → COMPLETED)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-records/${completedRecordId}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('COMPLETED');
      expect(res.body.data.finalCheckExecuted).toBe(true);
      expect(res.body.data.finalCheckPassed).toBe(true);
      expect(res.body.data.completedAt).not.toBeNull();
    });

    it('should block deletion once completed (only IN_PROGRESS deletable)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/measurement-sheet-records/${completedRecordId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should block updates once completed', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/measurement-sheet-records/${completedRecordId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ data: { algemeen: { '0': { spanning: { value: 240 } } } } })
        .expect(400);
    });
  });

  describe('DELETE /api/v1/measurement-sheet-records/:id', () => {
    it('should hard-delete an IN_PROGRESS record and then return 404', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-records')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ templateId: testTemplateId, assetId: testAssetId })
        .expect(201);

      const id = createRes.body.data.id;

      await request(app.getHttpServer())
        .delete(`/api/v1/measurement-sheet-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-records/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
