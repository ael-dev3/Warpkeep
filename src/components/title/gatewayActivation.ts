export type GatewayActivationInput = 'history' | 'keyboard' | 'pointer';

export type GatewayRendererPoint = Readonly<{
  space: 'renderer';
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  visible: boolean;
}>;

export type GatewayClientPoint = Readonly<{
  space: 'client';
  x: number;
  y: number;
}>;

export type GatewayOverlayPoint = Readonly<{
  space: 'overlay-normalized';
  u: number;
  v: number;
}>;

export type GatewaySurfaceRect = Readonly<{
  space: 'client-rect';
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type GatewayRenderedMeasurement = Readonly<{
  generation: number;
  rendererPoint: GatewayRendererPoint;
  sourceSurfaceRect: GatewaySurfaceRect | null;
  gatewayClientCenter: GatewayClientPoint | null;
  buttonClientCenter: GatewayClientPoint | null;
  alignmentErrorPx: number | null;
  ready: boolean;
}>;

export type GatewayActivationRecord = Readonly<{
  input: GatewayActivationInput;
  pointerClientPoint: GatewayClientPoint | null;
  buttonRect: GatewaySurfaceRect | null;
  rendererPoint: GatewayRendererPoint;
  sourceSurfaceRect: GatewaySurfaceRect | null;
  gatewayClientCenter: GatewayClientPoint | null;
  buttonClientCenter: GatewayClientPoint | null;
  alignmentErrorPx: number | null;
  measurementGeneration: number;
  ready: boolean;
}>;

type RectLike = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type GatewayRendererPointInput = Readonly<{
  x: number;
  y: number;
  viewportWidth: number;
  viewportHeight: number;
  visible?: boolean;
}>;

type GatewayActivationRecordInput = Readonly<{
  input: GatewayActivationInput;
  pointerClientPoint?: GatewayClientPoint | null;
  buttonRect?: RectLike | GatewaySurfaceRect | null;
  rendererPoint: GatewayRendererPoint;
  sourceSurfaceRect?: RectLike | GatewaySurfaceRect | null;
  gatewayClientCenter?: GatewayClientPoint | null;
  buttonClientCenter?: GatewayClientPoint | null;
  alignmentErrorPx?: number | null;
  measurementGeneration?: number;
  ready?: boolean;
}>;

export function createGatewayClientPoint(
  x: number,
  y: number
): GatewayClientPoint | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return Object.freeze({ space: 'client', x, y });
}

export function createGatewayRendererPoint(
  input: GatewayRendererPointInput
): GatewayRendererPoint {
  const validViewport = Number.isFinite(input.viewportWidth)
    && Number.isFinite(input.viewportHeight)
    && input.viewportWidth > 0
    && input.viewportHeight > 0;
  const validPoint = Number.isFinite(input.x) && Number.isFinite(input.y);
  const visible = Boolean(
    input.visible !== false
    && validViewport
    && validPoint
    && input.x >= 0
    && input.x <= input.viewportWidth
    && input.y >= 0
    && input.y <= input.viewportHeight
  );
  return Object.freeze({
    space: 'renderer',
    x: validPoint ? input.x : 0,
    y: validPoint ? input.y : 0,
    viewportWidth: validViewport ? input.viewportWidth : 0,
    viewportHeight: validViewport ? input.viewportHeight : 0,
    visible
  });
}

export function snapshotGatewayRect(
  rect: RectLike | GatewaySurfaceRect | null | undefined
): GatewaySurfaceRect | null {
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
    space: 'client-rect',
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height
  });
}

function snapshotGatewayRendererPoint(
  point: GatewayRendererPoint
): GatewayRendererPoint {
  return createGatewayRendererPoint(point);
}

function snapshotGatewayClientPoint(
  point: GatewayClientPoint | null | undefined
): GatewayClientPoint | null {
  if (!point || point.space !== 'client') {
    return null;
  }
  return createGatewayClientPoint(point.x, point.y);
}

export function rendererPointToClient(
  point: GatewayRendererPoint,
  surfaceRect: GatewaySurfaceRect | null
): GatewayClientPoint | null {
  if (
    point.space !== 'renderer'
    || !point.visible
    || !surfaceRect
    || surfaceRect.space !== 'client-rect'
    || point.viewportWidth <= 0
    || point.viewportHeight <= 0
  ) {
    return null;
  }
  return createGatewayClientPoint(
    surfaceRect.left + point.x / point.viewportWidth * surfaceRect.width,
    surfaceRect.top + point.y / point.viewportHeight * surfaceRect.height
  );
}

