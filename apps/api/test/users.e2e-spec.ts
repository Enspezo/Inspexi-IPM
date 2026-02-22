import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superuserToken: string;
  let orgAdminToken: string;
  let testOrgId: string;
  let superuserId: string;
  let orgAdminId: string;
  let targetUserId: string;

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
      data: { name: 'E2E Users Test', slug: 'e2e-users-test' },
    });
    testOrgId = org.id;

    // Create superuser
    const su = await prisma.user.create({
      data: {
        email: 'e2e-su-users@test.nl',
        passwordHash,
        firstName: 'Super',
        lastName: 'User',
        role: 'SUPERUSER',
        emailVerifiedAt: new Date(),
      },
    });
    superuserId = su.id;

    // Create org admin
    const oa = await prisma.user.create({
      data: {
        email: 'e2e-oa-users@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'Admin',
        role: 'ORG_ADMIN',
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    orgAdminId = oa.id;

    // Create target user for operations
    const target = await prisma.user.create({
      data: {
        email: 'e2e-target@test.nl',
        passwordHash,
        firstName: 'Target',
        lastName: 'User',
        role: 'BACKOFFICE',
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    targetUserId = target.id;

    // Login
    const suLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-su-users@test.nl', password: 'TestPass123!' });
    superuserToken = suLogin.body.data.accessToken;

    const oaLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-oa-users@test.nl', password: 'TestPass123!' });
    orgAdminToken = oaLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await prisma.invitation.deleteMany({ where: { orgId: testOrgId } });
    await prisma.refreshToken.deleteMany({
      where: { userId: { in: [superuserId, orgAdminId, targetUserId] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [superuserId, orgAdminId, targetUserId] },
      },
    });
    // Clean up any users created via invitations
    await prisma.user.deleteMany({
      where: { email: { startsWith: 'e2e-invite' } },
    });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
    await app.close();
  });

  describe('GET /api/v1/users', () => {
    it('should list org users as Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      // Should only see users in own org
      const orgUsers = res.body.data.filter(
        (u: any) => u.orgId === testOrgId,
      );
      expect(orgUsers.length).toBeGreaterThanOrEqual(2);
    });

    it('should list all users as Superuser', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);

      expect(res.body.data.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('POST /api/v1/users/invite', () => {
    it('should create invitation as Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ email: 'e2e-invite-new@test.nl', role: 'BACKOFFICE' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('e2e-invite-new@test.nl');
      expect(res.body.data.role).toBe('BACKOFFICE');
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject SUPERUSER role from Org Admin', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ email: 'e2e-invite-su@test.nl', role: 'SUPERUSER' })
        .expect(403);
    });
  });

  describe('POST /api/v1/users/accept-invitation', () => {
    it('should create account from valid invitation', async () => {
      // Create invitation
      const inviteRes = await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ email: 'e2e-invite-accept@test.nl', role: 'INSPECTEUR' });

      const token = inviteRes.body.data.token;

      // Accept invitation
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/accept-invitation')
        .send({
          token,
          password: 'NewPass123!',
          firstName: 'New',
          lastName: 'Inspector',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('e2e-invite-accept@test.nl');
      expect(res.body.data.role).toBe('INSPECTEUR');
      expect(res.body.data.passwordHash).toBeUndefined();
    });
  });

  describe('PATCH /api/v1/users/:id/deactivate', () => {
    it('should deactivate user as Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetUserId}/deactivate`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify user is deactivated
      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      expect(user?.isActive).toBe(false);
    });
  });

  describe('PATCH /api/v1/users/:id/activate', () => {
    it('should activate user as Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetUserId}/activate`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      expect(user?.isActive).toBe(true);
    });
  });

  describe('PATCH /api/v1/users/:id/role', () => {
    it('should change role as Org Admin', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ role: 'MANAGER' })
        .expect(200);

      expect(res.body.success).toBe(true);

      const user = await prisma.user.findUnique({
        where: { id: targetUserId },
      });
      expect(user?.role).toBe('MANAGER');
    });

    it('should reject SUPERUSER role from Org Admin', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/users/${targetUserId}/role`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ role: 'SUPERUSER' })
        .expect(403);
    });
  });

  describe('PATCH /api/v1/users/profile', () => {
    it('should update own profile', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/users/profile')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ firstName: 'Updated' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.firstName).toBe('Updated');
    });
  });
});
