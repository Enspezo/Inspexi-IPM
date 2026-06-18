import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
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
  let templateBId: string;
  let planBId: string;
  let assetBId: string;
  let categoryBId: string;
  let cmBId: string;
  // Stream B — extra org-B fixtures (read-isolatie + body-FK aanvallen)
  let findingBId: string;
  let assetTypeBId: string;
  let findingTemplateBId: string;
  // Stream B — org-A inspectiedomein-fixtures (positieve controles + read-isolatie)
  let assetTypeAId: string;
  let planAId: string;
  let assetAId: string;
  let findingAId: string;
  let findingTemplateAId: string;

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

    // ─── Inspectiedomein-fixtures (Fase 2) ──────────────
    // Globale norm (geen orgId) zodat org A's positieve controles slagen.
    await prisma.normTypeDefinition.create({
      data: { code: 'e2extnorm', label: 'XTenant Norm', createdBy: userA.id, isActive: true, assetTypes: [] },
    });
    // Org B's inspectie-template (vereist een classificatiemodel).
    const cmB = await prisma.classificationModel.create({
      data: { code: 'e2extcm', name: 'Classificatie B', createdBy: userB.id },
    });
    cmBId = cmB.id;
    const templateB = await prisma.inspectionTemplate.create({
      data: {
        orgId: orgB.id,
        code: 'e2exttpl',
        name: 'Template B',
        normTypeCode: 'e2extnorm',
        classificationModelId: cmB.id,
        createdBy: userB.id,
      },
    });
    templateBId = templateB.id;
    // Org B's plan + asset (voor path-scoped isolatie-tests).
    const planB = await prisma.inspectionPlan.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        projectName: 'Plan B',
        normTypeCode: 'e2extnorm',
        createdBy: userB.id,
      },
    });
    planBId = planB.id;
    const assetB = await prisma.asset.create({
      data: {
        orgId: orgB.id,
        inspectionPlanId: planB.id,
        assetType: 'kast',
        name: 'Asset B',
        createdBy: userB.id,
      },
    });
    assetBId = assetB.id;
    // Org B's categorie (config org+systeem) voor finding-template body-FK test.
    const categoryB = await prisma.category.create({
      data: { orgId: orgB.id, name: 'Categorie B', createdBy: userB.id },
    });
    categoryBId = categoryB.id;

    // ─── Stream B: extra org B-fixtures ─────────────────
    // Constatering op org B's asset (read-isolatie GET /findings/:id → 404).
    const findingB = await prisma.finding.create({
      data: {
        orgId: orgB.id,
        assetId: assetB.id,
        inspectionType: 'visual',
        shortDescription: 'Finding B',
        createdBy: userB.id,
      },
    });
    findingBId = findingB.id;
    // Org B's asset-type (config-isolatie GET/PATCH /asset-types/:id → 404).
    const assetTypeB = await prisma.assetTypeDefinition.create({
      data: { orgId: orgB.id, code: 'e2extatb', name: 'XTenant AssetType B', isSystem: false },
    });
    assetTypeBId = assetTypeB.id;
    // Org B's constatering-template (body-FK findingTemplateId aanval). CM's zijn globaal.
    const findingTemplateB = await prisma.findingTemplate.create({
      data: {
        orgId: orgB.id,
        code: 'e2extftb',
        shortDescription: 'Template B',
        classificationModelId: cmB.id,
        defaultClassification: {},
        createdBy: userB.id,
      },
    });
    findingTemplateBId = findingTemplateB.id;

    // ─── Stream B: org A-fixtures (positieve controles + read-isolatie) ──
    const assetTypeA = await prisma.assetTypeDefinition.create({
      data: { orgId: orgA.id, code: 'e2extata', name: 'XTenant AssetType A', isSystem: false },
    });
    assetTypeAId = assetTypeA.id;
    const planA = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        projectName: 'Plan A',
        normTypeCode: 'e2extnorm',
        createdBy: userA.id,
      },
    });
    planAId = planA.id;
    const assetA = await prisma.asset.create({
      data: {
        orgId: orgA.id,
        inspectionPlanId: planA.id,
        assetType: 'e2extata',
        name: 'Asset A',
        createdBy: userA.id,
      },
    });
    assetAId = assetA.id;
    const findingTemplateA = await prisma.findingTemplate.create({
      data: {
        orgId: orgA.id,
        code: 'e2extfta',
        shortDescription: 'Template A',
        classificationModelId: cmB.id,
        defaultClassification: {},
        createdBy: userA.id,
      },
    });
    findingTemplateAId = findingTemplateA.id;
    const findingA = await prisma.finding.create({
      data: {
        orgId: orgA.id,
        assetId: assetA.id,
        inspectionType: 'visual',
        shortDescription: 'Finding A',
        createdBy: userA.id,
      },
    });
    findingAId = findingA.id;

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
      // Inspectiedomein (kinderen eerst): finding → asset → plan → template → cm → norm
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.asset.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.findingTemplate.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionTemplate.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.assetTypeDefinition.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.category.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.classificationModel.deleteMany({ where: { code: 'e2extcm' } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: 'e2extnorm' } });
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
      await prisma.syncQueue.deleteMany({ where: { userId: { in: userIds } } });
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

  // ─── Inspection plans: create ─────────────────────────
  describe('POST /api/v1/inspection-plans — cross-tenant FK in create', () => {
    const base = { projectName: 'XTenant Plan', normTypeCode: 'e2extnorm' };

    it('rejects a cross-tenant contactId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactBId })
        .expect(403);
    });

    it('rejects a cross-tenant assignedTo', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, assignedTo: userBId })
        .expect(403);
    });

    it('rejects a cross-tenant reviewerId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, reviewerId: userBId })
        .expect(403);
    });

    it('rejects a cross-tenant installationResponsibleId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, installationResponsibleId: contactPersonBId })
        .expect(403);
    });

    it('rejects a cross-tenant inspectionTemplateId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, inspectionTemplateId: templateBId })
        .expect(403);
    });

    it('allows an all-same-org inspection plan (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId })
        .expect(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Inspection plans: update ─────────────────────────
  describe('PATCH /api/v1/inspection-plans/:id — cross-tenant FK in update', () => {
    let planId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ projectName: 'Update target', normTypeCode: 'e2extnorm', contactId: contactAId });
      planId = res.body.data.id;
    });

    it('rejects reassigning to a cross-tenant user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assignedTo: userBId })
        .expect(403);
    });

    it('allows reassigning to a same-org user (positive control)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assignedTo: userAId })
        .expect(200);
    });
  });

  // ─── Assets & findings: path-scoped isolation ─────────
  // Deze FK's komen via het URL-pad binnen en worden met orgScope() geladen,
  // dus een vreemde-org id wordt simpelweg niet gevonden → 404 (geen leak),
  // i.p.v. de 403 die body-FK assertSameOrg-checks geven.
  describe('cross-tenant path-scoped FKs (assets/findings)', () => {
    it('rejects creating an asset under a cross-tenant plan (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planBId}/assets`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assetType: 'kast', name: 'Sneaky' })
        .expect(404);
    });

    it('rejects creating a finding on a cross-tenant asset (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${assetBId}/findings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inspectionType: 'visual', shortDescription: 'Sneaky' })
        .expect(404);
    });

    it('rejects creating a location under a cross-tenant plan (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planBId}/locations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locationType: 'ruimte', name: 'Sneaky' })
        .expect(404);
    });

    it('rejects creating a visual-inspection on a cross-tenant asset (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${assetBId}/visual-inspections`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(404);
    });

    it('rejects creating a measurement-record on a cross-tenant asset (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${assetBId}/measurement-records`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(404);
    });

    it('rejects creating a standalone-measurement under a cross-tenant plan (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planBId}/standalone-measurements`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          locationId: '00000000-0000-0000-0000-000000000000',
          measurementType: 'isolatie',
        })
        .expect(404);
    });
  });

  // ─── Body-FK isolation (assertSameOrg → 403) ──────────
  describe('cross-tenant body FKs (inspection execution + config)', () => {
    it('rejects a measurement-sheet-record with a cross-tenant assetId (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-records')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          assetId: assetBId,
          templateId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(403);
    });

    it('rejects a finding-template with a cross-tenant categoryId (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/finding-templates')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          shortDescription: 'Sneaky',
          classificationModelId: cmBId,
          defaultClassification: {},
          categoryId: categoryBId,
        })
        .expect(403);
    });
  });

  // ─── B1: asset/finding body-FK hardening + positieve controles ──────
  // De asset-/finding-create FK's worden org-scoped geladen met assertFound
  // (ouder binnen hetzelfde plan; template binnen org-of-systeem), dus een
  // vreemde-org id wordt niet gevonden → 404 (geen leak), niet 403.
  describe('B1 — assets/findings body-FK isolation', () => {
    it('rejects an asset whose parentAssetId belongs to another org (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planAId}/assets`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assetType: 'e2extata', name: 'Sneaky child', parentAssetId: assetBId })
        .expect(404);
    });

    it('allows an asset with an own-org parent (positive control)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planAId}/assets`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assetType: 'e2extata', name: 'Legit child', parentAssetId: assetAId })
        .expect(201);
    });

    it("rejects patching another org's asset (404)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${assetBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('allows patching an own-org asset (positive control)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/assets/${assetAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Asset A (bijgewerkt)' })
        .expect(200);
    });

    it('rejects a finding whose findingTemplateId belongs to another org (404)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${assetAId}/findings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inspectionType: 'visual',
          shortDescription: 'Sneaky',
          findingTemplateId: findingTemplateBId,
        })
        .expect(404);
    });

    it('allows a finding with an own-org findingTemplate (positive control)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/assets/${assetAId}/findings`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inspectionType: 'visual',
          shortDescription: 'Legit',
          findingTemplateId: findingTemplateAId,
        })
        .expect(201);
    });
  });

  // ─── B1: asset-types config-isolatie ───────────────────────────────
  // asset-types worden org-scoped geladen (eigen org OR systeem) → 404.
  describe('B1 — asset-types isolation', () => {
    it("rejects reading another org's asset-type (404)", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/asset-types/${assetTypeBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it("rejects updating another org's asset-type (404)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/asset-types/${assetTypeBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'Hacked' })
        .expect(404);
    });

    it('allows reading an own-org asset-type (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/asset-types/${assetTypeAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.data.id).toBe(assetTypeAId);
    });
  });

  // ─── B2: cross-tenant read-isolatie (detail-reads) ─────────────────
  // assets/findings laden met orgScope() → niet gevonden → 404. Een
  // inspectieplan wordt zonder org-scope geladen en daarna expliciet op
  // eigenaarschap gecontroleerd (plan.orgId !== user.orgId) → 403. Beide
  // zijn lek-vrij; de statuscodes volgen de bestaande service-conventies.
  describe('B2 — cross-tenant read isolation', () => {
    it("inspection-plan detail of another org → 403", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${planBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('asset detail of another org → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/assets/${assetBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('finding detail of another org → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/findings/${findingBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('reads own-org plan/asset/finding (positive control)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${planAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/assets/${assetAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      await request(app.getHttpServer())
        .get(`/api/v1/findings/${findingAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
    });
  });

  // ─── Sync push: cross-tenant parent FKs ───────────────
  // Org A pushes records whose parent FK belongs to org B. The sync service
  // injects orgId from the parent hierarchy and validates it with
  // assertSameOrg, so the parent is "not the caller's" → the change is
  // reported in `errors` and NEVER written. Plan/asset of org B reuse the
  // suite's existing planBId/assetBId fixtures.
  describe('Sync push cross-tenant', () => {
    it('rejects an asset create referencing org B\'s plan (error, never written)', async () => {
      const clientAssetId = randomUUID();

      const res = await request(app.getHttpServer())
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          deviceId: 'dev-xtenant-a',
          changes: {
            assets: [
              {
                operation: 'create',
                data: {
                  id: clientAssetId,
                  inspectionPlanId: planBId,
                  assetType: 'electrical_installation',
                  name: 'Hack',
                },
              },
            ],
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.errors.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.errors.map((e: { entityId: string }) => e.entityId),
      ).toContain(clientAssetId);
      expect(res.body.data.processed.assets).toBe(0);

      const written = await prisma.asset.findUnique({ where: { id: clientAssetId } });
      expect(written).toBeNull();
    });

    it('rejects an update of org B\'s plan (error, original preserved)', async () => {
      const before = await prisma.inspectionPlan.findUnique({ where: { id: planBId } });

      const res = await request(app.getHttpServer())
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          deviceId: 'dev-xtenant-a',
          changes: {
            inspectionPlans: [
              { operation: 'update', data: { id: planBId, projectName: 'Hacked' } },
            ],
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.errors.length).toBeGreaterThanOrEqual(1);

      const after = await prisma.inspectionPlan.findUnique({ where: { id: planBId } });
      expect(after?.projectName).toBe(before?.projectName);
      expect(after?.projectName).not.toBe('Hacked');
    });

    it('rejects a finding create referencing org B\'s asset (error, never written)', async () => {
      const clientFindingId = randomUUID();

      const res = await request(app.getHttpServer())
        .post('/api/v1/sync/push')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          deviceId: 'dev-xtenant-a',
          changes: {
            findings: [
              {
                operation: 'create',
                data: {
                  id: clientFindingId,
                  assetId: assetBId,
                  inspectionType: 'visual',
                  shortDescription: 'x',
                },
              },
            ],
          },
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.errors.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.processed.findings).toBe(0);

      const written = await prisma.finding.findUnique({ where: { id: clientFindingId } });
      expect(written).toBeNull();
    });
  });
});
