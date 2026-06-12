import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Cross-tenant foreign-key attack suite.
 *
 * Two organizations (A and B) each own their own entities. Acting as org A's
 * admin, we attempt to reference org B's UUIDs in create/update endpoints.
 * Every attempt must be rejected (403) by the service-level FK org checks
 * (`assertSameOrg` / `assertAllSameOrg`). Positive controls confirm that
 * same-org references still succeed.
 *
 * Note: requests hit 127.0.0.1 (unknown host) so the TenantGuard does not
 * scope these — the isolation under test is purely the service-layer checks.
 */
describe('Cross-tenant FK isolation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Org A (attacker)
  let orgAId: string;
  let userAId: string;
  let contactAId: string;
  let groupAId: string;
  let tokenA: string;

  // Org B (victim)
  let orgBId: string;
  let userBId: string;
  let contactBId: string;
  let locationBId: string;
  let quoteBId: string;
  let productBId: string;
  let contactPersonBId: string;
  let groupBId: string;

  const createdPlanningIds: string[] = [];
  const createdTaskIds: string[] = [];

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

    // ─── Org A (attacker) ───────────────────────────────
    const orgA = await prisma.organization.create({
      data: { name: 'E2E XTenant Org A', slug: 'e2extenanta' },
    });
    orgAId = orgA.id;

    const userA = await prisma.user.create({
      data: {
        email: 'e2e-xtenant-a@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'A',
        roles: ['ORG_ADMIN'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    userAId = userA.id;

    const contactA = await prisma.contact.create({
      data: {
        orgId: orgA.id,
        type: 'COMPANY',
        companyName: 'Contact A',
        email: 'contact-a@test.nl',
        ownerId: userA.id,
      },
    });
    contactAId = contactA.id;

    const groupA = await prisma.customerGroup.create({
      data: { orgId: orgA.id, name: 'Groep A' },
    });
    groupAId = groupA.id;

    // ─── Org B (victim) ─────────────────────────────────
    const orgB = await prisma.organization.create({
      data: { name: 'E2E XTenant Org B', slug: 'e2extenantb' },
    });
    orgBId = orgB.id;

    const userB = await prisma.user.create({
      data: {
        email: 'e2e-xtenant-b@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'B',
        roles: ['INSPECTEUR'],
        orgId: orgB.id,
        emailVerifiedAt: new Date(),
      },
    });
    userBId = userB.id;

    const contactB = await prisma.contact.create({
      data: {
        orgId: orgB.id,
        type: 'COMPANY',
        companyName: 'Contact B',
        email: 'contact-b@test.nl',
        ownerId: userB.id,
      },
    });
    contactBId = contactB.id;

    const locationB = await prisma.location.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        name: 'Locatie B',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    locationBId = locationB.id;

    const productB = await prisma.product.create({
      data: { orgId: orgB.id, name: 'Product B', unit: 'stuk' },
    });
    productBId = productB.id;

    const contactPersonB = await prisma.contactPerson.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        firstName: 'Persoon',
        lastName: 'B',
      },
    });
    contactPersonBId = contactPersonB.id;

    const quoteB = await prisma.quote.create({
      data: {
        orgId: orgB.id,
        quoteNumber: 'E2E-XTENANT-B-001',
        contactId: contactB.id,
        subject: 'Offerte B',
        createdBy: userB.id,
      },
    });
    quoteBId = quoteB.id;

    const groupB = await prisma.customerGroup.create({
      data: { orgId: orgB.id, name: 'Groep B' },
    });
    groupBId = groupB.id;

    // Login as org A's admin
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-xtenant-a@test.nl', password: 'TestPass123!' });
    tokenA = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId];
    const userIds = [userAId, userBId];

    try {
      await prisma.planningInspector.deleteMany({
        where: { planningItemId: { in: createdPlanningIds } },
      });
      await prisma.planningSession.deleteMany({
        where: { planningItemId: { in: createdPlanningIds } },
      });
      await prisma.planningHistory.deleteMany({
        where: { planningItemId: { in: createdPlanningIds } },
      });
      await prisma.planningItem.deleteMany({
        where: { id: { in: createdPlanningIds } },
      });
      await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
      await prisma.contactCustomerGroup.deleteMany({
        where: { contactId: { in: [contactAId, contactBId] } },
      });
      await prisma.customerGroup.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contactPerson.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.location.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.quote.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.product.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      // Altijd sluiten, anders blijft jest hangen op open handles
      await app.close();
    }
  });

  // ─── Planning create ──────────────────────────────────
  describe('POST /api/v1/planning — cross-tenant FK in create', () => {
    const base = { productName: 'Inspectie' };

    it('rejects a cross-tenant contactId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactBId })
        .expect(403);
    });

    it('rejects a cross-tenant locationId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, locationId: locationBId })
        .expect(403);
    });

    it('rejects a cross-tenant quoteId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, quoteId: quoteBId })
        .expect(403);
    });

    it('rejects a cross-tenant productId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, productId: productBId })
        .expect(403);
    });

    it('rejects a cross-tenant contactPersonId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, contactPersonId: contactPersonBId })
        .expect(403);
    });

    it('allows an all-same-org planning item (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId })
        .expect(201);

      expect(res.body.success).toBe(true);
      createdPlanningIds.push(res.body.data.id);
    });
  });

  // ─── Planning assignInspectors ────────────────────────
  describe('POST /api/v1/planning/:id/assign — cross-tenant inspector', () => {
    let planningId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/planning')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ productName: 'Inspectie', contactId: contactAId });
      planningId = res.body.data.id;
      createdPlanningIds.push(planningId);
    });

    it('rejects assigning an inspector from another org', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/planning/${planningId}/assign`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inspectorIds: [userBId] })
        .expect(403);
    });

    it('allows assigning an inspector from the same org (positive control)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/planning/${planningId}/assign`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inspectorIds: [userAId] })
        .expect(201);
    });
  });

  // ─── Tasks ────────────────────────────────────────────
  describe('POST/PATCH /api/v1/tasks — cross-tenant entity & assignee', () => {
    it('rejects a task linked to a cross-tenant contact', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Attack', entityType: 'CONTACT', entityId: contactBId })
        .expect(403);
    });

    it('rejects a task linked to a cross-tenant quote', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Attack', entityType: 'QUOTE', entityId: quoteBId })
        .expect(403);
    });

    it('rejects a task assigned to a cross-tenant user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Attack',
          entityType: 'CONTACT',
          entityId: contactAId,
          assigneeId: userBId,
        })
        .expect(403);
    });

    it('allows a same-org task (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          title: 'Legit',
          entityType: 'CONTACT',
          entityId: contactAId,
          assigneeId: userAId,
        })
        .expect(201);
      createdTaskIds.push(res.body.data.id);
    });

    it('rejects reassigning a task to a cross-tenant user', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'Reassign target', entityType: 'CONTACT', entityId: contactAId });
      const taskId = createRes.body.data.id;
      createdTaskIds.push(taskId);

      await request(app.getHttpServer())
        .patch(`/api/v1/tasks/${taskId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assigneeId: userBId })
        .expect(403);
    });
  });

  // ─── Contacts customer groups ─────────────────────────
  describe('PATCH /api/v1/contacts/:id/groups — cross-tenant customer group', () => {
    it('rejects linking a customer group from another org', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/contacts/${contactAId}/groups`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ groupIds: [groupBId] })
        .expect(403);
    });

    it('allows linking a same-org customer group (positive control)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/contacts/${contactAId}/groups`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ groupIds: [groupAId] })
        .expect(200);
    });
  });
});
