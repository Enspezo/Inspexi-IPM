import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Support-tickets API (e2e) — IMP_PRD-10 Fase 4.
 *
 * Draait tegen de geseede database en gebruikt de seed-users:
 *   superuser@inspexi.nl (SUPERUSER), admin@inspexi-demo.nl (ORG_ADMIN org1),
 *   manager@inspexi-demo.nl (MANAGER org1), inspecteur@inspexi-demo.nl
 *   (INSPECTEUR org1), admin@testbedrijf.nl (ORG_ADMIN org2).
 *
 * Verifieert: per-org nummering, zichtbaarheid (mine/org/superuser-wachtrij),
 * cross-tenant isolatie, status-overgangen, interne-notitie-verberging,
 * rol-enforcement bij muteren en notificatie-dispatch.
 */
describe('Support tickets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let superToken: string;
  let org1AdminToken: string;
  let org1ManagerToken: string;
  let org1InspToken: string;
  let org2AdminToken: string;

  let superUserId: string;
  let inspUserId: string;
  let org2UserId: string;

  const createdTicketIds: string[] = [];

  async function login(email: string, password = 'Password123!') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return res.body.data.accessToken as string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createTicket(token: string, body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/support-tickets')
      .set(auth(token))
      .send(body)
      .expect(201);
    createdTicketIds.push(res.body.data.id);
    return res.body.data;
  }

  /** Wacht (fire-and-forget dispatch) tot een notificatie verschijnt. */
  async function waitForNotification(where: Record<string, unknown>, tries = 15) {
    for (let i = 0; i < tries; i++) {
      const n = await prisma.notification.findFirst({ where });
      if (n) return n;
      await new Promise((r) => setTimeout(r, 150));
    }
    return null;
  }

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

    [
      superToken,
      org1AdminToken,
      org1ManagerToken,
      org1InspToken,
      org2AdminToken,
    ] = await Promise.all([
      login('superuser@inspexi.nl'),
      login('admin@inspexi-demo.nl'),
      login('manager@inspexi-demo.nl'),
      login('inspecteur@inspexi-demo.nl'),
      login('admin@testbedrijf.nl'),
    ]);

    const [su, insp, org2User] = await Promise.all([
      prisma.user.findFirst({ where: { email: 'superuser@inspexi.nl' } }),
      prisma.user.findFirst({ where: { email: 'inspecteur@inspexi-demo.nl' } }),
      prisma.user.findFirst({ where: { email: 'admin@testbedrijf.nl' } }),
    ]);
    superUserId = su!.id;
    inspUserId = insp!.id;
    org2UserId = org2User!.id;
  });

  afterAll(async () => {
    try {
      if (createdTicketIds.length > 0) {
        await prisma.notification.deleteMany({
          where: { entityType: 'SupportTicket', entityId: { in: createdTicketIds } },
        });
        await prisma.auditLog.deleteMany({
          where: { entityId: { in: createdTicketIds } },
        });
        await prisma.supportTicketMessage.deleteMany({
          where: { ticketId: { in: createdTicketIds } },
        });
        await prisma.supportTicket.deleteMany({
          where: { id: { in: createdTicketIds } },
        });
      }
    } finally {
      await app.close();
    }
  });

  // ── Aanmaken + nummering ─────────────────────────────────────────────────────
  describe('POST /support-tickets', () => {
    it('maakt een ticket aan, seedt een USER-bericht en notificeert support', async () => {
      const t = await createTicket(org1InspToken, {
        subject: 'E2E inspecteur ticket',
        description: 'Mijn vraag',
        category: 'VRAAG',
        contextModule: 'quotes',
      });
      expect(t.ticketNumber).toBeGreaterThanOrEqual(1);
      expect(t.status).toBe('NIEUW');
      expect(t.contextModule).toBe('quotes');

      // Detail bevat het eerste (USER) bericht.
      const detail = await request(app.getHttpServer())
        .get(`/api/v1/support-tickets/${t.id}`)
        .set(auth(org1InspToken))
        .expect(200);
      expect(detail.body.data.messages).toHaveLength(1);
      expect(detail.body.data.messages[0].authorType).toBe('USER');
      expect(detail.body.data.messages[0].body).toBe('Mijn vraag');

      // Support (superuser) krijgt een SUPPORT_TICKET_AANGEMAAKT notificatie.
      const notif = await waitForNotification({
        userId: superUserId,
        type: 'SUPPORT_TICKET_AANGEMAAKT',
        entityId: t.id,
      });
      expect(notif).not.toBeNull();
    });

    it('nummert per org oplopend', async () => {
      const a = await createTicket(org1AdminToken, {
        subject: 'E2E admin ticket A',
        description: 'iets om te vragen',
      });
      const b = await createTicket(org1AdminToken, {
        subject: 'E2E admin ticket B',
        description: 'iets anders om te vragen',
      });
      expect(b.ticketNumber).toBe(a.ticketNumber + 1);
    });
  });

  // ── Zichtbaarheid ─────────────────────────────────────────────────────────────
  describe('zichtbaarheid (mine / org / superuser)', () => {
    it('niet-management ziet bij scope=org alleen eigen tickets', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/support-tickets?scope=org')
        .set(auth(org1InspToken))
        .expect(200);
      const ids = res.body.data.data.map((t: { id: string }) => t.id);
      // ziet zijn eigen ticket, niet die van de org-admin
      expect(ids).toContain(createdTicketIds[0]);
      expect(ids).not.toContain(createdTicketIds[1]);
    });

    it('management (MANAGER) ziet bij scope=org alle org-tickets', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/support-tickets?scope=org')
        .set(auth(org1ManagerToken))
        .expect(200);
      const ids = res.body.data.data.map((t: { id: string }) => t.id);
      expect(ids).toContain(createdTicketIds[0]);
      expect(ids).toContain(createdTicketIds[1]);
    });

    it('superuser ziet de wachtrij over alle orgs', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/support-tickets?limit=100')
        .set(auth(superToken))
        .expect(200);
      const ids = res.body.data.data.map((t: { id: string }) => t.id);
      expect(ids).toContain(createdTicketIds[0]);
      expect(ids).toContain(createdTicketIds[1]);
    });

    it('stats geeft aantallen per status', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/support-tickets/stats')
        .set(auth(org1AdminToken))
        .expect(200);
      expect(typeof res.body.data).toBe('object');
      expect((res.body.data.NIEUW ?? 0)).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Cross-tenant isolatie ─────────────────────────────────────────────────────
  describe('cross-tenant isolatie', () => {
    it('org2-admin mag een org1-ticket niet inzien (403)', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/support-tickets/${createdTicketIds[0]}`)
        .set(auth(org2AdminToken))
        .expect(403);
    });

    it('org2-admin ziet org1-tickets niet in de org-lijst', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/support-tickets?scope=org')
        .set(auth(org2AdminToken))
        .expect(200);
      const ids = res.body.data.data.map((t: { id: string }) => t.id);
      expect(ids).not.toContain(createdTicketIds[0]);
      expect(ids).not.toContain(createdTicketIds[1]);
    });

    it('org2-admin mag een org1-ticket niet muteren (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${createdTicketIds[0]}`)
        .set(auth(org2AdminToken))
        .send({ status: 'OPGELOST' })
        .expect(403);
    });
  });

  // ── Thread + status-overgangen + interne notities ─────────────────────────────
  describe('thread, status-overgangen & interne notities', () => {
    it('interne notitie van support is verborgen voor de klant', async () => {
      const ticketId = createdTicketIds[0];
      await request(app.getHttpServer())
        .post(`/api/v1/support-tickets/${ticketId}/messages`)
        .set(auth(superToken))
        .send({ body: 'Interne notitie', isInternal: true })
        .expect(201);

      const asKlant = await request(app.getHttpServer())
        .get(`/api/v1/support-tickets/${ticketId}`)
        .set(auth(org1InspToken))
        .expect(200);
      const klantBodies = asKlant.body.data.messages.map((m: { body: string }) => m.body);
      expect(klantBodies).not.toContain('Interne notitie');

      const asSupport = await request(app.getHttpServer())
        .get(`/api/v1/support-tickets/${ticketId}`)
        .set(auth(superToken))
        .expect(200);
      const supportBodies = asSupport.body.data.messages.map((m: { body: string }) => m.body);
      expect(supportBodies).toContain('Interne notitie');
    });

    it('niet-support mag geen interne notitie plaatsen (403)', async () => {
      await request(app.getHttpServer())
        .post(`/api/v1/support-tickets/${createdTicketIds[0]}/messages`)
        .set(auth(org1InspToken))
        .send({ body: 'probeer intern', isInternal: true })
        .expect(403);
    });

    it('klant-reactie op WACHT_OP_KLANT zet status terug naar IN_BEHANDELING', async () => {
      const ticketId = createdTicketIds[0];
      // support zet op WACHT_OP_KLANT
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${ticketId}`)
        .set(auth(superToken))
        .send({ status: 'WACHT_OP_KLANT' })
        .expect(200);

      // klant (aanmaker) reageert
      await request(app.getHttpServer())
        .post(`/api/v1/support-tickets/${ticketId}/messages`)
        .set(auth(org1InspToken))
        .send({ body: 'Hier mijn antwoord' })
        .expect(201);

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/support-tickets/${ticketId}`)
        .set(auth(org1InspToken))
        .expect(200);
      expect(detail.body.data.status).toBe('IN_BEHANDELING');
    });
  });

  // ── Rol-enforcement bij muteren ───────────────────────────────────────────────
  describe('muteren — rol-enforcement', () => {
    it('MANAGER mag niet muteren (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${createdTicketIds[1]}`)
        .set(auth(org1ManagerToken))
        .send({ status: 'OPGELOST' })
        .expect(403);
    });

    it('weigert toewijzing aan een gebruiker van een andere org (403)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${createdTicketIds[1]}`)
        .set(auth(org1AdminToken))
        .send({ assignedToId: org2UserId })
        .expect(403);
    });

    it('staat toewijzing aan een eigen-org gebruiker toe (positieve controle)', async () => {
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${createdTicketIds[1]}`)
        .set(auth(org1AdminToken))
        .send({ assignedToId: inspUserId })
        .expect(200);
    });

    it('ORG_ADMIN mag muteren, zet resolvedAt en notificeert de aanmaker', async () => {
      // Ticket aangemaakt door de inspecteur, gemuteerd door de admin.
      const ticketId = createdTicketIds[0];
      await request(app.getHttpServer())
        .patch(`/api/v1/support-tickets/${ticketId}`)
        .set(auth(org1AdminToken))
        .send({ status: 'OPGELOST' })
        .expect(200);

      const row = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
      expect(row?.status).toBe('OPGELOST');
      expect(row?.resolvedAt).not.toBeNull();

      const notif = await waitForNotification({
        userId: inspUserId,
        type: 'SUPPORT_TICKET_STATUS',
        entityId: ticketId,
      });
      expect(notif).not.toBeNull();
    });
  });
});
