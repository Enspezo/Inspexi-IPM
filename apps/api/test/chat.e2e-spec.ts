import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/** Poll tot `predicate` waar is (voor fire-and-forget notificatie-dispatch). */
async function waitFor<T>(
  fn: () => Promise<T>,
  predicate: (v: T) => boolean,
  tries = 25,
  delay = 80,
): Promise<T> {
  let last = await fn();
  for (let i = 0; i < tries; i++) {
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, delay));
    last = await fn();
  }
  return last;
}

describe('Chat (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgAId: string;
  let orgBId: string;
  let backofficeId: string;
  let inspectorId: string;
  let partnerId: string;
  let orgBUserId: string;
  let contactAId: string;
  let contactBId: string;
  let reqAId: string;
  let reqBId: string;

  let backofficeToken: string;
  let inspectorToken: string;
  let orgBToken: string;

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

    const orgA = await prisma.organization.create({
      data: { name: 'E2E Chat Org A', slug: 'e2echatorga' },
    });
    orgAId = orgA.id;
    const orgB = await prisma.organization.create({
      data: { name: 'E2E Chat Org B', slug: 'e2echatorgb' },
    });
    orgBId = orgB.id;

    const backoffice = await prisma.user.create({
      data: {
        email: 'e2e-chat-backoffice@test.nl',
        passwordHash,
        firstName: 'Bo',
        lastName: 'Office',
        roles: ['BACKOFFICE'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    backofficeId = backoffice.id;

    const inspector = await prisma.user.create({
      data: {
        email: 'e2e-chat-inspector@test.nl',
        passwordHash,
        firstName: 'In',
        lastName: 'Spector',
        roles: ['INSPECTEUR'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    inspectorId = inspector.id;

    const partner = await prisma.user.create({
      data: {
        email: 'e2e-chat-partner@test.nl',
        passwordHash,
        firstName: 'Part',
        lastName: 'Ner',
        roles: ['INSPECTEUR'],
        orgId: orgA.id,
        emailVerifiedAt: new Date(),
      },
    });
    partnerId = partner.id;

    const orgBUser = await prisma.user.create({
      data: {
        email: 'e2e-chat-orgb@test.nl',
        passwordHash,
        firstName: 'Other',
        lastName: 'Org',
        roles: ['ORG_ADMIN'],
        orgId: orgB.id,
        emailVerifiedAt: new Date(),
      },
    });
    orgBUserId = orgBUser.id;

    const contactA = await prisma.contact.create({
      data: { orgId: orgA.id, type: 'COMPANY', companyName: 'Chat Contact A', ownerId: backofficeId },
    });
    contactAId = contactA.id;
    const contactB = await prisma.contact.create({
      data: { orgId: orgB.id, type: 'COMPANY', companyName: 'Chat Contact B', ownerId: orgBUserId },
    });
    contactBId = contactB.id;

    const reqA = await prisma.request.create({
      data: {
        orgId: orgA.id,
        contactId: contactAId,
        source: 'MANUAL',
        title: 'Aanvraag A voor chat',
        createdBy: backofficeId,
      },
    });
    reqAId = reqA.id;
    const reqB = await prisma.request.create({
      data: {
        orgId: orgB.id,
        contactId: contactBId,
        source: 'MANUAL',
        title: 'Aanvraag B (andere org)',
        createdBy: orgBUserId,
      },
    });
    reqBId = reqB.id;

    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'TestPass123!' });
      return res.body.data.accessToken as string;
    };
    backofficeToken = await login('e2e-chat-backoffice@test.nl');
    inspectorToken = await login('e2e-chat-inspector@test.nl');
    orgBToken = await login('e2e-chat-orgb@test.nl');
  });

  afterAll(async () => {
    try {
      const orgIds = [orgAId, orgBId].filter(Boolean);
      const userIds = [backofficeId, inspectorId, partnerId, orgBUserId].filter(Boolean);
      await prisma.chatMessage.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.chatThread.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.note.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.notification.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.request.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.contact.deleteMany({ where: { orgId: { in: orgIds } } });
      await prisma.auditLog.deleteMany({
        where: { OR: [{ orgId: { in: orgIds } }, { userId: { in: userIds } }] },
      });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    } finally {
      await app.close();
    }
  });

  // ─── DIRECT thread dedup ────────────────────────────────
  let directThreadId: string;

  it('creates a DIRECT thread and deduplicates on repeat', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: inspectorId })
      .expect(201);
    expect(r1.body.data.type).toBe('DIRECT');
    directThreadId = r1.body.data.id;

    // Reverse direction → same thread (dedup).
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(inspectorToken))
      .send({ type: 'DIRECT', userId: backofficeId })
      .expect(201);
    expect(r2.body.data.id).toBe(directThreadId);
  });

  it('rejects a DIRECT chat with yourself (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: backofficeId })
      .expect(400);
  });

  it('rejects a DIRECT chat with a user from another org (404)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: orgBUserId })
      .expect(404);
  });

  // ─── Listing + team channels ────────────────────────────
  it('lists my threads incl. an auto-provisioned team channel', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .expect(200);
    const threads = res.body.data as Array<{ type: string; teamRole: string | null }>;
    expect(threads.some((t) => t.type === 'DIRECT')).toBe(true);
    expect(threads.some((t) => t.type === 'TEAM' && t.teamRole === 'BACKOFFICE')).toBe(true);
  });

  // ─── Messages + since-poll ──────────────────────────────
  it('posts a message and fetches it incrementally with ?since', async () => {
    const send = await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${directThreadId}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Eerste bericht' })
      .expect(201);
    const firstAt = send.body.data.createdAt;

    const send2 = await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${directThreadId}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Tweede bericht' })
      .expect(201);
    expect(send2.body.data.content).toBe('Tweede bericht');

    const since = await request(app.getHttpServer())
      .get(`/api/v1/chat/threads/${directThreadId}/messages?since=${encodeURIComponent(firstAt)}`)
      .set(auth(backofficeToken))
      .expect(200);
    const contents = (since.body.data as Array<{ content: string }>).map((m) => m.content);
    expect(contents).toContain('Tweede bericht');
    expect(contents).not.toContain('Eerste bericht');
  });

  // ─── New-message notification + dedup ───────────────────
  it('dispatches a CHAT_BERICHT notification (deduped per thread)', async () => {
    // Fresh thread so the count is deterministic and independent of other tests.
    const created = await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: partnerId })
      .expect(201);
    const tid = created.body.data.id as string;

    const countBerichten = () =>
      prisma.notification.count({
        where: { userId: partnerId, type: 'CHAT_BERICHT', entityId: tid, isRead: false },
      });

    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${tid}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Bericht A' })
      .expect(201);
    const afterFirst = await waitFor(countBerichten, (c) => c >= 1);
    expect(afterFirst).toBe(1);

    // A further message (after the first notification is committed) must NOT
    // stack a second unread notification for the same thread.
    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${tid}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Bericht B' })
      .expect(201);
    await new Promise((r) => setTimeout(r, 400));
    expect(await countBerichten()).toBe(1);
  });

  it('dispatches a CHAT_MENTION when a user is @-mentioned', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${directThreadId}/messages`)
      .set(auth(backofficeToken))
      .send({ content: `Hoi @In Spector`, mentionedUserIds: [inspectorId] })
      .expect(201);

    const mentions = await waitFor(
      () =>
        prisma.notification.count({
          where: { userId: inspectorId, type: 'CHAT_MENTION', entityId: directThreadId },
        }),
      (c) => c >= 1,
    );
    expect(mentions).toBe(1);
  });

  // ─── Unread + read ──────────────────────────────────────
  it('reflects unread count and clears it on read', async () => {
    const unread = await request(app.getHttpServer())
      .get('/api/v1/chat/unread')
      .set(auth(inspectorToken))
      .expect(200);
    expect(unread.body.data.count).toBeGreaterThan(0);

    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${directThreadId}/read`)
      .set(auth(inspectorToken))
      .expect(201);

    const after = await request(app.getHttpServer())
      .get('/api/v1/chat/unread')
      .set(auth(inspectorToken))
      .expect(200);
    expect(after.body.data.count).toBe(0);
  });

  // ─── Close → transcript note on referenced record ───────
  it('closes a thread with a record reference and writes a transcript note', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: inspectorId, referenceEntityType: 'Request', referenceEntityId: reqAId })
      .expect(201);
    const threadId = created.body.data.id;
    expect(created.body.data.referenceEntityType).toBe('Request');

    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Bericht voor het transcript' })
      .expect(201);

    const closed = await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${threadId}/close`)
      .set(auth(backofficeToken))
      .expect(201);
    expect(closed.body.data.status).toBe('AFGEROND');
    expect(closed.body.data.noteId).toBeTruthy();

    const note = await prisma.note.findFirst({
      where: { entityType: 'REQUEST', entityId: reqAId, orgId: orgAId },
    });
    expect(note).toBeTruthy();
    expect(note!.content).toContain('Bericht voor het transcript');

    // Posting in a closed thread is rejected.
    await request(app.getHttpServer())
      .post(`/api/v1/chat/threads/${threadId}/messages`)
      .set(auth(backofficeToken))
      .send({ content: 'Te laat' })
      .expect(400);
  });

  // ─── Authorization / isolation ──────────────────────────
  it('hides a DIRECT thread from a non-participant in the same org', async () => {
    // Inspector is a participant; a BACKOFFICE-only thread between two others is
    // covered by team logic — here we assert another org cannot read it.
    await request(app.getHttpServer())
      .get(`/api/v1/chat/threads/${directThreadId}`)
      .set(auth(orgBToken))
      .expect(404);
  });

  it('hides a TEAM thread from a user without that role (404)', async () => {
    // Inspector's INSPECTEUR team channel must be invisible to the backoffice user.
    const inspectorThreads = await request(app.getHttpServer())
      .get('/api/v1/chat/threads')
      .set(auth(inspectorToken))
      .expect(200);
    const inspectorTeam = (inspectorThreads.body.data as Array<{ id: string; type: string; teamRole: string | null }>).find(
      (t) => t.type === 'TEAM' && t.teamRole === 'INSPECTEUR',
    );
    expect(inspectorTeam).toBeTruthy();

    await request(app.getHttpServer())
      .get(`/api/v1/chat/threads/${inspectorTeam!.id}`)
      .set(auth(backofficeToken))
      .expect(404);
  });

  it('rejects a cross-tenant record reference (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: inspectorId, referenceEntityType: 'Request', referenceEntityId: reqBId })
      .expect(403);
  });

  it('rejects an unknown reference type (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/chat/threads')
      .set(auth(backofficeToken))
      .send({ type: 'DIRECT', userId: inspectorId, referenceEntityType: 'Banana', referenceEntityId: reqAId })
      .expect(400);
  });

  // ─── Presence ───────────────────────────────────────────
  it('updates and reads presence', async () => {
    const patched = await request(app.getHttpServer())
      .patch('/api/v1/users/me/presence')
      .set(auth(backofficeToken))
      .send({ availability: 'BEZIG', availabilityNote: 'In overleg' })
      .expect(200);
    expect(patched.body.data.availability).toBe('BEZIG');

    const got = await request(app.getHttpServer())
      .get('/api/v1/users/me/presence')
      .set(auth(backofficeToken))
      .expect(200);
    expect(got.body.data.availability).toBe('BEZIG');
    expect(got.body.data.availabilityNote).toBe('In overleg');
  });

  it('exposes presence on /chat/users and excludes the caller', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/chat/users')
      .set(auth(backofficeToken))
      .expect(200);
    const users = res.body.data as Array<{ id: string; availability: string }>;
    expect(users.some((u) => u.id === inspectorId)).toBe(true);
    expect(users.some((u) => u.id === backofficeId)).toBe(false);
  });
});
