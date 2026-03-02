import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapContainer, TileLayer, CircleMarker, Tooltip, Marker } from 'react-leaflet';
import { Modal } from '@/components/ui';
import { apiClient } from '@/lib/api-client';
import type { PlanningItem } from '@/types';

// ─── Geocoding ─────────────────────────────────────────────────────────────
// Module-level cache survives re-renders and modal re-opens during the session.
// Items whose coords are stored in the DB are added directly without a cache entry.

type GeoResult = { lat: number; lng: number } | null;
const geoCache = new Map<string, GeoResult>();

function getCacheKey(loc: NonNullable<PlanningItem['location']>): string {
  return `${loc.street} ${loc.houseNumber}, ${loc.postalCode} ${loc.city}`;
}

async function nominatimGeocode(loc: NonNullable<PlanningItem['location']>): Promise<GeoResult> {
  const key = getCacheKey(loc);
  if (geoCache.has(key)) return geoCache.get(key)!;

  const q = `${loc.street} ${loc.houseNumber}, ${loc.postalCode} ${loc.city}, Nederland`;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=nl&limit=1`,
      { headers: { 'User-Agent': 'InspeXi-Beheer/1.0' } },
    );
    const data = await res.json();
    const result: GeoResult = data[0]
      ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
      : null;
    geoCache.set(key, result);
    return result;
  } catch {
    geoCache.set(key, null);
    return null;
  }
}

/** Sla geocodeerde coördinaten terug op in de database (fire-and-forget). */
function saveCoordsToDB(item: PlanningItem, lat: number, lng: number): void {
  apiClient
    .patch(`/contacts/${item.contactId}/locations/${item.locationId}`, { lat, lng })
    .catch(() => {/* stil mislukken — coördinaten zijn al in geheugen gecached */});
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─── House icon factory ─────────────────────────────────────────────────────

function createHouseIcon(color: string): L.DivIcon {
  // SVG house path with white halo for visibility on any map background
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24">
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
      fill="white" stroke="white" stroke-width="3" stroke-linejoin="round"/>
    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"
      fill="${color}"/>
  </svg>`;
  return L.divIcon({
    html: `<div style="display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.35))">${svg}</div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 26],
    tooltipAnchor: [13, -4],
  });
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function getPrimaryColor(item: PlanningItem): string {
  const primary = item.inspectors?.find((i) => i.isPrimary);
  const first = item.inspectors?.[0];
  return primary?.user?.color ?? first?.user?.color ?? '#6B7280';
}

function getContactName(item: PlanningItem): string {
  if (!item.contact) return '';
  if (item.contact.companyName) return item.contact.companyName;
  return `${item.contact.firstName ?? ''} ${item.contact.lastName ?? ''}`.trim();
}

function formatDate(d: string | null): string {
  if (!d) return 'Niet gepland';
  return new Date(d).toLocaleDateString('nl-NL', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// ─── Types ─────────────────────────────────────────────────────────────────

interface MarkerData {
  item: PlanningItem;
  lat: number;
  lng: number;
}

interface HomeMarkerData {
  userId: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  items: PlanningItem[];
}

// ─── Component ─────────────────────────────────────────────────────────────

export function PlanningMapModal({ isOpen, onClose, items }: Props) {
  const navigate = useNavigate();
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [geocodeDone, setGeocodeDone] = useState(0);
  const [geocodeTotal, setGeocodeTotal] = useState(0);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    abortRef.current = false;
    const withLocation = items.filter((i) => i.location);

    async function load() {
      setLoading(true);
      setMarkers([]);

      // Items met opgeslagen coördinaten gaan direct op de kaart
      const withStored = withLocation.filter((i) => i.location!.lat != null);
      const withoutStored = withLocation.filter((i) => i.location!.lat == null);

      // Van de items zonder opgeslagen coords: welke zijn nog niet in de sessiecache?
      const uncached = withoutStored.filter((i) => !geoCache.has(getCacheKey(i.location!)));
      setGeocodeTotal(uncached.length);
      setGeocodeDone(0);

      let count = 0;
      for (const item of withoutStored) {
        if (abortRef.current) break;
        const key = getCacheKey(item.location!);
        if (!geoCache.has(key)) {
          const coords = await nominatimGeocode(item.location!);
          count++;
          setGeocodeDone(count);
          // Sla gevonden coords direct terug op in de DB zodat het volgende keer raak is
          if (coords) saveCoordsToDB(item, coords.lat, coords.lng);
          // Nominatim rate limit: ≤1 req/s
          if (count < uncached.length && !abortRef.current) await sleep(350);
        }
      }

      if (!abortRef.current) {
        const result: MarkerData[] = [];
        // Items met DB-coords
        for (const item of withStored) {
          result.push({ item, lat: item.location!.lat!, lng: item.location!.lng! });
        }
        // Items die via Nominatim gecoded zijn
        for (const item of withoutStored) {
          const coords = geoCache.get(getCacheKey(item.location!));
          if (coords) result.push({ item, lat: coords.lat, lng: coords.lng });
        }
        setMarkers(result);
      }

      setLoading(false);
    }

    load();
    return () => {
      abortRef.current = true;
    };
  }, [isOpen, items]);

  // Unique inspectors across all shown items (for the legend)
  const legendInspectors = (() => {
    const map = new Map<string, { name: string; color: string; hasHome: boolean }>();
    for (const { item } of markers) {
      for (const insp of item.inspectors ?? []) {
        if (insp.userId && insp.user && !map.has(insp.userId)) {
          const name = `${insp.user.firstName ?? ''} ${insp.user.lastName ?? ''}`.trim();
          map.set(insp.userId, {
            name,
            color: insp.user.color ?? '#6B7280',
            hasHome: insp.user.homeLat != null && insp.user.homeLng != null,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  // Unique inspectors with home addresses — derived from ALL items (no geocoding needed)
  const homeMarkers = (() => {
    const seen = new Set<string>();
    const result: HomeMarkerData[] = [];

    for (const item of items) {
      // Regular inspectors
      for (const insp of item.inspectors ?? []) {
        if (
          insp.userId &&
          insp.user &&
          !seen.has(insp.userId) &&
          insp.user.homeLat != null &&
          insp.user.homeLng != null
        ) {
          seen.add(insp.userId);
          const name =
            `${insp.user.firstName ?? ''} ${insp.user.lastName ?? ''}`.trim() ||
            (insp.user.email ?? '?');
          result.push({
            userId: insp.userId,
            name,
            color: insp.user.color ?? '#6B7280',
            lat: insp.user.homeLat,
            lng: insp.user.homeLng,
          });
        }
      }
      // Session inspectors (multi-day planning)
      for (const session of item.sessions ?? []) {
        for (const si of session.sessionInspectors ?? []) {
          if (
            si.userId &&
            si.user &&
            !seen.has(si.userId) &&
            si.user.homeLat != null &&
            si.user.homeLng != null
          ) {
            seen.add(si.userId);
            const name =
              `${si.user.firstName ?? ''} ${si.user.lastName ?? ''}`.trim() ||
              (si.user.email ?? '?');
            result.push({
              userId: si.userId,
              name,
              color: si.user.color ?? '#6B7280',
              lat: si.user.homeLat,
              lng: si.user.homeLng,
            });
          }
        }
      }
    }
    return result;
  })();

  const itemsWithLocation = items.filter((i) => i.location).length;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Kaart${markers.length > 0 ? ` · ${markers.length} locatie${markers.length !== 1 ? 's' : ''}` : ''}`}
      className="!max-w-[80vw] w-full"
    >
      <div className="flex gap-4" style={{ height: '70vh' }}>
        {/* Map */}
        <div className="relative flex-1 rounded-lg overflow-hidden border border-gray-200">
          {/* Loading overlay */}
          {loading && (
            <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-white/80 gap-3">
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="w-2 h-2 rounded-full bg-blue-500 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              {geocodeTotal > 0 ? (
                <div className="text-sm text-gray-600">
                  Adressen ophalen{' '}
                  <span className="font-medium">
                    {geocodeDone}/{geocodeTotal}
                  </span>
                </div>
              ) : (
                <div className="text-sm text-gray-600">Laden…</div>
              )}
            </div>
          )}

          <MapContainer
            center={[52.2, 5.3]}
            zoom={7}
            style={{ height: '100%', width: '100%' }}
            zoomControl={true}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />

            {/* Planning location markers */}
            {markers.map(({ item, lat, lng }) => (
              <CircleMarker
                key={item.id}
                center={[lat, lng]}
                radius={11}
                fillColor={getPrimaryColor(item)}
                color="white"
                weight={2}
                opacity={1}
                fillOpacity={0.88}
                eventHandlers={{
                  click: () => {
                    onClose();
                    navigate(`/planning/${item.id}`);
                  },
                }}
              >
                <Tooltip sticky offset={[12, 0]}>
                  <div style={{ minWidth: 180, maxWidth: 240, fontFamily: 'inherit' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.9em', marginBottom: 4, color: '#111' }}>
                      {item.productName}
                    </div>
                    {item.contact && (
                      <div style={{ fontSize: '0.82em', color: '#444', marginBottom: 2 }}>
                        {getContactName(item)}
                      </div>
                    )}
                    <div style={{ fontSize: '0.82em', color: '#666', marginBottom: 4 }}>
                      📍 {item.location!.name
                        ? `${item.location!.name} · ${item.location!.city}`
                        : `${item.location!.street} ${item.location!.houseNumber}, ${item.location!.city}`}
                    </div>
                    <div style={{ fontSize: '0.82em', color: '#555', marginBottom: item.inspectors?.length ? 6 : 0 }}>
                      🗓 {formatDate(item.scheduledDate)}
                    </div>
                    {item.inspectors && item.inspectors.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {item.inspectors.map((insp) => (
                          <span
                            key={insp.id}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: '0.78em',
                              background: '#f3f4f6',
                              borderRadius: 4,
                              padding: '2px 6px',
                              color: '#374151',
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: insp.user?.color ?? '#9CA3AF',
                                display: 'inline-block',
                                flexShrink: 0,
                              }}
                            />
                            {insp.user?.firstName} {insp.user?.lastName}
                            {insp.isPrimary && (
                              <span style={{ color: '#9CA3AF', fontSize: '0.9em' }}>★</span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid #e5e7eb', fontSize: '0.75em', color: '#9CA3AF' }}>
                      Klik om te openen →
                    </div>
                  </div>
                </Tooltip>
              </CircleMarker>
            ))}

            {/* Home address markers — one house icon per inspector with a stored home address */}
            {homeMarkers.map((home) => (
              <Marker
                key={`home-${home.userId}`}
                position={[home.lat, home.lng]}
                icon={createHouseIcon(home.color)}
                zIndexOffset={-100}
              >
                <Tooltip direction="top" offset={[0, -20]}>
                  <div style={{ fontFamily: 'inherit', fontSize: '0.85em', fontWeight: 600, color: '#111', whiteSpace: 'nowrap' }}>
                    🏠 {home.name}
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>

          {/* No locations message */}
          {!loading && itemsWithLocation === 0 && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 rounded-lg px-4 py-3 text-sm text-gray-500 shadow">
                Geen locaties gekoppeld aan de huidige planregels.
              </div>
            </div>
          )}
          {!loading && itemsWithLocation > 0 && markers.length === 0 && (
            <div className="absolute inset-0 z-[1000] flex items-center justify-center pointer-events-none">
              <div className="bg-white/90 rounded-lg px-4 py-3 text-sm text-gray-500 shadow">
                Adressen konden niet worden opgezocht.
              </div>
            </div>
          )}
        </div>

        {/* Legend sidebar */}
        <div className="w-44 flex-shrink-0 flex flex-col gap-3 overflow-y-auto">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Inspecteurs
            </p>
            {legendInspectors.length === 0 && !loading && (
              <p className="text-xs text-gray-400">—</p>
            )}
            <div className="flex flex-col gap-2">
              {legendInspectors.map((insp) => (
                <div key={insp.name} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 border-2 border-white shadow-sm"
                    style={{ background: insp.color }}
                  />
                  <span className="text-xs text-gray-700 truncate flex-1">{insp.name}</span>
                  {insp.hasHome && (
                    <span
                      title="Thuisadres zichtbaar op kaart"
                      className="flex-shrink-0 text-gray-400"
                      style={{ fontSize: '0.75rem' }}
                    >
                      🏠
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {homeMarkers.length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Thuisadressen
              </p>
              <p className="text-xs text-gray-400">
                {homeMarkers.length} inspecteur{homeMarkers.length !== 1 ? 's' : ''}
              </p>
            </div>
          )}

          {markers.length > 0 && (
            <div className="mt-auto pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {markers.length} van {itemsWithLocation} locatie{itemsWithLocation !== 1 ? 's' : ''} weergegeven
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
