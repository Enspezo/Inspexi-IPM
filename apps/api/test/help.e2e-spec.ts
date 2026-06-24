import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';

/**
 * Help / Knowledge base API (e2e)
 *
 * Draait tegen de geseede database. Maakt eigen KB-fixtures aan via de API
 * (globale categorie + globaal/org-artikelen) en verifieert de zichtbaarheids-
 * en scope-regels:
 *   - lezen filtert op `org_id IS NULL OR = userOrgId` én `status = PUBLISHED`
 *   - org A ziet org B's org-artikel niet (cross-tenant isolatie)
 *   - DRAFT is onzichtbaar op de leesendpoints
 *   - ORG_ADMIN kan globale rijen niet muteren (403); SUPERUSER wel
 *   - ORG_ADMIN wordt geforceerd op de eigen org (geen schrijven voor andere org)
 *
 * Seed users: superuser@inspexi.nl (SUPERUSER), admin@inspexi-demo.nl (org1),
 *   admin@testbedrijf.nl (org2), inspecteur@inspexi-demo.nl (INSPECTEUR org1).
 */
describe('Help / Knowledge base (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let superToken: string;
  let org1Token: string;
  let org2Token: string;
  let inspecteurToken: string;
  let org2OrgId: string;

  const createdArticleIds: string[] = [];
  const createdCategoryIds: string[] = [];

  let globalCategoryId: string;
  let globalArticleId: string;
  let draftArticleSlug: string;
  let draftArticleId: string;
  let org1ArticleId: string;
  let org2ArticleId: string;
  let globalCollisionId: string;
  let org1CollisionId: string;
  const COLLISION_SLUG = 'e2e-collision-slug';

  async function login(email: string, password = 'Password123!') {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return res.body.data.accessToken as string;
  }

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createArticle(token: string, body: Record<string, unknown>) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/help/admin/articles')
      .set(auth(token))
      .send(body)
      .expect(201);
    createdArticleIds.push(res.body.data.id);
    return res.body.data;
  }

  async function publish(token: string, id: string) {
    await request(app.getHttpServer())
      .post(`/api/v1/help/admin/articles/${id}/publish`)
      .set(auth(token))
      .expect(201);
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

    [superToken, org1Token, org2Token, inspecteurToken] = await Promise.all([
      login('superuser@inspexi.nl'),
      login('admin@inspexi-demo.nl'),
      login('admin@testbedrijf.nl'),
      login('inspecteur@inspexi-demo.nl'),
    ]);

    const org2 = await prisma.organization.findFirst({
      where: { slug: 'testbedrijf' },
    });
    org2OrgId = org2!.id;

    // SUPERUSER maakt een globale categorie
    const catRes = await request(app.getHttpServer())
      .post('/api/v1/help/admin/categories')
      .set(auth(superToken))
      .send({ name: 'E2E Help Categorie' })
      .expect(201);
    globalCategoryId = catRes.body.data.id;
    createdCategoryIds.push(globalCategoryId);

    // Globaal gepubliceerd artikel
    const g = await createArticle(superToken, {
      categoryId: globalCategoryId,
      title: 'E2E Globaal artikel',
      body: '# Globaal\n\nInhoud',
    });
    globalArticleId = g.id;
    await publish(superToken, globalArticleId);

    // Globaal CONCEPT (niet gepubliceerd)
    const draft = await createArticle(superToken, {
      categoryId: globalCategoryId,
      title: 'E2E Concept artikel',
      body: 'concept',
    });
    draftArticleId = draft.id;
    draftArticleSlug = draft.slug;

    // org1 org-artikel (gepubliceerd)
    const o1 = await createArticle(org1Token, {
      categoryId: globalCategoryId,
      title: 'E2E Org1 artikel',
      body: 'org1',
    });
    org1ArticleId = o1.id;
    await publish(org1Token, org1ArticleId);

    // org2 org-artikel (gepubliceerd)
    const o2 = await createArticle(org2Token, {
      categoryId: globalCategoryId,
      title: 'E2E Org2 artikel',
      body: 'org2',
    });
    org2ArticleId = o2.id;
    await publish(org2Token, org2ArticleId);

    // Slug-botsing tussen scopes: zelfde slug globaal én in org1 (toegestaan door
    // @@unique([orgId, slug])). Org-override moet consistent winnen voor org1.
    const gc = await createArticle(superToken, {
      categoryId: globalCategoryId,
      title: 'E2E Collision Global',
      slug: COLLISION_SLUG,
      body: 'global',
    });
    globalCollisionId = gc.id;
    await publish(superToken, globalCollisionId);

    const o1c = await createArticle(org1Token, {
      categoryId: globalCategoryId,
      title: 'E2E Collision Org1',
      slug: COLLISION_SLUG,
      body: 'org1',
    });
    org1CollisionId = o1c.id;
    await publish(org1Token, org1CollisionId);
  });

  afterAll(async () => {
    try {
      if (createdArticleIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entityId: { in: createdArticleIds } },
        });
        await prisma.helpArticle.deleteMany({
          where: { id: { in: createdArticleIds } },
        });
      }
      if (createdCategoryIds.length > 0) {
        await prisma.auditLog.deleteMany({
          where: { entityId: { in: createdCategoryIds } },
        });
        await prisma.helpCategory.deleteMany({
          where: { id: { in: createdCategoryIds } },
        });
      }
    } finally {
      await app.close();
    }
  });

  it('org1 ziet globaal + eigen-org, niet het org2-artikel', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/help/articles?limit=100')
      .set(auth(org1Token))
      .expect(200);
    const ids = res.body.data.data.map((a: { id: string }) => a.id);
    expect(ids).toContain(globalArticleId);
    expect(ids).toContain(org1ArticleId);
    expect(ids).not.toContain(org2ArticleId);
  });

  it('org2 ziet globaal + eigen-org, niet het org1-artikel', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/help/articles?limit=100')
      .set(auth(org2Token))
      .expect(200);
    const ids = res.body.data.data.map((a: { id: string }) => a.id);
    expect(ids).toContain(globalArticleId);
    expect(ids).toContain(org2ArticleId);
    expect(ids).not.toContain(org1ArticleId);
  });

  it('DRAFT-artikel is verborgen op de leeslijst', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/help/articles?limit=100')
      .set(auth(org1Token))
      .expect(200);
    const ids = res.body.data.data.map((a: { id: string }) => a.id);
    expect(ids).not.toContain(draftArticleId);
  });

  it('DRAFT-artikel geeft 404 op lezen-op-slug', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/help/articles/${draftArticleSlug}`)
      .set(auth(org1Token))
      .expect(404);
  });

  it('ORG_ADMIN kan een globaal artikel niet wijzigen (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/help/admin/articles/${globalArticleId}`)
      .set(auth(org1Token))
      .send({ title: 'hack' })
      .expect(403);
  });

  it('ORG_ADMIN kan een globaal artikel niet verwijderen (403)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/help/admin/articles/${globalArticleId}`)
      .set(auth(org1Token))
      .expect(403);
  });

  it('SUPERUSER kan een globaal artikel wel wijzigen (200)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/help/admin/articles/${globalArticleId}`)
      .set(auth(superToken))
      .send({ excerpt: 'bijgewerkt door superuser' })
      .expect(200);
  });

  it('ORG_ADMIN kan niet voor een andere org schrijven (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/help/admin/articles')
      .set(auth(org1Token))
      .send({
        categoryId: globalCategoryId,
        title: 'E2E cross-org poging',
        body: 'x',
        orgId: org2OrgId,
      })
      .expect(403);
  });

  it('INSPECTEUR mag lezen maar niet bij beheer (403)', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/help/articles?limit=10')
      .set(auth(inspecteurToken))
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/help/admin/articles')
      .set(auth(inspecteurToken))
      .send({ categoryId: globalCategoryId, title: 'x', body: 'y' })
      .expect(403);
  });

  it('org-override wint bij slug-botsing tussen scopes', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/help/articles/${COLLISION_SLUG}`)
      .set(auth(org1Token))
      .expect(200);
    expect(res.body.data.id).toBe(org1CollisionId);
    expect(res.body.data.orgId).not.toBeNull();
  });

  it('andere org zonder override krijgt de globale versie', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/help/articles/${COLLISION_SLUG}`)
      .set(auth(org2Token))
      .expect(200);
    expect(res.body.data.id).toBe(globalCollisionId);
    expect(res.body.data.orgId).toBeNull();
  });

  // ── Categorieën (beheer) ──────────────────────────────────────────────────
  it('ORG_ADMIN kan een globale categorie niet wijzigen (403)', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/help/admin/categories/${globalCategoryId}`)
      .set(auth(org1Token))
      .send({ name: 'hack' })
      .expect(403);
  });

  it('ORG_ADMIN kan een globale categorie niet verwijderen (403)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/help/admin/categories/${globalCategoryId}`)
      .set(auth(org1Token))
      .expect(403);
  });

  it('SUPERUSER kan een categorie met artikelen niet verwijderen (400)', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/help/admin/categories/${globalCategoryId}`)
      .set(auth(superToken))
      .expect(400);
  });

  it('ORG_ADMIN maakt een eigen-org categorie (geforceerd op eigen org) en verwijdert die', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/help/admin/categories')
      .set(auth(org1Token))
      .send({ name: 'E2E Org1 categorie' })
      .expect(201);
    const catId = created.body.data.id as string;
    createdCategoryIds.push(catId);
    expect(created.body.data.orgId).not.toBeNull(); // ORG_ADMIN geforceerd op eigen org

    // leeg → mag verwijderd worden
    await request(app.getHttpServer())
      .delete(`/api/v1/help/admin/categories/${catId}`)
      .set(auth(org1Token))
      .expect(200);
  });

  it('INSPECTEUR mag geen categorie aanmaken (403)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/help/admin/categories')
      .set(auth(inspecteurToken))
      .send({ name: 'mag niet' })
      .expect(403);
  });

  it('feedback met ongeldige uuid geeft 400 (ParseUUIDPipe, geen Prisma-500)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/help/articles/not-a-uuid/feedback')
      .set(auth(org1Token))
      .send({ helpful: true })
      .expect(400);
  });

  it('feedback hoogt de teller op', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/help/articles/${globalArticleId}/feedback`)
      .set(auth(org1Token))
      .send({ helpful: true })
      .expect(201);
    expect(res.body.data.helpfulYes).toBeGreaterThanOrEqual(1);
  });
});
