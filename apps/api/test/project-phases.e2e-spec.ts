import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * PRD-12 project-phases end-to-end flow via HTTP.
 *
 * One org, an ORG_ADMIN (write) + INSPECTEUR (read-only). Covers CRUD, reorder,
 * followers, milestones, the follower snapshot on create, budget stripping for
 * INSPECTEUR, role gating, and the delete-blockade while a quote is linked.
 *
 * Runs against 127.0.0.1 (unknown host) so the TenantGuard does not scope these.
 */
describe('Project phases (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let adminId: string;
  let inspecteurId: string;
  let contactId: string;
  let projectId: string;
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
      data: { name: 'E2E Phases Org', slug: 'e2ephases' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-phases-admin@test.nl',
        passwordHash,
        firstName: 'Phase',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const inspecteur = await prisma.user.create({
      data: {
        email: 'e2e-phases-inspecteur@test.nl',
        passwordHash,
        firstName: 'Phase',
        lastName: 'Inspecteur',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    inspecteurId = inspecteur.id;

    const contact = await prisma.contact.create({
      data: { orgId: org.id, type: 'COMPANY', companyName: 'Phase Klant', email: 'phase@test.nl' },
    });
    contactId = contact.id;

    const project = await prisma.project.create({
      data: {
        orgId: org.id,
        projectNumber: 'E2E-PHASE-P001',
        title: 'Fasenproject',
        contactId: contact.id,
        projectManagerId: admin.id,
        createdBy: admin.id,
      },
    });
    projectId = project.id;

    // One project follower so the create-snapshot can be asserted.
    await prisma.projectFollower.create({
      data: { projectId: project.id, userId: admin.id },
    });

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-phases-admin@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
    inspecteurToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-phases-inspecteur@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.phaseMilestone.deleteMany({ where: { orgId } });
      await prisma.projectPhaseFollower.deleteMany({ where: { phase: { orgId } } });
      await prisma.projectPhase.deleteMany({ where: { orgId } });
      await prisma.quote.deleteMany({ where: { orgId } });
      await prisma.projectFollower.deleteMany({ where: { project: { orgId } } });
      await prisma.project.deleteMany({ where: { orgId } });
      await prisma.numberingCounter.deleteMany({ where: { scheme: { orgId } } });
      await prisma.numberingScheme.deleteMany({ where: { orgId } });
      await prisma.notification.deleteMany({ where: { orgId } });
      await prisma.contact.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.invitation.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: [adminId, inspecteurId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, inspecteurId] } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  const base = () => `/api/v1/projects/${projectId}/phases`;

  let phase1Id: string;
  let phase2Id: string;

  it('creates a phase (sortOrder 0) and snapshots the project followers (§12.4.9)', async () => {
    const res = await request(app.getHttpServer())
      .post(base())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fase 1', budgetAmount: 2500 })
      .expect(201);

    expect(res.body.data.sortOrder).toBe(0);
    expect(res.body.data.budgetAmount).toBeDefined();
    // Copied the single project follower.
    expect(res.body.data.followers).toHaveLength(1);
    expect(res.body.data.followers[0].userId).toBe(adminId);
    phase1Id = res.body.data.id;
  });

  it('creates a second phase with sortOrder 1', async () => {
    const res = await request(app.getHttpServer())
      .post(base())
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fase 2' })
      .expect(201);
    expect(res.body.data.sortOrder).toBe(1);
    phase2Id = res.body.data.id;
  });

  it('lists phases ordered by sortOrder', async () => {
    const res = await request(app.getHttpServer())
      .get(base())
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual([phase1Id, phase2Id]);
  });

  it('forbids an INSPECTEUR from creating a phase', async () => {
    await request(app.getHttpServer())
      .post(base())
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .send({ name: 'Sneaky' })
      .expect(403);
  });

  it('strips budgetAmount for INSPECTEUR but exposes it for staff (§12.4.8)', async () => {
    const asInspecteur = await request(app.getHttpServer())
      .get(`${base()}/${phase1Id}`)
      .set('Authorization', `Bearer ${inspecteurToken}`)
      .expect(200);
    expect(asInspecteur.body.data.budgetAmount).toBeUndefined();

    const asAdmin = await request(app.getHttpServer())
      .get(`${base()}/${phase1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(asAdmin.body.data.budgetAmount).toBeDefined();
  });

  it('reorders the phases in one transaction', async () => {
    await request(app.getHttpServer())
      .post(`${base()}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderedIds: [phase2Id, phase1Id] })
      .expect(201);

    const res = await request(app.getHttpServer())
      .get(base())
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data.map((p: any) => p.id)).toEqual([phase2Id, phase1Id]);
  });

  it('rejects a reorder set that is not exactly the project phases (400)', async () => {
    await request(app.getHttpServer())
      .post(`${base()}/reorder`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ orderedIds: [phase1Id] })
      .expect(400);
  });

  it('sets completedAt when a phase moves to AFGEROND (§12.4.5)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`${base()}/${phase1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'AFGEROND' })
      .expect(200);
    expect(res.body.data.status).toBe('AFGEROND');
    expect(res.body.data.completedAt).not.toBeNull();
  });

  it('clears completedAt when a phase leaves AFGEROND (§12.4.5)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`${base()}/${phase1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'ACTIEF' })
      .expect(200);
    expect(res.body.data.completedAt).toBeNull();
  });

  // ─── Followers ──────────────────────────────────────────
  it('manages phase followers (add / update / remove)', async () => {
    const add = await request(app.getHttpServer())
      .post(`${base()}/${phase2Id}/followers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'extern@klant.nl', name: 'Externe volger', canViewQuotes: false })
      .expect(201);
    const followerId = add.body.data.id;
    expect(add.body.data.canViewQuotes).toBe(false);

    await request(app.getHttpServer())
      .patch(`${base()}/${phase2Id}/followers/${followerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ canViewQuotes: true })
      .expect(200);

    const list = await request(app.getHttpServer())
      .get(`${base()}/${phase2Id}/followers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data.some((f: any) => f.id === followerId)).toBe(true);

    await request(app.getHttpServer())
      .delete(`${base()}/${phase2Id}/followers/${followerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  // ─── Milestones ─────────────────────────────────────────
  it('manages milestones and status transitions', async () => {
    const add = await request(app.getHttpServer())
      .post(`${base()}/${phase1Id}/milestones`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Rapportage gereed', dueDate: '2026-08-01', assigneeId: inspecteurId })
      .expect(201);
    const milestoneId = add.body.data.id;
    expect(add.body.data.status).toBe('OPEN');
    expect(add.body.data.reminderDaysBefore).toBe(7);

    const behaald = await request(app.getHttpServer())
      .patch(`${base()}/${phase1Id}/milestones/${milestoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'BEHAALD' })
      .expect(200);
    expect(behaald.body.data.completedAt).not.toBeNull();

    const reopen = await request(app.getHttpServer())
      .patch(`${base()}/${phase1Id}/milestones/${milestoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'OPEN' })
      .expect(200);
    expect(reopen.body.data.completedAt).toBeNull();

    await request(app.getHttpServer())
      .delete(`${base()}/${phase1Id}/milestones/${milestoneId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  // ─── Delete blockade ────────────────────────────────────
  it('blocks deletion while a quote is linked, and allows it after unlinking (§12.4.7)', async () => {
    // Create a CONCEPT quote and link it to phase 1 via the quote update endpoint.
    const quote = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contactId, subject: 'Fase-offerte' })
      .expect(201);
    const quoteId = quote.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectPhaseId: phase1Id })
      .expect(200);

    // Deletion is blocked while the quote is linked.
    await request(app.getHttpServer())
      .delete(`${base()}/${phase1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);

    // Unlink, then deletion succeeds (soft-delete).
    await request(app.getHttpServer())
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectPhaseId: null })
      .expect(200);

    await request(app.getHttpServer())
      .delete(`${base()}/${phase1Id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // The soft-deleted phase is gone from the list.
    const list = await request(app.getHttpServer())
      .get(base())
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.data.map((p: any) => p.id)).not.toContain(phase1Id);
  });

  it('auto-cascades the phase project onto a quote that had none (§12.4.2)', async () => {
    const quote = await request(app.getHttpServer())
      .post('/api/v1/quotes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ contactId, subject: 'Cascade-offerte' })
      .expect(201);
    const quoteId = quote.body.data.id;

    await request(app.getHttpServer())
      .patch(`/api/v1/quotes/${quoteId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ projectPhaseId: phase2Id })
      .expect(200);

    const stored = await prisma.quote.findUnique({ where: { id: quoteId } });
    expect(stored?.projectPhaseId).toBe(phase2Id);
    expect(stored?.projectId).toBe(projectId);
  });
});
