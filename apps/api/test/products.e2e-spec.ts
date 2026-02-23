import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Products API (e2e)
 *
 * Runs against the real seeded database.
 * Seed users used:
 *   - admin@inspexi-demo.nl   (ORG_ADMIN, org1 = InspeXi Demo)
 *   - manager@inspexi-demo.nl (MANAGER, org1)
 *   - admin@testbedrijf.nl    (ORG_ADMIN, org2 = Test Bedrijf)
 *
 * Seed products:
 *   org1: 6 products (NEN1010, NEN3140, Thermografisch, Rapportage, Reiskosten, Spoedtoeslag)
 *   org2: 2 products (Basisinspectie, Uitgebreide inspectie)
 */
describe('Products API (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens per role
  let org1AdminToken: string;
  let org1ManagerToken: string;
  let org2AdminToken: string;

  // IDs of resources created during tests (for cleanup)
  const createdProductIds: string[] = [];

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
  });

  afterAll(async () => {
    // Clean up resources created during tests
    if (createdProductIds.length > 0) {
      // Delete any price table items that reference our test products
      await prisma.priceTableItem.deleteMany({
        where: { productId: { in: createdProductIds } },
      });
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      });
    }

    await app.close();
  });

  // ─── GET /products ──────────────────────────────────────

  describe('GET /api/v1/products', () => {
    it('ORG_ADMIN can list products of own org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      // Org1 has 6 seeded products
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(6);

      // All returned products belong to org1
      const org1Id = res.body.data.data[0].orgId;
      for (const product of res.body.data.data) {
        expect(product.orgId).toBe(org1Id);
      }
    });

    it('search by name works (search=NEN)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ search: 'NEN' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);
      const names = res.body.data.data.map((p: any) => p.name);
      expect(names.some((n: string) => n.includes('NEN'))).toBe(true);
    });

    it('filter by isActive works', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ isActive: 'true' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      for (const product of res.body.data.data) {
        expect(product.isActive).toBe(true);
      }
    });

    it('filter by category works (category=inspectie)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .query({ category: 'inspectie' })
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Org1 has 3 inspectie products: NEN1010, NEN3140, Thermografisch
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(3);
      for (const product of res.body.data.data) {
        expect(product.category).toBe('inspectie');
      }
    });

    it('MANAGER can list products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data.length).toBeGreaterThan(0);
    });

    it('cross-org: ORG_ADMIN from org2 only sees own products', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${org2AdminToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      // Org2 has 2 seeded products
      const products = res.body.data.data;
      expect(products.length).toBeGreaterThanOrEqual(2);

      // None of the org1 products should appear
      const names = products.map((p: any) => p.name);
      expect(names).not.toContain('NEN1010 Inspectie');
      expect(names).not.toContain('NEN3140 Inspectie');
      expect(names).not.toContain('Spoedtoeslag');
    });
  });

  // ─── POST /products ─────────────────────────────────────

  describe('POST /api/v1/products', () => {
    it('ORG_ADMIN can create a product', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'E2E Test Product',
          unit: 'uur',
          description: 'Product aangemaakt door E2E test',
          category: 'test',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('E2E Test Product');
      expect(res.body.data.unit).toBe('uur');
      expect(res.body.data.description).toBe('Product aangemaakt door E2E test');
      expect(res.body.data.category).toBe('test');
      expect(res.body.data.isActive).toBe(true);
      expect(res.body.data.defaultVat).toBe(21);
      expect(res.body.data.id).toBeDefined();

      createdProductIds.push(res.body.data.id);
    });

    it('MANAGER gets 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${org1ManagerToken}`)
        .send({
          name: 'Should Not Create',
          unit: 'stuks',
        })
        .expect(403);
    });
  });

  // ─── PATCH /products/:id ────────────────────────────────

  describe('PATCH /api/v1/products/:id', () => {
    it('ORG_ADMIN can update a product', async () => {
      // Create a product to update
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/products')
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'Temp Update Product',
          unit: 'stuks',
        })
        .expect(201);

      const productId = createRes.body.data.id;
      createdProductIds.push(productId);

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/products/${productId}`)
        .set('Authorization', `Bearer ${org1AdminToken}`)
        .send({
          name: 'Updated Product Name',
          description: 'Bijgewerkte omschrijving',
          isActive: false,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Updated Product Name');
      expect(res.body.data.description).toBe('Bijgewerkte omschrijving');
      expect(res.body.data.isActive).toBe(false);
    });
  });
});
