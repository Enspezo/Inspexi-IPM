import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Quotes API (e2e)
 *
 * Runs against the real seeded database.
 * Seed users used:
 *   - admin@inspexi-demo.nl      (ORG_ADMIN, org1 = InspeXi Demo)
 *   - manager@inspexi-demo.nl    (MANAGER, org1)
 *   - inspecteur@inspexi-demo.nl (INSPECTEUR, org1)
 *   - admin@testbedrijf.nl       (ORG_ADMIN, org2 = Test Bedrijf)
 *
 * Seed quotes (org1):
 *   1. OFF-2026-0001 "NEN3140 inspectie werkplaats Pieter Jansen" (GOEDGEKEURD, template1, 3 lines)
 *   2. OFF-2026-0002 "Thermografisch onderzoek + NEN1010 Zuidas"  (CONCEPT, template2, requiresApproval=true)
 *
 * Seed templates (org1):
 *   1. "Standaard Inspectie Offerte" (requiresApproval=false, validityDays=30)
 *   2. "Groot Project Offerte (goedkeuring vereist)" (requiresApproval=true, validityDays=14)
 */
describe('Quotes API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens per role
  let org1AdminToken: string;
  let org1ManagerToken: string;
  let org1InspecteurToken: string;
  let org2AdminToken: string;

  // IDs of resources created during tests (for cleanup)
  const createdQuoteIds: string[] = [];
  const createdApprovalRequestIds: string[] = [];
  const createdTemplateIds: string[] = [];

  /** Helper: login and return { accessToken, cookies } */
  async function login(email: string, password = 'Password123!') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });

    const cookies = res.headers['set-cookie'];
    return {
      accessToken: res.body.data.accessToken as string,
      cookies: Array.isArray(cookies) ? cookies : cookies ? [cookies] : [],
    };
  }

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

    // Login all seed users in parallel
    const [org1Admin, org1Manager, org1Inspecteur, org2Admin] =
      await Promise.all([
        login('admin@inspexi-demo.nl'),
        login('manager@inspexi-demo.nl'),
        login('inspecteur@inspexi-demo.nl'),
        login('admin@testbedrijf.nl'),
      ]);

    org1AdminToken = org1Admin.accessToken;
    org1ManagerToken = org1Manager.accessToken;
    org1InspecteurToken = org1Inspecteur.accessToken;
    org2AdminToken = org2Admin.accessToken;
  });

  afterAll(async () => {
    // Clean up resources created during tests (reverse dependency order)
    if (createdQuoteIds.length > 0) {
      await prisma.quoteApprovalRequest.deleteMany({
        where: { quoteId: { in: createdQuoteIds } },
      });
      await prisma.quoteLine.deleteMany({
        where: { quoteId: { in: createdQuoteIds } },
      });
      await prisma.quote.deleteMany({
        where: { id: { in: createdQuoteIds } },
      });
    }
    if (createdTemplateIds.length > 0) {
      await prisma.quoteTemplate.deleteMany({
        where: { id: { in: createdTemplateIds } },
      });
    }

    await app.close();
  });

  // ─── GET /quotes ──────────────────────────────────────

  describe('GET /api/v1/quotes', () => {
    it('ORG_ADMIN can list quotes of own org (should see 2 seed quotes)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);

      // All returned quotes belong to org1
      const orgId = res.body.data.data[0].orgId;
      for (const q of res.body.data.data) {
        expect(q.orgId).toBe(orgId);
      }
    });

    it('filter by status=CONCEPT works', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .query({ status: 'CONCEPT' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      for (const q of res.body.data.data) {
        expect(q.status).toBe('CONCEPT');
      }
    });

    it("filter by templateId='none' returns only quotes without a template", async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .query({ templateId: 'none' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      for (const q of res.body.data.data) {
        expect(q.templateId).toBeNull();
      }
    });

    it('list results include template (id + name)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Every quote exposes the template relation key (null or {id, name})
      for (const q of res.body.data.data) {
        expect(q).toHaveProperty('template');
        if (q.template) {
          expect(q.template).toHaveProperty('id');
          expect(q.template).toHaveProperty('name');
        }
      }
    });

    it('search by subject works (search=Thermografisch)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .query({ search: 'Thermografisch' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      const subjects = res.body.data.data.map((q: any) => q.subject);
      expect(
        subjects.some((s: string) => s.includes('Thermografisch')),
      ).toBe(true);
    });

    it('cross-org: ORG_ADMIN from org2 sees no InspeXi quotes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const quotes = res.body.data.data;

      // None of the org1 quote subjects should appear
      const subjects = quotes.map((q: any) => q.subject);
      expect(subjects).not.toContain(
        'NEN3140 inspectie werkplaats Pieter Jansen',
      );
      expect(subjects).not.toContain(
        'Thermografisch onderzoek + NEN1010 Zuidas',
      );
    });

    it('INSPECTEUR gets 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1InspecteurToken}`)
        .expect(403);
    });
  });

  // ─── POST /quotes ─────────────────────────────────────

  describe('POST /api/v1/quotes', () => {
    let org1ContactId: string;

    beforeAll(async () => {
      // Retrieve a valid contactId from org1 seed data
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      org1ContactId = contactRes.body.data.data[0].id;
    });

    it('ORG_ADMIN can create a quote (quoteNumber is sequential OFF-2026-XXXX)', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId: org1ContactId,
          subject: 'E2E Test Offerte',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.subject).toBe('E2E Test Offerte');
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.quoteNumber).toBeDefined();
      // quoteNumber should match pattern OFF-2026-XXXX
      expect(res.body.data.quoteNumber).toMatch(/^OFF-\d{4}-\d{4}$/);
      expect(res.body.data.status).toBe('CONCEPT');

      createdQuoteIds.push(res.body.data.id);
    });

    it('create with templateId inherits template fields', async () => {
      // Find the template that requires approval
      const templatesRes = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const approvalTemplate = templatesRes.body.data.data.find(
        (t: any) => t.requiresApproval === true,
      );
      expect(approvalTemplate).toBeDefined();

      const res = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId: org1ContactId,
          subject: 'E2E Template Inheritance Test',
          templateId: approvalTemplate.id,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.templateId).toBe(approvalTemplate.id);
      expect(res.body.data.requiresApproval).toBe(true);
      expect(res.body.data.coverBlocks).toBeDefined();

      createdQuoteIds.push(res.body.data.id);
    });
  });

  // ─── GET /quotes/:id ──────────────────────────────────

  describe('GET /api/v1/quotes/:id', () => {
    it('detail contains lines, contact, approvalRequests', async () => {
      // Use the seeded GOEDGEKEURD quote (OFF-2026-0001) which has 3 lines
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const seededQuote = listRes.body.data.data.find(
        (q: any) => q.quoteNumber === 'OFF-2026-0001',
      );
      expect(seededQuote).toBeDefined();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${seededQuote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const detail = res.body.data;

      // contact should be included
      expect(detail.contact).toBeDefined();
      expect(detail.contact.id).toBeDefined();

      // lines should be included
      expect(detail.lines).toBeDefined();
      expect(Array.isArray(detail.lines)).toBe(true);
      expect(detail.lines.length).toBe(3);

      // approvalRequests should be included
      expect(detail.approvalRequests).toBeDefined();
      expect(Array.isArray(detail.approvalRequests)).toBe(true);
    });
  });

  // ─── PATCH /quotes/:id ────────────────────────────────

  describe('PATCH /api/v1/quotes/:id', () => {
    it('update subject works when CONCEPT', async () => {
      // Use the seeded CONCEPT quote (OFF-2026-0002)
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .query({ status: 'CONCEPT' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const conceptQuote = listRes.body.data.data.find(
        (q: any) => q.quoteNumber === 'OFF-2026-0002',
      );
      expect(conceptQuote).toBeDefined();

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${conceptQuote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ subject: 'Bijgewerkt onderwerp via E2E' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.subject).toBe('Bijgewerkt onderwerp via E2E');

      // Restore original subject
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${conceptQuote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ subject: 'Thermografisch onderzoek + NEN1010 Zuidas' })
        .expect(200);
    });

    it('update fails when not CONCEPT (GOEDGEKEURD quote)', async () => {
      // Use the seeded GOEDGEKEURD quote (OFF-2026-0001)
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const approvedQuote = listRes.body.data.data.find(
        (q: any) => q.quoteNumber === 'OFF-2026-0001',
      );
      expect(approvedQuote).toBeDefined();

      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${approvedQuote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ subject: 'Should not update' })
        .expect(400);
    });
  });

  // ─── REQ26: template switch + status guard ────────────

  describe('Template switch & status validation (REQ26)', () => {
    let org1ContactId: string;
    let blocksTemplateId: string; // requiresApproval = false (Standaard)
    let approvalTemplateId: string; // requiresApproval = true (Groot Project)

    beforeAll(async () => {
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      org1ContactId = contactRes.body.data.data[0].id;

      const templatesRes = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const templates = templatesRes.body.data.data as any[];
      approvalTemplateId = templates.find((t) => t.requiresApproval === true).id;
      blocksTemplateId = templates.find((t) => t.requiresApproval === false).id;
    });

    /** Create a fresh CONCEPT quote without a template and track it for cleanup. */
    async function createConceptQuote(subject: string): Promise<any> {
      const res = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ contactId: org1ContactId, subject })
        .expect(201);
      createdQuoteIds.push(res.body.data.id);
      return res.body.data;
    }

    it('switches template on a CONCEPT quote: applies blocks + requiresApproval + templateId', async () => {
      const quote = await createConceptQuote('REQ26 switch test');
      expect(quote.templateId).toBeNull();

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: approvalTemplateId })
        .expect(200);

      expect(res.body.data.templateId).toBe(approvalTemplateId);
      expect(res.body.data.requiresApproval).toBe(true);
      expect(res.body.data.contentBlocks).toBeTruthy();
    });

    it('records the template switch in the audit log (Sjabloon van→naar)', async () => {
      const quote = await createConceptQuote('REQ26 audit test');

      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: blocksTemplateId })
        .expect(200);

      // Audit is fire-and-forget — poll briefly for the UPDATE row.
      let auditLog: any = null;
      for (let i = 0; i < 20 && !auditLog; i++) {
        const logs = await prisma.auditLog.findMany({
          where: { entityType: 'Quote', entityId: quote.id, action: 'UPDATE' },
          orderBy: { createdAt: 'desc' },
        });
        auditLog = logs.find((l) => {
          const changes = (l.changes as Record<string, unknown>) ?? {};
          return 'templateId' in changes;
        });
        if (!auditLog) await new Promise((r) => setTimeout(r, 100));
      }

      expect(auditLog).toBeTruthy();
      const change = (auditLog.changes as any).templateId;
      expect(change.from ?? change.old ?? null).toBeNull();
      expect(change.to ?? change.new).toBe(blocksTemplateId);
    });

    it('unlinks the template (templateId null) while CONCEPT', async () => {
      const quote = await createConceptQuote('REQ26 unlink test');
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: blocksTemplateId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: null })
        .expect(200);

      expect(res.body.data.templateId).toBeNull();
    });

    it('rejects switching to another org\'s template (cross-tenant)', async () => {
      const quote = await createConceptQuote('REQ26 cross-tenant test');

      // Create a template owned by org2 directly.
      const org2 = await prisma.organization.findFirst({ where: { slug: 'testbedrijf' } });
      const org2Template = await prisma.quoteTemplate.create({
        data: { orgId: org2!.id, name: 'REQ26 org2 template' },
      });
      createdTemplateIds.push(org2Template.id);

      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: org2Template.id })
        .expect(403);
    });

    it('blocks leaving CONCEPT (status → GOEDGEKEURD) without a linked template', async () => {
      const quote = await createConceptQuote('REQ26 guard test');

      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}/status`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ status: 'GOEDGEKEURD' })
        .expect(400);
    });

    it('allows leaving CONCEPT once a (non-approval) template is linked', async () => {
      const quote = await createConceptQuote('REQ26 guard ok test');

      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: blocksTemplateId })
        .expect(200);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}/status`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ status: 'GOEDGEKEURD' })
        .expect(200);

      expect(res.body.data.status).toBe('GOEDGEKEURD');
    });

    it('does not allow switching templates outside CONCEPT', async () => {
      const quote = await createConceptQuote('REQ26 non-concept switch test');
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: blocksTemplateId })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}/status`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ status: 'GOEDGEKEURD' })
        .expect(200);

      // Now GOEDGEKEURD → switching template must fail (update only in CONCEPT)
      await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${quote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ templateId: approvalTemplateId })
        .expect(400);
    });
  });

  // ─── PUT /quotes/:id/lines ───────────────────────────

  describe('PUT /api/v1/quotes/:id/lines', () => {
    it('set lines calculates totals correctly', async () => {
      // Create a fresh CONCEPT quote for line tests
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const contactId = contactRes.body.data.data[0].id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ contactId, subject: 'E2E Lines Test Offerte' })
        .expect(201);

      const quoteId = createRes.body.data.id;
      createdQuoteIds.push(quoteId);

      // Set lines: 2 items
      // Line 1: qty=3, unitPrice=100, vatRate=21, discountPct=10
      //   lineTotal = 3*100*(1-10/100) = 270
      //   vat = 270*21/100 = 56.70
      // Line 2: qty=1, unitPrice=50, vatRate=21, discountPct=0
      //   lineTotal = 1*50*(1-0/100) = 50
      //   vat = 50*21/100 = 10.50
      // Expected: subtotal=320, vatTotal=67.20, total=387.20
      const res = await request(app.getHttpServer())
        .put(`/api/v1/quotes/${quoteId}/lines`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          lines: [
            {
              description: 'Test dienst A',
              quantity: 3,
              unit: 'uur',
              unitPrice: 100,
              vatRate: 21,
              discountPct: 10,
            },
            {
              description: 'Test dienst B',
              quantity: 1,
              unit: 'stuks',
              unitPrice: 50,
              vatRate: 21,
              discountPct: 0,
            },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.subtotal).toBe(320);
      expect(res.body.data.vatTotal).toBe(67.2);
      expect(res.body.data.total).toBe(387.2);
      expect(res.body.data.lines).toBeDefined();
      expect(res.body.data.lines.length).toBe(2);
    });
  });

  // ─── Approval workflow ───────────────────────────────

  describe('Approval workflow', () => {
    let approvalQuoteId: string;

    beforeAll(async () => {
      // Create a quote with requiresApproval=true via template
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const contactId = contactRes.body.data.data[0].id;

      const templatesRes = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const approvalTemplate = templatesRes.body.data.data.find(
        (t: any) => t.requiresApproval === true,
      );

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId,
          subject: 'E2E Approval Workflow Test',
          templateId: approvalTemplate.id,
        })
        .expect(201);

      approvalQuoteId = createRes.body.data.id;
      createdQuoteIds.push(approvalQuoteId);
    });

    it('POST /quotes/:id/submit-approval creates approval request and sets TER_GOEDKEURING', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${approvalQuoteId}/submit-approval`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ note: 'Graag goedkeuren' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('TER_GOEDKEURING');

      // Verify approval request was created
      const detailRes = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${approvalQuoteId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(detailRes.body.data.approvalRequests.length).toBeGreaterThanOrEqual(1);
      const latestApproval = detailRes.body.data.approvalRequests[0];
      expect(latestApproval.status).toBe('PENDING');
    });

    it('POST /quotes/:id/reject - MANAGER rejects with note, sets CONCEPT', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${approvalQuoteId}/reject`)
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .send({ note: 'Prijs te hoog, aanpassen AUB' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONCEPT');
    });

    it('POST /quotes/:id/approve - MANAGER approves after resubmit, sets GOEDGEKEURD', async () => {
      // Re-submit for approval
      await request(app.getHttpServer())
        .post(`/api/v1/quotes/${approvalQuoteId}/submit-approval`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ note: 'Prijs aangepast, graag opnieuw beoordelen' })
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${approvalQuoteId}/approve`)
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .send({ note: 'Akkoord' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('GOEDGEKEURD');
    });
  });

  // ─── Approval mechanisms (REQ5) ──────────────────────

  describe('Approval mechanisms (REQ5)', () => {
    let contactId: string;
    let blocksTemplateId: string; // requiresApproval = false
    let bigQuoteId: string; // total above the org threshold (€10.000)
    let smallQuoteId: string; // total below threshold, no requiresApproval

    beforeAll(async () => {
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      contactId = contactRes.body.data.data[0].id;

      const templatesRes = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      blocksTemplateId = templatesRes.body.data.data.find(
        (t: any) => t.requiresApproval === false,
      ).id;

      // Big quote: linked template (so it may leave CONCEPT) + lines above threshold.
      const bigRes = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ contactId, subject: 'REQ5 boven drempel', templateId: blocksTemplateId })
        .expect(201);
      bigQuoteId = bigRes.body.data.id;
      createdQuoteIds.push(bigQuoteId);
      await request(app.getHttpServer())
        .put(`/api/v1/quotes/${bigQuoteId}/lines`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ lines: [{ description: 'Groot project', quantity: 1, unit: 'stuks', unitPrice: 25000, vatRate: 21, discountPct: 0 }] })
        .expect(200);

      const smallRes = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ contactId, subject: 'REQ5 onder drempel', templateId: blocksTemplateId })
        .expect(201);
      smallQuoteId = smallRes.body.data.id;
      createdQuoteIds.push(smallQuoteId);
      await request(app.getHttpServer())
        .put(`/api/v1/quotes/${smallQuoteId}/lines`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ lines: [{ description: 'Klein klusje', quantity: 1, unit: 'stuks', unitPrice: 500, vatRate: 21, discountPct: 0 }] })
        .expect(200);
    });

    it('blocks sending a quote above the threshold without approval', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${bigQuoteId}/send`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ to: 'klant@example.com', subject: 'Offerte', bodyText: 'Zie bijlage' })
        .expect(400);
      expect(res.body.message).toContain('goedkeuring');
    });

    it('allows submit-for-approval above the threshold and targets the required role', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${bigQuoteId}/submit-approval`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ note: 'Boven de grens' })
        .expect(201);
      expect(res.body.data.status).toBe('TER_GOEDKEURING');

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${bigQuoteId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const latest = detail.body.data.approvalRequests[0];
      expect(latest.kind).toBe('THRESHOLD');
      expect(latest.approverRole).toBe('MANAGER');
    });

    it('forbids approval by a user without the required role (service-level role check)', async () => {
      // ORG_ADMIN passes the controller guard (MANAGEMENT_ROLES) but is not the required MANAGER role.
      await request(app.getHttpServer())
        .post(`/api/v1/quotes/${bigQuoteId}/approve`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({})
        .expect(403);
    });

    it('blocks the manual-status bypass (PATCH /status → GOEDGEKEURD) above threshold without approval', async () => {
      // bigQuoteId is in TER_GOEDKEURING; TER_GOEDKEURING→GOEDGEKEURD is a valid transition,
      // but the approval gate must still block it (no APPROVED THRESHOLD request yet).
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/quotes/${bigQuoteId}/status`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ status: 'GOEDGEKEURD' })
        .expect(400);
      expect(res.body.message).toContain('goedkeuring');
    });

    it('lets the required role approve, unblocking sending', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${bigQuoteId}/approve`)
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .send({ note: 'Akkoord' })
        .expect(201);
      expect(res.body.data.status).toBe('GOEDGEKEURD');
    });

    it('voluntary person request is advisory: keeps CONCEPT and does not block', async () => {
      // Find a manager to target via the selectable list.
      const usersRes = await request(app.getHttpServer())
        .get('/api/v1/users/selectable?role=MANAGER')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const managerId = usersRes.body.data[0].id;

      const reqRes = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${smallQuoteId}/voluntary-approval/person`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ approverUserId: managerId, note: 'Even meekijken?' })
        .expect(201);
      expect(reqRes.body.data.kind).toBe('VOLUNTARY_PERSON');

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${smallQuoteId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      expect(detail.body.data.status).toBe('CONCEPT'); // unchanged

      // Targeted manager approves → still CONCEPT (advisory only).
      const reqId = detail.body.data.approvalRequests.find((r: any) => r.kind === 'VOLUNTARY_PERSON').id;
      const review = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${smallQuoteId}/approval-requests/${reqId}/approve`)
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .send({})
        .expect(201);
      expect(review.body.data.status).toBe('APPROVED');

      const after = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${smallQuoteId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      expect(after.body.data.status).toBe('CONCEPT');
    });

    it('voluntary team request can be cancelled by the requester', async () => {
      const reqRes = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${smallQuoteId}/voluntary-approval/team`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ note: 'Team check' })
        .expect(201);
      expect(reqRes.body.data.kind).toBe('VOLUNTARY_TEAM');
      const reqId = reqRes.body.data.id;

      const cancel = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${smallQuoteId}/approval-requests/${reqId}/cancel`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(201);
      expect(cancel.body.data.status).toBe('CANCELLED');
    });

    it('rejects a voluntary person request targeting another org user (cross-tenant)', async () => {
      const org2Users = await request(app.getHttpServer())
        .get('/api/v1/users/selectable')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);
      const foreignId = org2Users.body.data[0].id;

      await request(app.getHttpServer())
        .post(`/api/v1/quotes/${smallQuoteId}/voluntary-approval/person`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ approverUserId: foreignId })
        .expect(403);
    });
  });

  // ─── GET /quotes/resolve-price ───────────────────────

  describe('GET /api/v1/quotes/resolve-price', () => {
    it('returns price from contact VIP price table', async () => {
      // Get contacts to find Bouwbedrijf De Vries BV (linked to VIP price table)
      const contactsRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const deVriesContact = contactsRes.body.data.data.find(
        (c: any) => c.companyName === 'Bouwbedrijf De Vries BV',
      );
      expect(deVriesContact).toBeDefined();

      // Get products to find NEN1010 Inspectie
      const productsRes = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const nen1010Product = productsRes.body.data.data.find(
        (p: any) => p.name === 'NEN1010 Inspectie',
      );
      expect(nen1010Product).toBeDefined();

      const res = await request(app.getHttpServer())
        .get('/api/v1/quotes/resolve-price')
        .query({
          productId: nen1010Product.id,
          contactId: deVriesContact.id,
          quantity: '1',
        })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // VIP table has NEN1010 at 75.00 (not standard 85.00)
      expect(res.body.data.unitPrice).toBe(75);
      expect(res.body.data.unit).toBeDefined();
    });
  });

  // ─── DELETE /quotes/:id ──────────────────────────────

  describe('DELETE /api/v1/quotes/:id', () => {
    it('only works for CONCEPT status', async () => {
      // Create a CONCEPT quote to delete
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);
      const contactId = contactRes.body.data.data[0].id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ contactId, subject: 'E2E Delete Test Offerte' })
        .expect(201);

      const deleteId = createRes.body.data.id;
      // Do NOT push to createdQuoteIds since we delete it here

      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/quotes/${deleteId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.data.deleted).toBe(true);

      // Verify it no longer appears in the list
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quotes')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const ids = listRes.body.data.data.map((q: any) => q.id);
      expect(ids).not.toContain(deleteId);
    });

    it('delete fails for non-CONCEPT status', async () => {
      // Try to delete the seeded GOEDGEKEURD quote. Filter op quoteNumber zodat de
      // offerte gevonden wordt ongeacht paginatie (eerdere tests kunnen extra
      // offertes hebben aangemaakt, waardoor OFF-2026-0001 van de default-20-lijst valt).
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quotes?search=OFF-2026-0001')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const approvedQuote = listRes.body.data.data.find(
        (q: any) => q.quoteNumber === 'OFF-2026-0001',
      );
      expect(approvedQuote).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/api/v1/quotes/${approvedQuote.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(400);
    });
  });

  // ─── POST /requests/:id/quote ────────────────────────

  describe('POST /api/v1/requests/:id/quote', () => {
    it('creates quote from request and sets request status to OFFERTE_GEMAAKT', async () => {
      // Use the seeded NIEUW request "Thermografisch onderzoek bedrijfshal"
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const targetRequest = listRes.body.data.data.find(
        (r: any) => r.title === 'Thermografisch onderzoek bedrijfshal',
      );
      expect(targetRequest).toBeDefined();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/requests/${targetRequest.id}/quote`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.requestId).toBe(targetRequest.id);
      expect(res.body.data.contactId).toBe(targetRequest.contactId);
      expect(res.body.data.quoteNumber).toMatch(/^OFF-\d{4}-\d{4}$/);

      createdQuoteIds.push(res.body.data.id);

      // Verify request status was updated to OFFERTE_GEMAAKT
      const reqDetail = await request(app.getHttpServer())
        .get(`/api/v1/requests/${targetRequest.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(reqDetail.body.data.status).toBe('OFFERTE_GEMAAKT');

      // Restore request status back to NIEUW for other tests
      await request(app.getHttpServer())
        .patch(`/api/v1/requests/${targetRequest.id}/status`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ status: 'NIEUW', note: 'E2E cleanup restore' });
    });
  });
});
