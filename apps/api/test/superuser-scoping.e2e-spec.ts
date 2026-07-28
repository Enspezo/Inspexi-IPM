import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import { AllExceptionsFilter } from '@/common/filters';
import bcrypt from 'bcrypt';

const FIXTURE_SLUGS = ['e2ewpb3scope', 'e2ewpb3other', 'e2ewpb3onboard'];

/**
 * Ruimt alle fixtures van deze suite op (op slug/e-mailprefix), kinderen eerst.
 * Wordt zowel vóór (zelfherstel na een gekillde run) als ná de suite gedraaid.
 */
async function cleanupFixtures(prisma: PrismaService): Promise<void> {
  const orgs = await prisma.organization.findMany({
    where: { slug: { in: FIXTURE_SLUGS } },
    select: { id: true },
  });
  const orgIds = orgs.map((o) => o.id);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { email: { startsWith: 'e2e-wpb3-' } },
        ...(orgIds.length ? [{ orgId: { in: orgIds } }] : []),
      ],
    },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);

  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { userId: { in: userIds } },
        ...(orgIds.length ? [{ orgId: { in: orgIds } }] : []),
      ],
    },
  });
  if (orgIds.length) {
    await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.invitation.deleteMany({ where: { orgId: { in: orgIds } } });
  }
  await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  if (orgIds.length) {
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
  }
}

/**
 * WP-B3 — tenant-aware superuser scoping + onboarding (B-502/B-503/B-504).
 *
 * Beslissing D2: het subdomein bepaalt de scope. Deze suite stuurt expliciete
 * Host-headers (zoals feature-entitlements.e2e-spec.ts) zodat de
 * TenantMiddleware een echte tenantcontext opbouwt:
 * - `<slug>.localhost`  → org-tenant  → SUPERUSER wordt op die org gescoped
 * - `mijn.localhost`    → superuser-domein → platform-breed
 * - geen Host (127.0.0.1) → onbekende host → platform-breed (bestaand gedrag)
 */
