import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import { AnthropicClientService } from '@/common/services/anthropic/anthropic-client.service';
import { FEATURE_KEYS } from '@inspexi/entitlements';

/**
 * PRD-13 §13.11 — AI-voorcontrole end-to-end. De Anthropic-client is op
 * module-niveau gemockt (overrideProvider): geen echte API-calls, de mock
 * levert direct een tool-use-respons. Dekt de GET/POST/PATCH-flow, de
 * feature-gate (403 zonder AI_REVIEW), de org-toggle (submit start geen run
 * bij aiReviewEnabled=false), concurrency (409) en cross-tenant-isolatie
 * (vreemde runs/items → 404, conform de 403-vs-404-conventie voor reads).
 *
 * De feature-gate werkt alleen met org-context (Host-header → TenantMiddleware);
 * zonder Host (127.0.0.1) laat de guard op localhost alles door. Alle requests
 * zetten daarom expliciet de Host van hun org. Slugs zonder hyphens.
 */
describe('AI-review (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const HOST_A = 'e2eaireviewa.localhost';
  const HOST_B = 'e2eaireviewb.localhost';
  const HOST_BASIS = 'e2eaireviewbasis.localhost';

  let compleetPlanId: string;
  let basisPlanId: string;
  let orgAId: string;
  let orgBId: string;
  let orgBasisId: string;
  const userIds: string[] = [];

  let tokenA: string;
  let tokenB: string;
  let tokenBasis: string;

  let contactAId: string;
  let contactBId: string;
  let planAId: string; // org A, in_progress → hoofdflow
  let planBId: string; // org B, in_progress → submit-zonder-run + cross-tenant-victim
  let planBasisId: string; // basis-org zonder AI_REVIEW → 403-gate

  // Mock-respons: tool-use met 2 items; het tweede item verwijst naar een
  // onbekend findingId en moet door sanitizeItems gestript worden (id → null,
  // item zelf blijft).
  let mockFindingId: string;
  const createMessage = jest.fn();
  const anthropicMock = {
    isAvailable: () => true,
    createMessage,
  };

  const mockAiResponse = () => ({
    content: [
      {
        type: 'tool_use',
        name: 'report_review_findings',
        input: {
          summary: 'E2E-samenvatting van de AI-voorcontrole.',
          items: [
            {
              severity: 'CRITICAL',
              category: 'VOLLEDIGHEID',
              title: 'Bevinding zonder aanbeveling',
              description: 'De bevinding mist een aanbeveling.',
              findingId: mockFindingId,
            },
            {
              severity: 'INFO',
              category: 'OVERIG',
              title: 'Los aandachtspunt',
              description: 'Verwijst naar een id dat niet in de input zat.',
              findingId: '00000000-0000-4000-8000-00000000dead',
            },
          ],
        },
      },
    ],
    usage: { input_tokens: 123, output_tokens: 45 },
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(AnthropicClientService)
      .useValue(anthropicMock)
      .compile();

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

    // Entitlement-plannen: Compleet (incl. AI_REVIEW) en Basis (zonder).
    const compleetPlan = await prisma.plan.create({
      data: {
        name: 'E2E AI Compleet',
        slug: 'e2eaireviewcompleet',
        features: { create: FEATURE_KEYS.map((featureKey) => ({ featureKey })) },
      },
    });
    compleetPlanId = compleetPlan.id;
    const basisPlan = await prisma.plan.create({
      data: {
        name: 'E2E AI Basis',
        slug: 'e2eaireviewbasisplan',
        features: {
          create: [
            { featureKey: 'BASIS_CRM' },
            { featureKey: 'BASIS_INSPECTIES' },
          ],
        },
      },
    });
    basisPlanId = basisPlan.id;

    const orgA = await prisma.organization.create({
      data: {
        name: 'E2E AI Review A',
        slug: 'e2eaireviewa',
        planId: compleetPlan.id,
        aiReviewEnabled: true,
      },
    });
    orgAId = orgA.id;
    // Org B heeft het entitlement wél maar de org-toggle UIT: submit mag dan
    // geen run starten.
    const orgB = await prisma.organization.create({
      data: {
        name: 'E2E AI Review B',
        slug: 'e2eaireviewb',
        planId: compleetPlan.id,
        aiReviewEnabled: false,
      },
    });
    orgBId = orgB.id;
    const orgBasis = await prisma.organization.create({
      data: {
        name: 'E2E AI Review Basis',
        slug: 'e2eaireviewbasis',
        planId: basisPlan.id,
        aiReviewEnabled: true,
      },
    });
    orgBasisId = orgBasis.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const mkUser = async (email: string, orgId: string) => {
      const u = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Ai',
          lastName: 'Reviewer',
          roles: ['ORG_ADMIN'],
          orgId,
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(u.id);
      return u;
    };
    const userA = await mkUser('e2e-aireview-a@test.nl', orgAId);
    const userB = await mkUser('e2e-aireview-b@test.nl', orgBId);
    await mkUser('e2e-aireview-basis@test.nl', orgBasisId);

    const login = async (email: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' });
      return res.body.data.accessToken;
    };
    tokenA = await login('e2e-aireview-a@test.nl');
    tokenB = await login('e2e-aireview-b@test.nl');
    tokenBasis = await login('e2e-aireview-basis@test.nl');

    // Fixtures per org: contact + plan (in_progress zodat submit kan).
    const contactA = await prisma.contact.create({
      data: {
        orgId: orgAId,
        type: 'COMPANY',
        companyName: 'E2E AI Contact A',
        ownerId: userA.id,
      },
    });
    contactAId = contactA.id;
    const contactB = await prisma.contact.create({
      data: {
        orgId: orgBId,
        type: 'COMPANY',
        companyName: 'E2E AI Contact B',
        ownerId: userB.id,
      },
    });
    contactBId = contactB.id;

    const planA = await prisma.inspectionPlan.create({
      data: {
        orgId: orgAId,
        contactId: contactAId,
        projectName: 'E2E AI Plan A',
        normTypeCode: 'e2eainorm',
        statusCode: 'in_progress',
      },
    });
    planAId = planA.id;
    const planB = await prisma.inspectionPlan.create({
      data: {
        orgId: orgBId,
        contactId: contactBId,
        projectName: 'E2E AI Plan B',
        normTypeCode: 'e2eainorm',
        statusCode: 'in_progress',
      },
    });
    planBId = planB.id;
    const planBasis = await prisma.inspectionPlan.create({
      data: {
        orgId: orgBasisId,
        contactId: contactAId, // niet relevant voor de 403-gate (guard vuurt eerder)
        projectName: 'E2E AI Plan Basis',
        normTypeCode: 'e2eainorm',
        statusCode: 'in_progress',
      },
    });
    planBasisId = planBasis.id;

    // Eén asset-node + bevinding op plan A: geldig terugverwijsdoel voor de
    // AI-mock. Losse node zonder parent — de ltree-trigger vult path/depth.
    const assetNode = await prisma.assetNode.create({
      data: {
        orgId: orgAId,
        nodeType: 'ASSET',
        typeCode: 'electrical_installation',
        name: 'E2E AI asset',
      },
    });
    const finding = await prisma.finding.create({
      data: {
        orgId: orgAId,
        assetNodeId: assetNode.id,
        inspectionPlanId: planAId,
        inspectionType: 'visual',
        shortDescription: 'E2E AI bevinding',
        statusCode: 'open',
      },
    });
    mockFindingId = finding.id;

    createMessage.mockImplementation(async () => mockAiResponse());
  });

  afterAll(async () => {
    try {
      const orgIds = [orgAId, orgBId, orgBasisId];
      await prisma.aiReviewItem.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.aiReviewRun.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { orgId: { in: orgIds } }] },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.organizationFeature.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.planFeature.deleteMany({
        where: { planId: { in: [compleetPlanId, basisPlanId] } },
      });
      await prisma.plan.deleteMany({ where: { id: { in: [compleetPlanId, basisPlanId] } } });
    } finally {
      await app.close();
    }
  });

  const api = (host: string, token: string) => ({
    get: (path: string) =>
      request(app.getHttpServer())
        .get(path)
        .set('Host', host)
        .set('Authorization', `Bearer ${token}`),
    post: (path: string) =>
      request(app.getHttpServer())
        .post(path)
        .set('Host', host)
        .set('Authorization', `Bearer ${token}`),
    patch: (path: string) =>
      request(app.getHttpServer())
        .patch(path)
        .set('Host', host)
        .set('Authorization', `Bearer ${token}`),
  });

  /** Pollt tot de laatste run van het plan COMPLETED/FAILED is (mock is snel). */
  const waitForRun = async (planId: string, host: string, token: string) => {
    for (let i = 0; i < 40; i++) {
      const res = await api(host, token).get(
        `/api/v1/inspection-plans/${planId}/ai-review`,
      );
      if (res.body.data && res.body.data.status !== 'PENDING') return res.body.data;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('AI-run bleef PENDING (mock niet afgerond)');
  };

  describe('status & lege staat', () => {
    it('GET /ai-review/status → beschikbaar (mock) zonder feature-gate', async () => {
      const res = await api(HOST_BASIS, tokenBasis).get('/api/v1/ai-review/status');
      expect(res.status).toBe(200);
      expect(res.body.data.available).toBe(true);
      expect(res.body.data.model).toBeTruthy();
    });

    it('GET ai-review van een plan zonder runs → null', async () => {
      const res = await api(HOST_A, tokenA).get(
        `/api/v1/inspection-plans/${planAId}/ai-review`,
      );
      expect(res.status).toBe(200);
      expect(res.body.data).toBeNull();
    });
  });

  describe('volledige GET/POST/PATCH-flow (org A, gemockte AI)', () => {
    let itemIds: string[] = [];

    it('POST start een run (201 PENDING) die via de mock COMPLETED wordt', async () => {
      const res = await api(HOST_A, tokenA).post(
        `/api/v1/inspection-plans/${planAId}/ai-review`,
      );
      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('PENDING');

      const run = await waitForRun(planAId, HOST_A, tokenA);
      expect(run.status).toBe('COMPLETED');
      expect(run.summary).toBe('E2E-samenvatting van de AI-voorcontrole.');
      expect(run.inputTokens).toBe(123);
      expect(run.outputTokens).toBe(45);
      expect(run.items).toHaveLength(2);
      itemIds = run.items.map((i: { id: string }) => i.id);

      // Geldig terugverwezen id blijft; onbekend id is gestript (item blijft).
      expect(run.items[0].findingId).toBe(mockFindingId);
      expect(run.items[1].findingId).toBeNull();
      expect(createMessage).toHaveBeenCalledTimes(1);
    });

    it('PATCH /ai-review-items/:id → CHECKED zet checkedBy/checkedAt', async () => {
      const res = await api(HOST_A, tokenA)
        .patch(`/api/v1/ai-review-items/${itemIds[0]}`)
        .send({ status: 'CHECKED' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('CHECKED');
      expect(res.body.data.checkedBy).toBeTruthy();
      expect(res.body.data.checkedAt).toBeTruthy();
    });

    it('PATCH terug naar OPEN wist checkedBy/checkedAt', async () => {
      const res = await api(HOST_A, tokenA)
        .patch(`/api/v1/ai-review-items/${itemIds[0]}`)
        .send({ status: 'OPEN' });
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('OPEN');
      expect(res.body.data.checkedBy).toBeNull();
      expect(res.body.data.checkedAt).toBeNull();
    });

    it('GET ?all=true levert alle runs als lijst (nieuwste eerst)', async () => {
      const res = await api(HOST_A, tokenA).get(
        `/api/v1/inspection-plans/${planAId}/ai-review?all=true`,
      );
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].status).toBe('COMPLETED');
    });

    it('409 bij een tweede start terwijl er al een PENDING-run draait', async () => {
      // Deterministisch: PENDING-run direct in de DB (geen race met de mock).
      const pending = await prisma.aiReviewRun.create({
        data: {
          orgId: orgAId,
          inspectionPlanId: planAId,
          status: 'PENDING',
          model: 'e2e-mock',
          startedAt: new Date(),
        },
      });
      const res = await api(HOST_A, tokenA).post(
        `/api/v1/inspection-plans/${planAId}/ai-review`,
      );
      expect(res.status).toBe(409);
      expect(res.body.message).toContain('AI-analyse');
      await prisma.aiReviewRun.delete({ where: { id: pending.id } });
    });
  });

  describe('feature-gate (org zonder AI_REVIEW-entitlement)', () => {
    it('GET → 403 FEATURE_NOT_IN_PLAN', async () => {
      const res = await api(HOST_BASIS, tokenBasis).get(
        `/api/v1/inspection-plans/${planBasisId}/ai-review`,
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });

    it('POST → 403 FEATURE_NOT_IN_PLAN', async () => {
      const res = await api(HOST_BASIS, tokenBasis).post(
        `/api/v1/inspection-plans/${planBasisId}/ai-review`,
      );
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });
  });

  describe('org-toggle uit (aiReviewEnabled=false, org B)', () => {
    it('submit slaagt maar start géén AI-run', async () => {
      const res = await api(HOST_B, tokenB)
        .post(`/api/v1/inspection-plans/${planBId}/submit`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body.data.statusCode).toBe('pending_review');

      // De fire-and-forget-hook wordt in startRun synchroon op de org-toggle
      // geweigerd; even wachten en dan bevestigen dat er geen run is ontstaan.
      await new Promise((r) => setTimeout(r, 200));
      const runs = await prisma.aiReviewRun.findMany({
        where: { inspectionPlanId: planBId },
      });
      expect(runs).toHaveLength(0);
    });

    it('handmatige POST → 400 (AI-voorcontrole staat uit)', async () => {
      const res = await api(HOST_B, tokenB).post(
        `/api/v1/inspection-plans/${planBId}/ai-review`,
      );
      expect(res.status).toBe(400);
      expect(res.body.message).toContain('AI-voorcontrole staat uit');
    });
  });

  describe('cross-tenant-isolatie (org A ↔ org B)', () => {
    let runBId: string;
    let itemBId: string;

    beforeAll(async () => {
      const runB = await prisma.aiReviewRun.create({
        data: {
          orgId: orgBId,
          inspectionPlanId: planBId,
          status: 'COMPLETED',
          model: 'e2e-mock',
          summary: 'Run van org B',
          completedAt: new Date(),
          items: {
            create: [
              {
                orgId: orgBId,
                severity: 'WARNING',
                category: 'OVERIG',
                title: 'Item van org B',
                description: 'Mag niet zichtbaar zijn voor org A.',
              },
            ],
          },
        },
        include: { items: true },
      });
      runBId = runB.id;
      itemBId = runB.items[0].id;
    });

    it('org A kan de runs van org B niet lezen (404)', async () => {
      const res = await api(HOST_A, tokenA).get(
        `/api/v1/inspection-plans/${planBId}/ai-review`,
      );
      expect(res.status).toBe(404);
    });

    it('org A kan geen run starten op een plan van org B (404)', async () => {
      const res = await api(HOST_A, tokenA).post(
        `/api/v1/inspection-plans/${planBId}/ai-review`,
      );
      expect(res.status).toBe(404);
    });

    it('org A kan een item van org B niet PATCHen (404) en het blijft ongewijzigd', async () => {
      const res = await api(HOST_A, tokenA)
        .patch(`/api/v1/ai-review-items/${itemBId}`)
        .send({ status: 'CHECKED' });
      expect(res.status).toBe(404);

      const item = await prisma.aiReviewItem.findUnique({ where: { id: itemBId } });
      expect(item?.status).toBe('OPEN');
      expect(runBId).toBeTruthy();
    });
  });
});
