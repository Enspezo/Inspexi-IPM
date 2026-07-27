import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import {
  STORAGE_PROVIDER,
  StorageProvider,
} from '@/common/services/storage/storage.interface';

/**
 * WP-B7 — Publieke endpoints: allowlist + tenantbinding (B-306, B-152).
 *
 * 1. Key-snapshot op de VOLLEDIGE publieke payload (planning én offerte): de
 *    exacte set toplevel- en genestte sleutels. Elk nieuw veld moet hier bewust
 *    worden toegelaten — dit is de generieke bescherming tegen veld-lekken zoals
 *    `internalNotes` (B-306).
 * 2. Tenantbinding (B-152): een geldige publicToken van org A resolvet NIET op
 *    het subdomein van org B — 404 voor lezen, PDF, ondertekenen, vragen en
 *    bijlagen; op het eigen subdomein gewoon 200.
 * 3. Conventies: apex-/superuser-domein en onbekende host (127.0.0.1, e2e)
 *    blijven werken — gemailde links gebruiken het statische PUBLIC_URL zonder
 *    org-subdomein (beslispunt DEP-6, zie publicTenantWhere in @/common).
 * 4. Entitlement-gate geëvalueerd tegen de EIGENAAR van de offerte (niet meer
 *    tegen de bezoekende tenant via de klasse-decorator).
 */
jest.setTimeout(60000);

const HOST_A = 'wpb7orga.localhost';
const HOST_B = 'wpb7orgb.localhost';
const HOST_C = 'wpb7orgc.localhost';

const QUOTE_TOKEN_A = 'wpb7-quote-token-aaaaaaaaaaaaaaaa';
const QUOTE_TOKEN_C = 'wpb7-quote-token-cccccccccccccccc';
const PLANNING_TOKEN_A = 'wpb7-planning-token-aaaaaaaaaaaa';

// Onderscheidende geheimen — mogen NOOIT in een publieke payload opduiken.
const QUOTE_INTERNAL_NOTE = 'WPB7-OFFERTE-INTERN-GEHEIM';
const PLANNING_INTERNAL_NOTE = 'WPB7-PLANNING-INTERN-GEHEIM';
const STAFF_EMAIL = 'e2e-wpb7-staf@wpb7.nl';

