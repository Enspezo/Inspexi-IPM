import type { InspectorLocation } from '@/types';
import { Button, ErrorBox, Modal, Spinner } from '@/components/ui';
import { EntityMap, type MapCircle, type MapPoint } from '@/components/map/entity-map';
import { useInspectorLocation } from '../hooks/use-time-tracking';

/** Geofence-straal rond de bestemming (PRD-16 §6.2). */
const DESTINATION_RADIUS_M = 200;

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]!.toUpperCase())
    .slice(0, 2)
    .join('');
}

function relativeTime(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes <= 0) return 'zojuist';
  return minutes === 1 ? '1 minuut geleden' : `${minutes} minuten geleden`;
}

/** Pin met de initialen van de inspecteur. */
function inspectorPoint(location: InspectorLocation): MapPoint {
  return {
    id: 'inspector',
    lat: location.latitude,
    lng: location.longitude,
    icon: {
      html: `<div style="width:38px;height:38px;border-radius:9999px;background:var(--color-primary-600,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)">${initials(location.userName)}</div>`,
      size: [38, 38],
    },
    tooltip: location.userName,
  };
}

interface Props {
  userId: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Kaartmodal "waar is de inspecteur nu" (PRD-16 §6.4): één duidelijke pin op
 * de laatste positie (met GPS-nauwkeurigheid als halo) + de bestemming met
 * 200m-geofence-cirkel. Bewust geen route-historie.
 *
 * Rendert via de gedeelde {@link EntityMap} (react-leaflet), zodat tiles,
 * attributie en marker-wiring op één plek leven. Dat houdt de kaart-instantie
 * bovendien stabiel over de 30-seconden-polls: de marker verschuift, maar wat
 * de gebruiker zelf pande of zoomde blijft staan (de auto-fit vuurt alleen als
 * de sámenstelling van de markers wijzigt, niet als ze bewegen).
 */
export function InspectorMapModal({ userId, userName, isOpen, onClose }: Props) {
  const { data: location, isLoading, error, refetch, isFetching } = useInspectorLocation(
    isOpen ? userId : null,
  );

  const points: MapPoint[] = [];
  const circles: MapCircle[] = [];
  if (location) {
    points.push(inspectorPoint(location));
    // GPS-nauwkeurigheid als halo — maakt zichtbaar hoe hard de pin is.
    if (location.accuracyM != null && location.accuracyM > 0) {
      circles.push({
        id: 'accuracy',
        lat: location.latitude,
        lng: location.longitude,
        radiusM: location.accuracyM,
        color: 'var(--color-primary-600, #2563eb)',
        fillOpacity: 0.12,
        weight: 1,
      });
    }
    if (location.destination) {
      points.push({
        id: 'destination',
        lat: location.destination.latitude,
        lng: location.destination.longitude,
        icon: {
          html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">🏁</div>',
          size: [26, 26],
          anchor: [4, 24],
        },
        tooltip: location.destination.label,
      });
      circles.push({
        id: 'geofence',
        lat: location.destination.latitude,
        lng: location.destination.longitude,
        radiusM: DESTINATION_RADIUS_M,
        color: '#16a34a',
      });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Locatie — ${userName}`} className="max-w-3xl">
      <div className="space-y-3">
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <Spinner />
          </div>
        )}
        {!!error && !isLoading && (
          <ErrorBox>
            Geen recente positie beschikbaar — de rit is beëindigd, de tracker staat uit of de
            laatste positie is ouder dan 30 minuten.
          </ErrorBox>
        )}
        {location && (
          <>
            <div className="h-96 w-full overflow-hidden rounded-lg">
              <EntityMap
                points={points}
                circles={circles}
                center={[location.latitude, location.longitude]}
                zoom={14}
                fitToPoints
                fitMaxZoom={15}
              />
            </div>
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Laatste positie: {relativeTime(location.recordedAt)}
                {location.accuracyM != null && ` · ±${location.accuracyM} m`}
                {location.destination && (
                  <span className="block text-gray-500">
                    Bestemming: {location.destination.label}
                  </span>
                )}
              </span>
              <Button variant="secondary" size="sm" onClick={() => refetch()} isLoading={isFetching}>
                Vernieuwen
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
