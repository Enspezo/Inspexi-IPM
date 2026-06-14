import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Finding Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let categoryId: string;
  let classificationModelId: string;
  let systemTemplateId: string;
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

    // Create test org
    const org = await prisma.organization.create({
      data: { name: 'E2E FindingTemplates Org', slug: 'e2efindingtemplates' },
    });
    testOrgId = org.id;

    // Create test user (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-finding-templates@test.nl',
        passwordHash,
        firstName: 'Finding',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create a classification model (global) with one characteristic + option
    const model = await prisma.classificationModel.create({
      data: {
        code: 'E2E-FT-MODEL',
        name: 'E2E FT Model',
        createdBy: user.id,
        characteristics: {
          create: [
            {
              code: 'severity',
              name: 'Ernst',
              sortOrder: 0,
              options: {
                create: [
                  { code: 'high', name: 'Hoog', color: '#EF4444', sortOrder: 0 },
                  { code: 'low', name: 'Laag', color: '#22C55E', sortOrder: 1 },
                ],
              },
            },
          ],
        },
      },
    });
    classificationModelId = model.id;

    // Create an org category (satisfies categoryId FK)
    const category = await prisma.category.create({
      data: {
        orgId: org.id,
        isSystem: false,
        name: 'E2E Elektra',
        createdBy: user.id,
      },
    });
    categoryId = category.id;

    // Create ONE system finding-template (orgId null) to test /duplicate
    const systemTemplate = await prisma.findingTemplate.create({
      data: {
        orgId: null,
        isSystem: true,
        code: 'e2esysft',
        shortDescription: 'E2E System Finding Template',
        classificationModelId: model.id,
        defaultClassification: { severity: 'high' },
        createdBy: user.id,
      },
    });
    systemTemplateId = systemTemplate.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-finding-templates@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-safe order: templates → category → classification model → audit logs → tokens → user → org
      await prisma.findingTemplate.deleteMany({ where: { orgId: testOrgId } });
      await prisma.findingTemplate.deleteMany({ where: { id: systemTemplateId } });
      await prisma.category.deleteMany({ where: { id: categoryId } });
      await prisma.classificationModel.deleteMany({ where: { id: classificationModelId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/finding-templates', () => {
    it('should create an org finding-template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/finding-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'e2eft1',
          categoryId,
          shortDescription: 'E2E Kabel beschadigd',
          classificationModelId,
          defaultClassification: { severity: 'high' },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe('e2eft1');
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      createdTemplateIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/finding-templates')
        .send({ shortDescription: 'Nope', classificationModelId, defaultClassification: {} })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/finding-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shortDescription: 'No model' })
        .expect(400);
    });

    it('should return 400 for an invalid classification model', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/finding-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          shortDescription: 'Bad model',
          classificationModelId: '00000000-0000-0000-0000-000000000000',
          defaultClassification: {},
        })
        .expect(404);
    });
  });

  describe('GET /api/v1/finding-templates', () => {
    it('should list templates including the created one and the system one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finding-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = res.body.data.map((t: any) => t.code);
      expect(codes).toContain('e2eft1');
      expect(codes).toContain('e2esysft');
    });
  });

  describe('GET /api/v1/finding-templates/categories', () => {
    it('should return categories used by templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finding-templates/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const names = res.body.data.map((c: any) => c.name);
      expect(names).toContain('E2E Elektra');
    });
  });

  describe('GET /api/v1/finding-templates/export', () => {
    it('should export org templates as JSON', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/finding-templates/export')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.exportVersion).toBe('1.0');
      expect(Array.isArray(res.body.data.findingTemplates)).toBe(true);
      const codes = res.body.data.findingTemplates.map((t: any) => t.code);
      expect(codes).toContain('e2eft1');
    });
  });

  describe('POST /api/v1/finding-templates/import', () => {
    it('should import a template from JSON', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/finding-templates/import')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          exportVersion: '1.0',
          findingTemplates: [
            {
              code: 'e2eimported',
              category: 'E2E Elektra',
              shortDescription: 'E2E Geïmporteerd',
              classificationModelCode: 'E2E-FT-MODEL',
              defaultClassification: { severity: 'low' },
            },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.imported).toBe(1);
      expect(res.body.data.skipped).toBe(0);
    });
  });

  describe('GET /api/v1/finding-templates/:id', () => {
    it('should return template detail', async () => {
      const id = createdTemplateIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/finding-templates/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(res.body.data.classificationModel).toBeDefined();
    });

    it('should return 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/finding-templates/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/finding-templates/:id/duplicate', () => {
    it('should duplicate the system template into the org', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/finding-templates/${systemTemplateId}/duplicate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('e2esysft-COPY');
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      createdTemplateIds.push(res.body.data.id);
    });
  });

  describe('PATCH /api/v1/finding-templates/:id', () => {
    it('should update the org template', async () => {
      const id = createdTemplateIds[0];
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/finding-templates/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ shortDescription: 'E2E Kabel beschadigd (bijgewerkt)' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.shortDescription).toBe('E2E Kabel beschadigd (bijgewerkt)');
    });
  });

  describe('DELETE /api/v1/finding-templates/:id', () => {
    it('should soft-delete (deactivate) the org template', async () => {
      const id = createdTemplateIds[0];
      await request(app.getHttpServer())
        .delete(`/api/v1/finding-templates/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Soft-delete = isActive false; default list (active only) should no longer contain it
      const res = await request(app.getHttpServer())
        .get('/api/v1/finding-templates')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const ids = res.body.data.map((t: any) => t.id);
      expect(ids).not.toContain(id);
    });
  });
});
