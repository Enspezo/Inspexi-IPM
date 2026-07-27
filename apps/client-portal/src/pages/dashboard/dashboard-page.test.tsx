import { render, screen } from '@/test/test-utils';
import DashboardPage from './dashboard-page';

// ── Mocks ───────────────────────────────────────────────────────────────────

const { apiGetMock } = vi.hoisted(() => ({ apiGetMock: vi.fn() }));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: (endpoint: string) => apiGetMock(endpoint),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      upload: vi.fn(),
    },
  };
});

// De dashboard-pagina leest alleen user.firstName uit de auth-context.
vi.mock('@/providers/client-auth-provider', () => ({
  useClientAuth: () => ({ user: { id: 'cu-1', firstName: 'Klaas', lastName: 'Klant' } }),
}));

// ── Fixture: servershape van GET /client/inspections/dashboard (WP-B9) ──────
// De server gate't de tellers al (B-412) en filtert pendingSignatures op
// canSign (B-406a) — deze test legt vast dat de UI die gegate data 1-op-1
// respecteert en niet zelf alsnog actie-items verzint.

function serverDashboard(overrides: Record<string, unknown> = {}) {
  return {
    recentInspections: [
      {
        id: 'plan-gated',
        projectName: 'Nog niet gereviewde inspectie',
        referenceNumber: 'RAP-0002',
        statusCode: 'pending_review',
        normTypeCode: 'NEN3140',
        inspectionTypeCode: 'initial',
        plannedDate: '2026-07-01T00:00:00.000Z',
        completedAt: null,
        addressStreet: 'Teststraat',
        addressHouseNumber: '1',
        addressCity: 'Teststad',
        contact: { id: 'c1', companyName: 'Opdrachtgever BV', firstName: null, lastName: null },
      },
    ],
    pendingSignatures: [],
    openFindingsCount: 0,
    totalInspections: 2,
    ...overrides,
  };
}

function mockApi(dashboard: unknown) {
  apiGetMock.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/client/lookups/')) return Promise.resolve([]);
    if (endpoint === '/client/inspections/dashboard') return Promise.resolve(dashboard);
    return Promise.reject(new Error(`Onverwachte GET ${endpoint}`));
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DashboardPage (B-412/B-406a: teller en actie-items volgen de server-gate)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('toont géén "Actie vereist" wanneer de gegate teller 0 is en er geen tekenbare documenten zijn', async () => {
    mockApi(serverDashboard());

    render(<DashboardPage />);

    // Het (gegate, pending_review) plan blijft als metadata zichtbaar…
    expect(await screen.findByText('Nog niet gereviewde inspectie')).toBeInTheDocument();
    // …maar er is geen actieblok voor constateringen of ondertekenen.
    expect(screen.queryByText('Actie vereist')).not.toBeInTheDocument();
    expect(screen.queryByText(/openstaande constatering/)).not.toBeInTheDocument();
    expect(screen.queryByText(/ondertekenen/)).not.toBeInTheDocument();
  });

  it('toont de actie-items wél voor vrijgegeven inhoud met teken-recht', async () => {
    mockApi(
      serverDashboard({
        pendingSignatures: [
          {
            signatureId: 'sig-1',
            documentId: 'doc-1',
            documentType: 'REPORT',
            inspectionPlanId: 'plan-1',
            projectName: 'Vrijgegeven inspectie',
            city: 'Teststad',
          },
        ],
        openFindingsCount: 2,
      }),
    );

    render(<DashboardPage />);

    expect(await screen.findByText('Actie vereist')).toBeInTheDocument();
    expect(
      screen.getByText(/Inspectierapport ondertekenen — Vrijgegeven inspectie/),
    ).toBeInTheDocument();
    expect(screen.getByText('2 openstaande constateringen')).toBeInTheDocument();
  });
});
