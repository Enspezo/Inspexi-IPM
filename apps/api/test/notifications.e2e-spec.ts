import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let accessToken: string;
  const createdNotificationIds: string[] = [];

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
      data: { name: 'E2E Notifications Org', slug: 'e2enotiforg' },
    });
    testOrgId = org.id;

    // Create test user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-notif@test.nl',
        passwordHash,
        firstName: 'Notif',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create test notifications
    const notification1 = await prisma.notification.create({
      data: {
        orgId: org.id,
        userId: user.id,
        type: 'TAAK_TOEGEWEZEN',
        title: 'Test Notificatie 1',
        body: 'Test body 1',
        isRead: false,
      },
    });
    createdNotificationIds.push(notification1.id);

    const notification2 = await prisma.notification.create({
      data: {
        orgId: org.id,
        userId: user.id,
        type: 'TAAK_STATUS_GEWIJZIGD',
        title: 'Test Notificatie 2',
        body: 'Test body 2',
        isRead: false,
      },
    });
    createdNotificationIds.push(notification2.id);

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-notif@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.notificationGroupPref.deleteMany({ where: { orgId: testOrgId } });
    await prisma.notificationPref.deleteMany({ where: { userId: testUserId } });
    await prisma.notification.deleteMany({
      where: { id: { in: createdNotificationIds } },
    });
    await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.organization.deleteMany({ where: { id: testOrgId } });
    await app.close();
  });

  describe('GET /api/v1/notifications', () => {
    it('should list notifications for the current user', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.total).toBeGreaterThanOrEqual(2);
    });

    it('should return 401 without auth', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .expect(401);
    });
  });

  describe('GET /api/v1/notifications/unread-count', () => {
    it('should return unread count', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.count).toBe('number');
      expect(res.body.data.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('PATCH /api/v1/notifications/:id/read', () => {
    it('should mark a notification as read', async () => {
      const notifId = createdNotificationIds[0];

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/notifications/${notifId}/read`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify it's now read
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const notification = listRes.body.data.data.find(
        (n: any) => n.id === notifId,
      );
      if (notification) {
        expect(notification.isRead).toBe(true);
      }
    });
  });

  describe('POST /api/v1/notifications/read-all', () => {
    it('should mark all notifications as read', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);

      // Verify unread count is 0
      const countRes = await request(app.getHttpServer())
        .get('/api/v1/notifications/unread-count')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(countRes.body.data.count).toBe(0);
    });
  });

  describe('GET /api/v1/notification-prefs', () => {
    it('should return notification preferences', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/notification-prefs')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    });
  });
});
