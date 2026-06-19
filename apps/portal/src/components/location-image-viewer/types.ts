// =====================================================
// Location Image Viewer - TypeScript Types
// =====================================================
// Geport uit Inspexi-App (components/location-image-viewer). Het component is
// bewust presentatie-only: het krijgt een platte `Marker[]` (met reeds via
// useLookups geresolveerde kleur/label/status) en roept callbacks aan voor
// add/move/delete. De data- en lookup-laag zit in de paginakant (FloorPlanTab).

export type MarkerType = 'ASSET' | 'MEASUREMENT' | 'FINDING';

// --- Annotation Types ---

export interface CircleAnnotation {
  type: 'circle';
  centerX: number; // % van afbeelding
  centerY: number; // % van afbeelding
  radius: number; // % van afbeelding (relatief aan breedte)
  color: string; // Hex color
  strokeWidth: number; // Pixels
  filled: boolean;
}

export interface ArrowAnnotation {
  type: 'arrow';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  color: string;
  strokeWidth: number;
}

export interface FreehandAnnotation {
  type: 'freehand';
  points: Array<{ x: number; y: number }>; // Array van punten (%)
  color: string;
  strokeWidth: number;
}

export type Annotation = CircleAnnotation | ArrowAnnotation | FreehandAnnotation;

// --- Marker ---

export interface Marker {
  id: string;
  markerType: MarkerType;
  positionX: number; // percentage 0-100
  positionY: number; // percentage 0-100
  label?: string;
  color?: string;
  icon?: string;
  annotation?: Annotation;
  linkedEntity?: {
    id: string;
    name: string;
    type?: string;
    status?: string;
    classificationColor?: string; // lookup-kleur van de gekoppelde status
  };
}

// --- Component Props ---

export interface LocationImageViewerProps {
  imageUrl: string;
  markers: Marker[];

  // Modes
  mode: 'view' | 'edit';

  // Callbacks
  onMarkerClick?: (marker: Marker) => void;
  onMarkerAdd?: (position: { x: number; y: number }) => void;
  onMarkerMove?: (markerId: string, position: { x: number; y: number }) => void;
  onMarkerDelete?: (markerId: string) => void;

  // Selection
  selectedMarkerId?: string;

  // Focus: zoom/pan to center this marker
  focusMarkerId?: string | null;

  // Filter: only show these marker types (undefined = show all)
  visibleMarkerTypes?: MarkerType[];

  // Options
  showLabels?: boolean;
  showLegend?: boolean;

  // Dimensions
  width?: number;
  height?: number;
}

// --- Internal types ---

export interface ImageDimensions {
  naturalWidth: number;
  naturalHeight: number;
  displayWidth: number;
  displayHeight: number;
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface TooltipState {
  visible: boolean;
  marker: Marker | null;
  x: number;
  y: number;
}
