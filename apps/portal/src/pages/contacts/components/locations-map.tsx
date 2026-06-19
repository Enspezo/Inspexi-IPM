import { useEffect, useMemo, useRef, useState } from 'react';
import { EntityMap } from '@/components/map/entity-map';
import type { MapPoint } from '@/components/map/entity-map';
import {
  geocodeSequentially,
  getCachedCoords,
  persistLocationCoords,
} from '@/lib/geocode';
import type { GeocodeAddress } from '@/lib/geocode';
import { LocationPopup, type LocationWithContact } from './location-popup';

/**
 * Map view for the CRM locations overview. Locations with stored lat/lng are
 * placed immediately; the rest are geocoded one-by-one via Nominatim (rate
 * limited in `geocodeSequentially`) and the resolved coords are persisted back.
 * Marker color comes from the location's type; the click popup shows details
 * and its linked contact persons (loaded lazily on open).
 */

const NEUTRAL = '#6B7280';

function toAddress(loc: LocationWithContact): GeocodeAddress {
  return {
    street: loc.street,
    houseNumber: loc.houseNumber,
    postalCode: loc.postalCode,
    city: loc.city,
  };
}

interface MarkerData {
  location: LocationWithContact;
  lat: number;
  lng: number;
}

interface LocationsMapProps {
  locations: LocationWithContact[];
}

export function LocationsMap({ locations }: LocationsMapProps) {
  const [markers, setMarkers] = useState<MarkerData[]>([]);
  const [loading, setLoading] = useState(false);
  const [geocodeDone, setGeocodeDone] = useState(0);
  const [geocodeTotal, setGeocodeTotal] = useState(0);
  const abortRef = useRef(false);

  // Stable identity for the location set (ids + coords). filteredData() returns a
  // fresh array reference whenever a filter/sort is active, so depending on the raw
  // `locations` array would blank the map, close any open popup, and re-run the
  // geocode loop on every parent re-render (e.g. a search keystroke).
  const locationsKey = useMemo(
    () => locations.map((l) => `${l.id}:${l.lat ?? ''}:${l.lng ?? ''}`).join('|'),
    [locations],
  );

  useEffect(() => {
    abortRef.current = false;

    async function load() {
      setLoading(true);
      setMarkers([]);
      setGeocodeDone(0);
      setGeocodeTotal(0);

      const withStored = locations.filter((l) => l.lat != null && l.lng != null);
      const withoutStored = locations.filter((l) => l.lat == null || l.lng == null);

      // Geocode the locations without DB coords one-by-one (rate-limited).
      await geocodeSequentially(withoutStored, {
        getAddress: (loc) => toAddress(loc),
        shouldAbort: () => abortRef.current,
        onProgress: (done, total) => {
          setGeocodeTotal(total);
          setGeocodeDone(done);
        },
        onResolved: (loc, coords) => {
          // Persist found coords so next load is a direct hit.
          persistLocationCoords(loc.id, coords.lat, coords.lng);
        },
      });

      if (abortRef.current) return;

      const result: MarkerData[] = [];
      for (const location of withStored) {
        result.push({ location, lat: location.lat!, lng: location.lng! });
      }
      for (const location of withoutStored) {
        const coords = getCachedCoords(toAddress(location));
        if (coords) result.push({ location, lat: coords.lat, lng: coords.lng });
      }
      setMarkers(result);
      setLoading(false);
    }

    load();
    return () => {
      abortRef.current = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on locationsKey (value), not the array ref
  }, [locationsKey]);

  const mapPoints: MapPoint[] = markers.map(({ location, lat, lng }) => ({
    id: location.id,
    lat,
    lng,
    color: location.locationType?.color ?? NEUTRAL,
    tooltip: <span className="text-xs font-medium text-gray-900">{location.name}</span>,
    popup: <LocationPopup location={location} />,
  }));

  // Locations that ended up without coords (not stored, not geocodable).
  const unplaced = locations.length - markers.length;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-gray-200">
      {/* Loading / geocoding overlay */}
      {loading && (
        <div className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-3 bg-white/80">
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2 w-2 animate-bounce rounded-full bg-primary-500"
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

      <EntityMap points={mapPoints} fitToPoints />

      {/* Empty state: no points to show */}
      {!loading && markers.length === 0 && (
        <div className="pointer-events-none absolute inset-0 z-[1000] flex items-center justify-center">
          <div className="rounded-lg bg-white/90 px-4 py-3 text-sm text-gray-500 shadow">
            {locations.length === 0
              ? 'Geen locaties om weer te geven'
              : 'Geen van de locaties kon op de kaart worden geplaatst'}
          </div>
        </div>
      )}

      {/* Notice for locations without a map position */}
      {!loading && markers.length > 0 && unplaced > 0 && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/90 px-3 py-1.5 text-xs text-gray-500 shadow">
          {unplaced} locatie{unplaced !== 1 ? 's' : ''} zonder kaartpositie
        </div>
      )}
    </div>
  );
}
