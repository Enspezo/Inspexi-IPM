import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Document Tags (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let userId: string;
  let contactId: string;
  let foreignOrgId: string;
  let foreignTagId: string;
  let accessToken: string;

  const createdTagIds: string[] = [];
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

    const org = await prisma.organization.create({
      data: { name: 'E2E DocTags Org', slug: 'e2edoctags' },
    });
    orgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-doctags@test.nl',
        passwordHash,
        firstName: 'Tag',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E DocTags Contact',
        email: 'e2e-doctags-contact@test.nl',
        ownerId: user.id,
      },
    });
    contactId = contact.id;

    // Foreign org + tag to assert cross-tenant rejection
    const foreignOrg = await prisma.organization.create({
      data: { name: 'E2E DocTags Foreign Org', slug: 'e2edoctagsforeign' },
    });
    foreignOrgId = foreignOrg.id;
    const foreignTag = await prisma.documentTag.create({
      data: { orgId: foreignOrg.id, name: 'Foreign Tag', color: '#FF0000' },
    });
    foreignTagId = foreignTag.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-doctags@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.documentTagAssignment.deleteMany({
        where: { orgId: { in: [orgId, foreignOrgId] } },
      });
      await prisma.document.deleteMany({
        where: { id: { in: createdDocumentIds } },
      });
      await prisma.documentTag.deleteMany({
        where: { orgId: { in: [orgId, foreignOrgId] } },
      });
      await prisma.auditLog.deleteMany({ where: { userId } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.organization.deleteMany({
        where: { id: { in: [orgId, foreignOrgId] } },
      });
    } finally {
      await app.close();
    }
  });

  describe('CRUD /api/v1/document-tags', () => {
    it('creates a tag with a valid hex color', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/document-tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Contract', color: '#3B82F6' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Contract');
      expect(res.body.data.color).toBe('#3B82F6');
      createdTagIds.push(res.body.data.id);
    });

    it('rejects an invalid hex color (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/document-tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Bad', color: 'rood' })
        .expect(400);
    });

    it('rejects a duplicate name within the org (409)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/document-tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Contract', color: '#000000' })
        .expect(409);
    });

    it('lists tags (paginated)', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/document-tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.total).toBeGreaterThanOrEqual(1);
    });

    it('returns a compact list for pickers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/document-tags/compact')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data[0]).toHaveProperty('color');
    });

    it('updates a tag', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/document-tags/${createdTagIds[0]}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ color: '#10B981' })
        .expect(200);

      expect(res.body.data.color).toBe('#10B981');
    });
  });

  describe('Assignment + filtering', () => {
    let docId: string;

    it('uploads a document with a tag and returns the tag', async () => {
      const tagId = createdTagIds[0];
      const res = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .field('tagIds', tagId)
        .attach('file', Buffer.from('tagged'), 'tagged.pdf')
        .expect(201);

      docId = res.body.data.id;
      createdDocumentIds.push(docId);
      expect(res.body.data.tags).toHaveLength(1);
      expect(res.body.data.tags[0].id).toBe(tagId);
    });

    it('rejects assigning a foreign-org tag on upload (cross-tenant, 403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .field('tagIds', foreignTagId)
        .attach('file', Buffer.from('hack'), 'hack.pdf')
        .expect(403);
    });

    it('replaces the tag-set via PATCH /documents/:id', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [] })
        .expect(200);

      expect(res.body.data.tags).toHaveLength(0);
    });

    it('rejects a foreign-org tag via PATCH (cross-tenant, 403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [foreignTagId] })
        .expect(403);
    });

    it('filters documents by tagId', async () => {
      const tagId = createdTagIds[0];
      // Re-assign the tag so the document matches the filter
      await request(app.getHttpServer())
        .patch(`/api/v1/documents/${docId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ tagIds: [tagId] })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/documents?tagId=${tagId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.data.data.length).toBeGreaterThanOrEqual(1);
      expect(
        res.body.data.data.every((d: { tags: { id: string }[] }) =>
          d.tags.some((t) => t.id === tagId),
        ),
      ).toBe(true);
    });
  });

  describe('Soft-delete', () => {
    it('soft-deletes a tag and removes it from documents', async () => {
      // Create + assign a throwaway tag
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/document-tags')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Tijdelijk', color: '#6B7280' })
        .expect(201);
      const tempTagId = createRes.body.data.id;

      const uploadRes = await request(app.getHttpServer())
        .post('/api/v1/documents')
        .set('Authorization', `Bearer ${accessToken}`)
        .field('entityType', 'CONTACT')
        .field('entityId', contactId)
        .field('tagIds', tempTagId)
        .attach('file', Buffer.from('temp'), 'temp.pdf')
        .expect(201);
      const tempDocId = uploadRes.body.data.id;
      createdDocumentIds.push(tempDocId);

      await request(app.getHttpServer())
        .delete(`/api/v1/document-tags/${tempTagId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Tag gone from the list
      await request(app.getHttpServer())
        .get(`/api/v1/document-tags/${tempTagId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);

      // Document still exists, without the deleted tag
      const docRes = await request(app.getHttpServer())
        .get(`/api/v1/documents/${tempDocId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(docRes.body.data.tags).toHaveLength(0);
    });
  });
});
