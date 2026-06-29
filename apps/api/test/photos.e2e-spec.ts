import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Photos upload/download suite (Fase 3).
 *
 * Org A owns a plan + asset; uploads a photo on the asset and downloads it.
 * Org B's user must NOT be able to download org A's photo (org-scoped stream).
 *
 * Requests hit 127.0.0.1 (unknown host) so the TenantGuard does not scope
 * these; the org-scope under test is the photos service's own check.
 */
describe('Photos upload/download (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Org A (owner)
  let orgAId: string;
  let userAId: string;
  let contactAId: string;
  let locationAId: string;
  let planAId: string;
  let assetAId: string;
  let tokenA: string;

  // Org B (cross-org probe)
  let orgBId: string;
  let userBId: string;
  let tokenB: string;

  let photoId: string;

  // A minimal but valid JPEG SOI marker so any magic-byte sniffing passes.
  const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

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

    const passwordHash = await bcrypt.hash('TestPass123!', 10);

    // ─── Org A (owner) ──────────────────────────────────
    const orgA = await prisma.organization.create({
      data: { name: 'E2E Photos Org A', slug: 'e2ephotosorga' },
    });
    orgAId = orgA.id;

    const userA = await prisma.user.create({
      data: {
        email: 'e2e-photos-a@test.nl',
        passwordHash,
        firstName: 'Photo',
        lastName: 'A',
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
        companyName: 'E2E Photos Contact A',
        email: 'e2e-photos-contact@test.nl',
        ownerId: userA.id,
      },
    });
    contactAId = contactA.id;

    // CRM-Locatie = hoofdlocatie / boom-wortel van de AssetNode-boom.
    const locationA = await prisma.location.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        name: 'Photos Locatie A',
        street: 'Teststraat',
        houseNumber: '1',
        postalCode: '1000AA',
        city: 'Teststad',
      },
    });
    locationAId = locationA.id;

    const planA = await prisma.inspectionPlan.create({
      data: {
        orgId: orgA.id,
        contactId: contactA.id,
        locationId: locationA.id,
        projectName: 'Photos Plan A',
        normTypeCode: 'NEN1010',
        createdBy: userA.id,
      },
    });
    planAId = planA.id;

    // AssetNode-boom: wortel-LOCATION-node → ASSET-node (parent vóór child).
    const rootNodeA = await prisma.assetNode.create({
      data: {
        orgId: orgA.id,
        nodeType: 'LOCATION',
        rootLocationId: locationA.id,
        typeCode: 'locatie',
        name: 'Wortel',
        createdBy: userA.id,
      },
    });

    const assetNodeA = await prisma.assetNode.create({
      data: {
        orgId: orgA.id,
        nodeType: 'ASSET',
        parentId: rootNodeA.id,
        typeCode: 'kast',
        name: 'Photos Asset A',
        createdBy: userA.id,
      },
    });
    assetAId = assetNodeA.id;

    // ─── Org B (cross-org probe) ────────────────────────
    const orgB = await prisma.organization.create({
      data: { name: 'E2E Photos Org B', slug: 'e2ephotosorgb' },
    });
    orgBId = orgB.id;

    const userB = await prisma.user.create({
      data: {
        email: 'e2e-photos-b@test.nl',
        passwordHash,
        firstName: 'Photo',
        lastName: 'B',
        roles: ['INSPECTEUR'],
        orgId: orgB.id,
        emailVerifiedAt: new Date(),
      },
    });
    userBId = userB.id;

    const loginA = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-photos-a@test.nl', password: 'TestPass123!' });
    tokenA = loginA.body.data.accessToken;

    const loginB = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-photos-b@test.nl', password: 'TestPass123!' });
    tokenB = loginB.body.data.accessToken;
  });

  afterAll(async () => {
    const orgIds = [orgAId, orgBId];
    const userIds = [userAId, userBId];

    try {
      // Children first. AssetNode.parentId is SET NULL, so a single deleteMany
      // clears the whole tree (root LOCATION + ASSET nodes).
      await prisma.photo.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.finding.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.assetNode.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.inspectionPlan.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.location.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
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

  it('1. uploads a jpeg on an asset → id/url/thumbnailUrl, org-scoped', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/photos/upload')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('entityType', 'asset')
      .field('entityId', assetAId)
      .attach('file', jpegBuffer, { filename: 'photo.jpg', contentType: 'image/jpeg' })
      .expect(201);

    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.url).toBeDefined();
    expect(res.body.data.thumbnailUrl).toBeDefined();
    photoId = res.body.data.id;

    const persisted = await prisma.photo.findUnique({ where: { id: photoId } });
    expect(persisted).not.toBeNull();
    expect(persisted?.orgId).toBe(orgAId);
  });

  it('2. rejects a non-image mime type (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/photos/upload')
      .set('Authorization', `Bearer ${tokenA}`)
      .field('entityType', 'asset')
      .field('entityId', assetAId)
      .attach('file', Buffer.from('x'), { filename: 'x.pdf', contentType: 'application/pdf' })
      .expect(400);
  });

  it('3. downloads its own org photo (200, image/jpeg)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/photos/${photoId}/download`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);

    expect(res.headers['content-type']).toContain('image/jpeg');
  });

  it('4. cross-org download is rejected (404)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/photos/${photoId}/download`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });
});
