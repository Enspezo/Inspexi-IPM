import React from 'react';
import type { Marker, MarkerType } from './types';
import { getMarkerColor, getMarkerTypeName } from './utils';

interface LegendProps {
  markers: Marker[];
}

export const Legend: React.FC<LegendProps> = ({ markers }) => {
  const counts: Record<MarkerType, number> = {
    ASSET: 0,
    MEASUREMENT: 0,
    FINDING: 0,
  };

  for (const marker of markers) {
    counts[marker.markerType]++;
  }

  const types: MarkerType[] = ['ASSET', 'MEASUREMENT', 'FINDING'];

  return (
    <div className="flex items-center gap-4 px-3 py-2 text-xs text-gray-600">
      <span className="font-medium uppercase tracking-wide text-gray-500">Legenda</span>
      {types.map((type) => (
        <div key={type} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: getMarkerColor(type) }}
          />
          <span>
            {getMarkerTypeName(type)} ({counts[type]})
          </span>
        </div>
      ))}
    </div>
  );
};
