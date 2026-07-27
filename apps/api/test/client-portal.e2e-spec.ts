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
  // WP-B9 (B-412/B-406a): plan in pending_review — inhoud niet klant-zichtbaar.
  let gatedPlanId: string;
  let gatedFindingId: string;
  let gatedDocumentId: string;

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

    // ── WP-B9 (B-412/B-406a): tweede plan in pending_review, zelfde contact ──
    // Inhoud (finding + document) mag NIET klant-zichtbaar zijn zolang de org
    // vier-ogen-review aan heeft staan. Bewust GEEN InspectionClientAccess-rij:
    // toegang loopt via het contact (metadata zichtbaar), zonder canSign-grant.
    const gatedPlan = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        locationId: crmLocation.id,
        projectName: 'E2E Gated inspectie',
        referenceNumber: 'E2E-CP-0002',
        normTypeCode: normCode,
        inspectionTypeCode: 'initial',
        statusCode: 'pending_review',
        inspectionTemplateId: it.id,
        addressStreet: 'Reviewstraat',
        addressHouseNumber: '9',
        addressCity: 'Utrecht',
        createdBy: staffA.id,
      },
    });
    gatedPlanId = gatedPlan.id;
    const gatedFinding = await prisma.finding.create({
      data: {
        orgId: orgA.id,
        assetNodeId: asset.id,
        inspectionPlanId: gatedPlan.id,
        inspectionType: 'visual',
        shortDescription: 'Nog niet gereviewde constatering',
        statusCode: 'open',
        createdBy: staffA.id,
      },
    });
    gatedFindingId = gatedFinding.id;
    const gatedDoc = await prisma.generatedDocument.create({
      data: {
        orgId: orgA.id,
        documentTemplateId: docTemplate.id,
        inspectionPlanId: gatedPlan.id,
        documentType: 'PLAN',
        htmlContent: '<html><body><p>E2E-CP-0002 conceptrapport</p></body></html>',
        status: 'PENDING_SIGNATURES',
        generatedBy: staffA.id,
      },
    });
    gatedDocumentId = gatedDoc.id;
    await prisma.documentSignature.create({
      data: {
        generatedDocumentId: gatedDoc.id,
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
    expect(res.body.data.user.email).toBe(clientEmail);
    // H2/H3: het refresh-token zit NIET in de body maar in een httpOnly-cookie.
    expect(res.body.data.refreshToken).toBeUndefined();
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const refreshCookie = setCookie.find((c) => c.startsWith('client_refresh_token='));
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie).toMatch(/HttpOnly/i);
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
  it('B-404: weigert een niet-afbeelding als handtekening met een NL-melding (400)', async () => {
    // Vóór WP-C2 accepteerde de klantportaal-route élke string ("javascript:…",
    // 7 MB base64) en ging het document zelfs naar SIGNED.
    const res = await postA(`/api/v1/client/documents/${documentId}/sign`)
      .set(bearer(tokenA))
      .send({ signatureImage: 'javascript:alert(1)' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('data-afbeelding');

    // Ook een te grote (>5 MB gedecodeerd) payload wordt geweigerd.
    await postA(`/api/v1/client/documents/${documentId}/sign`)
      .set(bearer(tokenA))
      .send({ signatureImage: `data:image/png;base64,${'A'.repeat(7_000_000)}` })
      .expect(400);

    // Niets opgeslagen: de handtekening staat nog op PENDING.
    const sig = await prisma.documentSignature.findFirst({
      where: { generatedDocumentId: documentId, signerRoleCode: 'CLIENT' },
    });
    expect(sig?.status).toBe('PENDING');
  });

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
      // Payload voldoet aan de B-407-lengtegrenzen zodat dit de 403 (en niet
      // een validatie-400) blijft testen.
      .send({ contactId: contactAId, subject: 'Nieuwe locatie', description: 'Inspectie nieuwe vestiging' })
      .expect(403);
  });

  // ── B-407 (WP-C2): lengtegrenzen op klantportaal-invoer ──
  it('B-407: weigert een omschrijving van 4001 tekens met een NL-melding (400)', async () => {
    const tooLong = 'A'.repeat(4001);

    const resolve = await postA(`/api/v1/client/findings/${findingId}/resolve`)
      .set(bearer(tokenA))
      .send({ description: tooLong })
      .expect(400);
    expect(JSON.stringify(resolve.body)).toContain('maximaal 4000 tekens');

    const reinspection = await postA('/api/v1/client/requests/reinspection')
      .set(bearer(tokenA))
      .send({ inspectionPlanId: planId, description: tooLong })
      .expect(400);
    expect(JSON.stringify(reinspection.body)).toContain('maximaal 4000 tekens');
  });

  it('B-407: weigert een te korte verzoek-omschrijving (backend spiegelt de UI-regel van 10 tekens)', async () => {
    const res = await postA('/api/v1/client/requests/reinspection')
      .set(bearer(tokenA))
      .send({ inspectionPlanId: planId, description: 'x' })
      .expect(400);
    expect(JSON.stringify(res.body)).toContain('minimaal 10 tekens');

    await postA('/api/v1/client/requests/new-assignment')
      .set(bearer(tokenA))
      .send({ contactId: contactAId, subject: 'Nieuwe locatie', description: 'kort' })
      .expect(400);
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

  // ── B-405 (WP-C2): eenmalige magic-link is ook onder gelijktijdigheid eenmalig ──
  it('B-405: gelijktijdige verzilvering van één magic-link levert precies één sessie (TOCTOU-race)', async () => {
    // Verse login-link voor de bestaande klant (clientUserId gezet → login-flow).
    const raceToken = 'e2e-magic-token-race-flow';
    await prisma.clientMagicLink.create({
      data: {
        email: clientEmail,
        clientUserId,
        token: raceToken,
        expiresAt: new Date(Date.now() + 3600_000),
        createdBy: staffAId,
      },
    });
    try {
      // Drie ECHT gelijktijdige verzilveringen (StrictMode-dubbelvuur/aanvaller).
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          postA('/api/v1/client/auth/magic-link').send({ token: raceToken }),
        ),
      );

      const winners = results.filter((r) => r.status === 201);
      const losers = results.filter((r) => r.status === 400);
      // Vóór WP-C2: drie keer 201 (drie geldige sessies op één eenmalige link).
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(2);
      expect(winners[0].body.data.accessToken).toBeDefined();
      for (const loser of losers) {
        expect(loser.body.message).toBe('Magic link ongeldig of verlopen');
      }

      // En sequentieel hergebruik blijft uiteraard ook geweigerd.
      await postA('/api/v1/client/auth/magic-link').send({ token: raceToken }).expect(400);

      const link = await prisma.clientMagicLink.findUnique({ where: { token: raceToken } });
      expect(link?.usedAt).not.toBeNull();
    } finally {
      await prisma.clientMagicLink.deleteMany({ where: { token: raceToken } });
    }
  });

  // Haal de refresh-cookie-waarde uit een Set-Cookie-header (voor hergebruik als Cookie).
  const extractRefreshCookie = (res: request.Response): string => {
    const setCookie = res.headers['set-cookie'] as unknown as string[];
    const header = setCookie.find((c) => c.startsWith('client_refresh_token='));
    return header!.split(';')[0]; // "client_refresh_token=<raw>"
  };

  it('refresh-rotatie (stateful, via cookie) geeft een nieuw tokenpaar en roteert de cookie', async () => {
    const login = await postA('/api/v1/client/auth/login')
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(201);
    const cookie1 = extractRefreshCookie(login);

    const res = await postA('/api/v1/client/auth/refresh').set('Cookie', cookie1).expect(200);
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeUndefined(); // nooit in de body
    const cookie2 = extractRefreshCookie(res);
    expect(cookie2).not.toBe(cookie1); // rotatie: nieuwe waarde

    // Rotatie: het oude (verbruikte) refresh-token is niet meer bruikbaar.
    await postA('/api/v1/client/auth/refresh').set('Cookie', cookie1).expect(401);
    // Het nieuwe token werkt wél.
    await postA('/api/v1/client/auth/refresh').set('Cookie', cookie2).expect(200);
  });

  it('weigert refresh zonder cookie', async () => {
    const res = await postA('/api/v1/client/auth/refresh').expect(200);
    expect(res.body.success).toBe(false);
  });

  it('logout trekt het refresh-token in (revoke) en wist de cookie', async () => {
    const login = await postA('/api/v1/client/auth/login')
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(201);
    const cookie = extractRefreshCookie(login);

    const logout = await postA('/api/v1/client/auth/logout').set('Cookie', cookie).expect(200);
    expect(logout.body.success).toBe(true);
    const cleared = logout.headers['set-cookie'] as unknown as string[];
    expect(cleared.some((c) => c.startsWith('client_refresh_token=;'))).toBe(true);

    // Na logout is het ingetrokken token niet meer inwisselbaar.
    await postA('/api/v1/client/auth/refresh').set('Cookie', cookie).expect(401);
  });

  // ── WP-B9: review-gate op klant-zichtbaarheid + canSign-vlag ──
  // B-412: metadata van een pending_review-plan blijft zichtbaar, maar
  // constateringen/documenten pas vanaf reviewed/approved/completed — tenzij de
  // org de vier-ogen-review (inspectionReviewEnabled) uit heeft staan.
  // B-406a: de API stuurt per document het per-plan teken-recht (canSign) mee.
  describe('REVIEW-GATE + canSign (WP-B9: B-412/B-406a)', () => {
    it('B-412: lijst blijft het pending_review-plan tonen (metadata altijd zichtbaar)', async () => {
      const res = await onA('/api/v1/client/inspections').set(bearer(tokenA)).expect(200);
      const gated = res.body.data.find((p: { id: string }) => p.id === gatedPlanId);
      expect(gated).toBeDefined();
      expect(gated.statusCode).toBe('pending_review');
      expect(gated.projectName).toBe('E2E Gated inspectie');
    });

    it('B-412: detail verbergt inhoud van een pending_review-plan (contentReleased=false)', async () => {
      const res = await onA(`/api/v1/client/inspections/${gatedPlanId}`)
        .set(bearer(tokenA))
        .expect(200);
      expect(res.body.data.contentReleased).toBe(false);
      // Metadata blijft staan…
      expect(res.body.data.projectName).toBe('E2E Gated inspectie');
      expect(res.body.data.statusCode).toBe('pending_review');
      // …maar inhoud niet.
      expect(res.body.data.assets).toEqual([]);
      expect(res.body.data.generatedDocuments).toEqual([]);
      expect(res.body.data.findingCounts).toEqual({ total: 0, open: 0, resolved: 0 });
    });

    it('B-412: findings- en documents-routes geven [] voor een pending_review-plan', async () => {
      const findings = await onA(`/api/v1/client/inspections/${gatedPlanId}/findings`)
        .set(bearer(tokenA))
        .expect(200);
      expect(findings.body.data).toEqual([]);

      const documents = await onA(`/api/v1/client/inspections/${gatedPlanId}/documents`)
        .set(bearer(tokenA))
        .expect(200);
      expect(documents.body.data).toEqual([]);
    });

    it('B-412: document-detail/-download van een niet-vrijgegeven rapport → 404', async () => {
      await onA(`/api/v1/client/documents/${gatedDocumentId}`).set(bearer(tokenA)).expect(404);
      await onA(`/api/v1/client/documents/${gatedDocumentId}/download`)
        .set(bearer(tokenA))
        .expect(404);
    });

    it('B-412: finding-detail van een niet-vrijgegeven rapport → 404', async () => {
      await onA(`/api/v1/client/findings/${gatedFindingId}`).set(bearer(tokenA)).expect(404);
    });

    it('B-412/B-406a: dashboard telt alleen vrijgegeven inhoud en filtert actie-items op canSign', async () => {
      const res = await onA('/api/v1/client/inspections/dashboard').set(bearer(tokenA)).expect(200);
      // Alleen de open finding van het vrijgegeven (completed) plan telt mee;
      // de open finding van het pending_review-plan niet.
      expect(res.body.data.openFindingsCount).toBe(1);
      // De PENDING-handtekening van het gated plan (zonder canSign-grant)
      // verschijnt niet als actie-item.
      expect(res.body.data.pendingSignatures).toEqual([]);
      // Metadata: beide plannen tellen mee in het totaal.
      expect(res.body.data.totalInspections).toBe(2);
    });

    it('B-406a: dashboard toont het actie-item wél voor een vrijgegeven plan mét canSign', async () => {
      // Extra document + open CLIENT-handtekening op het vrijgegeven hoofdplan
      // (daar heeft de klant een canSign-grant).
      const doc2 = await prisma.generatedDocument.create({
        data: {
          orgId: orgAId,
          documentTemplateId: docTemplateId,
          inspectionPlanId: planId,
          documentType: 'PLAN',
          htmlContent: '<html><body><p>Tweede document</p></body></html>',
          status: 'PENDING_SIGNATURES',
          generatedBy: staffAId,
        },
      });
      await prisma.documentSignature.create({
        data: {
          generatedDocumentId: doc2.id,
          signerRoleCode: 'CLIENT',
          signerName: 'Opdrachtgever',
          status: 'PENDING',
        },
      });

      const res = await onA('/api/v1/client/inspections/dashboard').set(bearer(tokenA)).expect(200);
      expect(
        res.body.data.pendingSignatures.map((s: { documentId: string }) => s.documentId),
      ).toContain(doc2.id);

      // Opruimen zodat latere assertions niet verschuiven.
      await prisma.documentSignature.deleteMany({ where: { generatedDocumentId: doc2.id } });
      await prisma.generatedDocument.delete({ where: { id: doc2.id } });
    });

    it('B-406a: documenten van het vrijgegeven plan dragen canSign=true', async () => {
      const list = await onA(`/api/v1/client/inspections/${planId}/documents`)
        .set(bearer(tokenA))
        .expect(200);
      expect(list.body.data.length).toBeGreaterThanOrEqual(1);
      for (const doc of list.body.data) expect(doc.canSign).toBe(true);

      const detail = await onA(`/api/v1/client/documents/${documentId}`)
        .set(bearer(tokenA))
        .expect(200);
      expect(detail.body.data.canSign).toBe(true);
    });

    it('B-412: org met review UIT ziet alles ongewijzigd; canSign blijft eerlijk false', async () => {
      await prisma.organization.update({
        where: { id: orgAId },
        data: { inspectionReviewEnabled: false },
      });
      try {
        const detail = await onA(`/api/v1/client/inspections/${gatedPlanId}`)
          .set(bearer(tokenA))
          .expect(200);
        expect(detail.body.data.contentReleased).toBe(true);
        expect(detail.body.data.findingCounts.total).toBe(1);
        expect(detail.body.data.generatedDocuments).toHaveLength(1);

        const findings = await onA(`/api/v1/client/inspections/${gatedPlanId}/findings`)
          .set(bearer(tokenA))
          .expect(200);
        expect(findings.body.data.map((f: { id: string }) => f.id)).toContain(gatedFindingId);

        // Documenten zichtbaar, maar zonder per-plan grant blijft canSign=false…
        const documents = await onA(`/api/v1/client/inspections/${gatedPlanId}/documents`)
          .set(bearer(tokenA))
          .expect(200);
        expect(documents.body.data).toHaveLength(1);
        expect(documents.body.data[0].canSign).toBe(false);

        const docDetail = await onA(`/api/v1/client/documents/${gatedDocumentId}`)
          .set(bearer(tokenA))
          .expect(200);
        expect(docDetail.body.data.canSign).toBe(false);

        // …en de autorisatie zelf is onveranderd: tekenen zonder grant → 403.
        await postA(`/api/v1/client/documents/${gatedDocumentId}/sign`)
          .set(bearer(tokenA))
          .send({ signatureImage: 'data:image/png;base64,iVBORw0KGgo=' })
          .expect(403);

        // Beide open findings tellen nu mee.
        const dashboard = await onA('/api/v1/client/inspections/dashboard')
          .set(bearer(tokenA))
          .expect(200);
        expect(dashboard.body.data.openFindingsCount).toBe(2);
      } finally {
        await prisma.organization.update({
          where: { id: orgAId },
          data: { inspectionReviewEnabled: true },
        });
      }
    });
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
