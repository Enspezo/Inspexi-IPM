// B-411 (WP-C2): de "al ingelogd? → dashboard"-guard op /register hield geen
// rekening met "ingelogd als iemand anders" tijdens een uitnodigingsflow. Deze
// tests leggen het nieuwe gedrag vast: mét uitnodigingstoken toont de pagina
// het registratieformulier, óók als er nog een (vreemde) sessie actief is;
// zonder token blijft de redirect naar het dashboard bestaan.
import { Route, Routes } from 'react-router-dom';
import { render, screen } from '@/test/test-utils';
import RegisterPage from './register-page';

const { authState } = vi.hoisted(() => ({
  authState: {
    isAuthenticated: false,
    register: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('@/providers/client-auth-provider', () => ({
  useClientAuth: () => authState,
}));

function renderRegister(initialRoute: string) {
  return render(
    <Routes>
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/dashboard" element={<div>DASHBOARD-VAN-DE-VORIGE-GEBRUIKER</div>} />
    </Routes>,
    { initialRoute },
  );
}

describe('RegisterPage — uitnodigingsflow vs. bestaande sessie (B-411)', () => {
  beforeEach(() => {
    authState.isAuthenticated = false;
    authState.register.mockClear();
  });

  it('toont het registratieformulier voor een uitgenodigde bezoeker (geen sessie)', () => {
    renderRegister('/register?token=uitnodiging-1&email=nieuw%40klant.nl');

    expect(screen.getByText('Maak uw account aan')).toBeInTheDocument();
    expect(screen.getByLabelText('E-mailadres')).toHaveValue('nieuw@klant.nl');
  });

  it('redirect NIET naar het dashboard wanneer er nog een andere sessie actief is maar er een uitnodigingstoken is', () => {
    authState.isAuthenticated = true;

    renderRegister('/register?token=uitnodiging-1&email=nieuw%40klant.nl');

    // Vóór de fix belandde de uitgenodigde hier in het dashboard van de vórige
    // gebruiker; nu blijft het registratieformulier staan.
    expect(screen.queryByText('DASHBOARD-VAN-DE-VORIGE-GEBRUIKER')).not.toBeInTheDocument();
    expect(screen.getByText('Maak uw account aan')).toBeInTheDocument();
  });

  it('redirect wél naar het dashboard bij een actieve sessie ZONDER uitnodigingstoken', () => {
    authState.isAuthenticated = true;

    renderRegister('/register');

    expect(screen.getByText('DASHBOARD-VAN-DE-VORIGE-GEBRUIKER')).toBeInTheDocument();
  });

  it('legt zonder token (en zonder sessie) uit dat registreren alleen via een uitnodiging kan', () => {
    renderRegister('/register');

    expect(
      screen.getByText(/Registreren kan alleen via een uitnodigingslink/),
    ).toBeInTheDocument();
  });
});
