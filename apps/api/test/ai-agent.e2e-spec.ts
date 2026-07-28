import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * PRD-15 — AI-assistent, backend gate + scoping (e2e).
 *
 * Verifieert het samenspel van de drie gates op `/api/v1/ai/*`:
 *   1. FeatureGuard      — AI_AGENT moet in het plan zitten (anders 403 FEATURE_NOT_IN_PLAN)
 *   2. AiAgentAccessGuard — per-org kill-switch (403 AI_AGENT_DISABLED) + effectieve
 *      rollen-check (403 AI_AGENT_ROLE_FORBIDDEN), inclusief de per-org override
 *      die INSPECTEUR mag toestaan (de kern van de blocking-fix: de coarse
 *      @Roles(...ALL_STAFF) laat INSPECTEUR door de RolesGuard zodat de override
 *      effect kan hebben).
 * Plus: gesprekken zijn privé per gebruiker (cross-user → 404), acties zijn
 * org+user-gescoped (onbekende/andere actie → 404) en de verbruikssamenvatting
 * telt cache-creation-tokens mee.
 *
 * De org komt uit het subdomein (Host → TenantMiddleware), exact als productie.
 * Slugs zonder hyphens (regex ^[a-z0-9]+$).
 */
describe('AI-assistent (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Org met AI in het plan, default-rollen (INSPECTEUR niet toegestaan).
  const AI_HOST = 'e2eaiorg.localhost';
  // Org met een plan zónder AI_AGENT (wel een andere feature → enforcement aan).
  const NOAI_HOST = 'e2eainoai.localhost';
  // Org met AI in het plan maar kill-switch uit.
  const KILL_HOST = 'e2eaikill.localhost';
  // Org met AI in het plan én een override die INSPECTEUR toestaat.
  const INSP_HOST = 'e2eaiinsp.localhost';

  let aiOrgId: string;
  let noaiOrgId: string;
  let killOrgId: string;
  let inspOrgId: string;
  const orgIds: string[] = [];
  const planIds: string[] = [];
  const userIds: string[] = [];

  let adminToken: string; // ORG_ADMIN in aiOrg (toegang)
  let admin2Token: string; // tweede ORG_ADMIN in aiOrg (cross-user)
  let inspAiToken: string; // INSPECTEUR in aiOrg (default → geweigerd)
  let noaiToken: string; // ORG_ADMIN in noaiOrg (feature ontbreekt)
  let killToken: string; // ORG_ADMIN in killOrg (kill-switch)
  let inspAllowedToken: string; // INSPECTEUR in inspOrg (override → toegestaan)

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

    const mkPlan = async (slug: string, features: string[]) => {
      const plan = await prisma.plan.create({
        data: {
          name: `E2E ${slug}`,
          slug,
          features: { create: features.map((featureKey) => ({ featureKey })) },
        },
      });
      planIds.push(plan.id);
      return plan.id;
    };
    // Een basisfeature erbij zodat de entitlement-set niet leeg is: anders valt
    // FeatureGuard op localhost open en test de negatieve org niets.
    const aiPlanId = await mkPlan('e2eaiplan', ['BASIS_CRM', 'AI_AGENT']);
    const noaiPlanId = await mkPlan('e2enoaiplan', ['BASIS_CRM']);

    const mkOrg = async (
      name: string,
      slug: string,
      planId: string,
      extra: { aiAgentEnabled?: boolean; aiAgentAllowedRoles?: any[] } = {},
    ) => {
      const org = await prisma.organization.create({
        data: { name, slug, planId, ...extra },
      });
      orgIds.push(org.id);
      return org.id;
    };
    aiOrgId = await mkOrg('E2E AI', 'e2eaiorg', aiPlanId);
    noaiOrgId = await mkOrg('E2E No AI', 'e2eainoai', noaiPlanId);
    killOrgId = await mkOrg('E2E Kill', 'e2eaikill', aiPlanId, {
      aiAgentEnabled: false,
    });
    inspOrgId = await mkOrg('E2E Insp', 'e2eaiinsp', aiPlanId, {
      aiAgentAllowedRoles: ['INSPECTEUR', 'ORG_ADMIN'],
    });

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const mkUser = async (email: string, orgId: string, roles: any[]) => {
      const u = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'AI',
          lastName: 'Tester',
          roles,
          orgId,
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(u.id);
      return u;
    };
    await mkUser('e2e-ai-admin@test.nl', aiOrgId, ['ORG_ADMIN']);
    await mkUser('e2e-ai-admin2@test.nl', aiOrgId, ['ORG_ADMIN']);
    await mkUser('e2e-ai-insp@test.nl', aiOrgId, ['INSPECTEUR']);
    await mkUser('e2e-ai-noai@test.nl', noaiOrgId, ['ORG_ADMIN']);
    await mkUser('e2e-ai-kill@test.nl', killOrgId, ['ORG_ADMIN']);
    await mkUser('e2e-ai-inspok@test.nl', inspOrgId, ['INSPECTEUR']);

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' });
      return res.body.data.accessToken;
    };
    adminToken = await login('e2e-ai-admin@test.nl');
    admin2Token = await login('e2e-ai-admin2@test.nl');
    inspAiToken = await login('e2e-ai-insp@test.nl');
    noaiToken = await login('e2e-ai-noai@test.nl');
    killToken = await login('e2e-ai-kill@test.nl');
    inspAllowedToken = await login('e2e-ai-inspok@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.aiUsageLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.aiPendingAction.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.aiMessage.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.aiConversation.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({
        where: {
          OR: [{ userId: { in: userIds } }, { orgId: { in: orgIds } }],
        },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.organizationFeature.deleteMany({
        where: { orgId: { in: orgIds } },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.planFeature.deleteMany({ where: { planId: { in: planIds } } });
      await prisma.plan.deleteMany({ where: { id: { in: planIds } } });
    } finally {
      await app.close();
    }
  });

  const authed = (
    method: 'get' | 'post' | 'delete',
    path: string,
    host: string,
    token: string,
  ) =>
    request(app.getHttpServer())
      [method](path)
      .set('Host', host)
      .set('Authorization', `Bearer ${token}`);

  describe('Toegangs-gates', () => {
    it('ORG_ADMIN met AI in het plan → 200 op /ai/access', async () => {
      const res = await authed('get', '/api/v1/ai/access', AI_HOST, adminToken);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ allowed: true });
    });

    it('org zonder AI_AGENT in het plan → 403 FEATURE_NOT_IN_PLAN', async () => {
      const res = await authed('get', '/api/v1/ai/access', NOAI_HOST, noaiToken);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });

    it('kill-switch uit → 403 AI_AGENT_DISABLED', async () => {
      const res = await authed('get', '/api/v1/ai/access', KILL_HOST, killToken);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AI_AGENT_DISABLED');
    });

    it('INSPECTEUR bij default-rollen → 403 AI_AGENT_ROLE_FORBIDDEN', async () => {
      const res = await authed('get', '/api/v1/ai/access', AI_HOST, inspAiToken);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('AI_AGENT_ROLE_FORBIDDEN');
    });

    it('INSPECTEUR met per-org override → 200 (blocking-fix)', async () => {
      const res = await authed('get', '/api/v1/ai/access', INSP_HOST, inspAllowedToken);
      expect(res.status).toBe(200);
      expect(res.body.data).toEqual({ allowed: true });
    });

    it('INSPECTEUR wordt ook op de gesprekken-route niet vóórtijdig door RolesGuard geweigerd', async () => {
      // In de override-org krijgt de INSPECTEUR een echte 200-lijst; zou de
      // controller @Roles(...CRM_ROLES) hebben, dan zou dit een 403 zijn.
      const res = await authed('get', '/api/v1/ai/conversations', INSP_HOST, inspAllowedToken);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Gesprekken-CRUD (privé per gebruiker)', () => {
    let conversationId: string;

    it('POST /ai/conversations → 201', async () => {
      const res = await authed('post', '/api/v1/ai/conversations', AI_HOST, adminToken).send({
        title: 'E2E gesprek',
      });
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBeDefined();
      conversationId = res.body.data.id;
    });

    it('GET /ai/conversations → bevat het nieuwe gesprek', async () => {
      const res = await authed('get', '/api/v1/ai/conversations', AI_HOST, adminToken);
      expect(res.status).toBe(200);
      expect(res.body.data.some((c: any) => c.id === conversationId)).toBe(true);
    });

    it('GET /ai/conversations/:id → 200 voor de eigenaar', async () => {
      const res = await authed(
        'get',
        `/api/v1/ai/conversations/${conversationId}`,
        AI_HOST,
        adminToken,
      );
      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(conversationId);
    });

    it('GET /ai/conversations/:id → 404 voor een andere gebruiker (privé)', async () => {
      const res = await authed(
        'get',
        `/api/v1/ai/conversations/${conversationId}`,
        AI_HOST,
        admin2Token,
      );
      expect(res.status).toBe(404);
    });

    it('DELETE /ai/conversations/:id → 200 (archiveren)', async () => {
      const res = await authed(
        'delete',
        `/api/v1/ai/conversations/${conversationId}`,
        AI_HOST,
        adminToken,
      );
      expect(res.status).toBe(200);
    });

    it('gearchiveerd gesprek is niet meer zichtbaar → 404', async () => {
      const res = await authed(
        'get',
        `/api/v1/ai/conversations/${conversationId}`,
        AI_HOST,
        adminToken,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Acties-scoping', () => {
    it('confirm van een onbekende actie → 404', async () => {
      const res = await authed(
        'post',
        '/api/v1/ai/actions/00000000-0000-0000-0000-000000000000/confirm',
        AI_HOST,
        adminToken,
      ).send({});
      expect(res.status).toBe(404);
    });

    it('reject van een onbekende actie → 404', async () => {
      const res = await authed(
        'post',
        '/api/v1/ai/actions/00000000-0000-0000-0000-000000000000/reject',
        AI_HOST,
        adminToken,
      );
      expect(res.status).toBe(404);
    });
  });

  describe('Verbruikssamenvatting', () => {
    it('telt input + cache-read + cache-creation + output mee', async () => {
      await prisma.aiUsageLog.create({
        data: {
          orgId: aiOrgId,
          userId: userIds[0],
          conversationId: null,
          model: 'claude-sonnet-5',
          inputTokens: 100,
          cachedInputTokens: 50,
          cacheCreationTokens: 40,
          outputTokens: 10,
          costCents: 1,
        },
      });

      const res = await authed('get', '/api/v1/ai/usage', AI_HOST, adminToken);
      expect(res.status).toBe(200);
      // 100 + 50 + 40 + 10 = 200
      expect(res.body.data.monthTokens).toBeGreaterThanOrEqual(200);
      expect(res.body.data.monthlyQuota).toBeGreaterThan(0);
      expect(res.body.data.remaining).toBe(
        res.body.data.monthlyQuota - res.body.data.monthTokens,
      );
    });
  });
});
