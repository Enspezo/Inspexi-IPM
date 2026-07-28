import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import { STORAGE_PROVIDER, StorageProvider } from '@/common/services/storage/storage.interface';

/**
 * Upload-security sweep — vervolg op B-507 / WP-B4 (logo & avatar).
 *
 * Dezelfde keten van gaten bestond op meer routes: whitelist op de
 * client-geclaimde `Content-Type`, opslag-/serveertype uit de sleutel-extensie
 * of de claim, en download-routes zonder nosniff/CSP/disposition. Deze suite
 * dekt de vier interessantste routes na de sweep:
 *
 *  - offertesjabloon-afbeeldingen (was: SVG toegestaan + Content-Type uit de
 *    sleutel-extensie + vrije `:key(*)` → stored XSS én cross-org read);
 *  - offerte-bijlagen (was: géén enkele typecontrole, wél publiek serveerbaar);
 *  - documenten (claim ↔ inhoud-kruiscontrole + attachment-headers);
 *  - inspecteur-certificaten (SVG eruit, magic bytes, bytes bepalen serve-type).
 *
 * Net als in upload-security.e2e-spec.ts: helmet draait hier niet, we asserten
 * bewust de route-eigen headers.
 */
describe('Upload security sweep — sjablonen, bijlagen, documenten, certificaten (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageProvider;

  let orgId: string;
  let otherOrgId: string;
  let adminId: string;
  let adminToken: string;
  let contactId: string;
  let quoteId: string;
  let publicQuoteToken: string;
  let templateId: string;

  // Echte magic bytes; genoeg vulling om de 12-byte-ondergrens te halen.
  const pngBuffer = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.from([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]),
  ]);
  const pdfBuffer = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\n', 'ascii');
  const svgBuffer = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50">' +
      '<script type="text/javascript">alert("B507-XSS:"+document.domain)</script></svg>',
    'utf8',
  );
  const htmlBuffer = Buffer.from('<!doctype html><script>alert(document.domain)</script>', 'utf8');

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
      data: { name: 'E2E Upload Sweep', slug: 'e2euploadsweep' },
    });
    orgId = org.id;

    const otherOrg = await prisma.organization.create({
      data: { name: 'E2E Upload Sweep B', slug: 'e2euploadsweepb' },
    });
    otherOrgId = otherOrg.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-upload-sweep-admin@test.nl',
        passwordHash,
        firstName: 'Sweep',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-upload-sweep-admin@test.nl', password: 'TestPass123!' });
    adminToken = login.body.data.accessToken;

    const contact = await prisma.contact.create({
      data: { orgId: org.id, type: 'COMPANY', companyName: 'Sweep BV' },
    });
    contactId = contact.id;

    // VERSTUURD + publicToken zodat de publieke bijlage-route bereikbaar is.
    publicQuoteToken = randomUUID();
    const quote = await prisma.quote.create({
      data: {
        orgId: org.id,
        quoteNumber: 'E2E-SWEEP-0001',
        contactId: contact.id,
        subject: 'Upload sweep offerte',
        status: 'VERSTUURD',
        publicToken: publicQuoteToken,
        createdBy: admin.id,
      },
    });
    quoteId = quote.id;

    const template = await request(app.getHttpServer())
      .post('/api/v1/quote-templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'E2E sweep sjabloon' });
    templateId = template.body.data.id;
  });

  afterAll(async () => {
    try {
      for (const key of uploadedKeys) {
        await storage.delete(key).catch(() => {});
      }
      await prisma.quoteAttachment.deleteMany({ where: { quoteId } });
      await prisma.quote.deleteMany({ where: { id: quoteId } });
      await prisma.document.deleteMany({ where: { orgId } });
      await prisma.inspectorCertificate.deleteMany({ where: { orgId } });
      await prisma.quoteTemplate.deleteMany({ where: { id: templateId } });
      await prisma.notification.deleteMany({ where: { userId: adminId } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: [orgId, otherOrgId] } } });
      await prisma.refreshToken.deleteMany({ where: { userId: adminId } });
      await prisma.user.deleteMany({ where: { id: adminId } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgId, otherOrgId] } } });
    } finally {
      await app.close();
    }
  });

  // ─── Offertesjabloon-afbeeldingen ─────────────────────────────────

  describe('POST /quote-templates/:id/images', () => {
    it('accepteert een echte PNG en bouwt de sleutel server-side (.png, geen originalname)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quote-templates/${templateId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, { filename: 'evil.svg', contentType: 'image/png' })
        .expect(201);

      const key: string = res.body.data.storageKey;
      uploadedKeys.push(key);
      expect(key).toMatch(
        new RegExp(`^${orgId}/qt/${templateId}/img/[0-9a-f-]{36}\\.png$`),
      );
      expect(key).not.toContain('svg');
    });

    it('weigert image/svg+xml al op de whitelist (400)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quote-templates/${templateId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', svgBuffer, { filename: 'logo.svg', contentType: 'image/svg+xml' })
        .expect(400);

      expect(res.body.message).toMatch(/Alleen PNG, JPEG en WebP/);
    });

    it('weigert een SVG met script die image/png claimt (400)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/quote-templates/${templateId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', svgBuffer, { filename: 'logo.png', contentType: 'image/png' })
        .expect(400);
    });
  });

  describe('GET /quote-templates/:id/images/:key', () => {
    it('serveert een echte PNG inline met nosniff + sandbox-CSP', async () => {
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/quote-templates/${templateId}/images`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pngBuffer, { filename: 'plaatje.png', contentType: 'image/png' })
        .expect(201);
      const key: string = upload.body.data.storageKey;
      uploadedKeys.push(key);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/quote-templates/${templateId}/images/${key}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(res.headers['content-disposition']).toBe(
        'inline; filename="sjabloonafbeelding.png"',
      );
    });

    it('serveert een legacy .svg-sleutel nooit als image/svg+xml', async () => {
      // Simuleer een rij van vóór deze fix: SVG-bytes onder een .svg-sleutel
      // binnen het eigen qt-prefix.
      const legacyKey = `${orgId}/qt/${templateId}/img/legacy-${Date.now()}.svg`;
      await storage.upload(legacyKey, svgBuffer, 'image/svg+xml');
      uploadedKeys.push(legacyKey);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/quote-templates/${templateId}/images/${legacyKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).not.toContain('svg');
      expect(res.headers['content-type']).toContain('application/octet-stream');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it("leest nooit een sleutel buiten het eigen org-'qt'-prefix (404, geen cross-org read)", async () => {
      // Plant een bestand in het qt-prefix van een ándere organisatie; vóór
      // deze fix serveerde de vrije `:key(*)`-route dit gewoon terug.
      const foreignKey = `${otherOrgId}/qt/${randomUUID()}/img/secret.png`;
      await storage.upload(foreignKey, pngBuffer, 'image/png');
      uploadedKeys.push(foreignKey);

      await request(app.getHttpServer())
        .get(`/api/v1/quote-templates/${templateId}/images/${foreignKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      // Ook een sleutel buiten élk qt-prefix (bv. een documenten-sleutel) → 404.
      const nonQtKey = `${orgId}/${randomUUID()}-document.pdf`;
      await storage.upload(nonQtKey, pdfBuffer, 'application/pdf');
      uploadedKeys.push(nonQtKey);

      await request(app.getHttpServer())
        .get(`/api/v1/quote-templates/${templateId}/images/${nonQtKey}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  // ─── Offerte-bijlagen (had géén typecontrole) ─────────────────────

  describe('POST /quotes/:id/attachments', () => {
    it('weigert een type buiten de whitelist (was: alles toegestaan)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${quoteId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', htmlBuffer, { filename: 'evil.html', contentType: 'text/html' })
        .expect(400);

      expect(res.body.message).toMatch(/Bestandstype niet toegestaan/);
    });

    it('weigert HTML die application/pdf claimt (claim ↔ inhoud)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${quoteId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', htmlBuffer, { filename: 'nep.pdf', contentType: 'application/pdf' })
        .expect(400);

      expect(res.body.message).toMatch(/geen geldige PDF/);
    });

    it('accepteert een echte PDF en serveert hem (ook publiek) met attachment + nosniff + sandbox', async () => {
      const upload = await request(app.getHttpServer())
        .post(`/api/v1/quotes/${quoteId}/attachments`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', pdfBuffer, { filename: 'voorwaarden.pdf', contentType: 'application/pdf' })
        .expect(201);
      const attachmentId: string = upload.body.data.id;
      uploadedKeys.push(upload.body.data.storageKey);

      const staff = await request(app.getHttpServer())
        .get(`/api/v1/quotes/${quoteId}/attachments/${attachmentId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(staff.headers['content-type']).toContain('application/pdf');
      expect(staff.headers['content-disposition']).toBe('attachment; filename="voorwaarden.pdf"');
      expect(staff.headers['x-content-type-options']).toBe('nosniff');
      expect(staff.headers['content-security-policy']).toBe("default-src 'none'; sandbox");

      const publicRes = await request(app.getHttpServer())
        .get(`/api/v1/public/quotes/${publicQuoteToken}/attachments/${attachmentId}/download`)
        .expect(200);
      expect(publicRes.headers['content-disposition']).toContain('attachment');
      expect(publicRes.headers['x-content-type-options']).toBe('nosniff');
      expect(publicRes.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    });
  });

  // ─── Documenten ───────────────────────────────────────────────────

  describe('POST /documents + GET /documents/:id/download', () => {
    it('weigert HTML die image/png claimt (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .attach('file', htmlBuffer, { filename: 'nep.png', contentType: 'image/png' })
        .expect(400);
    });

    it('weigert HTML die application/pdf claimt (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .attach('file', htmlBuffer, { filename: 'nep.pdf', contentType: 'application/pdf' })
        .expect(400);
    });

    it('accepteert een echte PDF en downloadt met attachment + nosniff + sandbox', async () => {
      const upload = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .attach('file', pdfBuffer, { filename: 'rapport 2026.pdf', contentType: 'application/pdf' })
        .expect(201);
      const docId: string = upload.body.data.id;
      uploadedKeys.push(upload.body.data.storageKey);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="rapport 2026.pdf"');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
      expect(res.headers['cache-control']).toContain('no-store');
    });

    it('een SVG-document blijft toegestaan maar wordt alleen als attachment geserveerd', async () => {
      const upload = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .attach('file', svgBuffer, { filename: 'schema.svg', contentType: 'image/svg+xml' })
        .expect(201);
      const docId: string = upload.body.data.id;
      uploadedKeys.push(upload.body.data.storageKey);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}/download`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Nooit inline renderbaar op het origin: attachment + nosniff + sandbox.
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    });
  });

  // ─── Inspecteur-certificaten ──────────────────────────────────────

  describe('POST /inspector-certificates + GET /inspector-certificates/:id/document', () => {
    const dtoFields = (req: request.Test) =>
      req
        .field('userId', adminId)
        .field('type', 'VCA-VOL')
        .field('issueDate', '2026-01-15')
        .field('issuer', 'E2E Instituut');

    it('weigert image/svg+xml al op de whitelist (422)', async () => {
      await dtoFields(
        request(app.getHttpServer())
          .post('/api/v1/inspector-certificates')
          .set('Authorization', `Bearer ${adminToken}`),
      )
        .attach('file', svgBuffer, { filename: 'diploma.svg', contentType: 'image/svg+xml' })
        .expect(422);
    });

    it('weigert HTML die application/pdf claimt (400)', async () => {
      await dtoFields(
        request(app.getHttpServer())
          .post('/api/v1/inspector-certificates')
          .set('Authorization', `Bearer ${adminToken}`),
      )
        .attach('file', htmlBuffer, { filename: 'diploma.pdf', contentType: 'application/pdf' })
        .expect(400);
    });

    it('accepteert een echte PDF (.pdf-sleutel) en serveert de bytes-gedetecteerde Content-Type', async () => {
      const created = await dtoFields(
        request(app.getHttpServer())
          .post('/api/v1/inspector-certificates')
          .set('Authorization', `Bearer ${adminToken}`),
      )
        .attach('file', pdfBuffer, { filename: 'diploma.pdf', contentType: 'application/pdf' })
        .expect(201);

      const certId: string = created.body.data.id;
      const cert = await prisma.inspectorCertificate.findUnique({ where: { id: certId } });
      expect(cert?.storageKey).toMatch(/\.pdf$/);
      expect(cert?.storageKey).not.toContain('diploma');
      uploadedKeys.push(cert!.storageKey!);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspector-certificates/${certId}/document`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('application/pdf');
      expect(res.headers['content-disposition']).toBe('attachment; filename="diploma.pdf"');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-security-policy']).toBe("default-src 'none'; sandbox");
    });

    it('serveert een legacy rij met SVG-inhoud nooit als image/svg+xml', async () => {
      // Simuleer een rij van vóór deze fix: SVG-bytes + image/svg+xml-mimeType.
      const legacyKey = `${orgId}/inspector-certificates/${adminId}/legacy-${Date.now()}.svg`;
      await storage.upload(legacyKey, svgBuffer, 'image/svg+xml');
      uploadedKeys.push(legacyKey);
      const legacy = await prisma.inspectorCertificate.create({
        data: {
          orgId,
          userId: adminId,
          type: 'Legacy',
          issueDate: new Date('2025-01-01'),
          issuer: 'E2E Instituut',
          storageKey: legacyKey,
          fileName: 'legacy.svg',
          originalName: 'legacy.svg',
          mimeType: 'image/svg+xml',
          size: svgBuffer.length,
        },
      });

      const res = await request(app.getHttpServer())
        .get(`/api/v1/inspector-certificates/${legacy.id}/document`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(res.headers['content-type']).not.toContain('svg');
      expect(res.headers['content-type']).toContain('application/octet-stream');
      expect(res.headers['content-disposition']).toContain('attachment');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });
});
