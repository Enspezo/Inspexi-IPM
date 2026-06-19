import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcrypt';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

// REQ35 — zichtbaarheid inspecteur-telefoon/-e-mail in klantportaal.
// Bewijst dat de server-side resolutie (org-modus + per-kanaal consent + statische terugval)
// correct werkt op BEIDE klant-facing endpoints, én dat rauwe inspecteur-contactgegevens,
// consent-vlaggen en de org-modus NOOIT in de response lekken (ook niet de login-`email`).
jest.setTimeout(60000);

const HOST = 'req35contact.localhost';
const CLIENT_PW = 'ClientPass123!';
const PUBLIC_TOKEN = 'req35-public-token';

// Bewust onderscheidende waarden zodat assertions ondubbelzinnig zijn.
const INSPECTOR_LOGIN_EMAIL = 'login.req35@req35.nl'; // User.email — mag NOOIT als contact lekken
const INSPECTOR_CONTACT_PHONE = '+31 6 99 88 77 66';
const INSPECTOR_CONTACT_EMAIL = 'contact.req35@req35.nl';
const STATIC_PHONE = '+31 20 999 8888';
const STATIC_EMAIL = 'static.req35@req35.nl';

describe('Inspecteur-contact zichtbaarheid (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgId: string;
  let inspectorId: string;
  let contactId: string;
  let planId: string;
  let clientUserId: string;
  let planningItemId: string;
  let token: string; // client-realm access token

  const clientEmail = 'e2e-req35-client@test.nl';

  const onHost = (path: string) => request(app.getHttpServer()).get(path).set('Host', HOST);
  const postHost = (path: string) => request(app.getHttpServer()).post(path).set('Host', HOST);
  const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

  /** Zet de org-modus + statische waarden vers in de DB (resolutie leest altijd vers). */
  async function setOrgModes(opts: {
    phone: 'NONE' | 'STATIC' | 'INSPECTOR';
    email: 'NONE' | 'STATIC' | 'INSPECTOR';
    staticPhone?: string | null;
    staticEmail?: string | null;
  }) {
    await prisma.organization.update({
      where: { id: orgId },
      data: {
        inspectorPhoneDisplay: opts.phone,
        inspectorEmailDisplay: opts.email,
        ...(opts.staticPhone !== undefined ? { inspectorStaticPhone: opts.staticPhone } : {}),
        ...(opts.staticEmail !== undefined ? { inspectorStaticEmail: opts.staticEmail } : {}),
      },
    });
  }

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

    const clientHash = await bcrypt.hash(CLIENT_PW, 10);
    const staffHash = await bcrypt.hash('StaffPass123!', 10);

    const org = await prisma.organization.create({
      data: {
        name: 'REQ35 Contact Org',
        slug: 'req35contact',
        inspectorPhoneDisplay: 'INSPECTOR',
        inspectorEmailDisplay: 'INSPECTOR',
        inspectorStaticPhone: STATIC_PHONE,
        inspectorStaticEmail: STATIC_EMAIL,
      },
    });
    orgId = org.id;

    // Inspecteur mét eigen contactgegevens: telefoon gedeeld, e-mail NIET gedeeld.
    const inspector = await prisma.user.create({
      data: {
        email: INSPECTOR_LOGIN_EMAIL,
        passwordHash: staffHash,
        firstName: 'Ingrid',
        lastName: 'Inspecteur',
        roles: ['INSPECTEUR'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
        contactPhone: INSPECTOR_CONTACT_PHONE,
        contactEmail: INSPECTOR_CONTACT_EMAIL,
        sharePhoneWithClients: true,
        shareEmailWithClients: false,
      },
    });
    inspectorId = inspector.id;

    const contact = await prisma.contact.create({
      data: { orgId: org.id, type: 'COMPANY', companyName: 'REQ35 Opdrachtgever BV' },
    });
    contactId = contact.id;

    // Reviewer = dezelfde (consent-gevende) inspecteur, om te bewijzen dat de reviewer-ref
    // GEEN contactgegevens krijgt (de feature geldt alleen voor de toegewezen inspecteur).
    const plan = await prisma.inspectionPlan.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        projectName: 'REQ35 inspectie',
        normTypeCode: 'NEN3140',
        statusCode: 'completed',
        assignedTo: inspector.id,
        reviewerId: inspector.id,
        createdBy: inspector.id,
      },
    });
    planId = plan.id;

    // Client-realm toegang.
    const clientUser = await prisma.clientUser.create({
      data: {
        email: clientEmail,
        passwordHash: clientHash,
        firstName: 'Klaas',
        lastName: 'Klant',
        status: 'ACTIVE',
        emailVerified: true,
      },
    });
    clientUserId = clientUser.id;
    await prisma.clientAccess.create({
      data: { clientUserId: clientUser.id, contactId: contact.id, role: 'VIEWER' },
    });
    await prisma.inspectionClientAccess.create({
      data: {
        inspectionPlanId: plan.id,
        clientUserId: clientUser.id,
        canView: true,
        canSign: false,
        invitedBy: inspector.id,
        acceptedAt: new Date(),
      },
    });

    // Publieke afspraak/planning-link met geaccepteerde inspecteur.
    const planningItem = await prisma.planningItem.create({
      data: {
        orgId: org.id,
        contactId: contact.id,
        productName: 'REQ35 inspectie-afspraak',
        publicToken: PUBLIC_TOKEN,
        createdBy: inspector.id,
      },
    });
    planningItemId = planningItem.id;
    await prisma.planningInspector.create({
      data: {
        planningItemId: planningItem.id,
        userId: inspector.id,
        isPrimary: true,
        acceptanceStatus: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });

    const login = await postHost('/api/v1/client/auth/login')
      .send({ email: clientEmail, password: CLIENT_PW })
      .expect(201);
    token = login.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.inspectionClientAccess.deleteMany({ where: { inspectionPlanId: planId } });
      await prisma.clientAccess.deleteMany({ where: { clientUserId } });
      await prisma.clientUser.deleteMany({ where: { id: clientUserId } });
      await prisma.planningInspector.deleteMany({ where: { planningItemId } });
      await prisma.planningItem.deleteMany({ where: { id: planningItemId } });
      await prisma.inspectionPlan.deleteMany({ where: { id: planId } });
      await prisma.contact.deleteMany({ where: { orgId } });
      await prisma.auditLog.deleteMany({ where: { orgId } });
      await prisma.refreshToken.deleteMany({ where: { userId: inspectorId } });
      await prisma.user.deleteMany({ where: { id: inspectorId } });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  // ─── Client-portal: GET /client/inspections/:id ───────────────────────────

  describe('client-portal inspectie-detail', () => {
    it('INSPECTOR-modus: telefoon = inspecteur (consent), e-mail = statisch (terugval, geen consent)', async () => {
      await setOrgModes({ phone: 'INSPECTOR', email: 'INSPECTOR' });
      const res = await onHost(`/api/v1/client/inspections/${planId}`).set(bearer(token)).expect(200);

      const inspector = res.body.data.assignedUser;
      expect(inspector.phone).toBe(INSPECTOR_CONTACT_PHONE);
      expect(inspector.email).toBe(STATIC_EMAIL);
      // Exact toegestane sleutels — bewijst dat consent/rauwe velden niet meekomen.
      expect(Object.keys(inspector).sort()).toEqual(
        ['email', 'firstName', 'id', 'lastName', 'phone'].sort(),
      );
    });

    it('LEK-TEST: response bevat geen rauwe contactvelden, consent-vlaggen, org-modus of login-e-mail', async () => {
      await setOrgModes({ phone: 'INSPECTOR', email: 'INSPECTOR' });
      const res = await onHost(`/api/v1/client/inspections/${planId}`).set(bearer(token)).expect(200);

      // De org-relatie (met de modus) wordt volledig uit de response gestript.
      expect(res.body.data.organization).toBeUndefined();

      const raw = JSON.stringify(res.body.data);
      expect(raw).not.toContain('contactPhone');
      expect(raw).not.toContain('contactEmail');
      expect(raw).not.toContain('sharePhoneWithClients');
      expect(raw).not.toContain('shareEmailWithClients');
      expect(raw).not.toContain('inspectorPhoneDisplay');
      expect(raw).not.toContain('inspectorStaticPhone');
      // De login-`email` van de inspecteur mag nergens opduiken.
      expect(raw).not.toContain(INSPECTOR_LOGIN_EMAIL);
    });

    it('reviewer krijgt GEEN contactgegevens, ook al is het dezelfde consent-gevende inspecteur', async () => {
      await setOrgModes({ phone: 'INSPECTOR', email: 'INSPECTOR' });
      const res = await onHost(`/api/v1/client/inspections/${planId}`).set(bearer(token)).expect(200);

      const reviewer = res.body.data.reviewer;
      expect(reviewer.id).toBe(inspectorId);
      expect(reviewer.phone).toBeUndefined();
      expect(reviewer.email).toBeUndefined();
      expect(Object.keys(reviewer).sort()).toEqual(['firstName', 'id', 'lastName'].sort());
    });

    it('NONE-modus: geen telefoon én geen e-mail', async () => {
      await setOrgModes({ phone: 'NONE', email: 'NONE' });
      const res = await onHost(`/api/v1/client/inspections/${planId}`).set(bearer(token)).expect(200);

      expect(res.body.data.assignedUser.phone).toBeNull();
      expect(res.body.data.assignedUser.email).toBeNull();
      const raw = JSON.stringify(res.body.data);
      expect(raw).not.toContain(INSPECTOR_CONTACT_PHONE);
      expect(raw).not.toContain(INSPECTOR_CONTACT_EMAIL);
    });

    it('STATIC-modus: toont uitsluitend de statische waarden (negeert de inspecteur)', async () => {
      await setOrgModes({ phone: 'STATIC', email: 'STATIC' });
      const res = await onHost(`/api/v1/client/inspections/${planId}`).set(bearer(token)).expect(200);

      expect(res.body.data.assignedUser.phone).toBe(STATIC_PHONE);
      expect(res.body.data.assignedUser.email).toBe(STATIC_EMAIL);
      expect(JSON.stringify(res.body.data)).not.toContain(INSPECTOR_CONTACT_PHONE);
    });
  });

  // ─── Publieke afspraaklink: GET /public/planning/:token ───────────────────

  describe('publieke afspraaklink', () => {
    it('INSPECTOR-modus: telefoon = inspecteur (consent), e-mail = statisch (terugval)', async () => {
      await setOrgModes({ phone: 'INSPECTOR', email: 'INSPECTOR' });
      const res = await onHost(`/api/v1/public/planning/${PUBLIC_TOKEN}`).expect(200);

      const user = res.body.data.inspectors[0].user;
      expect(user.phone).toBe(INSPECTOR_CONTACT_PHONE);
      expect(user.email).toBe(STATIC_EMAIL);
      expect(Object.keys(user).sort()).toEqual(
        ['color', 'email', 'firstName', 'id', 'initials', 'lastName', 'phone'].sort(),
      );
    });

    it('LEK-TEST: geen rauwe contactvelden/consent/org-modus/login-e-mail in de response', async () => {
      await setOrgModes({ phone: 'INSPECTOR', email: 'INSPECTOR' });
      const res = await onHost(`/api/v1/public/planning/${PUBLIC_TOKEN}`).expect(200);

      // De teruggegeven organization bevat alleen branding-velden, geen modus.
      expect(res.body.data.organization.inspectorPhoneDisplay).toBeUndefined();
      expect(res.body.data.organization.inspectorStaticPhone).toBeUndefined();

      const raw = JSON.stringify(res.body.data);
      expect(raw).not.toContain('contactPhone');
      expect(raw).not.toContain('sharePhoneWithClients');
      expect(raw).not.toContain('shareEmailWithClients');
      expect(raw).not.toContain('inspectorPhoneDisplay');
      expect(raw).not.toContain(INSPECTOR_LOGIN_EMAIL);
    });

    it('NONE-modus: geen contactgegevens bij de inspecteur', async () => {
      await setOrgModes({ phone: 'NONE', email: 'NONE' });
      const res = await onHost(`/api/v1/public/planning/${PUBLIC_TOKEN}`).expect(200);

      const user = res.body.data.inspectors[0].user;
      expect(user.phone).toBeNull();
      expect(user.email).toBeNull();
      expect(JSON.stringify(res.body.data)).not.toContain(INSPECTOR_CONTACT_PHONE);
    });
  });
});
