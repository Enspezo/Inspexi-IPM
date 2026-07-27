import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Sync-CONTRACTsuite (WP-A2 · herstelplan §5).
 *
 * De bestaande e2e's maken records via REST, waar de routes ontbrekende velden
 * zelf invullen — precies waarom B-206 (visualInspectionId droeg een
 * checklist-item-id) en B-207 (templateVersion ontbrak) maandenlang onopgemerkt
 * bleven. Deze suite stuurt per entiteit een payload **exact zoals de
 * PWA-serializer hem produceert** (apps/inspectie-app/src/services/sync/push.ts
 * in de Inspexi-App-repo) naar POST /sync/push en assert de DB-rij én een lege
 * errors[].
 *
 * Dekking:
 *  - inspectionPlan (rest-spread-vorm incl. genegeerde extra sleutels),
 *  - assetNode (LOCATION-wortel + ASSET-kind, server-toegekend nodeNumber),
 *  - visualInspection + finding in ÉÉN batch (finding vóór VI in de envelope —
 *    de server verwerkt ouders eerst; B-206-keten),
 *  - measurementRecord, measurementSheetRecord (mét templateVersion; B-207),
 *  - regressies: oude foute finding-vorm → nette NL-melding (geen rauwe
 *    Prisma-P2003), meetstaat zónder templateVersion → nette NL-melding,
 *    numerieke templateVersion (legacy cache) → gecoerced naar string,
 *  - cross-tenant: finding → andermans VisualInspection wordt geweigerd.
 *
 * Requests raken 127.0.0.1 (unknown host) — TenantGuard scopet hier niet;
 * orgId wordt altijd server-side geïnjecteerd.
 */
