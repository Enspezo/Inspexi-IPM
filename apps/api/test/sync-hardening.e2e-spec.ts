import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * WP-C3 — server-side sync-hardening (e2e).
 *
 * Covers, against a real database:
 *  - B-203: unknown/empty typeCode → per-record Dutch error (no 500, no leaked
 *    paths), and the additive `assigned[]` key carrying server nodeNumbers.
 *  - B-216: MAX_ASSET_DEPTH(10) enforced on new creates via /sync/push.
 *  - B-217 (A6-b): assignment role guard — INSPECTEUR cannot CHANGE
 *    reviewerId/assignedTo, echoes pass, WERKVOORBEREIDER may change.
 *  - B-218: a push to pending_review creates the INSPECTIEPLAN_TER_REVIEW
 *    notification row (recipient = reviewer) and fills submittedAt.
 *
 * Own org + own (org-scoped) type definitions, so the suite does not depend on
 * the seeded system definitions. Requests hit 127.0.0.1 (unknown host).
 */
describe('Sync hardening WP-C3 (e2e)', () => {
  jest.setTimeout(30000);

  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let inspecteurId: string;
  let plannerId: string;
  let contactId: string;
  let locationId: string;
  let planRoleId: string; // B-217 fixture (blijft in_progress)
  let planSubmitId: string; // B-218 fixture (gaat naar pending_review)
  let inspecteurToken: string;
  let plannerToken: string;

  const deviceId = 'wpc3-dev';
  const ASSET_TYPE = 'e2ewpc3asset';
  const LOC_TYPE = 'e2ewpc3loc';

  const push = (token: string, changes: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set('Authorization', `Bearer ${token}`)
      .send({ deviceId, clientTime: new Date().toISOString(), changes });

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
      data: { name: 'E2E WPC3 Org', slug: 'e2ewpc3org' },
    });
    orgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const inspecteur = await prisma.user.create({
      data: {
        email: 'e2e-wpc3-inspecteur@test.nl',
        passwordHash,
        firstName: 'WPC3',
        lastName: 'Inspecteur',
        roles: ['INSPECTEUR'],
        orgId,
        emailVerifiedAt: new Date(),
      },
    });
    inspecteurId = inspecteur.id;
    const planner = await prisma.user.create({
      data: {
        email: 'e2e-wpc3-planner@test.nl',
        passwordHash,
        firstName: 'WPC3',
        lastName: 'Planner',
        roles: ['WERKVOORBEREIDER'],
        orgId,
        emailVerifiedAt: new Date(),
      },
    });
    plannerId = planner.id;

    const contact = await prisma.contact.create({
      data: {
        orgId,
        type: 'COMPANY',
        companyName: 'E2E WPC3 Contact',
        email: 'e2e-wpc3-contact@test.nl',
        ownerId: inspecteur.id,
      },
    });
    contactId = contact.id;

    const location = await prisma.location.create({
      data: {
        contactId,
        orgId,
        name: 'E2E WPC3 Pand',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1234 AB',
        city: 'Testdam',
      },
    });
    locationId = location.id;

    // Org-eigen type-definities zodat de typeCode-validatie (B-203) niet op de
    // geseede systeem-definities leunt.
    await prisma.assetTypeDefinition.create({
      data: { orgId, code: ASSET_TYPE, shortCode: 'WPC', name: 'E2E WPC3 assettype' },
    });
    await prisma.locationTypeDefinition.create({
      data: { orgId, code: LOC_TYPE, shortCode: 'WPL', name: 'E2E WPC3 locatietype' },
    });

    const planRole = await prisma.inspectionPlan.create({
      data: {
        orgId,
        contactId,
        projectName: 'WPC3 rolguard-plan',
        normTypeCode: 'NEN1010',
        statusCode: 'in_progress',
        assignedTo: inspecteurId,
        reviewerId: plannerId,
        createdBy: plannerId,
      },
    });
    planRoleId = planRole.id;
    const planSubmit = await prisma.inspectionPlan.create({
      data: {
        orgId,
        contactId,
        projectName: 'WPC3 submit-plan',
        normTypeCode: 'NEN1010',
        statusCode: 'in_progress',
        assignedTo: inspecteurId,
        reviewerId: plannerId,
        createdBy: plannerId,
      },
    });
    planSubmitId = planSubmit.id;

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' });
      return res.body.data.accessToken as string;
    };
    inspecteurToken = await login('e2e-wpc3-inspecteur@test.nl');
    plannerToken = await login('e2e-wpc3-planner@test.nl');
  });

  afterAll(async () => {
    try {
      await prisma.notification.deleteMany({ where: { orgId } });
      await prisma.syncQueue.deleteMany({ where: { userId: { in: [inspecteurId, plannerId] } } });
      await prisma.assetNode.deleteMany({ where: { orgId } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId } });
      await prisma.location.deleteMany({ where: { orgId } });
      await prisma.contact.deleteMany({ where: { orgId } });
      await prisma.assetTypeDefinition.deleteMany({ where: { orgId } });
      await prisma.locationTypeDefinition.deleteMany({ where: { orgId } });
      await prisma.numberingCounter.deleteMany({ where: { scheme: { orgId } } });
      await prisma.numberingScheme.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: [inspecteurId, plannerId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [inspecteurId, plannerId] } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  // ── B-203: typeCode-validatie + assigned[] ──────────────────────────────
  describe('B-203 — typeCode validation & assigned nodeNumber', () => {
    it('rejects an UNKNOWN typeCode with a clean Dutch per-record error (no 500, no paths)', async () => {
      const nodeId = randomUUID();
      const res = await push(inspecteurToken, {
        assetNodes: [
          {
            operation: 'create',
            data: { id: nodeId, nodeType: 'ASSET', typeCode: 'test_child_only', name: 'INS12 Grenswaarde-asset' },
          },
        ],
      }).expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.processed.assetNodes).toBe(0);
      expect(res.body.data.errors).toHaveLength(1);
      const err = res.body.data.errors[0];
      expect(err.entityType).toBe('assetNode');
      expect(err.entityId).toBe(nodeId);
      expect(err.error).toBe('Onbekend assettype "test_child_only"');
      // B-212: geen implementatiedetails in de fout.
      expect(err.error).not.toContain('/Users/');
      expect(err.error).not.toContain('.ts');
      expect(err.error).not.toContain('prisma');

      const row = await prisma.assetNode.findUnique({ where: { id: nodeId } });
      expect(row).toBeNull();
    });

    it('rejects an EMPTY typeCode (the INS-09 `-0033` scenario) — no malformed number is minted', async () => {
      const nodeId = randomUUID();
      const res = await push(inspecteurToken, {
        assetNodes: [
          { operation: 'create', data: { id: nodeId, nodeType: 'ASSET', typeCode: '', name: 'INS09 Testkast' } },
        ],
      }).expect(201);

      expect(res.body.data.errors[0].error).toBe('Geen assettype opgegeven: kies een geldig type');
      expect(await prisma.assetNode.findUnique({ where: { id: nodeId } })).toBeNull();
      // Geen enkel misvormd nummer (leidend streepje) in deze org.
      const malformed = await prisma.assetNode.findFirst({
        where: { orgId, nodeNumber: { startsWith: '-' } },
      });
      expect(malformed).toBeNull();
    });

    it('returns the server-assigned nodeNumber in the additive assigned[] key', async () => {
      const rootId = randomUUID();
      const childId = randomUUID();
      const res = await push(inspecteurToken, {
        assetNodes: [
          {
            operation: 'create',
            data: { id: rootId, nodeType: 'LOCATION', typeCode: LOC_TYPE, name: 'WPC3 Wortel', rootLocationId: locationId },
          },
          {
            operation: 'create',
            data: { id: childId, nodeType: 'ASSET', typeCode: ASSET_TYPE, name: 'WPC3 Kast', parentId: rootId },
          },
        ],
      }).expect(201);

      expect(res.body.data.errors).toHaveLength(0);
      expect(res.body.data.processed.assetNodes).toBe(2);
      const assigned = res.body.data.assigned as Array<{ entityType: string; entityId: string; nodeNumber: string }>;
      expect(assigned).toHaveLength(2);
      const byId = new Map(assigned.map((a) => [a.entityId, a]));
      // LOCATION → LOC-####-schema; ASSET → [typecode]-#### met de org-shortcode.
      expect(byId.get(rootId)?.nodeNumber).toMatch(/^LOC-\d{4}$/);
      expect(byId.get(childId)?.nodeNumber).toMatch(/^WPC-\d{4}$/);

      // Idempotente retry van dezelfde create → zelfde nummer opnieuw in assigned[].
      const retry = await push(inspecteurToken, {
        assetNodes: [
          {
            operation: 'create',
            data: { id: childId, nodeType: 'ASSET', typeCode: ASSET_TYPE, name: 'WPC3 Kast', parentId: rootId },
          },
        ],
      }).expect(201);
      expect(retry.body.data.errors).toHaveLength(0);
      expect(retry.body.data.assigned).toEqual([
        { entityType: 'assetNode', entityId: childId, nodeNumber: byId.get(childId)?.nodeNumber },
      ]);
    });
  });

  // ── B-216: dieptegrens ──────────────────────────────────────────────────
  describe('B-216 — MAX_ASSET_DEPTH(10) on /sync/push', () => {
    it('accepts a chain down to depth 10 and refuses depth 11 with a Dutch error', async () => {
      // Eigen CRM-locatie voor deze boom (rootLocationId is 1:1 uniek).
      const chainLocation = await prisma.location.create({
        data: {
          contactId,
          orgId,
          name: 'E2E WPC3 Diepte-pand',
          street: 'Diepstraat',
          houseNumber: '7',
          postalCode: '1234 AB',
          city: 'Testdam',
        },
      });

      // Wortel (diepte 0) + 10 geneste assets → diepte 10: allemaal toegestaan.
      const rootId = randomUUID();
      const chain = Array.from({ length: 10 }, () => randomUUID());
      const creates = [
        {
          operation: 'create',
          data: {
            id: rootId,
            nodeType: 'LOCATION',
            typeCode: LOC_TYPE,
            name: 'INS07 wortel',
            rootLocationId: chainLocation.id,
          },
        },
        ...chain.map((id, i) => ({
          operation: 'create',
          data: {
            id,
            nodeType: 'ASSET',
            typeCode: ASSET_TYPE,
            name: `INS07 diepte ${i + 1}`,
            parentId: i === 0 ? rootId : chain[i - 1],
          },
        })),
      ];

      const res = await push(inspecteurToken, { assetNodes: creates }).expect(201);
      expect(res.body.data.errors).toHaveLength(0);
      expect(res.body.data.processed.assetNodes).toBe(11);

      const deepest = await prisma.assetNode.findUnique({ where: { id: chain[9] } });
      expect(deepest?.depth).toBe(10);

      // Diepte 11 → geweigerd, niets geschreven.
      const tooDeepId = randomUUID();
      const deep = await push(inspecteurToken, {
        assetNodes: [
          {
            operation: 'create',
            data: { id: tooDeepId, nodeType: 'ASSET', typeCode: ASSET_TYPE, name: 'INS07 diepte 11', parentId: chain[9] },
          },
        ],
      }).expect(201);

      expect(deep.body.data.processed.assetNodes).toBe(0);
      expect(deep.body.data.errors[0].error).toBe('Maximale nestdiepte (10) bereikt');
      expect(await prisma.assetNode.findUnique({ where: { id: tooDeepId } })).toBeNull();
    });
  });

  // ── B-217: toewijzings-rolguard (beslispunt A6-b) ───────────────────────
  describe('B-217 — assignment role guard', () => {
    it('INSPECTEUR cannot CHANGE reviewerId to himself (INS-41 repro)', async () => {
      const res = await push(inspecteurToken, {
        inspectionPlans: [
          { operation: 'update', data: { id: planRoleId, reviewerId: inspecteurId } },
        ],
      }).expect(201);

      expect(res.body.data.processed.inspectionPlans).toBe(0);
      expect(res.body.data.errors).toHaveLength(1);
      expect(res.body.data.errors[0].error).toBe(
        'Alleen management- of werkvoorbereidingsrollen mogen de toewijzing of beoordelaar van een inspectieplan wijzigen',
      );

      const row = await prisma.inspectionPlan.findUnique({ where: { id: planRoleId } });
      expect(row?.reviewerId).toBe(plannerId); // onaangetast
    });

    it('an UNCHANGED echo of reviewerId/assignedTo passes for INSPECTEUR (full-record PWA push)', async () => {
      const res = await push(inspecteurToken, {
        inspectionPlans: [
          {
            operation: 'update',
            data: {
              id: planRoleId,
              reviewerId: plannerId,
              assignedTo: inspecteurId,
              notes: 'Echo-push met ongewijzigde toewijzing',
            },
          },
        ],
      }).expect(201);

      expect(res.body.data.errors).toHaveLength(0);
      expect(res.body.data.processed.inspectionPlans).toBe(1);
    });

    it('WERKVOORBEREIDER (REVIEW_ROLES) may change the reviewer via sync', async () => {
      const res = await push(plannerToken, {
        inspectionPlans: [
          { operation: 'update', data: { id: planRoleId, reviewerId: plannerId, assignedTo: inspecteurId } },
        ],
      }).expect(201);

      expect(res.body.data.errors).toHaveLength(0);
      expect(res.body.data.processed.inspectionPlans).toBe(1);
    });
  });

  // ── B-218: submit-side-effects ──────────────────────────────────────────
  describe('B-218 — push to pending_review triggers the submit chain', () => {
    it('creates the INSPECTIEPLAN_TER_REVIEW notification for the reviewer and fills submittedAt', async () => {
      const res = await push(inspecteurToken, {
        inspectionPlans: [
          // Geen submittedAt in de payload: de server moet hem vullen (spiegel submit()).
          { operation: 'update', data: { id: planSubmitId, statusCode: 'pending_review' } },
        ],
      }).expect(201);

      expect(res.body.data.errors).toHaveLength(0);
      expect(res.body.data.processed.inspectionPlans).toBe(1);

      const row = await prisma.inspectionPlan.findUnique({ where: { id: planSubmitId } });
      expect(row?.statusCode).toBe('pending_review');
      expect(row?.submittedAt).not.toBeNull();

      // Notificatie-dispatch is fire-and-forget → kort pollen.
      let notification = null;
      for (let i = 0; i < 30 && !notification; i++) {
        notification = await prisma.notification.findFirst({
          where: {
            orgId,
            userId: plannerId,
            type: 'INSPECTIEPLAN_TER_REVIEW',
            entityType: 'inspectionPlan',
            entityId: planSubmitId,
          },
        });
        if (!notification) await new Promise((r) => setTimeout(r, 100));
      }
      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Inspectieplan ter review');
    });

    it('does not fire again on a pending_review echo', async () => {
      const before = await prisma.notification.count({
        where: { orgId, type: 'INSPECTIEPLAN_TER_REVIEW', entityId: planSubmitId },
      });

      const res = await push(inspecteurToken, {
        inspectionPlans: [
          { operation: 'update', data: { id: planSubmitId, statusCode: 'pending_review', notes: 'echo' } },
        ],
      }).expect(201);
      expect(res.body.data.errors).toHaveLength(0);

      // Even wachten en dan bevestigen dat er géén tweede notificatie bijkwam.
      await new Promise((r) => setTimeout(r, 500));
      const after = await prisma.notification.count({
        where: { orgId, type: 'INSPECTIEPLAN_TER_REVIEW', entityId: planSubmitId },
      });
      expect(after).toBe(before);
    });
  });
});
