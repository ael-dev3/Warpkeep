export type TitleTransitionViewport = Readonly<{
  width: number;
  height: number;
}>;

export type TitleTransitionClientPoint = Readonly<{
  x: number;
  y: number;
}>;

export const TITLE_TRANSITION_FRAME_MAXIMUM_BYTES: number;

export function readTitleTransitionPngDimensions(value: Buffer): Readonly<{
  width: number;
  height: number;
}>;

export function analyzeTitleGatewayVisualFrame(
  screenshot: Buffer,
  viewport: TitleTransitionViewport,
  expectedClientPoint: TitleTransitionClientPoint,
): Readonly<{
  angularBins: number;
  clientX: number;
  clientY: number;
  deltaPhysicalPixels: number;
  pixelX: number;
  pixelY: number;
  screenshotScale: number;
  violetSamples: number;
}>;

export function analyzeTitleTransitionFramePair(
  earlyScreenshot: Buffer,
  expandedScreenshot: Buffer,
  viewport: TitleTransitionViewport,
  expectedClientPoint: TitleTransitionClientPoint,
): Readonly<{
  acceptedDirections: number;
  boundaryRadiusCssPixels: number;
  boundarySpreadPhysicalPixels: number;
  clientX: number;
  clientY: number;
  deltaPhysicalPixels: number;
  oppositeBoundaryErrorPhysicalPixels: number;
  pixelX: number;
  pixelY: number;
  searchScope: 'full-frame';
  screenshotScale: number;
}>;

export function analyzeTitleTransitionFirstVisibleFrame(
  lastActiveScreenshot: Buffer,
  firstVisibleScreenshot: Buffer,
  viewport: TitleTransitionViewport,
  expectedClientPoint: TitleTransitionClientPoint,
): Readonly<{
  clientX: number;
  clientY: number;
  deltaPhysicalPixels: number;
  pixelX: number;
  pixelY: number;
  sampleCount: number;
  searchScope: 'full-frame';
  screenshotScale: number;
}>;
