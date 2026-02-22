import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Contacts API (e2e)
 *
 * Runs against the real seeded database.
 * Seed users used:
 *   - admin@inspexi-demo.nl        (ORG_ADMIN, org1 = InspeXi Demo)
 *   - backoffice@inspexi-demo.nl   (BACKOFFICE, org1)
 *   - werkvoorbereider@inspexi-demo.nl (WERKVOORBEREIDER, org1)
 *   - inspecteur@inspexi-demo.nl   (INSPECTEUR, org1)
 *   - admin@testbedrijf.nl         (ORG_ADMIN, org2 = Test Bedrijf)
 *
 * Seed contacts (org1): Bouwbedrijf De Vries BV, Pieter Jansen, Vastgoed Partners BV
 * Seed contacts (org2): Installatie Groep Nederland
 */
describe('Contacts API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens per role
  let org1AdminToken: string;
  let org1BackofficeToken: string;
  let org1WerkvoorbereiderToken: string;
  let org1InspecteurToken: string;
  let org2AdminToken: string;

  // IDs we need to look up from seed
  let org2ContactId: string; // Installatie Groep Nederland

  // IDs of resources created during tests (for cleanup)
  const createdContactIds: string[] = [];
  const createdAddressIds: string[] = [];
  const createdLocationIds: string[] = [];
  const createdLogIds: string[] = [];

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

    // Login all seed users in parallel
    const [org1Admin, org1Backoffice, org1Werkvoorbereider, org1Inspecteur, org2Admin] =
      await Promise.all([
        login('admin@inspexi-demo.nl'),
        login('backoffice@inspexi-demo.nl'),
        login('werkvoorbereider@inspexi-demo.nl'),
        login('inspecteur@inspexi-demo.nl'),
        login('admin@testbedrijf.nl'),
      ]);

    org1AdminToken = org1Admin.accessToken;
    org1BackofficeToken = org1Backoffice.accessToken;
    org1WerkvoorbereiderToken = org1Werkvoorbereider.accessToken;
    org1InspecteurToken = org1Inspecteur.accessToken;
    org2AdminToken = org2Admin.accessToken;

    // Look up org2 contact ID for cross-org tests
    const org2Contact = await prisma.contact.findFirst({
      where: { companyName: 'Installatie Groep Nederland' },
    });
    org2ContactId = org2Contact!.id;
  });

  afterAll(async () => {
    // Clean up resources created during tests (reverse dependency order)
    if (createdLogIds.length > 0) {
      await prisma.contactLog.deleteMany({
        where: { id: { in: createdLogIds } },
      });
    }
    if (createdLocationIds.length > 0) {
      await prisma.location.deleteMany({
        where: { id: { in: createdLocationIds } },
      });
    }
    if (createdAddressIds.length > 0) {
      await prisma.contactAddress.deleteMany({
        where: { id: { in: createdAddressIds } },
      });
    }
    if (createdContactIds.length > 0) {
      // Also remove any nested resources that might have been added to these contacts
      await prisma.contactEmail.deleteMany({
        where: { contactId: { in: createdContactIds } },
      });
      await prisma.contactLog.deleteMany({
        where: { contactId: { in: createdContactIds } },
      });
      await prisma.location.deleteMany({
        where: { contactId: { in: createdContactIds } },
      });
      await prisma.contactAddress.deleteMany({
        where: { contactId: { in: createdContactIds } },
      });
      await prisma.contact.deleteMany({
        where: { id: { in: createdContactIds } },
      });
    }

    // Restore any soft-deleted seed contacts
    await prisma.contact.updateMany({
      where: { isDeleted: true },
      data: { isDeleted: false },
    });

    await app.close();
  });

  // ─── GET /contacts ──────────────────────────────────────

  describe('GET /api/v1/contacts', () => {
    it('ORG_ADMIN can list contacts of own org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      // Org1 has 3 seeded contacts
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(3);

      // All returned contacts belong to org1
      const org1Id = res.body.data.data[0].orgId;
      for (const contact of res.body.data.data) {
        expect(contact.orgId).toBe(org1Id);
      }
    });

    it('returns paginated results', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .query({ page: 1, limit: 2 })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeLessThanOrEqual(2);
      expect(res.body.data.total).toBeGreaterThanOrEqual(3);
      expect(res.body.data.page).toBe(1);
      expect(res.body.data.limit).toBe(2);
    });

    it('can search contacts by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .query({ search: 'Vries' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      const names = res.body.data.data.map(
        (c: any) => c.companyName || `${c.firstName} ${c.lastName}`,
      );
      expect(names.some((n: string) => n.includes('Vries'))).toBe(true);
    });

    it('can filter by type COMPANY', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .query({ type: 'COMPANY' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Org1 has 2 COMPANY contacts: Bouwbedrijf De Vries BV, Vastgoed Partners BV
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);
      for (const contact of res.body.data.data) {
        expect(contact.type).toBe('COMPANY');
      }
    });

    it('WERKVOORBEREIDER can list contacts (read access)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1WerkvoorbereiderToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(3);
    });

    it('INSPECTEUR gets 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1InspecteurToken}`)
        .expect(403);
    });

    it('does not show other org contacts', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Org2 has only 1 seeded contact
      const contacts = res.body.data.data;
      expect(contacts.length).toBeGreaterThanOrEqual(1);

      // None of the org1 contacts should appear
      const companyNames = contacts.map((c: any) => c.companyName).filter(Boolean);
      expect(companyNames).not.toContain('Bouwbedrijf De Vries BV');
      expect(companyNames).not.toContain('Vastgoed Partners BV');
    });
  });

  // ─── POST /contacts ─────────────────────────────────────

  describe('POST /api/v1/contacts', () => {
    it('ORG_ADMIN can create a company contact', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          type: 'COMPANY',
          companyName: 'E2E Test Bedrijf BV',
          email: 'e2e@testbedrijf-new.nl',
          phone: '+31 20 999 0000',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('COMPANY');
      expect(res.body.data.companyName).toBe('E2E Test Bedrijf BV');
      expect(res.body.data.email).toBe('e2e@testbedrijf-new.nl');
      expect(res.body.data.id).toBeDefined();

      createdContactIds.push(res.body.data.id);
    });

    it('BACKOFFICE can create an individual contact', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1BackofficeToken}`)
        .send({
          type: 'INDIVIDUAL',
          firstName: 'E2E',
          lastName: 'Persoon',
          email: 'e2e-persoon@test.nl',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('INDIVIDUAL');
      expect(res.body.data.firstName).toBe('E2E');
      expect(res.body.data.lastName).toBe('Persoon');

      createdContactIds.push(res.body.data.id);
    });

    it('WERKVOORBEREIDER gets 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1WerkvoorbereiderToken}`)
        .send({
          type: 'COMPANY',
          companyName: 'Should Not Create',
        })
        .expect(403);
    });

    it('INSPECTEUR gets 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1InspecteurToken}`)
        .send({
          type: 'COMPANY',
          companyName: 'Should Not Create',
        })
        .expect(403);
    });
  });

  // ─── GET /contacts/:id ──────────────────────────────────

  describe('GET /api/v1/contacts/:id', () => {
    it('returns contact with addresses, locations, logs', async () => {
      // Find the Bouwbedrijf De Vries BV contact (has addresses, locations, logs)
      const contact = await prisma.contact.findFirst({
        where: { companyName: 'Bouwbedrijf De Vries BV' },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/contacts/${contact!.id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.companyName).toBe('Bouwbedrijf De Vries BV');

      // Verify nested resources are included
      expect(Array.isArray(res.body.data.addresses)).toBe(true);
      expect(res.body.data.addresses.length).toBeGreaterThanOrEqual(2);

      expect(Array.isArray(res.body.data.locations)).toBe(true);
      expect(res.body.data.locations.length).toBeGreaterThanOrEqual(3);

      expect(Array.isArray(res.body.data.logs)).toBe(true);
      expect(res.body.data.logs.length).toBeGreaterThanOrEqual(3);

      // Logs should include user info
      expect(res.body.data.logs[0].user).toBeDefined();
      expect(res.body.data.logs[0].user.firstName).toBeDefined();
    });

    it('returns 404 for non-existent contact', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/api/v1/contacts/${fakeId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(404);
    });

    it('returns 403 for other org contact', async () => {
      // Org1 admin tries to access org2 contact
      await request(app.getHttpServer())
        .get(`/api/v1/contacts/${org2ContactId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(403);
    });
  });

  // ─── PATCH /contacts/:id ────────────────────────────────

  describe('PATCH /api/v1/contacts/:id', () => {
    it('ORG_ADMIN can update contact', async () => {
      // Create a contact to update
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          type: 'COMPANY',
          companyName: 'Temp Update BV',
        })
        .expect(201);

      const contactId = createRes.body.data.id;
      createdContactIds.push(contactId);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/contacts/${contactId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          companyName: 'Updated Bedrijf BV',
          phone: '+31 20 111 2222',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.companyName).toBe('Updated Bedrijf BV');
      expect(res.body.data.phone).toBe('+31 20 111 2222');
    });
  });

  // ─── DELETE /contacts/:id ───────────────────────────────

  describe('DELETE /api/v1/contacts/:id', () => {
    let softDeleteContactId: string;

    beforeAll(async () => {
      // Create a contact specifically for deletion tests
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          type: 'COMPANY',
          companyName: 'Te Verwijderen BV',
        });

      softDeleteContactId = createRes.body.data.id;
      createdContactIds.push(softDeleteContactId);
    });

    it('ORG_ADMIN can soft-delete contact', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/contacts/${softDeleteContactId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Verify in DB that isDeleted is true
      const contact = await prisma.contact.findUnique({
        where: { id: softDeleteContactId },
      });
      expect(contact!.isDeleted).toBe(true);
    });

    it('soft-deleted contact not returned in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts')
        .query({ search: 'Te Verwijderen' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const found = res.body.data.data.find(
        (c: any) => c.id === softDeleteContactId,
      );
      expect(found).toBeUndefined();
    });
  });

  // ─── Nested resources ───────────────────────────────────

  describe('Nested resources', () => {
    let nestedContactId: string;

    beforeAll(async () => {
      // Create a fresh contact for nested resource tests
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          type: 'COMPANY',
          companyName: 'Nested Test BV',
          email: 'nested@test.nl',
        });

      nestedContactId = createRes.body.data.id;
      createdContactIds.push(nestedContactId);
    });

    // ─── Addresses ────────────────────────────────────

    it('POST /contacts/:id/addresses adds an address', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/contacts/${nestedContactId}/addresses`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          label: 'Hoofdkantoor',
          street: 'Teststraat',
          houseNumber: '1',
          postalCode: '1000 AA',
          city: 'Amsterdam',
          isPrimary: true,
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.label).toBe('Hoofdkantoor');
      expect(res.body.data.street).toBe('Teststraat');
      expect(res.body.data.houseNumber).toBe('1');
      expect(res.body.data.postalCode).toBe('1000 AA');
      expect(res.body.data.city).toBe('Amsterdam');
      expect(res.body.data.isPrimary).toBe(true);
      expect(res.body.data.country).toBe('NL');

      createdAddressIds.push(res.body.data.id);
    });

    // ─── Locations ────────────────────────────────────

    it('POST /contacts/:id/locations adds a location', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/contacts/${nestedContactId}/locations`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'Testlocatie Amsterdam',
          street: 'Herengracht',
          houseNumber: '200',
          postalCode: '1016 BS',
          city: 'Amsterdam',
          objectType: 'kantoor',
          notes: 'E2E test locatie',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Testlocatie Amsterdam');
      expect(res.body.data.street).toBe('Herengracht');
      expect(res.body.data.objectType).toBe('kantoor');
      expect(res.body.data.id).toBeDefined();

      createdLocationIds.push(res.body.data.id);
    });

    it('GET /contacts/:id/locations returns locations', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/contacts/${nestedContactId}/locations`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].name).toBe('Testlocatie Amsterdam');
    });

    // ─── Logs ─────────────────────────────────────────

    it('POST /contacts/:id/logs adds a log entry', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/contacts/${nestedContactId}/logs`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          type: 'PHONE',
          subject: 'E2E testgesprek',
          body: 'Dit is een testlog vanuit de E2E tests.',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('PHONE');
      expect(res.body.data.subject).toBe('E2E testgesprek');
      expect(res.body.data.body).toBe('Dit is een testlog vanuit de E2E tests.');
      expect(res.body.data.user).toBeDefined();
      expect(res.body.data.user.firstName).toBeDefined();

      createdLogIds.push(res.body.data.id);
    });

    it('GET /contacts/:id/logs returns log entries', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/contacts/${nestedContactId}/logs`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data[0].subject).toBe('E2E testgesprek');
      expect(res.body.data[0].user).toBeDefined();
    });
  });
});
