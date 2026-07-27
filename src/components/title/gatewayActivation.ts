export type GatewayActivationInput = 'keyboard' | 'pointer';

export type GatewayProjection = Readonly<{
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  visible: boolean;
}>;

export type GatewayClientPoint = Readonly<{
  x: number;
  y: number;
}>;

export type GatewayRectSnapshot = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type GatewayActivationRecord = Readonly<{
  input: GatewayActivationInput;
  clientPoint: GatewayClientPoint | null;
  buttonRect: GatewayRectSnapshot | null;
  projection: GatewayProjection;
  projectionSourceRect: GatewayRectSnapshot | null;
}>;

type RectLike = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type GatewayActivationRecordInput = Readonly<{
  input: GatewayActivationInput;
  clientPoint?: GatewayClientPoint | null;
  buttonRect?: RectLike | null;
  projection: GatewayProjection;
  projectionSourceRect?: RectLike | null;
}>;

function finitePoint(point: GatewayClientPoint | null | undefined): GatewayClientPoint | null {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    return null;
  }
  return Object.freeze({ x: point.x, y: point.y });
}

export function snapshotGatewayRect(
  rect: RectLike | null | undefined
): GatewayRectSnapshot | null {
  if (
    !rect
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  return Object.freeze({
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  });
}

function snapshotGatewayProjection(projection: GatewayProjection): GatewayProjection {
  return Object.freeze({
    x: projection.x,
    y: projection.y,
    viewportWidth: projection.viewportWidth,
    viewportHeight: projection.viewportHeight,
    visible: projection.visible
  });
}

export function createGatewayActivationRecord(
  input: GatewayActivationRecordInput
): GatewayActivationRecord {
  return Object.freeze({
    input: input.input,
    clientPoint: finitePoint(input.clientPoint),
    buttonRect: snapshotGatewayRect(input.buttonRect),
    projection: snapshotGatewayProjection(input.projection),
    projectionSourceRect: snapshotGatewayRect(input.projectionSourceRect)
  });
}

export function currentGatewayViewport(): GatewayRectSnapshot {
  const reportedWidth = typeof window === 'undefined' ? 1 : window.innerWidth;
  const reportedHeight = typeof window === 'undefined' ? 1 : window.innerHeight;
  const width = Number.isFinite(reportedWidth) && reportedWidth > 0 ? reportedWidth : 1;
  const height = Number.isFinite(reportedHeight) && reportedHeight > 0 ? reportedHeight : 1;
  return Object.freeze({ left: 0, top: 0, width, height });
}

function projectionPoint(
  activation: GatewayActivationRecord
): GatewayClientPoint | null {
  const projection = activation.projection;
  if (
    !projection.visible
    || !Number.isFinite(projection.x)
    || !Number.isFinite(projection.y)
    || !Number.isFinite(projection.viewportWidth)
    || !Number.isFinite(projection.viewportHeight)
    || projection.viewportWidth <= 0
    || projection.viewportHeight <= 0
    || projection.x < 0
    || projection.x > projection.viewportWidth
    || projection.y < 0
    || projection.y > projection.viewportHeight
  ) {
    return null;
  }

  const source = activation.projectionSourceRect ?? Object.freeze({
    left: 0,
    top: 0,
    width: projection.viewportWidth,
    height: projection.viewportHeight
  });
  return Object.freeze({
    x: source.left + projection.x / projection.viewportWidth * source.width,
    y: source.top + projection.y / projection.viewportHeight * source.height
  });
}

function rectCenter(rect: GatewayRectSnapshot | null): GatewayClientPoint | null {
  if (!rect) return null;
  return Object.freeze({
    x: rect.left + rect.width * 0.5,
    y: rect.top + rect.height * 0.5
  });
}

function pointInsideRect(
  point: GatewayClientPoint | null,
  rect: GatewayRectSnapshot | null
): point is GatewayClientPoint {
  return point !== null
    && rect !== null
    && point.x >= rect.left
    && point.x <= rect.left + rect.width
    && point.y >= rect.top
    && point.y <= rect.top + rect.height;
}

function clampToViewport(
  point: GatewayClientPoint,
  viewport: GatewayRectSnapshot
): GatewayClientPoint {
  return Object.freeze({
    x: Math.min(Math.max(point.x, viewport.left), viewport.left + viewport.width),
    y: Math.min(Math.max(point.y, viewport.top), viewport.top + viewport.height)
  });
}

export function resolveGatewayActivationOrigin(
  activation: GatewayActivationRecord,
  viewport: GatewayRectSnapshot = currentGatewayViewport()
): GatewayClientPoint {
  const safeViewport = snapshotGatewayRect(viewport) ?? currentGatewayViewport();
  const candidate = activation.input === 'pointer'
    ? pointInsideRect(activation.clientPoint, activation.buttonRect)
      ? activation.clientPoint
      : null
    : rectCenter(activation.buttonRect);
  const point = candidate ?? projectionPoint(activation) ?? Object.freeze({
    x: safeViewport.left + safeViewport.width * 0.5,
    y: safeViewport.top + safeViewport.height * 0.36
  });
  return clampToViewport(point, safeViewport);
}
