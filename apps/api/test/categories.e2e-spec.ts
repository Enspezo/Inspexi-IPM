import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let systemCategoryId: string;
  let accessToken: string;

  // Created during the run; tracked for FK-safe teardown (children → parents by id)
  const createdCategoryIds: string[] = [];

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
      data: { name: 'E2E Categories Org', slug: 'e2ecategories' },
    });
    testOrgId = org.id;

    // Create test user (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-categories@test.nl',
        passwordHash,
        firstName: 'Category',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create ONE system category (orgId null) to assert org-admin gets 403 when editing it
    const systemCategory = await prisma.category.create({
      data: {
        orgId: null,
        isSystem: true,
        name: 'E2E Systeemcategorie',
        createdBy: user.id,
      },
    });
    systemCategoryId = systemCategory.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-categories@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-safe order: delete children before parents (deepest first), then system row, then user/org.
      // createdCategoryIds is appended root-first, so reverse to delete leaves first.
      for (const id of [...createdCategoryIds].reverse()) {
        await prisma.category.deleteMany({ where: { id } });
      }
      await prisma.category.deleteMany({ where: { id: systemCategoryId } });
      await prisma.category.deleteMany({ where: { orgId: testOrgId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/categories', () => {
    it('should create an org category (root)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'E2E Verdeelinrichtingen',
          description: 'Aangemaakt in E2E test',
          color: '#3B82F6',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.name).toBe('E2E Verdeelinrichtingen');
      expect(res.body.data.orgId).toBe(testOrgId);
      expect(res.body.data.isSystem).toBe(false);
      createdCategoryIds.push(res.body.data.id);
    });

    it('should create a child category', async () => {
      const parentId = createdCategoryIds[0];
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Subgroep', parentId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.parentId).toBe(parentId);
      createdCategoryIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .send({ name: 'Nope' })
        .expect(401);
    });

    it('should return 400 for a missing name', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'No name' })
        .expect(400);
    });

    it('should forbid an org-admin from creating a system category', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E IllegalSystem', isSystem: true })
        .expect(403);
    });
  });

  describe('GET /api/v1/categories', () => {
    it('should list categories including the created one and the system one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const names = res.body.data.map((c: any) => c.name);
      expect(names).toContain('E2E Verdeelinrichtingen');
      expect(names).toContain('E2E Systeemcategorie');
    });
  });

  describe('GET /api/v1/categories/tree', () => {
    it('should return a nested tree with the child under its parent', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/categories/tree')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const root = res.body.data.find(
        (c: any) => c.id === createdCategoryIds[0],
      );
      expect(root).toBeDefined();
      expect(Array.isArray(root.children)).toBe(true);
      const childIds = root.children.map((c: any) => c.id);
      expect(childIds).toContain(createdCategoryIds[1]);
    });
  });

  describe('GET /api/v1/categories/:id', () => {
    it('should return category detail with children', async () => {
      const id = createdCategoryIds[0];
      const res = await request(app.getHttpServer())
        .get(`/api/v1/categories/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(id);
      expect(Array.isArray(res.body.data.children)).toBe(true);
    });

    it('should return 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/categories/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/v1/categories/:id', () => {
    it('should update the org category', async () => {
      const id = createdCategoryIds[0];
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/categories/${id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Verdeelinrichtingen (bijgewerkt)' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Verdeelinrichtingen (bijgewerkt)');
    });

    it('should return 403 when an org-admin edits a system category', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/categories/${systemCategoryId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'E2E Hack' })
        .expect(403);
    });
  });

  describe('POST /api/v1/categories/reorder', () => {
    it('should reorder org categories', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/categories/reorder')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          items: [
            { id: createdCategoryIds[1], sortOrder: 0 },
            { id: createdCategoryIds[0], sortOrder: 1 },
          ],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.reordered).toBe(true);
    });

    it('should return 403 when reorder includes a system category', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/categories/reorder')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ items: [{ id: systemCategoryId, sortOrder: 0 }] })
        .expect(403);
    });
  });

  describe('DELETE /api/v1/categories/:id', () => {
    it('should reject deleting a category that still has children', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${createdCategoryIds[0]}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });

    it('should delete a leaf category, then its parent', async () => {
      // Delete child first
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${createdCategoryIds[1]}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Now the parent is a leaf and can be removed
      await request(app.getHttpServer())
        .delete(`/api/v1/categories/${createdCategoryIds[0]}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/api/v1/categories/${createdCategoryIds[0]}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
