import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Classification Models (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let superUserId: string;
  let orgAdminId: string;
  let testOrgId: string;
  let superToken: string;
  let orgAdminToken: string;

  // Created during the run; tracked for FK-safe teardown
  const createdModelIds: string[] = [];

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

    // Org (for the ORG_ADMIN that must be forbidden from writing)
    const org = await prisma.organization.create({
      data: { name: 'E2E ClassModels Org', slug: 'e2eclassmodels' },
    });
    testOrgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // SUPERUSER (orgId null) — may write the global registry
    const superUser = await prisma.user.create({
      data: {
        email: 'e2e-classmodels-super@test.nl',
        passwordHash,
        firstName: 'Class',
        lastName: 'Super',
        roles: ['SUPERUSER'],
        orgId: null,
        emailVerifiedAt: new Date(),
      },
    });
    superUserId = superUser.id;

    // ORG_ADMIN — may read but NOT write
    const orgAdmin = await prisma.user.create({
      data: {
        email: 'e2e-classmodels-admin@test.nl',
        passwordHash,
        firstName: 'Class',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    orgAdminId = orgAdmin.id;

    const superLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-classmodels-super@test.nl', password: 'TestPass123!' });
    superToken = superLogin.body.data.accessToken;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-classmodels-admin@test.nl', password: 'TestPass123!' });
    orgAdminToken = adminLogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-safe order: options → characteristics → models → audit logs → tokens → users → org
      for (const modelId of createdModelIds) {
        await prisma.classificationOption.deleteMany({
          where: { characteristic: { classificationModelId: modelId } },
        });
        await prisma.classificationCharacteristic.deleteMany({
          where: { classificationModelId: modelId },
        });
      }
      await prisma.classificationModel.deleteMany({
        where: { id: { in: createdModelIds } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [superUserId, orgAdminId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [superUserId, orgAdminId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [superUserId, orgAdminId] } },
      });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/classification-models', () => {
    it('should create a model with nested characteristics + options (SUPERUSER)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/classification-models')
        .set('Authorization', `Bearer ${superToken}`)
        .send({
          code: 'E2E_AFKEUR',
          name: 'E2E Afkeurmodel',
          description: 'Aangemaakt in E2E test',
          characteristics: [
            {
              code: 'STATUS',
              name: 'Status',
              options: [
                { code: 'GOEDGEKEURD', name: 'Goedgekeurd', color: '#16A34A' },
                { code: 'AFGEKEURD', name: 'Afgekeurd', color: '#DC2626' },
              ],
            },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe('E2E_AFKEUR');
      expect(res.body.data.characteristics).toHaveLength(1);
      expect(res.body.data.characteristics[0].options).toHaveLength(2);
      createdModelIds.push(res.body.data.id);
    });

    it('should return 403 for an ORG_ADMIN (write is SUPERUSER-only)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/classification-models')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ code: 'E2E_NOPE', name: 'Nope', characteristics: [] })
        .expect(403);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/classification-models')
        .send({ code: 'E2E_NOAUTH', name: 'Nope', characteristics: [] })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/classification-models')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'No code or characteristics' })
        .expect(400);
    });
  });

  describe('GET /api/v1/classification-models', () => {
    it('should list active models (readable by ORG_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/classification-models')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = res.body.data.map((m: any) => m.code);
      expect(codes).toContain('E2E_AFKEUR');
    });
  });

  describe('GET /api/v1/classification-models/admin', () => {
    it('should list all models for SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/classification-models/admin')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('should return 403 for an ORG_ADMIN', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/classification-models/admin')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/classification-models/:id', () => {
    it('should return model detail with characteristics + options', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/classification-models/${id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(Array.isArray(res.body.data.characteristics)).toBe(true);
    });

    it('should return 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/classification-models/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/classification-models/code/:code', () => {
    it('should return the model by code', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/classification-models/code/E2E_AFKEUR')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('E2E_AFKEUR');
    });
  });

  describe('Characteristics + options walk', () => {
    let charAId: string;
    let charBId: string;
    let optionAId: string;
    let optionBId: string;

    it('should add a characteristic to the model', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ code: 'ERNST', name: 'Ernst' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('ERNST');
      charAId = res.body.data.id;
    });

    it('should add a second characteristic', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ code: 'CATEGORIE', name: 'Categorie' })
        .expect(201);

      expect(res.body.success).toBe(true);
      charBId = res.body.data.id;
    });

    it('should reorder characteristics', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics/reorder`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ characteristicIds: [charBId, charAId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      // Response is the full model; the reordered new chars should be present.
      const chars = res.body.data.characteristics.filter((c: any) =>
        [charAId, charBId].includes(c.id),
      );
      const byId = new Map(chars.map((c: any) => [c.id, c.sortOrder]));
      expect(byId.get(charBId)).toBeLessThan(byId.get(charAId) as number);
    });

    it('should add an option to a characteristic', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics/${charAId}/options`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ code: 'LAAG', name: 'Laag', color: '#16A34A' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('LAAG');
      optionAId = res.body.data.id;
    });

    it('should add a second option', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics/${charAId}/options`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ code: 'HOOG', name: 'Hoog', color: '#DC2626' })
        .expect(201);

      expect(res.body.success).toBe(true);
      optionBId = res.body.data.id;
    });

    it('should reorder options', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/classification-models/${id}/characteristics/${charAId}/options/reorder`,
        )
        .set('Authorization', `Bearer ${superToken}`)
        .send({ optionIds: [optionBId, optionAId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      const ordered = res.body.data.options.map((o: any) => o.id);
      expect(ordered).toEqual([optionBId, optionAId]);
    });

    it('should reject a duplicate option code (409)', async () => {
      const id = createdModelIds[0];
      await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics/${charAId}/options`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ code: 'HOOG', name: 'Dup', color: '#DC2626' })
        .expect(409);
    });

    it('should return 403 when an ORG_ADMIN tries to add a characteristic', async () => {
      const id = createdModelIds[0];
      await request(app.getHttpServer())
        .post(`/api/v1/classification-models/${id}/characteristics`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ code: 'HACK', name: 'Hack' })
        .expect(403);
    });
  });

  describe('PATCH /api/v1/classification-models/:id', () => {
    it('should update the model (SUPERUSER)', async () => {
      const id = createdModelIds[0];
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/classification-models/${id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .send({ name: 'E2E Afkeurmodel (bijgewerkt)' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Afkeurmodel (bijgewerkt)');
    });
  });

  describe('DELETE /api/v1/classification-models/:id', () => {
    it('should soft-delete the model (no longer in active list)', async () => {
      const id = createdModelIds[0];
      await request(app.getHttpServer())
        .delete(`/api/v1/classification-models/${id}`)
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/api/v1/classification-models')
        .set('Authorization', `Bearer ${superToken}`)
        .expect(200);

      const codes = res.body.data.map((m: any) => m.code);
      expect(codes).not.toContain('E2E_AFKEUR');
    });
  });
});
