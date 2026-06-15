import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import type Konva from 'konva';
import type { LocationImageViewerProps, Marker, ImageDimensions, TooltipState } from './types';
import { calculateImageFit, percentageToPixels, pixelsToPercentage, clamp } from './utils';
import { MarkerPin } from './MarkerPin';
import { AnnotationLayer } from './AnnotationLayer';
import { MarkerTooltip } from './MarkerTooltip';
import { MarkerPopup } from './MarkerPopup';
import { Legend } from './Legend';

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 1.1;

export const LocationImageViewer: React.FC<LocationImageViewerProps> = ({
  imageUrl,
  markers,
  mode,
  onMarkerClick,
  onMarkerAdd,
  onMarkerMove,
  onMarkerDelete,
  selectedMarkerId,
  focusMarkerId,
  visibleMarkerTypes,
  showLabels = true,
  showLegend = true,
  width: propWidth,
  height: propHeight,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  // Container size
  const [containerSize, setContainerSize] = useState({
    width: propWidth || 800,
    height: propHeight || 600,
  });

  // Image state
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageStatus, setImageStatus] = useState<'loading' | 'loaded' | 'error'>('loading');

  // Zoom/pan state
  const [stageScale, setStageScale] = useState(1);
  const [stagePos, setStagePos] = useState({ x: 0, y: 0 });

  // Tooltip
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    marker: null,
    x: 0,
    y: 0,
  });

  // Popup (view mode click)
  const [popup, setPopup] = useState<{ marker: Marker | null; x: number; y: number }>({
    marker: null,
    x: 0,
    y: 0,
  });

  // =========================================
  // Responsive container sizing
  // =========================================
  useEffect(() => {
    if (propWidth && propHeight) {
      setContainerSize({ width: propWidth, height: propHeight });
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({
            width: propWidth || width,
            height: propHeight || Math.max(400, height),
          });
        }
      }
    });

    observer.observe(container);
    // Initial size
    const rect = container.getBoundingClientRect();
    if (rect.width > 0) {
      setContainerSize({
        width: propWidth || rect.width,
        height: propHeight || Math.max(400, rect.height),
      });
    }

    return () => observer.disconnect();
  }, [propWidth, propHeight]);

  // =========================================
  // Load image
  // =========================================
  useEffect(() => {
    setImageStatus('loading');
    const img = new window.Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImage(img);
      setImageStatus('loaded');
      // Reset zoom/pan on new image
      setStageScale(1);
      setStagePos({ x: 0, y: 0 });
    };
    img.onerror = () => {
      setImageStatus('error');
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // =========================================
  // Image dimensions calculation
  // =========================================
  const imageDims: ImageDimensions | null = useMemo(() => {
    if (!image) return null;
    return calculateImageFit(containerSize.width, containerSize.height, image.naturalWidth, image.naturalHeight);
  }, [image, containerSize]);

  // =========================================
  // Focus marker: zoom/pan to center
  // =========================================
  useEffect(() => {
    if (!focusMarkerId || !imageDims) return;

    const marker = markers.find((m) => m.id === focusMarkerId);
    if (!marker) return;

    const markerPixelX = percentageToPixels(marker.positionX, imageDims.displayWidth, imageDims.offsetX);
    const markerPixelY = percentageToPixels(marker.positionY, imageDims.displayHeight, imageDims.offsetY);

    const targetScale = 2.0;
    const centerX = containerSize.width / 2;
    const centerY = containerSize.height / 2;

    setStageScale(targetScale);
    setStagePos({
      x: centerX - markerPixelX * targetScale,
      y: centerY - markerPixelY * targetScale,
    });
  }, [focusMarkerId, imageDims, markers, containerSize]);

  // =========================================
  // Filter markers by type
  // =========================================
  const filteredMarkers = useMemo(() => {
    if (!visibleMarkerTypes) return markers;
    return markers.filter((m) => visibleMarkerTypes.includes(m.markerType));
  }, [markers, visibleMarkerTypes]);

  // =========================================
  // Annotations from markers
  // =========================================
  const annotations = useMemo(() => {
    return filteredMarkers
      .filter((m) => m.annotation)
      .map((m) => ({ markerId: m.id, annotation: m.annotation! }));
  }, [filteredMarkers]);

  // =========================================
  // Zoom: scroll wheel
  // =========================================
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();

      const stage = stageRef.current;
      if (!stage) return;

      const oldScale = stageScale;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const newScale = clamp(
        direction > 0 ? oldScale * ZOOM_STEP : oldScale / ZOOM_STEP,
        MIN_ZOOM,
        MAX_ZOOM,
      );

      // Zoom towards pointer position
      const mousePointTo = {
        x: (pointer.x - stagePos.x) / oldScale,
        y: (pointer.y - stagePos.y) / oldScale,
      };

      setStageScale(newScale);
      setStagePos({
        x: pointer.x - mousePointTo.x * newScale,
        y: pointer.y - mousePointTo.y * newScale,
      });
    },
    [stageScale, stagePos],
  );

  // =========================================
  // Zoom controls
  // =========================================
  const zoomAroundCenter = useCallback(
    (factor: number) => {
      const newScale = clamp(stageScale * factor, MIN_ZOOM, MAX_ZOOM);
      const center = { x: containerSize.width / 2, y: containerSize.height / 2 };
      const mousePointTo = {
        x: (center.x - stagePos.x) / stageScale,
        y: (center.y - stagePos.y) / stageScale,
      };
      setStageScale(newScale);
      setStagePos({
        x: center.x - mousePointTo.x * newScale,
        y: center.y - mousePointTo.y * newScale,
      });
    },
    [stageScale, stagePos, containerSize],
  );

  const handleZoomIn = useCallback(() => zoomAroundCenter(ZOOM_STEP), [zoomAroundCenter]);
  const handleZoomOut = useCallback(() => zoomAroundCenter(1 / ZOOM_STEP), [zoomAroundCenter]);
  const handleZoomReset = useCallback(() => {
    setStageScale(1);
    setStagePos({ x: 0, y: 0 });
  }, []);

  // =========================================
  // Stage click - add marker in edit mode
  // =========================================
  const handleStageClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      if (mode !== 'edit' || !onMarkerAdd || !imageDims) return;

      // Only fire on empty space (not on markers)
      if (e.target !== e.target.getStage() && e.target.name() !== 'background-image') {
        return;
      }

      const stage = stageRef.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      // Convert screen position to canvas position (accounting for zoom/pan)
      const canvasX = (pointer.x - stagePos.x) / stageScale;
      const canvasY = (pointer.y - stagePos.y) / stageScale;

      // Convert to percentage
      const percentX = pixelsToPercentage(canvasX, imageDims.displayWidth, imageDims.offsetX);
      const percentY = pixelsToPercentage(canvasY, imageDims.displayHeight, imageDims.offsetY);

      // Only add if within image bounds
      if (percentX >= 0 && percentX <= 100 && percentY >= 0 && percentY <= 100) {
        onMarkerAdd({ x: percentX, y: percentY });
      }
    },
    [mode, onMarkerAdd, imageDims, stageScale, stagePos],
  );

  // =========================================
  // Stage double-click - reset zoom
  // =========================================
  const handleStageDblClick = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Only reset on empty space double-click
      if (e.target === e.target.getStage() || e.target.name() === 'background-image') {
        handleZoomReset();
      }
    },
    [handleZoomReset],
  );

  // =========================================
  // Marker drag end
  // =========================================
  const handleMarkerDragEnd = useCallback(
    (markerId: string, pixelX: number, pixelY: number) => {
      if (!onMarkerMove || !imageDims) return;

      const percentX = pixelsToPercentage(pixelX, imageDims.displayWidth, imageDims.offsetX);
      const percentY = pixelsToPercentage(pixelY, imageDims.displayHeight, imageDims.offsetY);

      onMarkerMove(markerId, {
        x: clamp(percentX, 0, 100),
        y: clamp(percentY, 0, 100),
      });
    },
    [onMarkerMove, imageDims],
  );

  // =========================================
  // Marker tooltip handlers
  // =========================================
  const handleMarkerMouseEnter = useCallback((marker: Marker, x: number, y: number) => {
    setTooltip({ visible: true, marker, x, y });
  }, []);

  const handleMarkerMouseLeave = useCallback(() => {
    setTooltip({ visible: false, marker: null, x: 0, y: 0 });
  }, []);

  // =========================================
  // Marker click: popup in view mode, select in edit mode
  // =========================================
  const handleMarkerPinClick = useCallback(
    (marker: Marker) => {
      if (mode === 'edit') {
        // Edit mode: delegate to parent (selection)
        onMarkerClick?.(marker);
        return;
      }

      // View mode: show popup at marker position
      if (!imageDims) return;
      const px = percentageToPixels(marker.positionX, imageDims.displayWidth, imageDims.offsetX);
      const py = percentageToPixels(marker.positionY, imageDims.displayHeight, imageDims.offsetY);

      // Convert to screen coords accounting for zoom/pan
      const screenX = px * stageScale + stagePos.x;
      const screenY = py * stageScale + stagePos.y;

      setPopup({ marker, x: screenX, y: screenY });
      setTooltip({ visible: false, marker: null, x: 0, y: 0 });
    },
    [mode, onMarkerClick, imageDims, stageScale, stagePos],
  );

  const handlePopupClose = useCallback(() => {
    setPopup({ marker: null, x: 0, y: 0 });
  }, []);

  // =========================================
  // Keyboard shortcuts
  // =========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is on an input element
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      switch (e.key) {
        case 'Escape':
          e.preventDefault();
          setPopup({ marker: null, x: 0, y: 0 });
          break;
        case 'Delete':
        case 'Backspace':
          if (mode === 'edit' && selectedMarkerId && onMarkerDelete) {
            e.preventDefault();
            onMarkerDelete(selectedMarkerId);
          }
          break;
        case '+':
        case '=':
          e.preventDefault();
          handleZoomIn();
          break;
        case '-':
          e.preventDefault();
          handleZoomOut();
          break;
        case '0':
          e.preventDefault();
          handleZoomReset();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, onMarkerDelete, selectedMarkerId, handleZoomIn, handleZoomOut, handleZoomReset]);

  // =========================================
  // Render
  // =========================================

  const zoomPercent = Math.round(stageScale * 100);

  return (
    <div
      className="flex flex-col overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
      role="img"
      aria-label={`Plattegrond met ${filteredMarkers.length} marker${filteredMarkers.length !== 1 ? 's' : ''}`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-3 py-1.5">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          {mode === 'edit' && (
            <span className="rounded bg-primary-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-700">
              Bewerken
            </span>
          )}
          {mode === 'edit' && selectedMarkerId && onMarkerDelete && (
            <button
              onClick={() => onMarkerDelete(selectedMarkerId)}
              className="ml-1 inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium text-danger-600 hover:bg-danger-50"
              title="Geselecteerde marker verwijderen (Delete)"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Verwijder marker
            </button>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleZoomOut}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Uitzoomen"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
          </button>
          <button
            onClick={handleZoomReset}
            className="min-w-[48px] rounded px-2 py-0.5 text-center text-xs text-gray-600 hover:bg-gray-100"
            title="Reset zoom (dubbelklik)"
          >
            {zoomPercent}%
          </button>
          <button
            onClick={handleZoomIn}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            title="Inzoomen"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative flex-1"
        style={{
          width: propWidth || '100%',
          height: propHeight || 500,
          minHeight: 400,
        }}
      >
        {/* Loading state */}
        {imageStatus === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-primary-500" />
              <span className="text-sm">Afbeelding laden...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {imageStatus === 'error' && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-50">
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <svg className="h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
              <span className="text-sm">Afbeelding kon niet worden geladen</span>
            </div>
          </div>
        )}

        {/* Konva canvas */}
        {imageStatus === 'loaded' && imageDims && (
          <Stage
            ref={stageRef}
            width={containerSize.width}
            height={containerSize.height}
            scaleX={stageScale}
            scaleY={stageScale}
            x={stagePos.x}
            y={stagePos.y}
            draggable={mode === 'view' || stageScale > 1}
            onWheel={handleWheel}
            onClick={handleStageClick}
            onTap={handleStageClick}
            onDblClick={handleStageDblClick}
            onDblTap={handleStageDblClick}
            onDragEnd={(e) => {
              if (e.target === stageRef.current) {
                setStagePos({ x: e.target.x(), y: e.target.y() });
              }
            }}
          >
            {/* Image layer */}
            <Layer>
              <KonvaImage
                image={image!}
                x={imageDims.offsetX}
                y={imageDims.offsetY}
                width={imageDims.displayWidth}
                height={imageDims.displayHeight}
                name="background-image"
              />
            </Layer>

            {/* Annotations layer (below markers) */}
            <Layer>
              <AnnotationLayer annotations={annotations} imageDims={imageDims} />
            </Layer>

            {/* Markers layer */}
            <Layer>
              {filteredMarkers.map((marker) => (
                <MarkerPin
                  key={marker.id}
                  marker={marker}
                  imageDims={imageDims}
                  isSelected={marker.id === selectedMarkerId}
                  showLabel={showLabels}
                  draggable={mode === 'edit'}
                  onDragEnd={handleMarkerDragEnd}
                  onClick={handleMarkerPinClick}
                  onMouseEnter={handleMarkerMouseEnter}
                  onMouseLeave={handleMarkerMouseLeave}
                />
              ))}
            </Layer>
          </Stage>
        )}

        {/* Tooltip overlay (HTML, outside canvas) */}
        {!popup.marker && (
          <MarkerTooltip tooltip={tooltip} containerRef={containerRef as React.RefObject<HTMLDivElement>} />
        )}

        {/* Popup overlay (HTML, outside canvas) */}
        <MarkerPopup
          marker={popup.marker}
          x={popup.x}
          y={popup.y}
          containerRef={containerRef as React.RefObject<HTMLDivElement>}
          onClose={handlePopupClose}
        />
      </div>

      {/* Legend */}
      {showLegend && filteredMarkers.length > 0 && (
        <div className="border-t border-gray-200 bg-white">
          <Legend markers={filteredMarkers} />
        </div>
      )}

      {/* Edit mode hint */}
      {mode === 'edit' && imageStatus === 'loaded' && (
        <div className="border-t border-primary-100 bg-primary-50 px-3 py-1.5 text-xs text-primary-600">
          Klik op de afbeelding om een marker te plaatsen. Sleep markers om te verplaatsen. Delete-toets om de
          geselecteerde marker te verwijderen.
        </div>
      )}
    </div>
  );
};
