import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Organizations (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superuserToken: string;
  let orgAdminToken: string;
  let testOrgId: string;
  let superuserId: string;
  let orgAdminId: string;

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
      data: { name: 'E2E Org Test', slug: 'e2eorgtest' },
    });
    testOrgId = org.id;

    // Create superuser
    const su = await prisma.user.create({
      data: {
        email: 'e2e-su-org@test.nl',
        passwordHash,
        firstName: 'Super',
        lastName: 'User',
        roles: ['SUPERUSER'],
        emailVerifiedAt: new Date(),
      },
    });
    superuserId = su.id;

    // Create org admin
    const oa = await prisma.user.create({
      data: {
        email: 'e2e-oa-org@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    orgAdminId = oa.id;

    // Login both
    const suLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-su-org@test.nl', password: 'TestPass123!' });
    superuserToken = suLogin.body.data.accessToken;

    const oaLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-oa-org@test.nl', password: 'TestPass123!' });
    orgAdminToken = oaLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({
      where: { userId: { in: [superuserId, orgAdminId] } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [superuserId, orgAdminId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [superuserId, orgAdminId] } },
    });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
    // Also delete any orgs created during tests
    await prisma.organization.deleteMany({
      where: { slug: { startsWith: 'e2enew' } },
    });
    await app.close();
  });

  describe('POST /api/v1/organizations', () => {
    it('should create org as Superuser', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'E2E New Org', slug: 'e2eneworg' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E New Org');
      expect(res.body.data.slug).toBe('e2eneworg');
    });

    it('should return 403 for Org Admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ name: 'Forbidden Org', slug: 'e2enewforbidden' })
        .expect(403);
    });
  });

  describe('GET /api/v1/organizations', () => {
    it('should list all orgs as Superuser', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('should return 403 for Org Admin', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });
  });

  describe('GET /api/v1/organizations/:id', () => {
    it('should return org for Superuser', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(testOrgId);
    });

    it('should return own org for Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.data.id).toBe(testOrgId);
    });
  });

  describe('PATCH /api/v1/organizations/:id', () => {
    it('should update org as Superuser', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'Updated E2E Org' })
        .expect(200);

      expect(res.body.data.name).toBe('Updated E2E Org');
    });

    it('should update own org as Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ primaryColor: '#FF0000' })
        .expect(200);

      expect(res.body.data.primaryColor).toBe('#FF0000');
    });
  });
});
