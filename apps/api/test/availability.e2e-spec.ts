import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * PRD-12 availability end-to-end flow via HTTP.
 *
 * One org, an ORG_ADMIN (management) + INSPECTEUR (no template access). Covers
 * template CRUD, slot-overlap validation, the delete-guard while an assignment
 * is active, schedule assignment (predecessor close), employmentType gating on
 * PATCH /users/:id, and role enforcement.
 *
 * Runs against 127.0.0.1 (unknown host) so the TenantGuard does not scope these.
 */
describe('Availability (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let adminId: string;
  let inspecteurId: string;
  let adminToken: string;
  let inspecteurToken: string;

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
    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    const org = await prisma.organization.create({
      data: { name: 'E2E Avail Org', slug: 'e2eavail' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-avail-admin@test.nl',
        passwordHash,
        firstName: 'Avail',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const inspecteur = await prisma.user.create({
      data: {
        email: 'e2e-avail-inspecteur@test.nl',
        passwordHash,
        firstName: 'Avail',
        lastName: 'Inspecteur',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    inspecteurId = inspecteur.id;

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-avail-admin@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
    inspecteurToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-avail-inspecteur@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.availabilityException.deleteMany({ where: { orgId } });
      await prisma.userScheduleAssignment.deleteMany({ where: { orgId } });
      await prisma.availabilityTemplateSlot.deleteMany({
        where: { template: { orgId } },
      });
      await prisma.availabilityTemplate.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: [adminId, inspecteurId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, inspecteurId] } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  let templateId: string;
  let assignmentId: string;

  // ─── Templates CRUD ─────────────────────────────────────

  it('creates a template with weekday slots', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Standaard',
        description: 'ma–vr 08:00–17:30',
        slots: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1050 })),
      })
      .expect(201);

    expect(res.body.data.slots).toHaveLength(5);
    expect(res.body.data.assignmentCount).toBe(0);
    templateId = res.body.data.id;
  });

  it('rejects overlapping slots on the same weekday (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Overlap',
        slots: [
          { weekday: 1, startMinute: 480, endMinute: 720 },
          { weekday: 1, startMinute: 700, endMinute: 900 },
        ],
      })
      .expect(400);
  });

  it('rejects a slot with start >= end (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad', slots: [{ weekday: 1, startMinute: 600, endMinute: 600 }] })
      .expect(400);
  });

  it('rejects a duplicate name (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Standaard', slots: [{ weekday: 1, startMinute: 480, endMinute: 1050 }] })
      .expect(409);
  });

  it('lists templates including the created one', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.data.map((t: any) => t.id)).toContain(templateId);
  });

  it('replaces slots integrally on PATCH', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/availability/templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slots: [{ weekday: 1, startMinute: 420, endMinute: 900 }] })
      .expect(200);
    expect(res.body.data.slots).toHaveLength(1);
    expect(res.body.data.slots[0].startMinute).toBe(420);
  });

  it('forbids an INSPECTEUR from managing templates (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .send({ name: 'Sneaky', slots: [{ weekday: 1, startMinute: 480, endMinute: 1050 }] })
      .expect(403);
  });

  // ─── Dienstvorm (employmentType) via PATCH /users/:id ────

  it('sets employmentType on the inspecteur via PATCH /users/:id', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/users/${inspecteurId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employmentType: 'DIENSTVERBAND' })
      .expect(200);
    expect(res.body.data.employmentType).toBe('DIENSTVERBAND');
  });

  it('rejects an invalid employmentType (400)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/users/${inspecteurId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ employmentType: 'ZZP' })
      .expect(400);
  });

  // ─── Schedule assignment ────────────────────────────────

  it('assigns a schedule template to the inspecteur', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ templateId, validFrom: '2026-01-01' })
      .expect(200);
    expect(res.body.data.templateId).toBe(templateId);
    expect(res.body.data.validUntil).toBeNull();
    assignmentId = res.body.data.id;
  });

  it('closes the predecessor when a newer schedule is assigned', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ templateId, validFrom: '2026-06-01' })
      .expect(200);
    const newAssignmentId = res.body.data.id;

    const list = await request(app.getHttpServer())
      .get(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const previous = list.body.data.find((a: any) => a.id === assignmentId);
    expect(previous.validUntil).not.toBeNull();
    const current = list.body.data.find((a: any) => a.id === newAssignmentId);
    expect(current.validUntil).toBeNull();
  });

  it('blocks template deletion while an assignment is active (409)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/availability/templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
  });

  it('rejects deleting a current (non-future) assignment (400)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/availability/users/${inspecteurId}/schedule/${assignmentId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('deletes a future assignment and then allows template deletion', async () => {
    // A future assignment (validFrom far in the future).
    const future = await request(app.getHttpServer())
      .put(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ templateId, validFrom: '2999-01-01' })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/api/v1/availability/users/${inspecteurId}/schedule/${future.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // Remove all remaining assignments directly, then the template can be soft-deleted.
    await prisma.userScheduleAssignment.deleteMany({ where: { userId: inspecteurId } });

    await request(app.getHttpServer())
      .delete(`/api/v1/availability/templates/${templateId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const list = await request(app.getHttpServer())
      .get('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data.data.map((t: any) => t.id)).not.toContain(templateId);
  });
});
