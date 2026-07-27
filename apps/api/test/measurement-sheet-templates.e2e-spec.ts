import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Measurement Sheet Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testOrgId: string;
  let orgAdminId: string;
  let superuserId: string;
  let orgAdminToken: string;
  let superuserToken: string;
  let normTypeId: string;

  const NORM_CODE = 'E2EMSNORM';
  const TEMPLATE_CODE = 'E2E_MS_HV';

  // Templates created during the run (original + cloned new-version)
  const createdTemplateIds: string[] = [];

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

    // Test org
    const org = await prisma.organization.create({
      data: { name: 'E2E MeasSheet Org', slug: 'e2emeassheet' },
    });
    testOrgId = org.id;

    // ORG_ADMIN (non-superuser → writes must be rejected)
    const oa = await prisma.user.create({
      data: {
        email: 'e2e-oa-ms@test.nl',
        passwordHash,
        firstName: 'Org',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    orgAdminId = oa.id;

    // SUPERUSER (orgId null → only role allowed to write)
    const su = await prisma.user.create({
      data: {
        email: 'e2e-su-ms@test.nl',
        passwordHash,
        firstName: 'Super',
        lastName: 'User',
        roles: ['SUPERUSER'],
        emailVerifiedAt: new Date(),
      },
    });
    superuserId = su.id;

    // NormTypeDefinition (FK target for normTypeCode validation)
    const norm = await prisma.normTypeDefinition.create({
      data: {
        code: NORM_CODE,
        label: 'E2E MS Norm',
        assetTypes: ['hoofdverdeler'],
        createdBy: su.id,
      },
    });
    normTypeId = norm.id;

    // Login both
    const oaLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-oa-ms@test.nl', password: 'TestPass123!' });
    orgAdminToken = oaLogin.body.data.accessToken;

    const suLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-su-ms@test.nl', password: 'TestPass123!' });
    superuserToken = suLogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      // FK-safe teardown: history → fields → sections → templates → norm → users → org.
      // Templates are global (no orgId) — delete by code to catch the cloned version too.
      const templates = await prisma.measurementSheetTemplate.findMany({
        where: { code: TEMPLATE_CODE },
        select: { id: true },
      });
      const templateIds = templates.map((t) => t.id);

      await prisma.measurementSheetVersionHistory.deleteMany({
        where: { templateId: { in: templateIds } },
      });
      await prisma.measurementSheetField.deleteMany({
        where: { section: { templateId: { in: templateIds } } },
      });
      await prisma.measurementSheetSection.deleteMany({
        where: { templateId: { in: templateIds } },
      });
      // Clear self-relation before deleting parents
      await prisma.measurementSheetTemplate.updateMany({
        where: { id: { in: templateIds } },
        data: { previousVersionId: null },
      });
      await prisma.measurementSheetTemplate.deleteMany({
        where: { id: { in: templateIds } },
      });

      await prisma.normTypeDefinition.deleteMany({
        where: { code: NORM_CODE },
      });
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [orgAdminId, superuserId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [orgAdminId, superuserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [orgAdminId, superuserId] } },
      });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  let templateId: string;
  let sectionId: string;
  let fieldAId: string;
  let fieldBId: string;

  // ── Template creation + write-gating ──────────────────

  describe('POST /api/v1/measurement-sheet-templates', () => {
    it('creates a CONCEPT template as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-templates')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({
          code: TEMPLATE_CODE,
          name: 'E2E Meetstaat Hoofdverdeler',
          normType: NORM_CODE,
          assetTypes: ['hoofdverdeler'],
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.status).toBe('CONCEPT');
      expect(res.body.data.version).toBe('1.0');
      templateId = res.body.data.id;
      createdTemplateIds.push(templateId);
    });

    it('returns 403 for a non-superuser (ORG_ADMIN)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-templates')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({
          code: 'E2E_NOPE',
          name: 'Nope',
          normType: NORM_CODE,
          assetTypes: [],
        })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-templates')
        .send({ code: 'X', name: 'X', normType: NORM_CODE, assetTypes: [] })
        .expect(401);
    });

    it('returns 400 for an unknown normType', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/measurement-sheet-templates')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({
          code: 'E2E_BADNORM',
          name: 'Bad norm',
          normType: 'DOESNOTEXIST',
          assetTypes: [],
        })
        .expect(400);
    });
  });

  // ── Reads allowed for ORG_ADMIN ───────────────────────

  describe('GET /api/v1/measurement-sheet-templates', () => {
    it('lists templates (readable by ORG_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/measurement-sheet-templates')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      const codes = res.body.data.map((t: any) => t.code);
      expect(codes).toContain(TEMPLATE_CODE);
    });

    it('filters by normType', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-templates?normType=${NORM_CODE}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);
      expect(res.body.data.every((t: any) => t.normTypeCode === NORM_CODE)).toBe(
        true,
      );
    });
  });

  describe('GET /api/v1/measurement-sheet-templates/:id', () => {
    it('returns template detail with sections array (ORG_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-templates/${templateId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(templateId);
      expect(Array.isArray(res.body.data.sections)).toBe(true);
    });

    it('returns 404 for a non-existent id', async () => {
      await request(app.getHttpServer())
        .get(
          '/api/v1/measurement-sheet-templates/00000000-0000-0000-0000-000000000000',
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(404);
    });
  });

  // ── Sections ──────────────────────────────────────────

  describe('POST /api/v1/measurement-sheet-templates/:id/sections', () => {
    it('adds a section as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${templateId}/sections`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ code: 'algemeen', name: 'Algemene gegevens' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('algemeen');
      sectionId = res.body.data.id;
    });

    it('returns 403 when ORG_ADMIN adds a section', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${templateId}/sections`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ code: 'hack', name: 'Hack' })
        .expect(403);
    });

    it('lists sections (ORG_ADMIN read)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-templates/${templateId}/sections`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
    });
  });

  // ── Fields ────────────────────────────────────────────

  describe('fields under a section', () => {
    it('adds a first field as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/measurement-sheet-templates/${templateId}/sections/${sectionId}/fields`,
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({
          code: 'nominale_stroom',
          name: 'Nominale stroom',
          fieldType: 'NUMBER',
          unit: 'A',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.code).toBe('nominale_stroom');
      fieldAId = res.body.data.id;
    });

    it('adds a second field', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/measurement-sheet-templates/${templateId}/sections/${sectionId}/fields`,
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ code: 'fabrikant', name: 'Fabrikant', fieldType: 'TEXT' })
        .expect(201);

      expect(res.body.success).toBe(true);
      fieldBId = res.body.data.id;
    });

    it('reorders fields (literal /reorder before :fieldId)', async () => {
      const res = await request(app.getHttpServer())
        .post(
          `/api/v1/measurement-sheet-templates/${templateId}/sections/${sectionId}/fields/reorder`,
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ fieldIds: [fieldBId, fieldAId] })
        .expect(201);

      expect(res.body.success).toBe(true);
      const ordered = res.body.data.fields.map((f: any) => f.id);
      expect(ordered).toEqual([fieldBId, fieldAId]);
    });

    it('returns 403 for ORG_ADMIN adding a field', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/measurement-sheet-templates/${templateId}/sections/${sectionId}/fields`,
        )
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ code: 'hackveld', name: 'Hack', fieldType: 'TEXT' })
        .expect(403);
    });

    it('rejects a DROPDOWN field without options (400)', async () => {
      await request(app.getHttpServer())
        .post(
          `/api/v1/measurement-sheet-templates/${templateId}/sections/${sectionId}/fields`,
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ code: 'keuze', name: 'Keuze', fieldType: 'DROPDOWN' })
        .expect(400);
    });
  });

  // ── Lijst mét sections (WP-B1/B-205: PWA-referentiecache) ──

  describe('GET /api/v1/measurement-sheet-templates?include=sections', () => {
    it('levert de lijst mét sections + velden (geordend) voor de PWA-cache', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/measurement-sheet-templates?include=sections')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const template = res.body.data.find((t: any) => t.id === templateId);
      expect(template).toBeDefined();
      expect(Array.isArray(template.sections)).toBe(true);
      expect(template.sections).toHaveLength(1);
      const section = template.sections[0];
      expect(section.code).toBe('algemeen');
      // Velden komen mee, in sortOrder (na de reorder: B vóór A).
      expect(section.fields.map((f: any) => f.id)).toEqual([fieldBId, fieldAId]);
    });

    it('laat sections weg zonder include-param (bestaand lijstcontract)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/measurement-sheet-templates')
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      const template = res.body.data.find((t: any) => t.id === templateId);
      expect(template).toBeDefined();
      expect(template.sections).toBeUndefined();
      expect(template._count?.sections).toBe(1);
    });
  });

  // ── Final-check-rules ─────────────────────────────────

  describe('final-check-rules', () => {
    it('replaces rules as SUPERUSER (PUT)', async () => {
      const res = await request(app.getHttpServer())
        .put(
          `/api/v1/measurement-sheet-templates/${templateId}/final-check-rules`,
        )
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ rules: [{ type: 'allFieldsRequired' }] })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.finalCheckRules).toEqual([
        { type: 'allFieldsRequired' },
      ]);
    });

    it('reads rules (ORG_ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .get(
          `/api/v1/measurement-sheet-templates/${templateId}/final-check-rules`,
        )
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);
      expect(res.body.data).toEqual([{ type: 'allFieldsRequired' }]);
    });

    it('returns 403 when ORG_ADMIN replaces rules', async () => {
      await request(app.getHttpServer())
        .put(
          `/api/v1/measurement-sheet-templates/${templateId}/final-check-rules`,
        )
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ rules: [] })
        .expect(403);
    });
  });

  // ── Version lifecycle: publish → retire → new-version ──

  describe('version lifecycle', () => {
    it('publishes CONCEPT→ACTIEF as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${templateId}/publish`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ changeDescription: 'Eerste publicatie van het template' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIEF');
    });

    it('blocks editing once ACTIEF (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/measurement-sheet-templates/${templateId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'Mag niet meer' })
        .expect(400);
    });

    it('returns 403 publish for ORG_ADMIN', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${templateId}/retire`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .send({ changeDescription: 'hack' })
        .expect(403);
    });

    it('exposes version history (ORG_ADMIN read)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/measurement-sheet-templates/${templateId}/history`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // created + published entries
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      const transitions = res.body.data.map(
        (h: any) => `${h.fromStatus}->${h.toStatus}`,
      );
      expect(transitions).toContain('CONCEPT->ACTIEF');
    });

    it('retires ACTIEF→VERVALLEN as SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${templateId}/retire`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ changeDescription: 'Template is vervallen' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('VERVALLEN');
    });

    it('creates a new version (clone → CONCEPT, version bump)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/measurement-sheet-templates/${templateId}/new-version`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ changeDescription: 'Nieuwe revisie' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CONCEPT');
      expect(res.body.data.version).toBe('1.1');
      expect(res.body.data.previousVersion.id).toBe(templateId);
      // sections + fields were copied
      expect(res.body.data.sections).toHaveLength(1);
      expect(res.body.data.sections[0].fields).toHaveLength(2);
      createdTemplateIds.push(res.body.data.id);
    });
  });

  // ── Delete (CONCEPT-only) ─────────────────────────────

  describe('DELETE /api/v1/measurement-sheet-templates/:id', () => {
    it('returns 400 when deleting a non-CONCEPT (VERVALLEN) template', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/measurement-sheet-templates/${templateId}`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(400);
    });

    it('returns 403 deleting as ORG_ADMIN', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/measurement-sheet-templates/${templateId}`)
        .set('Authorization', `Bearer ${orgAdminToken}`)
        .expect(403);
    });
  });
});
