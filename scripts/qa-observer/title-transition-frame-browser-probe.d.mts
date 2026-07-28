export type TitleTransitionFrameViewport = Readonly<{
  height: number;
  width: number;
}>;

export type TitleTransitionFrameCase = Readonly<{
  cycles: number;
  deviceScaleFactor: number;
  id: string;
  input: 'pointer' | 'touch' | 'keyboard';
  mobile: boolean;
  midTransitionViewport?: TitleTransitionFrameViewport;
  reducedMotion: boolean;
  shellStress?: Readonly<{
    heightFraction: number;
    left: number;
    scaleX: number;
    scaleY: number;
    top: number;
    widthFraction: number;
  }>;
  viewport: TitleTransitionFrameViewport;
  zoomPercent: 80 | 100 | 125 | 150;
}>;

export const TITLE_TRANSITION_FRAME_CASES:
  readonly TitleTransitionFrameCase[];

export class TitleTransitionFrameBrowserError extends Error {}

export function titleTransitionBrowserZoomLevel(
  zoomPercent: 80 | 100 | 125 | 150,
): number;

export function titleTransitionCssViewport(
  viewport: TitleTransitionFrameViewport,
  zoomPercent: 80 | 100 | 125 | 150,
): TitleTransitionFrameViewport;

export function isAllowedTitleTransitionBrowserUrl(
  value: unknown,
  loopbackOrigin: unknown,
): boolean;

export function productionAssetRelativePath(
  requestUrl: unknown,
): string | undefined;

export function createTitleTransitionArtifactDirectory(
  now?: Date,
): Promise<string>;

export function createProductionDistLoopbackServer(
  distDirectory?: string,
): Promise<Readonly<{
  close: () => Promise<void>;
  origin: string;
  port: number;
}>>;

export function validateTitleGatewayGeometry(
  observation: Readonly<Record<string, unknown>>,
  probeCase: TitleTransitionFrameCase,
): Readonly<{
  alignmentErrorCssPixels: number;
  clientX: number;
  clientY: number;
  generation: number | null;
  projectionErrorCssPixels: number;
  rendererHeight: number;
  rendererWidth: number;
  sourceHeight: number;
  sourceLeft: number;
  sourceTop: number;
  sourceWidth: number;
}>;

export function validateTitleTransitionOverlayGeometry(
  observation: Readonly<Record<string, unknown>>,
  expected: Readonly<{
    direction: 'to-menu' | 'to-title';
    gatewayClientPoint: Readonly<{ x: number; y: number }>;
    input: 'pointer' | 'touch' | 'keyboard' | 'history';
    sequence: number;
  }>,
  probeCase: TitleTransitionFrameCase,
): Readonly<{
  clientErrorCssPixels: number;
  clientX: number;
  clientY: number;
  localErrorCssPixels: number;
  localX: number;
  localY: number;
}>;

export function runTitleTransitionFrameBrowserProbe(
  options?: Readonly<{ ownerOnly?: boolean }>,
): Promise<Readonly<{
  artifactDirectory: string;
  caseCount: number;
  passCount: number;
}>>;
