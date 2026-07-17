import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('InspectionPlans (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let testOrgId: string;
  let testUserId: string;
  let assigneeId: string;
  let testContactId: string;
  let accessToken: string;
  const createdPlanIds: string[] = [];

  const NORM_CODE = 'e2enorm3';

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

    // Org
    const org = await prisma.organization.create({
      data: { name: 'E2E Plans Org', slug: 'e2eplans' },
    });
    testOrgId = org.id;

    // ORG_ADMIN user (actor)
    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-plans@test.nl',
        passwordHash,
        firstName: 'Plan',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    // Second user, same org — the assignee/reviewer
    const assignee = await prisma.user.create({
      data: {
        email: 'e2e-plans-assignee@test.nl',
        passwordHash,
        firstName: 'Assign',
        lastName: 'Ee',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    assigneeId = assignee.id;

    // Contact
    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E Plans Contact',
        email: 'e2e-plans-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    // Global norm definition (code is @unique global)
    await prisma.normTypeDefinition.create({
      data: {
        code: NORM_CODE,
        label: 'E2E Norm',
        createdBy: user.id,
        isActive: true,
        assetTypes: [],
      },
    });

    // Login
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-plans@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.inspectionPlan.deleteMany({ where: { orgId: testOrgId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: NORM_CODE } });
      await prisma.contact.deleteMany({ where: { id: testContactId } });
      await prisma.auditLog.deleteMany({ where: { orgId: testOrgId } });
      // Notification rows may be created by dispatch
      await prisma.notification.deleteMany({ where: { orgId: testOrgId } });
      await prisma.notificationPref.deleteMany({
        where: { userId: { in: [testUserId, assigneeId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [testUserId, assigneeId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [testUserId, assigneeId] } },
      });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  it('1. should create a plan with draft status', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/inspection-plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        contactId: testContactId,
        projectName: 'E2E',
        normTypeCode: NORM_CODE,
        assignedTo: assigneeId,
        reviewerId: assigneeId,
      })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.statusCode).toBe('draft');
    createdPlanIds.push(res.body.data.id);
  });

  it('2. should move the plan to in_progress via PATCH', async () => {
    const planId = createdPlanIds[0];
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ statusCode: 'in_progress' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.statusCode).toBe('in_progress');
  });

  // M7 regression: an update that sets a FK via a Prisma relation-connect
  // (data.assignedUser = { connect }) must still surface the scalar FK change
  // (assignedTo) in the audit diff. The before-state select maps the relation key
  // back to its scalar column; without that the change silently dropped out.
  it('2b. records a relation-connect FK change in the audit diff', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/inspection-plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ contactId: testContactId, projectName: 'E2E Audit FK', normTypeCode: NORM_CODE })
      .expect(201);
    const planId = createRes.body.data.id;
    createdPlanIds.push(planId);

    // PATCH assignedTo → the service writes { assignedUser: { connect: { id } } }.
    await request(app.getHttpServer())
      .patch(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ assignedTo: assigneeId })
      .expect(200);

    const auditRes = await request(app.getHttpServer())
      .get(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(auditRes.body.data.assignedTo).toBe(assigneeId);

    const logsRes = await request(app.getHttpServer())
      .get(`/api/v1/audit-logs/InspectionPlan/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    const updateEntry = logsRes.body.data.data.find(
      (e: { action: string; changes: Record<string, unknown> | null }) =>
        e.action === 'UPDATE' && e.changes && 'assignedTo' in e.changes,
    );
    expect(updateEntry).toBeDefined();
    // `to` is FK-resolved to the assignee's display name — just assert it is set.
    expect(updateEntry.changes.assignedTo.to).toBeTruthy();
  });

  it('3. should reject submit from draft (400)', async () => {
    // Second plan stays in draft
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/inspection-plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        contactId: testContactId,
        projectName: 'E2E Draft',
        normTypeCode: NORM_CODE,
      })
      .expect(201);
    const draftPlanId = createRes.body.data.id;
    createdPlanIds.push(draftPlanId);

    await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${draftPlanId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(400);
  });

  it('4. should submit the in_progress plan to pending_review', async () => {
    const planId = createdPlanIds[0];
    const res = await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${planId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.statusCode).toBe('pending_review');
  });

  it('5. should approve the plan (review → approved)', async () => {
    const planId = createdPlanIds[0];
    const res = await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${planId}/review`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decision: 'approve' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.statusCode).toBe('approved');
  });

  it('6. should reject another plan (review → reviewed)', async () => {
    // Build a fresh plan and walk it: draft → in_progress → pending_review
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/inspection-plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        contactId: testContactId,
        projectName: 'E2E Reject',
        normTypeCode: NORM_CODE,
      })
      .expect(201);
    const planId = createRes.body.data.id;
    createdPlanIds.push(planId);

    await request(app.getHttpServer())
      .patch(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ statusCode: 'in_progress' })
      .expect(200);

    await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${planId}/submit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({})
      .expect(200);

    const res = await request(app.getHttpServer())
      .post(`/api/v1/inspection-plans/${planId}/review`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ decision: 'reject' })
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.statusCode).toBe('reviewed');
  });

  it('7. should list, get and delete plans', async () => {
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/inspection-plans')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.data.data)).toBe(true);
    expect(listRes.body.data.total).toBeGreaterThanOrEqual(
      createdPlanIds.length,
    );

    const planId = createdPlanIds[0];
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(getRes.body.success).toBe(true);
    expect(getRes.body.data.id).toBe(planId);

    await request(app.getHttpServer())
      .delete(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    // Soft-deleted → no longer retrievable
    await request(app.getHttpServer())
      .get(`/api/v1/inspection-plans/${planId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });

  // Vier-ogen-gate (PRD-13 §13.7): met de org-toggle aan (default) mag een plan
  // zonder menselijke review (reviewedAt leeg) niet naar completed/approved;
  // met de toggle uit gaat dezelfde transitie wél door.
  describe('8. four-eyes gate on update()', () => {
    let gatedPlanId: string;

    beforeAll(async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          contactId: testContactId,
          projectName: 'E2E Four Eyes',
          normTypeCode: NORM_CODE,
        })
        .expect(201);
      gatedPlanId = createRes.body.data.id;
      createdPlanIds.push(gatedPlanId);

      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${gatedPlanId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'in_progress' })
        .expect(200);
    });

    it('rejects completed without review while inspectionReviewEnabled=true (400)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${gatedPlanId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'completed' })
        .expect(400);
      expect(res.body.message).toContain('vier-ogen');
    });

    it('rejects approved without review as well (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${gatedPlanId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'approved' })
        .expect(400);
    });

    it('allows completed without review when inspectionReviewEnabled=false', async () => {
      await prisma.organization.update({
        where: { id: testOrgId },
        data: { inspectionReviewEnabled: false },
      });

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${gatedPlanId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ statusCode: 'completed' })
        .expect(200);
      expect(res.body.data.statusCode).toBe('completed');
    });
  });

  // Online herstel (PRD-14, besluit 1): het rapportnummer (referenceNumber) is de
  // anonieme toegangssleutel — de plan-vlag mag alleen aan wanneer het nummer
  // gevuld én (case-insensitief) uniek binnen de org is.
  describe('9. online herstel plan-vlag (PRD-14)', () => {
    const createPlan = async (referenceNumber?: string): Promise<string> => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/inspection-plans')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          contactId: testContactId,
          projectName: 'E2E Online Herstel',
          normTypeCode: NORM_CODE,
          ...(referenceNumber ? { referenceNumber } : {}),
        })
        .expect(201);
      createdPlanIds.push(res.body.data.id);
      return res.body.data.id;
    };

    it('weigert aanzetten zonder referenceNumber (400)', async () => {
      const planId = await createPlan();
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ onlineRepairEnabled: true })
        .expect(400);
      expect(res.body.message).toContain('rapportnummer');

      const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
      expect(plan?.onlineRepairEnabled).toBe(false);
    });

    it('weigert aanzetten met een duplicaat referenceNumber binnen de org (400)', async () => {
      await createPlan('E2E-OR-DUP');
      // Case-insensitieve botsing — de lookup matcht immers ook case-insensitief.
      const planId = await createPlan('e2e-or-dup');

      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ onlineRepairEnabled: true })
        .expect(400);
      expect(res.body.message).toContain('al in gebruik');
    });

    it('zet de vlag aan met een uniek referenceNumber (200)', async () => {
      const planId = await createPlan('E2E-OR-UNIEK');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/inspection-plans/${planId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ onlineRepairEnabled: true })
        .expect(200);
      expect(res.body.data.onlineRepairEnabled).toBe(true);
    });
  });
});