export function clientPointToOverlay(
  point: GatewayClientPoint,
  overlayRect: GatewaySurfaceRect
): GatewayOverlayPoint | null {
  if (
    point.space !== 'client'
    || overlayRect.space !== 'client-rect'
    || point.x < overlayRect.left
    || point.x > overlayRect.left + overlayRect.width
    || point.y < overlayRect.top
    || point.y > overlayRect.top + overlayRect.height
  ) {
    return null;
  }
  return Object.freeze({
    space: 'overlay-normalized',
    u: (point.x - overlayRect.left) / overlayRect.width,
    v: (point.y - overlayRect.top) / overlayRect.height
  });
}

export function gatewayRectCenter(
  rect: GatewaySurfaceRect | null
): GatewayClientPoint | null {
  if (!rect) return null;
  return createGatewayClientPoint(
    rect.left + rect.width * 0.5,
    rect.top + rect.height * 0.5
  );
}

export function gatewayClientDistance(
  left: GatewayClientPoint | null,
  right: GatewayClientPoint | null
): number | null {
  if (!left || !right) return null;
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function gatewayClientPointInsideRect(
  point: GatewayClientPoint | null,
  rect: GatewaySurfaceRect | null
): point is GatewayClientPoint {
  return point !== null
    && rect !== null
    && point.x >= rect.left
    && point.x <= rect.left + rect.width
    && point.y >= rect.top
    && point.y <= rect.top + rect.height;
}

export function createGatewayActivationRecord(
  input: GatewayActivationRecordInput
): GatewayActivationRecord {
  const alignmentErrorPx = input.alignmentErrorPx;
  const measurementGeneration = input.measurementGeneration;
  return Object.freeze({
    input: input.input,
    pointerClientPoint: snapshotGatewayClientPoint(input.pointerClientPoint),
    buttonRect: snapshotGatewayRect(input.buttonRect),
    rendererPoint: snapshotGatewayRendererPoint(input.rendererPoint),
    sourceSurfaceRect: snapshotGatewayRect(input.sourceSurfaceRect),
    gatewayClientCenter: snapshotGatewayClientPoint(input.gatewayClientCenter),
    buttonClientCenter: snapshotGatewayClientPoint(input.buttonClientCenter),
    alignmentErrorPx: typeof alignmentErrorPx === 'number'
      && Number.isFinite(alignmentErrorPx)
      && alignmentErrorPx >= 0
      ? alignmentErrorPx
      : null,
    measurementGeneration: typeof measurementGeneration === 'number'
      && Number.isSafeInteger(measurementGeneration)
      && measurementGeneration >= 0
      ? measurementGeneration
      : 0,
    ready: input.ready === true
  });
}

export function currentGatewayViewport(): GatewaySurfaceRect {
  const reportedWidth = typeof window === 'undefined' ? 1 : window.innerWidth;
  const reportedHeight = typeof window === 'undefined' ? 1 : window.innerHeight;
  const width = Number.isFinite(reportedWidth) && reportedWidth > 0 ? reportedWidth : 1;
  const height = Number.isFinite(reportedHeight) && reportedHeight > 0 ? reportedHeight : 1;
  return Object.freeze({
    space: 'client-rect',
    left: 0,
    top: 0,
    width,
    height
  });
}

function clampToViewport(
  point: GatewayClientPoint,
  viewport: GatewaySurfaceRect
): GatewayClientPoint {
  return createGatewayClientPoint(
    Math.min(Math.max(point.x, viewport.left), viewport.left + viewport.width),
    Math.min(Math.max(point.y, viewport.top), viewport.top + viewport.height)
  )!;
}

/**
 * The cinematic origin is always the latest rendered gateway center. Pointer
 * coordinates validate an activation but never become the visual origin.
 */
export function resolveGatewayActivationOrigin(
  activation: GatewayActivationRecord,
  viewport: GatewaySurfaceRect = currentGatewayViewport()
): GatewayClientPoint {
  const safeViewport = snapshotGatewayRect(viewport) ?? currentGatewayViewport();
  const renderedCenter = activation.gatewayClientCenter
    ?? rendererPointToClient(activation.rendererPoint, activation.sourceSurfaceRect);
  const fallback = createGatewayClientPoint(
    safeViewport.left + safeViewport.width * 0.5,
    safeViewport.top + safeViewport.height * 0.36
  )!;
  return clampToViewport(renderedCenter ?? fallback, safeViewport);
}
