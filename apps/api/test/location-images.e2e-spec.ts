import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

// NB: deze suite vereist STORAGE_DRIVER=local (default LocalStorageProvider →
// schrijft naar ./uploads). Dat werkt in de testomgeving.
//
// AssetNode-boom: de `:locationId` padparameter is een LOCATION-node-id (een
// AssetNode met nodeType LOCATION), niet meer een CRM-Location. LocationImage
// hangt 1:1 onder die node (LocationImage.nodeId @unique); markers verwijzen via
// LocationImageMarker.assetNodeId / findingId.
describe('LocationImages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let testUserId: string;
  let testOrgId: string;
  let testContactId: string;
  let testNormTypeId: string;
  let testPlanId: string;
  let testAssetTypeId: string;
  let testLocationTypeId: string;
  let testCrmLocationId: string;
  let testLocationNodeId: string; // LOCATION-node = `:locationId` padparameter
  let testAssetId: string; // ASSET-node onder de LOCATION-node (voor markers)
  let accessToken: string;

  let imageId: string;
  const createdMarkerIds: string[] = [];
  const createdAssetIds: string[] = [];
  const createdFindingIds: string[] = [];
  const createdMeasurementIds: string[] = [];

  // Minimaal geldige 1x1 PNG.
  const pngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  );

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
      data: { name: 'E2E LocImg Org', slug: 'e2elocimg' },
    });
    testOrgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const user = await prisma.user.create({
      data: {
        email: 'e2e-locimg@test.nl',
        passwordHash,
        firstName: 'LocImg',
        lastName: 'Tester',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    testUserId = user.id;

    const contact = await prisma.contact.create({
      data: {
        orgId: org.id,
        type: 'COMPANY',
        companyName: 'E2E LocImg Contact',
        email: 'e2e-locimg-contact@test.nl',
        ownerId: user.id,
      },
    });
    testContactId = contact.id;

    const normType = await prisma.normTypeDefinition.create({
      data: { code: 'e2elinorm', label: 'E2E LI Norm', createdBy: user.id, isActive: true, assetTypes: [] },
    });
    testNormTypeId = normType.id;

    // CRM-Locatie = hoofdlocatie / boom-wortel van de AssetNode-boom.
    const crmLocation = await prisma.location.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        name: 'E2E LocImg Locatie',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    testCrmLocationId = crmLocation.id;

    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        locationId: crmLocation.id,
        projectName: 'E2E LocImg Plan',
        normTypeCode: 'e2elinorm',
        createdBy: user.id,
      },
    });
    testPlanId = plan.id;

    const assetType = await prisma.assetTypeDefinition.create({
      data: { orgId: org.id, code: 'e2elikast', name: 'Kast', isSystem: false },
    });
    testAssetTypeId = assetType.id;

    const locationType = await prisma.locationTypeDefinition.create({
      data: { orgId: org.id, code: 'e2eliruimte', name: 'Ruimte', isSystem: false },
    });
    testLocationTypeId = locationType.id;

    // Wortel-LOCATION-node (1:1 met de CRM-Locatie). Dit is de `:locationId` die
    // de image- en marker-endpoints verwachten. PARENT BEFORE CHILD.
    const locationNode = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'LOCATION',
        rootLocationId: crmLocation.id,
        typeCode: 'e2eliruimte',
        name: 'Meterkast',
        createdBy: user.id,
      },
    });
    testLocationNodeId = locationNode.id;

    // De LOCATION-node in scope van het plan brengen, zodat snelacties
    // (quick-asset/-finding/-measurement) een plan-id kunnen resolven.
    await prisma.inspectionPlanLocation.create({
      data: {
        orgId: org.id,
        inspectionPlanId: plan.id,
        assetNodeId: locationNode.id,
        isPrimary: true,
      },
    });

    // ASSET-node onder de LOCATION-node (voor quick-finding die een bestaande
    // assetId nodig heeft).
    const asset = await prisma.assetNode.create({
      data: {
        orgId: org.id,
        nodeType: 'ASSET',
        parentId: locationNode.id,
        typeCode: 'e2elikast',
        name: 'Bestaande kast',
        createdBy: user.id,
      },
    });
    testAssetId = asset.id;

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-locimg@test.nl', password: 'TestPass123!' });
    accessToken = loginRes.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.locationImageMarker.deleteMany({ where: { id: { in: createdMarkerIds } } });
      if (imageId) {
        await prisma.locationImageMarker.deleteMany({ where: { locationImageId: imageId } });
      }
      await prisma.locationImage.deleteMany({ where: { nodeId: testLocationNodeId } });
      await prisma.standaloneMeasurement.deleteMany({
        where: { id: { in: createdMeasurementIds } },
      });
      await prisma.finding.deleteMany({ where: { id: { in: createdFindingIds } } });
      // AssetNode.parentId is SET NULL, dus een enkele deleteMany ruimt de hele
      // boom op (wortel-LOCATION + ASSET-nodes, incl. quick-created assets).
      await prisma.inspectionPlanLocation.deleteMany({ where: { orgId: testOrgId } });
      await prisma.assetNode.deleteMany({ where: { orgId: testOrgId } });
      await prisma.locationTypeDefinition.deleteMany({ where: { id: testLocationTypeId } });
      await prisma.assetTypeDefinition.deleteMany({ where: { id: testAssetTypeId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: testPlanId } });
      await prisma.normTypeDefinition.deleteMany({ where: { id: testNormTypeId } });
      await prisma.location.deleteMany({ where: { id: testCrmLocationId } });
      await prisma.contact.deleteMany({ where: { id: testContactId } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.refreshToken.deleteMany({ where: { userId: testUserId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      await prisma.organization.deleteMany({ where: { id: testOrgId } });
    } finally {
      await app.close();
    }
  });

  describe('POST /api/v1/locations/:locationId/image', () => {
    it('uploads an image for the location', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/locations/${testLocationNodeId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', pngBuffer, { filename: 'plan.png', contentType: 'image/png' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.nodeId).toBe(testLocationNodeId);
      expect(res.body.data.storagePath).toMatch(new RegExp(`^${testOrgId}/`));
      imageId = res.body.data.id;
    });

    it('returns 401 without authentication', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/locations/${testLocationNodeId}/image`)
        .attach('file', pngBuffer, { filename: 'plan.png', contentType: 'image/png' })
        .expect(401);
    });

    it('rejects a non-image file (422)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/locations/${testLocationNodeId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', Buffer.from('not an image'), {
          filename: 'note.txt',
          contentType: 'text/plain',
        })
        .expect(422);
    });

    it('returns 404 for a location in another org', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/locations/00000000-0000-0000-0000-000000000000/image')
        .set('Authorization', `Bearer ${accessToken}`)
        .attach('file', pngBuffer, { filename: 'plan.png', contentType: 'image/png' })
        .expect(404);
    });
  });

  describe('GET /api/v1/locations/:locationId/image', () => {
    it('returns the image with markers', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/locations/${testLocationNodeId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(imageId);
      expect(Array.isArray(res.body.data.markers)).toBe(true);
    });
  });

  describe('GET /api/v1/locations/:locationId/image/file', () => {
    it('streams the raw image bytes inline', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/locations/${testLocationNodeId}/image/file`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.headers['content-type']).toContain('image/png');
      expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
    });

    it('returns 404 for a location in another org', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/locations/00000000-0000-0000-0000-000000000000/image/file')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('POST /api/v1/location-images/:imageId/markers', () => {
    it('creates an ASSET marker referencing the seeded asset', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/location-images/${imageId}/markers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ positionX: 25, positionY: 40, markerType: 'ASSET', assetId: testAssetId })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.markerType).toBe('ASSET');
      expect(res.body.data.assetNodeId).toBe(testAssetId);
      createdMarkerIds.push(res.body.data.id);
    });

    it('returns 400 for an ASSET marker without assetId', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/location-images/${imageId}/markers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ positionX: 10, positionY: 10, markerType: 'ASSET' })
        .expect(400);
    });
  });

  describe('PATCH /api/v1/location-images/:imageId/markers/:markerId', () => {
    it('updates the marker label and position', async () => {
      const markerId = createdMarkerIds[0];
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/location-images/${imageId}/markers/${markerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ label: 'Hoofdkast', positionX: 30 })
        .expect(200);

      expect(res.body.data.label).toBe('Hoofdkast');
      expect(res.body.data.positionX).toBe(30);
    });
  });

  describe('POST /api/v1/location-images/:imageId/quick-asset', () => {
    it('creates an asset under the plan and an ASSET marker', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/location-images/${imageId}/quick-asset`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ positionX: 50, positionY: 50, assetType: 'e2elikast', name: 'Snelle kast' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.asset.id).toBeDefined();
      expect(res.body.data.marker.markerType).toBe('ASSET');
      expect(res.body.data.marker.assetNodeId).toBe(res.body.data.asset.id);
      createdAssetIds.push(res.body.data.asset.id);
      createdMarkerIds.push(res.body.data.marker.id);
    });
  });

  describe('POST /api/v1/location-images/:imageId/quick-finding', () => {
    it('creates a finding under the seeded asset and a FINDING marker', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/location-images/${imageId}/quick-finding`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          positionX: 60,
          positionY: 60,
          assetId: testAssetId,
          inspectionType: 'visual',
          shortDescription: 'Snelle constatering',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.finding.id).toBeDefined();
      expect(res.body.data.marker.markerType).toBe('FINDING');
      expect(res.body.data.marker.findingId).toBe(res.body.data.finding.id);
      createdFindingIds.push(res.body.data.finding.id);
      createdMarkerIds.push(res.body.data.marker.id);
    });
  });

  describe('POST /api/v1/location-images/:imageId/quick-measurement', () => {
    it('creates a standalone measurement under the location and a MEASUREMENT marker', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/location-images/${imageId}/quick-measurement`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ positionX: 70, positionY: 70, measurementType: 'isolatiemeting' })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.measurement.id).toBeDefined();
      expect(res.body.data.marker.markerType).toBe('MEASUREMENT');
      expect(res.body.data.marker.standaloneMeasurementId).toBe(res.body.data.measurement.id);
      createdMeasurementIds.push(res.body.data.measurement.id);
      createdMarkerIds.push(res.body.data.marker.id);
    });
  });

  describe('GET /api/v1/location-images/:imageId/markers', () => {
    it('lists all markers created so far', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/location-images/${imageId}/markers`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('DELETE /api/v1/location-images/:imageId/markers/:markerId', () => {
    it('deletes a single marker', async () => {
      const markerId = createdMarkerIds[0];
      await request(app.getHttpServer())
        .delete(`/api/v1/location-images/${imageId}/markers/${markerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      createdMarkerIds.shift();
    });
  });

  describe('DELETE /api/v1/locations/:locationId/image', () => {
    it('deletes the image (markers cascade) and then GET returns 404', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/locations/${testLocationNodeId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      // Markers cascaded → no longer present to clean up explicitly.
      createdMarkerIds.length = 0;
      imageId = '';

      await request(app.getHttpServer())
        .get(`/api/v1/locations/${testLocationNodeId}/image`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });
});
