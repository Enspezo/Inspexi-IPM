import { render, screen } from '@/test/test-utils';
import { DocumentsTab } from './documents-tab';

// ── Mocks ───────────────────────────────────────────────────────────────────
// Alleen de transportlaag (apiClient.get) wordt gemockt; de echte query-hooks
// draaien, zodat de fixture als wire-formaat door dezelfde code gaat als in
// productie (zelfde patroon als findings-tab.test.tsx).

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

// ── Fixture: EXACT de servershape van GET /client/inspections/:id/documents ──
// client-inspections.service.getDocuments(): select-velden + signatures +
// per-document `canSign` (B-406a, WP-B9).

const INSPECTION_ID = 'plan-1';

function serverDocument(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    documentType: 'PLAN',
    status: 'PENDING_SIGNATURES',
    generatedAt: '2026-07-01T09:00:00.000Z',
    finalizedAt: null,
    pdfUrl: 'org-1/documents/doc-1.pdf',
    signatures: [
      {
        id: 'sig-1',
        signerRoleCode: 'CLIENT',
        signerName: 'Opdrachtgever',
        signerFunction: null,
        status: 'PENDING',
        signedAt: null,
      },
    ],
    canSign: false,
    ...overrides,
  };
}

function mockApi(documents: unknown[]) {
  apiGetMock.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/client/lookups/')) return Promise.resolve([]);
    if (endpoint === `/client/inspections/${INSPECTION_ID}/documents`) {
      return Promise.resolve(documents);
    }
    return Promise.reject(new Error(`Onverwachte GET ${endpoint}`));
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('DocumentsTab (B-406a: onderteken-knop volgt canSign)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('verbergt de onderteken-knop en legt uit bij canSign=false', async () => {
    mockApi([serverDocument({ canSign: false })]);

    render(<DocumentsTab inspectionId={INSPECTION_ID} inspectionName="Project X" />);

    // Document + openstaande CLIENT-handtekening zijn zichtbaar…
    expect(await screen.findByText('Inspectieplan')).toBeInTheDocument();
    // …maar er is géén knop en géén "vereist"-aansporing; wel de eerlijke uitleg.
    expect(screen.queryByRole('button', { name: 'Ondertekenen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Uw handtekening is vereist')).not.toBeInTheDocument();
    expect(
      screen.getByText('Ondertekening verloopt via de link in uw e-mail.'),
    ).toBeInTheDocument();
  });

  it('toont de onderteken-knop bij canSign=true met openstaande handtekening', async () => {
    mockApi([serverDocument({ canSign: true })]);

    render(<DocumentsTab inspectionId={INSPECTION_ID} inspectionName="Project X" />);

    expect(await screen.findByRole('button', { name: 'Ondertekenen' })).toBeInTheDocument();
    expect(screen.getByText('Uw handtekening is vereist')).toBeInTheDocument();
    expect(
      screen.queryByText('Ondertekening verloopt via de link in uw e-mail.'),
    ).not.toBeInTheDocument();
  });

  it('toont geen knop of uitleg zonder openstaande CLIENT-handtekening', async () => {
    mockApi([
      serverDocument({
        canSign: true,
        status: 'SIGNED',
        signatures: [
          {
            id: 'sig-1',
            signerRoleCode: 'CLIENT',
            signerName: 'Opdrachtgever',
            signerFunction: null,
            status: 'SIGNED',
            signedAt: '2026-07-02T10:00:00.000Z',
          },
        ],
      }),
    ]);

    render(<DocumentsTab inspectionId={INSPECTION_ID} inspectionName="Project X" />);

    expect(await screen.findByText('Inspectieplan')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ondertekenen' })).not.toBeInTheDocument();
    expect(
      screen.queryByText('Ondertekening verloopt via de link in uw e-mail.'),
    ).not.toBeInTheDocument();
  });
});
