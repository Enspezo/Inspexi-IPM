import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import { FEATURE_KEYS } from '@inspexi/entitlements';

// Online herstel van constateringen (PRD-14, fase 6). Dekt de anonieme lookup
// (rapportnummer + postcode, anti-enumeratie besluit 11), de volledige flow
// claim → foto → complete → sign, het 409-conflictpad (first-wins, besluit 3),
// cross-tenant-isolatie via het sessietoken en de CLIENT_USER-instap.
//
// Sessies voor de flow-tests worden direct in de DB aangemaakt (de guard leest
// alleen de rij); echte lookup-HTTP-calls zijn gereserveerd voor de
// lookup-specifieke tests. Ondertekenen rendert een echte PDF via Puppeteer →
// ruime timeout, en bewust maar ÉÉN sign in de hele suite.
jest.setTimeout(120000);

// BASE_DOMAIN=localhost in de testomgeving → org-subdomein is "<slug>.localhost".
const HOST_A = 'e2erepaira.localhost'; // volledige feature-set (incl. ONLINE_HERSTEL)
const HOST_B = 'e2erepairb.localhost'; // volledige feature-set — cross-tenant-doelwit
const HOST_C = 'e2erepairc.localhost'; // basis-plan ZONDER ONLINE_HERSTEL ("feature uit")

// Exacte NL-meldingen (PRD-14; bron: common/constants/online-repair.constants.ts).
// Bewust hardcoded: wijzigt de melding, dan hoort deze test te breken.
const GENERIC_ERROR =
  'Deze combinatie is niet gevonden of online herstel is niet beschikbaar voor deze inspectie';
const EXPIRED_ERROR =
  'Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode.';
const CONFLICT_ERROR =
  'Deze constatering is zojuist al door een andere partij hersteld gemeld. Uw invoer is bewaard en de projectmanager is geïnformeerd.';

// Geldige 1×1 PNG (sharp-parseable) — voor de foto-upload én de handtekening.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_DATA_URL = `data:image/png;base64,${PNG_1X1.toString('base64')}`;

const CLIENT_EMAIL = 'e2e-repair-client@test.nl';
const CLIENT_PW = 'ClientPass123!';

const makeSessionToken = () => randomBytes(48).toString('hex');

