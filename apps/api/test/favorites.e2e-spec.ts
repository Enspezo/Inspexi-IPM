import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Favorites (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let accessToken: string;

  // Second org (for the cross-tenant attempt).
  let otherOrgId: string;
  let otherContactId: string;

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

    // Primary test org
    const org = await prisma.organization.create({
      data: { name: 'E2E Favorites Org', slug: 'e2efavorg' },
    });
    testOrgId = org.id;

    // Other org (cross-tenant target)
    const otherOrg = await prisma.organization.create({
      data: { name: 'E2E Favorites Other Org', slug: 'e2efavotherorg' },
    });
    otherOrgId = otherOrg.id;

    // Primary test user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-favorites@test.nl',
        passwordHash,
        firstName: 'Fav',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Contact in the user's own org
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Favorite Contact',
        email: 'e2e-fav-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Contact in the OTHER org (used for the cross-tenant attempt)
    const otherContact = await prisma.contact.create({
      data: {
        orgId: otherOrg.id,
        type: 'COMPANY',
        companyName: 'E2E Other Org Contact',
        email: 'e2e-fav-other-contact@test.nl',
      },
    });
    otherContactId = otherContact.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-favorites@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // Cleanup in dependency order — favorites before users/orgs.
      await prisma.favorite.deleteMany({ where: { userId: testUserId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.contact.deleteMany({
        where: { id: { in: [testContactId, otherContactId] } },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({
        where: { id: { in: [testOrgId, otherOrgId] } },
      });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/favorites', () => {
    it('should add a favorite (idempotent)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/favorites')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ entityType: 'Contact', entityId: testContactId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.entityType).toBe('Contact');
      expect(res.body.data.entityId).toBe(testContactId);

      // Second identical POST is still OK and must not create a duplicate.
      await request(app.getHttpServer())
        .post('/api/v1/favorites')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ entityType: 'Contact', entityId: testContactId })
        .expect(201);

      const count = await prisma.favorite.count({
        where: {
          userId: testUserId,
          entityType: 'Contact',
          entityId: testContactId,
        },
      });
      expect(count).toBe(1);
    });

    it('should return 400 for an unknown entity type', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/favorites')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ entityType: 'Banana', entityId: testContactId })
        .expect(400);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/favorites')
        .send({ entityType: 'Contact', entityId: testContactId })
        .expect(401);
    });

    it('should reject favoriting another org entity (cross-tenant)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/favorites')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ entityType: 'Contact', entityId: otherContactId });

      expect([403, 404]).toContain(res.status);

      const count = await prisma.favorite.count({
        where: { userId: testUserId, entityId: otherContactId },
      });
      expect(count).toBe(0);
    });
  });

  describe('GET /api/v1/favorites/keys', () => {
    it('should contain the added favorite', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/favorites/keys')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toContainEqual({
        entityType: 'Contact',
        entityId: testContactId,
      });
    });
  });

  describe('GET /api/v1/favorites', () => {
    it('should return the favorite grouped and named', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/favorites')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const groups = res.body.data.groups;
      expect(Array.isArray(groups)).toBe(true);

      const contactGroup = groups.find((g: any) => g.entityType === 'Contact');
      expect(contactGroup).toBeDefined();
      const item = contactGroup.items.find(
        (i: any) => i.entityId === testContactId,
      );
      expect(item).toBeDefined();
      expect(item.name).toBe('E2E Favorite Contact');
    });

    it('should honor the entityType filter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/favorites')
        .query({ entityType: 'Contact' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const groups = res.body.data.groups;
      for (const group of groups) {
        expect(group.entityType).toBe('Contact');
      }
    });
  });

  describe('DELETE /api/v1/favorites', () => {
    it('should remove the favorite (idempotent)', async () => {
      await request(app.getHttpServer())
        .delete('/api/v1/favorites')
        .query({ entityType: 'Contact', entityId: testContactId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const count = await prisma.favorite.count({
        where: {
          userId: testUserId,
          entityType: 'Contact',
          entityId: testContactId,
        },
      });
      expect(count).toBe(0);

      // Deleting again is still OK (idempotent).
      await request(app.getHttpServer())
        .delete('/api/v1/favorites')
        .query({ entityType: 'Contact', entityId: testContactId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
