import type { ChildProcess } from 'node:child_process';

export const RENDERED_WEBGL_QA_CHROME:
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const RENDERED_WEBGL_QA_CHROME_APP: '/Applications/Google Chrome.app';
export const RENDERED_WEBGL_QA_CHROME_TEAM_ID: 'EQHXZ8M8AV';
export const RENDERED_WEBGL_QA_CASE_COUNT: 14;
export const RENDERED_WEBGL_QA_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS: 0;
export const RENDERED_WEBGL_QA_LABEL_COORDINATE_SERIALIZATION_EPSILON_PIXELS: 0.015;
/** Vite 8 default deny patterns plus the local asset-cache boundary. */
export const RENDERED_WEBGL_QA_VITE_FS_DENY: readonly [
  '.env',
  '.env.*',
  '*.{crt,pem}',
  '**/.git/**',
  '**/.cache/**'
];

export function renderedWebglLabelAnchorDistanceTelemetry(distance: number): Readonly<{
  reportedDistance: number;
  violation: boolean;
}>;

export function renderedWebglLabelDisplacementClassificationValid(
  distance: number,
  markedDisplaced: boolean
): boolean;

export function parseHeadlessChromeCodeSignature(value: unknown): Readonly<{
  executable: typeof RENDERED_WEBGL_QA_CHROME;
  identifier: 'com.google.Chrome';
  teamIdentifier: typeof RENDERED_WEBGL_QA_CHROME_TEAM_ID;
}>;

export function attestHeadlessChromeCodeSignature(options?: Readonly<{
  execFileAsync?: (
    executable: string,
    arguments_: readonly string[],
    options: Readonly<Record<string, unknown>>
  ) => Promise<Readonly<{ stdout?: string; stderr?: string }>>;
}>): Promise<Readonly<{
  executable: typeof RENDERED_WEBGL_QA_CHROME;
  identifier: 'com.google.Chrome';
  teamIdentifier: typeof RENDERED_WEBGL_QA_CHROME_TEAM_ID;
}>>;

export type RenderedWebglBrowserProbeQuality = 'high' | 'balanced' | 'reduced';
export type RenderedWebglBrowserProbePresentationMode = 'observer' | 'player';
export type RenderedWebglBrowserProbeInteraction =
  | 'default'
  | 'inspector'
  | 'explore';
export type RenderedWebglBrowserProbeControlState = 'visible' | 'hidden' | 'absent';

export type RenderedWebglBrowserProbeCase = Readonly<{
  id:
    | 'desktop-high'
    | 'desktop-balanced'
    | 'full-hd-balanced'
    | 'tablet-balanced-inspector'
    | 'tablet-balanced-player-inspector'
    | 'mobile-balanced-persistent-labels'
    | 'desktop-reduced'
    | 'desktop-invalid-fallback'
    | 'desktop-balanced-player'
    | 'mobile-balanced-player'
    | 'mobile-balanced'
    | 'mobile-reduced-inspector'
    | 'short-landscape-explore'
    | 'short-landscape-balanced-player-explore';
  expectedQuality: RenderedWebglBrowserProbeQuality;
  expectedPresentationMode: RenderedWebglBrowserProbePresentationMode;
  /** Strict player HUD state required after a constrained interactive surface opens. */
  expectedPlayerActionControlState?: RenderedWebglBrowserProbeControlState;
  interaction: RenderedWebglBrowserProbeInteraction;
  /** Must remain zero: every projection-visible castle has a direct label. */
  maximumLabelOverflowCount: number;
  minimumLabelCount: number;
  url: string;
  viewport: Readonly<{ width: number; height: number }>;
}>;

export type HeadlessChromeProbeContract = Readonly<{
  executable: typeof RENDERED_WEBGL_QA_CHROME;
  args: readonly string[];
  options: Readonly<{
    cwd: string;
    detached: true;
    env: Readonly<Record<string, string>>;
    shell: false;
    stdio: readonly ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'];
    windowsHide: true;
  }>;
}>;

export function renderedWebglBrowserProbeCases(
  port: number
): readonly RenderedWebglBrowserProbeCase[];

export function headlessChromeProbeContract(profileDirectory: string): HeadlessChromeProbeContract;

export function spawnHeadlessChromeProbe(
  profileDirectory: string,
  options?: Readonly<{
    spawnProcess?: (...arguments_: Parameters<typeof import('node:child_process').spawn>) => ChildProcess;
  }>
): ChildProcess;

export function terminateHeadlessChromeProcessGroup(
  child: ChildProcess | undefined,
  options?: Readonly<{
    terminateProcessGroup?: (child: ChildProcess, signal: NodeJS.Signals) => void;
    wait?: (milliseconds: number) => Promise<unknown>;
  }>
): Promise<void>;

