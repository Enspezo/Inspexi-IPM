import { apiClient } from '@/lib/api-client';

/**
 * Framework-agnostic geocoding helpers built on the free Nominatim
 * (OpenStreetMap) service. Shared by the planning map and the CRM locations
 * map. No React imports — safe to use anywhere.
 *
 * Nominatim usage policy requires:
 *  - a descriptive User-Agent
 *  - at most ~1 request per second (see `geocodeSequentially` 350ms delay)
 */

export interface GeocodeAddress {
  street: string;
  houseNumber: string;
  postalCode: string;
  city: string;
}

export type GeoCoords = { lat: number; lng: number };
type GeoResult = GeoCoords | null;

// Module-level cache survives re-renders and remounts during the session.
// Stores `null` for addresses that could not be resolved so we never retry
// a hopeless lookup within the same session.
const geoCache = new Map<string, GeoResult>();

/** Cache key — also the human-readable address form used for the query. */
function getCacheKey(loc: GeocodeAddress): string {
  return `${loc.street} ${loc.houseNumber}, ${loc.postalCode} ${loc.city}`;
}

/**
 * Resolve a Dutch address to lat/lng via Nominatim. Results (including a
 * negative `null`) are cached in-module, so a repeated call for the same
 * address never hits the network again.
 */
export async function geocodeAddress(loc: GeocodeAddress): Promise<GeoResult> {
  const key = getCacheKey(loc);
  if (geoCache.has(key)) return geoCache.get(key)!;

  const q = `${getCacheKey(loc)}, Nederland`;
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

/** Returns true when the address is already resolved (or known-unresolvable). */
export function isGeocodeCached(loc: GeocodeAddress): boolean {
  return geoCache.has(getCacheKey(loc));
}

/** Returns the cached coords for an address, or undefined if not yet looked up. */
export function getCachedCoords(loc: GeocodeAddress): GeoResult | undefined {
  return geoCache.get(getCacheKey(loc));
}

export function sleep(ms: number): Promise<void> {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export interface GeocodeSequentiallyOptions<T> {
  /** Map an item to the address to geocode. */
  getAddress: (item: T) => GeocodeAddress;
  /** Return true to stop the run early (e.g. modal closed). */
  shouldAbort?: () => boolean;
  /** Called after each *network* lookup with the running counts. */
  onProgress?: (done: number, total: number) => void;
  /** Called for every resolved item (cache hit or fresh) with its coords. */
  onResolved?: (item: T, coords: GeoCoords) => void;
}

/**
 * Geocode a list of items one-by-one, respecting Nominatim's ≤1 req/s limit.
 * Only items that are not yet cached trigger a network request (with a 350ms
 * pause between network calls); already-cached items resolve instantly.
 *
 * `onResolved` fires for every item that has coords (cached or fresh) so the
 * caller can build its marker list incrementally. `onProgress` only counts the
 * uncached items that actually hit the network.
 */
export async function geocodeSequentially<T>(
  items: T[],
  { getAddress, shouldAbort, onProgress, onResolved }: GeocodeSequentiallyOptions<T>,
): Promise<void> {
  const uncached = items.filter((item) => !isGeocodeCached(getAddress(item)));
  const total = uncached.length;
  let done = 0;
  onProgress?.(0, total);

  for (const item of items) {
    if (shouldAbort?.()) return;
    const address = getAddress(item);
    const wasCached = isGeocodeCached(address);

    const coords = await geocodeAddress(address);

    if (!wasCached) {
      done++;
      onProgress?.(done, total);
    }

    if (coords) onResolved?.(item, coords);

    // Rate limit: only pause after an actual network call, and never after the last one.
    if (!wasCached && done < total && !shouldAbort?.()) {
      await sleep(350);
    }
  }
}

/**
 * Persist geocoded coordinates back onto a location (fire-and-forget).
 *
 * Uses the real flat route `PATCH /contacts/locations/:locationId`. The old
 * planning modal mistakenly called `/contacts/:contactId/locations/:locationId`
 * (which does not exist), so geocoded coords were never actually persisted.
 */
export function persistLocationCoords(locationId: string, lat: number, lng: number): void {
  apiClient
    .patch(`/contacts/locations/${locationId}`, { lat, lng })
    .catch(() => {
      /* silent — coords are already in the in-memory cache for this session */
    });
}
