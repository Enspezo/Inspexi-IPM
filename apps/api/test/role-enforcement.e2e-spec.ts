import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Rol-afdwinging (Stream B5).
 *
 * Eén organisatie met een ORG_ADMIN en een INSPECTEUR. De RolesGuard draait
 * vóór de validatie-pipe, dus een verboden rol levert 403 — ongeacht de body.
 *
 *  - SUPERUSER-only writes (classification-models, norm-types,
 *    measurement-sheet-templates + sub-resource) → 403 voor zowel INSPECTEUR
 *    als ORG_ADMIN.
 *  - Dezelfde GET-lijsten zijn leesbaar voor ALL_STAFF → 200 voor INSPECTEUR.
 *  - Org-template writes (checklists, location-types) mogen door ORG_ADMIN → 2xx,
 *    maar niet door INSPECTEUR → 403.
 *
 * Draait op 127.0.0.1 (unknown host) → de TenantGuard scope't niet; puur de
 * RolesGuard wordt hier getest.
 */
describe('Role enforcement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let adminId: string;
  let inspectorId: string;
  let adminToken: string;
  let inspectorToken: string;

  const NORM_CODE = 'E2EROLE';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const org = await prisma.organization.create({
      data: { name: 'E2E RoleEnforce Org', slug: 'e2eroleenforce' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-role-admin@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const inspector = await prisma.user.create({
      data: {
        email: 'e2e-role-inspecteur@test.nl',
        passwordHash,
        firstName: 'In',
        lastName: 'Specteur',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    inspectorId = inspector.id;

    // Norm vereist voor de checklist-positieve controle (normTypeCode-validatie).
    await prisma.normTypeDefinition.create({
      data: {
        code: NORM_CODE,
        label: 'E2E Role Norm',
        assetTypes: ['e2erole'],
        createdBy: admin.id,
      },
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-role-admin@test.nl', password: 'TestPass123!' });
    adminToken = adminLogin.body.data.accessToken;

    const inspectorLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-role-inspecteur@test.nl', password: 'TestPass123!' });
    inspectorToken = inspectorLogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-veilige volgorde (kinderen eerst).
      await prisma.checklistVersionHistory.deleteMany({ where: { checklist: { orgId } } });
      await prisma.checklistItemLink.deleteMany({ where: { checklist: { orgId } } });
      await prisma.checklist.deleteMany({ where: { orgId } });
      await prisma.locationTypeConstraint.deleteMany({
        where: { locationTypeDefinition: { orgId } },
      });
      await prisma.locationTypeField.deleteMany({
        where: { locationTypeDefinition: { orgId } },
      });
      await prisma.locationTypeDefinition.deleteMany({ where: { orgId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: NORM_CODE } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, inspectorId] } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: [adminId, inspectorId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, inspectorId] } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ── SUPERUSER-only writes → 403 voor org-staf ──
  describe('SUPERUSER-only writes are forbidden for org staff', () => {
    it('INSPECTEUR cannot create a classification-model (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/classification-models')
        .set(auth(inspectorToken))
        .send({ code: 'E2EROLECM', name: 'Nope' })
        .expect(403);
    });

    it('ORG_ADMIN cannot create a classification-model (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/classification-models')
        .set(auth(adminToken))
        .send({ code: 'E2EROLECM', name: 'Nope' })
        .expect(403);
    });

    it('INSPECTEUR cannot create a norm-type (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .set(auth(inspectorToken))
        .send({ code: 'E2EROLENT', label: 'Nope', assetTypes: [] })
        .expect(403);
    });

    it('ORG_ADMIN cannot create a norm-type (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/norm-types')
        .set(auth(adminToken))
        .send({ code: 'E2EROLENT', label: 'Nope', assetTypes: [] })
        .expect(403);
    });

    it('INSPECTEUR cannot create a measurement-sheet-template (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-templates')
        .set(auth(inspectorToken))
        .send({ name: 'Nope', normType: 'x', assetType: 'y' })
        .expect(403);
    });

    it('INSPECTEUR cannot add a section to a template (403, sub-resource write)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${randomUUID()}/sections`)
        .set(auth(inspectorToken))
        .send({ title: 'Nope' })
        .expect(403);
    });
  });

  // ── READ_ROLES = ALL_STAFF → INSPECTEUR mag dezelfde lijsten lezen ──
  describe('Read lists are allowed for all staff (INSPECTEUR)', () => {
    it('INSPECTEUR can list classification-models (200)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/classification-models')
        .set(auth(inspectorToken))
        .expect(200);
    });

    it('INSPECTEUR can list norm-types (200)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/norm-types')
        .set(auth(inspectorToken))
        .expect(200);
    });

    it('INSPECTEUR can list measurement-sheet-templates (200)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/measurement-sheet-templates')
        .set(auth(inspectorToken))
        .expect(200);
    });
  });

  // ── Org-template writes → ORG_ADMIN mag (2xx), INSPECTEUR niet (403) ──
  describe('Org-template writes are allowed for ORG_ADMIN', () => {
    it('ORG_ADMIN can create a checklist (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/checklists')
        .set(auth(adminToken))
        .send({
          code: 'E2E-ROLE-CL',
          name: 'E2E Role Checklist',
          normTypeCode: NORM_CODE,
          assetTypes: ['e2erole'],
        })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orgId).toBe(orgId);
    });

    it('INSPECTEUR cannot create a checklist (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/checklists')
        .set(auth(inspectorToken))
        .send({
          code: 'E2E-ROLE-CL2',
          name: 'Nope',
          normTypeCode: NORM_CODE,
          assetTypes: ['e2erole'],
        })
        .expect(403);
    });

    it('ORG_ADMIN can create a location-type (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/location-types')
        .set(auth(adminToken))
        .send({ code: 'e2erolelt', name: 'E2E Role LocationType', normTypes: ['NEN1010'] })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.orgId).toBe(orgId);
    });

    it('INSPECTEUR cannot create a location-type (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/location-types')
        .set(auth(inspectorToken))
        .send({ code: 'e2erolelt2', name: 'Nope' })
        .expect(403);
    });
  });
});
