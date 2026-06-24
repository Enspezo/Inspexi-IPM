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
  // Tweede org + admin voor cross-org isolatie-tests (support-access)
  let otherOrgId: string;
  let otherOrgAdminId: string;
  let otherOrgAdminToken: string;

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

    // Tweede org + admin (andere tenant) voor cross-org isolatie-tests
    const otherOrg = await prisma.organization.create({
      data: { name: 'E2E Other Org', slug: 'e2eotherorg' },
    });
    otherOrgId = otherOrg.id;

    const ooa = await prisma.user.create({
      data: {
        email: 'e2e-oa-other@test.nl',
        passwordHash,
        firstName: 'Other',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: otherOrg.id,
        emailVerifiedAt: new Date(),
      },
    });
    otherOrgAdminId = ooa.id;

    const ooaLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-oa-other@test.nl', password: 'TestPass123!' });
    otherOrgAdminToken = ooaLogin.body.data.accessToken;
  });

  afterAll(async () => {
    const userIds = [superuserId, orgAdminId, otherOrgAdminId];
    // SupportAccessLog heeft FK's naar org + user → eerst opruimen
    await prisma.supportAccessLog.deleteMany({
      where: { orgId: { in: [testOrgId, otherOrgId] } },
    });
    await prisma.auditLog.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: userIds } },
    });
    await prisma.organization.deleteMany({
      where: { id: { in: [testOrgId, otherOrgId] } },
    });
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

  // ─── IMP_PRD-10 Fase 5: Support-toegang ──────────────────
  describe('Support access (e2e)', () => {
    it('GET support-access geeft de status terug voor de eigen org-admin', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('supportAccessEnabled');
      expect(res.body.data).toHaveProperty('supportAccessExpiresAt');
    });

    it('PATCH schakelt support-toegang aan (24u) en logt ENABLED met performer', async () => {
      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ enabled: true, expiresInHours: 24, note: 'E2E test' })
        .expect(200);

      expect(patch.body.data.supportAccessEnabled).toBe(true);
      expect(patch.body.data.supportAccessExpiresAt).not.toBeNull();

      const logs = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}/support-access/logs`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(Array.isArray(logs.body.data.data)).toBe(true);
      const enabledEntry = logs.body.data.data.find(
        (l: { action: string }) => l.action === 'ENABLED',
      );
      expect(enabledEntry).toBeDefined();
      expect(enabledEntry.performedBy?.id).toBe(orgAdminId);
      expect(enabledEntry.note).toBe('E2E test');
    });

    it('PATCH schakelt support-toegang weer uit (DISABLED-log)', async () => {
      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ enabled: false })
        .expect(200);

      expect(patch.body.data.supportAccessEnabled).toBe(false);
      expect(patch.body.data.supportAccessExpiresAt).toBeNull();

      const logs = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}/support-access/logs`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);
      const disabledEntry = logs.body.data.data.find(
        (l: { action: string }) => l.action === 'DISABLED',
      );
      expect(disabledEntry).toBeDefined();
    });

    it('SUPERUSER mag support-toegang van elke org zetten', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ enabled: false })
        .expect(200);
    });

    it('weigert validatie van een ongeldige expiresInHours (>720)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ enabled: true, expiresInHours: 5000 })
        .expect(400);
    });

    it('cross-org: andere org-admin kan support-status NIET lezen (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${otherOrgAdminToken}`)
        .expect(403);
    });

    it('cross-org: andere org-admin kan support-toegang NIET zetten (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${testOrgId}/support-access`)
        .set('Authorization', `Bearer ${otherOrgAdminToken}`)
        .send({ enabled: true })
        .expect(403);
    });

    it('cross-org: andere org-admin kan het logboek NIET lezen (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${testOrgId}/support-access/logs`)
        .set('Authorization', `Bearer ${otherOrgAdminToken}`)
        .expect(403);
    });
  });
});
