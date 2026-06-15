import React from 'react';
import { Group, Circle as KonvaCircle, Arrow, Line } from 'react-konva';
import type {
  Annotation,
  CircleAnnotation,
  ArrowAnnotation,
  FreehandAnnotation,
  ImageDimensions,
} from './types';
import { percentageToPixels } from './utils';

interface AnnotationLayerProps {
  annotations: Array<{
    markerId: string;
    annotation: Annotation;
  }>;
  imageDims: ImageDimensions;
}

const RenderCircleAnnotation: React.FC<{
  annotation: CircleAnnotation;
  imageDims: ImageDimensions;
}> = ({ annotation, imageDims }) => {
  const cx = percentageToPixels(annotation.centerX, imageDims.displayWidth, imageDims.offsetX);
  const cy = percentageToPixels(annotation.centerY, imageDims.displayHeight, imageDims.offsetY);
  // Radius is percentage of image width
  const r = (annotation.radius / 100) * imageDims.displayWidth;

  return (
    <KonvaCircle
      x={cx}
      y={cy}
      radius={r}
      stroke={annotation.color}
      strokeWidth={annotation.strokeWidth}
      fill={annotation.filled ? `${annotation.color}33` : undefined}
      listening={false}
    />
  );
};

const RenderArrowAnnotation: React.FC<{
  annotation: ArrowAnnotation;
  imageDims: ImageDimensions;
}> = ({ annotation, imageDims }) => {
  const startX = percentageToPixels(annotation.startX, imageDims.displayWidth, imageDims.offsetX);
  const startY = percentageToPixels(annotation.startY, imageDims.displayHeight, imageDims.offsetY);
  const endX = percentageToPixels(annotation.endX, imageDims.displayWidth, imageDims.offsetX);
  const endY = percentageToPixels(annotation.endY, imageDims.displayHeight, imageDims.offsetY);

  return (
    <Arrow
      points={[startX, startY, endX, endY]}
      stroke={annotation.color}
      strokeWidth={annotation.strokeWidth}
      fill={annotation.color}
      pointerLength={10}
      pointerWidth={10}
      listening={false}
    />
  );
};

const RenderFreehandAnnotation: React.FC<{
  annotation: FreehandAnnotation;
  imageDims: ImageDimensions;
}> = ({ annotation, imageDims }) => {
  const flatPoints: number[] = [];
  for (const point of annotation.points) {
    flatPoints.push(
      percentageToPixels(point.x, imageDims.displayWidth, imageDims.offsetX),
      percentageToPixels(point.y, imageDims.displayHeight, imageDims.offsetY),
    );
  }

  return (
    <Line
      points={flatPoints}
      stroke={annotation.color}
      strokeWidth={annotation.strokeWidth}
      tension={0.5}
      lineCap="round"
      lineJoin="round"
      listening={false}
    />
  );
};

export const AnnotationLayer: React.FC<AnnotationLayerProps> = ({ annotations, imageDims }) => {
  return (
    <Group>
      {annotations.map(({ markerId, annotation }) => {
        switch (annotation.type) {
          case 'circle':
            return <RenderCircleAnnotation key={markerId} annotation={annotation} imageDims={imageDims} />;
          case 'arrow':
            return <RenderArrowAnnotation key={markerId} annotation={annotation} imageDims={imageDims} />;
          case 'freehand':
            return <RenderFreehandAnnotation key={markerId} annotation={annotation} imageDims={imageDims} />;
          default:
            return null;
        }
      })}
    </Group>
  );
};
