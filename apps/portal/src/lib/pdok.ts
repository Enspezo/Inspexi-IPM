/**
 * PDOK-helpers voor de portal: BAG-viewer deeplink + best-effort luchtfoto-URL.
 * Alle endpoints zijn publiek/keyless. De luchtfoto-WMS is overschrijfbaar via
 * `VITE_PDOK_LUCHTFOTO_WMS_URL`.
 */

const PDOK_LUCHTFOTO_WMS_URL =
  (import.meta.env.VITE_PDOK_LUCHTFOTO_WMS_URL as string | undefined) ||
  'https://service.pdok.nl/hwh/luchtfotorgb/wms/v1_0';

const BAG_VIEWER_BASE =
  'https://bagviewer.kadaster.nl/lvbag/bag-viewer/?searchQuery=';

/** Deeplink naar de BAG-viewer voor een (pand-)BAG-id. */
export function bagViewerUrl(bagId: string): string {
  return `${BAG_VIEWER_BASE}${encodeURIComponent(bagId)}`;
}

/** Converteer WGS84 lat/lng naar EPSG:3857 (Web Mercator) meters. */
function toWebMercator(lat: number, lng: number): { x: number; y: number } {
  const R = 20037508.34;
  const x = (lng * R) / 180;
  const y =
    (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) *
    (R / 180);
  return { x, y };
}

/**
 * Bouw een PDOK-luchtfoto GetMap-URL gecentreerd op lat/lng (EPSG:3857).
 * Retourneert `null` als coördinaten ontbreken/ongeldig zijn. Best-effort —
 * de caller verbergt de afbeelding netjes bij een laadfout.
 */
export function luchtfotoUrl(
  lat: number | null | undefined,
  lng: number | null | undefined,
  opts: { size?: number; radiusMeters?: number } = {},
): string | null {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const size = opts.size ?? 512;
  const radius = opts.radiusMeters ?? 120;
  const { x, y } = toWebMercator(lat, lng);
  const bbox = `${x - radius},${y - radius},${x + radius},${y + radius}`;
  const params = new URLSearchParams({
    service: 'WMS',
    version: '1.3.0',
    request: 'GetMap',
    layers: 'Actueel_ortho25',
    styles: '',
    crs: 'EPSG:3857',
    bbox,
    width: String(size),
    height: String(size),
    format: 'image/jpeg',
  });
  return `${PDOK_LUCHTFOTO_WMS_URL}?${params.toString()}`;
}
