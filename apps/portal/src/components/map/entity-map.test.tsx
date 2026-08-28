import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Stand-in react-leaflet primitives so we can assert the contract (markers,
// colors, click wiring) without booting real Leaflet.

// Gedeelde spy: de refit-test telt hoe vaak de kaart opnieuw gekadreerd wordt.
const fitBounds = vi.hoisted(() => vi.fn());
// react-leaflet's useMap geeft één stabiele kaart-instantie terug; de mock moet
// dat nadoen, anders zou élke render als "nieuwe kaart" tellen.
const mapInstance = vi.hoisted(() => ({}) as any);

vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  TileLayer: () => <div data-testid="tile-layer" />,
  CircleMarker: ({ children, fillColor, color, radius, eventHandlers }: any) => (
    <div
      data-testid="circle-marker"
      data-fill-color={fillColor}
      data-color={color}
      data-radius={radius}
      onClick={eventHandlers?.click}
      // Expose Leaflet's popupopen/popupclose so tests can drive the lazy
      // popup-mounting contract from the component.
      onMouseEnter={eventHandlers?.popupopen}
      onMouseLeave={eventHandlers?.popupclose}
    >
      {children}
    </div>
  ),
  Marker: ({ children, icon }: any) => (
    <div data-testid="home-marker" data-icon={icon ? 'yes' : 'no'}>
      {children}
    </div>
  ),
  Circle: ({ radius, pathOptions }: any) => (
    <div data-testid="circle" data-radius={radius} data-color={pathOptions?.color} />
  ),
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  useMap: () => Object.assign(mapInstance, { fitBounds }),
}));

// Leaflet itself is only used for the house DivIcon + latLngBounds; stub it.
vi.mock('leaflet', () => ({
  default: {
    divIcon: vi.fn(() => ({})),
    latLngBounds: vi.fn(() => ({ isValid: () => true })),
  },
}));

// Avoid importing the real Leaflet CSS in jsdom.
vi.mock('leaflet/dist/leaflet.css', () => ({}));

import { EntityMap } from './entity-map';
import type { MapPoint } from './entity-map';

describe('EntityMap', () => {
  beforeEach(() => fitBounds.mockClear());

  it('renders one circle marker per point and passes color/radius through', () => {
    const points: MapPoint[] = [
      { id: 'a', lat: 52.1, lng: 5.1, color: '#FF0000', radius: 11 },
      { id: 'b', lat: 52.2, lng: 5.2, color: '#00FF00' },
    ];

    render(<EntityMap points={points} />);

    const markers = screen.getAllByTestId('circle-marker');
    expect(markers).toHaveLength(2);
    expect(markers[0]).toHaveAttribute('data-fill-color', '#FF0000');
    expect(markers[0]).toHaveAttribute('data-color', 'white');
    expect(markers[0]).toHaveAttribute('data-radius', '11');
    // Default radius applied when omitted.
    expect(markers[1]).toHaveAttribute('data-fill-color', '#00FF00');
    expect(markers[1]).toHaveAttribute('data-radius', '11');
  });

  it('invokes onClick when a marker is clicked', () => {
    const onClick = vi.fn();
    const points: MapPoint[] = [{ id: 'a', lat: 52.1, lng: 5.1, onClick }];

    render(<EntityMap points={points} />);

    fireEvent.click(screen.getByTestId('circle-marker'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders tooltip content immediately and the popup container when provided', () => {
    const points: MapPoint[] = [
      {
        id: 'a',
        lat: 52.1,
        lng: 5.1,
        tooltip: <span>Hover content</span>,
        popup: <span>Popup content</span>,
      },
    ];

    render(<EntityMap points={points} />);

    // Tooltips render eagerly.
    expect(screen.getByText('Hover content')).toBeInTheDocument();
    // The popup container exists, but its content is mounted lazily (on open).
    expect(screen.getByTestId('popup')).toBeInTheDocument();
    expect(screen.queryByText('Popup content')).not.toBeInTheDocument();
  });

  it('mounts popup content lazily — only while the popup is open', () => {
    const points: MapPoint[] = [
      { id: 'a', lat: 52.1, lng: 5.1, popup: <span>Popup content</span> },
    ];

    render(<EntityMap points={points} />);

    const marker = screen.getByTestId('circle-marker');
    // Closed by default → no content.
    expect(screen.queryByText('Popup content')).not.toBeInTheDocument();

    // Open → content mounts.
    fireEvent.mouseEnter(marker);
    expect(screen.getByText('Popup content')).toBeInTheDocument();

    // Close → content unmounts.
    fireEvent.mouseLeave(marker);
    expect(screen.queryByText('Popup content')).not.toBeInTheDocument();
  });

  it('renders home markers with their label', () => {
    render(
      <EntityMap
        points={[]}
        homeMarkers={[{ id: 'h1', lat: 52.0, lng: 5.0, label: <span>Thuis</span> }]}
      />,
    );

    expect(screen.getByTestId('home-marker')).toBeInTheDocument();
    expect(screen.getByText('Thuis')).toBeInTheDocument();
  });

  // ── PRD-16 (review B6): custom icons + geofence/accuracy circles ──
  it('renders a point with a custom icon as a marker, not a circle marker', () => {
    const points: MapPoint[] = [
      { id: 'inspector', lat: 52.1, lng: 5.1, icon: { html: '<b>TV</b>', size: [38, 38] } },
      { id: 'plain', lat: 52.2, lng: 5.2 },
    ];

    render(<EntityMap points={points} />);

    // Alleen het punt zónder icoon blijft een circle marker.
    expect(screen.getAllByTestId('circle-marker')).toHaveLength(1);
    const markers = screen.getAllByTestId('home-marker');
    expect(markers).toHaveLength(1);
    expect(markers[0]).toHaveAttribute('data-icon', 'yes');
  });

  it('renders geographic circles with their radius in metres', () => {
    render(
      <EntityMap
        points={[{ id: 'a', lat: 52.1, lng: 5.1 }]}
        circles={[{ id: 'geofence', lat: 52.1, lng: 5.1, radiusM: 200, color: '#16a34a' }]}
      />,
    );

    const circle = screen.getByTestId('circle');
    expect(circle).toHaveAttribute('data-radius', '200');
    expect(circle).toHaveAttribute('data-color', '#16a34a');
  });

  it('re-fits only when the set of point ids changes, not when a point moves', () => {
    const points = (lat: number): MapPoint[] => [{ id: 'inspector', lat, lng: 5.1 }];
    const { rerender } = render(<EntityMap points={points(52.1)} fitToPoints />);
    expect(fitBounds).toHaveBeenCalledTimes(1);

    // Poll levert dezelfde marker op een nieuwe positie → geen refit, zodat de
    // pan/zoom van de gebruiker blijft staan.
    rerender(<EntityMap points={points(52.5)} fitToPoints />);
    expect(fitBounds).toHaveBeenCalledTimes(1);

    // Er komt een bestemming bij → samenstelling wijzigt → wél opnieuw kadreren.
    rerender(
      <EntityMap
        points={[...points(52.5), { id: 'destination', lat: 52.6, lng: 5.2 }]}
        fitToPoints
      />,
    );
    expect(fitBounds).toHaveBeenCalledTimes(2);
  });
});
