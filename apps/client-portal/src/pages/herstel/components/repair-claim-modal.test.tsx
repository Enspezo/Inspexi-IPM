import { render, screen, fireEvent, waitFor } from '@/test/test-utils';
import { ApiClientError } from '@/lib/api-client';
import { RepairClaimModal } from './repair-claim-modal';
import type { RepairFindingView } from '@/types';

// ── Mocks ───────────────────────────────────────────────────────────────────

const claimMock = vi.fn();
const uploadMock = vi.fn();
const invalidateMock = vi.fn();

vi.mock('@/pages/herstel/hooks/use-repair', () => ({
  REPAIR_SESSION_EXPIRED_MESSAGE: 'Uw sessie is verlopen — log opnieuw in met rapportnummer en postcode.',
  useRepairSessionExpiredRedirect: vi.fn(),
  useClaimFinding: () => ({ mutateAsync: claimMock, isPending: false }),
  useUploadResolutionPhotos: () => ({ mutateAsync: uploadMock, isPending: false }),
  useInvalidateRepairSession: () => invalidateMock,
  useRepairBlobUrls: (urls: string[]) => urls.map(() => null),
}));

const finding: RepairFindingView = {
  id: 'f1',
  seq: 1,
  shortDescription: 'Kapotte wandcontactdoos',
  longDescription: null,
  locationDescription: null,
  normReference: 'NEN 1010 - 5.52',
  recommendation: null,
  statusCode: 'open',
  isCritical: false,
  classification: { code: '2', name: 'Risico', color: '#ea580c', isCritical: false },
  photos: [],
  repair: null,
  myConflict: null,
};

const CONFLICT_MESSAGE =
  'Deze constatering is zojuist al door een andere partij hersteld gemeld. Uw invoer is bewaard en de projectmanager is geïnformeerd.';

function addPhoto(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['foto'], 'bewijs.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

function fillDescription(value: string) {
  fireEvent.change(screen.getByLabelText(/Uitgevoerde werkzaamheden/), {
    target: { value },
  });
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('RepairClaimModal', () => {
  beforeEach(() => {
    claimMock.mockReset();
    uploadMock.mockReset();
    invalidateMock.mockReset();
  });

  it('houdt de meld-knop disabled zonder omschrijving of zonder minimaal één foto', () => {
    const { baseElement } = render(<RepairClaimModal finding={finding} onClose={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Herstel melden' });

    // Leeg formulier → disabled
    expect(submit).toBeDisabled();
    expect(screen.getByText('Minimaal één foto is verplicht.')).toBeInTheDocument();

    // Alleen omschrijving → nog steeds disabled (foto verplicht)
    fillDescription('Wandcontactdoos vervangen');
    expect(submit).toBeDisabled();

    // Omschrijving + foto → enabled
    addPhoto(baseElement);
    expect(submit).toBeEnabled();
  });

  it('claimt en uploadt foto\'s, en toont daarna de bevestiging', async () => {
    claimMock.mockResolvedValue({ resolution: { id: 'r1' } });
    uploadMock.mockResolvedValue([{ id: 'p1' }]);

    const { baseElement } = render(<RepairClaimModal finding={finding} onClose={vi.fn()} />);
    fillDescription('Wandcontactdoos vervangen');
    addPhoto(baseElement);
    fireEvent.click(screen.getByRole('button', { name: 'Herstel melden' }));

    await waitFor(() => expect(screen.getByText('Hersteld gemeld')).toBeInTheDocument());
    expect(claimMock).toHaveBeenCalledWith({
      findingId: 'f1',
      description: 'Wandcontactdoos vervangen',
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock).toHaveBeenCalled();
  });

  it('toont bij een 409 de servermelding en bewaart de foto\'s bij het conflict-concept', async () => {
    claimMock.mockRejectedValue(
      new ApiClientError({ message: CONFLICT_MESSAGE, statusCode: 409 }),
    );
    uploadMock.mockResolvedValue([{ id: 'p1' }]);

    const { baseElement } = render(<RepairClaimModal finding={finding} onClose={vi.fn()} />);
    fillDescription('Wandcontactdoos vervangen');
    addPhoto(baseElement);
    fireEvent.click(screen.getByRole('button', { name: 'Herstel melden' }));

    await waitFor(() => expect(screen.getByText(CONFLICT_MESSAGE)).toBeInTheDocument());
    // Foto's alsnog geüpload naar het CONFLICT-concept + overzicht ververst
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock).toHaveBeenCalled();
  });

  it('toont andere fouten als foutmelding zonder de invoer te wissen', async () => {
    claimMock.mockRejectedValue(
      new ApiClientError({ message: 'U heeft deze constatering al hersteld gemeld', statusCode: 400 }),
    );

    const { baseElement } = render(<RepairClaimModal finding={finding} onClose={vi.fn()} />);
    fillDescription('Wandcontactdoos vervangen');
    addPhoto(baseElement);
    fireEvent.click(screen.getByRole('button', { name: 'Herstel melden' }));

    await waitFor(() =>
      expect(screen.getByText('U heeft deze constatering al hersteld gemeld')).toBeInTheDocument(),
    );
    expect(uploadMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Uitgevoerde werkzaamheden/)).toHaveValue(
      'Wandcontactdoos vervangen',
    );
  });
});
