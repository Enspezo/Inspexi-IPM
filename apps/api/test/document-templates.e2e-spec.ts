import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

describe('Document Templates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let testOrgId: string;
  let testUserId: string;
  let otherOrgId: string;
  let otherUserId: string;
  let classificationModelId: string;
  let normTypeCode: string;
  let inspectionTemplateId: string;
  let accessToken: string;
  let otherAccessToken: string;

  // Captured during the run
  let planDocTemplateId: string;
  let reportDocTemplateId: string;
  const createdSectionIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();

    prisma = app.get(PrismaService);

    // Org A + ORG_ADMIN
    const org = await prisma.organization.create({
      data: { name: 'E2E DocTpl Org', slug: 'e2edoctpl' },
    });
    testOrgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-document-templates@test.nl',
        passwordHash,
        firstName: 'Doc',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Org B + ORG_ADMIN (for cross-tenant isolation)
    const otherOrg = await prisma.organization.create({
      data: { name: 'E2E DocTpl Other', slug: 'e2edoctplother' },
    });
    otherOrgId = otherOrg.id;
    const otherUser = await prisma.user.create({
      data: {
        email: 'e2e-document-templates-other@test.nl',
        passwordHash,
        firstName: 'Other',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: otherOrg.id,
        emailVerifiedAt: new Date(),
      },
    });
    otherUserId = otherUser.id;

    // Classification model + norm type (globals)
    const cm = await prisma.classificationModel.create({
      data: { code: 'E2EDTCM', name: 'E2E DocTpl Classificatiemodel', createdBy: user.id },
    });
    classificationModelId = cm.id;

    const norm = await prisma.normTypeDefinition.create({
      data: { code: 'E2EDTNORM', label: 'E2E DocTpl Norm', createdBy: user.id },
    });
    normTypeCode = norm.code;

    // Org-scoped inspection template (CONCEPT — writes are gated on it)
    const it = await prisma.inspectionTemplate.create({
      data: {
        orgId: testOrgId,
        isSystem: false,
        code: 'E2EDT',
        name: 'E2E DocTpl Inspection Template',
        normTypeCode,
        classificationModelId,
        createdBy: user.id,
      },
    });
    inspectionTemplateId = it.id;

    accessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-document-templates@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;

    otherAccessToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-document-templates-other@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    try {
      const userIds = [testUserId, otherUserId];
      await prisma.documentTemplateDocxRevision.deleteMany({
        where: { documentTemplate: { inspectionTemplateId } },
      });
      await prisma.documentSection.deleteMany({
        where: { documentTemplate: { inspectionTemplateId } },
      });
      await prisma.documentTemplate.deleteMany({ where: { inspectionTemplateId } });
      await prisma.inspectionTemplate.deleteMany({ where: { id: inspectionTemplateId } });
      await prisma.classificationModel.deleteMany({ where: { id: classificationModelId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: normTypeCode } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: [testOrgId, otherOrgId] } } });
    } finally {
      await app.close();
    }
  });

  const auth = (token = accessToken) => ({ Authorization: `Bearer ${token}` });

  // ──────────────────────────── plan-template (get-or-create + update) ────────────────────────────

  describe('GET/PUT /inspection-templates/:id/plan-template', () => {
    it('get-or-creates the plan template (default SECTIONS)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/plan-template`)
        .set(auth())
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.documentType).toBe('PLAN');
      expect(res.body.data.templateMode).toBe('SECTIONS');
      planDocTemplateId = res.body.data.id;
      expect(planDocTemplateId).toBeDefined();
    });

    it('updates plan template settings', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/inspection-templates/${inspectionTemplateId}/plan-template`)
        .set(auth())
        .send({ marginTop: 30, headerHtml: '<div>Kop {{plan.reference}}</div>' })
        .expect(200);

      expect(res.body.data.marginTop).toBe(30);
      expect(res.body.data.headerHtml).toContain('Kop');
    });

    it('401 without a token', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/plan-template`)
        .expect(401);
    });
  });

  // ──────────────────────────── sections ────────────────────────────

  describe('sections sub-resource', () => {
    it('creates a STATIC section', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/document-templates/${planDocTemplateId}/sections`)
        .set(auth())
        .send({
          code: 'intro',
          title: 'Inleiding',
          sectionType: 'STATIC',
          contentHtml: '<p>Referentie: {{plan.reference}}</p>',
          sortOrder: 0,
        })
        .expect(201);

      expect(res.body.data.code).toBe('intro');
      createdSectionIds.push(res.body.data.id);
    });

    it('creates a TABLE_OF_CONTENTS section', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/document-templates/${planDocTemplateId}/sections`)
        .set(auth())
        .send({ code: 'toc', title: 'Inhoudsopgave', sectionType: 'TABLE_OF_CONTENTS', sortOrder: 1 })
        .expect(201);
      createdSectionIds.push(res.body.data.id);
    });

    it('400 on an invalid section DTO', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/document-templates/${planDocTemplateId}/sections`)
        .set(auth())
        .send({ title: 'Geen code of type' })
        .expect(400);
    });

    it('reorders sections', async () => {
      const reordered = [...createdSectionIds].reverse();
      const res = await request(app.getHttpServer())
        .post(`/api/v1/document-templates/${planDocTemplateId}/sections/reorder`)
        .set(auth())
        .send({ sectionIds: reordered })
        .expect(201);
      expect(res.body.success).toBe(true);
    });

    it('updates a section', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/document-templates/${planDocTemplateId}/sections/${createdSectionIds[0]}`)
        .set(auth())
        .send({ title: 'Inleiding (bijgewerkt)' })
        .expect(200);
      expect(res.body.data.title).toBe('Inleiding (bijgewerkt)');
    });

    it('lists sections', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/document-templates/${planDocTemplateId}/sections`)
        .set(auth())
        .expect(200);
      expect(res.body.data.length).toBe(2);
    });
  });

  // ──────────────────────────── preview ────────────────────────────

  describe('preview', () => {
    it('renders SECTIONS preview as HTML with sample context', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/plan-template/preview`)
        .set(auth())
        .expect(200);

      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<!DOCTYPE html>');
      // The STATIC section rendered the sample plan reference (PLAN sample → PLAN-2026-0001)
      expect(res.text).toContain('PLAN-2026-0001');
      expect(res.text).toContain('Inhoudsopgave');
    });
  });

  // ──────────────────────────── migrate-to-blocks ────────────────────────────

  describe('migrate-to-blocks', () => {
    it('migrates sections to BLOCKS mode', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/document-templates/${planDocTemplateId}/migrate-to-blocks`)
        .set(auth())
        .expect(201);
      expect(res.body.data.templateMode).toBe('BLOCKS');
    });

    it('renders BLOCKS preview after migration', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/plan-template/preview`)
        .set(auth())
        .expect(200);
      expect(res.text).toContain('page-content');
    });
  });

  // ──────────────────────────── DOCX revisions (report template) ────────────────────────────

  describe('DOCX revisions', () => {
    let revisionId: string;

    it('get-or-creates the report template', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/report-template`)
        .set(auth())
        .expect(200);
      reportDocTemplateId = res.body.data.id;
      expect(reportDocTemplateId).toBeDefined();
    });

    it('uploads a DOCX revision (v1) and flips mode to DOCX', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/document-templates/${reportDocTemplateId}/docx`)
        .set(auth())
        .attach('file', Buffer.from('PK fake docx bytes'), {
          filename: 'rapport.docx',
          contentType: DOCX_MIME,
        })
        .expect(201);
      expect(res.body.data.version).toBe(1);
      revisionId = res.body.data.id;
    });

    it('lists DOCX revisions', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/document-templates/${reportDocTemplateId}/docx/revisions`)
        .set(auth())
        .expect(200);
      expect(res.body.data.length).toBe(1);
    });

    it('streams a DOCX revision download', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/document-templates/${reportDocTemplateId}/docx/revisions/${revisionId}/download`)
        .set(auth())
        .buffer(true)
        .expect(200);
      expect(res.headers['content-type']).toContain('wordprocessingml');
      expect(res.headers['content-disposition']).toContain('rapport.docx');
    });

    it('report-template preview reports DOCX mode (no 500)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/report-template/preview`)
        .set(auth())
        .expect(200);
      expect(res.text).toContain('DOCX-modus');
    });

    it('deletes the revision and reverts the template to SECTIONS', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/document-templates/${reportDocTemplateId}/docx/revisions/${revisionId}`)
        .set(auth())
        .expect(200);

      const list = await request(app.getHttpServer())
        .get(`/api/v1/document-templates/${reportDocTemplateId}/docx/revisions`)
        .set(auth())
        .expect(200);
      expect(list.body.data.length).toBe(0);

      const tpl = await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/report-template`)
        .set(auth())
        .expect(200);
      expect(tpl.body.data.templateMode).toBe('SECTIONS');
    });
  });

  // ──────────────────────────── cross-tenant isolation ────────────────────────────

  describe('cross-tenant isolation', () => {
    it('404 for a foreign org reading another org inspection template', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/inspection-templates/${inspectionTemplateId}/plan-template`)
        .set(auth(otherAccessToken))
        .expect(404);
    });

    it('404 for a foreign org operating on another org document template', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/document-templates/${planDocTemplateId}/sections`)
        .set(auth(otherAccessToken))
        .expect(404);
    });
  });
});
