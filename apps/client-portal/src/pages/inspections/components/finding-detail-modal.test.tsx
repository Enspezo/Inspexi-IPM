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

// ── B-409 (beslispunt A4): herstelverklaring-indicator bij de resolutie ─────

function reportedResolution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'res-1',
    statusCode: 'REPORTED',
    description: 'Wandcontactdoos vervangen',
    resolvedAt: '2026-07-25T10:00:00.000Z',
    verifiedAt: null,
    verificationNotes: null,
    resolvedByClientUserId: null,
    resolvedByClientUser: null,
    repairSessionId: 'sess-1',
    photos: [],
    ...overrides,
  };
}

describe('FindingDetailModal — herstelverklaring-indicator (B-409 / A4)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('toont bij een REPORTED-resolutie mét ondertekende verklaring een indicator + Documenten-tab-knop', async () => {
    mockDetail(
      serverFindingDetail({
        statusCode: 'resolved',
        resolutions: [
          reportedResolution({
            repairStatement: { documentId: 'doc-1', signedAt: '2026-07-25T12:00:00.000Z' },
          }),
        ],
      }),
    );
    const onShowDocuments = vi.fn();

    render(
      <FindingDetailModal findingId="f1" onClose={vi.fn()} onShowDocuments={onShowDocuments} />,
    );

    expect(
      await screen.findByText(/op 25 juli 2026 een ondertekende herstelverklaring afgegeven/),
    ).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Bekijk de verklaring op de Documenten-tab' });
    button.click();
    expect(onShowDocuments).toHaveBeenCalledTimes(1);
  });

  it('toont de niet-ondertekend-variant zonder knop wanneer onShowDocuments ontbreekt', async () => {
    mockDetail(
      serverFindingDetail({
        statusCode: 'resolved',
        resolutions: [
          reportedResolution({ repairStatement: { documentId: 'doc-1', signedAt: null } }),
        ],
      }),
    );

    render(<FindingDetailModal findingId="f1" onClose={vi.fn()} />);

    expect(
      await screen.findByText(/Voor dit herstel is een herstelverklaring opgesteld\./),
    ).toBeInTheDocument();
    expect(screen.getByText('U vindt de verklaring op de Documenten-tab.')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Bekijk de verklaring op de Documenten-tab' }),
    ).not.toBeInTheDocument();
  });

  it('toont géén indicator zonder repairStatement (klassieke resolutie)', async () => {
    mockDetail(
      serverFindingDetail({
        resolutions: [reportedResolution({ statusCode: 'PENDING_VERIFICATION', repairStatement: null })],
      }),
    );

    render(<FindingDetailModal findingId="f1" onClose={vi.fn()} />);

    expect(await screen.findByText('Kapotte wandcontactdoos')).toBeInTheDocument();
    expect(screen.queryByText(/herstelverklaring/)).not.toBeInTheDocument();
  });
});
