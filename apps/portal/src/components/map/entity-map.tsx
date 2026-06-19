import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Marker,
  Tooltip,
  Popup,
  useMap,
} from 'react-leaflet';

/**
 * Generic, reusable Leaflet map. Consumers pass plain data points; this
 * component owns all Leaflet/react-leaflet wiring (tiles, markers, fit-bounds,
 * the CSS import). Currently used by the planning map; designed so a CRM
 * locations map can reuse it without touching Leaflet directly.
 */

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  /** Fill color of the circle marker. Defaults to a neutral gray. */
  color?: string;
  /** Circle radius in px. Defaults to 11. */
  radius?: number;
  /** Hover tooltip content (sticky, offset to the side). */
  tooltip?: ReactNode;
  /** Click popup content. */
  popup?: ReactNode;
  /** Invoked when the marker is clicked. */
  onClick?: () => void;
}

export interface MapHomeMarker {
  id: string;
  lat: number;
  lng: number;
  /** House-icon color. Defaults to a neutral gray. */
  color?: string;
  /** Hover tooltip content (rendered above the icon). */
  label?: ReactNode;
}

export interface EntityMapProps {
  points: MapPoint[];
  homeMarkers?: MapHomeMarker[];
  /** Initial map center. Defaults to the centre of the Netherlands. */
  center?: [number, number];
  /** Initial zoom. Defaults to 7. */
  zoom?: number;
  /**
   * Auto-fit the viewport to all `points`. Defaults to `false`, so a consumer
   * keeps its static `center`/`zoom` unless it opts in. Empty/single-point
   * cases are guarded and never throw.
   */
  fitToPoints?: boolean;
  /** Map height (CSS value). Defaults to 100%. */
  height?: string;
  className?: string;
}

const DEFAULT_CENTER: [number, number] = [52.2, 5.3];
const DEFAULT_ZOOM = 7;
const NEUTRAL = '#6B7280';

const OSM_TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSM_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

/**
 * DivIcon factory for a colored house marker with a white halo so it stays
 * visible on any tile background.
 */
function createHouseIcon(color: string): L.DivIcon {
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

/**
 * Inner child that fits the map viewport to all points. Rendered only when
 * `fitToPoints` is enabled and at least one point exists, so bounds are never
 * empty.
 */
function FitBounds({ points }: { points: MapPoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    if (!bounds.isValid()) return;
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [map, points]);
  return null;
}

export function EntityMap({
  points,
  homeMarkers = [],
  center = DEFAULT_CENTER,
  zoom = DEFAULT_ZOOM,
  fitToPoints = false,
  height = '100%',
  className,
}: EntityMapProps) {
  const shouldFit = fitToPoints && points.length > 0;

  // Track which marker's popup is currently open so popup content is mounted
  // lazily (only while open). This keeps consumers whose popups run their own
  // queries — e.g. the CRM locations map — from firing one request per marker
  // on mount. Markers without a popup are unaffected.
  const [openPopupId, setOpenPopupId] = useState<string | null>(null);

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      style={{ height, width: '100%' }}
      zoomControl
      className={className}
    >
      <TileLayer url={OSM_TILE_URL} attribution={OSM_ATTRIBUTION} />

      {shouldFit && <FitBounds points={points} />}

      {/* Point markers */}
      {points.map((point) => {
        const hasPopup = point.popup != null;
        // Compose the optional click handler with popup open/close tracking.
        const eventHandlers =
          point.onClick || hasPopup
            ? {
                ...(point.onClick ? { click: point.onClick } : {}),
                ...(hasPopup
                  ? {
                      popupopen: () => setOpenPopupId(point.id),
                      popupclose: () =>
                        setOpenPopupId((cur) => (cur === point.id ? null : cur)),
                    }
                  : {}),
              }
            : undefined;

        return (
          <CircleMarker
            key={point.id}
            center={[point.lat, point.lng]}
            radius={point.radius ?? 11}
            fillColor={point.color ?? NEUTRAL}
            color="white"
            weight={2}
            opacity={1}
            fillOpacity={0.88}
            eventHandlers={eventHandlers}
          >
            {hasPopup && <Popup>{openPopupId === point.id ? point.popup : null}</Popup>}
            {point.tooltip != null && (
              <Tooltip sticky offset={[12, 0]}>
                {point.tooltip}
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}

      {/* Home / house markers */}
      {homeMarkers.map((home) => (
        <Marker
          key={home.id}
          position={[home.lat, home.lng]}
          icon={createHouseIcon(home.color ?? NEUTRAL)}
          zIndexOffset={-100}
        >
          {home.label != null && (
            <Tooltip direction="top" offset={[0, -20]}>
              {home.label}
            </Tooltip>
          )}
        </Marker>
      ))}
    </MapContainer>
  );
}
