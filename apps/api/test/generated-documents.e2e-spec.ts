import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

// Puppeteer (export-pdf) start een echte headless Chromium → ruime timeout.
jest.setTimeout(120000);

describe('Generated Documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgAId: string;
  let orgBId: string;
  let userAId: string;
  let userBId: string;
  let classificationModelId: string;
  let normCode: string;
  let inspectionTemplateId: string;
  let contactId: string;
  let planId: string;
  let tokenA: string;
  let tokenB: string;

  // Tijdens de run vastgelegd
  let documentId: string;
  let signatureRequestId: string;

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

    const orgA = await prisma.organization.create({ data: { name: 'E2E GenDoc A', slug: 'e2egendoca' } });
    orgAId = orgA.id;
    const userA = await prisma.user.create({
      data: {
        email: 'e2e-gendoc-a@test.nl',
        passwordHash,
        firstName: 'Gen',
        lastName: 'Doc',
        roles: ['ORG_ADMIN'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    userAId = userA.id;

    const orgB = await prisma.organization.create({ data: { name: 'E2E GenDoc B', slug: 'e2egendocb' } });
    orgBId = orgB.id;
    const userB = await prisma.user.create({
      data: {
        email: 'e2e-gendoc-b@test.nl',
        passwordHash,
        firstName: 'Other',
        lastName: 'Org',
        roles: ['ORG_ADMIN'],
        orgId: orgB.id,
        emailVerifiedAt: new Date(),
      },
    });
    userBId = userB.id;

    const cm = await prisma.classificationModel.create({
      data: { code: 'E2EGDCM', name: 'E2E GenDoc Classificatiemodel', createdBy: userA.id },
    });
    classificationModelId = cm.id;

    const norm = await prisma.normTypeDefinition.create({
      data: { code: 'E2EGDNORM', label: 'E2E GenDoc Norm', createdBy: userA.id },
    });
    normCode = norm.code;

    const it = await prisma.inspectionTemplate.create({
      data: {
        orgId: orgA.id,
        isSystem: false,
        code: 'E2EGD',
        name: 'E2E GenDoc Inspection Template',
        normTypeCode: normCode,
        classificationModelId,
        createdBy: userA.id,
      },
    });
    inspectionTemplateId = it.id;

    // Document-template (PLAN) met een STATIC sectie + een SIGNATURE_BLOCK.
    await prisma.documentTemplate.create({
      data: {
        inspectionTemplateId: it.id,
        documentType: 'PLAN',
        templateMode: 'SECTIONS',
        headerHtml: '<div>{{organization.name}}</div>',
        sections: {
          create: [
            {
              code: 'intro',
              title: 'Projectgegevens',
              sectionType: 'STATIC',
              sortOrder: 0,
              contentHtml: '<p>Referentie: {{plan.reference}} — {{client.name}}</p>',
            },
            {
              code: 'sig',
              title: 'Ondertekening',
              sectionType: 'SIGNATURE_BLOCK',
              sortOrder: 1,
            },
          ],
        },
      },
    });

    // Org-scoped ondertekenrol zodat resolveLookup slaagt, los van de globale seed.
    await prisma.signerRoleOption.create({
      data: { orgId: orgA.id, code: 'INSPECTOR', label: 'Inspecteur' },
    });

    const contact = await prisma.contact.create({
      data: { orgId: orgA.id, type: 'COMPANY', companyName: 'E2E GenDoc Klant BV' },
    });
    contactId = contact.id;

    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contact.id,
        projectName: 'E2E GenDoc inspectie',
        referenceNumber: 'E2E-GD-0001',
        normTypeCode: normCode,
        inspectionTypeCode: 'initial',
        statusCode: 'draft',
        inspectionTemplateId: it.id,
        assignedTo: userA.id,
        addressStreet: 'Teststraat',
        addressHouseNumber: '1',
        addressPostalCode: '1000 AA',
        addressCity: 'Amsterdam',
        createdBy: userA.id,
      },
    });
    planId = plan.id;

    tokenA = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-gendoc-a@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
    tokenB = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-gendoc-b@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    try {
      const userIds = [userAId, userBId];
      const orgIds = [orgAId, orgBId];
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
      await prisma.signerRoleOption.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.classificationModel.deleteMany({ where: { id: classificationModelId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: normCode } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ userId: { in: userIds } }, { orgId: { in: orgIds } }] },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await app.close();
    }
  });

  const auth = (token = tokenA) => ({ Authorization: `Bearer ${token}` });

  it('generates a PLAN document (DRAFT)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${planId}/generate-plan`)
      .set(auth())
      .send({})
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('DRAFT');
    expect(res.body.data.documentType).toBe('PLAN');
    documentId = res.body.data.id;
    expect(documentId).toBeDefined();
  });

  it('returns the rendered HTML containing the plan reference', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/generated-documents/${documentId}/html`)
      .set(auth())
      .expect(200);
    expect(res.text).toContain('E2E-GD-0001');
    expect(res.text).toContain('E2E GenDoc Klant BV');
  });

  it('edits the content', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/generated-documents/${documentId}`)
      .set(auth())
      .send({ editedContent: '<html><body><p>Aangepast</p></body></html>' })
      .expect(200);
    expect(res.body.data.isEdited).toBe(true);
  });

  it('exports to Word and downloads it', async () => {
    const exp = await request(app.getHttpServer())
      .post(`/api/v1/generated-documents/${documentId}/export-word`)
      .set(auth())
      .expect(201);
    expect(exp.body.data.wordUrl).toContain(`/generated-documents/${documentId}/download?format=word`);

    const dl = await request(app.getHttpServer())
      .get(`/api/v1/generated-documents/${documentId}/download?format=word`)
      .set(auth())
      .buffer(true)
      .expect(200);
    expect(dl.headers['content-type']).toContain('wordprocessingml');
    expect(dl.headers['content-disposition']).toContain('.docx');
  });

  it('exports to PDF and downloads it', async () => {
    const exp = await request(app.getHttpServer())
      .post(`/api/v1/generated-documents/${documentId}/export-pdf`)
      .set(auth())
      .expect(201);
    expect(exp.body.data.pdfUrl).toContain(`/generated-documents/${documentId}/download?format=pdf`);

    const dl = await request(app.getHttpServer())
      .get(`/api/v1/generated-documents/${documentId}/download?format=pdf`)
      .set(auth())
      .buffer(true)
      .expect(200);
    expect(dl.headers['content-type']).toContain('application/pdf');
  });

  it('requests a signature (mails the public link)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/generated-documents/${documentId}/request-signature`)
      .set(auth())
      .send({ signerRoleCode: 'INSPECTOR', signerName: 'Jan Klant', signerEmail: 'jan@klant.nl' })
      .expect(201);
    expect(res.body.data.status).toBe('REQUESTED');
    signatureRequestId = res.body.data.signatureRequestId;
    expect(signatureRequestId).toBeDefined();
  });

  it('rejects an unknown signer role', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/generated-documents/${documentId}/request-signature`)
      .set(auth())
      .send({ signerRoleCode: 'DOES_NOT_EXIST', signerName: 'X', signerEmail: 'x@y.nl' })
      .expect(400);
  });

  it('fetches the public signature request without leaking org data', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/signature-requests/${signatureRequestId}`)
      .expect(200);
    // De ondertekenaar ziet de actuele (zojuist bewerkte) document-inhoud.
    expect(res.body.data.html).toContain('Aangepast');
    expect(res.body.data.signerRoleCode).toBe('INSPECTOR');
    expect(res.body.data.status).toBe('REQUESTED');
    // Geen overige org-data: signer-e-mail en interne notities mogen niet lekken.
    expect(res.body.data.signerEmail).toBeUndefined();
    expect(JSON.stringify(res.body.data)).not.toContain('internalNotes');
  });

  it('rejects a non-image signature payload on the public link (400, B-404)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/signature-requests/${signatureRequestId}/sign`)
      .send({ signatureImage: 'javascript:alert(1)', signerName: 'Jan Klant' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('data-afbeelding');
  });

  it('signs via the public link, flips the document to SIGNED and records the IP (B-408)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/signature-requests/${signatureRequestId}/sign`)
      .send({ signatureImage: 'data:image/png;base64,iVBORw0KGgo=', signerName: 'Jan Klant' })
      .expect(201);

    const doc = await request(app.getHttpServer())
      .get(`/api/v1/generated-documents/${documentId}`)
      .set(auth())
      .expect(200);
    expect(doc.body.data.status).toBe('SIGNED');

    // B-408: het publieke kanaal legt het IP van de ondertekenaar vast
    // (audit trail) — net als de staf- en klantportaal-ondertekenroutes.
    const sig = await prisma.documentSignature.findFirst({
      where: { signatureRequestId },
    });
    expect(sig?.signedIpAddress).toEqual(expect.any(String));
    expect(sig?.signedIpAddress).not.toHaveLength(0);
  });

  it('finalizes the document', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/generated-documents/${documentId}/finalize`)
      .set(auth())
      .expect(201);
    expect(res.body.data.status).toBe('FINALIZED');
  });

  it('rejects a cross-tenant generate (foreign org plan → 403)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${planId}/generate-plan`)
      .set(auth(tokenB))
      .send({})
      .expect(403);
  });

  // Note: de publieke sign-rate-limit (@Throttle 10/min) is in code geconfigureerd, maar niet
  // e2e-testbaar — AppThrottlerGuard.shouldSkip() schakelt throttling uit bij NODE_ENV=test.
});
