import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;

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

    // Create test org and user
    const org = await prisma.organization.create({
      data: { name: 'E2E Test Org', slug: 'e2etestorg' },
    });
    testOrgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-auth@test.nl',
        passwordHash,
        firstName: 'E2E',
        lastName: 'Tester',
        role: 'ORG_ADMIN',
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
    await app.close();
  });

  describe('POST /api/v1/auth/login', () => {
    it('should return 200 with access token', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth@test.nl', password: 'TestPass123!' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
      expect(typeof res.body.data.accessToken).toBe('string');

      // Should set refresh cookie
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('refresh_token='))
        : cookies;
      expect(refreshCookie).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth@test.nl', password: 'WrongPassword' })
        .expect(401);

      expect(res.body.success).toBe(false);
    });

    it('should return 400 for missing fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth@test.nl' })
        .expect(400);
    });
  });

  describe('POST /api/v1/auth/refresh', () => {
    it('should return new access token with valid refresh cookie', async () => {
      // Login first to get refresh cookie
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth@test.nl', password: 'TestPass123!' });

      const cookies = loginRes.headers['set-cookie'];
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('refresh_token='))
        : cookies;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .set('Cookie', refreshCookie || '')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.accessToken).toBeDefined();
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('should return user profile when authenticated', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth@test.nl', password: 'TestPass123!' });

      const token = loginRes.body.data.accessToken;

      const res = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('e2e-auth@test.nl');
      expect(res.body.data.firstName).toBe('E2E');
      expect(res.body.data.passwordHash).toBeUndefined();
    });

    it('should return 401 without auth header', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .expect(401);
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    it('should clear refresh cookie', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-auth@test.nl', password: 'TestPass123!' });

      const token = loginRes.body.data.accessToken;
      const cookies = loginRes.headers['set-cookie'];
      const refreshCookie = Array.isArray(cookies)
        ? cookies.find((c: string) => c.startsWith('refresh_token='))
        : cookies;

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', refreshCookie || '')
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/v1/auth/forgot-password', () => {
    it('should return 200 even for non-existent email', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent@test.nl' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });
});