describe('Superuser tenant-scoping & onboarding (e2e, WP-B3)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const HOST_A = 'e2ewpb3scope.localhost';
  const HOST_B = 'e2ewpb3other.localhost';
  const HOST_MIJN = 'mijn.localhost';
  const HOST_ONBOARD = 'e2ewpb3onboard.localhost';

  let orgAId: string;
  let orgBId: string;
  let onboardOrgId: string | undefined;

  let suToken: string;
  let adminAToken: string;

  let adminAUserId: string;
  let userBId: string;
  let suUserId: string;

  let contactAId: string;
  let contactBId: string;

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
    // Zelfde filter als main.ts zodat de foutvormen ({success:false, …})
    // en de Prisma→HTTP-mapping representatief zijn.
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    prisma = app.get(PrismaService);

    // Zelfherstellend: leftovers van een eerder gekillde run opruimen (de
    // gedeelde dev-DB mag hier niet gereseed worden).
    await cleanupFixtures(prisma);

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const orgA = await prisma.organization.create({
      data: { name: 'E2E WPB3 Scope Org', slug: 'e2ewpb3scope' },
    });
    orgAId = orgA.id;

    const orgB = await prisma.organization.create({
      data: { name: 'E2E WPB3 Other Org', slug: 'e2ewpb3other' },
    });
    orgBId = orgB.id;

    const adminA = await prisma.user.create({
      data: {
        email: 'e2e-wpb3-admin-a@test.nl',
        passwordHash,
        firstName: 'Admin',
        lastName: 'A',
        roles: ['ORG_ADMIN'],
        orgId: orgAId,
        emailVerifiedAt: new Date(),
      },
    });
    adminAUserId = adminA.id;

    const userB = await prisma.user.create({
      data: {
        email: 'e2e-wpb3-user-b@test.nl',
        passwordHash,
        firstName: 'User',
        lastName: 'B',
        roles: ['BACKOFFICE'],
        orgId: orgBId,
        emailVerifiedAt: new Date(),
      },
    });
    userBId = userB.id;

    const su = await prisma.user.create({
      data: {
        email: 'e2e-wpb3-su@test.nl',
        passwordHash,
        firstName: 'Super',
        lastName: 'User',
        roles: ['SUPERUSER'],
        orgId: null,
        emailVerifiedAt: new Date(),
      },
    });
    suUserId = su.id;

    const contactA = await prisma.contact.create({
      data: {
        orgId: orgAId,
        type: 'COMPANY',
        companyName: 'WPB3 Contact A',
        ownerId: adminA.id,
      },
    });
    contactAId = contactA.id;

    const contactB = await prisma.contact.create({
      data: {
        orgId: orgBId,
        type: 'COMPANY',
        companyName: 'WPB3 Contact B',
        ownerId: userB.id,
      },
    });
    contactBId = contactB.id;

    const suLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-wpb3-su@test.nl', password: 'TestPass123!' });
    suToken = suLogin.body.data.accessToken;

    const adminALogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-wpb3-admin-a@test.nl', password: 'TestPass123!' });
    adminAToken = adminALogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await cleanupFixtures(prisma);
    } finally {
      await app.close();
    }
  });

  // ─── B-502: leesscope volgt het subdomein ─────────────────────────────

  describe('B-502 — SUPERUSER leesscope per subdomein', () => {
    it('GET /users met Host org A → alleen gebruikers van org A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${suToken}`)
        .expect(200);

      const users = res.body.data as Array<{ id: string; orgId: string }>;
      expect(users.length).toBeGreaterThan(0);
      expect(users.every((u) => u.orgId === orgAId)).toBe(true);
      expect(users.some((u) => u.id === adminAUserId)).toBe(true);
      expect(users.some((u) => u.id === userBId)).toBe(false);
    });

    it('GET /users met Host mijn.localhost → platform-breed', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Host', HOST_MIJN)
        .set('Authorization', `Bearer ${suToken}`)
        .expect(200);

      const ids = (res.body.data as Array<{ id: string }>).map((u) => u.id);
      expect(ids).toContain(adminAUserId);
      expect(ids).toContain(userBId);
    });

    it('GET /contacts met Host org A → alleen relaties van org A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts?limit=100')
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${suToken}`)
        .expect(200);

      const contacts = res.body.data.data as Array<{
        id: string;
        orgId: string;
      }>;
      expect(contacts.every((c) => c.orgId === orgAId)).toBe(true);
      expect(contacts.some((c) => c.id === contactAId)).toBe(true);
      expect(contacts.some((c) => c.id === contactBId)).toBe(false);
    });

    it('GET /contacts met Host mijn.localhost → beide orgs zichtbaar', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/contacts?limit=100&search=WPB3%20Contact')
        .set('Host', HOST_MIJN)
        .set('Authorization', `Bearer ${suToken}`)
        .expect(200);

      const ids = (res.body.data.data as Array<{ id: string }>).map(
        (c) => c.id,
      );
      expect(ids).toContain(contactAId);
      expect(ids).toContain(contactBId);
    });
  });

  // ─── B-503: schrijven volgt het subdomein — nooit een 500 ─────────────

  describe('B-503 — SUPERUSER create op org-subdomein', () => {
    it('POST /contacts met Host org A → 201 met orgId van org A', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${suToken}`)
        .send({ type: 'COMPANY', companyName: 'WPB3 SU Scope Test' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.orgId).toBe(orgAId);
    });

    it('POST /contacts op mijn.localhost → nette NL-400, geen 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Host', HOST_MIJN)
        .set('Authorization', `Bearer ${suToken}`)
        .send({ type: 'COMPANY', companyName: 'WPB3 SU Mijn Test' });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Selecteer eerst een organisatie');
    });

    it('POST /contacts zonder Host (onbekende host) → 400, geen 500', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Authorization', `Bearer ${suToken}`)
        .send({ type: 'COMPANY', companyName: 'WPB3 SU Unknown Test' });

      expect(res.status).toBe(400);
    });
  });

  // ─── B-504: onboardingketen SU-01 → SU-11 ─────────────────────────────

  describe('B-504 — onboardingketen: org → invite → accept → login', () => {
    it('doorloopt de volledige keten via de API', async () => {
      // SU-01: organisatie aanmaken vanaf het superuser-domein
      const orgRes = await request(app.getHttpServer())
        .post('/api/v1/organizations')
        .set('Host', HOST_MIJN)
        .set('Authorization', `Bearer ${suToken}`)
        .send({ name: 'E2E WPB3 Onboard BV', slug: 'e2ewpb3onboard' })
        .expect(201);
      onboardOrgId = orgRes.body.data.id as string;

      // Eerste beheerder uitnodigen via het nieuwe endpoint
      const inviteRes = await request(app.getHttpServer())
        .post(`/api/v1/organizations/${onboardOrgId}/invite`)
        .set('Host', HOST_MIJN)
        .set('Authorization', `Bearer ${suToken}`)
        .send({ email: 'e2e-wpb3-onboard-admin@test.nl', role: 'ORG_ADMIN' })
        .expect(201);

      expect(inviteRes.body.data.orgId).toBe(onboardOrgId);
      const token = inviteRes.body.data.token as string;
      expect(token).toBeDefined();

      // Uitnodiging accepteren (publiek endpoint)
      const acceptRes = await request(app.getHttpServer())
        .post('/api/v1/users/accept-invitation')
        .send({
          token,
          password: 'NewPass123!',
          firstName: 'Onboard',
          lastName: 'Admin',
        })
        .expect(201);
      expect(acceptRes.body.data.orgId).toBe(onboardOrgId);
      expect(acceptRes.body.data.roles).toEqual(['ORG_ADMIN']);

      // SU-11: inloggen als de nieuwe org-admin op het eigen subdomein
      const loginRes = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('Host', HOST_ONBOARD)
        .send({
          email: 'e2e-wpb3-onboard-admin@test.nl',
          password: 'NewPass123!',
        })
        .expect(200);
      expect(loginRes.body.data.accessToken).toBeDefined();

      // En de superuser ziet op dat subdomein precies die ene gebruiker
      const usersRes = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Host', HOST_ONBOARD)
        .set('Authorization', `Bearer ${suToken}`)
        .expect(200);
      const users = usersRes.body.data as Array<{ email: string }>;
      expect(users).toHaveLength(1);
      expect(users[0].email).toBe('e2e-wpb3-onboard-admin@test.nl');
    });

    it('weigert het invite-endpoint voor een ORG_ADMIN (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/organizations/${orgAId}/invite`)
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ email: 'e2e-wpb3-nope@test.nl', role: 'BACKOFFICE' })
        .expect(403);
    });

    it('geeft 404 voor een onbestaande organisatie', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/organizations/00000000-0000-4000-8000-000000000000/invite')
        .set('Host', HOST_MIJN)
        .set('Authorization', `Bearer ${suToken}`)
        .send({ email: 'e2e-wpb3-ghost@test.nl', role: 'ORG_ADMIN' })
        .expect(404);
    });
  });

  // ─── Regressie: ORG_ADMIN merkt niets ─────────────────────────────────

  describe('Regressie — ORG_ADMIN-gedrag ongewijzigd', () => {
    it('GET /users op eigen subdomein → alleen eigen org', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${adminAToken}`)
        .expect(200);

      const users = res.body.data as Array<{ orgId: string }>;
      expect(users.every((u) => u.orgId === orgAId)).toBe(true);
    });

    it('POST /contacts op eigen subdomein → 201 in eigen org', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/contacts')
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ type: 'COMPANY', companyName: 'WPB3 OA Regressie' })
        .expect(201);
      expect(res.body.data.orgId).toBe(orgAId);
    });

    it('blijft geweigerd op een vreemd subdomein (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/users')
        .set('Host', HOST_B)
        .set('Authorization', `Bearer ${adminAToken}`)
        .expect(403);
    });

    it('POST /users/invite blijft werken voor een ORG_ADMIN', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/users/invite')
        .set('Host', HOST_A)
        .set('Authorization', `Bearer ${adminAToken}`)
        .send({ email: 'e2e-wpb3-oa-invite@test.nl', role: 'BACKOFFICE' })
        .expect(201);
      expect(res.body.data.orgId).toBe(orgAId);
    });
  });
});
