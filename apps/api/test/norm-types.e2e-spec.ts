import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Norm Types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testOrgId: string;
  let orgAdminId: string;
  let superuserId: string;
  let orgAdminToken: string;
  let superuserToken: string;

  // norm-types are a global registry — track created codes for teardown
  const createdCodes = ['E2ENORM1', 'E2ENORM2'];

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
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // Create test org
    const org = await prisma.organization.create({
      data: { name: 'E2E NormTypes Org', slug: 'e2enormtypes' },
    });
    testOrgId = org.id;

    // Create ORG_ADMIN (non-superuser → write must be rejected)
    const oa = await prisma.user.create({
      data: {
        email: 'e2e-oa-norm@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    orgAdminId = oa.id;

    // Create SUPERUSER (orgId null → only role allowed to write)
    const su = await prisma.user.create({
      data: {
        email: 'e2e-su-norm@test.nl',
        passwordHash,
        firstName: 'Super',
        lastName: 'User',
        roles: ['SUPERUSER'],
        emailVerifiedAt: new Date(),
      },
    });
    superuserId = su.id;

    // Login both
    const oaLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-oa-norm@test.nl', password: 'TestPass123!' });
    orgAdminToken = oaLogin.body.data.accessToken;

    const suLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-su-norm@test.nl', password: 'TestPass123!' });
    superuserToken = suLogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // norm-types are global → delete by the codes we created (regardless of soft-delete state)
      await prisma.normTypeDefinition.deleteMany({
        where: { code: { in: createdCodes } },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [orgAdminId, superuserId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [orgAdminId, superuserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [orgAdminId, superuserId] } },
      });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  let normTypeId: string;

  describe('POST /api/v1/norm-types', () => {
    it('should create a norm type as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({
          code: 'E2ENORM1',
          label: 'E2E Norm 1',
          description: 'Aangemaakt in E2E test',
          assetTypes: ['verdeler'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe('E2ENORM1');
      expect(res.body.data.createdBy).toBe(superuserId);
      normTypeId = res.body.data.id;
    });

    it('should return 403 for a non-superuser (ORG_ADMIN)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ code: 'E2ENORM2', label: 'E2E Norm 2', assetTypes: [] })
        .expect(403);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .send({ code: 'E2ENORM2', label: 'Nope', assetTypes: [] })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ label: 'No code' })
        .expect(400);
    });

    it('should reject a duplicate code (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ code: 'E2ENORM1', label: 'Dup', assetTypes: [] })
        .expect(409);
    });
  });

  describe('GET /api/v1/norm-types', () => {
    it('should list norm types (readable by ORG_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/norm-types')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = res.body.data.map((t: any) => t.code);
      expect(codes).toContain('E2ENORM1');
    });
  });

  describe('GET /api/v1/norm-types/code/:code', () => {
    it('should return the norm type by code', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/norm-types/code/E2ENORM1')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('E2ENORM1');
    });
  });

  describe('GET /api/v1/norm-types/:id', () => {
    it('should return norm type detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(normTypeId);
    });

    it('should return 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/norm-types/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/norm-types/:id', () => {
    it('should update the norm type as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ label: 'E2E Norm 1 (bijgewerkt)' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.label).toBe('E2E Norm 1 (bijgewerkt)');
    });

    it('should return 403 for ORG_ADMIN', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ label: 'Hack' })
        .expect(403);
    });
  });

  describe('DELETE + restore lifecycle', () => {
    it('should soft-delete the norm type as SUPERUSER', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);

      // soft-deleted → detail returns 404
      await request(app.getHttpServer())
        .get(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(404);
    });

    it('should return 403 on delete for ORG_ADMIN', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });

    it('should restore the norm type as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/norm-types/${normTypeId}/restore`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.deletedAt).toBeNull();
      expect(res.body.data.isActive).toBe(true);

      // restored → detail returns 200 again
      await request(app.getHttpServer())
        .get(`/api/v1/norm-types/${normTypeId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);
    });
  });
});
