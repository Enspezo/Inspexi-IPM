import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Quote Templates API (e2e)
 *
 * Runs against the real seeded database.
 * Seed users used:
 *   - admin@inspexi-demo.nl      (ORG_ADMIN, org1 = InspeXi Demo)
 *   - admin@testbedrijf.nl       (ORG_ADMIN, org2 = Test Bedrijf)
 *
 * Seed templates (org1):
 *   1. "Standaard Inspectie Offerte" (requiresApproval=false, validityDays=30)
 *   2. "Groot Project Offerte (goedkeuring vereist)" (requiresApproval=true, validityDays=14)
 */
describe('Quote Templates API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens per role
  let org1AdminToken: string;
  let org2AdminToken: string;

  // IDs of resources created during tests (for cleanup)
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

    // Login seed users in parallel
    const [org1Admin, org2Admin] = await Promise.all([
      login('admin@inspexi-demo.nl'),
      login('admin@testbedrijf.nl'),
    ]);

    org1AdminToken = org1Admin.accessToken;
    org2AdminToken = org2Admin.accessToken;
  });

  afterAll(async () => {
    // Clean up test-created templates
    if (createdTemplateIds.length > 0) {
      await prisma.quoteTemplate.deleteMany({
        where: { id: { in: createdTemplateIds } },
      });
    }

    await app.close();
  });

  // ─── GET /quote-templates ─────────────────────────────

  describe('GET /api/v1/quote-templates', () => {
    it('ORG_ADMIN can list templates (2 seed templates)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);

      const names = res.body.data.data.map((t: any) => t.name);
      expect(names).toContain('Standaard Inspectie Offerte');
      expect(names).toContain(
        'Groot Project Offerte (goedkeuring vereist)',
      );
    });
  });

  // ─── POST /quote-templates ────────────────────────────

  describe('POST /api/v1/quote-templates', () => {
    it('ORG_ADMIN can create template', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Test Template',
          coverBlocks: [{ type: 'heading', content: 'Test Cover' }],
          contentBlocks: [{ type: 'text', content: 'Test Content' }],
          closingBlocks: [{ type: 'text', content: 'Test Closing' }],
          defaultValidityDays: 45,
          requiresApproval: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Test Template');
      expect(res.body.data.defaultValidityDays).toBe(45);
      expect(res.body.data.requiresApproval).toBe(true);
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.id).toBeDefined();

      createdTemplateIds.push(res.body.data.id);
    });
  });

  // ─── GET /quote-templates/:id ─────────────────────────

  describe('GET /api/v1/quote-templates/:id', () => {
    it('detail returned for existing template', async () => {
      // Use the first seeded template
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const templateId = listRes.body.data.data[0].id;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/quote-templates/${templateId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(templateId);
      expect(res.body.data.name).toBeDefined();
      expect(res.body.data.coverBlocks).toBeDefined();
    });
  });

  // ─── PATCH /quote-templates/:id ───────────────────────

  describe('PATCH /api/v1/quote-templates/:id', () => {
    it('update works', async () => {
      // Use a test-created template
      expect(createdTemplateIds.length).toBeGreaterThan(0);
      const templateId = createdTemplateIds[0];

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/quote-templates/${templateId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Updated Template',
          defaultValidityDays: 60,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Updated Template');
      expect(res.body.data.defaultValidityDays).toBe(60);
    });
  });

  // ─── DELETE /quote-templates/:id ──────────────────────

  describe('DELETE /api/v1/quote-templates/:id', () => {
    it('deactivates template (isActive=false)', async () => {
      // Create a template to deactivate
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Deactivate Template',
          defaultValidityDays: 10,
        })
        .expect(201);

      const templateId = createRes.body.data.id;
      createdTemplateIds.push(templateId);

      const res = await request(app.getHttpServer())
        .delete(`/api/v1/quote-templates/${templateId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.isActive).toBe(false);

      // Verify it no longer appears in the active list
      const listRes = await request(app.getHttpServer())
        .get('/api/v1/quote-templates?isActive=true')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      const ids = listRes.body.data.data.map((t: any) => t.id);
      expect(ids).not.toContain(templateId);
    });
  });

  // ─── Cross-org isolation ──────────────────────────────

  describe('Cross-org isolation', () => {
    it('ORG_ADMIN from org2 cannot see org1 templates', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/quote-templates')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const names = res.body.data.data.map((t: any) => t.name);
      expect(names).not.toContain('Standaard Inspectie Offerte');
      expect(names).not.toContain(
        'Groot Project Offerte (goedkeuring vereist)',
      );
    });
  });
});
