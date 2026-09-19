/**
 * Lazy variant van EntityMap: Leaflet (~160 KB) laadt pas zodra een kaart
 * daadwerkelijk gerenderd wordt (kaart-toggle op locaties, planning-kaart,
 * inspecteur-kaart), niet al bij het openen van de lijstpagina.
 *
 * Types (MapPoint, MapHomeMarker, MapCircle) blijven via `import type` uit
 * './entity-map' komen — die worden weggecompileerd en trekken Leaflet niet mee.
 */
import { lazy, Suspense, type ComponentProps } from 'react';
import { Spinner } from '@inspexi/ui';

const EntityMapImpl = lazy(() =>
  import('./entity-map').then((m) => ({ default: m.EntityMap })),
);

function MapFallback() {
  return (
    <div className="flex h-full min-h-[12rem] w-full items-center justify-center bg-gray-50">
      <Spinner />
    </div>
  );
}

export function EntityMap(props: ComponentProps<typeof EntityMapImpl>) {
  return (
    <Suspense fallback={<MapFallback />}>
      <EntityMapImpl {...props} />
    </Suspense>
  );
}
