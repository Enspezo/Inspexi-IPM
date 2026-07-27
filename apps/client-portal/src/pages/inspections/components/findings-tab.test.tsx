import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { FindingsTab } from './findings-tab';

// ── Mocks ───────────────────────────────────────────────────────────────────
// We mocken uitsluitend de transportlaag (apiClient.get) en laten de echte
// query-hooks (useInspectionFindings/useFinding/useLookups) draaien: zo gaat de
// fixture exact als wire-formaat door dezelfde code als in productie.

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

// ── Fixtures: EXACT de servershape (B-401-regressie) ────────────────────────
// GET /client/inspections/:id/findings → client-inspections.service.getFindings():
// finding.findMany({ include: { assetNode: {id,name,description}, resolutions: take 1 }}).
// Bewust niet getypeerd als `Finding`: dit is het wire-formaat — mét `assetNode`,
// zónder `asset` en zónder `locationDescription` op de node — zodat deze test
// breekt zodra de frontend weer van de echte serverrespons afdrijft.

const INSPECTION_ID = 'plan-1';

function serverFinding(overrides: Record<string, unknown> = {}) {
  return {
    id: 'f1',
    orgId: 'org-1',
    assetNodeId: 'node-1',
    inspectionPlanId: INSPECTION_ID,
    visualInspectionId: null,
    measurementRecordId: null,
    findingTemplateId: null,
    inspectionType: 'visual',
    shortDescription: 'Kapotte wandcontactdoos',
    longDescription: null,
    classificationValues: { NEN3140: 'C2' },
    locationDescription: null,
    locationMarker: null,
    recommendation: null,
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

/** GET /client/findings/:id → client-findings.service.getDetail() (volle resoluties). */
function serverFindingDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...serverFinding(),
    resolutions: [
      {
        id: 'r1',
        findingId: 'f1',
        resolvedByClientUserId: null,
        repairSessionId: null,
        description: 'Wandcontactdoos vervangen',
        resolvedAt: '2026-07-02T10:00:00.000Z',
        statusCode: 'PENDING_VERIFICATION',
        verifiedAt: null,
        verifiedBy: null,
        verificationNotes: null,
        resolvedByClientUser: null,
        photos: [],
      },
    ],
    ...overrides,
  };
}

function mockApi(findings: unknown[], detail?: unknown) {
  apiGetMock.mockImplementation((endpoint: string) => {
    if (endpoint.startsWith('/client/lookups/')) return Promise.resolve([]);
    if (endpoint === `/client/inspections/${INSPECTION_ID}/findings`) {
      return Promise.resolve(findings);
    }
    if (detail && endpoint === '/client/findings/f1') return Promise.resolve(detail);
    return Promise.reject(new Error(`Onverwachte GET ${endpoint}`));
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('FindingsTab (B-401: servershape met assetNode, zonder asset)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
  });

  it('rendert constateringen met de exacte servershape zonder te crashen', async () => {
    mockApi([
      serverFinding(),
      serverFinding({
        id: 'f2',
        shortDescription: 'Ontbrekende aardleiding',
        normReference: null,
        assetNode: { id: 'node-2', name: 'Groepenkast GK-02', description: null },
      }),
    ]);

    render(<FindingsTab inspectionId={INSPECTION_ID} />);

    expect(await screen.findByText('2 constateringen')).toBeInTheDocument();
    expect(screen.getByText('Kapotte wandcontactdoos')).toBeInTheDocument();
    expect(screen.getByText('Ontbrekende aardleiding')).toBeInTheDocument();
    // Locatieregel: assetNode.description (géén locationDescription op de node) + naam
    expect(
      screen.getByText('Technische ruimte, verdieping 1 · Verdeelkast VK-01'),
    ).toBeInTheDocument();
    // Node zonder description → alleen de naam
    expect(screen.getByText('Groepenkast GK-02')).toBeInTheDocument();
  });

  it('laat finding.locationDescription voorgaan op assetNode.description', async () => {
    mockApi([serverFinding({ locationDescription: 'Bij de meterkast' })]);

    render(<FindingsTab inspectionId={INSPECTION_ID} />);

    expect(await screen.findByText('Bij de meterkast · Verdeelkast VK-01')).toBeInTheDocument();
    expect(
      screen.queryByText(/Technische ruimte, verdieping 1/),
    ).not.toBeInTheDocument();
  });

  it('crasht niet wanneer assetNode onverhoopt ontbreekt (defensief)', async () => {
    mockApi([serverFinding({ assetNode: null })]);

    render(<FindingsTab inspectionId={INSPECTION_ID} />);

    expect(await screen.findByText('1 constatering')).toBeInTheDocument();
    expect(screen.getByText('Kapotte wandcontactdoos')).toBeInTheDocument();
    // Geen locatieregel, maar ook geen crash
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it('opent de detailmodal die dezelfde servershape rendert (KL-08 → detail)', async () => {
    mockApi([serverFinding()], serverFindingDetail());

    render(<FindingsTab inspectionId={INSPECTION_ID} />);

    fireEvent.click(await screen.findByText('Kapotte wandcontactdoos'));

    // Modal-titel + asset-blok uit assetNode. De exacte naam-match kan alleen het
    // modal-blok zijn: de lijstkaart bevat de naam enkel als deel van de
    // samengestelde locatieregel ("… · Verdeelkast VK-01").
    expect(await screen.findByText('Constatering')).toBeInTheDocument();
    expect(await screen.findByText('Verdeelkast VK-01')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getAllByText(/Technische ruimte, verdieping 1/).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getByText(/Gemeld op/)).toBeInTheDocument();
  });
});
