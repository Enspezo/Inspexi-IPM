// Icoon per node, primair op nodeType (LOCATION = locatie/map, ASSET = object),
// met een lichte variatie op typeCode zodat verschillende typen herkenbaar zijn.
import { AssetNodeType } from '@/types';

interface NodeIconProps {
  nodeType: AssetNodeType;
  typeCode?: string;
  className?: string;
}

// typeCode → emoji-achtige hint is bewust niet gebruikt (geen icon-lib in dit
// project); we kiezen een SVG-pad op basis van nodeType en een paar bekende codes.
const LOCATION_PATHS: Record<string, string> = {
  // Map-icoon (default voor LOCATION)
  default:
    'M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z',
  // Gebouw
  building:
    'M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01',
};

const ASSET_PATH =
  'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4';

export function NodeIcon({ nodeType, typeCode, className = 'h-4 w-4' }: NodeIconProps) {
  const isLocation = nodeType === AssetNodeType.LOCATION;
  const path = isLocation ? LOCATION_PATHS[typeCode ?? ''] ?? LOCATION_PATHS.default : ASSET_PATH;
  const color = isLocation ? 'text-primary-500' : 'text-amber-500';

  return (
    <svg
      className={`${className} ${color} shrink-0`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}
