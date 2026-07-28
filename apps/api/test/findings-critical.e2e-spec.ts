import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

// Online herstel (PRD-14, besluit 8 + 9) — server-owned `Finding.isCritical`:
// afgeleid van classificationValues × ClassificationOption.isCritical van de
// toepasselijke classificatiemodellen, en de heropen-reset van
// InspectionPlan.criticalRepairNotifiedAt in findings.service.update().
// WP-B10 (B-222) voegt toe: REST-validatie van classificationValues (streng op
// nieuwe/gewijzigde waarden, tolerant voor een ongewijzigde legacy-echo) en de
// NORMTYPE-fallback voor plannen zonder inspectie-template.
jest.setTimeout(60000);

describe('Findings isCritical + heropen-reset (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let userId: string;
  let contactId: string;
  let locationId: string;
  let cmId: string;
  let planId: string;
  let planNoTemplateId: string;
  let assetId: string;
  let accessToken: string;

  const NORM_CODE = 'e2efcnorm';
  const createdFindingIds: string[] = [];

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
      data: { name: 'E2E FindCrit Org', slug: 'e2efindcrit' },
    });
    orgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-findcrit@test.nl',
        passwordHash,
        firstName: 'Crit',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    userId = user.id;

    const contact = await prisma.contact.create({
      data: { orgId: org.id, type: 'COMPANY', companyName: 'E2E FindCrit Contact' },
    });
    contactId = contact.id;

    const location = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E FindCrit Locatie',
        street: 'Kritstraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Kritstad',
      },
    });
    locationId = location.id;

    // Classificatiemodel met één kritieke optie (C1) en één niet-kritieke (C3).
    const cm = await prisma.classificationModel.create({
      data: {
        code: 'E2EFCCM',
        name: 'E2E FindCrit Classificatiemodel',
        createdBy: user.id,
        characteristics: {
          create: [
            {
              code: 'SEVERITY',
              name: 'Ernst',
              options: {
                create: [
                  { code: 'C1', name: 'Direct gevaar', color: '#dc2626', isCritical: true },
                  { code: 'C3', name: 'Aanbeveling', color: '#ca8a04', isCritical: false },
                ],
              },
            },
          ],
        },
      },
    });
    cmId = cm.id;

    // WP-B10: het normtype draagt hetzelfde model als default → plannen zonder
    // inspectie-template bereiken het model via de normtype-fallback.
    await prisma.normTypeDefinition.create({
      data: {
        code: NORM_CODE,
        label: 'E2E FindCrit Norm',
        createdBy: user.id,
        assetTypes: [],
        classificationModelId: cm.id,
      },
    });

    // Het plan bereikt het classificatiemodel via zijn inspectionTemplate.
    const template = await prisma.inspectionTemplate.create({
      data: {
        orgId: org.id,
        code: 'E2EFC',
        name: 'E2E FindCrit Template',
        normTypeCode: NORM_CODE,
        classificationModelId: cm.id,
        createdBy: user.id,
      },
    });

    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: location.id,
        inspectionTemplateId: template.id,
        projectName: 'E2E FindCrit Plan',
        normTypeCode: NORM_CODE,
        createdBy: user.id,
      },
    });
    planId = plan.id;

    // WP-B10: tweede plan ZONDER template — model komt via de normtype-fallback.
    const planNoTemplate = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: location.id,
        projectName: 'E2E FindCrit Plan (geen template)',
        normTypeCode: NORM_CODE,
        createdBy: user.id,
      },
    });
    planNoTemplateId = planNoTemplate.id;

    // AssetNode-boom: parent vóór child (DB-triggers vullen path/depth).
    const rootNode = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'LOCATION',
        rootLocationId: location.id,
        typeCode: 'locatie',
        name: 'Wortel',
        createdBy: user.id,
      },
    });
    const asset = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'ASSET',
        parentId: rootNode.id,
        typeCode: 'kast',
        name: 'Asset',
        createdBy: user.id,
      },
    });
    assetId = asset.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-findcrit@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.finding.deleteMany({ where: { orgId } });
      await prisma.assetNode.deleteMany({ where: { orgId } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId } });
      await prisma.inspectionTemplate.deleteMany({ where: { orgId } });
      await prisma.classificationModel.deleteMany({ where: { id: cmId } });
      await prisma.normTypeDefinition.deleteMany({ where: { code: NORM_CODE } });
      await prisma.location.deleteMany({ where: { id: locationId } });
      await prisma.contact.deleteMany({ where: { id: contactId } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  const createFinding = async (
    classificationValues?: Record<string, string>,
    targetPlanId: string = planId,
  ) => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/assets/${assetId}/findings`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        inspectionPlanId: targetPlanId,
        inspectionType: 'visual',
        shortDescription: 'E2E crit finding',
        ...(classificationValues ? { classificationValues } : {}),
      })
      .expect(201);
    createdFindingIds.push(res.body.data.id);
    return res.body.data.id as string;
  };

  const patchFinding = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/api/v1/findings/${id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send(body);

  describe('isCritical-berekening (server-owned)', () => {
    it('zet isCritical=true bij een classificatiewaarde met een kritieke optie', async () => {
      const id = await createFinding({ SEVERITY: 'C1' });
      const finding = await prisma.finding.findUnique({ where: { id } });
      expect(finding?.isCritical).toBe(true);
    });

    it('laat isCritical=false bij een niet-kritieke optie', async () => {
      const id = await createFinding({ SEVERITY: 'C3' });
      const finding = await prisma.finding.findUnique({ where: { id } });
      expect(finding?.isCritical).toBe(false);
    });

    it('herberekent isCritical wanneer de classificatie via PATCH wijzigt', async () => {
      const id = await createFinding({ SEVERITY: 'C3' });

      await patchFinding(id, { classificationValues: { SEVERITY: 'C1' } }).expect(200);
      let finding = await prisma.finding.findUnique({ where: { id } });
      expect(finding?.isCritical).toBe(true);

      await patchFinding(id, { classificationValues: { SEVERITY: 'C3' } }).expect(200);
      finding = await prisma.finding.findUnique({ where: { id } });
      expect(finding?.isCritical).toBe(false);
    });

    it('WP-B10: normtype-fallback — plan zonder inspectie-template bereikt het model via het normtype', async () => {
      const id = await createFinding({ SEVERITY: 'C1' }, planNoTemplateId);
      const finding = await prisma.finding.findUnique({ where: { id } });
      expect(finding?.isCritical).toBe(true);
    });
  });

  describe('WP-B10 (B-222): validatie van classificationValues (REST)', () => {
    it('weigert fictief vocabulaire op een nieuwe finding met een NL-400', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/assets/${assetId}/findings`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          inspectionPlanId: planId,
          inspectionType: 'visual',
          shortDescription: 'Legacy vocabulaire',
          classificationValues: { risico: 'kritiek' },
        })
        .expect(400);
      expect(res.body.message).toContain('Classificatie ongeldig');
      expect(res.body.message).toContain(
        "kenmerk 'risico' bestaat niet in het classificatiemodel",
      );
    });

    it('weigert een PATCH die de classificatie naar onbekende codes wijzigt', async () => {
      const id = await createFinding({ SEVERITY: 'C3' });
      const res = await patchFinding(id, {
        classificationValues: { SEVERITY: 'C9' },
      }).expect(400);
      expect(res.body.message).toContain("optie 'C9' is onbekend voor kenmerk 'SEVERITY'");
    });

    it('staat een ongewijzigde legacy-echo op een PATCH toe (fasering)', async () => {
      // Legacy record rechtstreeks in de DB (pre-fix toestand).
      const legacy = await prisma.finding.create({
        data: {
          orgId,
          assetNodeId: assetId,
          inspectionPlanId: planId,
          inspectionType: 'visual',
          shortDescription: 'Legacy record',
          classificationValues: { risico: 'gering' },
          statusCode: 'open',
          createdBy: userId,
        },
      });
      createdFindingIds.push(legacy.id);

      // Zelfde waarden + een andere veldwijziging → toegestaan.
      await patchFinding(legacy.id, {
        classificationValues: { risico: 'gering' },
        shortDescription: 'Legacy record — bijgewerkt',
      }).expect(200);

      const row = await prisma.finding.findUnique({ where: { id: legacy.id } });
      expect(row?.shortDescription).toBe('Legacy record — bijgewerkt');
      expect(row?.isCritical).toBe(false);
    });
  });

  describe('heropen-reset van criticalRepairNotifiedAt (PRD-14 besluit 9)', () => {
    it('maakt criticalRepairNotifiedAt leeg wanneer een kritieke constatering heropend wordt', async () => {
      const id = await createFinding({ SEVERITY: 'C1' });

      // resolved → daarna markeren we het plan handmatig als "herinspectie gemeld".
      await patchFinding(id, { statusCode: 'resolved', resolutionNotes: 'Hersteld' }).expect(200);
      await prisma.inspectionPlan.update({
        where: { id: planId },
        data: { criticalRepairNotifiedAt: new Date() },
      });

      // Heropenen → de eenmalige trigger moet opnieuw kunnen vuren.
      await patchFinding(id, { statusCode: 'open' }).expect(200);
      const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
      expect(plan?.criticalRepairNotifiedAt).toBeNull();
    });

    it('laat criticalRepairNotifiedAt staan bij heropenen van een NIET-kritieke constatering', async () => {
      const id = await createFinding({ SEVERITY: 'C3' });

      await patchFinding(id, { statusCode: 'resolved', resolutionNotes: 'Hersteld' }).expect(200);
      const marker = new Date('2026-07-01T10:00:00.000Z');
      await prisma.inspectionPlan.update({
        where: { id: planId },
        data: { criticalRepairNotifiedAt: marker },
      });

      await patchFinding(id, { statusCode: 'open' }).expect(200);
      const plan = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
      expect(plan?.criticalRepairNotifiedAt).toEqual(marker);
    });
  });
});
