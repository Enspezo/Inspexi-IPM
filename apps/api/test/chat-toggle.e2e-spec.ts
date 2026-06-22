import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * REQ1 — per-organization chat on/off, toggleable by ORG_ADMIN and SUPERUSER.
 * When disabled: chat reads return empty, chat writes 403, and /sync exposes no chat.
 */
describe('Chat toggle (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let org2Id: string;
  let adminId: string;
  let inspectorId: string;
  let superuserId: string;
  let foreignAdminId: string;
  let adminToken: string;
  let inspectorToken: string;
  let superuserToken: string;
  let foreignAdminToken: string;
  let threadId: string;

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const setChat = (token: string, enabled: boolean) =>
    request(app.getHttpServer())
      .patch(`/api/v1/organizations/${orgId}`)
      .set(auth(token))
      .send({ chatEnabled: enabled });

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
      data: { name: 'E2E ChatToggle Org', slug: 'e2echattoggleorg' },
    });
    orgId = org.id;

    adminId = (
      await prisma.user.create({
        data: { email: 'e2e-ctg-admin@test.nl', passwordHash, firstName: 'Ad', lastName: 'Min', roles: ['ORG_ADMIN'], orgId, emailVerifiedAt: new Date() },
      })
    ).id;
    inspectorId = (
      await prisma.user.create({
        data: { email: 'e2e-ctg-insp@test.nl', passwordHash, firstName: 'In', lastName: 'Sp', roles: ['INSPECTEUR'], orgId, emailVerifiedAt: new Date() },
      })
    ).id;
    superuserId = (
      await prisma.user.create({
        data: { email: 'e2e-ctg-su@test.nl', passwordHash, firstName: 'Su', lastName: 'Per', roles: ['SUPERUSER'], emailVerifiedAt: new Date() },
      })
    ).id;

    // Second org + its admin — to prove an admin can't toggle a foreign org.
    const org2 = await prisma.organization.create({
      data: { name: 'E2E ChatToggle Org2', slug: 'e2echattoggleorg2' },
    });
    org2Id = org2.id;
    foreignAdminId = (
      await prisma.user.create({
        data: { email: 'e2e-ctg-foreign@test.nl', passwordHash, firstName: 'Fo', lastName: 'Reign', roles: ['ORG_ADMIN'], orgId: org2.id, emailVerifiedAt: new Date() },
      })
    ).id;

    const login = async (email: string) =>
      (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'TestPass123!' })).body.data.accessToken as string;
    adminToken = await login('e2e-ctg-admin@test.nl');
    inspectorToken = await login('e2e-ctg-insp@test.nl');
    superuserToken = await login('e2e-ctg-su@test.nl');
    foreignAdminToken = await login('e2e-ctg-foreign@test.nl');
  });

  afterAll(async () => {
    try {
      const orgIds = [orgId, org2Id].filter(Boolean);
      const userIds = [adminId, inspectorId, superuserId, foreignAdminId].filter(Boolean);
      await prisma.chatMessage.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.chatThread.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ orgId: { in: orgIds } }, { userId: { in: userIds } }] } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await app.close();
    }
  });

  it('chat works while enabled (default on)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(adminToken))
      .send({ type: 'DIRECT', userId: inspectorId })
      .expect(201);
    threadId = res.body.data.id;
    expect(threadId).toBeTruthy();
  });

  it('refuses the toggle to non-admins and foreign-org admins', async () => {
    // INSPECTEUR is not in ORG_ADMINS → RolesGuard 403.
    await setChat(inspectorToken, false).expect(403);
    // ORG_ADMIN of another org cannot toggle this org → own-org check 403.
    await setChat(foreignAdminToken, false).expect(403);
    // Chat is still on (no toggle succeeded).
    await request(app.getHttpServer())
      .get('/api/v1/chat/unread')
      .set(auth(adminToken))
      .expect(200);
  });

  it('ORG_ADMIN can disable chat for their own org', async () => {
    const res = await setChat(adminToken, false).expect(200);
    expect(res.body.data.chatEnabled).toBe(false);
  });

  describe('while disabled', () => {
    it('chat reads return empty', async () => {
      const threads = await request(app.getHttpServer())
        .get('/api/v1/chat/threads')
        .set(auth(adminToken))
        .expect(200);
      expect(threads.body.data).toEqual([]);

      const unread = await request(app.getHttpServer())
        .get('/api/v1/chat/unread')
        .set(auth(adminToken))
        .expect(200);
      expect(unread.body.data.count).toBe(0);
    });

    it('chat writes are forbidden (403)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/chat/threads')
        .set(auth(adminToken))
        .send({ type: 'DIRECT', userId: inspectorId })
        .expect(403);

      await request(app.getHttpServer())
        .post(`/api/v1/chat/threads/${threadId}/messages`)
        .set(auth(adminToken))
        .send({ content: 'mag niet' })
        .expect(403);
    });

    it('/sync exposes no chat', async () => {
      const pull = await request(app.getHttpServer())
        .get('/api/v1/sync/pull')
        .set(auth(adminToken))
        .expect(200);
      expect(pull.body.data.chatThreads).toEqual([]);
      expect(pull.body.data.chatMessages).toEqual([]);
      // Existing contract keys remain present (additive contract intact).
      expect(pull.body.data).toHaveProperty('inspectionPlans');
    });
  });

  it('SUPERUSER can re-enable chat for the org', async () => {
    const res = await setChat(superuserToken, true).expect(200);
    expect(res.body.data.chatEnabled).toBe(true);
  });

  it('chat works again after re-enabling (existing thread preserved)', async () => {
    const threads = await request(app.getHttpServer())
      .get('/api/v1/chat/threads')
      .set(auth(adminToken))
      .expect(200);
    expect((threads.body.data as any[]).some((t) => t.id === threadId)).toBe(true);
  });
});
