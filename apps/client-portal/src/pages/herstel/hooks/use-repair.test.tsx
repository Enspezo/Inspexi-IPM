import { render, screen, waitFor } from '@/test/test-utils';
import { clearRepairToken, getRepairToken, hasRepairToken, setRepairToken } from '@/lib/repair-token';
import {
  REPAIR_SESSION_EXPIRED_MESSAGE,
  useRepairSession,
  useRepairSessionExpiredRedirect,
} from './use-repair';

// ── Mocks ───────────────────────────────────────────────────────────────────

// useNavigate gemockt (partial mock — MemoryRouter e.d. blijven echt) zodat we
// het exacte navigatie-contract kunnen asserteren: pad, replace én message-state.
const navigateMock = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

// Interne event-naam uit use-repair.ts (niet geëxporteerd — bewust gespiegeld:
// wijzigt de naam, dan hoort deze test te breken).
const REPAIR_SESSION_EXPIRED_EVENT = 'repair-session:expired';

/** 401-respons zoals de RepairSessionGuard die geeft (NL-melding). */
const SESSION_EXPIRED_SERVER_MESSAGE = 'Uw herstelsessie is verlopen of ongeldig.';

function make401Response() {
  return {
    ok: false,
    status: 401,
    json: async () => ({
      success: false,
      message: SESSION_EXPIRED_SERVER_MESSAGE,
      statusCode: 401,
    }),
  };
}

// ── Harnassen ───────────────────────────────────────────────────────────────

function RedirectHarness() {
  useRepairSessionExpiredRedirect();
  return null;
}

/** Pagina-achtige harnas: redirect-hook + sessie-query (zoals de herstel-pagina's). */
function SessionHarness() {
  useRepairSessionExpiredRedirect();
  const session = useRepairSession();
  return <div>{session.error ? `fout: ${session.error.message}` : 'geladen'}</div>;
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useRepairSessionExpiredRedirect', () => {
  beforeEach(() => {
    navigateMock.mockReset();
    clearRepairToken();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    clearRepairToken();
  });

  it('navigeert naar /herstel met de NL-melding zodra het verlopen-event vuurt', () => {
    render(<RedirectHarness />);

    window.dispatchEvent(new CustomEvent(REPAIR_SESSION_EXPIRED_EVENT));

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/herstel', {
      replace: true,
      state: { message: REPAIR_SESSION_EXPIRED_MESSAGE },
    });
  });

  it('ruimt de event-listener op bij unmount', () => {
    const { unmount } = render(<RedirectHarness />);
    unmount();

    window.dispatchEvent(new CustomEvent(REPAIR_SESSION_EXPIRED_EVENT));

    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('wist bij een 401 op een herstel-call het token en redirect met melding (review #15)', async () => {
    setRepairToken('sessietoken-96-hex');
    expect(hasRepairToken()).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue(make401Response());
    vi.stubGlobal('fetch', fetchMock);

    // useRepairSession vuurt (enabled: token aanwezig) → 401 → onUnauthorized:
    // token wissen + expired-event → redirect-hook navigeert.
    render(<SessionHarness />);

    await waitFor(() =>
      expect(navigateMock).toHaveBeenCalledWith('/herstel', {
        replace: true,
        state: { message: REPAIR_SESSION_EXPIRED_MESSAGE },
      }),
    );

    // Token volledig gewist (in-memory én sessionStorage, via de helpers)
    expect(getRepairToken()).toBeNull();
    expect(hasRepairToken()).toBe(false);

    // Geen retry/refresh-mechanisme: één fetch, de server-fout (NL) propageert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText(`fout: ${SESSION_EXPIRED_SERVER_MESSAGE}`),
    ).toBeInTheDocument();
  });
});
