import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Price Tables API (e2e)
 *
 * Runs against the real seeded database.
 * Seed users used:
 *   - admin@inspexi-demo.nl   (ORG_ADMIN, org1 = InspeXi Demo)
 *   - manager@inspexi-demo.nl (MANAGER, org1)
 *   - admin@testbedrijf.nl    (ORG_ADMIN, org2 = Test Bedrijf)
 *
 * Seed price tables:
 *   org1: Standaard (default, 6 items), VIP Klanten (6 items, incl. tiered)
 *   org2: Standaard (default, 2 items)
 *
 * Seed contact assignments:
 *   Bouwbedrijf De Vries BV (org1) -> VIP Klanten
 */
describe('Price Tables API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens per role
  let org1AdminToken: string;
  let org1ManagerToken: string;
  let org2AdminToken: string;

  // IDs we need to look up from seed
  let contact1Id: string; // Bouwbedrijf De Vries BV (has VIP assignment)
  let contact2Id: string; // Pieter Jansen (no assignment, should get default)
  let vipTableId: string; // VIP Klanten table ID
  let org1ProductIds: string[]; // Product IDs for org1

  // IDs of resources created during tests (for cleanup)
  const createdPriceTableIds: string[] = [];
  const createdContactPriceTablePairs: { contactId: string; priceTableId: string }[] = [];

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
    const [org1Admin, org1Manager, org2Admin] = await Promise.all([
      login('admin@inspexi-demo.nl'),
      login('manager@inspexi-demo.nl'),
      login('admin@testbedrijf.nl'),
    ]);

    org1AdminToken = org1Admin.accessToken;
    org1ManagerToken = org1Manager.accessToken;
    org2AdminToken = org2Admin.accessToken;

    // Look up seed data IDs
    const [bouwbedrijf, pieterJansen, vipTable, org1Products] = await Promise.all([
      prisma.contact.findFirst({
        where: { companyName: 'Bouwbedrijf De Vries BV' },
      }),
      prisma.contact.findFirst({
        where: { firstName: 'Pieter', lastName: 'Jansen' },
      }),
      prisma.priceTable.findFirst({
        where: { name: 'VIP Klanten' },
      }),
      prisma.product.findMany({
        where: { organization: { slug: 'inspexi-demo' } },
        orderBy: { name: 'asc' },
      }),
    ]);

    contact1Id = bouwbedrijf!.id;
    contact2Id = pieterJansen!.id;
    vipTableId = vipTable!.id;
    org1ProductIds = org1Products.map((p) => p.id);
  });

  afterAll(async () => {
    // Clean up contact-price-table assignments created during tests
    for (const pair of createdContactPriceTablePairs) {
      await prisma.contactPriceTable.deleteMany({
        where: {
          contactId: pair.contactId,
          priceTableId: pair.priceTableId,
        },
      });
    }

    // Clean up price tables created during tests (delete items + tiers first)
    if (createdPriceTableIds.length > 0) {
      await prisma.priceTier.deleteMany({
        where: { priceTableItem: { priceTableId: { in: createdPriceTableIds } } },
      });
      await prisma.priceTableItem.deleteMany({
        where: { priceTableId: { in: createdPriceTableIds } },
      });
      await prisma.contactPriceTable.deleteMany({
        where: { priceTableId: { in: createdPriceTableIds } },
      });
      await prisma.priceTable.deleteMany({
        where: { id: { in: createdPriceTableIds } },
      });
    }

    await app.close();
  });

  // ─── GET /price-tables ──────────────────────────────────

  describe('GET /api/v1/price-tables', () => {
    it('ORG_ADMIN can list price tables of own org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      // Org1 has 2 seeded price tables: Standaard + VIP Klanten
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);

      const names = res.body.data.data.map((t: any) => t.name);
      expect(names).toContain('Standaard');
      expect(names).toContain('VIP Klanten');
    });

    it('MANAGER gets 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .expect(403);
    });

    it('cross-org: ORG_ADMIN from org2 only sees own price tables', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Org2 has 1 seeded price table
      const tables = res.body.data.data;
      expect(tables.length).toBeGreaterThanOrEqual(1);

      const names = tables.map((t: any) => t.name);
      expect(names).not.toContain('VIP Klanten');
    });
  });

  // ─── POST /price-tables ─────────────────────────────────

  describe('POST /api/v1/price-tables', () => {
    it('ORG_ADMIN can create a price table', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Test Prijstabel',
          description: 'Aangemaakt door E2E test',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Test Prijstabel');
      expect(res.body.data.description).toBe('Aangemaakt door E2E test');
      expect(res.body.data.isDefault).toBe(false);
      expect(res.body.data.id).toBeDefined();

      createdPriceTableIds.push(res.body.data.id);
    });

    it('MANAGER gets 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .send({
          name: 'Should Not Create',
        })
        .expect(403);
    });
  });

  // ─── GET /price-tables/:id ──────────────────────────────

  describe('GET /api/v1/price-tables/:id', () => {
    it('returns detail with items, tiers, and contacts', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/price-tables/${vipTableId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('VIP Klanten');

      // Verify items are included
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBeGreaterThanOrEqual(6);

      // Verify each item has a product object
      for (const item of res.body.data.items) {
        expect(item.product).toBeDefined();
        expect(item.product.name).toBeDefined();
      }

      // Verify the TIERED item has tiers
      const tieredItem = res.body.data.items.find(
        (item: any) => item.priceType === 'TIERED',
      );
      expect(tieredItem).toBeDefined();
      expect(Array.isArray(tieredItem.tiers)).toBe(true);
      expect(tieredItem.tiers.length).toBeGreaterThanOrEqual(3);

      // Verify contacts are included
      expect(Array.isArray(res.body.data.contactPriceTables)).toBe(true);
      expect(res.body.data.contactPriceTables.length).toBeGreaterThanOrEqual(1);
      const linkedContact = res.body.data.contactPriceTables[0].contact;
      expect(linkedContact.companyName).toBe('Bouwbedrijf De Vries BV');
    });
  });

  // ─── PATCH /price-tables/:id ────────────────────────────

  describe('PATCH /api/v1/price-tables/:id', () => {
    it('ORG_ADMIN can update price table name', async () => {
      // Create a table to update
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'Temp Update Tabel',
        })
        .expect(201);

      const tableId = createRes.body.data.id;
      createdPriceTableIds.push(tableId);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/price-tables/${tableId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'Bijgewerkte Tabel',
          description: 'Nieuwe omschrijving',
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Bijgewerkte Tabel');
      expect(res.body.data.description).toBe('Nieuwe omschrijving');
    });
  });

  // ─── PUT /price-tables/:id/items ────────────────────────

  describe('PUT /api/v1/price-tables/:id/items', () => {
    it('sets items with FIXED and TIERED pricing', async () => {
      // Create a table first
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Items Test',
        })
        .expect(201);

      const tableId = createRes.body.data.id;
      createdPriceTableIds.push(tableId);

      // Set items with a mix of FIXED and TIERED
      const res = await request(app.getHttpServer())
        .put(`/api/v1/price-tables/${tableId}/items`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          items: [
            {
              productId: org1ProductIds[0],
              priceType: 'FIXED',
              basePrice: 90.00,
            },
            {
              productId: org1ProductIds[1],
              priceType: 'TIERED',
              tiers: [
                { fromQty: 1, toQty: 5, price: 80.00 },
                { fromQty: 6, toQty: 10, price: 70.00 },
                { fromQty: 11, price: 60.00 },
              ],
            },
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(2);

      // Find the FIXED item
      const fixedItem = res.body.data.items.find(
        (item: any) => item.priceType === 'FIXED',
      );
      expect(fixedItem).toBeDefined();
      expect(fixedItem.basePrice).toBe(90);

      // Find the TIERED item
      const tieredItem = res.body.data.items.find(
        (item: any) => item.priceType === 'TIERED',
      );
      expect(tieredItem).toBeDefined();
      expect(tieredItem.tiers.length).toBe(3);
      expect(tieredItem.tiers[0].price).toBe(80);
      expect(tieredItem.tiers[1].price).toBe(70);
      expect(tieredItem.tiers[2].price).toBe(60);
    });
  });

  // ─── POST/DELETE /price-tables/:id/assign/:contactId ────

  describe('Contact assignment', () => {
    let assignTestTableId: string;

    beforeAll(async () => {
      // Create a table for assignment tests
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/price-tables')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Assign Test',
        });

      assignTestTableId = createRes.body.data.id;
      createdPriceTableIds.push(assignTestTableId);
    });

    it('POST /price-tables/:id/assign/:contactId assigns table to contact', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/price-tables/${assignTestTableId}/assign/${contact2Id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.contact).toBeDefined();
      expect(res.body.data.priceTable).toBeDefined();

      createdContactPriceTablePairs.push({
        contactId: contact2Id,
        priceTableId: assignTestTableId,
      });
    });

    it('DELETE /price-tables/:id/assign/:contactId removes assignment', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/price-tables/${assignTestTableId}/assign/${contact2Id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);

      // Remove from cleanup list since we already deleted it
      const idx = createdContactPriceTablePairs.findIndex(
        (p) => p.contactId === contact2Id && p.priceTableId === assignTestTableId,
      );
      if (idx !== -1) {
        createdContactPriceTablePairs.splice(idx, 1);
      }
    });
  });

  // ─── GET /price-tables/for-contact/:contactId ──────────

  describe('GET /api/v1/price-tables/for-contact/:contactId', () => {
    it('returns VIP table for contact with assignment (Bouwbedrijf De Vries)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/price-tables/for-contact/${contact1Id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      const tableNames = res.body.data.map((t: any) => t.name);
      expect(tableNames).toContain('VIP Klanten');
    });

    it('returns default table for contact without assignment (Pieter Jansen)', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/price-tables/for-contact/${contact2Id}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);

      // Should return the default 'Standaard' table
      const tableNames = res.body.data.map((t: any) => t.name);
      expect(tableNames).toContain('Standaard');
    });
  });
});
