// =====================================================
// Location Image Viewer - Utility Functions
// =====================================================

import type { MarkerType, ImageDimensions } from './types';

/**
 * Convert percentage position (0-100) to pixel position on the displayed image.
 */
export function percentageToPixels(
  percentage: number,
  imageDimension: number,
  offset: number,
): number {
  return (percentage / 100) * imageDimension + offset;
}

/**
 * Convert pixel position on the displayed image back to percentage (0-100).
 */
export function pixelsToPercentage(
  pixels: number,
  imageDimension: number,
  offset: number,
): number {
  return ((pixels - offset) / imageDimension) * 100;
}

/**
 * Get marker fill color based on type and optional lookup/classification color.
 * De lookup-kleur (asset-/finding-status) wint; anders een vaste type-kleur.
 */
export function getMarkerColor(markerType: MarkerType, classificationColor?: string): string {
  if (classificationColor) {
    return classificationColor;
  }

  switch (markerType) {
    case 'ASSET':
      return '#3B82F6'; // blue-500
    case 'MEASUREMENT':
      return '#22C55E'; // green-500
    case 'FINDING':
      return '#EF4444'; // red-500
    default:
      return '#6B7280'; // gray-500
  }
}

/**
 * Get marker stroke/border color (darker variant).
 */
export function getMarkerStrokeColor(markerType: MarkerType, classificationColor?: string): string {
  if (classificationColor) {
    return classificationColor;
  }

  switch (markerType) {
    case 'ASSET':
      return '#1D4ED8'; // blue-700
    case 'MEASUREMENT':
      return '#15803D'; // green-700
    case 'FINDING':
      return '#B91C1C'; // red-700
    default:
      return '#374151'; // gray-700
  }
}

/**
 * Get marker icon text based on type and optional asset type.
 */
export function getMarkerIcon(markerType: MarkerType, assetType?: string): string {
  if (markerType === 'MEASUREMENT') {
    return 'M'; // Meting
  }

  if (markerType === 'FINDING') {
    return '!';
  }

  // Asset types
  if (assetType) {
    const lower = assetType.toLowerCase();
    if (lower.includes('hoofdverdeler') || lower.includes('hvk')) return 'H';
    if (lower.includes('onderverdeler') || lower.includes('ovk')) return 'O';
    if (lower.includes('groepenkast')) return 'G';
  }

  return 'A'; // default Asset
}

/**
 * Calculate image dimensions to fit within container while maintaining aspect ratio.
 */
export function calculateImageFit(
  containerWidth: number,
  containerHeight: number,
  imageWidth: number,
  imageHeight: number,
): ImageDimensions {
  const containerRatio = containerWidth / containerHeight;
  const imageRatio = imageWidth / imageHeight;

  let displayWidth: number;
  let displayHeight: number;

  if (imageRatio > containerRatio) {
    // Image is wider than container
    displayWidth = containerWidth;
    displayHeight = containerWidth / imageRatio;
  } else {
    // Image is taller than container
    displayHeight = containerHeight;
    displayWidth = containerHeight * imageRatio;
  }

  const offsetX = (containerWidth - displayWidth) / 2;
  const offsetY = (containerHeight - displayHeight) / 2;

  return {
    naturalWidth: imageWidth,
    naturalHeight: imageHeight,
    displayWidth,
    displayHeight,
    offsetX,
    offsetY,
    scale: displayWidth / imageWidth,
  };
}

/**
 * Clamp a value between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Get display name for marker type (Dutch).
 */
export function getMarkerTypeName(markerType: MarkerType): string {
  switch (markerType) {
    case 'ASSET':
      return 'Asset';
    case 'MEASUREMENT':
      return 'Meting';
    case 'FINDING':
      return 'Constatering';
    default:
      return markerType;
  }
}
