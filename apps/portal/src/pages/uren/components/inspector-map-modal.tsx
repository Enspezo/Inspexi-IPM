import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { InspectorLocation } from '@/types';
import { Button, ErrorBox, Modal, Spinner } from '@/components/ui';
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

interface Props {
  userId: string;
  userName: string;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Kaartmodal "waar is de inspecteur nu" (PRD-16 §6.4): één duidelijke pin op
 * de laatste positie + de bestemming met 200m-geofence-cirkel. Bewust geen
 * route-historie. Leaflet + OpenStreetMap-tiles; markers als divIcon (geen
 * asset-gedoe met de standaard png-iconen onder Vite).
 */
export function InspectorMapModal({ userId, userName, isOpen, onClose }: Props) {
  const { data: location, isLoading, error, refetch, isFetching } = useInspectorLocation(
    isOpen ? userId : null,
  );
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!isOpen || !location || !containerRef.current) return;

    const map = L.map(containerRef.current);
    mapRef.current = map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const pin = L.divIcon({
      className: '',
      html: `<div style="width:38px;height:38px;border-radius:9999px;background:var(--color-primary-600,#2563eb);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:14px;border:3px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.4)">${initials(location.userName)}</div>`,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });
    const inspectorMarker = L.marker([location.latitude, location.longitude], {
      icon: pin,
    }).addTo(map);
    inspectorMarker.bindTooltip(location.userName);

    const bounds = L.latLngBounds([[location.latitude, location.longitude]]);
    if (location.destination) {
      const flag = L.divIcon({
        className: '',
        html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">🏁</div>',
        iconSize: [26, 26],
        iconAnchor: [4, 24],
      });
      L.marker([location.destination.latitude, location.destination.longitude], { icon: flag })
        .addTo(map)
        .bindTooltip(location.destination.label);
      L.circle([location.destination.latitude, location.destination.longitude], {
        radius: DESTINATION_RADIUS_M,
        color: '#16a34a',
        weight: 1.5,
        fillOpacity: 0.1,
      }).addTo(map);
      bounds.extend([location.destination.latitude, location.destination.longitude]);
    }
    map.fitBounds(bounds.pad(0.3), { maxZoom: 15 });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [isOpen, location]);

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
            Geen recente positie beschikbaar (ouder dan 30 minuten of de tracker staat uit).
          </ErrorBox>
        )}
        {location && (
          <>
            <div ref={containerRef} className="h-96 w-full overflow-hidden rounded-lg" />
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
