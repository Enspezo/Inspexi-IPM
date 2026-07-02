import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

// Tweede auth-realm (klantportaal) onder subdomein-tenancy. De org komt uit de Host-header
// (TenantMiddleware), NIET uit het token. Cross-tenant is de hoeksteen van deze fase:
// een klant van org A mag op org B's subdomein niets zien (403/leeg).
jest.setTimeout(60000);

// BASE_DOMAIN=localhost in de testomgeving → een org-subdomein is "<slug>.localhost".
const HOST_A = 'e2eclienta.localhost';
const HOST_B = 'e2eclientb.localhost';
const CLIENT_PW = 'ClientPass123!';

describe('Client Portal (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // org/staf/lookup ids
  let orgAId: string;
  let orgBId: string;
  let staffAId: string;
  let normCode: string;
  let cmId: string;
  let itId: string;
  let docTemplateId: string;
  let contactAId: string;
  let crmLocationId: string;
  let planId: string;
  let assetId: string;
  let findingId: string;
  let documentId: string;

  // client realm
  let clientUserId: string;
  const clientEmail = 'e2e-client-a@test.nl';
  const newClientEmail = 'e2e-client-new@test.nl';
  const magicToken = 'e2e-magic-token-register-flow';

  // tijdens de run vastgelegd
  let tokenA: string; // client-realm access token (org A)
  let staffTokenA: string; // staf-realm access token (org A) — voor realm-kruising

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
    const clientHash = await bcrypt.hash(CLIENT_PW, 10);

    // ── Organisaties (slug = subdomein) ──
    const orgA = await prisma.organization.create({ data: { name: 'E2E Client A', slug: 'e2eclienta' } });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({ data: { name: 'E2E Client B', slug: 'e2eclientb' } });
    orgBId = orgB.id;

    const staffA = await prisma.user.create({
      data: {
        email: 'e2e-staff-a@test.nl',
        passwordHash,
        firstName: 'Staf',
        lastName: 'A',
        roles: ['ORG_ADMIN'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    staffAId = staffA.id;

    // ── Inspectie-fundament (org A) ──
    const cm = await prisma.classificationModel.create({
      data: { code: 'E2ECPCM', name: 'E2E CP Classificatiemodel', createdBy: staffA.id },
    });
    cmId = cm.id;
    const norm = await prisma.normTypeDefinition.create({
      data: { code: 'E2ECPNORM', label: 'E2E CP Norm', createdBy: staffA.id },
    });
    normCode = norm.code;
    const it = await prisma.inspectionTemplate.create({
      data: {
        orgId: orgA.id,
        code: 'E2ECP',
        name: 'E2E CP Inspection Template',
        normTypeCode: normCode,
        classificationModelId: cm.id,
        createdBy: staffA.id,
      },
    });
    itId = it.id;
    const docTemplate = await prisma.documentTemplate.create({
      data: { inspectionTemplateId: it.id, documentType: 'PLAN', templateMode: 'SECTIONS' },
    });
    docTemplateId = docTemplate.id;

    const contactA = await prisma.contact.create({
      data: { orgId: orgA.id, type: 'COMPANY', companyName: 'E2E Opdrachtgever BV' },
    });
    contactAId = contactA.id;

    // CRM-Locatie = boom-wortel van de AssetNode-boom; tevens hoofdlocatie van het plan.
    const crmLocation = await prisma.location.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        name: 'E2E Client Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    crmLocationId = crmLocation.id;

    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        locationId: crmLocation.id,
        projectName: 'E2E Client inspectie',
        referenceNumber: 'E2E-CP-0001',
        normTypeCode: normCode,
        inspectionTypeCode: 'initial',
        statusCode: 'completed',
        inspectionTemplateId: it.id,
        addressStreet: 'Klantstraat',
        addressHouseNumber: '5',
        addressCity: 'Rotterdam',
        createdBy: staffA.id,
      },
    });
    planId = plan.id;

    // Wortel-LOCATION-node (1:1 aan de CRM-Locatie). PARENT VÓÓR CHILD.
    const rootNode = await prisma.assetNode.create({
      data: {
        orgId: orgA.id,
        nodeType: 'LOCATION',
        rootLocationId: crmLocation.id,
        typeCode: 'locatie',
        name: 'Wortel',
        createdBy: staffA.id,
      },
    });
    // ASSET-node onder de wortel; vervangt het oude asset-id.
    const asset = await prisma.assetNode.create({
      data: {
        orgId: orgA.id,
        nodeType: 'ASSET',
        parentId: rootNode.id,
        typeCode: 'kast',
        name: 'Asset',
        statusCode: 'completed',
        createdBy: staffA.id,
      },
    });
    assetId = asset.id;

    const finding = await prisma.finding.create({
      data: {
        orgId: orgA.id,
        assetNodeId: asset.id,
        inspectionPlanId: plan.id,
        inspectionType: 'visual',
        shortDescription: 'Ontbrekende afdekking',
        statusCode: 'open',
        createdBy: staffA.id,
      },
    });
    findingId = finding.id;

    const doc = await prisma.generatedDocument.create({
      data: {
        orgId: orgA.id,
        documentTemplateId: docTemplate.id,
        inspectionPlanId: plan.id,
        documentType: 'PLAN',
        htmlContent: '<html><body><p>E2E-CP-0001 inspectierapport</p></body></html>',
        status: 'PENDING_SIGNATURES',
        generatedBy: staffA.id,
      },
    });
    documentId = doc.id;
    await prisma.documentSignature.create({
      data: {
        generatedDocumentId: doc.id,
        signerRoleCode: 'CLIENT',
        signerName: 'Opdrachtgever',
        status: 'PENDING',
      },
    });

    // ── Client realm (org A) ──
    const clientUser = await prisma.clientUser.create({
      data: {
        email: clientEmail,
        passwordHash: clientHash,
        firstName: 'Klaas',
        lastName: 'Klant',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    clientUserId = clientUser.id;
    await prisma.clientAccess.create({
      data: { clientUserId: clientUser.id, contactId: contactA.id, role: 'SIGNER' },
    });
    await prisma.inspectionClientAccess.create({
      data: {
        inspectionPlanId: plan.id,
        clientUserId: clientUser.id,
        canView: true,
        canSign: true,
        invitedBy: staffA.id,
        acceptedAt: new Date(),
      },
    });

    // Magic-link voor de registratie-flow (nieuwe klant, gekoppeld aan dit plan).
    await prisma.clientMagicLink.create({
      data: {
        email: newClientEmail,
        token: magicToken,
        inspectionPlanId: plan.id,
        expiresAt: new Date(Date.now() + 3600_000),
        createdBy: staffA.id,
      },
    });

    // Staf-realm token (org A). Login op de "unknown host" (127.0.0.1) zoals de
    // overige staf-suites; nodig voor de realm-kruising-tests verderop.
    const staffLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-staff-a@test.nl', password: 'TestPass123!' });
    staffTokenA = staffLogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      const orgIds = [orgAId, orgBId];
      await prisma.documentSignature.deleteMany({ where: { generatedDocument: { orgId: { in: orgIds } } } });
      await prisma.generatedDocument.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.findingResolutionPhoto.deleteMany({ where: { resolution: { finding: { orgId: { in: orgIds } } } } });
      await prisma.findingResolution.deleteMany({ where: { finding: { orgId: { in: orgIds } } } });
      await prisma.inspectionMessage.deleteMany({ where: { inspectionPlan: { orgId: { in: orgIds } } } });
      await prisma.inspectionClientAccess.deleteMany({ where: { inspectionPlan: { orgId: { in: orgIds } } } });
      await prisma.clientMagicLink.deleteMany({ where: { email: { in: [clientEmail, newClientEmail] } } });
      await prisma.clientRequest.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.clientAccess.deleteMany({ where: { contact: { orgId: { in: orgIds } } } });
      await prisma.clientUser.deleteMany({ where: { email: { in: [clientEmail, newClientEmail] } } });
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      // parentId is SET NULL → één deleteMany ruimt de hele boom (wortel + assets) op.
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionTemplate.deleteMany({ where: { id: itId } });
      await prisma.classificationModel.deleteMany({ where: { id: cmId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: normCode } });
      await prisma.location.deleteMany({ where: { id: crmLocationId } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.refreshToken.deleteMany({ where: { user: { orgId: { in: orgIds } } } });
      await prisma.user.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await app.close();
    }
  });

  // Host-header → TenantMiddleware leidt de org af uit het subdomein.
  const onA = (path: string) => request(app.getHttpServer()).get(path).set('Host', HOST_A);
  const postA = (path: string) => request(app.getHttpServer()).post(path).set('Host', HOST_A);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ── Auth ──
  it('logt de klant in op het org-A-subdomein', async () => {
    const res = await postA('/api/v1/client/auth/login')
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(res.body.data.user.email).toBe(clientEmail);
    tokenA = res.body.data.accessToken;
  });

  it('weigert login zonder org-subdomein (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/client/auth/login')
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(400);
  });

  it('CROSS-TENANT: weigert login op org B (klant heeft daar geen toegang) (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/client/auth/login')
      .set('Host', HOST_B)
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(403);
  });

  it('GET /client/auth/me toont alleen de toegang binnen org A', async () => {
    const res = await onA('/api/v1/client/auth/me').set(bearer(tokenA)).expect(200);
    expect(res.body.data.email).toBe(clientEmail);
    expect(res.body.data.access).toHaveLength(1);
    expect(res.body.data.access[0].contact.id).toBe(contactAId);
  });

  it('weigert /me zonder token (401)', async () => {
    await onA('/api/v1/client/auth/me').expect(401);
  });

  // ── Inspecties ──
  it('lijst toont alleen inspecties van deze klant binnen org A', async () => {
    const res = await onA('/api/v1/client/inspections').set(bearer(tokenA)).expect(200);
    const ids = res.body.data.map((p: { id: string }) => p.id);
    expect(ids).toContain(planId);
  });

  it('detail geeft het plan met finding-counts', async () => {
    const res = await onA(`/api/v1/client/inspections/${planId}`).set(bearer(tokenA)).expect(200);
    expect(res.body.data.id).toBe(planId);
    expect(res.body.data.findingCounts.total).toBe(1);
    expect(res.body.data.findingCounts.open).toBe(1);
  });

  it('dashboard telt de openstaande constatering', async () => {
    const res = await onA('/api/v1/client/inspections/dashboard').set(bearer(tokenA)).expect(200);
    expect(res.body.data.totalInspections).toBeGreaterThanOrEqual(1);
    expect(res.body.data.openFindingsCount).toBeGreaterThanOrEqual(1);
  });

  it('CROSS-TENANT: lijst op org B is leeg', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/client/inspections')
      .set('Host', HOST_B)
      .set(bearer(tokenA))
      .expect(200);
    expect(res.body.data).toEqual([]);
  });

  it('CROSS-TENANT: detail van org-A-plan op org B → 403', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/client/inspections/${planId}`)
      .set('Host', HOST_B)
      .set(bearer(tokenA))
      .expect(403);
  });

  // ── Constateringen ──
  it('toont een constatering en lost deze op', async () => {
    const list = await onA(`/api/v1/client/inspections/${planId}/findings`).set(bearer(tokenA)).expect(200);
    expect(list.body.data.map((f: { id: string }) => f.id)).toContain(findingId);

    const detail = await onA(`/api/v1/client/findings/${findingId}`).set(bearer(tokenA)).expect(200);
    expect(detail.body.data.id).toBe(findingId);

    const resolve = await postA(`/api/v1/client/findings/${findingId}/resolve`)
      .set(bearer(tokenA))
      .send({ description: 'Afdekking teruggeplaatst' })
      .expect(201);
    expect(resolve.body.data.statusCode).toBe('PENDING_VERIFICATION');
  });

  it('weigert een tweede openstaande resolutie (400)', async () => {
    await postA(`/api/v1/client/findings/${findingId}/resolve`)
      .set(bearer(tokenA))
      .send({ description: 'Nogmaals' })
      .expect(400);
  });

  it('CROSS-TENANT: constatering-detail op org B → 404 (niet zichtbaar)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/client/findings/${findingId}`)
      .set('Host', HOST_B)
      .set(bearer(tokenA))
      .expect(404);
  });

  // ── Documenten + ondertekening ──
  it('toont een document en ondertekent het', async () => {
    const detail = await onA(`/api/v1/client/documents/${documentId}`).set(bearer(tokenA)).expect(200);
    expect(detail.body.data.htmlContent).toContain('E2E-CP-0001');

    const sign = await postA(`/api/v1/client/documents/${documentId}/sign`)
      .set(bearer(tokenA))
      .send({ signatureImage: 'data:image/png;base64,iVBORw0KGgo=' })
      .expect(201);
    expect(sign.body.data.status).toBe('SIGNED');
    expect(sign.body.data.documentFullySigned).toBe(true);

    const doc = await prisma.generatedDocument.findUnique({ where: { id: documentId } });
    expect(doc?.status).toBe('SIGNED');
  });

  it('weigert nogmaals ondertekenen (400)', async () => {
    await postA(`/api/v1/client/documents/${documentId}/sign`)
      .set(bearer(tokenA))
      .send({ signatureImage: 'data:image/png;base64,iVBORw0KGgo=' })
      .expect(400);
  });

  // ── Berichten ──
  it('plaatst en leest berichten op een inspectie', async () => {
    const send = await postA(`/api/v1/client/inspections/${planId}/messages`)
      .set(bearer(tokenA))
      .send({ content: 'Wanneer wordt de herinspectie ingepland?' })
      .expect(201);
    expect(send.body.data.content).toContain('herinspectie');

    const list = await onA(`/api/v1/client/inspections/${planId}/messages`).set(bearer(tokenA)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].clientUser.id).toBe(clientUserId);
  });

  // ── Verzoeken ──
  it('dient een herinspectie- en een nieuwe-opdracht-verzoek in', async () => {
    const reinspection = await postA('/api/v1/client/requests/reinspection')
      .set(bearer(tokenA))
      .send({ inspectionPlanId: planId, description: 'Graag opnieuw inspecteren' })
      .expect(201);
    expect(reinspection.body.data.requestTypeCode).toBe('REINSPECTION');
    expect(reinspection.body.data.relatedInspectionPlan.id).toBe(planId);

    const newAssignment = await postA('/api/v1/client/requests/new-assignment')
      .set(bearer(tokenA))
      .send({ contactId: contactAId, subject: 'Nieuwe locatie', description: 'Inspectie nieuwe vestiging' })
      .expect(201);
    expect(newAssignment.body.data.requestTypeCode).toBe('NEW_ASSIGNMENT');

    const list = await onA('/api/v1/client/requests').set(bearer(tokenA)).expect(200);
    expect(list.body.data.length).toBe(2);
  });

  it('CROSS-TENANT: weigert nieuwe-opdracht voor een contact buiten org B (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/client/requests/new-assignment')
      .set('Host', HOST_B)
      .set(bearer(tokenA))
      .send({ contactId: contactAId, subject: 'X', description: 'Y' })
      .expect(403);
  });

  // ── Magic-link registratie (grant ClientAccess + InspectionClientAccess) ──
  it('valideert de magic-link en registreert een nieuwe klant met auto-grant', async () => {
    const validate = await postA('/api/v1/client/auth/magic-link')
      .send({ token: magicToken })
      .expect(201);
    expect(validate.body.data.requiresRegistration).toBe(true);
    expect(validate.body.data.email).toBe(newClientEmail);

    const register = await postA('/api/v1/client/auth/register')
      .send({
        magicLinkToken: magicToken,
        email: newClientEmail,
        password: CLIENT_PW,
        firstName: 'Nieuwe',
        lastName: 'Klant',
      })
      .expect(201);
    const newToken = register.body.data.accessToken;
    expect(newToken).toBeDefined();

    // De nieuwe klant ziet dankzij de auto-grant direct de gekoppelde inspectie.
    const list = await onA('/api/v1/client/inspections').set(bearer(newToken)).expect(200);
    expect(list.body.data.map((p: { id: string }) => p.id)).toContain(planId);
  });

  it('refresh-rotatie geeft een nieuw tokenpaar', async () => {
    const login = await postA('/api/v1/client/auth/login')
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(201);
    const res = await postA('/api/v1/client/auth/refresh')
      .send({ refreshToken: login.body.data.refreshToken })
      .expect(201);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
  });

  // ── B4: realm-kruising ──
  // De twee auth-realms zijn volledig gescheiden: aparte passport-strategieën
  // en aparte JWT-secrets (JWT_SECRET vs CLIENT_JWT_SECRET). Een token uit het
  // ene realm is in het andere ongeldig → 401 (geen 403; auth faalt al vóór
  // enige autorisatie- of tenant-check).
  describe('REALM-CROSSING (B4)', () => {
    it('weigert een client-token op een staf-endpoint (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/inspection-plans')
        .set('Host', HOST_A)
        .set(bearer(tokenA))
        .expect(401);
    });

    it('weigert een staf-token op een client-endpoint (401)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/client/inspections')
        .set('Host', HOST_A)
        .set(bearer(staffTokenA))
        .expect(401);
    });
  });
});
