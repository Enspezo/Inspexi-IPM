import { render, screen } from '@/test/test-utils';
import { FindingDetailModal } from './finding-detail-modal';

// ── Mocks ───────────────────────────────────────────────────────────────────
// Alleen de transportlaag; de echte useFinding/useLookups-hooks blijven draaien.

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

// ── Fixture: EXACT de servershape van GET /client/findings/:id ──────────────
// client-findings.service.getDetail(): alle Finding-scalars + include
// assetNode {id,name,description} + volle resoluties (met foto's, geanonimiseerd).
// Mét `assetNode`, zónder `asset` — B-401-regressie.

function serverFindingDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    orgId: 'org-1',
    assetNodeId: 'node-1',
    inspectionPlanId: 'plan-1',
    visualInspectionId: null,
    measurementRecordId: null,
    findingTemplateId: null,
    inspectionType: 'visual',
    shortDescription: 'Kapotte wandcontactdoos',
    longDescription: 'Behuizing gebroken, aders bereikbaar.',
    classificationValues: { NEN3140: 'C2' },
    locationDescription: null,
    locationMarker: null,
    recommendation: 'Direct vervangen',
    recommendationCustom: null,
    normReference: 'NEN 1010 - 5.52',
    checklistItemId: null,
    statusCode: 'open',
    resolvedAt: null,
    resolvedBy: null,
    resolutionNotes: null,
    isCritical: false,
    createdAt: '2026-07-01T09:00:00.000Z',
    updatedAt: '2026-07-01T09:00:00.000Z',
    syncedAt: null,
    createdBy: null,
    deviceId: null,
    deletedAt: null,
    assetNode: {
      id: 'node-1',
      name: 'Verdeelkast VK-01',
      description: 'Technische ruimte, verdieping 1',
    },
    resolutions: [],
    ...overrides,
  };
}

function mockDetail(detail: unknown) {
  apiGetMock.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/client/lookups/')) return Promise.resolve([]);
    if (endpoint === '/client/findings/f1') return Promise.resolve(detail);
    return Promise.reject(new Error(`Onverwachte GET ${endpoint}`));
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('FindingDetailModal (B-401: servershape met assetNode, zonder asset)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('rendert het asset-blok uit assetNode (naam + description) zonder te crashen', async () => {
    mockDetail(serverFindingDetail());

    render(<FindingDetailModal findingId="f1" onClose={vi.fn()} />);

    expect(await screen.findByText('Kapotte wandcontactdoos')).toBeInTheDocument();
    expect(screen.getByText('Verdeelkast VK-01')).toBeInTheDocument();
    expect(screen.getByText('Technische ruimte, verdieping 1')).toBeInTheDocument();
    expect(screen.getByText('Direct vervangen')).toBeInTheDocument();
  });

  it('laat finding.locationDescription voorgaan op assetNode.description', async () => {
    mockDetail(serverFindingDetail({ locationDescription: 'Bij de meterkast' }));

    render(<FindingDetailModal findingId="f1" onClose={vi.fn()} />);

    expect(await screen.findByText('Bij de meterkast')).toBeInTheDocument();
    expect(screen.queryByText('Technische ruimte, verdieping 1')).not.toBeInTheDocument();
  });

  it('toont een em-dash en crasht niet wanneer assetNode ontbreekt (defensief)', async () => {
    mockDetail(serverFindingDetail({ assetNode: null }));

    render(<FindingDetailModal findingId="f1" onClose={vi.fn()} />);

    expect(await screen.findByText('Kapotte wandcontactdoos')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText('Verdeelkast VK-01')).not.toBeInTheDocument();
  });
});
