import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Inspection Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let normTypeCode: string;
  let classificationModelId: string;
  let systemTemplateId: string; // seeded as SUPERUSER-owned (orgId null) → forkable
  let checklistId: string;
  let measurementSheetId: string;
  let accessToken: string;

  // Created during the run; tracked for FK-safe teardown
  const createdTemplateIds: string[] = [];

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

    // Org + ORG_ADMIN user
    const org = await prisma.organization.create({
      data: { name: 'E2E InspTemplates Org', slug: 'e2einsptemplates' },
    });
    testOrgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-inspection-templates@test.nl',
        passwordHash,
        firstName: 'Template',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Classification model (global) + norm type definition
    const cm = await prisma.classificationModel.create({
      data: { code: 'E2ECM', name: 'E2E Classificatiemodel', createdBy: user.id },
    });
    classificationModelId = cm.id;

    const norm = await prisma.normTypeDefinition.create({
      data: { code: 'E2ENORM', label: 'E2E Norm', createdBy: user.id },
    });
    normTypeCode = norm.code;

    // A SUPERUSER-owned (system) template to fork
    const sysTemplate = await prisma.inspectionTemplate.create({
      data: {
        orgId: null,
        isSystem: true,
        code: 'E2ESYS',
        name: 'E2E System Template',
        normTypeCode,
        classificationModelId,
        createdBy: user.id,
      },
    });
    systemTemplateId = sysTemplate.id;

    // A checklist (org-scoped) + a global measurement sheet template to test links
    const checklist = await prisma.checklist.create({
      data: {
        orgId: testOrgId,
        code: 'E2ECL',
        name: 'E2E Checklist',
        normTypeCode,
        createdBy: user.id,
      },
    });
    checklistId = checklist.id;

    const sheet = await prisma.measurementSheetTemplate.create({
      data: {
        code: 'E2EMS',
        name: 'E2E Meetstaat',
        normTypeCode,
        createdBy: user.id,
      },
    });
    measurementSheetId = sheet.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-inspection-templates@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      const templateIds = [...createdTemplateIds, systemTemplateId];
      // FK-safe order: version history → links → templates → checklist → sheet → cm → norm → audit → tokens → user → org
      await prisma.inspectionTemplateVersionHistory.deleteMany({
        where: { inspectionTemplateId: { in: templateIds } },
      });
      await prisma.inspectionTemplateChecklistLink.deleteMany({
        where: { inspectionTemplateId: { in: templateIds } },
      });
      await prisma.inspectionTemplateMeasurementSheetLink.deleteMany({
        where: { inspectionTemplateId: { in: templateIds } },
      });
      // Delete forks/versions (children referencing others) before parents
      await prisma.inspectionTemplate.deleteMany({
        where: { id: { in: templateIds }, forkedFromId: { not: null } },
      });
      await prisma.inspectionTemplate.deleteMany({
        where: { id: { in: templateIds }, previousVersionId: { not: null } },
      });
      await prisma.inspectionTemplate.deleteMany({ where: { id: { in: templateIds } } });
      await prisma.checklist.deleteMany({ where: { id: checklistId } });
      await prisma.measurementSheetTemplate.deleteMany({ where: { id: measurementSheetId } });
      await prisma.classificationModel.deleteMany({ where: { id: classificationModelId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: normTypeCode } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/inspection-templates', () => {
    it('should create an org template (CONCEPT)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'E2EORG',
          name: 'E2E Org Template',
          description: 'Aangemaakt in E2E test',
          normTypeCode,
          classificationModelId,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe('E2EORG');
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      expect(res.body.data.status).toBe('CONCEPT');
      createdTemplateIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .send({ code: 'nope', name: 'Nope' })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No code' })
        .expect(400);
    });

    it('should return 400 for an unknown norm type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'E2EBADNORM',
          name: 'Bad Norm',
          normTypeCode: 'DOES-NOT-EXIST',
          classificationModelId,
        })
        .expect(400);
    });
  });

  describe('GET /api/v1/inspection-templates', () => {
    it('should list templates including the org one and the system one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = res.body.data.map((t: any) => t.code);
      expect(codes).toContain('E2EORG');
      expect(codes).toContain('E2ESYS');
    });
  });

  describe('GET /api/v1/inspection-templates/:id', () => {
    it('should return template detail with link arrays', async () => {
      const id = createdTemplateIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(Array.isArray(res.body.data.checklistLinks)).toBe(true);
      expect(Array.isArray(res.body.data.measurementSheetLinks)).toBe(true);
    });

    it('should return 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inspection-templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('checklist + measurement-sheet links', () => {
    it('should link a checklist', async () => {
      const id = createdTemplateIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${id}/checklists`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ checklistId, assetTypes: ['verdeler'], sortOrder: 0 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.checklistId).toBe(checklistId);
    });

    it('should list linked checklists', async () => {
      const id = createdTemplateIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${id}/checklists`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data).toHaveLength(1);
    });

    it('should link a measurement sheet', async () => {
      const id = createdTemplateIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${id}/measurement-sheets`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ measurementSheetTemplateId: measurementSheetId, assetTypes: [], sortOrder: 0 })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.measurementSheetTemplateId).toBe(measurementSheetId);
    });
  });

  describe('version lifecycle: publish → retire → new-version', () => {
    let liveTemplateId: string;

    it('should publish the org template (CONCEPT → ACTIEF)', async () => {
      const id = createdTemplateIds[0];
      liveTemplateId = id;
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${id}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ changeDescription: 'Eerste publicatie' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIEF');
    });

    it('should reject editing an ACTIEF template', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-templates/${liveTemplateId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Mag niet' })
        .expect(400);
    });

    it('should expose version history', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${liveTemplateId}/history`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('should create a new version (clone to CONCEPT)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${liveTemplateId}/new-version`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ changeDescription: 'Nieuwe versie' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONCEPT');
      expect(res.body.data.version).toBe('1.0.1');
      createdTemplateIds.push(res.body.data.id);
    });

    it('should retire the ACTIEF template (ACTIEF → VERVALLEN)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${liveTemplateId}/retire`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'Norm vervangen' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('VERVALLEN');
    });
  });

  describe('POST /api/v1/inspection-templates/:id/fork', () => {
    it('should fork the system template into the org as CONCEPT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${systemTemplateId}/fork`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      expect(res.body.data.status).toBe('CONCEPT');
      expect(res.body.data.forkedFromId).toBe(systemTemplateId);
      createdTemplateIds.push(res.body.data.id);
    });

    it('should reject forking an org (non-system) template', async () => {
      const forkId = createdTemplateIds[createdTemplateIds.length - 1];
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-templates/${forkId}/fork`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });

    it('should block editing the system template (org-admin → 403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-templates/${systemTemplateId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Hack' })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/inspection-templates/:id', () => {
    it('should delete a CONCEPT template', async () => {
      // Create a throwaway CONCEPT template to delete
      const created = await request(app.getHttpServer())
        .post('/api/v1/inspection-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'E2EDEL',
          name: 'E2E Delete Me',
          normTypeCode,
          classificationModelId,
        })
        .expect(201);
      const id = created.body.data.id;
      createdTemplateIds.push(id);

      await request(app.getHttpServer())
        .delete(`/api/v1/inspection-templates/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
