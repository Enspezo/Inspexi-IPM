// ===========================================
// Marker Popup - Interactive popup on marker click (view mode)
// ===========================================
// Beheer-port: lucide-icons vervangen door inline SVG's (geen lucide-dep in
// dit project) en de navigate-handler is een gewone functie i.p.v. een
// conditioneel aangeroepen useCallback (rules-of-hooks).

import { useRef, useEffect } from 'react';
import type { Marker } from './types';
import { getMarkerColor, getMarkerTypeName } from './utils';

interface MarkerPopupProps {
  marker: Marker | null;
  x: number;
  y: number;
  containerRef: React.RefObject<HTMLDivElement>;
  onClose: () => void;
  onNavigate?: (entityType: string, entityId: string) => void;
}

const TYPE_COLORS: Record<string, { bg: string; text: string }> = {
  ASSET: { bg: 'bg-blue-100', text: 'text-blue-700' },
  MEASUREMENT: { bg: 'bg-green-100', text: 'text-green-700' },
  FINDING: { bg: 'bg-red-100', text: 'text-red-700' },
};

function CloseIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
      />
    </svg>
  );
}

export function MarkerPopup({ marker, x, y, containerRef, onClose, onNavigate }: MarkerPopupProps) {
  const popupRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!marker) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    // Delay to avoid closing immediately from the click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [marker, onClose]);

  // Close on Escape
  useEffect(() => {
    if (!marker) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [marker, onClose]);

  if (!marker) return null;

  const container = containerRef.current;
  if (!container) return null;

  const containerRect = container.getBoundingClientRect();
  const typeColor = TYPE_COLORS[marker.markerType] || TYPE_COLORS.ASSET;
  const typeName = getMarkerTypeName(marker.markerType);
  const markerColor = marker.color || getMarkerColor(marker.markerType, marker.linkedEntity?.classificationColor);

  // Position popup: try to show above the marker, fallback below
  const POPUP_WIDTH = 240;
  const POPUP_OFFSET = 12;
  let popupLeft = x - POPUP_WIDTH / 2;
  let popupTop = y - POPUP_OFFSET;
  let showAbove = true;

  // Keep within container bounds (horizontal)
  if (popupLeft < 8) popupLeft = 8;
  if (popupLeft + POPUP_WIDTH > containerRect.width - 8) {
    popupLeft = containerRect.width - POPUP_WIDTH - 8;
  }

  // If too close to top, show below marker
  if (popupTop < 120) {
    popupTop = y + 30;
    showAbove = false;
  }

  const handleNavigate = () => {
    if (!marker.linkedEntity || !onNavigate) return;
    onNavigate(marker.markerType, marker.linkedEntity.id);
  };

  return (
    <div
      ref={popupRef}
      className="absolute z-30"
      style={{
        left: popupLeft,
        top: showAbove ? undefined : popupTop,
        bottom: showAbove ? containerRect.height - popupTop : undefined,
        width: POPUP_WIDTH,
      }}
    >
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
        {/* Header */}
        <div
          className="flex items-center justify-between px-3 py-2"
          style={{ borderBottom: `2px solid ${markerColor}` }}
        >
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${typeColor.bg} ${typeColor.text}`}
          >
            {typeName}
          </span>
          <button
            onClick={onClose}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Sluiten"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="px-3 py-2.5">
          {marker.linkedEntity ? (
            <>
              <p className="text-sm font-medium leading-tight text-gray-900">{marker.linkedEntity.name}</p>
              {marker.linkedEntity.type && (
                <p className="mt-0.5 text-xs text-gray-500">{marker.linkedEntity.type}</p>
              )}
              {marker.linkedEntity.status && (
                <span
                  className="mt-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium text-white"
                  style={{ backgroundColor: markerColor }}
                >
                  {marker.linkedEntity.status}
                </span>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-500">{marker.label || 'Geen gekoppelde entiteit'}</p>
          )}
        </div>

        {/* Footer */}
        {marker.linkedEntity && onNavigate && (
          <div className="border-t border-gray-100 px-3 py-2">
            <button
              onClick={handleNavigate}
              className="flex w-full items-center justify-center gap-1.5 rounded py-1 text-xs font-medium text-primary-600 transition-colors hover:bg-primary-50 hover:text-primary-700"
            >
              <ExternalLinkIcon />
              Bekijken
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
