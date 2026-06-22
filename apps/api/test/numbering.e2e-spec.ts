import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * End-to-end coverage for configurable record numbering: generated numbers on
 * create, scheme config (GET/PATCH/preview) with ORG_ADMIN enforcement and
 * placeholder validation, manual entry allowed-vs-blocked, and cross-tenant
 * isolation of both schemes and numbers.
 */
describe('Numbering (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let adminId: string;
  let inspectorId: string;
  let contactId: string;
  let adminToken: string;
  let inspectorToken: string;

  let foreignOrgId: string;
  let foreignUserId: string;
  let foreignContactId: string;
  let foreignToken: string;

  const createdRequestIds: string[] = [];
  const createdProductIds: string[] = [];
  const year = new Date().getFullYear();

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
      data: { name: 'E2E Numbering Org', slug: 'e2enumbering' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-numbering-admin@test.nl',
        passwordHash,
        firstName: 'Num',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const inspector = await prisma.user.create({
      data: {
        email: 'e2e-numbering-inspector@test.nl',
        passwordHash,
        firstName: 'Num',
        lastName: 'Inspector',
        roles: ['INSPECTEUR'],
        orgId,
        emailVerifiedAt: new Date(),
      },
    });
    inspectorId = inspector.id;

    const contact = await prisma.contact.create({
      data: {
        orgId,
        type: 'COMPANY',
        companyName: 'E2E Numbering Contact',
        email: 'e2e-numbering-contact@test.nl',
        ownerId: admin.id,
      },
    });
    contactId = contact.id;

    const foreignOrg = await prisma.organization.create({
      data: { name: 'E2E Numbering Foreign', slug: 'e2enumberingforeign' },
    });
    foreignOrgId = foreignOrg.id;
    const foreignUser = await prisma.user.create({
      data: {
        email: 'e2e-numbering-foreign@test.nl',
        passwordHash,
        firstName: 'Foreign',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: foreignOrg.id,
        emailVerifiedAt: new Date(),
      },
    });
    foreignUserId = foreignUser.id;
    const foreignContact = await prisma.contact.create({
      data: {
        orgId: foreignOrg.id,
        type: 'COMPANY',
        companyName: 'E2E Foreign Contact',
        email: 'e2e-numbering-foreign-contact@test.nl',
        ownerId: foreignUser.id,
      },
    });
    foreignContactId = foreignContact.id;

    const login = async (email: string) =>
      (
        await request(app.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email, password: 'TestPass123!' })
      ).body.data.accessToken;

    adminToken = await login('e2e-numbering-admin@test.nl');
    inspectorToken = await login('e2e-numbering-inspector@test.nl');
    foreignToken = await login('e2e-numbering-foreign@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.requestStatusHistory.deleteMany({
        where: { request: { orgId: { in: [orgId, foreignOrgId] } } },
      });
      await prisma.request.deleteMany({ where: { orgId: { in: [orgId, foreignOrgId] } } });
      await prisma.product.deleteMany({ where: { orgId: { in: [orgId, foreignOrgId] } } });
      await prisma.numberingCounter.deleteMany({
        where: { scheme: { orgId: { in: [orgId, foreignOrgId] } } },
      });
      await prisma.numberingScheme.deleteMany({
        where: { orgId: { in: [orgId, foreignOrgId] } },
      });
      await prisma.auditLog.deleteMany({ where: { userId: { in: [adminId, inspectorId, foreignUserId] } } });
      await prisma.contact.deleteMany({ where: { id: { in: [contactId, foreignContactId] } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [adminId, inspectorId, foreignUserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, inspectorId, foreignUserId] } },
      });
      await prisma.organization.deleteMany({ where: { id: { in: [orgId, foreignOrgId] } } });
    } finally {
      await app.close();
    }
  });

  describe('Scheme configuration', () => {
    it('auto-provisions the four schemes on first list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/numbering-schemes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const models = res.body.data.map((s: { model: string }) => s.model).sort();
      expect(models).toEqual(['PRODUCT', 'PROJECT', 'QUOTE', 'REQUEST']);
    });

    it('returns a preview example without mutating the counter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/numbering-schemes/QUOTE/preview')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(typeof res.body.data.example).toBe('string');
      expect(res.body.data.example).toContain('OFF-');
    });

    it('updates a scheme (ORG_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .patch('/api/v1/numbering-schemes/PRODUCT')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ prefix: 'ART-', digits: 5 })
        .expect(200);

      expect(res.body.data.prefix).toBe('ART-');
      expect(res.body.data.digits).toBe(5);
    });

    it('rejects a placeholder not allowed for the model (400)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/numbering-schemes/REQUEST')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ prefix: 'AANV-[groep]-' }) // [groep] is PRODUCT-only
        .expect(400);
    });

    it('rejects illegal characters in the prefix (400)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/numbering-schemes/REQUEST')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ prefix: 'AA NV#' })
        .expect(400);
    });

    it('forbids a non-admin from updating a scheme (403)', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/numbering-schemes/PRODUCT')
        .set('Authorization', `Bearer ${inspectorToken}`)
        .send({ prefix: 'X-' })
        .expect(403);
    });
  });

  describe('Generated numbers on create', () => {
    it('assigns a sequential requestNumber on create', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId, source: 'MANUAL', title: 'Eerste aanvraag' })
        .expect(201);

      createdRequestIds.push(res.body.data.id);
      expect(res.body.data.requestNumber).toMatch(new RegExp(`^AANV-${year}-\\d{4}$`));
    });

    it('increments the number on the next create', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId, source: 'MANUAL', title: 'Tweede aanvraag' })
        .expect(201);

      createdRequestIds.push(res.body.data.id);
      const first = await prisma.request.findFirst({
        where: { id: createdRequestIds[0] },
        select: { requestNumber: true },
      });
      const a = parseInt(first!.requestNumber!.split('-')[2], 10);
      const b = parseInt(res.body.data.requestNumber.split('-')[2], 10);
      expect(b).toBe(a + 1);
    });

    it('assigns a productCode using the configured prefix/digits', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'E2E Product', unit: 'uur' })
        .expect(201);

      createdProductIds.push(res.body.data.id);
      // PRODUCT scheme was patched to prefix ART- with 5 digits above.
      expect(res.body.data.productCode).toMatch(/^ART-\d{5}$/);
    });
  });

  describe('Manual entry', () => {
    it('blocks a manual number while allowManualEntry is off (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId, source: 'MANUAL', title: 'Handmatig geblokkeerd', requestNumber: 'HAND-001' })
        .expect(400);
    });

    it('accepts a manual number once allowManualEntry is enabled', async () => {
      await request(app.getHttpServer())
        .patch('/api/v1/numbering-schemes/REQUEST')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ allowManualEntry: true })
        .expect(200);

      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId, source: 'MANUAL', title: 'Handmatig toegestaan', requestNumber: 'HAND-2026-001' })
        .expect(201);

      createdRequestIds.push(res.body.data.id);
      expect(res.body.data.requestNumber).toBe('HAND-2026-001');
    });

    it('rejects a duplicate manual number (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ contactId, source: 'MANUAL', title: 'Dubbel handmatig', requestNumber: 'HAND-2026-001' })
        .expect(409);
    });
  });

  describe('Cross-tenant isolation', () => {
    it('serves each org its own schemes', async () => {
      const mine = await request(app.getHttpServer())
        .get('/api/v1/numbering-schemes')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      const theirs = await request(app.getHttpServer())
        .get('/api/v1/numbering-schemes')
        .set('Authorization', `Bearer ${foreignToken}`)
        .expect(200);

      const mineIds = new Set(mine.body.data.map((s: { id: string }) => s.id));
      const theirIds = theirs.body.data.map((s: { id: string }) => s.id);
      expect(theirIds.some((id: string) => mineIds.has(id))).toBe(false);
    });

    it('numbers are unique per org, not globally', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${foreignToken}`)
        .send({ contactId: foreignContactId, source: 'MANUAL', title: 'Foreign aanvraag' })
        .expect(201);

      createdRequestIds.push(res.body.data.id);
      // Foreign org's first request starts its own counter (…-0001), independent of the main org.
      expect(res.body.data.requestNumber).toMatch(new RegExp(`^AANV-${year}-0001$`));
    });
  });
});
