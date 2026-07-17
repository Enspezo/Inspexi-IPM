import { render, screen, within } from '@/test/test-utils';
import HerstelOverzichtPage from './herstel-overzicht-page';
import type { RepairFindingView, RepairSessionView } from '@/types';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/repair-token', () => ({
  hasRepairToken: () => true,
  getRepairToken: () => 'test-token',
  setRepairToken: vi.fn(),
  clearRepairToken: vi.fn(),
}));

let sessionView: RepairSessionView;

vi.mock('@/pages/herstel/hooks/use-repair', () => ({
  REPAIR_SESSION_EXPIRED_MESSAGE: 'Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode.',
  useRepairSessionExpiredRedirect: vi.fn(),
  useRepairLookup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useStartRepairSession: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRepairSession: () => ({ data: sessionView, isLoading: false, error: null }),
  useClaimFinding: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUploadResolutionPhotos: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useInvalidateRepairSession: () => vi.fn(),
  useCompleteRepair: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSignRepair: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRepairBlobUrls: (urls: string[]) => urls.map(() => null),
  downloadRepairDeclarationPdf: vi.fn(),
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

function makeFinding(overrides: Partial<RepairFindingView> & { id: string; seq: number }): RepairFindingView {
  return {
    shortDescription: `Constatering ${overrides.seq}`,
    longDescription: null,
    locationDescription: null,
    normReference: null,
    recommendation: null,
    statusCode: 'open',
    isCritical: false,
    classification: { code: '3', name: 'Aandachtspunt', color: '#ca8a04', isCritical: false },
    photos: [],
    repair: null,
    myConflict: null,
    ...overrides,
  };
}

function makeView(findings: RepairFindingView[]): RepairSessionView {
  return {
    session: {
      id: 'sessie-1',
      accessType: 'ANONYMOUS',
      status: 'ACTIVE',
      contactName: null,
      companyName: null,
      email: null,
      generatedDocumentId: null,
      expiresAt: '2026-07-20T12:00:00.000Z',
      completedAt: null,
    },
    plan: {
      id: 'plan-1',
      projectName: 'Kantoorpand Zuidas',
      referenceNumber: 'RAP-2026-001',
      addressStreet: 'Gustav Mahlerlaan',
      addressHouseNumber: '10',
      addressPostalCode: '1082 PP',
      addressCity: 'Amsterdam',
      plannedDate: '2026-06-01T00:00:00.000Z',
      inspector: { firstName: 'Ineke', lastName: 'Inspecteur', phone: '0612345678', email: null },
    },
    summary: [
      { code: '1', label: 'Direct gevaar', color: '#dc2626', isCritical: true, openCount: 1, resolvedCount: 1 },
      { code: '3', label: 'Aandachtspunt', color: '#ca8a04', isCritical: false, openCount: 2, resolvedCount: 0 },
    ],
    findings,
  };
}

const openFinding = makeFinding({ id: 'f1', seq: 1, isCritical: true });
const mineResolved = makeFinding({
  id: 'f2',
  seq: 2,
  statusCode: 'resolved',
  repair: {
    resolutionId: 'r2',
    description: 'Kabelgoot vervangen en opnieuw gemonteerd',
    reportedAt: '2026-07-15T09:00:00.000Z',
    photos: [{ id: 'ph1', url: '/api/v1/client/repair/photos/ph1' }],
    isMine: true,
  },
});
const otherResolved = makeFinding({
  id: 'f3',
  seq: 3,
  statusCode: 'resolved',
  repair: {
    resolutionId: 'r3',
    description: 'Door derde hersteld',
    reportedAt: '2026-07-15T10:00:00.000Z',
    photos: [],
    isMine: false,
  },
});
const conflictFinding = makeFinding({
  id: 'f4',
  seq: 4,
  statusCode: 'resolved',
  repair: {
    resolutionId: 'r4',
    description: 'Winnaar-omschrijving',
    reportedAt: '2026-07-15T11:00:00.000Z',
    photos: [],
    isMine: false,
  },
  myConflict: {
    resolutionId: 'r4c',
    description: 'Mijn verloren invoer',
    reportedAt: '2026-07-15T11:00:05.000Z',
    photos: [],
  },
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('HerstelOverzichtPage', () => {
  it('toont de samenvattingskaarten per classificatie-groep met open/hersteld-aantallen', () => {
    sessionView = makeView([openFinding, mineResolved]);
    render(<HerstelOverzichtPage />);

    expect(screen.getByText('Direct gevaar')).toBeInTheDocument();
    // 'Aandachtspunt' staat ook als classificatie-chip op de kaarten — minimaal
    // één treffer is de samenvattingskaart.
    expect(screen.getAllByText('Aandachtspunt').length).toBeGreaterThan(0);

    const criticalCard = screen.getByText('Direct gevaar').closest('div')!.parentElement!;
    expect(within(criticalCard).getByText('1 open')).toBeInTheDocument();
    expect(within(criticalCard).getByText('1 hersteld')).toBeInTheDocument();
    // Kritieke groep gemarkeerd met waarschuwingsicoon
    expect(within(criticalCard).getByLabelText('Kritieke groep')).toBeInTheDocument();
  });

  it('toont een herstelde constatering gedimd, met werkzaamheden en badge "Door u gemeld" bij een eigen melding', () => {
    sessionView = makeView([openFinding, mineResolved, otherResolved]);
    render(<HerstelOverzichtPage />);

    const mineCard = screen.getByTestId('repair-finding-2');
    expect(mineCard.className).toContain('opacity-70');
    expect(within(mineCard).getByText('Kabelgoot vervangen en opnieuw gemonteerd')).toBeInTheDocument();
    expect(within(mineCard).getByText('Door u gemeld')).toBeInTheDocument();
    expect(within(mineCard).queryByRole('button', { name: 'Herstel melden' })).not.toBeInTheDocument();

    // Melding van een andere partij: wél werkzaamheden, géén "Door u gemeld"
    const otherCard = screen.getByTestId('repair-finding-3');
    expect(within(otherCard).getByText('Door derde hersteld')).toBeInTheDocument();
    expect(within(otherCard).queryByText('Door u gemeld')).not.toBeInTheDocument();

    // Open constatering: niet gedimd + meld-knop
    const openCard = screen.getByTestId('repair-finding-1');
    expect(openCard.className).not.toContain('opacity-70');
    expect(within(openCard).getByRole('button', { name: 'Herstel melden' })).toBeInTheDocument();
  });

  it('toont bij een eigen conflict de gele melding dat een andere partij eerder was', () => {
    sessionView = makeView([conflictFinding]);
    render(<HerstelOverzichtPage />);

    expect(
      screen.getByText(/Een andere partij was u voor — uw invoer is bewaard/),
    ).toBeInTheDocument();
  });

  it('schakelt de afronden-knop pas in zodra er minimaal één eigen melding is', () => {
    sessionView = makeView([openFinding, otherResolved]);
    const { unmount } = render(<HerstelOverzichtPage />);
    expect(screen.getByRole('button', { name: 'Afronden' })).toBeDisabled();
    expect(screen.getByText('Nog geen meldingen door u')).toBeInTheDocument();
    unmount();

    sessionView = makeView([openFinding, mineResolved]);
    render(<HerstelOverzichtPage />);
    expect(screen.getByRole('button', { name: 'Afronden' })).toBeEnabled();
    expect(screen.getByText('1 melding door u')).toBeInTheDocument();
  });

  it('verbergt de meld-knoppen en afronden-balk bij een afgeronde sessie', () => {
    const view = makeView([openFinding, mineResolved]);
    view.session = { ...view.session, status: 'COMPLETED', completedAt: '2026-07-16T10:00:00.000Z' };
    sessionView = view;
    render(<HerstelOverzichtPage />);

    expect(screen.getByText('Herstelverklaring ondertekend')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Herstel melden' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Afronden' })).not.toBeInTheDocument();
  });
});
