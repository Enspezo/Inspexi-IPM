import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER, StorageProvider } from '@/common/services/storage/storage.interface';

/**
 * Upload-security voor organisatielogo en eigen avatar (B-507 / WP-B4).
 *
 * De bevinding was een keten van drie gaten: de whitelist keek naar de door de
 * client meegestuurde `Content-Type`, de opslagextensie kwam uit de bestandsnaam
 * (en bepaalde daarmee het Content-Type bij het downloaden), en de download-route
 * zette geen nosniff/CSP/disposition. Deze suite dekt alle drie.
 *
 * Let op: helmet zit in `main.ts` en draait dus NIET in deze e2e-opzet — hier
 * asserten we bewust alleen de route-eigen headers, die het echte vangnet zijn.
 */
describe('Upload security — logo & avatar (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageProvider;

  let orgId: string;
  let adminId: string;
  let adminToken: string;

  // Echte magic bytes; genoeg vulling om de 12-byte-ondergrens te halen.
  const pngBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  ]);
  const webpBuffer = Buffer.concat([
    Buffer.from('RIFF', 'ascii'),
    Buffer.from([0x24, 0x00, 0x00, 0x00]),
    Buffer.from('WEBPVP8 ', 'ascii'),
  ]);
  const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\n', 'ascii');
  const svgBuffer = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
      '<script type="text/javascript">alert("B507-XSS:"+document.domain)</script></svg>',
    'utf8',
  );

  const uploadedKeys: string[] = [];

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
    storage = app.get<StorageProvider>(STORAGE_PROVIDER);

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const org = await prisma.organization.create({
      data: { name: 'E2E Upload Security', slug: 'e2euploadsec' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-upload-admin@test.nl',
        passwordHash,
        firstName: 'Upload',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-upload-admin@test.nl', password: 'TestPass123!' });
    adminToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      for (const key of uploadedKeys) {
        await storage.delete(key).catch(() => {});
      }
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId: adminId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  // ─── Upload-matrix: organisatielogo ───────────────────────────────

  describe('POST /organizations/:id/logo', () => {
    it('accepteert een echte PNG en slaat hem op met een .png-sleutel', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, { filename: 'logo.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body.success).toBe(true);
      const key: string = res.body.data.storageKey;
      uploadedKeys.push(key);
      expect(key).toMatch(/^logos\/.+\.png$/);

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(org?.logoUrl).toBe(key);
    });

    it('accepteert een echte WebP', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', webpBuffer, { filename: 'logo.webp', contentType: 'image/webp' })
        .expect(201);

      uploadedKeys.push(res.body.data.storageKey);
      expect(res.body.data.storageKey).toMatch(/\.webp$/);
    });

    it('weigert een %PDF-buffer die image/png claimt (400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pdfBuffer, { filename: 'logo.png', contentType: 'image/png' })
        .expect(400);

      expect(res.body.message).toMatch(/geen geldige PNG-, JPEG- of WebP-afbeelding/);
    });

    it('weigert een SVG met script die image/png claimt (400) — geen .svg in de opslag', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', svgBuffer, { filename: 'evil.svg', contentType: 'image/png' })
        .expect(400);

      const org = await prisma.organization.findUnique({ where: { id: orgId } });
      expect(org?.logoUrl).not.toMatch(/\.svg$/);
    });

    it('weigert image/svg+xml al op de whitelist (400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', svgBuffer, { filename: 'logo.svg', contentType: 'image/svg+xml' })
        .expect(400);

      expect(res.body.message).toMatch(/Alleen PNG, JPEG en WebP/);
    });

    it('negeert de bestandsnaam: een echte PNG met naam evil.svg wordt .png', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, { filename: 'evil.svg', contentType: 'image/png' })
        .expect(201);

      const key: string = res.body.data.storageKey;
      uploadedKeys.push(key);
      expect(key).toMatch(/\.png$/);
      expect(key).not.toMatch(/svg/);
    });
  });

  // ─── Download-headers: organisatielogo (publieke route) ───────────

  describe('GET /organizations/:id/logo', () => {
    it('serveert het logo met nosniff, sandbox-CSP en een vaste disposition', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/logo`)
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(res.headers['content-disposition']).toBe('inline; filename="logo.png"');
      expect(res.headers['etag']).toBeDefined();
      // Niet meer 24 uur onbeperkt cachen op een URL die nooit verandert.
      expect(res.headers['cache-control']).toContain('must-revalidate');
      expect(res.headers['cache-control']).not.toContain('86400');
    });

    it('verandert de ETag zodra het logo vervangen wordt', async () => {
      const before = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/logo`)
        .expect(200);

      const upload = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', webpBuffer, { filename: 'nieuw.webp', contentType: 'image/webp' })
        .expect(201);
      uploadedKeys.push(upload.body.data.storageKey);

      const after = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/logo`)
        .expect(200);

      expect(after.headers['etag']).not.toBe(before.headers['etag']);
      expect(after.headers['content-type']).toContain('image/webp');
    });

    it('serveert een legacy .svg-sleutel nooit als image/svg+xml', async () => {
      // Simuleer een rij van vóór deze fix: SVG-bytes onder een .svg-sleutel.
      const legacyKey = `logos/${orgId}/legacy-${Date.now()}.svg`;
      await storage.upload(legacyKey, svgBuffer, 'image/svg+xml');
      uploadedKeys.push(legacyKey);
      await prisma.organization.update({
        where: { id: orgId },
        data: { logoUrl: legacyKey },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/logo`)
        .expect(200);

      expect(res.headers['content-type']).not.toContain('svg');
      expect(res.headers['content-type']).toContain('application/octet-stream');
      expect(res.headers['content-disposition']).toBe('attachment; filename="logo.bin"');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    });

    it('geeft 404 zodra het logo verwijderd is', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/organizations/${orgId}/logo`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/api/v1/organizations/${orgId}/logo`)
        .expect(404);
    });
  });

  // ─── Avatar (zelfde behandeling) ──────────────────────────────────

  describe('POST /users/me/avatar', () => {
    it('accepteert een echte PNG en slaat hem op met een .png-sleutel', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, { filename: 'ik.png', contentType: 'image/png' })
        .expect(201);

      const key: string = res.body.data.storageKey;
      uploadedKeys.push(key);
      expect(key).toMatch(/^avatars\/.+\.png$/);
    });

    it('weigert een %PDF-buffer die image/png claimt (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pdfBuffer, { filename: 'ik.png', contentType: 'image/png' })
        .expect(400);
    });

    it('weigert een SVG die image/png claimt (400) — geen .svg in de opslag', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', svgBuffer, { filename: 'evil.svg', contentType: 'image/png' })
        .expect(400);

      const user = await prisma.user.findUnique({ where: { id: adminId } });
      expect(user?.avatarUrl).not.toMatch(/\.svg$/);
    });

    it('negeert de bestandsnaam: een echte PNG met naam evil.svg wordt .png', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, { filename: 'evil.svg', contentType: 'image/png' })
        .expect(201);

      uploadedKeys.push(res.body.data.storageKey);
      expect(res.body.data.storageKey).toMatch(/\.png$/);
    });
  });

  describe('GET /users/me/avatar', () => {
    it('serveert de avatar met nosniff, sandbox-CSP en een vaste disposition', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users/me/avatar')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(res.headers['content-disposition']).toBe('inline; filename="avatar.png"');
      expect(res.headers['cache-control']).toContain('private');
      expect(res.headers['etag']).toBeDefined();
    });
  });
});
