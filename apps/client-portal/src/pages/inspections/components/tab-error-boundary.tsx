import type { ReactNode } from 'react';
import { Button, ErrorBoundary, ErrorBox } from '@/components/ui';

/**
 * Per-tab error-boundary voor de inspectiedetailpagina (B-401): een renderfout in
 * één tab (bv. een kapotte constateringen-kaart) mag nooit meer de hele pagina
 * overnemen. Compacte inline fallback i.p.v. de full-screen default van @inspexi/ui;
 * de kop, tab-balk en overige tabs blijven gewoon bruikbaar.
 *
 * De boundary staat per conditioneel gerenderde tab, dus bij het wisselen van tab
 * unmount hij mee en start de volgende bezoek­poging altijd met een schone lei.
 */
export function TabErrorBoundary({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={(_error, reset) => (
        <div className="space-y-3">
          <ErrorBox>
            Dit onderdeel kon niet worden geladen. Probeer het opnieuw; blijft het
            probleem optreden, neem dan contact op met uw inspectiebedrijf.
          </ErrorBox>
          <Button variant="secondary" onClick={reset}>
            Opnieuw proberen
          </Button>
        </div>
      )}
    >
      {children}
    </ErrorBoundary>
  );
}
