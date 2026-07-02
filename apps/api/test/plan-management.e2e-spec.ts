import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Fase 3 — SUPERUSER plan- & per-org feature-beheer (PRD-09 §5.3).
 *
 * Dekt: Plan-CRUD, de feature-catalogus (`GET /admin/features`), plan-toewijzing
 * en per-org overrides, de DoD-keten (Basis-org `WORKFLOW_COMPLEET` bijschakelen →
 * `/documents` toegankelijk na cache-invalidatie) en dat alles SUPERUSER-only is.
 *
 * SUPERUSER-routes draaien zonder Host (onbekende host → TenantGuard laat door, de
 * org komt uit de `:id`-param). De DoD-keten gebruikt het Basis-subdomein zodat de
 * FeatureGuard de org uit `tenant.orgId` haalt — net als in productie.
 */
describe('Plan management (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const BASIS_HOST = 'e2eplanmgmt.localhost';
  let basisOrgId: string;
  let basisPlanId: string;
  const planIds: string[] = [];
  const userIds: string[] = [];

  let superToken: string;
  let orgAdminToken: string;

  const auth = (token: string) => `Bearer ${token}`;

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

    // Basis-plan (4 basisfeatures, géén WORKFLOW_COMPLEET).
    const basisPlan = await prisma.plan.create({
      data: {
        name: 'E2E PM Basis',
        slug: 'e2epmbasis',
        features: {
          create: [
            { featureKey: 'BASIS_CRM' },
            { featureKey: 'BASIS_UITVOERING' },
            { featureKey: 'BASIS_INSPECTIES' },
            { featureKey: 'BASIS_WORKFLOW' },
          ],
        },
      },
    });
    basisPlanId = basisPlan.id;
    planIds.push(basisPlan.id);

    const basisOrg = await prisma.organization.create({
      data: { name: 'E2E PM Org', slug: 'e2eplanmgmt', planId: basisPlan.id },
    });
    basisOrgId = basisOrg.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const su = await prisma.user.create({
      data: {
        email: 'e2e-pm-super@test.nl',
        passwordHash,
        firstName: 'PM',
        lastName: 'Super',
        roles: ['SUPERUSER'],
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(su.id);
    const oa = await prisma.user.create({
      data: {
        email: 'e2e-pm-admin@test.nl',
        passwordHash,
        firstName: 'PM',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: basisOrgId,
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(oa.id);

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' });
      return res.body.data.accessToken;
    };
    superToken = await login('e2e-pm-super@test.nl');
    orgAdminToken = await login('e2e-pm-admin@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { orgId: { in: [basisOrgId] } }],
        },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.organizationFeature.deleteMany({ where: { orgId: basisOrgId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: basisOrgId } });
      await prisma.planFeature.deleteMany({ where: { planId: { in: planIds } } });
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
      // Veiligheidsnet voor plannen die in tests met een vaste slug zijn gemaakt.
      await prisma.plan.deleteMany({
        where: { slug: { in: ['e2epmcompleet', 'e2epmtemp'] } },
      });
    } finally {
      await app.close();
    }
  });

  describe('GET /admin/features (catalogus)', () => {
    it('SUPERUSER krijgt de volledige catalogus met afhankelijkheden', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/features')
        .set('Authorization', auth(superToken));
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(9);
      const crmCompleet = res.body.data.find((f: any) => f.key === 'CRM_COMPLEET');
      expect(crmCompleet.dependsOn).toContain('BASIS_CRM');
    });

    it('ORG_ADMIN → 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/features')
        .set('Authorization', auth(orgAdminToken));
      expect(res.status).toBe(403);
    });
  });

  describe('Plan-CRUD (SUPERUSER)', () => {
    let createdId: string;

    it('POST /plans maakt een Compleet-plan aan', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', auth(superToken))
        .send({
          name: 'E2E PM Compleet',
          slug: 'e2epmcompleet',
          description: 'Alles aan',
          featureKeys: ['BASIS_CRM', 'CRM_COMPLEET', 'WORKFLOW_COMPLEET', 'BASIS_WORKFLOW'],
        });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.features).toHaveLength(4);
      createdId = res.body.data.id;
      planIds.push(createdId);
    });

    it('audit-trail: PlanFeature-creates binnen de transactie worden gelogd', async () => {
      // Borgt dat de `$use`-audit-middleware ook vuurt voor losse writes binnen
      // de interactieve transactie van PlansService.create (regressiebewaking
      // bij de overstap naar $transaction).
      const features = await prisma.planFeature.findMany({
        where: { planId: createdId },
        select: { id: true },
      });
      expect(features).toHaveLength(4);

      const auditRows = await prisma.auditLog.findMany({
        where: {
          entityType: 'PlanFeature',
          action: 'CREATE',
          entityId: { in: features.map((f) => f.id) },
        },
      });
      expect(auditRows).toHaveLength(4);
    });

    it('POST /plans weigert onbekende feature-keys (409)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', auth(superToken))
        .send({ name: 'Bad', slug: 'e2epmbad', featureKeys: ['NIET_BESTAAND'] });
      expect(res.status).toBe(409);
    });

    it('POST /plans weigert een slug met koppeltekens (400)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', auth(superToken))
        .send({ name: 'Bad', slug: 'met-streepje', featureKeys: ['BASIS_CRM'] });
      expect(res.status).toBe(400);
    });

    it('GET /plans bevat het nieuwe plan', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/plans')
        .set('Authorization', auth(superToken));
      expect(res.status).toBe(200);
      expect(res.body.data.some((p: any) => p.id === createdId)).toBe(true);
    });

    it('PATCH /plans/:id dift de feature-set', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/plans/${createdId}`)
        .set('Authorization', auth(superToken))
        .send({ featureKeys: ['BASIS_CRM'] });
      expect(res.status).toBe(200);
      expect(res.body.data.features).toHaveLength(1);
      expect(res.body.data.features[0].featureKey).toBe('BASIS_CRM');
    });

    it('DELETE /plans/:id verwijdert een ongebruikt plan', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/plans/${createdId}`)
        .set('Authorization', auth(superToken));
      expect(res.status).toBe(200);
    });

    it('DELETE /plans/:id van een toegewezen plan → 409', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/plans/${basisPlanId}`)
        .set('Authorization', auth(superToken));
      expect(res.status).toBe(409);
    });

    it('ORG_ADMIN mag geen plan aanmaken (403)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/plans')
        .set('Authorization', auth(orgAdminToken))
        .send({ name: 'X', slug: 'e2epmtemp', featureKeys: ['BASIS_CRM'] });
      expect(res.status).toBe(403);
    });
  });

  describe('Org entitlements (SUPERUSER)', () => {
    it('GET /organizations/:id/entitlements geeft de effectieve Basis-set', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${basisOrgId}/entitlements`)
        .set('Authorization', auth(superToken));
      expect(res.status).toBe(200);
      expect(res.body.data.planId).toBe(basisPlanId);
      expect(res.body.data.effective.sort()).toEqual(
        ['BASIS_CRM', 'BASIS_INSPECTIES', 'BASIS_UITVOERING', 'BASIS_WORKFLOW'].sort(),
      );
      expect(res.body.data.effective).not.toContain('WORKFLOW_COMPLEET');
    });

    it('ORG_ADMIN → 403 op entitlements', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${basisOrgId}/entitlements`)
        .set('Authorization', auth(orgAdminToken));
      expect(res.status).toBe(403);
    });

    it('afschakel-override die de closure terugdraait → waarschuwing', async () => {
      // BASIS_CRM uit terwijl BASIS_INSPECTIES/UITVOERING eraan hangen.
      const res = await request(app.getHttpServer())
        .put(`/api/v1/organizations/${basisOrgId}/features/BASIS_CRM`)
        .set('Authorization', auth(superToken))
        .send({ state: 'DISABLED' });
      expect(res.status).toBe(200);
      expect(res.body.data.effective).toContain('BASIS_CRM'); // closure wint
      expect(res.body.data.warnings.some((w: any) => w.featureKey === 'BASIS_CRM')).toBe(true);

      // Opruimen: terug naar plan-default.
      await request(app.getHttpServer())
        .put(`/api/v1/organizations/${basisOrgId}/features/BASIS_CRM`)
        .set('Authorization', auth(superToken))
        .send({ state: 'PLAN' });
    });

    it('onbekende feature-key → 400', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/organizations/${basisOrgId}/features/NIET_BESTAAND`)
        .set('Authorization', auth(superToken))
        .send({ state: 'ENABLED' });
      expect(res.status).toBe(400);
    });
  });

  describe('DoD-keten: WORKFLOW_COMPLEET bijschakelen → /documents toegankelijk', () => {
    const docs = (token: string) =>
      request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Host', BASIS_HOST)
        .set('Authorization', auth(token));

    it('vóór: Basis-org krijgt 403 FEATURE_NOT_IN_PLAN op /documents', async () => {
      const res = await docs(orgAdminToken);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });

    it('SUPERUSER schakelt WORKFLOW_COMPLEET bij op de Basis-org', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/organizations/${basisOrgId}/features/WORKFLOW_COMPLEET`)
        .set('Authorization', auth(superToken))
        .send({ state: 'ENABLED' });
      expect(res.status).toBe(200);
      expect(res.body.data.effective).toContain('WORKFLOW_COMPLEET');
    });

    it('ná: /documents is direct toegankelijk (cache geïnvalideerd)', async () => {
      const res = await docs(orgAdminToken);
      expect(res.status).toBe(200);
    });

    it('me/features bevat nu WORKFLOW_COMPLEET', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations/me/features')
        .set('Host', BASIS_HOST)
        .set('Authorization', auth(orgAdminToken));
      expect(res.status).toBe(200);
      expect(res.body.data).toContain('WORKFLOW_COMPLEET');
    });

    it('afschakelen herstelt de 403', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/organizations/${basisOrgId}/features/WORKFLOW_COMPLEET`)
        .set('Authorization', auth(superToken))
        .send({ state: 'PLAN' });
      const res = await docs(orgAdminToken);
      expect(res.status).toBe(403);
    });
  });

  describe('Plan-toewijzing', () => {
    it('PATCH /organizations/:id/plan kan het plan ontkoppelen en herstellen', async () => {
      const unassign = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${basisOrgId}/plan`)
        .set('Authorization', auth(superToken))
        .send({ planId: null });
      expect(unassign.status).toBe(200);
      expect(unassign.body.data.planId).toBeNull();
      expect(unassign.body.data.effective).toEqual([]);

      const reassign = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${basisOrgId}/plan`)
        .set('Authorization', auth(superToken))
        .send({ planId: basisPlanId });
      expect(reassign.status).toBe(200);
      expect(reassign.body.data.planId).toBe(basisPlanId);
    });

    it('onbekend plan → 404', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/organizations/${basisOrgId}/plan`)
        .set('Authorization', auth(superToken))
        .send({ planId: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(404);
    });
  });
});
