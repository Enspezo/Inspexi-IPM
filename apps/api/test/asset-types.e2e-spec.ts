import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Asset Types (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let systemTypeId: string;
  let accessToken: string;

  // Created during the run; tracked for FK-safe teardown
  const createdAssetTypeIds: string[] = [];

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
      data: { name: 'E2E AssetTypes Org', slug: 'e2eassettypes' },
    });
    testOrgId = org.id;

    // Create test user (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-asset-types@test.nl',
        passwordHash,
        firstName: 'Asset',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create ONE system asset-type (orgId null) to test /duplicate
    const systemType = await prisma.assetTypeDefinition.create({
      data: {
        orgId: null,
        isSystem: true,
        code: 'e2esys',
        name: 'E2E System Type',
      },
    });
    systemTypeId = systemType.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-asset-types@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-safe order: constraints → fields → definitions → audit logs → tokens → user → org
      await prisma.assetTypeConstraint.deleteMany({
        where: { assetTypeDefinition: { orgId: testOrgId } },
      });
      await prisma.assetTypeConstraint.deleteMany({
        where: { assetTypeDefinitionId: systemTypeId },
      });
      await prisma.assetTypeField.deleteMany({
        where: { assetTypeDefinition: { orgId: testOrgId } },
      });
      await prisma.assetTypeField.deleteMany({
        where: { assetTypeDefinitionId: systemTypeId },
      });
      await prisma.assetTypeDefinition.deleteMany({ where: { orgId: testOrgId } });
      await prisma.assetTypeDefinition.deleteMany({ where: { id: systemTypeId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/asset-types', () => {
    it('should create an org asset-type', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/asset-types')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'e2everdeler',
          name: 'E2E Verdeelinrichting',
          description: 'Aangemaakt in E2E test',
          normTypes: ['NEN1010'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.code).toBe('e2everdeler');
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      createdAssetTypeIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/asset-types')
        .send({ code: 'nope', name: 'Nope' })
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/asset-types')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No code' })
        .expect(400);
    });
  });

  describe('GET /api/v1/asset-types', () => {
    it('should list asset-types including the created one and the system one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/asset-types')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = res.body.data.map((t: any) => t.code);
      expect(codes).toContain('e2everdeler');
      expect(codes).toContain('e2esys');
    });
  });

  describe('GET /api/v1/asset-types/:id', () => {
    it('should return asset-type detail', async () => {
      const id = createdAssetTypeIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/asset-types/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(Array.isArray(res.body.data.fields)).toBe(true);
    });

    it('should return 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/asset-types/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/asset-types/code/:code', () => {
    it('should return the asset-type by code', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/asset-types/code/e2everdeler')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('e2everdeler');
    });
  });

  describe('POST /api/v1/asset-types/:id/fields', () => {
    let fieldAId: string;
    let fieldBId: string;

    it('should add a field', async () => {
      const id = createdAssetTypeIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/asset-types/${id}/fields`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fieldKey: 'nominale_stroom',
          label: 'Nominale stroom',
          fieldType: 'number',
          unit: 'A',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.fieldKey).toBe('nominale_stroom');
      fieldAId = res.body.data.id;
    });

    it('should add a second field', async () => {
      const id = createdAssetTypeIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/asset-types/${id}/fields`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          fieldKey: 'fabrikant',
          label: 'Fabrikant',
          fieldType: 'text',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      fieldBId = res.body.data.id;
    });

    it('should reorder fields', async () => {
      const id = createdAssetTypeIds[0];
      const res = await request(app.getHttpServer())
        .post(`/api/v1/asset-types/${id}/fields/reorder`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ fieldIds: [fieldBId, fieldAId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      const ordered = res.body.data.map((f: any) => f.id);
      expect(ordered).toEqual([fieldBId, fieldAId]);
    });
  });

  describe('PUT /api/v1/asset-types/:id/constraints', () => {
    it('should set constraints (root allowed)', async () => {
      const id = createdAssetTypeIds[0];
      const res = await request(app.getHttpServer())
        .put(`/api/v1/asset-types/${id}/constraints`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ constraints: [{ allowedParentTypeId: null, isRequired: false }] })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].allowedParentTypeId).toBeNull();
    });
  });

  describe('POST /api/v1/asset-types/validate-parent', () => {
    it('should validate that the type may be a root', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/asset-types/validate-parent')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ assetTypeCode: 'e2everdeler' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.valid).toBe(true);
    });
  });

  describe('POST /api/v1/asset-types/:id/duplicate', () => {
    it('should duplicate the system type into the org', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/asset-types/${systemTypeId}/duplicate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('e2esys');
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      createdAssetTypeIds.push(res.body.data.id);
    });
  });

  describe('PATCH /api/v1/asset-types/:id', () => {
    it('should update the org asset-type', async () => {
      const id = createdAssetTypeIds[0];
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/asset-types/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Verdeelinrichting (bijgewerkt)' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Verdeelinrichting (bijgewerkt)');
    });
  });

  describe('DELETE /api/v1/asset-types/:id', () => {
    it('should soft-delete the org asset-type', async () => {
      const id = createdAssetTypeIds[0];
      await request(app.getHttpServer())
        .delete(`/api/v1/asset-types/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify it's gone (soft-deleted → 404)
      await request(app.getHttpServer())
        .get(`/api/v1/asset-types/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
