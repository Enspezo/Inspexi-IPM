import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Requests API (e2e)
 *
 * Runs against the real seeded database.
 * Seed users used:
 *   - admin@inspexi-demo.nl      (ORG_ADMIN, org1 = InspeXi Demo)
 *   - manager@inspexi-demo.nl    (MANAGER, org1)
 *   - inspecteur@inspexi-demo.nl (INSPECTEUR, org1)
 *   - admin@testbedrijf.nl       (ORG_ADMIN, org2 = Test Bedrijf)
 *
 * Seed requests:
 *   org1: 4 requests
 *     1. "NEN1010 keuring kantoorpand"            (IN_BEHANDELING, HIGH, assigned to manager)
 *     2. "Thermografisch onderzoek bedrijfshal"    (NIEUW, NORMAL, unassigned)
 *     3. "NEN3140 inspectie werkplaats"            (OFFERTE_GEMAAKT, NORMAL, assigned to backoffice)
 *     4. "Elektrakeuring nieuwbouwproject"          (GEWONNEN, LOW, assigned to manager)
 *   org2: 1 request
 *     5. "Basisinspectie fabriek"                  (NIEUW)
 */
describe('Requests API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens per role
  let org1AdminToken: string;
  let org1ManagerToken: string;
  let org1InspecteurToken: string;
  let org2AdminToken: string;

  // IDs of resources created during tests (for cleanup)
  const createdRequestIds: string[] = [];

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
    // Clean up resources created during tests
    if (createdRequestIds.length > 0) {
      // Delete status history first (FK to request)
      await prisma.requestStatusHistory.deleteMany({
        where: { requestId: { in: createdRequestIds } },
      });
      await prisma.request.deleteMany({
        where: { id: { in: createdRequestIds } },
      });
    }

    await app.close();
  });

  // ─── GET /requests ──────────────────────────────────────

  describe('GET /api/v1/requests', () => {
    it('ORG_ADMIN can list requests of own org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      // Org1 has 4 seeded requests
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(4);

      // All returned requests belong to org1
      const org1Id = res.body.data.data[0].orgId;
      for (const req of res.body.data.data) {
        expect(req.orgId).toBe(org1Id);
      }
    });

    it('filter by status works (status=NIEUW)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .query({ status: 'NIEUW' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      for (const req of res.body.data.data) {
        expect(req.status).toBe('NIEUW');
      }
    });

    it('filter by priority works (priority=HIGH)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .query({ priority: 'HIGH' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      for (const req of res.body.data.data) {
        expect(req.priority).toBe('HIGH');
      }
    });

    it('search by title works (search=NEN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .query({ search: 'NEN' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);
      const titles = res.body.data.data.map((r: any) => r.title);
      expect(titles.some((t: string) => t.includes('NEN'))).toBe(true);
    });

    it('INSPECTEUR gets 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org1InspecteurToken}`)
        .expect(403);
    });

    it('cross-org: ORG_ADMIN from org2 only sees own requests', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const requests = res.body.data.data;
      // Org2 has 1 seeded request
      expect(requests.length).toBeGreaterThanOrEqual(1);

      // None of the org1 request titles should appear
      const titles = requests.map((r: any) => r.title);
      expect(titles).not.toContain('NEN1010 keuring kantoorpand');
      expect(titles).not.toContain('Thermografisch onderzoek bedrijfshal');
      expect(titles).not.toContain('NEN3140 inspectie werkplaats');
      expect(titles).not.toContain('Elektrakeuring nieuwbouwproject');
    });
  });

  // ─── POST /requests ─────────────────────────────────────

  describe('POST /api/v1/requests', () => {
    let org1ContactId: string;

    beforeAll(async () => {
      // Retrieve a valid contactId from org1 seed data
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      org1ContactId = contactRes.body.data.data[0].id;
    });

    it('ORG_ADMIN can create a request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId: org1ContactId,
          source: 'MANUAL',
          title: 'E2E Test Aanvraag',
          description: 'Aanvraag aangemaakt door E2E test',
          priority: 'NORMAL',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('E2E Test Aanvraag');
      expect(res.body.data.description).toBe(
        'Aanvraag aangemaakt door E2E test',
      );
      expect(res.body.data.priority).toBe('NORMAL');
      expect(res.body.data.id).toBeDefined();

      createdRequestIds.push(res.body.data.id);
    });

    it('created request has status NIEUW by default', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId: org1ContactId,
          source: 'PHONE',
          title: 'E2E Status Default Test',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('NIEUW');
      expect(res.body.data.id).toBeDefined();

      createdRequestIds.push(res.body.data.id);
    });
  });

  // ─── GET /requests/:id ──────────────────────────────────

  describe('GET /api/v1/requests/:id', () => {
    it('detail contains contact, location, statusHistory', async () => {
      // Use a seeded request: find one from the list
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const seededRequest = listRes.body.data.data.find(
        (r: any) => r.title === 'NEN1010 keuring kantoorpand',
      );
      expect(seededRequest).toBeDefined();

      const res = await request(app.getHttpServer())
        .get(`/api/v1/requests/${seededRequest.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const detail = res.body.data;

      // contact should be included
      expect(detail.contact).toBeDefined();
      expect(detail.contact.id).toBeDefined();

      // location should be included
      expect(detail.location).toBeDefined();
      expect(detail.location.id).toBeDefined();

      // statusHistory should be included
      expect(detail.statusHistory).toBeDefined();
      expect(Array.isArray(detail.statusHistory)).toBe(true);
      expect(detail.statusHistory.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── PATCH /requests/:id ────────────────────────────────

  describe('PATCH /api/v1/requests/:id', () => {
    it('ORG_ADMIN can update title and description', async () => {
      // Create a request to update
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const contactId = contactRes.body.data.data[0].id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId,
          source: 'MANUAL',
          title: 'Temp Update Aanvraag',
        })
        .expect(201);

      const requestId = createRes.body.data.id;
      createdRequestIds.push(requestId);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/requests/${requestId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          title: 'Bijgewerkte Aanvraag Titel',
          description: 'Bijgewerkte omschrijving via E2E test',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.title).toBe('Bijgewerkte Aanvraag Titel');
      expect(res.body.data.description).toBe(
        'Bijgewerkte omschrijving via E2E test',
      );
    });
  });

  // ─── PATCH /requests/:id/status ─────────────────────────

  describe('PATCH /api/v1/requests/:id/status', () => {
    let statusTestRequestId: string;

    beforeAll(async () => {
      // Create a fresh request for status tests
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const contactId = contactRes.body.data.data[0].id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId,
          source: 'MANUAL',
          title: 'Status Update Test Aanvraag',
        })
        .expect(201);

      statusTestRequestId = createRes.body.data.id;
      createdRequestIds.push(statusTestRequestId);
    });

    it('status update to IN_BEHANDELING with note works', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/requests/${statusTestRequestId}/status`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          status: 'IN_BEHANDELING',
          note: 'Wordt opgepakt door monteur',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('IN_BEHANDELING');
    });

    it('status history is correctly recorded', async () => {
      // Fetch detail to check statusHistory
      const res = await request(app.getHttpServer())
        .get(`/api/v1/requests/${statusTestRequestId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const history = res.body.data.statusHistory;
      expect(Array.isArray(history)).toBe(true);
      // At least 2 entries: initial NIEUW + update to IN_BEHANDELING
      expect(history.length).toBeGreaterThanOrEqual(2);

      // History is ordered desc, so the first entry is the most recent
      const latestEntry = history[0];
      expect(latestEntry.fromStatus).toBe('NIEUW');
      expect(latestEntry.toStatus).toBe('IN_BEHANDELING');
      expect(latestEntry.note).toBe('Wordt opgepakt door monteur');
      expect(latestEntry.changedByUser).toBeDefined();
    });
  });

  // ─── POST /requests/:id/quote ───────────────────────────

  describe('POST /api/v1/requests/:id/quote', () => {
    it('creates a quote from request and returns 201', async () => {
      // Use a seeded request
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const seededRequest = listRes.body.data.data[0];

      const res = await request(app.getHttpServer())
        .post(`/api/v1/requests/${seededRequest.id}/quote`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.requestId).toBe(seededRequest.id);
      expect(res.body.data.quoteNumber).toBeDefined();
    });
  });

  // ─── DELETE /requests/:id ───────────────────────────────

  describe('DELETE /api/v1/requests/:id', () => {
    it('soft delete works (request no longer appears in list)', async () => {
      // Create a request to delete
      const contactRes = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const contactId = contactRes.body.data.data[0].id;

      const createRes = await request(app.getHttpServer())
        .post('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          contactId,
          source: 'MANUAL',
          title: 'E2E Delete Test Aanvraag',
        })
        .expect(201);

      const deleteId = createRes.body.data.id;
      createdRequestIds.push(deleteId);

      // Delete the request
      const deleteRes = await request(app.getHttpServer())
        .delete(`/api/v1/requests/${deleteId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);

      // Verify it no longer appears in the list
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/requests')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const ids = listRes.body.data.data.map((r: any) => r.id);
      expect(ids).not.toContain(deleteId);
    });
  });
});