/** Attempts all cleanup actions even if one rejects, then rethrows the first failure. */
export function cleanupRenderedWebglProbeResources(options?: Readonly<{
  castleLodVisualSource?: unknown;
  chrome?: ChildProcess;
  devtools?: Readonly<{ close(): unknown }>;
  disposeCastleLodVisualEvidenceSource?: (source: unknown) => unknown;
  removeProfile?: () => unknown;
  terminate?: (child: ChildProcess | undefined) => unknown;
  vite?: Readonly<{ close(): unknown }>;
}>): Promise<void>;

/** Closes all accepted HTTP/HMR sockets before awaiting the loopback listener. */
export function closeRenderedWebglLoopbackServer(options: Readonly<{
  httpServer: Readonly<{
    close(callback: (error?: Error) => void): unknown;
    closeAllConnections(): unknown;
  }>;
  sockets: Iterable<Readonly<{ destroy(): unknown }>>;
  vite: Readonly<{ close(): unknown }>;
}>): Promise<void>;

export function selectBlankPageTarget(value: unknown): Readonly<{
  targetId: string;
}>;

export class DevtoolsPipeSession {
  constructor(
    child: ChildProcess,
    eventHandler?: (
      method: string,
      params: Readonly<Record<string, unknown>>,
      session: DevtoolsPipeSession,
    ) => void,
  );
  open(): Promise<void>;
  browserCommand(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    timeoutMilliseconds?: number,
  ): Promise<Readonly<Record<string, unknown>>>;
  command(
    method: string,
    params?: Readonly<Record<string, unknown>>,
    timeoutMilliseconds?: number,
  ): Promise<Readonly<Record<string, unknown>>>;
  attachToPage(targetId: string): Promise<string>;
  close(): void;
}

export function isAllowedRenderedWebglPageUrl(value: unknown, loopbackOrigin: string): boolean;

export function parseRenderedWebglBrowserDom(
  value: unknown,
  expected: RenderedWebglBrowserProbeCase
): Readonly<{
  version: 1;
  fixture: 'synthetic-canonical-100';
  renderer: 'webgl';
  presentationMode: RenderedWebglBrowserProbePresentationMode;
  quality: RenderedWebglBrowserProbeQuality;
  castleCount: 100;
  readyAfterMilliseconds: number;
  environmentLighting: 'procedural';
  semanticTerrainCellCount: 1261;
  semanticTerrainKindCount: 7;
  semanticTerrainFeatureCount: number;
  semanticTerrainFeatureDrawCalls: number;
  totalTerrainDetailInstanceCount: number;
  totalTerrainDetailDrawCalls: number;
}>;

/** Bounded page coordinates only; no castle, profile, or identity data. */
export function parseRenderedWebglCastleCanvasPointerTarget(value: unknown): Readonly<{
  x: number;
  y: number;
}>;

export function parseRenderedWebglCastlePointerMoveState(value: unknown): Readonly<{
  canvasTarget: true;
  dragging: false;
  inspectorOpen: false;
  navigatorOpen: false;
  renderer: 'webgl';
  selectedCastleLabelCount: 0;
}>;

/** Structural local-QA evidence only; it never includes a castle or identity value. */
export function parseRenderedWebglInspectorLabelActivationEvidence(value: unknown): Readonly<{
  inspectorLabelActivated: true;
}>;

export type RenderedWebglCastleCanvasPointerSession = Readonly<{
  command: (
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
}>;

export function applyRenderedWebglCastleCanvasInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<Readonly<{ pointerMoveCount: 5 }>>;

export type RenderedWebglBrowserProbeInteractionEvidence = Readonly<{
  inspectorLabelActivated?: true;
}>;

export function applyRenderedWebglCaseInteraction(
  session: RenderedWebglCastleCanvasPointerSession,
  interaction: RenderedWebglBrowserProbeInteraction
): Promise<RenderedWebglBrowserProbeInteractionEvidence>;

export function analyzeRenderedWebglPngScreenshot(
  value: Buffer,
  viewport: Readonly<{ width: number; height: number }>
): Readonly<{
  distinctColourBuckets: number;
  luminanceRange: number;
  opaqueSamples: number;
  sampleCount: number;
}>;

export type RenderedWebglCastleLodVisualEvidence = Readonly<{
  renderer: 'webgl';
  targetPixels: 384;
  profiles: Readonly<Record<'high' | 'balanced' | 'compact', Readonly<{
    coverageDeltaBasisPoints: number;
    meanColorDelta: number;
    silhouetteIouBasisPoints: number;
  }>>>;
}>;

/** Status-only confirmation of the live local source-route boundary. */
export type RenderedWebglCastleLodVisualBoundary = Readonly<{
  archiveStatus: number;
  exactStatus: number;
  queryStatus: number;
}>;

export function runRenderedWebglBrowserProbe(options?: Readonly<{
  onCastleLodVisualBoundary?: (boundary: RenderedWebglCastleLodVisualBoundary) => void;
  onCastleLodVisualEvidence?: (evidence: RenderedWebglCastleLodVisualEvidence) => void;
}>): Promise<14>;
