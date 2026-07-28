import { render, screen } from '@/test/test-utils';
import { OverviewTab } from './overview-tab';
import type { InspectionDetail } from '@/types';

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

// ── Fixture: servershape van GET /client/inspections/:id (B-412, WP-B9) ─────

function serverInspection(overrides: Partial<InspectionDetail> = {}): InspectionDetail {
  return {
    id: 'plan-1',
    projectName: 'Project X',
    referenceNumber: 'RAP-0001',
    statusCode: 'pending_review',
    normTypeCode: 'NEN3140',
    inspectionTypeCode: 'initial',
    plannedDate: '2026-07-01T00:00:00.000Z',
    completedAt: null,
    addressStreet: 'Teststraat',
    addressHouseNumber: '1',
    addressPostalCode: '1000AA',
    addressCity: 'Teststad',
    contact: { id: 'c1', companyName: 'Opdrachtgever BV', firstName: null, lastName: null },
    description: null,
    onlineRepairEnabled: false,
    startedAt: null,
    submittedAt: null,
    reviewedAt: null,
    approvedAt: null,
    notes: null,
    assignedUser: null,
    reviewer: null,
    installationResponsible: null,
    assets: [],
    generatedDocuments: [],
    findingCounts: { total: 0, open: 0, resolved: 0 },
    contentReleased: false,
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('OverviewTab (B-412: placeholder zolang het rapport niet is vrijgegeven)', () => {
  beforeEach(() => {
    apiGetMock.mockReset();
    apiGetMock.mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/client/lookups/')) return Promise.resolve([]);
      return Promise.reject(new Error(`Onverwachte GET ${endpoint}`));
    });
  });

  it('toont de placeholder en geen constateringen-teaser bij contentReleased=false', () => {
    render(<OverviewTab inspection={serverInspection()} onNavigateTab={vi.fn()} />);

    expect(screen.getByText('Rapport wordt nog gecontroleerd')).toBeInTheDocument();
    expect(screen.queryByText(/Constateringen bekijken/)).not.toBeInTheDocument();
    expect(screen.queryByText('Constateringen gevonden')).not.toBeInTheDocument();
  });

  it('verbergt de teaser óók als er (defensief) toch counts meekomen bij contentReleased=false', () => {
    render(
      <OverviewTab
        inspection={serverInspection({ findingCounts: { total: 3, open: 2, resolved: 1 } })}
        onNavigateTab={vi.fn()}
      />,
    );

    expect(screen.getByText('Rapport wordt nog gecontroleerd')).toBeInTheDocument();
    expect(screen.queryByText(/Constateringen bekijken/)).not.toBeInTheDocument();
  });

  it('toont de constateringen-teaser en geen placeholder bij contentReleased=true', () => {
    render(
      <OverviewTab
        inspection={serverInspection({
          statusCode: 'completed',
          contentReleased: true,
          findingCounts: { total: 2, open: 1, resolved: 1 },
        })}
        onNavigateTab={vi.fn()}
      />,
    );

    expect(screen.getByText('Constateringen gevonden')).toBeInTheDocument();
    expect(screen.getByText(/Constateringen bekijken/)).toBeInTheDocument();
    expect(screen.queryByText('Rapport wordt nog gecontroleerd')).not.toBeInTheDocument();
  });
});
