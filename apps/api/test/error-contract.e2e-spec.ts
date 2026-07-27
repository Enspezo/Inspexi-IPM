import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { AllExceptionsFilter, createAppValidationPipe } from '@/common';
import { PrismaService } from '@/prisma';

/**
 * Foutcontract-e2e (WP-C1 / B-105, B-106, B-151, B-155, B-501, B-601).
 *
 * 1. 404-oracle: per gemigreerde module geeft `GET /:id` voor een id van een
 *    ANDERE org exact hetzelfde antwoord (status + byte-identieke body) als
 *    voor een niet-bestaande UUID — het bestaan van andermans records mag
 *    niet af te leiden zijn (B-105).
 * 2. NL-taalcontract: 401/403/400-antwoorden uit guards en pipes bevatten
 *    Nederlandse meldingen; geen enkele Engelse framework-default lekt door
 *    (B-106/B-155/B-501).
 *
 * NB: deze suite registreert — anders dan de meeste oudere suites — óók de
 * `AllExceptionsFilter` en de gedeelde `createAppValidationPipe()`, zodat het
 * volledige productie-foutcontract wordt getest (zelfde bodyshape als main.ts).
 */
describe('Error contract (WP-C1): NL-meldingen + 404-oracle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let org1AdminToken: string;
  let org2Id: string;

  const NON_EXISTENT_UUID = '00000000-0000-4000-8000-000000000000';

  /** Engelse framework-teksten die nergens meer in een respons mogen opduiken. */
  const ENGLISH_FRAMEWORK_PATTERNS = [
    /Forbidden resource/,
    /^Forbidden$/,
    /^Unauthorized$/,
    /Too Many Requests/,
    /Validation failed \(uuid is expected\)/,
    /User not found or inactive/,
    /must not be less than/,
    /must not be greater than/,
    /must be an email/,
    /must be a string/,
    /must be a number/,
    /should not be empty/,
    /must contain at least/,
    /must be longer than or equal to/,
    /must be shorter than or equal to/,
  ];

  function expectDutch(body: { message?: string; errors?: string[] }) {
    const texts = [body.message, ...(body.errors ?? [])].filter(
      (t): t is string => typeof t === 'string',
    );
    expect(texts.length).toBeGreaterThan(0);
    for (const text of texts) {
      for (const pattern of ENGLISH_FRAMEWORK_PATTERNS) {
        expect(text).not.toMatch(pattern);
      }
    }
  }

  // Fixtures in org B (Test Bedrijf) — aangemaakt via Prisma, opgeruimd in afterAll.
  const foreign: Record<string, string> = {};

  async function login(email: string, password = 'Password123!') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return res.body.data.accessToken as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(createAppValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    org1AdminToken = await login('admin@inspexi-demo.nl');

    const org2 = await prisma.organization.findUnique({ where: { slug: 'testbedrijf' } });
    if (!org2) throw new Error('Seed-org "testbedrijf" ontbreekt — draai pnpm db:seed');
    org2Id = org2.id;

    const org2Admin = await prisma.user.findFirst({
      where: { orgId: org2Id, email: 'admin@testbedrijf.nl' },
    });
    if (!org2Admin) throw new Error('Seed-user admin@testbedrijf.nl ontbreekt');
    foreign.user = org2Admin.id;

    // ── Org-B-fixtures (kinderen ná ouders) ──
    const contact = await prisma.contact.create({
      data: { orgId: org2Id, type: 'COMPANY', companyName: 'e2e-errc Contact BV' },
    });
    foreign.contact = contact.id;

    const person = await prisma.contactPerson.create({
      data: {
        orgId: org2Id,
        contactId: contact.id,
        firstName: 'e2e-errc',
        lastName: 'Persoon',
      },
    });
    foreign.contactPerson = person.id;

    const location = await prisma.location.create({
      data: {
        orgId: org2Id,
        contactId: contact.id,
        name: 'e2e-errc Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1234AB',
        city: 'Teststad',
      },
    });
    foreign.location = location.id;

    const customerGroup = await prisma.customerGroup.create({
      data: { orgId: org2Id, name: 'e2e-errc Klantgroep' },
    });
    foreign.customerGroup = customerGroup.id;

    const product = await prisma.product.create({
      data: { orgId: org2Id, name: 'e2e-errc Product', unit: 'stuk' },
    });
    foreign.product = product.id;

    const productGroup = await prisma.productGroup.create({
      data: { orgId: org2Id, name: 'e2e-errc Productgroep' },
    });
    foreign.productGroup = productGroup.id;

    const priceTable = await prisma.priceTable.create({
      data: { orgId: org2Id, name: 'e2e-errc Prijstabel' },
    });
    foreign.priceTable = priceTable.id;

    const quoteTemplate = await prisma.quoteTemplate.create({
      data: { orgId: org2Id, name: 'e2e-errc Offertesjabloon' },
    });
    foreign.quoteTemplate = quoteTemplate.id;

    const quote = await prisma.quote.create({
      data: {
        orgId: org2Id,
        quoteNumber: 'e2e-errc-0001',
        contactId: contact.id,
        subject: 'e2e-errc Offerte',
        createdBy: org2Admin.id,
      },
    });
    foreign.quote = quote.id;

    const requestRow = await prisma.request.create({
      data: {
        orgId: org2Id,
        contactId: contact.id,
        title: 'e2e-errc Aanvraag',
        source: 'MANUAL',
        createdBy: org2Admin.id,
      },
    });
    foreign.request = requestRow.id;

    const emailTemplate = await prisma.emailTemplate.create({
      data: {
        orgId: org2Id,
        type: 'OFFERTE_VERSTUURD',
        name: 'e2e-errc E-mailsjabloon',
        subject: 'e2e-errc',
        bodyJson: {},
        bodyHtml: '<p>e2e-errc</p>',
        createdBy: org2Admin.id,
      },
    });
    foreign.emailTemplate = emailTemplate.id;

    const documentTag = await prisma.documentTag.create({
      data: { orgId: org2Id, name: 'e2e-errc Tag', color: '#3B82F6' },
    });
    foreign.documentTag = documentTag.id;
  });

  afterAll(async () => {
    try {
      // Kinderen vóór ouders; alles is e2e-errc-gemarkeerd of via id bekend.
      await prisma.documentTag.deleteMany({ where: { id: foreign.documentTag } });
      await prisma.emailTemplate.deleteMany({ where: { id: foreign.emailTemplate } });
      await prisma.requestStatusHistory.deleteMany({ where: { requestId: foreign.request } });
      await prisma.request.deleteMany({ where: { id: foreign.request } });
      await prisma.quote.deleteMany({ where: { id: foreign.quote } });
      await prisma.quoteTemplate.deleteMany({ where: { id: foreign.quoteTemplate } });
      await prisma.priceTable.deleteMany({ where: { id: foreign.priceTable } });
      await prisma.product.deleteMany({ where: { id: foreign.product } });
      await prisma.productGroup.deleteMany({ where: { id: foreign.productGroup } });
      await prisma.customerGroup.deleteMany({ where: { id: foreign.customerGroup } });
      await prisma.location.deleteMany({ where: { id: foreign.location } });
      await prisma.contactPerson.deleteMany({ where: { id: foreign.contactPerson } });
      await prisma.contact.deleteMany({ where: { id: foreign.contact } });
    } finally {
      await app.close();
    }
  });

  // ─── 1. 404-oracle (B-105) ────────────────────────────────────────────
  //
  // Tabelgedreven: per module het paar (vreemde-org-id, onbestaande UUID).
  // Beide → 404 én byte-identieke body, anders is 403↔404 (of een afwijkende
  // melding) een betrouwbaar existence-oracle.

  const ORACLE_CASES: Array<{ name: string; path: (id: string) => string; fixtureKey: string }> = [
    { name: 'contacts', path: (id) => `/api/v1/contacts/${id}`, fixtureKey: 'contact' },
    {
      name: 'contact-persons',
      path: (id) => `/api/v1/contacts/contact-persons/${id}`,
      fixtureKey: 'contactPerson',
    },
    {
      name: 'locations',
      path: (id) => `/api/v1/contacts/locations/${id}`,
      fixtureKey: 'location',
    },
    {
      name: 'customer-groups',
      path: (id) => `/api/v1/customer-groups/${id}`,
      fixtureKey: 'customerGroup',
    },
    { name: 'products', path: (id) => `/api/v1/products/${id}`, fixtureKey: 'product' },
    {
      name: 'product-groups',
      path: (id) => `/api/v1/product-groups/${id}`,
      fixtureKey: 'productGroup',
    },
    {
      name: 'price-tables',
      path: (id) => `/api/v1/price-tables/${id}`,
      fixtureKey: 'priceTable',
    },
    { name: 'quotes', path: (id) => `/api/v1/quotes/${id}`, fixtureKey: 'quote' },
    {
      name: 'quote-templates',
      path: (id) => `/api/v1/quote-templates/${id}`,
      fixtureKey: 'quoteTemplate',
    },
    { name: 'requests', path: (id) => `/api/v1/requests/${id}`, fixtureKey: 'request' },
    {
      name: 'email-templates',
      path: (id) => `/api/v1/email-templates/${id}`,
      fixtureKey: 'emailTemplate',
    },
    {
      name: 'document-tags',
      path: (id) => `/api/v1/document-tags/${id}`,
      fixtureKey: 'documentTag',
    },
    { name: 'users', path: (id) => `/api/v1/users/${id}`, fixtureKey: 'user' },
  ];

  describe.each(ORACLE_CASES)('404-oracle: $name', ({ path, fixtureKey }) => {
    it('geeft voor een vreemde-org-id en een onbestaande UUID hetzelfde 404-antwoord (byte-identiek)', async () => {
      const foreignId = foreign[fixtureKey];
      expect(foreignId).toBeTruthy();

      const foreignRes = await request(app.getHttpServer())
        .get(path(foreignId))
        .set('Authorization', `Bearer ${org1AdminToken}`);
      const missingRes = await request(app.getHttpServer())
        .get(path(NON_EXISTENT_UUID))
        .set('Authorization', `Bearer ${org1AdminToken}`);

      expect(missingRes.status).toBe(404);
      expect(foreignRes.status).toBe(404);
      // Byte-identiek: geen enkel verschil in body tussen "bestaat niet" en
      // "hoort bij een andere org".
      expect(foreignRes.text).toBe(missingRes.text);
      expectDutch(foreignRes.body);
    });
  });

  // ─── 2. NL-taalcontract (B-106 / B-155 / B-501 / B-601) ───────────────

  describe('401 — JwtAuthGuard', () => {
    it('geeft NL-melding zonder token', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/contacts').expect(401);
      expect(res.body).toMatchObject({
        success: false,
        statusCode: 401,
        message: 'Niet ingelogd of uw sessie is verlopen',
      });
    });

    it('geeft NL-melding bij een geknoeid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken.slice(0, -2)}xx`)
        .expect(401);
      expect(res.body.message).toBe('Niet ingelogd of uw sessie is verlopen');
      expectDutch(res.body);
    });
  });

  describe('403 — RolesGuard', () => {
    it('geeft NL-melding wanneer de rol ontoereikend is (ORG_ADMIN → GET /organizations)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/organizations')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(403);
      expect(res.body).toMatchObject({
        success: false,
        statusCode: 403,
        message: 'U heeft niet de juiste rol voor deze actie',
      });
    });
  });

  describe('400 — ParseUuidPipe (B-155)', () => {
    it('geeft NL-melding voor een ongeldige UUID in een routeparameter', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts/not-a-uuid')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(400);
      expect(res.body.message).toBe('Ongeldige identificatie');
      expectDutch(res.body);
    });
  });

  describe('400 — ValidationPipe met NL-exceptionFactory (B-501)', () => {
    it('vertaalt class-validator-defaults naar NL (defaultVat/naam-grenzen)', async () => {
      // Superuser-route; met een ongeldige payload wordt er niets aangemaakt —
      // de pipe weigert vóór de controller. Guards (rol) draaien vóór de pipe,
      // dus we loggen in als superuser.
      const superuserToken = await login('superuser@inspexi.nl');
      const res = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: 'X', slug: 'e2eerrcontract', defaultVat: -5, defaultValidityDays: 0 })
        .expect(400);

      const all = [res.body.message, ...(res.body.errors ?? [])].join(' | ');
      expect(all).toContain('defaultVat moet minimaal 0 zijn');
      expect(all).toContain('defaultValidityDays moet minimaal 1 zijn');
      expect(all).toContain('name moet minimaal 2 tekens bevatten');
      expectDutch(res.body);
    });

    it('behoudt bestaande expliciete NL-messages en maakt geneste padprefixen leesbaar (WP-B5-restpunt)', async () => {
      // PUT /quotes/:id/lines — de pipe weigert vóór de handler, dus het
      // offerte-id hoeft niet te bestaan.
      const res = await request(app.getHttpServer())
        .put(`/api/v1/quotes/${NON_EXISTENT_UUID}/lines`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          lines: [
            { description: 'Regel', quantity: -1, unit: 'uur', unitPrice: 10 },
          ],
        })
        .expect(400);

      const all = [res.body.message, ...(res.body.errors ?? [])].join(' | ');
      // Custom NL-message blijft leidend, met leesbare NL-padprefix i.p.v. "lines.0."
      expect(all).toContain('Regel 1: Aantal mag niet negatief zijn');
      expect(all).not.toContain('lines.0.');
      expectDutch(res.body);
    });

    it('vertaalt whitelist-fouten (onbekend veld) naar NL', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/quotes/${NON_EXISTENT_UUID}/lines`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({ lines: [], onbekendVeld: true })
        .expect(400);
      const all = [res.body.message, ...(res.body.errors ?? [])].join(' | ');
      expect(all).toContain('Onbekend veld: onbekendVeld');
      expectDutch(res.body);
    });
  });

  describe('sweep — geen Engelse framework-teksten in 401/403/404-antwoorden', () => {
    it('alle bovenstaande foutpaden zijn Nederlands', async () => {
      // Sequentieel (niet Promise.all): parallelle sockets op de supertest-app
      // geven soms ECONNRESET.
      const responses = [
        await request(app.getHttpServer()).get('/api/v1/contacts'),
        await request(app.getHttpServer())
          .get('/api/v1/organizations')
          .set('Authorization', `Bearer ${org1AdminToken}`),
        await request(app.getHttpServer())
          .get(`/api/v1/contacts/${NON_EXISTENT_UUID}`)
          .set('Authorization', `Bearer ${org1AdminToken}`),
        await request(app.getHttpServer())
          .get('/api/v1/contacts/not-a-uuid')
          .set('Authorization', `Bearer ${org1AdminToken}`),
      ];
      for (const res of responses) {
        expect(res.status).toBeGreaterThanOrEqual(400);
        expectDutch(res.body);
        expect(res.body.success).toBe(false);
      }
    });
  });
});
