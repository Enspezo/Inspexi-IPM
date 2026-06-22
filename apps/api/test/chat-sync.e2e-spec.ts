import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'crypto';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * REQ1 PR2 — verifies the chat extension of the /sync v2 contract is purely
 * ADDITIVE (existing keys/types unchanged) and that chat push is membership-
 * authorized + idempotent.
 */
describe('Chat sync (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let backofficeId: string;
  let inspectorId: string;
  let thirdId: string;
  let backofficeToken: string;
  let inspectorToken: string;

  let directThreadId: string; // backoffice ↔ inspector (inspector is a member)
  let otherThreadId: string; // backoffice ↔ third (inspector is NOT a member)

  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

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
      data: { name: 'E2E ChatSync Org', slug: 'e2echatsyncorg' },
    });
    orgId = org.id;

    const mk = async (email: string, roles: string[]) =>
      prisma.user.create({
        data: { email, passwordHash, firstName: 'X', lastName: email.split('@')[0], roles: roles as any, orgId, emailVerifiedAt: new Date() },
      });
    backofficeId = (await mk('e2e-cs-bo@test.nl', ['BACKOFFICE'])).id;
    inspectorId = (await mk('e2e-cs-insp@test.nl', ['INSPECTEUR'])).id;
    thirdId = (await mk('e2e-cs-third@test.nl', ['BACKOFFICE'])).id;

    const login = async (email: string) =>
      (await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: 'TestPass123!' })).body.data.accessToken as string;
    backofficeToken = await login('e2e-cs-bo@test.nl');
    inspectorToken = await login('e2e-cs-insp@test.nl');

    // DIRECT thread backoffice ↔ inspector + a seed message.
    directThreadId = (
      await request(app.getHttpServer())
        .post('/api/v1/chat/threads')
        .set(auth(backofficeToken))
        .send({ type: 'DIRECT', userId: inspectorId })
    ).body.data.id;
    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${directThreadId}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Hallo inspecteur' });

    // DIRECT thread backoffice ↔ third (inspector must NOT see this via sync).
    otherThreadId = (
      await request(app.getHttpServer())
        .post('/api/v1/chat/threads')
        .set(auth(backofficeToken))
        .send({ type: 'DIRECT', userId: thirdId })
    ).body.data.id;
  });

  afterAll(async () => {
    try {
      const userIds = [backofficeId, inspectorId, thirdId].filter(Boolean);
      await prisma.chatMessage.deleteMany({ where: { orgId } });
      await prisma.chatThread.deleteMany({ where: { orgId } });
      await prisma.notification.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ orgId }, { userId: { in: userIds } }] } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  it('pull keeps existing keys unchanged and adds chat additively', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .set(auth(inspectorToken))
      .expect(200);
    const data = res.body.data;

    // Existing v2 contract — unchanged.
    for (const key of ['inspectionPlans', 'assets', 'findings', 'photos', 'contacts', 'deletedIds', 'serverTime']) {
      expect(data).toHaveProperty(key);
    }
    expect(Array.isArray(data.inspectionPlans)).toBe(true);
    expect(data.deletedIds).toHaveProperty('inspectionPlans');
    expect(data.deletedIds).toHaveProperty('assets');
    expect(data.deletedIds).toHaveProperty('findings');

    // Additive chat keys.
    expect(Array.isArray(data.chatThreads)).toBe(true);
    expect(Array.isArray(data.chatMessages)).toBe(true);
    expect(Array.isArray(data.users)).toBe(true);
    expect(data.deletedIds).toHaveProperty('chatThreads');
    expect(data.deletedIds).toHaveProperty('chatMessages');

    // Inspector sees their own DIRECT thread + its message, and presence.
    expect(data.chatThreads.some((t: any) => t.id === directThreadId)).toBe(true);
    expect(data.chatMessages.some((m: any) => m.content === 'Hallo inspecteur')).toBe(true);
    expect(data.users.some((u: any) => u.id === inspectorId && 'availability' in u)).toBe(true);
  });

  it('pull is membership-scoped — a thread the user is not in is not returned', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .set(auth(inspectorToken))
      .expect(200);
    expect(res.body.data.chatThreads.some((t: any) => t.id === otherThreadId)).toBe(false);
  });

  it('push delivers a chat message (delegated, membership-authorized, idempotent)', async () => {
    const msgId = randomUUID();
    const body = {
      deviceId: 'pwa-1',
      changes: { chatMessages: [{ operation: 'create', data: { id: msgId, threadId: directThreadId, content: 'Reactie vanaf PWA' } }] },
    };

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set(auth(inspectorToken))
      .send(body)
      .expect(201);
    expect(r1.body.data.processed.chatMessages).toBe(1);

    // The message exists under the client-supplied id.
    const messages = await request(app.getHttpServer())
      .get(`/api/v1/chat/threads/${directThreadId}/messages`)
      .set(auth(inspectorToken))
      .expect(200);
    expect(messages.body.data.some((m: any) => m.id === msgId && m.content === 'Reactie vanaf PWA')).toBe(true);

    // Replaying the same push must not duplicate the message (idempotent on id).
    await request(app.getHttpServer()).post('/api/v1/sync/push').set(auth(inspectorToken)).send(body).expect(201);
    const after = await request(app.getHttpServer())
      .get(`/api/v1/chat/threads/${directThreadId}/messages`)
      .set(auth(inspectorToken))
      .expect(200);
    expect(after.body.data.filter((m: any) => m.id === msgId).length).toBe(1);
  });

  it('push rejects a message into a thread the user is not a member of', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set(auth(inspectorToken))
      .send({
        deviceId: 'pwa-1',
        changes: { chatMessages: [{ operation: 'create', data: { id: randomUUID(), threadId: otherThreadId, content: 'sneaky' } }] },
      })
      .expect(201);
    // Per-op failure (not a 4xx for the whole push), surfaced in errors.
    expect(res.body.data.processed.chatMessages).toBe(0);
    expect(res.body.data.errors.length).toBe(1);
    expect(res.body.data.errors[0].entityType).toBe('chatMessage');
  });

  it('surfaces chat-message tombstones on pull', async () => {
    const msgId = randomUUID();
    await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set(auth(inspectorToken))
      .send({ deviceId: 'pwa-1', changes: { chatMessages: [{ operation: 'create', data: { id: msgId, threadId: directThreadId, content: 'wordt verwijderd' } }] } })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/sync/push')
      .set(auth(inspectorToken))
      .send({ deviceId: 'pwa-1', changes: { chatMessages: [{ operation: 'delete', data: { id: msgId } }] } })
      .expect(201);

    const pull = await request(app.getHttpServer())
      .get('/api/v1/sync/pull')
      .set(auth(inspectorToken))
      .expect(200);
    expect(pull.body.data.deletedIds.chatMessages).toContain(msgId);
    expect(pull.body.data.chatMessages.some((m: any) => m.id === msgId)).toBe(false);
  });
});
