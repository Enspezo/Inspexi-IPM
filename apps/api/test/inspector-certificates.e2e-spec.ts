import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Inspector-certificates (PRD-11) — permission matrix + lifecycle.
 *
 * Runs on 127.0.0.1 (host classified "unknown"), so TenantGuard and FeatureGuard
 * fall open; the service-level canView/canWrite checks are what we assert here.
 */
describe('InspectorCertificates (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let foreignOrgId: string;
  const userIds: string[] = [];
  const createdCertIds: string[] = [];

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};

  const PWD = 'TestPass123!';

  async function makeUser(email: string, roles: string[], org: string) {
    const passwordHash = await bcrypt.hash(PWD, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: 'E2E',
        lastName: email.split('@')[0],
        roles: roles as any,
        orgId: org,
        emailVerifiedAt: new Date(),
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function login(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: PWD });
    return res.body.data.accessToken;
  }

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

    const org = await prisma.organization.create({
      data: { name: 'E2E Cert Org', slug: 'e2ecertorg' },
    });
    orgId = org.id;
    const foreign = await prisma.organization.create({
      data: { name: 'E2E Cert Foreign', slug: 'e2ecertforeign' },
    });
    foreignOrgId = foreign.id;

    ids.admin = await makeUser('e2e-cert-admin@test.nl', ['ORG_ADMIN'], orgId);
    ids.manager = await makeUser('e2e-cert-manager@test.nl', ['MANAGER'], orgId);
    ids.insp1 = await makeUser('e2e-cert-insp1@test.nl', ['INSPECTEUR'], orgId);
    ids.insp2 = await makeUser('e2e-cert-insp2@test.nl', ['INSPECTEUR'], orgId);
    ids.backoffice = await makeUser('e2e-cert-backoffice@test.nl', ['BACKOFFICE'], orgId);
    ids.wvb = await makeUser('e2e-cert-wvb@test.nl', ['WERKVOORBEREIDER'], orgId);
    ids.foreignAdmin = await makeUser('e2e-cert-foreign-admin@test.nl', ['ORG_ADMIN'], foreignOrgId);
    ids.foreignInsp = await makeUser('e2e-cert-foreign-insp@test.nl', ['INSPECTEUR'], foreignOrgId);

    tokens.admin = await login('e2e-cert-admin@test.nl');
    tokens.manager = await login('e2e-cert-manager@test.nl');
    tokens.insp1 = await login('e2e-cert-insp1@test.nl');
    tokens.insp2 = await login('e2e-cert-insp2@test.nl');
    tokens.backoffice = await login('e2e-cert-backoffice@test.nl');
    tokens.wvb = await login('e2e-cert-wvb@test.nl');
    tokens.foreignAdmin = await login('e2e-cert-foreign-admin@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.inspectorCertificate.deleteMany({ where: { orgId: { in: [orgId, foreignOrgId] } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgId, foreignOrgId] } } });
    } finally {
      await app.close();
    }
  });

  const base = () => request(app.getHttpServer());

  // ─── Create / read happy path ──────────────────────────

  describe('POST /inspector-certificates', () => {
    it('ORG_ADMIN creates a certificate WITH a document for an inspector', async () => {
      const res = await base()
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .field('userId', ids.insp1)
        .field('type', 'VCA-VOL')
        .field('number', 'NL-123')
        .field('issueDate', '2024-01-15')
        .field('validUntil', '2027-01-15')
        .field('issuer', 'VCA Examenbureau')
        .attach('file', Buffer.from('%PDF-1.4 demo'), 'diploma.pdf')
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.type).toBe('VCA-VOL');
      expect(res.body.data.hasDocument).toBe(true);
      expect(res.body.data.storageKey).toBeUndefined(); // never leak storage paths
      createdCertIds.push(res.body.data.id);
      ids.certWithFile = res.body.data.id;
    });

    it('an inspector creates their OWN certificate WITHOUT a document', async () => {
      const res = await base()
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .field('userId', ids.insp1)
        .field('type', 'NEN 3140 VP')
        .field('issueDate', '2023-05-01')
        .field('issuer', 'Opleider B.V.')
        .expect(201);

      expect(res.body.data.hasDocument).toBe(false);
      createdCertIds.push(res.body.data.id);
      ids.certNoFile = res.body.data.id;
    });

    it('rejects a disallowed file type (422)', async () => {
      await base()
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .field('userId', ids.insp1)
        .field('type', 'X')
        .field('issueDate', '2024-01-15')
        .field('issuer', 'Y')
        .attach('file', Buffer.from('hello'), 'note.txt')
        .expect(422);
    });

    it('returns 401 without authentication', async () => {
      await base()
        .post('/api/v1/inspector-certificates')
        .field('userId', ids.insp1)
        .field('type', 'X')
        .field('issueDate', '2024-01-15')
        .field('issuer', 'Y')
        .expect(401);
    });

    it('MANAGER may NOT create (read-only) → 403', async () => {
      await base()
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.manager}`)
        .field('userId', ids.insp1)
        .field('type', 'X')
        .field('issueDate', '2024-01-15')
        .field('issuer', 'Y')
        .expect(403);
    });

    it('an inspector may NOT create for another inspector → 403', async () => {
      await base()
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .field('userId', ids.insp2)
        .field('type', 'X')
        .field('issueDate', '2024-01-15')
        .field('issuer', 'Y')
        .expect(403);
    });
  });

  describe('GET /inspector-certificates', () => {
    it('an inspector without userId sees only their own certificates', async () => {
      const res = await base()
        .get('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .expect(200);
      const rows = res.body.data.data;
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.every((c: any) => c.userId === ids.insp1)).toBe(true);
    });

    it('MANAGER may read an inspector’s certificates by userId', async () => {
      const res = await base()
        .get('/api/v1/inspector-certificates')
        .query({ userId: ids.insp1 })
        .set('Authorization', `Bearer ${tokens.manager}`)
        .expect(200);
      expect(res.body.data.data.length).toBeGreaterThanOrEqual(2);
    });

    it('an inspector may NOT list another inspector → 403', async () => {
      await base()
        .get('/api/v1/inspector-certificates')
        .query({ userId: ids.insp2 })
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .expect(403);
    });

    it('suggestions returns distinct values', async () => {
      const res = await base()
        .get('/api/v1/inspector-certificates/suggestions')
        .query({ field: 'issuer' })
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data).toContain('VCA Examenbureau');
    });
  });

  describe('GET /inspector-certificates/:id(/document)', () => {
    it('MANAGER may download the document', async () => {
      await base()
        .get(`/api/v1/inspector-certificates/${ids.certWithFile}/document`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .expect(200);
    });

    it('BACKOFFICE may NOT download another inspector’s document → 403', async () => {
      await base()
        .get(`/api/v1/inspector-certificates/${ids.certWithFile}/document`)
        .set('Authorization', `Bearer ${tokens.backoffice}`)
        .expect(403);
    });

    it('WERKVOORBEREIDER may NOT download another inspector’s document → 403', async () => {
      await base()
        .get(`/api/v1/inspector-certificates/${ids.certWithFile}/document`)
        .set('Authorization', `Bearer ${tokens.wvb}`)
        .expect(403);
    });

    it('404 for a certificate without a document', async () => {
      await base()
        .get(`/api/v1/inspector-certificates/${ids.certNoFile}/document`)
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .expect(404);
    });
  });

  // ─── Update / delete ───────────────────────────────────

  describe('PATCH /inspector-certificates/:id', () => {
    it('ORG_ADMIN updates metadata', async () => {
      const res = await base()
        .patch(`/api/v1/inspector-certificates/${ids.certWithFile}`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .field('issuer', 'VCA Examenbureau (gewijzigd)')
        .expect(200);
      expect(res.body.data.issuer).toBe('VCA Examenbureau (gewijzigd)');
    });

    it('MANAGER may NOT update → 403', async () => {
      await base()
        .patch(`/api/v1/inspector-certificates/${ids.certWithFile}`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .field('issuer', 'x')
        .expect(403);
    });
  });

  describe('DELETE /inspector-certificates/:id(/document)', () => {
    it('removes only the document, keeping the certificate', async () => {
      const res = await base()
        .delete(`/api/v1/inspector-certificates/${ids.certWithFile}/document`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .expect(200);
      expect(res.body.data.hasDocument).toBe(false);
    });

    it('MANAGER may NOT delete → 403', async () => {
      await base()
        .delete(`/api/v1/inspector-certificates/${ids.certNoFile}`)
        .set('Authorization', `Bearer ${tokens.manager}`)
        .expect(403);
    });

    it('soft-deletes a certificate; afterwards it is 404', async () => {
      await base()
        .delete(`/api/v1/inspector-certificates/${ids.certNoFile}`)
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .expect(200);
      await base()
        .get(`/api/v1/inspector-certificates/${ids.certNoFile}`)
        .set('Authorization', `Bearer ${tokens.insp1}`)
        .expect(404);
    });
  });

  // ─── Cross-tenant isolation ────────────────────────────

  describe('cross-tenant isolation', () => {
    it('a foreign-org admin cannot read this org’s certificate → 404', async () => {
      await base()
        .get(`/api/v1/inspector-certificates/${ids.certWithFile}`)
        .set('Authorization', `Bearer ${tokens.foreignAdmin}`)
        .expect(404);
    });

    it('a foreign-org admin cannot create a certificate for this org’s inspector → 403', async () => {
      await base()
        .post('/api/v1/inspector-certificates')
        .set('Authorization', `Bearer ${tokens.foreignAdmin}`)
        .field('userId', ids.insp1)
        .field('type', 'X')
        .field('issueDate', '2024-01-15')
        .field('issuer', 'Y')
        .expect(403);
    });
  });
});
