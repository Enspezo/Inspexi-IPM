import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Documents (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testLocationId: string;
  let foreignOrgId: string;
  let foreignContactId: string;
  let foreignLocationId: string;
  let accessToken: string;
  const createdDocumentIds: string[] = [];

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

    // Create test org
    const org = await prisma.organization.create({
      data: { name: 'E2E Documents Org', slug: 'e2edocorg' },
    });
    testOrgId = org.id;

    // Create test user
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-docs@test.nl',
        passwordHash,
        firstName: 'Doc',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Create test contact (for document entity association)
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Doc Test Contact',
        email: 'e2e-doc-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Create test location (own org) for LOCATION document linking
    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E Magazijn Noord',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1234AB',
        city: 'Teststad',
      },
    });
    testLocationId = location.id;

    // Create a foreign org + location to assert cross-tenant isolation
    const foreignOrg = await prisma.organization.create({
      data: { name: 'E2E Documents Foreign Org', slug: 'e2edocforeign' },
    });
    foreignOrgId = foreignOrg.id;
    const foreignContact = await prisma.contact.create({
      data: {
        orgId: foreignOrg.id,
        type: 'COMPANY',
        companyName: 'E2E Foreign Contact',
        email: 'e2e-doc-foreign@test.nl',
      },
    });
    foreignContactId = foreignContact.id;
    const foreignLocation = await prisma.location.create({
      data: {
        orgId: foreignOrg.id,
        contactId: foreignContact.id,
        name: 'E2E Foreign Location',
        street: 'Buitenweg',
        houseNumber: '9',
        postalCode: '9999ZZ',
        city: 'Verweg',
      },
    });
    foreignLocationId = foreignLocation.id;

    // Login to get access token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-docs@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    // Cleanup in dependency order
    await prisma.document.deleteMany({
      where: { id: { in: createdDocumentIds } },
    });
    await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
    await prisma.location.deleteMany({
      where: { id: { in: [testLocationId, foreignLocationId] } },
    });
    await prisma.contact.deleteMany({
      where: { id: { in: [testContactId, foreignContactId] } },
    });
    await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
    await prisma.user.deleteMany({ where: { id: testUserId } });
    await prisma.organization.deleteMany({
      where: { id: { in: [testOrgId, foreignOrgId] } },
    });
    await app.close();
  });

  describe('POST /api/v1/documents', () => {
    it('should upload a document', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', testContactId)
        .field('description', 'Test document upload')
        .attach('file', Buffer.from('test content'), 'test.pdf')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.originalName).toBe('test.pdf');
      expect(res.body.data.description).toBe('Test document upload');
      createdDocumentIds.push(res.body.data.id);
    });

    it('should return 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .field('entityType', 'CONTACT')
        .field('entityId', testContactId)
        .attach('file', Buffer.from('test'), 'test.pdf')
        .expect(401);
    });

    it('should return 400 for missing required fields', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('test'), 'test.pdf')
        .expect(400);
    });

    it('should upload a document linked to a LOCATION', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'LOCATION')
        .field('entityId', testLocationId)
        .field('description', 'Plattegrond')
        .attach('file', Buffer.from('floorplan'), 'plattegrond.pdf')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.entityType).toBe('LOCATION');
      expect(res.body.data.entityId).toBe(testLocationId);
      expect(res.body.data.entityName).toBe('E2E Magazijn Noord');
      createdDocumentIds.push(res.body.data.id);
    });

    it('should reject linking a document to another org location (cross-tenant)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'LOCATION')
        .field('entityId', foreignLocationId)
        .attach('file', Buffer.from('hack'), 'hack.pdf')
        .expect(403);
    });
  });

  describe('GET /api/v1/documents (LOCATION)', () => {
    it('should list LOCATION documents with the location name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .query({ entityType: 'LOCATION', entityId: testLocationId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const docs = res.body.data.data;
      expect(docs.length).toBeGreaterThan(0);
      for (const doc of docs) {
        expect(doc.entityType).toBe('LOCATION');
        expect(doc.entityId).toBe(testLocationId);
        expect(doc.entityName).toBe('E2E Magazijn Noord');
      }
    });
  });

  describe('GET /api/v1/documents', () => {
    it('should list documents', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.data).toBeDefined();
      expect(Array.isArray(res.body.data.data)).toBe(true);
      expect(res.body.data.total).toBeDefined();
    });

    it('should filter documents by entityType and entityId', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .query({ entityType: 'CONTACT', entityId: testContactId })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      const docs = res.body.data.data;
      for (const doc of docs) {
        expect(doc.entityType).toBe('CONTACT');
        expect(doc.entityId).toBe(testContactId);
      }
    });

    it('should filter by onlyMine', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .query({ onlyMine: 'true' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('should search by file name', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/documents')
        .query({ search: 'test' })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
    });
  });

  describe('GET /api/v1/documents/:id', () => {
    it('should return document metadata', async () => {
      const docId = createdDocumentIds[0];
      if (!docId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(docId);
      expect(res.body.data.uploadedBy).toBeDefined();
    });

    it('should return 404 for non-existent document', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/documents/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('GET /api/v1/documents/:id/download', () => {
    it('should download document content', async () => {
      const docId = createdDocumentIds[0];
      if (!docId) return;

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}/download`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  describe('PATCH /api/v1/documents/:id', () => {
    it('should update document description', async () => {
      const docId = createdDocumentIds[0];
      if (!docId) return;

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ description: 'Updated description' })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.description).toBe('Updated description');
    });
  });

  describe('DELETE /api/v1/documents/:id', () => {
    it('should soft-delete a document', async () => {
      // Upload a fresh document to delete
      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', testContactId)
        .attach('file', Buffer.from('delete me'), 'delete-test.pdf');

      const docId = uploadRes.body.data.id;
      createdDocumentIds.push(docId);

      await request(app.getHttpServer())
        .delete(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Verify it's gone from listing
      await request(app.getHttpServer())
        .get(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