describe('Publieke endpoints — allowlist + tenantbinding (e2e, WP-B7)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageProvider;

  let orgAId: string;
  let orgBId: string;
  let orgCId: string;
  let planId: string;
  let staffAId: string;
  let inspectorAId: string;
  let contactAId: string;
  let contactCId: string;
  let locationAId: string;
  let quoteAId: string;
  let quoteCId: string;
  let attachmentAId: string;
  let planningAId: string;
  let sessionAId: string;

  const pdfKey = 'e2e-wpb7/quotes/offerte-a.pdf';
  const attachmentKey = 'e2e-wpb7/quotes/bijlage-a.txt';

  const onHost = (host: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set('Host', host),
    post: (path: string) => request(app.getHttpServer()).post(path).set('Host', host),
  });

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
    storage = app.get(STORAGE_PROVIDER);

    // ─── Orgs ────────────────────────────────────────────────
    const orgA = await prisma.organization.create({
      data: { name: 'WPB7 Org A', slug: 'wpb7orga' },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: { name: 'WPB7 Org B', slug: 'wpb7orgb' },
    });
    orgBId = orgB.id;

    // Org C heeft een plan MET features maar ZONDER CRM_COMPLEET → de
    // service-gate (tegen de eigenaar-org) moet 403 geven, ook op localhost.
    const plan = await prisma.plan.create({
      data: {
        name: 'WPB7 Basisplan',
        slug: 'wpb7basisplan',
        features: { create: [{ featureKey: 'BASIS_CRM' }] },
      },
    });
    planId = plan.id;
    const orgC = await prisma.organization.create({
      data: { name: 'WPB7 Org C', slug: 'wpb7orgc', planId: plan.id },
    });
    orgCId = orgC.id;

    // ─── Users (geen login nodig — endpoints zijn publiek) ───
    const staffA = await prisma.user.create({
      data: {
        email: STAFF_EMAIL,
        passwordHash: 'x',
        firstName: 'Stef',
        lastName: 'Staf',
        roles: ['BACKOFFICE'],
        orgId: orgAId,
      },
    });
    staffAId = staffA.id;
    const inspectorA = await prisma.user.create({
      data: {
        email: 'e2e-wpb7-inspecteur@wpb7.nl',
        passwordHash: 'x',
        firstName: 'Ingrid',
        lastName: 'Inspecteur',
        roles: ['INSPECTEUR'],
        orgId: orgAId,
        initials: 'II',
        color: '#336699',
        contactPhone: '+31 6 12 34 56 78',
        sharePhoneWithClients: true,
      },
    });
    inspectorAId = inspectorA.id;

    // ─── CRM-fixtures ────────────────────────────────────────
    const contactA = await prisma.contact.create({
      data: {
        orgId: orgAId,
        type: 'COMPANY',
        companyName: 'WPB7 Opdrachtgever BV',
        email: 'klant@wpb7-opdrachtgever.nl',
      },
    });
    contactAId = contactA.id;
    const locationA = await prisma.location.create({
      data: {
        orgId: orgAId,
        contactId: contactAId,
        name: 'WPB7 Hoofdkantoor',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1234AB',
        city: 'Amsterdam',
      },
    });
    locationAId = locationA.id;
    const contactC = await prisma.contact.create({
      data: { orgId: orgCId, type: 'COMPANY', companyName: 'WPB7 Klant C BV' },
    });
    contactCId = contactC.id;

    // ─── Offerte org A (BEKEKEN + viewedAt → leestests muteren niets) ──
    const quoteA = await prisma.quote.create({
      data: {
        orgId: orgAId,
        quoteNumber: 'WPB7-0001',
        subject: 'WPB7 Publieke offerte',
        status: 'BEKEKEN',
        contactId: contactAId,
        createdBy: staffAId,
        publicToken: QUOTE_TOKEN_A,
        internalNotes: QUOTE_INTERNAL_NOTE,
        customFields: { intern: 'WPB7-CUSTOMFIELD-GEHEIM' },
        subtotal: 100,
        vatTotal: 21,
        total: 121,
        validUntil: new Date('2026-12-31T00:00:00Z'),
        sentAt: new Date(),
        viewedAt: new Date(),
        pdfStorageKey: pdfKey,
        lines: {
          create: [
            {
              description: 'Inspectie werkplaats',
              quantity: 2,
              unit: 'stuks',
              unitPrice: 50,
              vatRate: 21,
              discountPct: 0,
              lineTotal: 100,
              sortOrder: 0,
            },
          ],
        },
        questions: {
          create: [
            // Stafantwoord mét userId — de user-relatie mag NIET publiek meekomen.
            { userId: staffAId, message: 'Antwoord van de medewerker', isFromClient: false },
          ],
        },
      },
    });
    quoteAId = quoteA.id;
    const attachment = await prisma.quoteAttachment.create({
      data: {
        quoteId: quoteAId,
        storageKey: attachmentKey,
        fileName: 'voorwaarden.txt',
        mimeType: 'text/plain',
        fileSize: 11,
        sortOrder: 0,
      },
    });
    attachmentAId = attachment.id;
    // Fysieke bestanden zodat own-subdomein download-routes echt 200 kunnen geven.
    await storage.upload(pdfKey, Buffer.from('%PDF-1.4 wpb7 dummy'), 'application/pdf');
    await storage.upload(attachmentKey, Buffer.from('voorwaarden'), 'text/plain');

    // ─── Offerte org C (eigenaar zonder CRM_COMPLEET) ────────
    const quoteC = await prisma.quote.create({
      data: {
        orgId: orgCId,
        quoteNumber: 'WPB7-C-0001',
        subject: 'WPB7 Offerte zonder entitlement',
        status: 'BEKEKEN',
        contactId: contactCId,
        createdBy: staffAId, // FK is niet org-gebonden; alleen als referentie gebruikt
        publicToken: QUOTE_TOKEN_C,
        viewedAt: new Date(),
        subtotal: 10,
        vatTotal: 2.1,
        total: 12.1,
      },
    });
    quoteCId = quoteC.id;

    // ─── Planning org A (met interne notitie + inspecteur + sessie) ──
    const planningA = await prisma.planningItem.create({
      data: {
        orgId: orgAId,
        contactId: contactAId,
        locationId: locationAId,
        productName: 'WPB7 NEN3140 inspectie',
        status: 'GEPLAND',
        scheduledDate: new Date('2026-09-01T09:00:00Z'),
        durationHours: 4,
        labels: ['WPB7'],
        internalNotes: PLANNING_INTERNAL_NOTE,
        publicToken: PLANNING_TOKEN_A,
        createdBy: staffAId,
      },
    });
    planningAId = planningA.id;
    await prisma.planningInspector.create({
      data: {
        planningItemId: planningAId,
        userId: inspectorAId,
        isPrimary: true,
        acceptanceStatus: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
    const session = await prisma.planningSession.create({
      data: {
        planningItemId: planningAId,
        sessionNumber: 1,
        scheduledDate: new Date('2026-09-01T09:00:00Z'),
        durationHours: 4,
        notes: 'Sessienotitie voor de klant',
      },
    });
    sessionAId = session.id;
    await prisma.planningSessionInspector.create({
      data: {
        sessionId: sessionAId,
        userId: inspectorAId,
        isPrimary: true,
        acceptanceStatus: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    try {
      const orgIds = [orgAId, orgBId, orgCId];
      // Kinderen eerst; het ondertekenen kan een project + planregel + notificaties
      // hebben aangemaakt (auto-create flow) — allemaal org-scoped opruimen.
      await prisma.quoteQuestion.deleteMany({ where: { quote: { orgId: { in: orgIds } } } });
      await prisma.quoteAttachment.deleteMany({ where: { quote: { orgId: { in: orgIds } } } });
      await prisma.quoteLine.deleteMany({ where: { quote: { orgId: { in: orgIds } } } });
      await prisma.quote.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.planningSessionInspector.deleteMany({
        where: { session: { planningItem: { orgId: { in: orgIds } } } },
      });
      await prisma.planningSession.deleteMany({
        where: { planningItem: { orgId: { in: orgIds } } },
      });
      await prisma.planningInspector.deleteMany({
        where: { planningItem: { orgId: { in: orgIds } } },
      });
      await prisma.planningHistory.deleteMany({
        where: { planningItem: { orgId: { in: orgIds } } },
      });
      await prisma.planningItem.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.project.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.numberingCounter.deleteMany({
        where: { scheme: { orgId: { in: orgIds } } },
      });
      await prisma.numberingScheme.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.location.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [staffAId, inspectorAId] } },
      });
      await prisma.user.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
      await prisma.planFeature.deleteMany({ where: { planId } });
      await prisma.plan.deleteMany({ where: { id: planId } });
      await storage.delete(pdfKey).catch(() => undefined);
      await storage.delete(attachmentKey).catch(() => undefined);
    } finally {
      await app.close();
    }
  });

  // ─── B-306: publieke planning-payload — allowlist + key-snapshot ─────

  describe('GET /public/planning/:token — allowlist (B-306)', () => {
    it('bevat geen internalNotes of andere interne kolommen', async () => {
      const res = await onHost(HOST_A).get(`/api/v1/public/planning/${PLANNING_TOKEN_A}`).expect(200);

      expect(res.body.data).not.toHaveProperty('internalNotes');
      expect(res.body.data).not.toHaveProperty('orgId');
      expect(res.body.data).not.toHaveProperty('createdBy');
      expect(res.body.data).not.toHaveProperty('cancelReason');
      expect(res.body.data).not.toHaveProperty('publicToken');

      const raw = JSON.stringify(res.body.data);
      expect(raw).not.toContain(PLANNING_INTERNAL_NOTE);
      expect(raw).not.toContain(STAFF_EMAIL);
    });

    it('KEY-SNAPSHOT: exacte toplevel- en genestte sleutels van de publieke payload', async () => {
      const res = await onHost(HOST_A).get(`/api/v1/public/planning/${PLANNING_TOKEN_A}`).expect(200);
      const data = res.body.data;

      // Toplevel — elk nieuw veld hier is een bewuste, gereviewde beslissing.
      expect(Object.keys(data).sort()).toEqual(
        [
          'contact',
          'documents',
          'durationHours',
          'id',
          'inspectors',
          'isMultiDay',
          'labels',
          'location',
          'organization',
          'productName',
          'scheduledDate',
          'sessions',
          'status',
        ].sort(),
      );

      expect(Object.keys(data.contact).sort()).toEqual(
        ['companyName', 'firstName', 'id', 'lastName', 'type'].sort(),
      );
      expect(Object.keys(data.location).sort()).toEqual(
        ['city', 'houseNumber', 'id', 'name', 'postalCode', 'street'].sort(),
      );
      expect(Object.keys(data.organization).sort()).toEqual(
        ['id', 'logoUrl', 'name', 'primaryColor'].sort(),
      );

      expect(data.inspectors).toHaveLength(1);
      expect(Object.keys(data.inspectors[0]).sort()).toEqual(
        ['acceptanceStatus', 'id', 'isPrimary', 'user'].sort(),
      );
      expect(Object.keys(data.inspectors[0].user).sort()).toEqual(
        ['color', 'email', 'firstName', 'id', 'initials', 'lastName', 'phone'].sort(),
      );

      expect(data.sessions).toHaveLength(1);
      expect(Object.keys(data.sessions[0]).sort()).toEqual(
        [
          'durationHours',
          'id',
          'isCancelled',
          'notes',
          'scheduledDate',
          'sessionInspectors',
          'sessionNumber',
          'status',
        ].sort(),
      );
      expect(Object.keys(data.sessions[0].sessionInspectors[0]).sort()).toEqual(
        ['acceptanceStatus', 'id', 'isPrimary', 'user'].sort(),
      );
      expect(Object.keys(data.sessions[0].sessionInspectors[0].user).sort()).toEqual(
        ['color', 'email', 'firstName', 'id', 'initials', 'lastName', 'phone'].sort(),
      );
    });
  });

  // ─── Publieke offerte-payload — allowlist + key-snapshot ─────────────

  describe('GET /public/quotes/:token — allowlist', () => {
    it('bevat geen interne velden (internalNotes, customFields, staf, approvals, storage-keys)', async () => {
      const res = await onHost(HOST_A).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(200);
      const data = res.body.data;

      for (const veld of [
        'internalNotes',
        'customFields',
        'clientIp',
        'clientUserAgent',
        'clientSignature',
        'managerSignature',
        'approvalRequests',
        'createdByUser',
        'template',
        'orgId',
        'createdBy',
        'viewedAt',
        'sentAt',
        'publicToken',
        'signedPdfStorageKey',
      ]) {
        expect(data).not.toHaveProperty(veld);
      }

      const raw = JSON.stringify(data);
      expect(raw).not.toContain(QUOTE_INTERNAL_NOTE);
      expect(raw).not.toContain('WPB7-CUSTOMFIELD-GEHEIM');
      expect(raw).not.toContain(STAFF_EMAIL);
      // Ook het klant-e-mailadres gaat niet mee — de pagina toont het nergens.
      expect(raw).not.toContain('klant@wpb7-opdrachtgever.nl');
    });

    it('KEY-SNAPSHOT: exacte toplevel- en genestte sleutels van de publieke payload', async () => {
      const res = await onHost(HOST_A).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(200);
      const data = res.body.data;

      expect(Object.keys(data).sort()).toEqual(
        [
          'attachments',
          'clientName',
          'contact',
          'contentBlocks',
          'createdAt',
          'discountTotal',
          'id',
          'lines',
          'organization',
          'pdfStorageKey',
          'questions',
          'quoteNumber',
          'signedAt',
          'status',
          'subject',
          'subtotal',
          'total',
          'validUntil',
          'vatTotal',
        ].sort(),
      );

      expect(Object.keys(data.contact).sort()).toEqual(
        ['companyName', 'firstName', 'id', 'lastName', 'type'].sort(),
      );
      expect(Object.keys(data.organization).sort()).toEqual(
        ['id', 'logoUrl', 'name', 'primaryColor'].sort(),
      );
      expect(data.lines).toHaveLength(1);
      expect(Object.keys(data.lines[0]).sort()).toEqual(
        [
          'description',
          'discountPct',
          'id',
          'lineTotal',
          'quantity',
          'sortOrder',
          'unit',
          'unitPrice',
          'vatRate',
        ].sort(),
      );
      expect(data.attachments).toHaveLength(1);
      expect(Object.keys(data.attachments[0]).sort()).toEqual(
        ['fileName', 'fileSize', 'id', 'mimeType', 'sortOrder'].sort(),
      );
      // Vragen zonder user-relatie: stafidentiteit blijft binnen.
      expect(data.questions).toHaveLength(1);
      expect(Object.keys(data.questions[0]).sort()).toEqual(
        ['createdAt', 'id', 'isFromClient', 'message'].sort(),
      );

      // Geldbedragen als numbers (serializeQuote), niet als Decimal-strings.
      expect(typeof data.total).toBe('number');
      expect(typeof data.lines[0].unitPrice).toBe('number');
    });
  });

  // ─── B-152: tenantbinding — org A-token op subdomein org B ───────────

  describe('tenantbinding (B-152)', () => {
    it('lezen met org A-token op subdomein org B → 404', async () => {
      const res = await onHost(HOST_B).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(404);
      expect(res.body.message).toBe('Offerte niet gevonden');
    });

    it('PDF met org A-token op subdomein org B → 404', async () => {
      await onHost(HOST_B).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/pdf`).expect(404);
    });

    it('bijlage-download met org A-token op subdomein org B → 404', async () => {
      await onHost(HOST_B)
        .get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/attachments/${attachmentAId}/download`)
        .expect(404);
    });

    it('klantvraag met org A-token op subdomein org B → 404, geen vraag aangemaakt', async () => {
      await onHost(HOST_B)
        .post(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/questions`)
        .send({ message: 'Cross-tenant vraag' })
        .expect(404);

      const count = await prisma.quoteQuestion.count({ where: { quoteId: quoteAId } });
      expect(count).toBe(1); // alleen de seed-vraag
    });

    it('ondertekenen met org A-token op subdomein org B → 404, offerte blijft onaangeroerd', async () => {
      await onHost(HOST_B)
        .post(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/sign`)
        .send({ clientName: 'Cross Tenant Aanvaller' })
        .expect(404);

      const quote = await prisma.quote.findUnique({ where: { id: quoteAId } });
      expect(quote?.status).toBe('BEKEKEN');
      expect(quote?.signedAt).toBeNull();
      expect(quote?.clientName).toBeNull();
    });

    it('eigen subdomein: lezen, PDF en bijlage → 200', async () => {
      await onHost(HOST_A).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(200);
      await onHost(HOST_A).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/pdf`).expect(200);
      await onHost(HOST_A)
        .get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/attachments/${attachmentAId}/download`)
        .expect(200);
    });
  });

  // ─── Hostconventies: apex/superuser + onbekende host ─────────────────

  describe('hostconventies (beslispunt DEP-6)', () => {
    it('apex-domein (kale BASE_DOMAIN, waar PUBLIC_URL-links landen) → 200', async () => {
      await onHost('localhost').get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(200);
    });

    it('superuser-subdomein (mijn.*) → 200 (zelfde classificatie als het apex-domein)', async () => {
      await onHost('mijn.localhost').get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(200);
    });

    it('onbekende host (127.0.0.1, e2e-conventie) → 200 op BASE_DOMAIN=localhost', async () => {
      // Geen Host-header → supertest gebruikt 127.0.0.1 → classificatie "unknown".
      await request(app.getHttpServer()).get(`/api/v1/public/quotes/${QUOTE_TOKEN_A}`).expect(200);
    });
  });

  // ─── Entitlement-gate tegen de eigenaar-org ──────────────────────────

  describe('feature-gate tegen quote.orgId (B-152 punt 3)', () => {
    it('eigenaar zonder CRM_COMPLEET → 403 FEATURE_NOT_IN_PLAN op het eigen subdomein', async () => {
      const res = await onHost(HOST_C).get(`/api/v1/public/quotes/${QUOTE_TOKEN_C}`).expect(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });

    it('ook op het apex-domein geldt de entitlement van de EIGENAAR (voorheen: bezoekende tenant → open)', async () => {
      const res = await onHost('localhost').get(`/api/v1/public/quotes/${QUOTE_TOKEN_C}`).expect(403);
      expect(res.body.code).toBe('FEATURE_NOT_IN_PLAN');
    });

    it('tenantbinding gaat vóór de feature-gate: org C-token op org B-subdomein → 404 (geen feature-oracle)', async () => {
      const res = await onHost(HOST_B).get(`/api/v1/public/quotes/${QUOTE_TOKEN_C}`).expect(404);
      expect(res.body.code).toBeUndefined();
    });
  });

  // ─── Ondertekenen op het eigen subdomein (statuswijzigend — als laatste) ──

  describe('ondertekenen op het eigen subdomein', () => {
    it('POST :token/sign op eigen subdomein → 200 en GEACCEPTEERD', async () => {
      const res = await onHost(HOST_A)
        .post(`/api/v1/public/quotes/${QUOTE_TOKEN_A}/sign`)
        .send({ clientName: 'WPB7 Ondertekenaar' })
        .expect(200);
      expect(res.body.data.signedAt).toBeDefined();

      const quote = await prisma.quote.findUnique({ where: { id: quoteAId } });
      expect(quote?.status).toBe('GEACCEPTEERD');
      expect(quote?.clientName).toBe('WPB7 Ondertekenaar');

      // De fire-and-forget auto-create (project/planregel) even laten landen
      // vóór de afterAll-cleanup, anders blijven er wees-rijen achter.
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
  });
});
