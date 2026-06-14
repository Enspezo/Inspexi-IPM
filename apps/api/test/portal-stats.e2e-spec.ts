import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Portal Stats (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testNormCode: string;
  let testPlanId: string;
  let accessToken: string;

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
      data: { name: 'E2E Portal Stats Org', slug: 'e2eportalstats' },
    });
    testOrgId = org.id;

    // User (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-portal-stats@test.nl',
        passwordHash,
        firstName: 'Stats',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Contact (opdrachtgever)
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Portal Stats Contact',
        email: 'e2e-portal-stats-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Global norm-type definition
    testNormCode = 'e2estatsnorm';
    await prisma.normTypeDefinition.create({
      data: {
        code: testNormCode,
        label: 'E2E Stats Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });

    // Inspection plan (pending_review → shows up in activities + pendingReview)
    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        projectName: 'E2E Stats Plan',
        normTypeCode: testNormCode,
        statusCode: 'pending_review',
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-portal-stats@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: testNormCode } });
      await prisma.contact.deleteMany({ where: { id: testContactId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('GET /api/v1/portal/stats/dashboard', () => {
    it('should return the dashboard summary', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/stats/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const d = res.body.data;
      expect(d).toHaveProperty('totalThisMonth');
      expect(d).toHaveProperty('pendingReview');
      expect(d).toHaveProperty('completedThisWeek');
      expect(d).toHaveProperty('criticalFindings');
      expect(d).toHaveProperty('totalAssets');
      expect(d).toHaveProperty('totalLocations');
      // Our pending_review plan should be counted.
      expect(d.pendingReview).toBeGreaterThanOrEqual(1);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/portal/stats/dashboard')
        .expect(401);
    });
  });

  describe('GET /api/v1/portal/stats/inspections-chart', () => {
    it('should return 8 weekly data points', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/stats/inspections-chart')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toHaveLength(8);
      expect(res.body.data[0]).toHaveProperty('week');
      expect(res.body.data[0]).toHaveProperty('count');
    });
  });

  describe('GET /api/v1/portal/stats/activities', () => {
    it('should return recent activities including our plan', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/stats/activities')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const item = res.body.data[0];
      expect(item).toHaveProperty('id');
      expect(item).toHaveProperty('type');
      expect(item).toHaveProperty('title');
      expect(item).toHaveProperty('description');
      expect(item).toHaveProperty('timestamp');
      expect(item).toHaveProperty('user');

      // The pending_review plan should appear as an "inspection_submitted" item.
      const planItem = res.body.data.find((a: { id: string }) => a.id === testPlanId);
      expect(planItem).toBeDefined();
      expect(planItem.type).toBe('inspection_submitted');
    });
  });
});
