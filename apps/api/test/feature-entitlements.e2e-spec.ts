import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import { FEATURE_KEYS } from '@inspexi/entitlements';

/**
 * Fase 1 — backend feature-enforcement (PRD-09 §5.1). Verifieert dat de
 * FeatureGuard een Basis-org weigert op Compleet-routes (403 FEATURE_NOT_IN_PLAN)
 * en doorlaat op basis-routes, dat een Compleet-org overal door mag, en dat een
 * SUPERUSER de check omzeilt.
 *
 * De org komt uit het subdomein (Host-header → TenantMiddleware), exact zoals in
 * productie. Slugs zonder hyphens (regex ^[a-z0-9]+$).
 */
describe('Feature entitlements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const BASIS_HOST = 'e2efeatbasis.localhost';
  const COMPLEET_HOST = 'e2efeatcompleet.localhost';

  let basisOrgId: string;
  let compleetOrgId: string;
  let basisPlanId: string;
  let compleetPlanId: string;
  const userIds: string[] = [];

  let basisToken: string;
  let compleetToken: string;
  let superToken: string;

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

    // Plannen (templates): Basis = 4 basisfeatures, Compleet = alle 9.
    const basisPlan = await prisma.plan.create({
      data: {
        name: 'E2E Basis',
        slug: 'e2efeatbasisplan',
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
    const compleetPlan = await prisma.plan.create({
      data: {
        name: 'E2E Compleet',
        slug: 'e2efeatcompleetplan',
        features: { create: FEATURE_KEYS.map((featureKey) => ({ featureKey })) },
      },
    });
    compleetPlanId = compleetPlan.id;

    const basisOrg = await prisma.organization.create({
      data: { name: 'E2E Feat Basis', slug: 'e2efeatbasis', planId: basisPlan.id },
    });
    basisOrgId = basisOrg.id;
    const compleetOrg = await prisma.organization.create({
      data: { name: 'E2E Feat Compleet', slug: 'e2efeatcompleet', planId: compleetPlan.id },
    });
    compleetOrgId = compleetOrg.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const mkUser = async (email: string, orgId: string | null, roles: any[]) => {
      const u = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Feat',
          lastName: 'Tester',
          roles,
          orgId: orgId ?? undefined,
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(u.id);
      return u;
    };
    await mkUser('e2e-feat-basis@test.nl', basisOrgId, ['ORG_ADMIN']);
    await mkUser('e2e-feat-compleet@test.nl', compleetOrgId, ['ORG_ADMIN']);
    await mkUser('e2e-feat-super@test.nl', null, ['SUPERUSER']);

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' });
      return res.body.data.accessToken;
    };
    basisToken = await login('e2e-feat-basis@test.nl');
    compleetToken = await login('e2e-feat-compleet@test.nl');
    superToken = await login('e2e-feat-super@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: {
          OR: [
            { userId: { in: userIds } },
            { orgId: { in: [basisOrgId, compleetOrgId] } },
          ],
        },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.organizationFeature.deleteMany({
        where: { orgId: { in: [basisOrgId, compleetOrgId] } },
      });
      // Defensief: een (per ongeluk) aangemaakt custom field RESTRICT't de
      // org-delete en liet vroeger de plans achter → P2002 bij de vólgende run.
      await prisma.customFieldDefinition.deleteMany({
        where: { orgId: { in: [basisOrgId, compleetOrgId] } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({
        where: { id: { in: [basisOrgId, compleetOrgId] } },
      });
      await prisma.planFeature.deleteMany({
        where: { planId: { in: [basisPlanId, compleetPlanId] } },
      });
      await prisma.plan.deleteMany({ where: { id: { in: [basisPlanId, compleetPlanId] } } });
    } finally {
      await app.close();
    }
  });

  const get = (path: string, host: string, token: string) =>
    request(app.getHttpServer())
      .get(path)
      .set('Host', host)
      .set('Authorization', `Bearer ${token}`);

  // Compleet-only routes (Basis mist deze features).
  const GATED_FOR_BASIS = [
    '/api/v1/quotes', // CRM_COMPLEET
    '/api/v1/requests', // CRM_COMPLEET
    '/api/v1/planning', // UITVOERING_COMPLEET
    '/api/v1/work-orders', // UITVOERING_COMPLEET
    '/api/v1/documents', // WORKFLOW_COMPLEET
    '/api/v1/custom-fields', // add-on CUSTOM_FIELDS
  ];

  // Routes die in elk basispakket zitten.
  const ALLOWED_FOR_BASIS = [
    '/api/v1/contacts', // BASIS_CRM
    '/api/v1/projects', // BASIS_UITVOERING
    '/api/v1/inspection-plans', // BASIS_INSPECTIES
    '/api/v1/notes', // BASIS_WORKFLOW
    '/api/v1/tasks', // BASIS_WORKFLOW
    '/api/v1/favorites', // BASIS_WORKFLOW
  ];

  describe('Basis-org', () => {
    it.each(GATED_FOR_BASIS)('403 FEATURE_NOT_IN_PLAN op %s', async (path) => {
      const res = await get(path, BASIS_HOST, basisToken);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
      expect(res.body.success).toBe(false);
    });

    it.each(ALLOWED_FOR_BASIS)('200 op %s', async (path) => {
      const res = await get(path, BASIS_HOST, basisToken);
      expect(res.status).toBe(200);
    });
  });

  describe('Compleet-org', () => {
    it.each([...GATED_FOR_BASIS, ...ALLOWED_FOR_BASIS])('200 op %s', async (path) => {
      const res = await get(path, COMPLEET_HOST, compleetToken);
      expect(res.status).toBe(200);
    });
  });

  describe('SUPERUSER bypass', () => {
    it.each(GATED_FOR_BASIS)('omzeilt de feature-check op %s (op Basis-subdomein)', async (path) => {
      const res = await get(path, BASIS_HOST, superToken);
      expect(res.status).not.toBe(403);
    });
  });

  describe('GET /organizations/me/features', () => {
    it('Basis-org levert de 4 basis-keys', async () => {
      const res = await get('/api/v1/organizations/me/features', BASIS_HOST, basisToken);
      expect(res.status).toBe(200);
      expect(res.body.data.sort()).toEqual(
        ['BASIS_CRM', 'BASIS_INSPECTIES', 'BASIS_UITVOERING', 'BASIS_WORKFLOW'].sort(),
      );
    });

    it('Compleet-org levert alle 9 keys (incl. add-ons)', async () => {
      const res = await get('/api/v1/organizations/me/features', COMPLEET_HOST, compleetToken);
      expect(res.status).toBe(200);
      expect(res.body.data.sort()).toEqual([...FEATURE_KEYS].sort());
      expect(res.body.data).toContain('WEBHOOKS');
      expect(res.body.data).toContain('CUSTOM_FIELDS');
    });

    it('SUPERUSER levert de volledige catalogus', async () => {
      const res = await get('/api/v1/organizations/me/features', COMPLEET_HOST, superToken);
      expect(res.status).toBe(200);
      expect(res.body.data.sort()).toEqual([...FEATURE_KEYS].sort());
    });
  });

  // Een SUPERUSER heeft geen eigen org (orgId = null). Vroeger gaf dat een
  // onhandelbare 500 op de null-orgId-query van /custom-fields; nu is dat een
  // nette status (lege lijst bij lezen, 400 bij schrijven).
  //
  // NB (WP-B3, beslissing D2): het subdomein bepaalt sindsdien de effectieve
  // org — een SUPERUSER op een órg-host schrijft dus legitiem in die org. De
  // "zonder org-context"-situatie bestaat alleen nog zónder org-subdomein
  // (unknown host, zoals 127.0.0.1 hier), dus deze tests sturen bewust géén
  // Host-header meer mee.
  describe('/custom-fields zonder org-context (SUPERUSER)', () => {
    it('GET → 200 met lege lijst i.p.v. 500', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/custom-fields')
        .set('Authorization', `Bearer ${superToken}`);
      expect(res.status).toBe(200);
      // /custom-fields levert de lijst rauw terug (niet in {success,data}).
      expect(res.body).toEqual([]);
    });

    it('POST → 400 met NL-melding i.p.v. 500', async () => {
      // Sinds WP-B3 (#141) krijgt een SUPERUSER op een org-subdomein een
      // effectieve orgId en slaagt een schrijf dáár bewust (201). De échte
      // "zonder org-context"-situatie is een host zonder tenant (127.0.0.1)
      // — daar moet de nette 400 blijven staan (was ooit een 500).
      const res = await request(app.getHttpServer())
        .post('/api/v1/custom-fields')
        .set('Authorization', `Bearer ${superToken}`)
        .send({ entityType: 'CONTACT', label: 'Test', fieldType: 'TEXT' });
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('organisatie');
    });
  });
});
