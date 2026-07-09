export type PointerPosition = {
  x: number;
  y: number;
};

export type PointerBounds = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function clampUnit(value: number) {
  return Math.min(1, Math.max(-1, value));
}

export function normalizePointerPosition(
  clientX: number,
  clientY: number,
  bounds: PointerBounds
): PointerPosition {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const x = ((clientX - bounds.left) / width) * 2 - 1;
  const y = 1 - ((clientY - bounds.top) / height) * 2;

  return {
    x: clampUnit(x),
    y: clampUnit(y)
  };
}

export function isMousePointerType(pointerType: string) {
  return pointerType === 'mouse';
}

export function dampValue(current: number, target: number, deltaSeconds: number, response: number) {
  const delta = Math.max(0, Math.min(0.25, deltaSeconds));
  const speed = Math.max(0, response);
  const blend = 1 - Math.exp(-speed * delta);
  return current + (target - current) * blend;
}
