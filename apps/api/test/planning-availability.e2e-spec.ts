import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * PRD-12 §12.9 — planning-integratie van de beschikbaarheid.
 *
 * Een DIENSTVERBAND-inspecteur met een ma–vr weekschema wordt op een volledig
 * geblokkeerde maandag toegewezen aan een planregel. Zonder override geeft dat
 * een 409 met een `warnings`-array; met `overrideAvailabilityWarnings: true`
 * lukt de toewijzing en verschijnt er een `AVAILABILITY_OVERRIDE`-history-record.
 *
 * Draait tegen 127.0.0.1 (unknown host) → TenantGuard/FeatureGuard laten door.
 */
describe('Planning availability integratie (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let adminId: string;
  let inspecteurId: string;
  let adminToken: string;
  let contactId: string;
  let planningItemId: string;

  // 2026-09-07 is een maandag (2026-07-20 + 7 weken).
  const BLOCKED_MONDAY = '2026-09-07';

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
      data: { name: 'E2E Plan Avail Org', slug: 'e2eplanavail' },
    });
    orgId = org.id;

    const admin = await prisma.user.create({
      data: {
        email: 'e2e-planavail-admin@test.nl',
        passwordHash,
        firstName: 'Plan',
        lastName: 'Admin',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const inspecteur = await prisma.user.create({
      data: {
        email: 'e2e-planavail-inspecteur@test.nl',
        passwordHash,
        firstName: 'Tom',
        lastName: 'Visser',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        employmentType: 'DIENSTVERBAND',
        emailVerifiedAt: new Date(),
      },
    });
    inspecteurId = inspecteur.id;

    const contact = await prisma.contact.create({
      data: { orgId: org.id, type: 'COMPANY', companyName: 'E2E Plan Contact' },
    });
    contactId = contact.id;

    // Weekschema ma–vr 08:00–17:30 + toewijzing.
    const template = await prisma.availabilityTemplate.create({
      data: {
        orgId: org.id,
        name: 'Plan-schema',
        slots: {
          create: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1050 })),
        },
      },
    });
    await prisma.userScheduleAssignment.create({
      data: {
        orgId: org.id,
        userId: inspecteur.id,
        templateId: template.id,
        validFrom: new Date('2026-01-01T00:00:00.000Z'),
        createdById: admin.id,
      },
    });

    // Volledige dagblokkade op de doelmaandag.
    await prisma.availabilityException.create({
      data: {
        orgId: org.id,
        userId: inspecteur.id,
        type: 'GEBLOKKEERD',
        isRecurring: false,
        startsAt: new Date(`${BLOCKED_MONDAY}T00:00:00.000Z`),
        endsAt: new Date('2026-09-08T00:00:00.000Z'),
        allDay: true,
        reason: 'Verlof',
        createdById: admin.id,
      },
    });

    adminToken = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email: 'e2e-planavail-admin@test.nl', password: 'TestPass123!' })
    ).body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.planningHistory.deleteMany({ where: { planningItem: { orgId } } });
      await prisma.planningSessionInspector.deleteMany({
        where: { session: { planningItem: { orgId } } },
      });
      await prisma.planningInspector.deleteMany({ where: { planningItem: { orgId } } });
      await prisma.planningSession.deleteMany({ where: { planningItem: { orgId } } });
      await prisma.planningItem.deleteMany({ where: { orgId } });
      await prisma.availabilityException.deleteMany({ where: { orgId } });
      await prisma.userScheduleAssignment.deleteMany({ where: { orgId } });
      await prisma.availabilityTemplateSlot.deleteMany({ where: { template: { orgId } } });
      await prisma.availabilityTemplate.deleteMany({ where: { orgId } });
      await prisma.contact.deleteMany({ where: { orgId } });
      await prisma.notification.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: [adminId, inspecteurId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [adminId, inspecteurId] } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  it('creates a planning item scheduled on the blocked monday', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/planning')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        contactId,
        productName: 'NEN3140 Inspectie',
        scheduledDate: `${BLOCKED_MONDAY}T09:00:00.000Z`,
        durationHours: 2,
      })
      .expect(201);
    planningItemId = res.body.data.id;
    expect(planningItemId).toBeDefined();
  });

  it('returns 409 with warnings when assigning the unavailable inspecteur', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/planning/${planningItemId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectorIds: [inspecteurId], primaryInspectorId: inspecteurId })
      .expect(409);

    expect(res.body.success).toBe(false);
    expect(Array.isArray(res.body.warnings)).toBe(true);
    expect(res.body.warnings).toHaveLength(1);
    const [warning] = res.body.warnings;
    expect(warning.userId).toBe(inspecteurId);
    expect(warning.name).toBe('Tom Visser');
    expect(warning.date).toBe(BLOCKED_MONDAY);
    expect(warning.reason).toBe('Verlof — hele dag geblokkeerd');

    // De toewijzing moet zijn afgebroken.
    const inspectors = await prisma.planningInspector.findMany({ where: { planningItemId } });
    expect(inspectors).toHaveLength(0);
  });

  it('assigns and logs AVAILABILITY_OVERRIDE when overrideAvailabilityWarnings is true', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/planning/${planningItemId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        inspectorIds: [inspecteurId],
        primaryInspectorId: inspecteurId,
        overrideAvailabilityWarnings: true,
      })
      .expect(201);

    const inspectors = await prisma.planningInspector.findMany({ where: { planningItemId } });
    expect(inspectors).toHaveLength(1);
    expect(inspectors[0].userId).toBe(inspecteurId);

    const override = await prisma.planningHistory.findFirst({
      where: { planningItemId, action: 'AVAILABILITY_OVERRIDE' },
    });
    expect(override).not.toBeNull();
    expect(override?.description).toContain('Tom Visser');
  });

  it('does not warn when assigning on an available (non-blocked) date', async () => {
    // Verplaats naar een vrije maandag (2026-09-14) → geen conflict, geen 409.
    const create = await request(app.getHttpServer())
      .post('/api/v1/planning')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        contactId,
        productName: 'NEN1010 Inspectie',
        scheduledDate: '2026-09-14T09:00:00.000Z',
        durationHours: 2,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/api/v1/planning/${create.body.data.id}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ inspectorIds: [inspecteurId], primaryInspectorId: inspecteurId })
      .expect(201);
  });
});
