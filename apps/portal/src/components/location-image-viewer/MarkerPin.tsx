import React from 'react';
import { Group, Circle, Text } from 'react-konva';
import type { Marker, ImageDimensions } from './types';
import { percentageToPixels, getMarkerColor, getMarkerStrokeColor, getMarkerIcon } from './utils';

interface MarkerPinProps {
  marker: Marker;
  imageDims: ImageDimensions;
  isSelected: boolean;
  showLabel: boolean;
  draggable: boolean;
  onDragEnd?: (markerId: string, x: number, y: number) => void;
  onClick?: (marker: Marker) => void;
  onMouseEnter?: (marker: Marker, x: number, y: number) => void;
  onMouseLeave?: () => void;
}

const PIN_RADIUS = 14;
const SELECTED_RING_RADIUS = 20;

export const MarkerPin: React.FC<MarkerPinProps> = ({
  marker,
  imageDims,
  isSelected,
  showLabel,
  draggable,
  onDragEnd,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const x = percentageToPixels(marker.positionX, imageDims.displayWidth, imageDims.offsetX);
  const y = percentageToPixels(marker.positionY, imageDims.displayHeight, imageDims.offsetY);

  const fillColor = marker.color || getMarkerColor(marker.markerType, marker.linkedEntity?.classificationColor);
  const strokeColor = getMarkerStrokeColor(marker.markerType, marker.linkedEntity?.classificationColor);
  const iconText = marker.icon || getMarkerIcon(marker.markerType, marker.linkedEntity?.type);

  const handleDragEnd = (e: { target: { x: () => number; y: () => number } }) => {
    if (onDragEnd) {
      onDragEnd(marker.id, e.target.x(), e.target.y());
    }
  };

  return (
    <Group
      x={x}
      y={y}
      draggable={draggable}
      onDragEnd={handleDragEnd}
      onClick={() => onClick?.(marker)}
      onTap={() => onClick?.(marker)}
      onMouseEnter={(e) => {
        const stage = e.target.getStage();
        if (stage) {
          stage.container().style.cursor = 'pointer';
        }
        const pos = stage?.getPointerPosition();
        if (pos) {
          onMouseEnter?.(marker, pos.x, pos.y);
        }
      }}
      onMouseLeave={(e) => {
        const stage = e.target.getStage();
        if (stage) {
          stage.container().style.cursor = 'default';
        }
        onMouseLeave?.();
      }}
    >
      {/* Selection ring */}
      {isSelected && (
        <Circle
          radius={SELECTED_RING_RADIUS}
          stroke="#3B82F6"
          strokeWidth={2}
          dash={[4, 4]}
          fill="rgba(59, 130, 246, 0.1)"
        />
      )}

      {/* Shadow for depth */}
      <Circle radius={PIN_RADIUS} fill="rgba(0,0,0,0.2)" x={1} y={2} />

      {/* Main circle */}
      <Circle radius={PIN_RADIUS} fill={fillColor} stroke={strokeColor} strokeWidth={2} />

      {/* Icon text */}
      <Text
        text={iconText}
        fontSize={12}
        fontStyle="bold"
        fill="white"
        align="center"
        verticalAlign="middle"
        width={PIN_RADIUS * 2}
        height={PIN_RADIUS * 2}
        offsetX={PIN_RADIUS}
        offsetY={PIN_RADIUS}
      />

      {/* Label below marker */}
      {showLabel && marker.label && (
        <>
          {/* Label outline (white halo) */}
          <Text
            text={marker.label}
            fontSize={11}
            fontStyle="bold"
            fill={strokeColor}
            stroke="white"
            strokeWidth={3}
            y={PIN_RADIUS + 4}
            align="center"
            width={120}
            offsetX={60}
          />
          {/* Label text */}
          <Text
            text={marker.label}
            fontSize={11}
            fontStyle="bold"
            fill={strokeColor}
            y={PIN_RADIUS + 4}
            align="center"
            width={120}
            offsetX={60}
          />
        </>
      )}
    </Group>
  );
};
