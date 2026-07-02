import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Meetmiddelen + kalibraties (e2e). Draait op 127.0.0.1 (host "unknown"), dus
 * TenantGuard/FeatureGuard vallen open; RolesGuard + service-laag (orgScope,
 * assertSameOrg/assertAllSameOrg) zijn wat we hier afdwingen.
 */
describe('MeasurementInstruments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let foreignOrgId: string;
  const userIds: string[] = [];

  const tokens: Record<string, string> = {};
  const ids: Record<string, string> = {};
  const PWD = 'TestPass123!';

  async function makeUser(email: string, roles: string[], org: string) {
    const passwordHash = await bcrypt.hash(PWD, 10);
    const user = await prisma.user.create({
      data: {
        email, passwordHash, firstName: 'E2E', lastName: email.split('@')[0],
        roles: roles as any, orgId: org, emailVerifiedAt: new Date(),
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
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const org = await prisma.organization.create({ data: { name: 'E2E MM Org', slug: 'e2emmorg' } });
    orgId = org.id;
    const foreign = await prisma.organization.create({ data: { name: 'E2E MM Foreign', slug: 'e2emmforeign' } });
    foreignOrgId = foreign.id;

    ids.admin = await makeUser('e2e-mm-admin@test.nl', ['ORG_ADMIN'], orgId);
    ids.wvb = await makeUser('e2e-mm-wvb@test.nl', ['WERKVOORBEREIDER'], orgId);
    ids.insp = await makeUser('e2e-mm-insp@test.nl', ['INSPECTEUR'], orgId);
    ids.foreignAdmin = await makeUser('e2e-mm-foreign-admin@test.nl', ['ORG_ADMIN'], foreignOrgId);

    tokens.admin = await login('e2e-mm-admin@test.nl');
    tokens.wvb = await login('e2e-mm-wvb@test.nl');
    tokens.insp = await login('e2e-mm-insp@test.nl');
    tokens.foreignAdmin = await login('e2e-mm-foreign-admin@test.nl');
  });

  afterAll(async () => {
    try {
      const orgs = [orgId, foreignOrgId];
      await prisma.calibration.deleteMany({ where: { orgId: { in: orgs } } });
      await prisma.userDefaultInstrument.deleteMany({ where: { orgId: { in: orgs } } });
      await prisma.inspectionPlanDefaultInstrument.deleteMany({ where: { orgId: { in: orgs } } });
      await prisma.measurementInstrument.deleteMany({ where: { orgId: { in: orgs } } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgs } } });
    } finally {
      await app.close();
    }
  });

  const base = () => request(app.getHttpServer());

  // ─── Instrument CRUD + role tiers ──────────────────────

  describe('POST /measurement-instruments', () => {
    it('ORG_ADMIN creates an instrument assigned to an inspector', async () => {
      const res = await base()
        .post('/api/v1/measurement-instruments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ code: 'MM-E2E-1', brand: 'Fluke', type: '1587', calibrationIntervalMonths: 12, assignedToUserId: ids.insp })
        .expect(201);
      expect(res.body.data.code).toBe('MM-E2E-1');
      expect(res.body.data.calibrationStatus).toBe('GEEN_KALIBRATIE');
      ids.instrument = res.body.data.id;
    });

    it('WERKVOORBEREIDER may create (write role)', async () => {
      const res = await base()
        .post('/api/v1/measurement-instruments')
        .set('Authorization', `Bearer ${tokens.wvb}`)
        .send({ code: 'MM-E2E-2', brand: 'Megger', type: '430', calibrationIntervalMonths: 24 })
        .expect(201);
      ids.instrument2 = res.body.data.id;
    });

    it('INSPECTEUR may NOT create → 403', async () => {
      await base()
        .post('/api/v1/measurement-instruments')
        .set('Authorization', `Bearer ${tokens.insp}`)
        .send({ code: 'MM-E2E-X', brand: 'X', type: 'Y', calibrationIntervalMonths: 12 })
        .expect(403);
    });

    it('returns 401 without authentication', async () => {
      await base().post('/api/v1/measurement-instruments').send({ code: 'X' }).expect(401);
    });

    it('rejects a duplicate code within the org → 409', async () => {
      await base()
        .post('/api/v1/measurement-instruments')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send({ code: 'MM-E2E-1', brand: 'Dup', type: 'Z', calibrationIntervalMonths: 12 })
        .expect(409);
    });
  });

  // ─── Calibration lifecycle + cache recompute ───────────

  describe('calibrations', () => {
    it('adds a calibration with a certificate and recomputes the cache → VERLOPEN', async () => {
      const res = await base()
        .post(`/api/v1/measurement-instruments/${ids.instrument}/calibrations`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .field('calibrationDate', '2024-01-01') // > 1 interval geleden → verlopen
        .field('performedBy', 'KalibratieLab BV')
        .field('certificateNumber', 'CAL-1')
        .attach('file', Buffer.from('%PDF-1.4 demo'), 'cert.pdf')
        .expect(201);
      expect(res.body.data.hasDocument).toBe(true);
      expect(res.body.data.storageKey).toBeUndefined();
      ids.calibration = res.body.data.id;

      const detail = await base()
        .get(`/api/v1/measurement-instruments/${ids.instrument}`)
        .set('Authorization', `Bearer ${tokens.insp}`)
        .expect(200);
      expect(detail.body.data.calibrationStatus).toBe('VERLOPEN');
      expect(detail.body.data.lastCalibrationDate).toBeTruthy();
      expect(detail.body.data.nextCalibrationDue).toBeTruthy();
      expect(detail.body.data.calibrationCount).toBe(1);
    });

    it('rejects a disallowed certificate file type → 422', async () => {
      await base()
        .post(`/api/v1/measurement-instruments/${ids.instrument}/calibrations`)
        .set('Authorization', `Bearer ${tokens.admin}`)
        .field('calibrationDate', '2025-01-01')
        .field('performedBy', 'X')
        .attach('file', Buffer.from('hello'), 'note.txt')
        .expect(422);
    });

    it('downloads the calibration certificate', async () => {
      await base()
        .get(`/api/v1/measurement-instruments/${ids.instrument}/calibrations/${ids.calibration}/document`)
        .set('Authorization', `Bearer ${tokens.insp}`)
        .expect(200);
    });

    it('INSPECTEUR may NOT add a calibration → 403', async () => {
      await base()
        .post(`/api/v1/measurement-instruments/${ids.instrument}/calibrations`)
        .set('Authorization', `Bearer ${tokens.insp}`)
        .field('calibrationDate', '2025-01-01')
        .field('performedBy', 'X')
        .expect(403);
    });
  });

  // ─── Lijst + suggesties ────────────────────────────────

  it('GET /measurement-instruments returns instruments with derived status', async () => {
    const res = await base()
      .get('/api/v1/measurement-instruments')
      .set('Authorization', `Bearer ${tokens.insp}`)
      .expect(200);
    const codes = res.body.data.data.map((m: any) => m.code);
    expect(codes).toEqual(expect.arrayContaining(['MM-E2E-1', 'MM-E2E-2']));
  });

  // De portal laadt "alles" (limit=200) voor client-side filtering. De query-DTO
  // overschrijft daarom de base-cap @Max(100); deze cases borgen de grens op 200.
  it('GET /measurement-instruments accepts limit=200 (portal load-all)', async () => {
    await base()
      .get('/api/v1/measurement-instruments?limit=200')
      .set('Authorization', `Bearer ${tokens.insp}`)
      .expect(200);
  });

  it('GET /measurement-instruments rejects limit above 200 → 400', async () => {
    await base()
      .get('/api/v1/measurement-instruments?limit=201')
      .set('Authorization', `Bearer ${tokens.insp}`)
      .expect(400);
  });

  it('GET suggestions returns distinct brands', async () => {
    const res = await base()
      .get('/api/v1/measurement-instruments/suggestions')
      .query({ field: 'brand' })
      .set('Authorization', `Bearer ${tokens.admin}`)
      .expect(200);
    expect(res.body.data).toEqual(expect.arrayContaining(['Fluke', 'Megger']));
  });

  // ─── Niveau-1 voorkeur (my-defaults) ───────────────────

  describe('my-defaults', () => {
    it('an inspector sets and reads their own default instruments', async () => {
      await base()
        .put('/api/v1/measurement-instruments/my-defaults')
        .set('Authorization', `Bearer ${tokens.insp}`)
        .send({ instrumentIds: [ids.instrument, ids.instrument2] })
        .expect(200);
      const res = await base()
        .get('/api/v1/measurement-instruments/my-defaults')
        .set('Authorization', `Bearer ${tokens.insp}`)
        .expect(200);
      expect(res.body.data).toEqual(expect.arrayContaining([ids.instrument, ids.instrument2]));
    });
  });

  // ─── Cross-tenant isolatie ─────────────────────────────

  describe('cross-tenant isolation', () => {
    it('a foreign-org admin cannot read this org’s instrument → 404', async () => {
      await base()
        .get(`/api/v1/measurement-instruments/${ids.instrument}`)
        .set('Authorization', `Bearer ${tokens.foreignAdmin}`)
        .expect(404);
    });

    it('cannot assign an instrument to a user from another org → 403', async () => {
      await base()
        .post('/api/v1/measurement-instruments')
        .set('Authorization', `Bearer ${tokens.foreignAdmin}`)
        .send({ code: 'MM-FOREIGN', brand: 'X', type: 'Y', calibrationIntervalMonths: 12, assignedToUserId: ids.insp })
        .expect(403);
    });

    it('cannot set defaults referencing another org’s instrument → 403', async () => {
      await base()
        .put('/api/v1/measurement-instruments/my-defaults')
        .set('Authorization', `Bearer ${tokens.foreignAdmin}`)
        .send({ instrumentIds: [ids.instrument] })
        .expect(403);
    });
  });
});
