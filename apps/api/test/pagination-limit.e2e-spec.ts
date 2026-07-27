import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { AppModule } from '@/app.module';
import { PrismaService } from '@/prisma';
import bcrypt from 'bcrypt';

/**
 * Parametrisch paginatie-contract (WP-B6 / B-305).
 *
 * De portal vraagt dropdown-/lijstdata overal op met `limit=200`. De basis-DTO
 * (BasePaginationQueryDto) cap't daarom op 200. Deze suite itereert over ALLE
 * gepagineerde list-endpoints en verwacht dat `?limit=200` een 200 geeft — zo
 * kan een nieuw endpoint (of een nieuwe, te lage override) nooit meer stil een
 * 400 op het portal-contract introduceren.
 *
 * Bewust afwijkende caps staan expliciet onderaan (verwacht 400 bij limit=200):
 *   - GET /audit-logs/:entityType/:entityId  → @Max(50)  (zware audit-rijen)
 *   - GET /search                            → @Max(20)  (suggestie-feed)
 *   - GET /help/articles/contextual          → @Max(50)  (suggestie-feed)
 * Caps > 200 (locations 1000, projects/requests 500) zitten gewoon in de
 * 200-lijst — die accepteren limit=200 per definitie.
 */

interface EndpointCase {
  /** Pad zonder /api/v1-prefix, zonder query string. */
  path: string;
  /** Extra query-parameters naast limit=200. */
  query?: Record<string, string>;
  /** Welke login het endpoint vereist (default: org-admin). */
  auth?: 'admin' | 'superuser';
}

// Alle gepagineerde list-endpoints (DTO's die BasePaginationQueryDto extenden
// + standalone gepagineerde DTO's). Nieuw gepagineerd endpoint? → hier toevoegen.
const PAGINATED_ENDPOINTS: EndpointCase[] = [
  { path: '/contacts' },
  { path: '/contacts/contact-persons' },
  { path: '/contacts/locations' }, // eigen cap 1000 (kaartweergave)
  { path: '/customer-groups' },
  { path: '/product-groups' },
  { path: '/products' },
  { path: '/price-tables' },
  { path: '/requests' }, // eigen cap 500
  { path: '/quotes' },
  { path: '/quote-templates' },
  { path: '/tasks' },
  { path: '/documents' },
  { path: '/document-tags' },
  { path: '/notifications' },
  { path: '/notes' },
  { path: '/projects' }, // eigen cap 500 (kanban)
  { path: '/work-orders' },
  { path: '/planning' },
  { path: '/inspection-plans' },
  { path: '/finding-templates' },
  { path: '/assets' },
  { path: '/measurement-instruments' },
  { path: '/inspector-certificates' },
  { path: '/availability/templates' },
  { path: '/audit-logs/me' },
  { path: '/support-tickets' },
  { path: '/help/articles' },
  { path: '/error-reports', auth: 'superuser' },
];

// Bewust lagere caps — gedocumenteerd in de betreffende DTO's. limit=200 hoort
// hier een 400 met een limit-melding te geven; wijzigt dit, pas dan óók de
// DTO-comment en de lijst in common/dto/pagination-query.dto.ts aan.
const DOCUMENTED_LOWER_CAPS: EndpointCase[] = [
  { path: '/audit-logs/Contact/00000000-0000-4000-8000-000000000000' }, // @Max(50)
  { path: '/search', query: { q: 'test' } }, // @Max(20)
  { path: '/help/articles/contextual' }, // @Max(50)
];

describe('Paginatie-contract: limit=200 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let orgId: string;
  let adminId: string;
  let superuserId: string;
  let adminToken: string;
  let superuserToken: string;

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

    const org = await prisma.organization.create({
      data: { name: 'E2E PagLimit Org', slug: 'e2epaglimit' },
    });
    orgId = org.id;

    const passwordHash = await bcrypt.hash('TestPass123!', 10);
    const admin = await prisma.user.create({
      data: {
        email: 'e2e-paglimit-admin@test.nl',
        passwordHash,
        firstName: 'Pag',
        lastName: 'Limit',
        roles: ['ORG_ADMIN'],
        orgId: org.id,
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;

    const superuser = await prisma.user.create({
      data: {
        email: 'e2e-paglimit-super@test.nl',
        passwordHash,
        firstName: 'Pag',
        lastName: 'Super',
        roles: ['SUPERUSER'],
        emailVerifiedAt: new Date(),
      },
    });
    superuserId = superuser.id;

    const adminLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-paglimit-admin@test.nl', password: 'TestPass123!' });
    adminToken = adminLogin.body.data.accessToken;

    const superLogin = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: 'e2e-paglimit-super@test.nl', password: 'TestPass123!' });
    superuserToken = superLogin.body.data.accessToken;
  });

  afterAll(async () => {
    try {
      await prisma.auditLog.deleteMany({
        where: { userId: { in: [adminId, superuserId] } },
      });
      await prisma.refreshToken.deleteMany({
        where: { userId: { in: [adminId, superuserId] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [adminId, superuserId] } },
      });
      await prisma.organization.deleteMany({ where: { id: orgId } });
    } finally {
      await app.close();
    }
  });

  const buildUrl = (c: EndpointCase): string => {
    const params = new URLSearchParams({ limit: '200', ...(c.query ?? {}) });
    return `/api/v1${c.path}?${params.toString()}`;
  };

  describe('accepteert limit=200 op elk gepagineerd endpoint', () => {
    it.each(PAGINATED_ENDPOINTS.map((c) => [c.path, c] as const))(
      'GET %s?limit=200 → 200',
      async (_path, c) => {
        const token = c.auth === 'superuser' ? superuserToken : adminToken;
        const res = await request(app.getHttpServer())
          .get(buildUrl(c))
          .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        // Meeste controllers wrappen zelf in { success, data }; enkele (projects)
        // laten dat aan de response-interceptor uit main.ts over, die hier niet
        // geregistreerd staat — accepteer beide vormen, maar nooit success:false.
        expect(res.body?.success).not.toBe(false);
      },
    );
  });

  describe('gedocumenteerde lagere caps blijven limit=200 weigeren', () => {
    it.each(DOCUMENTED_LOWER_CAPS.map((c) => [c.path, c] as const))(
      'GET %s?limit=200 → 400 (bewust lagere cap)',
      async (_path, c) => {
        const res = await request(app.getHttpServer())
          .get(buildUrl(c))
          .set('Authorization', `Bearer ${adminToken}`);

        expect(res.status).toBe(400);
        expect(JSON.stringify(res.body.message)).toContain('limit');
      },
    );
  });

  it('weigert limit boven de basiscap (201) op een basis-DTO endpoint', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/contacts?limit=201')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body.message)).toContain('limit');
  });
});
