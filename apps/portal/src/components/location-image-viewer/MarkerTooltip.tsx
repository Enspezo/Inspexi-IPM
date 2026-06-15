import React from 'react';
import type { TooltipState } from './types';
import { getMarkerTypeName } from './utils';

interface MarkerTooltipProps {
  tooltip: TooltipState;
  containerRef: React.RefObject<HTMLDivElement>;
}

export const MarkerTooltip: React.FC<MarkerTooltipProps> = ({ tooltip, containerRef }) => {
  if (!tooltip.visible || !tooltip.marker) {
    return null;
  }

  const { marker, x, y } = tooltip;
  const containerRect = containerRef.current?.getBoundingClientRect();
  if (!containerRect) return null;

  // Position tooltip relative to container
  const tooltipX = x + 12;
  const tooltipY = y - 10;

  return (
    <div
      className="pointer-events-none absolute z-50"
      style={{
        left: tooltipX,
        top: tooltipY,
        transform: 'translateY(-100%)',
      }}
    >
      <div className="max-w-[200px] rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg">
        <div className="mb-0.5 flex items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-wide text-gray-400">
            {getMarkerTypeName(marker.markerType)}
          </span>
        </div>
        {marker.label && <div className="truncate font-medium">{marker.label}</div>}
        {marker.linkedEntity?.name && (
          <div className="truncate text-gray-300">{marker.linkedEntity.name}</div>
        )}
        {marker.linkedEntity?.type && (
          <div className="text-[10px] text-gray-400">{marker.linkedEntity.type}</div>
        )}
        {marker.linkedEntity?.status && (
          <div className="mt-0.5 text-[10px] text-gray-400">Status: {marker.linkedEntity.status}</div>
        )}
        {/* Arrow pointing down */}
        <div className="absolute bottom-0 left-3 h-0 w-0 translate-y-full border-l-[5px] border-r-[5px] border-t-[5px] border-l-transparent border-r-transparent border-t-gray-900" />
      </div>
    </div>
  );
};
