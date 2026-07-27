/**
 * WP-C5 — Config-validatie & losse rest (e2e).
 *
 * Dekt per bevinding het afgesproken e2e-bewijs:
 * - B-505: gereserveerde/te korte/te lange slug → 400 NL.
 * - B-510: entitlement-vlag aanzetten zonder abonnement → 403 NL; uitzetten mag.
 * - B-313: PATCH inspectionTemplateId werkt (geen stille no-op meer).
 * - B-107: afgewezen plan-create laat géén weesplan achter (transactie + pre-validatie).
 * - B-506: veld met min > max → 400; publish-gate weigert bestaande foute templates.
 * - B-315 §1: VERLOREN zonder reden → 400; mét reden → 200 incl. lostReasonId.
 * - B-315 §8/§9: afkeuren zonder toelichting → 400; beoordelaar wordt vastgelegd.
 * - B-511 §7: GET /users/invitation/:token valideert vóór het formulier.
 * - B-001: GET /portal/stats/staff-dashboard levert de KPI-tellingen.
 * (B-153 — refresh zonder cookie → 401 — staat in auth.e2e-spec.ts.)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('WP-C5 config validation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let planOrgId: string; // org met een abonnement zonder AI_REVIEW/ONLINE_HERSTEL
  let subscriptionPlanId: string;
  let adminId: string;
  let planAdminId: string;
  let superuserId: string;
  let adminToken: string;
  let planAdminToken: string;
  let superuserToken: string;
  let contactId: string;
  let locationId: string;
  let templateId: string;
  let classificationModelId: string;
  let requestId: string;
  let lostReasonId: string;
  let reviewPlanId: string;
  let msTemplateId: string;
  let msSectionId: string;

  const NORM_CODE = 'E2EWPC5NORM';
  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'TestPass123!' });
    return res.body.data.accessToken as string;
  };

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

    // Orgs
    const org = await prisma.organization.create({
      data: { name: 'E2E WPC5 Org', slug: 'e2ewpc5' },
    });
    orgId = org.id;

    // Org mét een abonnement dat AI_REVIEW/ONLINE_HERSTEL NIET bevat (B-510):
    // op localhost geldt de gate alleen voor orgs met een niet-lege feature-set.
    const subscriptionPlan = await prisma.plan.create({
      data: {
        name: 'E2E WPC5 Basis',
        slug: 'e2ewpc5basis',
        features: { create: [{ featureKey: 'BASIS_CRM' }] },
      },
    });
    subscriptionPlanId = subscriptionPlan.id;
    const planOrg = await prisma.organization.create({
      data: { name: 'E2E WPC5 Basis Org', slug: 'e2ewpc5basis', planId: subscriptionPlan.id },
    });
    planOrgId = planOrg.id;

    // Users
    const admin = await prisma.user.create({
      data: {
        email: 'e2e-wpc5-admin@test.nl',
        passwordHash,
        firstName: 'WPC5',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    const planAdmin = await prisma.user.create({
      data: {
        email: 'e2e-wpc5-basisadmin@test.nl',
        passwordHash,
        firstName: 'WPC5',
        lastName: 'BasisAdmin',
        roles: ['ORG_ADMIN'],
        orgId: planOrg.id,
        emailVerifiedAt: new Date(),
      },
    });
    planAdminId = planAdmin.id;
    const superuser = await prisma.user.create({
      data: {
        email: 'e2e-wpc5-super@test.nl',
        passwordHash,
        firstName: 'WPC5',
        lastName: 'Super',
        roles: ['SUPERUSER'],
        emailVerifiedAt: new Date(),
      },
    });
    superuserId = superuser.id;

    // CRM-fixtures
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E WPC5 Contact',
        email: 'e2e-wpc5-contact@test.nl',
        ownerId: admin.id,
      },
    });
    contactId = contact.id;
    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E WPC5 Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1234AB',
        city: 'Teststad',
      },
    });
    locationId = location.id;

    // Norm + classificatiemodel + inspectietemplate (voor B-313)
    await prisma.normTypeDefinition.create({
      data: {
        code: NORM_CODE,
        label: 'E2E WPC5 Norm',
        createdBy: superuser.id,
        isActive: true,
        assetTypes: [],
      },
    });
    const classModel = await prisma.classificationModel.create({
      data: { code: 'E2EWPC5CLASS', name: 'E2E WPC5 Class', createdBy: superuser.id },
    });
    classificationModelId = classModel.id;
    const tpl = await prisma.inspectionTemplate.create({
      data: {
        isSystem: true,
        code: 'E2EWPC5TPL',
        name: 'E2E WPC5 Template',
        normTypeCode: NORM_CODE,
        classificationModelId: classModel.id,
        status: 'ACTIEF',
        createdBy: superuser.id,
      },
    });
    templateId = tpl.id;

    // Aanvraag + verliesreden (B-315 §1)
    const req = await prisma.request.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        requestNumber: 'E2E-WPC5-0001',
        title: 'E2E WPC5 aanvraag',
        source: 'EMAIL',
        status: 'NIEUW',
        createdBy: admin.id,
      },
    });
    requestId = req.id;
    const reason = await prisma.lostReason.create({
      data: { orgId: org.id, code: 'e2ewpc5prijs', label: 'E2E te duur' },
    });
    lostReasonId = reason.id;

    // Plan in pending_review (B-315 §8/§9)
    const reviewPlan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        projectName: 'E2E WPC5 review-plan',
        normTypeCode: NORM_CODE,
        statusCode: 'pending_review',
        submittedAt: new Date(),
        createdBy: admin.id,
      },
    });
    reviewPlanId = reviewPlan.id;

    // Meetstaat-template in CONCEPT met een bewust fout veld (B-506 publish-gate)
    const msTemplate = await prisma.measurementSheetTemplate.create({
      data: {
        code: 'E2E_WPC5_MS',
        name: 'E2E WPC5 meetstaat',
        normTypeCode: NORM_CODE,
        assetTypes: ['electrical_installation'],
        status: 'CONCEPT',
        version: '1.0',
        createdBy: superuser.id,
        sections: {
          create: [
            {
              code: 'algemeen',
              name: 'Algemeen',
              sortOrder: 0,
              fields: {
                create: [
                  {
                    code: 'omgekeerd',
                    name: 'Omgekeerde grenzen',
                    fieldType: 'NUMBER',
                    sortOrder: 0,
                    minValue: 100,
                    maxValue: 0,
                  },
                ],
              },
            },
          ],
        },
      },
      include: { sections: true },
    });
    msTemplateId = msTemplate.id;
    msSectionId = msTemplate.sections[0].id;

    adminToken = await login('e2e-wpc5-admin@test.nl');
    planAdminToken = await login('e2e-wpc5-basisadmin@test.nl');
    superuserToken = await login('e2e-wpc5-super@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.measurementSheetTemplate.deleteMany({
        where: { id: msTemplateId },
      });
      await prisma.inspectionPlanLocation.deleteMany({ where: { orgId } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId } });
      await prisma.assetNode.deleteMany({ where: { orgId } });
      await prisma.requestStatusHistory.deleteMany({
        where: { request: { orgId } },
      });
      await prisma.request.deleteMany({ where: { orgId } });
      await prisma.lostReason.deleteMany({ where: { orgId } });
      await prisma.inspectionTemplate.deleteMany({ where: { id: templateId } });
      await prisma.classificationModel.deleteMany({
        where: { id: classificationModelId },
      });
      await prisma.normTypeDefinition.deleteMany({ where: { code: NORM_CODE } });
      await prisma.location.deleteMany({ where: { orgId } });
      await prisma.contact.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [adminId, planAdminId, superuserId] } },
      });
      await prisma.invitation.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [adminId, planAdminId, superuserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, planAdminId, superuserId] } },
      });
      // Org die de B-505-test tussentijds aanmaakt.
      await prisma.organization.deleteMany({
        where: { slug: { in: ['e2ewpc5', 'e2ewpc5basis', 'e2ewpc5geldig'] } },
      });
      await prisma.plan.deleteMany({ where: { id: subscriptionPlanId } });
    } finally {
      await app.close();
    }
  });

  // ── B-505 — slug-validatie ────────────────────────────────────────────────
  describe('B-505 — reserved/lengte-validatie op organisatie-slug', () => {
    it.each(['mijn', 'www', 'api', 'admin', 'mail'])(
      'weigert gereserveerde slug "%s" met 400 + NL-melding',
      async (slug) => {
        const res = await request(app.getHttpServer())
          .post('/api/v1/organizations')
          .set('Authorization', `Bearer ${superuserToken}`)
          .send({ name: 'Reserved Test', slug })
          .expect(400);
        expect(res.body.message).toContain('gereserveerd');
      },
    );

    it('weigert een slug van 1 teken (MinLength 2)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'Kort', slug: 'a' })
        .expect(400);
      expect(res.body.message).toContain('minimaal 2');
    });

    it('weigert een slug langer dan 63 tekens (DNS-label)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'Lang', slug: 'x'.repeat(120) })
        .expect(400);
      expect(res.body.message).toContain('maximaal 63');
    });

    it('staat een geldige slug nog gewoon toe (201)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'Geldig Bedrijf', slug: 'e2ewpc5geldig' })
        .expect(201);
      expect(res.body.data.slug).toBe('e2ewpc5geldig');
    });

    it('B-511 §5: weigert een logoUrl met een script-schema (hygiëne)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({
          name: 'XSS Test',
          slug: 'e2ewpc5xss',
          logoUrl: 'javascript:alert(1)',
        })
        .expect(400);
    });
  });

  // ── B-510 — entitlement-vlaggen ───────────────────────────────────────────
  describe('B-510 — org-vlaggen vereisen het bijbehorende entitlement', () => {
    it('weigert aiReviewEnabled:true zonder AI_REVIEW met 403 + NL-melding', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${planOrgId}`)
        .set('Authorization', `Bearer ${planAdminToken}`)
        .send({ aiReviewEnabled: true })
        .expect(403);
      expect(res.body.message).toBe('AI-voorcontrole zit niet in uw abonnement');

      const row = await prisma.organization.findUnique({ where: { id: planOrgId } });
      expect(row?.aiReviewEnabled).toBe(false);
    });

    it('weigert onlineRepairDefault:true zonder ONLINE_HERSTEL met 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${planOrgId}`)
        .set('Authorization', `Bearer ${planAdminToken}`)
        .send({ onlineRepairDefault: true })
        .expect(403);
      expect(res.body.message).toBe('Online herstel zit niet in uw abonnement');
    });

    it('uitzetten mag altijd (ook zonder entitlement)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${planOrgId}`)
        .set('Authorization', `Bearer ${planAdminToken}`)
        .send({ aiReviewEnabled: false, onlineRepairDefault: false })
        .expect(200);
    });
  });

  // ── B-313 — inspectionTemplateId-mapping ─────────────────────────────────
  describe('B-313 — PATCH inspectionTemplateId is geen stille no-op meer', () => {
    it('koppelt en ontkoppelt de template daadwerkelijk', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contactId,
          projectName: 'E2E WPC5 template-plan',
          normTypeCode: NORM_CODE,
        })
        .expect(201);
      const planId = createRes.body.data.id;

      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectionTemplateId: templateId })
        .expect(200);

      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(getRes.body.data.inspectionTemplateId).toBe(templateId);
      expect(getRes.body.data.inspectionTemplate?.id).toBe(templateId);

      // Ontkoppelen met null.
      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ inspectionTemplateId: null })
        .expect(200);
      const getRes2 = await request(app.getHttpServer())
        .get(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(getRes2.body.data.inspectionTemplateId).toBeNull();
    });
  });

  // ── B-107 — atomische plan-create ────────────────────────────────────────
  describe('B-107 — afgewezen create laat geen weesplan achter', () => {
    const PROJECT_NAME = 'E2E WPC5 SEC08 weesplan-test';

    it('onbestaande scope-locatie → 404 én geen plan in de database', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contactId,
          locationId,
          projectName: PROJECT_NAME,
          normTypeCode: NORM_CODE,
          scopeLocationIds: ['00000000-0000-4000-8000-000000000000'],
        })
        .expect(404);

      const orphans = await prisma.inspectionPlan.count({
        where: { orgId, projectName: PROJECT_NAME },
      });
      expect(orphans).toBe(0);
    });

    it('scopeLocationIds zonder hoofdlocatie → 400 én geen plan', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          contactId,
          projectName: PROJECT_NAME,
          normTypeCode: NORM_CODE,
          scopeLocationIds: ['00000000-0000-4000-8000-000000000000'],
        })
        .expect(400);
      expect(res.body.message).toContain('hoofdlocatie');

      const orphans = await prisma.inspectionPlan.count({
        where: { orgId, projectName: PROJECT_NAME },
      });
      expect(orphans).toBe(0);
    });
  });

  // ── B-506 — meetstaat-grenzen ────────────────────────────────────────────
  describe('B-506 — min/max-validatie + publish-gate', () => {
    it('weigert een nieuw veld met min > max met 400 + NL-melding', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${msTemplateId}/sections/${msSectionId}/fields`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({
          code: 'su18_nieuw',
          name: 'SU18 nieuw veld',
          fieldType: 'NUMBER',
          minValue: 100,
          maxValue: 0,
        })
        .expect(400);
      expect(res.body.message).toContain('Maximum (0) moet groter of gelijk zijn aan het minimum (100)');
    });

    it('publish-gate: bestaand fout veld blokkeert publiceren met NL-uitleg', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${msTemplateId}/publish`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ changeDescription: 'E2E publish-gate' })
        .expect(400);
      expect(res.body.message).toContain('Omgekeerde grenzen');
      expect(res.body.message).toContain('corrigeer de grenzen voordat u publiceert');

      const row = await prisma.measurementSheetTemplate.findUnique({
        where: { id: msTemplateId },
      });
      expect(row?.status).toBe('CONCEPT');
    });

    it('na correctie van de grenzen publiceert het template wél', async () => {
      const field = await prisma.measurementSheetField.findFirst({
        where: { sectionId: msSectionId, code: 'omgekeerd' },
      });
      await request(app.getHttpServer())
        .patch(
          `/api/v1/measurement-sheet-templates/${msTemplateId}/sections/${msSectionId}/fields/${field!.id}`,
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ minValue: 0, maxValue: 100 })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${msTemplateId}/publish`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ changeDescription: 'E2E na correctie' })
        .expect(201);
    });
  });

  // ── B-315 §1 — VERLOREN vereist reden ────────────────────────────────────
  describe('B-315 §1 — aanvraag op VERLOREN vereist een reden', () => {
    it('VERLOREN zonder lostReasonId → 400 + NL-melding', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'VERLOREN' })
        .expect(400);
      expect(res.body.message).toContain('Kies een reden');
    });

    it('VERLOREN mét reden → 200 en reden + toelichting opgeslagen', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/requests/${requestId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: 'VERLOREN',
          lostReasonId,
          lostNote: 'E2E: gekozen voor concurrent',
        })
        .expect(200);
      expect(res.body.data.status).toBe('VERLOREN');
      expect(res.body.data.lostReasonId).toBe(lostReasonId);
      expect(res.body.data.lostNote).toBe('E2E: gekozen voor concurrent');
    });
  });

  // ── B-315 §8/§9 — review-verplichtingen ──────────────────────────────────
  describe('B-315 §8/§9 — afkeuren vereist toelichting; beoordelaar vastgelegd', () => {
    it('afkeuren zonder toelichting → 400 + NL-melding', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${reviewPlanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'reject' })
        .expect(400);
      expect(res.body.message).toContain('toelichting bij het afkeuren');
    });

    it('goedkeuren legt de beoordelaar vast op het plan (reviewerId)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${reviewPlanId}/review`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ decision: 'approve' })
        .expect(200);
      expect(res.body.data.statusCode).toBe('approved');
      expect(res.body.data.reviewerId).toBe(adminId);
      expect(res.body.data.reviewedAt).toBeTruthy();
    });
  });

  // ── B-511 §7 — uitnodiging valideren vóór het formulier ──────────────────
  describe('B-511 §7 — GET /users/invitation/:token', () => {
    it('geldige uitnodiging → 200 met e-mail + organisatienaam', async () => {
      const invitation = await prisma.invitation.create({
        data: {
          orgId,
          email: 'e2e-wpc5-invite@test.nl',
          role: 'BACKOFFICE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/invitation/${invitation.token}`)
        .expect(200);
      expect(res.body.data.email).toBe('e2e-wpc5-invite@test.nl');
      expect(res.body.data.organizationName).toBe('E2E WPC5 Org');
    });

    it('verlopen uitnodiging → 400 "Uitnodiging is verlopen"', async () => {
      const invitation = await prisma.invitation.create({
        data: {
          orgId,
          email: 'e2e-wpc5-verlopen@test.nl',
          role: 'BACKOFFICE',
          expiresAt: new Date(Date.now() - 60 * 1000),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/invitation/${invitation.token}`)
        .expect(400);
      expect(res.body.message).toBe('Uitnodiging is verlopen');
    });

    it('al geaccepteerde uitnodiging → 400 "Uitnodiging is al geaccepteerd"', async () => {
      const invitation = await prisma.invitation.create({
        data: {
          orgId,
          email: 'e2e-wpc5-gebruikt@test.nl',
          role: 'BACKOFFICE',
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          acceptedAt: new Date(),
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/users/invitation/${invitation.token}`)
        .expect(400);
      expect(res.body.message).toBe('Uitnodiging is al geaccepteerd');
    });

    it('onbekend token → 400 "Ongeldige uitnodiging"', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/invitation/00000000-0000-4000-8000-000000000000')
        .expect(400);
      expect(res.body.message).toBe('Ongeldige uitnodiging');
    });
  });

  // ── B-001 — staf-dashboard KPI's ─────────────────────────────────────────
  describe('B-001 — GET /portal/stats/staff-dashboard', () => {
    it('levert alle tellingen voor een SUPERUSER (impliciet alle features, alle orgs)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/stats/staff-dashboard')
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);

      const d = res.body.data;
      expect(typeof d.activeUsers).toBe('number');
      expect(d.activeUsers).toBeGreaterThanOrEqual(2); // minstens onze fixtures
      expect(typeof d.activeInspections).toBe('number');
      // Het review-plan uit deze suite is inmiddels approved; het template-plan
      // (draft) telt als actief mee.
      expect(d.activeInspections).toBeGreaterThanOrEqual(1);
      expect(d).toHaveProperty('reports');
    });

    it('org met abonnement zónder BASIS_INSPECTIES krijgt null voor de inspectie-tellingen (zelfde gating als de sidebar)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/portal/stats/staff-dashboard')
        .set('Authorization', `Bearer ${planAdminToken}`)
        .expect(200);

      expect(res.body.data.activeInspections).toBeNull();
      expect(res.body.data.reports).toBeNull();
      expect(res.body.data.activeUsers).toBe(1);
    });
  });
});
