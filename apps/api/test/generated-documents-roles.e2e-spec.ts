// WP-A3 (B-101/B-102/B-103/B-104) — rolmatrix van de documentketen.
// Regressievangnet per route × rol: generate-plan/-report, PATCH (inhoud),
// intern ondertekenen (sign), DELETE en finalize. De vastgestelde norm staat in
// docs/testprogramma/07-cross-tenant-security.md (SEC-06) en als commentaar in
// generated-documents.controller.ts.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

jest.setTimeout(60000);

const SIGNATURE_IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

describe('Generated Documents role matrix (e2e, WP-A3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  const userIds: string[] = [];
  let inspecteurId: string;
  let classificationModelId: string;
  let normCode: string;
  let inspectionTemplateId: string;
  let contactId: string;
  let planId: string;

  // Tokens per rol
  let tInspecteur: string;
  let tBackoffice: string;
  let tWerkvoorbereider: string;
  let tManager: string;
  let tOrgAdmin: string;

  // Tijdens de run vastgelegd
  let docMainId: string; // sign-/PATCH-matrix
  let docDelId: string; // delete-matrix (blijft ongetekend)
  let docReportId: string; // finalize-matrix

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  const login = async (email: string) =>
    (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' })
    ).body.data.accessToken;

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

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const org = await prisma.organization.create({
      data: { name: 'E2E GenDoc Roles', slug: 'e2egendocroles' },
    });
    orgId = org.id;

    const mkUser = async (email: string, role: string) => {
      const u = await prisma.user.create({
        data: {
          email,
          passwordHash,
          firstName: 'Rol',
          lastName: role,
          roles: [role as never],
          orgId,
          emailVerifiedAt: new Date(),
        },
      });
      userIds.push(u.id);
      return u;
    };

    const inspecteur = await mkUser('e2e-gdr-inspecteur@test.nl', 'INSPECTEUR');
    inspecteurId = inspecteur.id;
    await mkUser('e2e-gdr-backoffice@test.nl', 'BACKOFFICE');
    await mkUser('e2e-gdr-werkvoorbereider@test.nl', 'WERKVOORBEREIDER');
    const manager = await mkUser('e2e-gdr-manager@test.nl', 'MANAGER');
    await mkUser('e2e-gdr-orgadmin@test.nl', 'ORG_ADMIN');

    const cm = await prisma.classificationModel.create({
      data: { code: 'E2EGDRCM', name: 'E2E GenDocRoles Classificatiemodel', createdBy: manager.id },
    });
    classificationModelId = cm.id;

    const norm = await prisma.normTypeDefinition.create({
      data: { code: 'E2EGDRNORM', label: 'E2E GenDocRoles Norm', createdBy: manager.id },
    });
    normCode = norm.code;

    const it = await prisma.inspectionTemplate.create({
      data: {
        orgId,
        isSystem: false,
        code: 'E2EGDR',
        name: 'E2E GenDocRoles Inspection Template',
        normTypeCode: normCode,
        classificationModelId,
        createdBy: manager.id,
      },
    });
    inspectionTemplateId = it.id;

    // PLAN- én REPORT-template zodat beide generate-routes een 201 kunnen geven.
    for (const documentType of ['PLAN', 'REPORT'] as const) {
      await prisma.documentTemplate.create({
        data: {
          inspectionTemplateId: it.id,
          documentType,
          templateMode: 'SECTIONS',
          sections: {
            create: [
              {
                code: 'intro',
                title: 'Projectgegevens',
                sectionType: 'STATIC',
                sortOrder: 0,
                contentHtml: '<p>Referentie: {{plan.reference}}</p>',
              },
            ],
          },
        },
      });
    }

    // Org-scoped ondertekenrollen zodat resolveLookup slaagt, los van de globale seed.
    await prisma.signerRoleOption.createMany({
      data: [
        { orgId, code: 'INSPECTOR', label: 'Inspecteur' },
        { orgId, code: 'REVIEWER', label: 'Beoordelaar' },
        { orgId, code: 'CLIENT', label: 'Opdrachtgever' },
      ],
    });

    const contact = await prisma.contact.create({
      data: { orgId, type: 'COMPANY', companyName: 'E2E GenDocRoles Klant BV' },
    });
    contactId = contact.id;

    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId,
        contactId: contact.id,
        projectName: 'E2E GenDocRoles inspectie',
        referenceNumber: 'E2E-GDR-0001',
        normTypeCode: normCode,
        inspectionTypeCode: 'initial',
        statusCode: 'draft',
        inspectionTemplateId: it.id,
        assignedTo: inspecteur.id,
        createdBy: manager.id,
      },
    });
    planId = plan.id;

    tInspecteur = await login('e2e-gdr-inspecteur@test.nl');
    tBackoffice = await login('e2e-gdr-backoffice@test.nl');
    tWerkvoorbereider = await login('e2e-gdr-werkvoorbereider@test.nl');
    tManager = await login('e2e-gdr-manager@test.nl');
    tOrgAdmin = await login('e2e-gdr-orgadmin@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.documentSignature.deleteMany({
        where: { generatedDocument: { inspectionPlanId: planId } },
      });
      await prisma.generatedDocument.deleteMany({ where: { inspectionPlanId: planId } });
      await prisma.documentSection.deleteMany({
        where: { documentTemplate: { inspectionTemplateId } },
      });
      await prisma.documentTemplate.deleteMany({ where: { inspectionTemplateId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: planId } });
      await prisma.inspectionTemplate.deleteMany({ where: { id: inspectionTemplateId } });
      await prisma.signerRoleOption.deleteMany({ where: { orgId } });
      await prisma.classificationModel.deleteMany({ where: { id: classificationModelId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: normCode } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { orgId }] },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  // ── Genereren: ALL_STAFF (bewuste keuze — B-103) ─────────────────────────
  describe('generate (ALL_STAFF)', () => {
    it('INSPECTEUR generates a PLAN document (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planId}/generate-plan`)
        .set(auth(tInspecteur))
        .send({})
        .expect(201);
      docMainId = res.body.data.id;
      expect(res.body.data.status).toBe('DRAFT');
    });

    it('INSPECTEUR generates a REPORT document (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planId}/generate-report`)
        .set(auth(tInspecteur))
        .send({})
        .expect(201);
      docReportId = res.body.data.id;
      expect(res.body.data.documentType).toBe('REPORT');
    });

    it('BACKOFFICE generates a PLAN document (201)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/inspection-plans/${planId}/generate-plan`)
        .set(auth(tBackoffice))
        .send({})
        .expect(201);
      docDelId = res.body.data.id;
    });
  });

  // ── PATCH inhoud: ALL_STAFF zolang niets getekend is (B-104) ─────────────
  describe('PATCH content (unsigned)', () => {
    it('BACKOFFICE edits an unsigned document (200)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${docMainId}`)
        .set(auth(tBackoffice))
        .send({ editedContent: '<p>Aangepast vóór ondertekening</p>' })
        .expect(200);
      expect(res.body.data.isEdited).toBe(true);
    });

    it('INSPECTEUR edits an unsigned document (200)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${docMainId}`)
        .set(auth(tInspecteur))
        .send({ editedContent: '<p>Aangepast door inspecteur</p>' })
        .expect(200);
    });
  });

  // ── Intern ondertekenen: rolcode-validatie + stafrol-mapping (B-101) ─────
  describe('sign (role mapping, B-101)', () => {
    it('INSPECTEUR signing as CLIENT → 403 (external role, only via signature request)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tInspecteur))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'CLIENT', signerName: 'Vervalste Klant' })
        .expect(403);
      expect(res.body.message).toContain('ondertekenverzoek');
    });

    it('INSPECTEUR signing with unknown role BESTAAT-NIET → 400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tInspecteur))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'BESTAAT-NIET' })
        .expect(400);
      expect(res.body.message).toContain('Onbekende ondertekenrol');
    });

    it('INSPECTEUR signing as REVIEWER → 403 (vier-ogen)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tInspecteur))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'REVIEWER' })
        .expect(403);
    });

    it('BACKOFFICE signing as INSPECTOR → 403 (no internal signer role)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tBackoffice))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'INSPECTOR' })
        .expect(403);
    });

    it('claims the open REQUESTED row: request INSPECTOR → sign as INSPECTEUR → single SIGNED row with userId + IP', async () => {
      // WERKVOORBEREIDER zet een ondertekenverzoek uit voor de INSPECTOR-rol.
      await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/request-signature`)
        .set(auth(tWerkvoorbereider))
        .send({ signerRoleCode: 'INSPECTOR', signerName: 'Rol INSPECTEUR', signerEmail: 'e2e-gdr-inspecteur@test.nl' })
        .expect(201);

      // De inspecteur tekent intern als INSPECTOR → claimt de REQUESTED-rij.
      const res = await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tInspecteur))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'INSPECTOR' })
        .expect(201);
      expect(res.body.data.status).toBe('SIGNED');

      const rows = await prisma.documentSignature.findMany({
        where: { generatedDocumentId: docMainId, signerRoleCode: 'INSPECTOR' },
      });
      expect(rows).toHaveLength(1); // géén tweede rij naast het verzoek
      expect(rows[0].status).toBe('SIGNED');
      expect(rows[0].signedByUserId).toBe(inspecteurId); // herleidbaarheid (B-101)
      expect(rows[0].signedIpAddress).toBeTruthy();
    });

    it('INSPECTEUR signing INSPECTOR again → 400 (role already signed)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tInspecteur))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'INSPECTOR' })
        .expect(400);
      expect(res.body.message).toContain('al een handtekening');
    });

    it('MANAGER (REVIEW_ROLES) signs as REVIEWER (201)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docMainId}/sign`)
        .set(auth(tManager))
        .send({ signatureImage: SIGNATURE_IMAGE, signerRoleCode: 'REVIEWER' })
        .expect(201);
    });
  });

  // ── PATCH ná de eerste handtekening: bevroren (B-104) ────────────────────
  describe('PATCH content (signed)', () => {
    it('MANAGER editing a signed document → 403', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${docMainId}`)
        .set(auth(tManager))
        .send({ editedContent: '<h1>GEMANIPULEERD RAPPORT</h1>' })
        .expect(403);
      expect(res.body.message).toContain('ondertekend');
    });

    it('INSPECTEUR editing a signed document → 403', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${docMainId}`)
        .set(auth(tInspecteur))
        .send({ editedContent: '<h1>GEMANIPULEERD</h1>' })
        .expect(403);
    });
  });

  // ── DELETE: APPROVERS + handtekening-blok (B-102) ────────────────────────
  describe('DELETE (APPROVERS, B-102)', () => {
    it('INSPECTEUR deleting → 403 (role guard)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/generated-documents/${docDelId}`)
        .set(auth(tInspecteur))
        .expect(403);
    });

    it('BACKOFFICE deleting → 403 (role guard)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/generated-documents/${docDelId}`)
        .set(auth(tBackoffice))
        .expect(403);
    });

    it('MANAGER deleting a document with a SIGNED signature → 400', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/generated-documents/${docMainId}`)
        .set(auth(tManager))
        .expect(400);
      expect(res.body.message).toContain('ondertekend');
      // Document én handtekeningen bestaan nog (geen cascade-verlies).
      const sigCount = await prisma.documentSignature.count({
        where: { generatedDocumentId: docMainId },
      });
      expect(sigCount).toBeGreaterThan(0);
    });

    it('WERKVOORBEREIDER deletes an unsigned document (200)', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/generated-documents/${docDelId}`)
        .set(auth(tWerkvoorbereider))
        .expect(200);
      const gone = await prisma.generatedDocument.findUnique({ where: { id: docDelId } });
      expect(gone).toBeNull();
    });
  });

  // ── Finalize: APPROVERS (bestond al — regressie) ─────────────────────────
  describe('finalize (APPROVERS)', () => {
    it('INSPECTEUR finalizing → 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docReportId}/finalize`)
        .set(auth(tInspecteur))
        .expect(403);
    });

    it('BACKOFFICE finalizing → 403', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docReportId}/finalize`)
        .set(auth(tBackoffice))
        .expect(403);
    });

    it('ORG_ADMIN finalizes (201); daarna is PATCH 403 en DELETE 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/generated-documents/${docReportId}/finalize`)
        .set(auth(tOrgAdmin))
        .expect(201);
      expect(res.body.data.status).toBe('FINALIZED');

      await request(app.getHttpServer())
        .patch(`/api/v1/generated-documents/${docReportId}`)
        .set(auth(tOrgAdmin))
        .send({ editedContent: '<p>na finalize</p>' })
        .expect(403);

      await request(app.getHttpServer())
        .delete(`/api/v1/generated-documents/${docReportId}`)
        .set(auth(tOrgAdmin))
        .expect(403);
    });
  });
});
