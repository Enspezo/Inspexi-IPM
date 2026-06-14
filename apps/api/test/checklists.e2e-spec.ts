import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Checklists (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let normTypeId: string;
  let accessToken: string;

  // Created during the run; tracked for FK-safe teardown
  let checklistItemId: string;
  let checklistId: string; // v1.0
  let itemLinkId: string;
  let newVersionId: string; // v1.1

  const NORM_CODE = 'E2ENORM';

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
      data: { name: 'E2E Checklists Org', slug: 'e2echecklists' },
    });
    testOrgId = org.id;

    // Create test user (ORG_ADMIN)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-checklists@test.nl',
        passwordHash,
        firstName: 'Checklist',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create a NormTypeDefinition so normTypeCode validation passes
    const norm = await prisma.normTypeDefinition.create({
      data: {
        code: NORM_CODE,
        label: 'E2E Norm',
        assetTypes: ['e2easset'],
        createdBy: user.id,
      },
    });
    normTypeId = norm.id;

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-checklists@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-safe order: versionHistory → itemLinks → checklists → checklistItems → normType → audit/tokens → user → org
      await prisma.checklistVersionHistory.deleteMany({
        where: { checklist: { orgId: testOrgId } },
      });
      await prisma.checklistItemLink.deleteMany({
        where: { checklist: { orgId: testOrgId } },
      });
      await prisma.checklist.deleteMany({ where: { orgId: testOrgId } });
      await prisma.checklistItem.deleteMany({ where: { orgId: testOrgId } });
      await prisma.normTypeDefinition.deleteMany({ where: { id: normTypeId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/checklist-items', () => {
    it('should create an org checklist item', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checklist-items')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'E2E-ITEM-1',
          question: 'Is de hoofdschakelaar goed bereikbaar?',
          normReference: 'NEN 1010 art. 5.3',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.orgId).toBe(testOrgId);
      checklistItemId = res.body.data.id;
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/checklist-items')
        .send({ question: 'nope nope' })
        .expect(401);
    });
  });

  describe('POST /api/v1/checklists', () => {
    it('should create an org checklist (CONCEPT v1.0)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checklists')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          code: 'E2E-CL-1',
          name: 'E2E Inspectie verdeler',
          normTypeCode: NORM_CODE,
          assetTypes: ['e2easset'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONCEPT');
      expect(res.body.data.version).toBe('1.0');
      expect(res.body.data.orgId).toBe(testOrgId);
      checklistId = res.body.data.id;
    });

    it('should reject an unknown normTypeCode (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/checklists')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Bad norm',
          normTypeCode: 'DOESNOTEXIST',
          assetTypes: ['e2easset'],
        })
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/checklists')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'No norm or assets' })
        .expect(400);
    });
  });

  describe('GET /api/v1/checklists', () => {
    it('should list checklists including the created one', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/checklists')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const ids = res.body.data.map((c: any) => c.id);
      expect(ids).toContain(checklistId);
    });
  });

  describe('POST /api/v1/checklists/:id/items', () => {
    it('should link the item to the checklist', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/checklists/${checklistId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ checklistItemId, isRequired: true })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.checklistItemId).toBe(checklistItemId);
      itemLinkId = res.body.data.id;
    });

    it('should reject linking the same item twice (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/checklists/${checklistId}/items`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ checklistItemId })
        .expect(400);
    });
  });

  describe('POST /api/v1/checklists/:id/items/reorder', () => {
    it('should reorder the item links', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/checklists/${checklistId}/items/reorder`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ itemLinkIds: [itemLinkId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.itemLinks[0].id).toBe(itemLinkId);
    });
  });

  describe('POST /api/v1/checklists/:id/publish', () => {
    it('should publish the checklist (CONCEPT -> ACTIEF)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/checklists/${checklistId}/publish`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ changeDescription: 'Eerste publicatie' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIEF');
    });

    it('should block editing an ACTIEF checklist (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/checklists/${checklistId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Mag niet' })
        .expect(400);
    });
  });

  describe('GET /api/v1/checklists/for-asset', () => {
    it('should return the active checklist for the asset/norm', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/checklists/for-asset')
        .query({ normType: NORM_CODE, assetType: 'e2easset' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).not.toBeNull();
      expect(res.body.data.id).toBe(checklistId);
      expect(res.body.data.status).toBe('ACTIEF');
    });
  });

  describe('GET /api/v1/checklists/:id/history', () => {
    it('should return version history (create + publish)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/checklists/${checklistId}/history`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/v1/checklists/:id/export', () => {
    it('should export the checklist as JSON', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/checklists/${checklistId}/export`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.checklist.code).toBe('E2E-CL-1');
      expect(Array.isArray(res.body.items)).toBe(true);
      expect(res.body.items).toHaveLength(1);
    });
  });

  describe('POST /api/v1/checklists/:id/new-version', () => {
    it('should clone to a new CONCEPT version (1.1)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/checklists/${checklistId}/new-version`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ changeDescription: 'Nieuwe versie' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.version).toBe('1.1');
      expect(res.body.data.status).toBe('CONCEPT');
      expect(res.body.data.previousVersion.id).toBe(checklistId);
      expect(res.body.data.itemLinks).toHaveLength(1);
      newVersionId = res.body.data.id;
    });
  });

  describe('POST /api/v1/checklists/:id/retire', () => {
    it('should retire the active checklist (ACTIEF -> VERVALLEN)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/checklists/${checklistId}/retire`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ changeDescription: 'Vervangen door 1.1' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('VERVALLEN');
    });
  });

  describe('DELETE /api/v1/checklists/:id', () => {
    it('should delete the CONCEPT v1.1 checklist', async () => {
      // Remove the copied link first is NOT needed (cascade), but the version
      // is CONCEPT so it is deletable.
      await request(app.getHttpServer())
        .delete(`/api/v1/checklists/${newVersionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/checklists/${newVersionId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });

    it('should block deleting a VERVALLEN checklist (400)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/checklists/${checklistId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(400);
    });
  });
});
