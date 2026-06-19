import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── Mocks ───────────────────────────────────────────────────────────────────
// Stand-in react-leaflet primitives so we can assert the contract (markers,
// colors, click wiring) without booting real Leaflet.

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
  Marker: ({ children }: any) => <div data-testid="home-marker">{children}</div>,
  Tooltip: ({ children }: any) => <div data-testid="tooltip">{children}</div>,
  Popup: ({ children }: any) => <div data-testid="popup">{children}</div>,
  useMap: () => ({ fitBounds: vi.fn() }),
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
});
