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
      // Notificaties ontstaan door de fire-and-forget dispatch bij exceptie-wijzigingen.
      await prisma.notification.deleteMany({ where: { orgId } });
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

  // ─── Uitzonderingen (autorisatie zelf vs. ander) ─────────

  let ownExceptionId: string;

  it('lets an INSPECTEUR create their own exception (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .send({
        userId: inspecteurId,
        type: 'GEBLOKKEERD',
        startsAt: '2026-08-03T00:00:00.000Z',
        endsAt: '2026-08-15T00:00:00.000Z',
        allDay: true,
        reason: 'Vakantie',
      })
      .expect(201);
    expect(res.body.data.type).toBe('GEBLOKKEERD');
    ownExceptionId = res.body.data.id;
  });

  it('forbids an INSPECTEUR from creating an exception for someone else (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .send({
        userId: adminId,
        type: 'GEBLOKKEERD',
        startsAt: '2026-08-03T00:00:00.000Z',
        endsAt: '2026-08-04T00:00:00.000Z',
        allDay: true,
      })
      .expect(403);
  });

  it('lets a MANAGER create an exception for another user (201)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: inspecteurId,
        type: 'BESCHIKBAAR',
        isRecurring: true,
        weekdays: [6], // zaterdag
        startMinute: 540,
        endMinute: 720,
        recurStartDate: '2026-01-03',
      })
      .expect(201);
  });

  it('rejects an exception with both one-off and recurring fields (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: inspecteurId,
        type: 'GEBLOKKEERD',
        startsAt: '2026-08-03T00:00:00.000Z',
        endsAt: '2026-08-04T00:00:00.000Z',
        weekdays: [1], // niet toegestaan bij een eenmalige uitzondering
      })
      .expect(400);
  });

  it('rejects a recurring exception without weekdays (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: inspecteurId,
        type: 'BESCHIKBAAR',
        isRecurring: true,
        startMinute: 540,
        endMinute: 720,
        recurStartDate: '2026-01-03',
      })
      .expect(400);
  });

  it('lists the inspecteur their own exceptions without a userId', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(200);
    expect(res.body.data.map((e: any) => e.id)).toContain(ownExceptionId);
  });

  it("forbids an INSPECTEUR from listing another user's exceptions (403)", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/availability/exceptions?userId=${adminId}`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(403);
  });

  it('lets the inspecteur delete their own exception (soft)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/availability/exceptions/${ownExceptionId}`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(200);
  });

  // ─── Resolved & check ────────────────────────────────────

  let resolveTemplateId: string;

  it('sets up a template + assignment + weekly block for resolution', async () => {
    // Verse template met een maandag-slot 08:00–17:30.
    const tpl = await request(app.getHttpServer())
      .post('/api/v1/availability/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Resolve-schema', slots: [{ weekday: 1, startMinute: 480, endMinute: 1050 }] })
      .expect(201);
    resolveTemplateId = tpl.body.data.id;

    await request(app.getHttpServer())
      .put(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ templateId: resolveTemplateId, validFrom: '2026-01-01' })
      .expect(200);

    // Wekelijkse blokkade maandag 10:00–11:00.
    await request(app.getHttpServer())
      .post('/api/v1/availability/exceptions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        userId: inspecteurId,
        type: 'GEBLOKKEERD',
        isRecurring: true,
        weekdays: [1],
        startMinute: 600,
        endMinute: 660,
        recurStartDate: '2026-01-05',
        reason: 'Vaste studie',
      })
      .expect(201);
  });

  it('resolves a workday minus the weekly block', async () => {
    // 2026-07-20 is een maandag.
    const res = await request(app.getHttpServer())
      .get(`/api/v1/availability/resolved?from=2026-07-20&to=2026-07-20&userIds=${inspecteurId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const monday = res.body.data.find((d: any) => d.date === '2026-07-20');
    expect(monday.intervals).toEqual([
      { startMinute: 480, endMinute: 600 },
      { startMinute: 660, endMinute: 1050 },
    ]);
    expect(monday.isAvailable).toBe(true);
  });

  it('rejects a resolved range larger than 3 months (400)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/availability/resolved?from=2026-01-01&to=2026-06-01&userIds=${inspecteurId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('check: window inside availability → available true', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/availability/check?userId=${inspecteurId}` +
          '&start=2026-07-20T08:00:00.000Z&end=2026-07-20T09:00:00.000Z',
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.available).toBe(true);
    expect(res.body.data.conflicts).toEqual([]);
  });

  it('check: window on the block → available false with reason', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/availability/check?userId=${inspecteurId}` +
          '&start=2026-07-20T10:00:00.000Z&end=2026-07-20T10:30:00.000Z',
      )
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.available).toBe(false);
    expect(res.body.data.conflicts[0].reason).toBe('Vaste studie');
  });

  // ─── Self-access voor de INSPECTEUR (PRD-12 §12.8c) ──────

  it('lets an INSPECTEUR read their own resolved availability (200)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/availability/resolved?from=2026-07-20&to=2026-07-20&userIds=${inspecteurId}`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(200);
    expect(res.body.data.find((d: any) => d.date === '2026-07-20')).toBeDefined();
  });

  it("forbids an INSPECTEUR from reading someone else's resolved availability (403)", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/availability/resolved?from=2026-07-20&to=2026-07-20&userIds=${adminId}`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(403);
  });

  it('forbids an INSPECTEUR from reading org-wide resolved without userIds (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/availability/resolved?from=2026-07-20&to=2026-07-20')
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(403);
  });

  it('lets an INSPECTEUR check their own availability (200)', async () => {
    const res = await request(app.getHttpServer())
      .get(
        `/api/v1/availability/check?userId=${inspecteurId}` +
          '&start=2026-07-20T08:00:00.000Z&end=2026-07-20T09:00:00.000Z',
      )
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(200);
    expect(res.body.data.available).toBe(true);
  });

  it("forbids an INSPECTEUR from checking someone else's availability (403)", async () => {
    await request(app.getHttpServer())
      .get(
        `/api/v1/availability/check?userId=${adminId}` +
          '&start=2026-07-20T08:00:00.000Z&end=2026-07-20T09:00:00.000Z',
      )
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(403);
  });

  it('lets an INSPECTEUR read their own schedule (200)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it("forbids an INSPECTEUR from reading someone else's schedule (403)", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/availability/users/${adminId}/schedule`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(403);
  });

  it('still forbids an INSPECTEUR from assigning a schedule (403)', async () => {
    await request(app.getHttpServer())
      .put(`/api/v1/availability/users/${inspecteurId}/schedule`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .send({ templateId: resolveTemplateId, validFrom: '2027-01-01' })
      .expect(403);
  });
});
