import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

describe('Voice (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let orgAId: string;
  let orgBId: string;
  let templateId: string; // globale meetstaat-template (geen org)

  let superuserId: string;
  let orgAAdminId: string;
  let orgAInspectorId: string;
  let orgBAdminId: string;

  let superuserToken: string;
  let orgAAdminToken: string;
  let orgAInspectorToken: string;
  let orgBAdminToken: string;

  const createdBaseNames = ['E2E Voice Base A', 'E2E Voice Base B'];
  let seededActiveBaseId: string | null = null;

  const login = async (email: string) => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'TestPass123!' });
    return res.body.data.accessToken as string;
  };

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

    // Onthoud een eventueel geseede actieve base-prompt om die in afterAll te herstellen.
    const seededActive = await prisma.voiceBasePrompt.findFirst({ where: { isActive: true } });
    seededActiveBaseId = seededActive?.id ?? null;

    const orgA = await prisma.organization.create({ data: { name: 'E2E Voice A', slug: 'e2evoicea' } });
    const orgB = await prisma.organization.create({ data: { name: 'E2E Voice B', slug: 'e2evoiceb' } });
    orgAId = orgA.id;
    orgBId = orgB.id;

    const su = await prisma.user.create({
      data: { email: 'e2e-su-voice@test.nl', passwordHash, firstName: 'Super', lastName: 'User', roles: ['SUPERUSER'], emailVerifiedAt: new Date() },
    });
    superuserId = su.id;

    const oaA = await prisma.user.create({
      data: { email: 'e2e-oa-voicea@test.nl', passwordHash, firstName: 'Org', lastName: 'AdminA', roles: ['ORG_ADMIN'], orgId: orgA.id, emailVerifiedAt: new Date() },
    });
    orgAAdminId = oaA.id;

    const insA = await prisma.user.create({
      data: { email: 'e2e-insp-voicea@test.nl', passwordHash, firstName: 'Insp', lastName: 'A', roles: ['INSPECTEUR'], orgId: orgA.id, emailVerifiedAt: new Date() },
    });
    orgAInspectorId = insA.id;

    const oaB = await prisma.user.create({
      data: { email: 'e2e-oa-voiceb@test.nl', passwordHash, firstName: 'Org', lastName: 'AdminB', roles: ['ORG_ADMIN'], orgId: orgB.id, emailVerifiedAt: new Date() },
    });
    orgBAdminId = oaB.id;

    // Globale meetstaat-template (geen orgId) — doelwit voor template-prompts.
    const tmpl = await prisma.measurementSheetTemplate.create({
      data: { code: 'E2E-VOICE-MS', name: 'E2E Voice meetstaat', normTypeCode: 'NEN1010', createdBy: su.id },
    });
    templateId = tmpl.id;

    superuserToken = await login('e2e-su-voice@test.nl');
    orgAAdminToken = await login('e2e-oa-voicea@test.nl');
    orgAInspectorToken = await login('e2e-insp-voicea@test.nl');
    orgBAdminToken = await login('e2e-oa-voiceb@test.nl');
  });

  afterAll(async () => {
    const userIds = [superuserId, orgAAdminId, orgAInspectorId, orgBAdminId];
    try {
      await prisma.voiceUserPrompt.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.voiceTemplatePrompt.deleteMany({ where: { OR: [{ orgId: { in: [orgAId, orgBId] } }, { templateId }] } });
      await prisma.voiceBasePrompt.deleteMany({ where: { name: { in: createdBaseNames } } });
      // Herstel de oorspronkelijk actieve (geseede) base-prompt die door activate-test gedeactiveerd kan zijn.
      if (seededActiveBaseId) {
        await prisma.voiceBasePrompt.updateMany({ where: { id: seededActiveBaseId }, data: { isActive: true } }).catch(() => undefined);
      }
      await prisma.measurementSheetTemplate.deleteMany({ where: { id: templateId } });
      await prisma.auditLog.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      await prisma.organization.deleteMany({ where: { id: { in: [orgAId, orgBId] } } });
    } finally {
      await app.close();
    }
  });

  describe('GET /api/v1/voice/status (public)', () => {
    it('is publiek bereikbaar en geeft een available-boolean', async () => {
      const res = await request(app.getHttpServer()).get('/api/v1/voice/status').expect(200);
      expect(res.body.success).toBe(true);
      expect(typeof res.body.data.available).toBe('boolean');
    });
  });

  describe('POST /api/v1/voice/parse-measurement (auth + validatie)', () => {
    it('weigert zonder authenticatie (401)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/voice/parse-measurement')
        .send({ transcript: 'Groep 1 isolatie 500 megaohm' })
        .expect(401);
    });

    it('weigert een ontbrekende transcript (400) — bereikt de Anthropic-API niet', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/voice/parse-measurement')
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .send({})
        .expect(400);
    });

    it('weigert een ongeldige templateId-UUID (400)', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/voice/parse-measurement')
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .send({ transcript: 'test', templateId: 'geen-uuid' })
        .expect(400);
    });
  });

  describe('Base-prompts — alleen SUPERUSER (/admin/voice-prompts)', () => {
    let basePromptId: string;

    it('weigert een ORG_ADMIN op de lijst (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/admin/voice-prompts/base')
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(403);
    });

    it('laat SUPERUSER een base-prompt aanmaken', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/voice-prompts/base')
        .set('Authorization', `Bearer ${superuserToken}`)
        .send({ name: createdBaseNames[0], content: 'BASE A inhoud', isActive: false })
        .expect(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBeDefined();
      basePromptId = res.body.data.id;
    });

    it('laat SUPERUSER de base-prompt activeren (rest wordt gedeactiveerd)', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/admin/voice-prompts/base/${basePromptId}/activate`)
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(201);
      expect(res.body.data.isActive).toBe(true);
    });

    it('toont de base-prompt in de lijst voor SUPERUSER', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/admin/voice-prompts/base')
        .set('Authorization', `Bearer ${superuserToken}`)
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.some((p: any) => p.id === basePromptId)).toBe(true);
    });
  });

  describe('Template-prompts — org-scoped (ORG_ADMIN)', () => {
    it('laat ORG_ADMIN A een template-prompt opslaan (upsert via PUT)', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .send({ content: 'ORG_A_SECRET', isActive: true })
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.content).toBe('ORG_A_SECRET');
      expect(res.body.data.orgId).toBe(orgAId);
    });

    it('geeft ORG_ADMIN A zijn template-prompt terug', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(200);
      expect(res.body.data.content).toBe('ORG_A_SECRET');
    });

    it('toont de template-prompt in de lijst van ORG_ADMIN A', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/voice-prompts/template')
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.templateId === templateId)).toBe(true);
    });

    it('weigert een INSPECTEUR op template-beheer (403)', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/voice-prompts/template')
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .expect(403);
      await request(app.getHttpServer())
        .put(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .send({ content: 'mag niet' })
        .expect(403);
    });
  });

  describe('Combined prompt — 3-lagen-merge over HTTP', () => {
    it('voegt base + norm + template samen voor ORG_ADMIN A', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/voice-prompts/combined?templateId=${templateId}&normTypeCode=NEN3140`)
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(200);
      const prompt: string = res.body.data.prompt;
      expect(prompt).toContain('## Norm Context');
      expect(prompt).toContain('NEN3140');
      expect(prompt).toContain('## Template-instructies');
      expect(prompt).toContain('ORG_A_SECRET');
    });
  });

  describe('Cross-tenant — org B ziet org A\'s template-prompt niet', () => {
    it('geeft een lege lijst voor ORG_ADMIN B', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/voice-prompts/template')
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.templateId === templateId)).toBe(false);
    });

    it('geeft null voor dezelfde templateId bij ORG_ADMIN B', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .expect(200);
      expect(res.body.data).toBeNull();
    });

    it('houdt de prompts gescheiden nadat B zijn eigen prompt opslaat', async () => {
      await request(app.getHttpServer())
        .put(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .send({ content: 'ORG_B_EIGEN' })
        .expect(200);

      const aRes = await request(app.getHttpServer())
        .get(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(200);
      expect(aRes.body.data.content).toBe('ORG_A_SECRET');

      const bRes = await request(app.getHttpServer())
        .get(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgBAdminToken}`)
        .expect(200);
      expect(bRes.body.data.content).toBe('ORG_B_EIGEN');
    });
  });

  describe('User-prompts — persoonlijk (INSPECTEUR)', () => {
    let userPromptId: string;

    it('laat een INSPECTEUR een eigen (globale) prompt opslaan', async () => {
      const res = await request(app.getHttpServer())
        .put('/api/v1/voice-prompts/user')
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .send({ content: 'INSP_VOORKEUR' })
        .expect(200);
      expect(res.body.data.content).toBe('INSP_VOORKEUR');
      expect(res.body.data.userId).toBe(orgAInspectorId);
      userPromptId = res.body.data.id;
    });

    it('toont de eigen prompt in de lijst', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/voice-prompts/user')
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .expect(200);
      expect(res.body.data.some((p: any) => p.id === userPromptId)).toBe(true);
    });

    it('verwijdert de eigen prompt', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/voice-prompts/user/${userPromptId}`)
        .set('Authorization', `Bearer ${orgAInspectorToken}`)
        .expect(200);
    });
  });

  describe('Template-prompt verwijderen (ORG_ADMIN A)', () => {
    it('verwijdert de template-prompt en geeft daarna null', async () => {
      await request(app.getHttpServer())
        .delete(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/api/v1/voice-prompts/template/${templateId}`)
        .set('Authorization', `Bearer ${orgAAdminToken}`)
        .expect(200);
      expect(res.body.data).toBeNull();
    });
  });
});