describe('Client Repair — online herstel (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // SaaS-plannen (templates)
  let fullPlanId: string;
  let basisPlanId: string;

  // orgs
  let orgAId: string;
  let orgBId: string;
  let orgCId: string;
  let staffAId: string;

  // inspectie-fundament org A
  let cmId: string;
  const NORM_CODE = 'e2erepairnorm';
  let planA1Id: string; // vlag AAN — hoofdplan van de flow
  let planA2Id: string; // vlag UIT
  let findingF1Id: string; // SEVERITY C3 (niet-kritiek)
  let findingF2Id: string; // SEVERITY C1 (kritiek)
  let findingF3Id: string; // ongeclassificeerd

  // org B (cross-tenant-doelwit)
  let findingBId: string;
  let photoBId: string;

  // sessies (via DB-fixture)
  let tokenS1: string; // winnaar van de race
  let tokenS2: string; // verliezer (conflict) + cross-tenant-probe
  let tokenExpired: string;
  let sessionS1Id: string;
  let sessionS2Id: string;

  // tijdens de run vastgelegd
  let resolutionF1Id: string;
  let resolutionF2Id: string;
  let uploadedPhotoId: string;
  let declarationDocumentId: string;
  let clientToken: string;

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

    // ── SaaS-plannen: A+B volledig (incl. ONLINE_HERSTEL), C alleen basis ──
    const fullPlan = await prisma.plan.create({
      data: {
        name: 'E2E Repair Volledig',
        slug: 'e2erepairfull',
        features: { create: FEATURE_KEYS.map((featureKey) => ({ featureKey })) },
      },
    });
    fullPlanId = fullPlan.id;
    const basisPlan = await prisma.plan.create({
      data: {
        name: 'E2E Repair Basis',
        slug: 'e2erepairbasis',
        features: {
          create: [
            { featureKey: 'BASIS_CRM' },
            { featureKey: 'BASIS_UITVOERING' },
            { featureKey: 'BASIS_INSPECTIES' },
            { featureKey: 'BASIS_WORKFLOW' },
          ],
        },
      },
    });
    basisPlanId = basisPlan.id;

    const orgA = await prisma.organization.create({
      data: { name: 'E2E Repair A', slug: 'e2erepaira', planId: fullPlan.id },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: { name: 'E2E Repair B', slug: 'e2erepairb', planId: fullPlan.id },
    });
    orgBId = orgB.id;
    const orgC = await prisma.organization.create({
      data: { name: 'E2E Repair C', slug: 'e2erepairc', planId: basisPlan.id },
    });
    orgCId = orgC.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const staffA = await prisma.user.create({
      data: {
        email: 'e2e-repair-staff@test.nl',
        passwordHash,
        firstName: 'Staf',
        lastName: 'Repair',
        roles: ['ORG_ADMIN'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    staffAId = staffA.id;

    // ── Classificatiemodel met een kritieke optie (PRD-14 besluit 8) ──
    const cm = await prisma.classificationModel.create({
      data: {
        code: 'E2EREPAIRCM',
        name: 'E2E Repair Classificatiemodel',
        createdBy: staffA.id,
        characteristics: {
          create: [
            {
              code: 'SEVERITY',
              name: 'Ernst',
              options: {
                create: [
                  { code: 'C1', name: 'Direct gevaar', color: '#dc2626', isCritical: true },
                  { code: 'C3', name: 'Aanbeveling', color: '#ca8a04', isCritical: false },
                ],
              },
            },
          ],
        },
      },
    });
    cmId = cm.id;
    await prisma.normTypeDefinition.create({
      data: { code: NORM_CODE, label: 'E2E Repair Norm', createdBy: staffA.id, assetTypes: [] },
    });
    const template = await prisma.inspectionTemplate.create({
      data: {
        orgId: orgA.id,
        code: 'E2EREPAIR',
        name: 'E2E Repair Template',
        normTypeCode: NORM_CODE,
        classificationModelId: cm.id,
        createdBy: staffA.id,
      },
    });

    // ── Org A: contact + locatie + plannen ──
    const contactA = await prisma.contact.create({
      data: { orgId: orgA.id, type: 'COMPANY', companyName: 'E2E Repair Opdrachtgever BV' },
    });
    const locationA = await prisma.location.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        name: 'E2E Repair Locatie',
        street: 'Herstelstraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Herstelstad',
      },
    });

    const planA1 = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        locationId: locationA.id,
        inspectionTemplateId: template.id,
        projectName: 'E2E Repair inspectie',
        referenceNumber: 'E2E-Herstel-001',
        normTypeCode: NORM_CODE,
        statusCode: 'completed',
        onlineRepairEnabled: true,
        addressStreet: 'Herstelstraat',
        addressHouseNumber: '1',
        addressPostalCode: '1234 AB',
        addressCity: 'Herstelstad',
        createdBy: staffA.id,
      },
    });
    planA1Id = planA1.id;

    // Tweede plan: rapportnummer + postcode kloppen, maar de plan-vlag staat UIT.
    const planA2 = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        projectName: 'E2E Repair vlag-uit',
        referenceNumber: 'E2E-Herstel-002',
        normTypeCode: NORM_CODE,
        onlineRepairEnabled: false,
        addressPostalCode: '1234 AB',
        createdBy: staffA.id,
      },
    });
    planA2Id = planA2.id;

    // ── AssetNode-boom org A (parent vóór child — DB-triggers vullen path/depth) ──
    const rootA = await prisma.assetNode.create({
      data: {
        orgId: orgA.id,
        nodeType: 'LOCATION',
        rootLocationId: locationA.id,
        typeCode: 'locatie',
        name: 'Wortel',
        createdBy: staffA.id,
      },
    });
    const assetA = await prisma.assetNode.create({
      data: {
        orgId: orgA.id,
        nodeType: 'ASSET',
        parentId: rootA.id,
        typeCode: 'kast',
        name: 'Verdeelkast',
        createdBy: staffA.id,
      },
    });

    // ── Constateringen: deterministische volgorde via expliciete createdAt ──
    const base = Date.now();
    const f1 = await prisma.finding.create({
      data: {
        orgId: orgA.id,
        assetNodeId: assetA.id,
        inspectionPlanId: planA1.id,
        inspectionType: 'visual',
        shortDescription: 'Ontbrekende afdekking',
        classificationValues: { SEVERITY: 'C3' },
        statusCode: 'open',
        createdAt: new Date(base - 180_000),
        createdBy: staffA.id,
      },
    });
    findingF1Id = f1.id;
    const f2 = await prisma.finding.create({
      data: {
        orgId: orgA.id,
        assetNodeId: assetA.id,
        inspectionPlanId: planA1.id,
        inspectionType: 'visual',
        shortDescription: 'Blootliggende bedrading',
        classificationValues: { SEVERITY: 'C1' },
        isCritical: true,
        statusCode: 'open',
        createdAt: new Date(base - 120_000),
        createdBy: staffA.id,
      },
    });
    findingF2Id = f2.id;
    const f3 = await prisma.finding.create({
      data: {
        orgId: orgA.id,
        assetNodeId: assetA.id,
        inspectionPlanId: planA1.id,
        inspectionType: 'visual',
        shortDescription: 'Labeling ontbreekt',
        statusCode: 'open',
        createdAt: new Date(base - 60_000),
        createdBy: staffA.id,
      },
    });
    findingF3Id = f3.id;

    // ── Herstelsessies via DB-fixture (de guard leest alleen de rij) ──
    tokenS1 = makeSessionToken();
    tokenS2 = makeSessionToken();
    tokenExpired = makeSessionToken();
    const in72h = new Date(Date.now() + 72 * 3600_000);
    const s1 = await prisma.repairSession.create({
      data: {
        orgId: orgA.id,
        inspectionPlanId: planA1.id,
        accessType: 'ANONYMOUS',
        token: tokenS1,
        expiresAt: in72h,
      },
    });
    sessionS1Id = s1.id;
    const s2 = await prisma.repairSession.create({
      data: {
        orgId: orgA.id,
        inspectionPlanId: planA1.id,
        accessType: 'ANONYMOUS',
        token: tokenS2,
        expiresAt: in72h,
      },
    });
    sessionS2Id = s2.id;
    await prisma.repairSession.create({
      data: {
        orgId: orgA.id,
        inspectionPlanId: planA1.id,
        accessType: 'ANONYMOUS',
        token: tokenExpired,
        expiresAt: new Date(Date.now() - 3600_000), // verlopen
      },
    });

    // ── Org B: eigen plan + constatering + foto (cross-tenant-doelwit) ──
    const contactB = await prisma.contact.create({
      data: { orgId: orgB.id, type: 'COMPANY', companyName: 'E2E Repair B BV' },
    });
    const locationB = await prisma.location.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        name: 'E2E Repair Locatie B',
        street: 'Bstraat',
        houseNumber: '2',
        postalCode: '2000BB',
        city: 'Bstad',
      },
    });
    const planB = await prisma.inspectionPlan.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        locationId: locationB.id,
        projectName: 'E2E Repair inspectie B',
        referenceNumber: 'E2E-Herstel-B01',
        normTypeCode: NORM_CODE,
        onlineRepairEnabled: true,
        addressPostalCode: '2000 BB',
        createdBy: staffAId,
      },
    });
    const rootB = await prisma.assetNode.create({
      data: {
        orgId: orgB.id,
        nodeType: 'LOCATION',
        rootLocationId: locationB.id,
        typeCode: 'locatie',
        name: 'Wortel B',
        createdBy: staffAId,
      },
    });
    const fB = await prisma.finding.create({
      data: {
        orgId: orgB.id,
        assetNodeId: rootB.id,
        inspectionPlanId: planB.id,
        inspectionType: 'visual',
        shortDescription: 'Org B constatering',
        statusCode: 'open',
        createdBy: staffAId,
      },
    });
    findingBId = fB.id;
    const photoB = await prisma.photo.create({
      data: {
        orgId: orgB.id,
        entityType: 'finding',
        entityId: fB.id,
        storagePath: `${orgB.id}/finding-photos/e2e-none.jpg`,
        mimeType: 'image/jpeg',
      },
    });
    photoBId = photoB.id;

    // ── Org C (basis-plan zonder ONLINE_HERSTEL): plan-vlag wél aan ──
    const contactC = await prisma.contact.create({
      data: { orgId: orgC.id, type: 'COMPANY', companyName: 'E2E Repair C BV' },
    });
    await prisma.inspectionPlan.create({
      data: {
        orgId: orgC.id,
        contactId: contactC.id,
        projectName: 'E2E Repair inspectie C',
        referenceNumber: 'E2E-Herstel-C01',
        normTypeCode: NORM_CODE,
        onlineRepairEnabled: true,
        addressPostalCode: '3000 CC',
        createdBy: staffAId,
      },
    });

    // ── Client-realm: ingelogde klant met toegang tot contact A ──
    const clientHash = await bcrypt.hash(CLIENT_PW, 10);
    const clientUser = await prisma.clientUser.create({
      data: {
        email: CLIENT_EMAIL,
        passwordHash: clientHash,
        firstName: 'Klaas',
        lastName: 'Klant',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    await prisma.clientAccess.create({
      data: { clientUserId: clientUser.id, contactId: contactA.id, role: 'SIGNER' },
    });
  });

  afterAll(async () => {
    try {
      const orgIds = [orgAId, orgBId, orgCId];
      await prisma.findingResolutionPhoto.deleteMany({
        where: { resolution: { finding: { orgId: { in: orgIds } } } },
      });
      await prisma.findingResolution.deleteMany({
        where: { finding: { orgId: { in: orgIds } } },
      });
      await prisma.repairSession.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.documentSignature.deleteMany({
        where: { generatedDocument: { orgId: { in: orgIds } } },
      });
      await prisma.generatedDocument.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.photo.deleteMany({ where: { orgId: { in: orgIds } } });
      // parentId is SET NULL → één deleteMany ruimt de hele boom op.
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionTemplate.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.classificationModel.deleteMany({ where: { id: cmId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: NORM_CODE } });
      await prisma.location.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.clientAccess.deleteMany({ where: { contact: { orgId: { in: orgIds } } } });
      await prisma.clientUser.deleteMany({ where: { email: CLIENT_EMAIL } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.refreshToken.deleteMany({ where: { user: { orgId: { in: orgIds } } } });
      await prisma.user.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.planFeature.deleteMany({
        where: { planId: { in: [fullPlanId, basisPlanId] } },
      });
      await prisma.plan.deleteMany({ where: { id: { in: [fullPlanId, basisPlanId] } } });
    } finally {
      await app.close();
    }
  });

  const server = () => app.getHttpServer();
  const postA = (path: string) => request(server()).post(path).set('Host', HOST_A);
  const getA = (path: string) => request(server()).get(path).set('Host', HOST_A);
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  // ── Anonieme lookup (PRD-14 §14.6 + besluit 11) ─────────────────────────
  describe('POST /client/repair/lookup', () => {
    it('happy path: case-insensitief rapportnummer + genormaliseerde postcode → sessie + overzicht', async () => {
      const res = await postA('/api/v1/client/repair/lookup')
        .send({ referenceNumber: '  e2e-herstel-001  ', postalCode: '1234ab' })
        .expect(201);

      expect(res.body.success).toBe(true);
      const data = res.body.data;
      // 48 bytes crypto-random → 96 hex-tekens.
      expect(data.token).toMatch(/^[0-9a-f]{96}$/);
      expect(data.expiresAt).toBeDefined();
      expect(data.session.accessType).toBe('ANONYMOUS');
      expect(data.session.status).toBe('ACTIVE');

      // Plan-samenvatting
      expect(data.plan.id).toBe(planA1Id);
      expect(data.plan.referenceNumber).toBe('E2E-Herstel-001');
      expect(data.plan.addressPostalCode).toBe('1234 AB');

      // Constateringen in deterministische volgorde met volgnummers.
      expect(data.findings).toHaveLength(3);
      expect(data.findings.map((f: { seq: number }) => f.seq)).toEqual([1, 2, 3]);
      expect(data.findings[0].id).toBe(findingF1Id);
      expect(data.findings[1].id).toBe(findingF2Id);
      expect(data.findings[1].isCritical).toBe(true);

      // Samenvatting per classificatie-groep (kritiek gemarkeerd).
      const c1 = data.summary.find((g: { code: string }) => g.code === 'C1');
      const c3 = data.summary.find((g: { code: string }) => g.code === 'C3');
      expect(c1).toMatchObject({ isCritical: true, openCount: 1 });
      expect(c3).toMatchObject({ isCritical: false, openCount: 1 });
    });

    it('onbekend rapportnummer → 404 met de generieke melding', async () => {
      const res = await postA('/api/v1/client/repair/lookup')
        .send({ referenceNumber: 'E2E-Bestaat-Niet', postalCode: '1234 AB' })
        .expect(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe(GENERIC_ERROR);
    });

    it('foute postcode → 404 met exact dezelfde generieke melding', async () => {
      const res = await postA('/api/v1/client/repair/lookup')
        .send({ referenceNumber: 'E2E-Herstel-001', postalCode: '9999 XX' })
        .expect(404);
      expect(res.body.message).toBe(GENERIC_ERROR);
    });

    it('entitlement uit (org zonder ONLINE_HERSTEL) → 404 met exact dezelfde melding', async () => {
      // Org C: plan-vlag AAN + kloppende combinatie, maar het abonnement mist de feature.
      const res = await request(server())
        .post('/api/v1/client/repair/lookup')
        .set('Host', HOST_C)
        .send({ referenceNumber: 'E2E-Herstel-C01', postalCode: '3000 CC' })
        .expect(404);
      expect(res.body.message).toBe(GENERIC_ERROR);
    });

    it('plan-vlag uit → 404 met exact dezelfde melding', async () => {
      const res = await postA('/api/v1/client/repair/lookup')
        .send({ referenceNumber: 'E2E-Herstel-002', postalCode: '1234 AB' })
        .expect(404);
      expect(res.body.message).toBe(GENERIC_ERROR);
    });
  });

  // ── B-410 (WP-C2): plan zonder inspectietemplate → geen model, wél kritiek ──
  describe('classificatie-fallback zonder inspectietemplate (B-410)', () => {
    it('valt terug op Finding.isCritical wanneer het plan geen template/classificatiemodel heeft', async () => {
      // Zelfde structurele situatie als seed-plan RAP-TEST-100: inspectionTemplateId NULL.
      const before = await prisma.inspectionPlan.findUnique({
        where: { id: planA1Id },
        select: { inspectionTemplateId: true },
      });
      await prisma.inspectionPlan.update({
        where: { id: planA1Id },
        data: { inspectionTemplateId: null },
      });
      try {
        const res = await postA('/api/v1/client/repair/lookup')
          .send({ referenceNumber: 'E2E-Herstel-001', postalCode: '1234 AB' })
          .expect(201);
        const data = res.body.data;

        // F2 (SEVERITY C1, Finding.isCritical = true): de classificatie mag
        // zonder model niet `isCritical: false` beweren — labels/kleuren
        // degraderen naar de code-defaults, de kritikaliteit volgt de finding.
        const f2 = data.findings.find((f: { id: string }) => f.id === findingF2Id);
        expect(f2.isCritical).toBe(true);
        expect(f2.classification).toMatchObject({ code: 'C1', isCritical: true });

        // F1 (SEVERITY C3, niet kritiek) blijft niet-kritiek.
        const f1 = data.findings.find((f: { id: string }) => f.id === findingF1Id);
        expect(f1.classification).toMatchObject({ code: 'C3', isCritical: false });

        // En de samenvatting markeert de C1-groep als kritiek (vóór WP-C2: false).
        const c1 = data.summary.find((g: { code: string }) => g.code === 'C1');
        const c3 = data.summary.find((g: { code: string }) => g.code === 'C3');
        expect(c1).toMatchObject({ isCritical: true });
        expect(c3).toMatchObject({ isCritical: false });
      } finally {
        await prisma.inspectionPlan.update({
          where: { id: planA1Id },
          data: { inspectionTemplateId: before?.inspectionTemplateId ?? null },
        });
      }
    });
  });

  describe('lookup-throttling (5/min per IP)', () => {
    it('geeft 429 op de 6e lookup binnen een minuut', async () => {
      // De AppThrottlerGuard slaat throttling over wanneer NODE_ENV=test (de
      // e2e-suite deelt één IP). Voor deze test zetten we de guard tijdelijk
      // "aan" door NODE_ENV te verleggen; overgeslagen requests tellen niet mee,
      // dus de teller start hier gegarandeerd op nul.
      const previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'e2e-throttle-check';
      try {
        for (let i = 1; i <= 5; i++) {
          await postA('/api/v1/client/repair/lookup')
            .send({ referenceNumber: `E2E-Throttle-${i}`, postalCode: '9999 ZZ' })
            .expect(404);
        }
        await postA('/api/v1/client/repair/lookup')
          .send({ referenceNumber: 'E2E-Throttle-6', postalCode: '9999 ZZ' })
          .expect(429);
      } finally {
        process.env.NODE_ENV = previousNodeEnv;
      }
    });
  });

  // ── Claim-flow: first-wins, conflict, foto's, complete, sign (§14.3/§14.6) ──
  describe('volledige herstel-flow', () => {
    it('S1 claimt F1 → REPORTED en de constatering gaat naar resolved', async () => {
      const res = await postA(`/api/v1/client/repair/findings/${findingF1Id}/resolve`)
        .set(bearer(tokenS1))
        .send({ description: 'Afdekking teruggeplaatst en vastgezet' })
        .expect(201);

      expect(res.body.data.resolution.statusCode).toBe('REPORTED');
      expect(res.body.data.resolution.findingId).toBe(findingF1Id);
      resolutionF1Id = res.body.data.resolution.id;

      const finding = await prisma.finding.findUnique({ where: { id: findingF1Id } });
      expect(finding?.statusCode).toBe('resolved');
      expect(finding?.resolvedAt).not.toBeNull();
    });

    it('S2 verliest de race op F1 → 409 en het concept blijft als CONFLICT bewaard', async () => {
      const res = await postA(`/api/v1/client/repair/findings/${findingF1Id}/resolve`)
        .set(bearer(tokenS2))
        .send({ description: 'Wij hebben dit ook gerepareerd' })
        .expect(409);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe(CONFLICT_ERROR);

      // First-wins (besluit 3): de verliezer-invoer is bewaard als CONFLICT-rij.
      const conflict = await prisma.findingResolution.findFirst({
        where: { findingId: findingF1Id, repairSessionId: sessionS2Id },
      });
      expect(conflict?.statusCode).toBe('CONFLICT');
      expect(conflict?.description).toBe('Wij hebben dit ook gerepareerd');

      // De REPORTED-melding van de winnaar blijft onaangetast.
      const reported = await prisma.findingResolution.findFirst({
        where: { findingId: findingF1Id, repairSessionId: sessionS1Id },
      });
      expect(reported?.statusCode).toBe('REPORTED');
    });

    it('dubbelclaim binnen dezelfde sessie → 400', async () => {
      const res = await postA(`/api/v1/client/repair/findings/${findingF1Id}/resolve`)
        .set(bearer(tokenS1))
        .send({ description: 'Nogmaals' })
        .expect(400);
      expect(res.body.message).toContain('al hersteld gemeld');
    });

    it('uploadt een bewijsfoto op de eigen melding en kan die streamen', async () => {
      const res = await postA(`/api/v1/client/repair/findings/${findingF1Id}/resolve/photos`)
        .set(bearer(tokenS1))
        .attach('photos', PNG_1X1, { filename: 'bewijs.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].url).toContain('/client/repair/photos/');
      uploadedPhotoId = res.body.data[0].id;

      const stream = await getA(`/api/v1/client/repair/photos/${uploadedPhotoId}`)
        .set(bearer(tokenS1))
        .expect(200);
      expect(stream.headers['content-type']).toContain('image/png');
    });

    it('sessie-overzicht (S2): herstel-info zichtbaar zonder herstellergegevens; eigen conflict wel', async () => {
      const res = await getA('/api/v1/client/repair/session').set(bearer(tokenS2)).expect(200);

      const f1 = res.body.data.findings.find((f: { id: string }) => f.id === findingF1Id);
      expect(f1.statusCode).toBe('resolved');
      // Besluit 4: wél de werkzaamheden + foto's, nooit wie het was.
      expect(f1.repair).not.toBeNull();
      expect(f1.repair.description).toBe('Afdekking teruggeplaatst en vastgezet');
      expect(f1.repair.isMine).toBe(false);
      expect(f1.repair.photos).toHaveLength(1);
      expect(f1.repair.contactName).toBeUndefined();
      expect(f1.repair.email).toBeUndefined();
      // Het eigen CONFLICT-concept is alleen voor deze sessie zichtbaar.
      expect(f1.myConflict).not.toBeNull();
      expect(f1.myConflict.description).toBe('Wij hebben dit ook gerepareerd');
    });

    it('S1 claimt F2 (zonder foto) → REPORTED', async () => {
      const res = await postA(`/api/v1/client/repair/findings/${findingF2Id}/resolve`)
        .set(bearer(tokenS1))
        .send({ description: 'Bedrading afgeschermd' })
        .expect(201);
      resolutionF2Id = res.body.data.resolution.id;
    });

    it('complete met een melding zonder foto → 400', async () => {
      const res = await postA('/api/v1/client/repair/complete')
        .set(bearer(tokenS1))
        .send({
          resolutionIds: [resolutionF1Id, resolutionF2Id],
          contactName: 'Piet Hersteller',
          email: 'e2e-repair-hersteller@test.nl',
        })
        .expect(400);
      expect(res.body.message).toContain('bewijsfoto');
    });

    it('complete zonder e-mail op een ANONYMOUS-sessie → 400', async () => {
      const res = await postA('/api/v1/client/repair/complete')
        .set(bearer(tokenS1))
        .send({ resolutionIds: [resolutionF1Id], contactName: 'Piet Hersteller' })
        .expect(400);
      expect(res.body.message).toContain('E-mailadres');
    });

    it('complete happy path → concept-herstelverklaring met invullernaam', async () => {
      const res = await postA('/api/v1/client/repair/complete')
        .set(bearer(tokenS1))
        .send({
          resolutionIds: [resolutionF1Id],
          contactName: 'Piet Hersteller',
          companyName: 'Herstel BV',
          email: 'e2e-repair-hersteller@test.nl',
        })
        .expect(201);

      expect(res.body.data.documentId).toBeDefined();
      expect(res.body.data.htmlPreview).toContain('Piet Hersteller');
      declarationDocumentId = res.body.data.documentId;
    });

    it('sign → verklaring SIGNED, PDF opgeslagen, sessie COMPLETED', async () => {
      const res = await postA('/api/v1/client/repair/sign')
        .set(bearer(tokenS1))
        .send({ signatureImage: PNG_DATA_URL })
        .expect(201);

      expect(res.body.data.status).toBe('SIGNED');
      expect(res.body.data.documentId).toBe(declarationDocumentId);

      const doc = await prisma.generatedDocument.findUnique({
        where: { id: declarationDocumentId },
        include: { signatures: true },
      });
      expect(doc?.status).toBe('SIGNED');
      expect(doc?.pdfUrl).not.toBeNull();
      const signature = doc?.signatures.find((s) => s.signerRoleCode === 'HERSTELLER');
      expect(signature?.status).toBe('SIGNED');

      const session = await prisma.repairSession.findUnique({ where: { id: sessionS1Id } });
      expect(session?.status).toBe('COMPLETED');
      expect(session?.completedAt).not.toBeNull();
    });

    it('GET declaration/pdf → 200 met application/pdf (ook op de COMPLETED-sessie)', async () => {
      const res = await getA('/api/v1/client/repair/declaration/pdf')
        .set(bearer(tokenS1))
        .expect(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('na COMPLETED is verder claimen geblokkeerd → 400', async () => {
      const res = await postA(`/api/v1/client/repair/findings/${findingF3Id}/resolve`)
        .set(bearer(tokenS1))
        .send({ description: 'Te laat' })
        .expect(400);
      expect(res.body.message).toContain('al afgerond');
    });
  });

  // ── COMPLETED-sessie blijft leesbaar (review #8/#15) ────────────────────
  describe('COMPLETED-sessie blijft leesbaar', () => {
    it('GET session op de COMPLETED-sessie → 200 met status COMPLETED', async () => {
      const res = await getA('/api/v1/client/repair/session').set(bearer(tokenS1)).expect(200);

      expect(res.body.data.session.status).toBe('COMPLETED');
      expect(res.body.data.session.completedAt).not.toBeNull();
    });

    it('blijft ook ná de TTL leesbaar en wordt NIET naar EXPIRED geflipt (review #8)', async () => {
      // Lazy expiry geldt alleen voor ACTIVE-sessies: forceer de expiresAt van de
      // afgeronde sessie in het verleden en controleer dat de guard haar doorlaat.
      await prisma.repairSession.update({
        where: { id: sessionS1Id },
        data: { expiresAt: new Date(Date.now() - 3600_000) },
      });

      const res = await getA('/api/v1/client/repair/session').set(bearer(tokenS1)).expect(200);
      expect(res.body.data.session.status).toBe('COMPLETED');

      // Geen EXPIRED-flip in de database: de eindstatus blijft staan.
      const row = await prisma.repairSession.findUnique({ where: { id: sessionS1Id } });
      expect(row?.status).toBe('COMPLETED');
    });
  });

  // ── Cross-tenant-isolatie (§14.11) ──────────────────────────────────────
  describe('cross-tenant', () => {
    it('sessietoken van org A op het subdomein van org B → 401', async () => {
      await request(server())
        .get('/api/v1/client/repair/session')
        .set('Host', HOST_B)
        .set(bearer(tokenS2))
        .expect(401);
    });

    it('org-A-sessie kan een constatering van org B niet claimen (id-injectie) → 404', async () => {
      await postA(`/api/v1/client/repair/findings/${findingBId}/resolve`)
        .set(bearer(tokenS2))
        .send({ description: 'Injectie-poging' })
        .expect(404);
    });

    it('foto van org B is via een org-A-sessie onvindbaar → 404', async () => {
      await getA(`/api/v1/client/repair/photos/${photoBId}`).set(bearer(tokenS2)).expect(404);
    });
  });

  // ── Verlopen sessie (§14.11) ────────────────────────────────────────────
  describe('verlopen sessie', () => {
    it('geeft 401 met de exacte NL-melding', async () => {
      const res = await getA('/api/v1/client/repair/session')
        .set(bearer(tokenExpired))
        .expect(401);
      expect(res.body.message).toBe(EXPIRED_ERROR);
    });
  });

  // ── CLIENT_USER-instap (§14.6 sessions) ─────────────────────────────────
  describe('POST /client/repair/sessions (ingelogde klant)', () => {
    it('logt de klant in op org A', async () => {
      const res = await postA('/api/v1/client/auth/login')
        .send({ email: CLIENT_EMAIL, password: CLIENT_PW })
        .expect(201);
      clientToken = res.body.data.accessToken;
      expect(clientToken).toBeDefined();
    });

    it('start een CLIENT_USER-sessie met vooraf gevulde invullergegevens', async () => {
      const res = await postA('/api/v1/client/repair/sessions')
        .set(bearer(clientToken))
        .send({ inspectionPlanId: planA1Id })
        .expect(201);

      const data = res.body.data;
      expect(data.token).toMatch(/^[0-9a-f]{96}$/);
      expect(data.session.accessType).toBe('CLIENT_USER');
      expect(data.session.contactName).toBe('Klaas Klant');
      expect(data.session.email).toBe(CLIENT_EMAIL);
      expect(data.plan.id).toBe(planA1Id);
    });

    it('weigert een sessie op een plan zonder de vlag → 400', async () => {
      const res = await postA('/api/v1/client/repair/sessions')
        .set(bearer(clientToken))
        .send({ inspectionPlanId: planA2Id })
        .expect(400);
      expect(res.body.message).toContain('niet beschikbaar');
    });
  });
});
