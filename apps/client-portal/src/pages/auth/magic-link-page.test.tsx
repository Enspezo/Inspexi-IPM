// B-411 (WP-C2): een uitnodigingslink (requiresRegistration: true) op een
// gedeelde browser met een nog-actieve sessie van een ándere gebruiker moet die
// sessie expliciet beëindigen vóór de registratie-CTA — anders stuurde de
// /register-guard de nieuwe collega het dashboard van de vorige gebruiker in.
import { Route, Routes } from 'react-router-dom';
import { render, screen, waitFor } from '@/test/test-utils';
import MagicLinkPage from './magic-link-page';

const { apiPostMock, authState } = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  authState: {
    isAuthenticated: false,
    isLoading: false,
    loginWithToken: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/lib/api-client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-client')>();
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: (endpoint: string, body: unknown) => apiPostMock(endpoint, body),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      upload: vi.fn(),
    },
  };
});

vi.mock('@/providers/client-auth-provider', () => ({
  useClientAuth: () => authState,
}));

function renderMagic(token = 'uitnodiging-1') {
  return render(
    <Routes>
      <Route path="/magic/:token" element={<MagicLinkPage />} />
      <Route path="/dashboard" element={<div>DASHBOARD</div>} />
    </Routes>,
    { initialRoute: `/magic/${token}` },
  );
}

const registrationResponse = {
  requiresRegistration: true,
  email: 'nieuw@klant.nl',
  inspectionPlanId: 'plan-1',
};

describe('MagicLinkPage — uitnodiging met bestaande sessie (B-411)', () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    authState.isAuthenticated = false;
    authState.isLoading = false;
    authState.loginWithToken.mockClear();
    authState.logout.mockClear();
    authState.logout.mockResolvedValue(undefined);
  });

  it('toont de registratie-CTA zonder logout wanneer er geen sessie actief is', async () => {
    apiPostMock.mockResolvedValue(registrationResponse);

    renderMagic();

    expect(await screen.findByText('Account aanmaken')).toBeInTheDocument();
    expect(screen.getByText('nieuw@klant.nl')).toBeInTheDocument();
    expect(authState.logout).not.toHaveBeenCalled();
    expect(screen.queryByText(/die sessie is/)).not.toBeInTheDocument();
  });

  it('beëindigt een actieve (vreemde) sessie en meldt dat, vóór de registratie-CTA', async () => {
    apiPostMock.mockResolvedValue(registrationResponse);
    authState.isAuthenticated = true;

    renderMagic();

    expect(await screen.findByText('Account aanmaken')).toBeInTheDocument();
    expect(authState.logout).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText(/nog een andere gebruiker ingelogd; die sessie is/),
    ).toBeInTheDocument();
  });

  it('wacht op het sessieherstel (isLoading) voordat de link gevalideerd wordt', async () => {
    apiPostMock.mockResolvedValue(registrationResponse);
    authState.isLoading = true;

    renderMagic();

    // Zolang de provider herstelt, is er nog geen validate-POST gedaan — anders
    // zou een laat herstelde sessie de logout-stap kunnen missen.
    expect(screen.getByText(/Link wordt geverifieerd/)).toBeInTheDocument();
    expect(apiPostMock).not.toHaveBeenCalled();
  });

  it('logt direct in en navigeert naar het dashboard bij een bestaand account', async () => {
    apiPostMock.mockResolvedValue({
      requiresRegistration: false,
      accessToken: 'token-123',
      user: { id: 'cu-1', email: 'k@klant.nl', firstName: 'Klaas', lastName: 'Klant' },
    });

    renderMagic();

    await waitFor(() => expect(screen.getByText('DASHBOARD')).toBeInTheDocument());
    expect(authState.loginWithToken).toHaveBeenCalledWith('token-123', expect.objectContaining({ id: 'cu-1' }));
    expect(authState.logout).not.toHaveBeenCalled();
  });
});
