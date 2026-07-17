import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import HerstelAfrondenPage from './herstel-afronden-page';
import type { RepairFindingView, RepairSessionView } from '@/types';

// ── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('@/lib/repair-token', () => ({
  hasRepairToken: () => true,
  getRepairToken: () => 'test-token',
  setRepairToken: vi.fn(),
  clearRepairToken: vi.fn(),
}));

const completeMock = vi.fn();
const signMock = vi.fn();
let sessionView: RepairSessionView;

vi.mock('@/pages/herstel/hooks/use-repair', () => ({
  REPAIR_SESSION_EXPIRED_MESSAGE: 'Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode.',
  useRepairSessionExpiredRedirect: vi.fn(),
  useRepairSession: () => ({ data: sessionView, isLoading: false, error: null }),
  useCompleteRepair: () => ({ mutateAsync: completeMock, isPending: false }),
  useSignRepair: () => ({ mutateAsync: signMock, isPending: false }),
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
    statusCode: 'resolved',
    isCritical: false,
    classification: { code: '3', name: 'Aandachtspunt', color: '#ca8a04', isCritical: false },
    photos: [],
    repair: null,
    myConflict: null,
    ...overrides,
  };
}

const withPhoto = makeFinding({
  id: 'f1',
  seq: 1,
  repair: {
    resolutionId: 'res-met-foto',
    description: 'Hersteld',
    reportedAt: '2026-07-15T09:00:00.000Z',
    photos: [{ id: 'p1', url: '/api/v1/client/repair/photos/p1' }],
    isMine: true,
  },
});
const withoutPhoto = makeFinding({
  id: 'f2',
  seq: 2,
  repair: {
    resolutionId: 'res-zonder-foto',
    description: 'Hersteld zonder foto',
    reportedAt: '2026-07-15T09:30:00.000Z',
    photos: [],
    isMine: true,
  },
});
const conflict = makeFinding({
  id: 'f3',
  seq: 3,
  repair: {
    resolutionId: 'res-winnaar',
    description: 'Winnaar',
    reportedAt: '2026-07-15T10:00:00.000Z',
    photos: [],
    isMine: false,
  },
  myConflict: {
    resolutionId: 'res-conflict',
    description: 'Mijn verloren invoer',
    reportedAt: '2026-07-15T10:00:05.000Z',
    photos: [],
  },
});

function makeView(accessType: 'ANONYMOUS' | 'CLIENT_USER' = 'ANONYMOUS'): RepairSessionView {
  return {
    session: {
      id: 'sessie-1',
      accessType,
      status: 'ACTIVE',
      contactName: accessType === 'CLIENT_USER' ? 'Klaas Klant' : null,
      companyName: null,
      email: accessType === 'CLIENT_USER' ? 'klaas@klant.nl' : null,
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
      inspector: null,
    },
    summary: [],
    findings: [withPhoto, withoutPhoto, conflict],
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('HerstelAfrondenPage', () => {
  beforeEach(() => {
    completeMock.mockReset();
    signMock.mockReset();
    sessionView = makeView('ANONYMOUS');
  });

  it('stap 1: melding zonder foto en conflicten zijn zichtbaar maar niet selecteerbaar', () => {
    render(<HerstelAfrondenPage />, { initialRoute: '/herstel/afronden' });

    // Eigen melding mét foto: standaard aangevinkt en bruikbaar
    const okCheckbox = screen.getByLabelText('#1 Constatering 1') as HTMLInputElement;
    expect(okCheckbox).toBeEnabled();
    expect(okCheckbox).toBeChecked();

    // Zonder foto: disabled + hint
    const noPhotoCheckbox = screen.getByLabelText('#2 Constatering 2') as HTMLInputElement;
    expect(noPhotoCheckbox).toBeDisabled();
    expect(noPhotoCheckbox).not.toBeChecked();
    expect(screen.getByText(/Nog geen bewijsfoto/)).toBeInTheDocument();

    // Conflict: disabled + uitleg
    const conflictCheckbox = screen.getByLabelText('#3 Constatering 3') as HTMLInputElement;
    expect(conflictCheckbox).toBeDisabled();
    expect(screen.getByText(/Een andere partij was u voor/)).toBeInTheDocument();
  });

  it('stap 1: zonder selectie is "Volgende" disabled', () => {
    render(<HerstelAfrondenPage />, { initialRoute: '/herstel/afronden' });

    const next = screen.getByRole('button', { name: 'Volgende' });
    expect(next).toBeEnabled();

    // Enige geldige melding uitvinken → knop disabled
    fireEvent.click(screen.getByLabelText('#1 Constatering 1'));
    expect(next).toBeDisabled();
  });

  it('stap 2: naam is verplicht en e-mail is verplicht bij een anonieme sessie', async () => {
    render(<HerstelAfrondenPage />, { initialRoute: '/herstel/afronden' });
    fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));

    fireEvent.click(screen.getByRole('button', { name: 'Naar controle' }));
    expect(await screen.findByText('Naam is verplicht')).toBeInTheDocument();
    expect(
      screen.getByText('E-mailadres is verplicht — daar sturen we de bevestiging naartoe'),
    ).toBeInTheDocument();
    expect(completeMock).not.toHaveBeenCalled();

    // Ongeldig e-mailadres → aparte melding
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Piet Installateur' } });
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'geen-email' } });
    fireEvent.click(screen.getByRole('button', { name: 'Naar controle' }));
    expect(await screen.findByText('Voer een geldig e-mailadres in')).toBeInTheDocument();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('stap 2 → 3 → 4: genereert de preview met de selectie en gaat door naar ondertekenen', async () => {
    completeMock.mockResolvedValue({
      documentId: 'doc-1',
      htmlPreview: '<p>Herstelverklaring preview</p>',
    });
    render(<HerstelAfrondenPage />, { initialRoute: '/herstel/afronden' });

    fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
    fireEvent.change(screen.getByLabelText('Naam'), { target: { value: 'Piet Installateur' } });
    fireEvent.change(screen.getByLabelText('E-mailadres'), { target: { value: 'piet@installatie.nl' } });
    fireEvent.click(screen.getByRole('button', { name: 'Naar controle' }));

    await waitFor(() =>
      expect(screen.getByTitle('Voorbeeld herstelverklaring')).toBeInTheDocument(),
    );
    expect(completeMock).toHaveBeenCalledWith({
      resolutionIds: ['res-met-foto'],
      contactName: 'Piet Installateur',
      companyName: undefined,
      email: 'piet@installatie.nl',
    });

    // Stap 4: ondertekenen pas mogelijk met handtekening + akkoord
    fireEvent.click(screen.getByRole('button', { name: 'Naar ondertekenen' }));
    expect(screen.getByText('Handtekening')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ondertekenen' })).toBeDisabled();
    expect(signMock).not.toHaveBeenCalled();
  });

  it('vult bij een ingelogde klant naam en e-mail vooraf in', () => {
    sessionView = makeView('CLIENT_USER');
    render(<HerstelAfrondenPage />, { initialRoute: '/herstel/afronden' });

    fireEvent.click(screen.getByRole('button', { name: 'Volgende' }));
    expect(screen.getByLabelText('Naam')).toHaveValue('Klaas Klant');
    expect(screen.getByLabelText('E-mailadres (optioneel)')).toHaveValue('klaas@klant.nl');
  });
});