describe('Sync contract — PWA-serialized payloads (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgAId: string;
  let userAId: string;
  let contactAId: string;
  let crmLocationAId: string;
  let token: string;

  // Cross-tenant fixtures (org B — alleen data, geen login nodig).
  let orgBId: string;
  let userBId: string;
  let contactBId: string;
  let orgBViId: string;

  // Client-generated ids (de PWA stuurt client-UUID's).
  let planId: string;
  let rootNodeId: string;
  let assetNodeId: string;
  let viId: string;
  let findingId: string;
  let checklistItemId: string;

  const deviceId = 'e2e-pwa-device-1';

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

    const orgA = await prisma.organization.create({
      data: { name: 'E2E SyncContract Org A', slug: 'e2esynccontracta' },
    });
    orgAId = orgA.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const userA = await prisma.user.create({
      data: {
        email: 'e2e-sync-contract-a@test.nl',
        passwordHash,
        firstName: 'Contract',
        lastName: 'Tester',
        roles: ['INSPECTEUR'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    userAId = userA.id;

    const contactA = await prisma.contact.create({
      data: {
        orgId: orgA.id,
        type: 'COMPANY',
        companyName: 'E2E SyncContract Contact A',
        email: 'e2e-sync-contract-contact@test.nl',
        ownerId: userA.id,
      },
    });
    contactAId = contactA.id;

    // CRM-hoofdlocatie: de boom-wortel voor het plan (treeCheck actief).
    const crmLocation = await prisma.location.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        name: 'E2E Contract Pand',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1234AB',
        city: 'Teststad',
      },
    });
    crmLocationAId = crmLocation.id;

    // Org B: een VisualInspection om cross-tenant tegen te toetsen.
    const orgB = await prisma.organization.create({
      data: { name: 'E2E SyncContract Org B', slug: 'e2esynccontractb' },
    });
    orgBId = orgB.id;
    const userB = await prisma.user.create({
      data: {
        email: 'e2e-sync-contract-b@test.nl',
        passwordHash,
        firstName: 'Andere',
        lastName: 'Org',
        roles: ['INSPECTEUR'],
        orgId: orgB.id,
        emailVerifiedAt: new Date(),
      },
    });
    userBId = userB.id;
    const contactB = await prisma.contact.create({
      data: {
        orgId: orgB.id,
        type: 'COMPANY',
        companyName: 'E2E SyncContract Contact B',
        email: 'e2e-sync-contract-contact-b@test.nl',
        ownerId: userB.id,
      },
    });
    contactBId = contactB.id;
    const planB = await prisma.inspectionPlan.create({
      data: {
        orgId: orgB.id,
        contactId: contactB.id,
        projectName: 'E2E Org B plan',
        normTypeCode: 'NEN1010',
      },
    });
    const nodeB = await prisma.assetNode.create({
      data: {
        orgId: orgB.id,
        nodeType: 'ASSET',
        typeCode: 'electrical_installation',
        name: 'Org B verdeler',
        nodeNumber: 'E2E-B-0001',
      },
    });
    const viB = await prisma.visualInspection.create({
      data: {
        orgId: orgB.id,
        assetNodeId: nodeB.id,
        inspectionPlanId: planB.id,
        status: 'in_progress',
      },
    });
    orgBViId = viB.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-sync-contract-a@test.nl', password: 'TestPass123!' });
    token = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId];
    const userIds = [userAId, userBId];

    try {
      // Children first (audited models schrijven auditLog-rijen).
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.standaloneMeasurement.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.visualInspection.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.measurementRecord.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.measurementSheetRecord.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.measurementSheetTemplate.deleteMany({ where: { createdBy: { in: userIds } } });
      await prisma.inspectionPlanLocation.deleteMany({ where: { inspectionPlan: { orgId: { in: orgIds } } } });
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.location.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      // Sync-creates van assetNodes provisioneren numbering-schemas (+counters).
      await prisma.numberingCounter.deleteMany({ where: { scheme: { orgId: { in: orgIds } } } });
      await prisma.numberingScheme.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.syncQueue.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await app.close();
    }
  });

  /** POST /sync/push met een 201-verwachting; retourneert de response-data. */
  async function push(changes: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, clientTime: new Date().toISOString(), changes })
      .expect(201);
    expect(res.body.success).toBe(true);
    return res.body.data as {
      processed: Record<string, number>;
      conflicts: unknown[];
      errors: Array<{ entityType: string; entityId: string; error: string }>;
    };
  }

  it('1. inspectionPlan — PWA rest-spread payload (incl. genegeerde extra sleutels) → DB-rij', async () => {
    planId = randomUUID();
    const nowIso = new Date().toISOString();

    // De PWA-plan-serializer is een rest-spread van het lokale record minus
    // orgId/_pendingSync/_deleted — lokale velden als createdAt/updatedAt en
    // het uit de pull afkomstige defaultInstrumentIds reizen dus MEE en moeten
    // door de whitelist genegeerd worden, niet geweigerd.
    const data = await push({
      inspectionPlans: [
        {
          operation: 'create',
          data: {
            id: planId,
            contactId: contactAId,
            locationId: crmLocationAId,
            projectName: 'E2E Contract Plan',
            description: 'Aangemaakt op het device',
            normTypeCode: 'NEN1010',
            inspectionTypeCode: 'initial',
            statusCode: 'in_progress',
            notes: 'PWA-notitie',
            createdAt: nowIso,
            updatedAt: nowIso,
            defaultInstrumentIds: [],
            deviceId,
          },
        },
      ],
    });

    expect(data.errors).toHaveLength(0);
    expect(data.conflicts).toHaveLength(0);
    expect(data.processed.inspectionPlans).toBe(1);

    const row = await prisma.inspectionPlan.findUnique({ where: { id: planId } });
    expect(row).not.toBeNull();
    expect(row?.orgId).toBe(orgAId);
    expect(row?.locationId).toBe(crmLocationAId);
    expect(row?.projectName).toBe('E2E Contract Plan');
    // createdBy is server-owned → de pushende JWT-gebruiker.
    expect(row?.createdBy).toBe(userAId);
  });

  it('2. assetNodes — LOCATION-wortel + ASSET-kind in serializeAssetNode-vorm → rijen + server-toegekend nodeNumber', async () => {
    rootNodeId = randomUUID();
    assetNodeId = randomUUID();

    // Exact de whitelist van serializeAssetNode (create): geen orgId/path/depth,
    // geen nodeNumber; parentId/rootLocationId expliciet null wanneer leeg.
    const data = await push({
      assetNodes: [
        {
          operation: 'create',
          data: {
            id: rootNodeId,
            nodeType: 'LOCATION',
            parentId: null,
            rootLocationId: crmLocationAId,
            typeCode: 'distribution_room',
            name: 'E2E Contract Pand (wortel)',
            technicalData: {},
            statusCode: 'new',
            sortOrder: 0,
            createdBy: userAId,
            deviceId,
          },
        },
        {
          operation: 'create',
          data: {
            id: assetNodeId,
            nodeType: 'ASSET',
            parentId: rootNodeId,
            rootLocationId: null,
            typeCode: 'electrical_installation',
            name: 'E2E Verdeler A1',
            identifier: 'VK-A1',
            description: 'Hoofdverdeler',
            technicalData: { voltage: '400V' },
            statusCode: 'new',
            sortOrder: 0,
            createdBy: userAId,
            deviceId,
          },
        },
      ],
    });

    expect(data.errors).toHaveLength(0);
    expect(data.processed.assetNodes).toBe(2);

    const root = await prisma.assetNode.findUnique({ where: { id: rootNodeId } });
    const asset = await prisma.assetNode.findUnique({ where: { id: assetNodeId } });
    expect(root?.orgId).toBe(orgAId);
    expect(root?.rootLocationId).toBe(crmLocationAId);
    expect(asset?.parentId).toBe(rootNodeId);
    // nodeNumber is server-toegekend (numbering-engine), nooit client-waarde.
    expect(root?.nodeNumber).toBeTruthy();
    expect(asset?.nodeNumber).toBeTruthy();
  });

  it('3. keten (B-206): finding + visualInspection in ÉÉN batch — finding eerst in de envelope — beide slagen', async () => {
    viId = randomUUID();
    findingId = randomUUID();
    checklistItemId = randomUUID();
    const nowIso = new Date().toISOString();

    // Envelope-volgorde is bewust "verkeerd om" (findings vóór visualInspections):
    // de server moet zijn eigen ouder-vóór-kind-verwerkingsvolgorde hanteren.
    const data = await push({
      findings: [
        {
          operation: 'create',
          data: {
            // Exact serializeFinding (create) ná de WP-A2-fix: VI-koppeling in
            // visualInspectionId, checklist-item in checklistItemId.
            id: findingId,
            assetNodeId,
            inspectionPlanId: planId,
            visualInspectionId: viId,
            inspectionType: 'visual',
            shortDescription: 'INS16 Beschadigde behuizing',
            longDescription: 'Scheur in de kap',
            classificationValues: { risico: 'kritiek' },
            recommendation: 'Direct vervangen',
            normReference: '',
            checklistItemId,
            statusCode: 'open',
            createdBy: userAId,
          },
        },
      ],
      visualInspections: [
        {
          operation: 'create',
          data: {
            // Exact serializeVisualInspection (create). inspectorId is een
            // client-waarde die de server moet NEGEREN (server-owned).
            id: viId,
            assetNodeId,
            inspectionPlanId: planId,
            status: 'completed',
            checklistResults: [
              {
                itemId: checklistItemId,
                templateItemId: checklistItemId,
                status: 'not_ok',
                checkedAt: nowIso,
                findingId,
              },
            ],
            startedAt: nowIso,
            completedAt: nowIso,
            inspectorId: 'gespoofte-waarde',
            deviceId,
          },
        },
      ],
    });

    expect(data.errors).toHaveLength(0);
    expect(data.processed.visualInspections).toBe(1);
    expect(data.processed.findings).toBe(1);

    const vi = await prisma.visualInspection.findUnique({ where: { id: viId } });
    expect(vi?.orgId).toBe(orgAId);
    // Server-owned: inspectorId = JWT-gebruiker, nooit de client-waarde.
    expect(vi?.inspectorId).toBe(userAId);
    expect(vi?.status).toBe('completed');
    const results = vi?.checklistResults as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe(checklistItemId);
    expect(results[0].findingId).toBe(findingId);

    const finding = await prisma.finding.findUnique({ where: { id: findingId } });
    expect(finding).not.toBeNull();
    expect(finding?.orgId).toBe(orgAId);
    expect(finding?.visualInspectionId).toBe(viId);
    expect(finding?.checklistItemId).toBe(checklistItemId);
    expect(finding?.createdBy).toBe(userAId);
    expect(finding?.shortDescription).toBe('INS16 Beschadigde behuizing');
  });

  it('4. measurementRecord — serializeMeasurementRecord-vorm (incl. lege inspectorId) → DB-rij', async () => {
    const mrId = randomUUID();
    const nowIso = new Date().toISOString();

    const data = await push({
      measurementRecords: [
        {
          operation: 'create',
          data: {
            id: mrId,
            assetNodeId,
            inspectionPlanId: planId,
            status: 'completed',
            measurements: [{ name: 'R_iso', value: 210, unit: 'MΩ' }],
            instrumentType: 'Metrel MI3155',
            instrumentSerial: 'SN-0001',
            startedAt: nowIso,
            completedAt: nowIso,
            // De PWA vult lokaal "" wanneer onbekend; server negeert + forceert.
            inspectorId: '',
            deviceId,
          },
        },
      ],
    });

    expect(data.errors).toHaveLength(0);
    expect(data.processed.measurementRecords).toBe(1);

    const row = await prisma.measurementRecord.findUnique({ where: { id: mrId } });
    expect(row?.orgId).toBe(orgAId);
    expect(row?.inspectorId).toBe(userAId);
    expect(row?.measurements).toEqual([{ name: 'R_iso', value: 210, unit: 'MΩ' }]);
  });

  it('5. measurementSheetRecord (B-207) — mét templateVersion + PWA-datavorm {sections:{…}} → DB-rij', async () => {
    const msrId = randomUUID();
    const tmpl = await prisma.measurementSheetTemplate.create({
      data: {
        code: `E2E-CT-${randomUUID().slice(0, 8)}`,
        name: 'E2E Contract Meetstaat',
        normTypeCode: 'NEN1010',
        createdBy: userAId,
      },
    });
    const nowIso = new Date().toISOString();

    const data = await push({
      measurementSheetRecords: [
        {
          operation: 'create',
          data: {
            // Exact serializeMeasurementSheetRecord (create) ná WP-A2:
            // templateVersion als string, data in de PWA-runtime-vorm.
            id: msrId,
            templateId: tmpl.id,
            assetNodeId,
            inspectionPlanId: planId,
            templateVersion: tmpl.version,
            templateSnapshot: { id: tmpl.id, version: tmpl.version, sections: [] },
            status: 'COMPLETED',
            data: {
              sections: {
                isolation: { rows: [{ group: 'Groep 1', r_iso: 2.5 }] },
              },
            },
            usedInstrumentIds: [],
            completedAt: nowIso,
            createdBy: userAId,
            deviceId,
          },
        },
      ],
    });

    expect(data.errors).toHaveLength(0);
    expect(data.processed.measurementSheetRecords).toBe(1);

    const row = await prisma.measurementSheetRecord.findUnique({ where: { id: msrId } });
    expect(row).not.toBeNull();
    expect(row?.orgId).toBe(orgAId);
    expect(row?.templateVersion).toBe(tmpl.version);
    expect(row?.createdBy).toBe(userAId);
    expect(row?.data).toEqual({
      sections: { isolation: { rows: [{ group: 'Groep 1', r_iso: 2.5 }] } },
    });
  });

  it('6. regressie B-206: finding met de OUDE foute vorm (visualInspectionId = checklist-item-id) → nette NL-400, geen 500, geen rij', async () => {
    const brokenId = randomUUID();
    // De bug schreef het checklist-item-id in visualInspectionId; zo'n record
    // bestaat niet in imp_visual_inspections.
    const bogusViId = randomUUID();

    const data = await push({
      findings: [
        {
          operation: 'create',
          data: {
            id: brokenId,
            assetNodeId,
            inspectionPlanId: planId,
            visualInspectionId: bogusViId,
            inspectionType: 'visual',
            shortDescription: 'Oude bugvorm',
            classificationValues: { risico: 'gering' },
            recommendation: 'n.v.t.',
            normReference: '',
            statusCode: 'open',
            createdBy: userAId,
          },
        },
      ],
    });

    expect(data.processed.findings).toBe(0);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].entityType).toBe('finding');
    expect(data.errors[0].entityId).toBe(brokenId);
    // Nederlandse melding — geen rauwe Prisma-tekst meer.
    expect(data.errors[0].error).toBe('Visuele inspectie niet gevonden');
    expect(data.errors[0].error).not.toMatch(/foreign key|prisma|invocation/i);

    expect(await prisma.finding.findUnique({ where: { id: brokenId } })).toBeNull();
  });

  it('7. regressie B-207: measurementSheetRecord zónder templateVersion → nette NL-melding, geen rauwe Prisma-fout', async () => {
    const msrId = randomUUID();
    const tmpl = await prisma.measurementSheetTemplate.create({
      data: {
        code: `E2E-CT-${randomUUID().slice(0, 8)}`,
        name: 'E2E Contract Meetstaat 2',
        normTypeCode: 'NEN1010',
        createdBy: userAId,
      },
    });

    const data = await push({
      measurementSheetRecords: [
        {
          operation: 'create',
          data: {
            // De pre-fix PWA-payload: templateVersion ontbreekt (undefined werd
            // door de serializer weggestript).
            id: msrId,
            templateId: tmpl.id,
            assetNodeId,
            inspectionPlanId: planId,
            templateSnapshot: { id: tmpl.id, version: tmpl.version, sections: [] },
            status: 'COMPLETED',
            data: { sections: {} },
            createdBy: userAId,
            deviceId,
          },
        },
      ],
    });

    expect(data.processed.measurementSheetRecords).toBe(0);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].entityType).toBe('measurementSheetRecord');
    expect(data.errors[0].error).toBe('Template-versie ontbreekt');
    expect(data.errors[0].error).not.toMatch(/argument|prisma|invocation/i);

    expect(
      await prisma.measurementSheetRecord.findUnique({ where: { id: msrId } }),
    ).toBeNull();
  });

  it('8. tolerantie: numerieke templateVersion (legacy PWA-cache) wordt als string gepersisteerd', async () => {
    const msrId = randomUUID();
    const tmpl = await prisma.measurementSheetTemplate.create({
      data: {
        code: `E2E-CT-${randomUUID().slice(0, 8)}`,
        name: 'E2E Contract Meetstaat 3',
        normTypeCode: 'NEN1010',
        createdBy: userAId,
      },
    });

    const data = await push({
      measurementSheetRecords: [
        {
          operation: 'create',
          data: {
            id: msrId,
            templateId: tmpl.id,
            assetNodeId,
            inspectionPlanId: planId,
            // Oudere caches droegen een numerieke versie (gedeelde typedef zegt
            // number) — de String-kolom mag daar niet op stranden.
            templateVersion: 1,
            templateSnapshot: { id: tmpl.id, version: 1, sections: [] },
            status: 'IN_PROGRESS',
            data: { sections: {} },
            createdBy: userAId,
            deviceId,
          },
        },
      ],
    });

    expect(data.errors).toHaveLength(0);
    const row = await prisma.measurementSheetRecord.findUnique({ where: { id: msrId } });
    expect(row?.templateVersion).toBe('1');
  });

  it('9. cross-tenant: finding dat naar andermans VisualInspection wijst wordt geweigerd', async () => {
    const crossId = randomUUID();

    const data = await push({
      findings: [
        {
          operation: 'create',
          data: {
            id: crossId,
            assetNodeId,
            inspectionPlanId: planId,
            visualInspectionId: orgBViId,
            inspectionType: 'visual',
            shortDescription: 'Cross-tenant poging',
            classificationValues: {},
            recommendation: 'n.v.t.',
            normReference: '',
            statusCode: 'open',
            createdBy: userAId,
          },
        },
      ],
    });

    expect(data.processed.findings).toBe(0);
    expect(data.errors).toHaveLength(1);
    expect(data.errors[0].error).toBe(
      'Visuele inspectie hoort niet bij uw organisatie',
    );
    expect(await prisma.finding.findUnique({ where: { id: crossId } })).toBeNull();
  });

  it('10. pull levert de gepushte keten terug (round-trip van het contract)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .query({ since: new Date(Date.now() - 3600_000).toISOString() })
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const d = res.body.data;
    expect(d.inspectionPlans.map((p: { id: string }) => p.id)).toContain(planId);
    expect(d.assetNodes.map((n: { id: string }) => n.id)).toContain(assetNodeId);
    expect(d.visualInspections.map((v: { id: string }) => v.id)).toContain(viId);
    const pulled = d.findings.find((f: { id: string }) => f.id === findingId);
    expect(pulled).toBeDefined();
    expect(pulled.visualInspectionId).toBe(viId);
    expect(pulled.checklistItemId).toBe(checklistItemId);
  });
});
