import { render, screen, fireEvent } from '@/test/test-utils';
import { TabErrorBoundary } from './tab-error-boundary';

// B-401: één kapotte tab mag nooit meer de hele inspectiedetailpagina overnemen.
// De boundary toont een compacte inline fallback; de rest van de pagina blijft staan.

let shouldThrow = true;

function FlakyTab() {
  if (shouldThrow) throw new Error('kapotte kaart');
  return <p>Inhoud geladen</p>;
}

describe('TabErrorBoundary', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    shouldThrow = true;
    // React logt gevangen render-fouten naar console.error — stil houden in de test.
    consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('vangt een renderfout en laat de rest van de pagina intact', () => {
    render(
      <div>
        <h1>NEN 3140 — Kantoorpand Zuidas</h1>
        <TabErrorBoundary>
          <FlakyTab />
        </TabErrorBoundary>
      </div>,
    );

    // Compacte fallback i.p.v. de full-screen default van @inspexi/ui
    expect(screen.getByText(/Dit onderdeel kon niet worden geladen/)).toBeInTheDocument();
    expect(
      screen.queryByText('Er is een onverwachte fout opgetreden'),
    ).not.toBeInTheDocument();
    // De paginakop (en dus de tab-navigatie) blijft gewoon staan
    expect(screen.getByText('NEN 3140 — Kantoorpand Zuidas')).toBeInTheDocument();
  });

  it('herstelt via "Opnieuw proberen" wanneer de fout eenmalig was', () => {
    render(
      <TabErrorBoundary>
        <FlakyTab />
      </TabErrorBoundary>,
    );

    expect(screen.getByText(/Dit onderdeel kon niet worden geladen/)).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Opnieuw proberen' }));

    expect(screen.getByText('Inhoud geladen')).toBeInTheDocument();
    expect(screen.queryByText(/Dit onderdeel kon niet worden geladen/)).not.toBeInTheDocument();
  });
});
