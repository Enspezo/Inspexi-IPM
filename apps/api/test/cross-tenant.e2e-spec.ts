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
  let locationAId: string;
  let contactPersonAId: string;
  let tokenA: string;

  // Org B (victim)
  let orgBId: string;
  let userBId: string;
  let contactBId: string;
  let locationBId: string;
  let locationTypeBId: string;
  let quoteBId: string;
  let productBId: string;
  let contactPersonBId: string;
  let groupBId: string;
  let templateBId: string;
  let planBId: string;
  let assetBId: string;
  let categoryBId: string;
  let ticketBId: string; // org B support-ticket (victim) — read/mutate isolation
  let certBId: string; // org B inspector-certificate (victim) — read/create isolation
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

  // PR-2 (cross-tenant FK) extra fixtures
  let requestBId: string; // org B request (victim) — projects/quotes requestId attack
  let requestAId: string; // org A request (own) — requests update attack target
  let quoteAId: string; // org A CONCEPT quote (own) — quotes update attack target
  let projectAId: string; // org A project (own) — projects update attack target

  const createdPlanningIds: string[] = [];
  const createdTaskIds: string[] = [];
  // NB: rows created by PR-2 positive controls are swept by the orgId-bulk
  // deletes in afterAll, so no per-id tracking arrays are needed.

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

    // Org A's eigen locatie (PATCH-doelwit voor de cross-tenant locationType-aanval).
    const locationA = await prisma.location.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        name: 'Locatie A',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    locationAId = locationA.id;

    const contactPersonA = await prisma.contactPerson.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        firstName: 'Persoon',
        lastName: 'A',
      },
    });
    contactPersonAId = contactPersonA.id;

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

    // Org B's eigen CRM-locatietype (body-FK aanval: org A probeert dit te koppelen).
    const locationTypeB = await prisma.locationTypeDefinition.create({
      data: {
        orgId: orgB.id,
        code: 'e2extlocb',
        name: 'XTenant LocationType B',
        scope: 'CRM',
        isSystem: false,
      },
    });
    locationTypeBId = locationTypeB.id;

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

    // ─── PR-2: cross-tenant FK fixtures ─────────────────
    const requestB = await prisma.request.create({
      data: { orgId: orgB.id, contactId: contactB.id, source: 'MANUAL', title: 'Aanvraag B', createdBy: userB.id },
    });
    requestBId = requestB.id;
    const requestA = await prisma.request.create({
      data: { orgId: orgA.id, contactId: contactA.id, source: 'MANUAL', title: 'Aanvraag A', createdBy: userA.id },
    });
    requestAId = requestA.id;
    const quoteA = await prisma.quote.create({
      data: { orgId: orgA.id, quoteNumber: 'E2E-XTENANT-A-001', contactId: contactA.id, subject: 'Offerte A', status: 'CONCEPT', createdBy: userA.id },
    });
    quoteAId = quoteA.id;
    const projectA = await prisma.project.create({
      data: { orgId: orgA.id, projectNumber: 'E2E-XT-A-P001', title: 'Project A', contactId: contactA.id, projectManagerId: userA.id, createdBy: userA.id },
    });
    projectAId = projectA.id;

    // Support-ticket van org B (slachtoffer) — org A mag dit niet zien/muteren.
    const ticketB = await prisma.supportTicket.create({
      data: {
        orgId: orgB.id,
        ticketNumber: 1,
        subject: 'Ticket B',
        description: 'Vertrouwelijk voor org B',
        createdById: userB.id,
        lastMessageAt: new Date(),
        messages: {
          create: [{ orgId: orgB.id, authorId: userB.id, authorType: 'USER', body: 'Vertrouwelijk voor org B' }],
        },
      },
    });
    ticketBId = ticketB.id;

    // Inspecteur-certificaat van org B (slachtoffer) — org A mag dit niet zien/maken (PRD-11).
    const certB = await prisma.inspectorCertificate.create({
      data: {
        orgId: orgB.id,
        userId: userB.id,
        type: 'VCA-VOL',
        issueDate: new Date('2024-01-01'),
        issuer: 'Examenbureau B',
      },
    });
    certBId = certB.id;

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
      await prisma.locationContactPerson.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contactPerson.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.pdokApiLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.location.deleteMany({ where: { orgId: { in: orgIds } } });
      // Org-eigen locatietypes (systeem-types met orgId null worden niet geraakt).
      await prisma.locationTypeDefinition.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.quote.deleteMany({ where: { orgId: { in: orgIds } } });
      // PR-2 fixtures: requestStatusHistory → request → project (children first);
      // quote is already gone above (quote.requestId → request).
      await prisma.requestStatusHistory.deleteMany({ where: { request: { orgId: { in: orgIds } } } });
      await prisma.request.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.project.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.note.deleteMany({ where: { orgId: { in: orgIds }, parentId: { not: null } } });
      await prisma.note.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.product.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      // Support-tickets (berichten cascaden, maar expliciet voor de zekerheid).
      await prisma.supportTicketMessage.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.supportTicket.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.syncQueue.deleteMany({ where: { userId: { in: userIds } } });
      // Numbering schemes are auto-provisioned when requests/quotes/projects/products
      // are created, so drop counters + schemes before the orgs they reference.
      await prisma.numberingCounter.deleteMany({ where: { scheme: { orgId: { in: orgIds } } } });
      await prisma.numberingScheme.deleteMany({ where: { orgId: { in: orgIds } } });
      // Inspecteur-certificaten (PRD-11) vóór de users/orgs waar ze naar verwijzen.
      await prisma.inspectorCertificate.deleteMany({ where: { orgId: { in: orgIds } } });
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

  // ─── Contact locations: cross-tenant locationTypeId (body FK → 403) ───
  // assertLocationTypeUsable weigert een locatietype van een andere org (403),
  // maar staat gezaaide systeem CRM-types (orgId null) toe als positieve controle.
  describe('contact locations — cross-tenant locationTypeId', () => {
    it("rejects creating a location with another org's locationTypeId (403)", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/contacts/${contactAId}/locations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Sneaky',
          street: 'Teststraat',
          houseNumber: '2',
          postalCode: '1000AB',
          city: 'Teststad',
          locationTypeId: locationTypeBId,
        })
        .expect(403);
    });

    it("rejects patching a location to another org's locationTypeId (403)", async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/contacts/locations/${locationAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locationTypeId: locationTypeBId })
        .expect(403);
    });

    it("rejects PDOK-refreshing another org's location (403)", async () => {
      // Org-ownership wordt vóór elke PDOK-call gecontroleerd, dus dit raakt
      // nooit het externe PDOK en schrijft geen PdokApiLog-rij.
      await request(app.getHttpServer())
        .post(`/api/v1/contacts/locations/${locationBId}/pdok-refresh`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ confirm: false })
        .expect(403);

      const logs = await prisma.pdokApiLog.count({ where: { locationId: locationBId } });
      expect(logs).toBe(0);
    });

    it('allows a location with a system CRM locationType (positive control)', async () => {
      const systemType = await prisma.locationTypeDefinition.findFirst({
        where: { code: 'woning', orgId: null, scope: 'CRM' },
      });
      expect(systemType).toBeTruthy();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/contacts/${contactAId}/locations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Legitieme woning',
          street: 'Teststraat',
          houseNumber: '3',
          postalCode: '1000AC',
          city: 'Teststad',
          locationTypeId: systemType!.id,
        })
        .expect(201);

      expect(res.body.data.locationTypeId).toBe(systemType!.id);
      expect(res.body.data.locationType).toMatchObject({ code: 'woning' });
    });
  });

  // ─── Contactpersoon → locatie koppeling (body FK → 403) ───
  // addContactPersonLocation weigert een locatie van een andere org (403) en
  // weigert een contactpersoon van een andere org (404/403 via findContactPerson).
  describe('POST /api/v1/contacts/contact-persons/:personId/locations — cross-tenant', () => {
    it("rejects linking another org's location to an own contact person (403)", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/contacts/contact-persons/${contactPersonAId}/locations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locationId: locationBId })
        .expect(403);
    });

    it("rejects linking a location to another org's contact person (403)", async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/contacts/contact-persons/${contactPersonBId}/locations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locationId: locationAId })
        .expect(403);
    });

    it('allows linking an own location to an own contact person (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/contacts/contact-persons/${contactPersonAId}/locations`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locationId: locationAId, notes: 'Koppeling A' })
        .expect(201);

      expect(res.body.data.location).toMatchObject({ id: locationAId });
      expect(res.body.data.notes).toBe('Koppeling A');
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

  // ─── Cross-tenant detail reads (404, geen bestaan prijsgeven) ─────────
  // Een GET op een resource uit een andere org wordt org-scoped geladen, dus de
  // vreemde-org id valt buiten het filter → 404 (identiek aan een onbekend id),
  // consistent met de path-scoped asset/finding-checks hierboven. Géén 403: dat
  // zou het bestaan van andermans data verraden.
  describe('cross-tenant detail reads (404)', () => {
    it("returns 404 when reading another org's inspection plan", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${planBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
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
  // assets/findings/inspectieplannen laden allemaal met orgScope() → een id van
  // een andere org valt buiten het filter → 404 (identiek aan een onbekend id),
  // zodat we het bestaan van andermans data niet prijsgeven. Statuscodes volgen
  // de bestaande service-conventies (zie inspection-plans.service.findOne).
  describe('B2 — cross-tenant read isolation', () => {
    it('inspection-plan detail of another org → 404', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${planBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
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

  // ─── Projects create (PR-2) ───────────────────────────
  describe('POST /api/v1/projects — cross-tenant FK in create', () => {
    const base = { title: 'Project X' };

    it('rejects a cross-tenant contactId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactBId })
        .expect(403);
    });

    it('rejects a cross-tenant locationId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, locationId: locationBId })
        .expect(403);
    });

    it('rejects a cross-tenant projectManagerId', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, projectManagerId: userBId })
        .expect(403);
    });

    it("rejects hijacking another org's request via requestId", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, requestId: requestBId })
        .expect(403);
      // The victim's request must stay unlinked (no cross-tenant write).
      const req = await prisma.request.findUnique({ where: { id: requestBId } });
      expect(req?.projectId).toBeNull();
    });

    it("rejects hijacking another org's quote via quoteId", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId, quoteId: quoteBId })
        .expect(403);
      const q = await prisma.quote.findUnique({ where: { id: quoteBId } });
      expect(q?.projectId).toBeNull();
    });

    it('allows an all-same-org project (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ ...base, contactId: contactAId })
        .expect(201);
      // NB: the projects controller returns the entity unwrapped (no {success,data}
      // envelope), unlike notes/requests/quotes — pre-existing inconsistency.
      expect(res.body.id).toBeTruthy();
    });
  });

  // ─── Projects update (PR-2) ───────────────────────────
  describe('PATCH /api/v1/projects/:id — cross-tenant FK in update', () => {
    it('rejects reassigning to a cross-tenant projectManagerId', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ projectManagerId: userBId })
        .expect(403);
    });

    it('allows reassigning to a same-org user (positive control)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/projects/${projectAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ projectManagerId: userAId })
        .expect(200);
    });
  });

  // ─── Notes create (PR-2) ──────────────────────────────
  describe('POST /api/v1/notes — cross-tenant entity', () => {
    it("rejects a note on another org's contact", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ entityType: 'CONTACT', entityId: contactBId, content: 'x' })
        .expect(403);
    });

    it("rejects a note on another org's quote", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ entityType: 'QUOTE', entityId: quoteBId, content: 'x' })
        .expect(403);
    });

    it("rejects a note referencing another org's user", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ entityType: 'USER', entityId: userBId, content: 'x' })
        .expect(403);
    });

    it('allows a note on an own contact (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/notes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ entityType: 'CONTACT', entityId: contactAId, content: 'x' })
        .expect(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Requests create/update (PR-2) ────────────────────
  describe('POST/PATCH /api/v1/requests — cross-tenant assignee', () => {
    it('rejects a request assigned to a cross-tenant user', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ contactId: contactAId, source: 'MANUAL', title: 'Aanvraag X', assignedTo: userBId })
        .expect(403);
    });

    it('rejects reassigning a request to a cross-tenant user', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${requestAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ assignedTo: userBId })
        .expect(403);
    });

    it('allows a same-org request with own assignee (positive control)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ contactId: contactAId, source: 'MANUAL', title: 'Aanvraag OK', assignedTo: userAId })
        .expect(201);
      expect(res.body.success).toBe(true);
    });
  });

  // ─── Quotes create/update (PR-2) ──────────────────────
  describe('POST/PATCH /api/v1/quotes — cross-tenant FK', () => {
    it("rejects a quote citing another org's request", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ contactId: contactAId, subject: 'Offerte X', requestId: requestBId })
        .expect(403);
    });

    it('rejects repointing a CONCEPT quote to a cross-tenant contact', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quoteAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ contactId: contactBId })
        .expect(403);
    });

    it('rejects repointing a CONCEPT quote to a cross-tenant location', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quoteAId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ locationId: locationBId })
        .expect(403);
    });
  });

  // ─── Support-tickets — cross-tenant read/mutate isolatie ─────────────
  describe('Support tickets — cross-tenant isolatie', () => {
    it('rejects reading another org\'s ticket (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/support-tickets/${ticketBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(403);
    });

    it('does not leak another org\'s ticket in the org list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/support-tickets?scope=org')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const ids = res.body.data.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(ticketBId);
    });

    it('rejects posting a message to another org\'s ticket (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/support-tickets/${ticketBId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ body: 'inject' })
        .expect(403);
    });

    it('rejects mutating another org\'s ticket (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${ticketBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ status: 'OPGELOST' })
        .expect(403);
    });
  });

  // ─── Inspecteur-certificaten — cross-tenant isolatie (PRD-11) ────────
  // Een GET op andermans certificaat wordt org-scoped geladen → 404 (geen leak);
  // aanmaken voor een inspecteur uit een andere org → 403 (assertSameOrg-stijl).
  describe('Inspector certificates — cross-tenant isolatie', () => {
    it("rejects reading another org's certificate (404)", async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspector-certificates/${certBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it("does not leak another org's certificate when querying its userId", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/inspector-certificates')
        .query({ userId: userBId })
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body.data.data).toHaveLength(0);
    });

    it("rejects creating a certificate for another org's inspector (403)", async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokenA}`)
        .field('userId', userBId)
        .field('type', 'Sneaky')
        .field('issueDate', '2024-01-01')
        .field('issuer', 'X')
        .expect(403);
    });
  });
});
