export type TextGeometry = {
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function moveTextGeometry(
  geometry: TextGeometry,
  deltaPixels: { x: number; y: number },
  canvasPixels: { width: number; height: number },
): Pick<TextGeometry, 'x' | 'y'> {
  const halfWidth = Math.min(0.48, geometry.width / 2);
  return {
    x: clamp(geometry.x + deltaPixels.x / Math.max(1, canvasPixels.width), halfWidth, 1 - halfWidth),
    y: clamp(geometry.y + deltaPixels.y / Math.max(1, canvasPixels.height), 0.04, 0.96),
  };
}

export function resizeTextGeometry(
  geometry: TextGeometry,
  deltaXPixels: number,
  canvasWidthPixels: number,
): Pick<TextGeometry, 'width' | 'fontSize'> {
  const ratio = Math.max(0.3, 1 + deltaXPixels / Math.max(1, geometry.width * canvasWidthPixels));
  return {
    width: clamp(geometry.width * ratio, 0.1, 0.96),
    fontSize: clamp(geometry.fontSize * ratio, 12, 120),
  };
}
