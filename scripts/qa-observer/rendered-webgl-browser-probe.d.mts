import type { ChildProcess } from 'node:child_process';

export const RENDERED_WEBGL_QA_CHROME:
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const RENDERED_WEBGL_QA_CHROME_APP: '/Applications/Google Chrome.app';
export const RENDERED_WEBGL_QA_CHROME_TEAM_ID: 'EQHXZ8M8AV';
export const RENDERED_WEBGL_QA_CASE_COUNT: 14;
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_COUNT: 312;
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_PRESENCES: 400;
export const RENDERED_WEBGL_QA_OCCUPANCY_STRESS_MAXIMUM_CONTROLS: 24;
/** Exact authoritative terrain count for the Genesis generation-v3 render target. */
export const RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT: 10000;
/** Exact visible terrain-kind count after canonical no-lake revision activation. */
export const RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT: 6;
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

export function isBenignStaleFetchInterceptionError(
  method: string,
  value: unknown
): boolean;

export function controlledRendererRecoveryWarningKind(
  entry: unknown,
  loopbackOrigin: string,
  profileDirectory: string
): 'stale-context-object-delete' | 'stale-context-warning-throttle' | null;

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
    | 'mobile-balanced-worker-active'
    | 'short-landscape-explore'
    | 'short-landscape-balanced-player-explore'
    | 'desktop-balanced-occupancy-stress';
  expectedQuality: RenderedWebglBrowserProbeQuality;
  expectedReducedMotion?: true;
  expectedPresentationMode: RenderedWebglBrowserProbePresentationMode;
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

export function renderedWebglOccupancyStressProbeCase(
  port: number
): RenderedWebglBrowserProbeCase;

export function renderedWebglActiveWorkerProbeCase(
  port: number
): RenderedWebglBrowserProbeCase;

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
    assertProcessGroupStopped?: (pid: number) => void;
    terminateProcessGroup?: (child: ChildProcess, signal: NodeJS.Signals) => void;
    verificationMilliseconds?: number;
    verificationPollMilliseconds?: number;
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

export type RenderedWebglActiveWorkerEvidence = Readonly<{
  activeFixtureSelected: true;
  foreignMarkerGeneric: true;
  foreignPortraitReady: true;
  foreignRecordReadOnly: true;
  localReconnectRehydrated: true;
  mobileBoundsSafe: true;
  ownerCommandCenterAvailable: true;
  ownerRecallControlsAvailable: true;
  ownerRosterExact: true;
  privacyBounded: true;
  rendererContextRecovered: true;
  rendererStable: true;
}>;

export function parseRenderedWebglActiveWorkerEvidence(
  value: unknown
): RenderedWebglActiveWorkerEvidence;

export function applyRenderedWebglActiveWorkerInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<Omit<RenderedWebglActiveWorkerEvidence, 'localReconnectRehydrated'>>;

export function applyRenderedWebglActiveWorkerReconnectInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<Pick<RenderedWebglActiveWorkerEvidence, 'localReconnectRehydrated'>>;

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
  forestDecorativeTreeCount: number;
  forestDecorativeTriangleCount: number;
  forestDecorativeDrawCalls: number;
  forestDecorativeCacheEntries: number;
  forestDecorativeCacheLimit: number;
  forestDecorativeCacheHighWaterMark: number;
  forestDecorativeRepackCount: number;
  forestDecorativeModelReady: boolean;
  forestDecorativeUsingFallback: boolean;
  forestDecorativeFallbackType: 'none' | 'procedural-trunk-multi-canopy-v1';
  forestDecorativeContactShadowCount: 0;
  forestDecorativeGroundingMode:
    | 'none'
    | 'terrain-canopy'
    | 'terrain-canopy-baked-base'
    | 'terrain-canopy-procedural-root-contact';
  forestDecorativeCanopyMotionState: 'static';
  forestDecorativeCoreCellCount: number;
  forestDecorativeBodyCellCount: number;
  forestDecorativeFringeCellCount: number;
  forestDecorativeClearingCellCount: number;
  forestDecorativeSilhouetteCoverageRatio: number;
  forestDecorativeCanonicalTriangleCount: number;
  forestDecorativeOverviewHidden: boolean;
  grassInstanceCount: number;
  grassTriangleCount: number;
  grassDrawCalls: number;
  grassCacheEntries: number;
  grassCacheLimit: number;
  grassCacheHighWaterMark: number;
  grassRepackCount: number;
  grassPaletteDisplaySrgbSaturationMin: number;
  grassPaletteDisplaySrgbSaturationMax: number;
  grassShaderFallbackActive: false;
  terrainShaderEnhanced: true;
  terrainShaderFallbackActive: false;
  semanticTerrainCellCount: typeof RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_CELL_COUNT;
  semanticTerrainKindCount: typeof RENDERED_WEBGL_QA_SEMANTIC_TERRAIN_KIND_COUNT;
  semanticTerrainFeatureCount: number;
  semanticTerrainFeatureDrawCalls: number;
  totalTerrainDetailInstanceCount: number;
  totalTerrainDetailDrawCalls: number;
  rootRealmCameraMode: 'realm' | 'approach' | 'keep';
  canvasRealmCameraMode: 'realm' | 'approach' | 'keep';
  rootRealmCameraPresentationBand: 'overview' | 'strategy' | 'close';
  canvasRealmCameraPresentationBand: 'overview' | 'strategy' | 'close';
  /** Privacy-safe Explore aggregates; no coordinates or opaque identifiers. */
  exploreCoordinateJumpCount: number;
  exploreResourceSiteCount: number;
  exploreAccessibleResourceSiteCount: number;
  exploreResourceKindCount: number;
  exploreAvailableResourceSiteCount: number;
  exploreVisibleCoordinateCopyCount: number;
  exploreVisibleOpaqueCopyCount: number;
  /** Privacy-safe aggregate coverage; no castle or identity values. */
  labelEligibleCount: number;
  labelPlacedCount: number;
  labelUnplacedCount: number;
}>;

export function parseRenderedWebglActiveForestDom(
  value: unknown,
  expected: RenderedWebglBrowserProbeCase
): ReturnType<typeof parseRenderedWebglBrowserDom>;

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

/** Structural gesture evidence only; no castle or identity value crosses the QA boundary. */
export function parseRenderedWebglMapGestureEvidence(value: unknown): Readonly<{
  dragMoved: true;
  inertiaPolicyValid: true;
  inertiaSettled: true;
  inputClean: true;
  rendererGenerationStable: true;
  selectionStable: true;
  settled: true;
  uiStable: true;
  wheelMoved: true;
}>;

export function parseRenderedWebglPresentationBandEvidence(value: unknown): Readonly<{
  cameraSynchronized: true;
  closeHierarchySimplified: true;
  noUiChurn: true;
  overviewMacroOnly: true;
  overviewOwnIdentityRetained: true;
  overviewPeerIdentitySimplified: true;
  sceneStable: true;
  strategyHierarchyExpanded: true;
  visitedAllBands: true;
}>;

export function parseRenderedWebglViewportRotationEvidence(value: unknown): Readonly<{
  cameraIntentPreserved: true;
  compositionUsable: true;
  focusPreserved: true;
  inertiaCancelled: true;
  rendererStable: true;
  sameCanvas: true;
  selectionPreserved: true;
  viewportRotated: true;
}>;

/** Structural local-QA evidence only; it never includes a castle or identity value. */
export function parseRenderedWebglInspectorLabelActivationEvidence(value: unknown): Readonly<{
  inspectorLabelActivated: true;
}>;

export type RenderedWebglResourceOccupantEvidence = Readonly<{
  cameraNeutral: boolean;
  cameraNeutralAfterClose: boolean;
  cameraAnchorPopulationValid: boolean;
  cameraIndependentAnchorCoverage: boolean;
  cameraNeutralWhileOpen: boolean;
  compactOverviewCullingValid: boolean;
  factsCorrect: true;
  focusedControlActivation: true;
  identityRecordCorrect: true;
  identityRoleCorrect: true;
  identityTitleCorrect: true;
  identityUsernameCorrect: true;
  keyboardControlCountBounded: true;
  layeringValid: true;
  markerControlVisible: true;
  markerGeometryValid: true;
  markerPortraitReady: true;
  markerPortraitElementPresent: true;
  markerPresent: true;
  markerProjectedVisible: true;
  markerHitTestable: true;
  overviewPresenceDirectHit: boolean;
  overviewRecordCorrect: boolean;
  overviewTargetPassiveOnly: boolean;
  presenceComputedVisible: boolean;
  presenceAvatarGeometryValid: boolean;
  presenceGeometryValid: boolean;
  presenceDelegatedActivation: boolean;
  presenceHitTestable: boolean;
  presencePointerActivatable: boolean;
  presencePortraitElementPresent: boolean;
  presencePortraitReady: boolean;
  presenceVisible: boolean;
  privacyBounded: true;
  recordHeaderCorrect: true;
  reducedMotionPreferenceCorrect: true;
  publicRecordCorrect: true;
  publicRecordOpened: true;
  rendererStable: true;
  workerRecordCorrect: true;
}>;

/** Boolean-only local proof; no public record value or private identity data crosses the boundary. */
export function parseRenderedWebglResourceOccupantEvidence(
  value: unknown
): RenderedWebglResourceOccupantEvidence;

export type RenderedWebglOccupancyStressEvidence = Readonly<{
  allNodeSourceCountExact: true;
  allResourceKindsExercised: true;
  controlBudgetBounded: true;
  fixtureSelected: true;
  legacySourceCorrect: true;
  portraitPipelineReady: true;
  presenceBudgetBounded: true;
  rendererStable: true;
  rovingTabStopBounded: true;
  uniqueVisibleKeys: true;
}>;

/** Boolean-only dense synthetic-fixture evidence. */
export function parseRenderedWebglOccupancyStressEvidence(
  value: unknown
): RenderedWebglOccupancyStressEvidence;

/** Structural keyboard evidence only; it never includes a castle or identity value. */
export function parseRenderedWebglLabelKeyboardEvidence(value: unknown): Readonly<{
  arrowMoved: true;
  endReached: true;
  homeReached: true;
  singleTabStop: true;
}>;

export type RenderedWebglCastleCanvasPointerSession = Readonly<{
  command: (
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
}>;

export function applyRenderedWebglActiveForestCameraInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<Readonly<{ wheelStepCount: 5 }>>;

export function applyRenderedWebglCastleCanvasInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<Readonly<{ pointerMoveCount: 5 }>>;

export function applyRenderedWebglMapGestureInteraction(
  session: RenderedWebglCastleCanvasPointerSession,
  expectedReducedMotion?: boolean,
): Promise<Readonly<{
  dragMoved: true;
  inertiaPolicyValid: true;
  inertiaSettled: true;
  inputClean: true;
  rendererGenerationStable: true;
  selectionStable: true;
  settled: true;
  uiStable: true;
  wheelMoved: true;
}>>;

export function applyRenderedWebglPresentationBandInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<ReturnType<typeof parseRenderedWebglPresentationBandEvidence>>;

export function applyRenderedWebglViewportRotationInteraction(
  session: RenderedWebglCastleCanvasPointerSession,
  probeCase: RenderedWebglBrowserProbeCase,
  state: Readonly<Record<string, unknown>>,
): Promise<ReturnType<typeof parseRenderedWebglViewportRotationEvidence>>;

export function applyRenderedWebglLabelKeyboardInteraction(
  session: RenderedWebglCastleCanvasPointerSession
): Promise<Readonly<{
  arrowMoved: true;
  endReached: true;
  homeReached: true;
  singleTabStop: true;
}>>;

export type RenderedWebglBrowserProbeInteractionEvidence = Readonly<{
  inspectorLabelActivated?: true;
}>;

export function applyRenderedWebglCaseInteraction(
  session: RenderedWebglCastleCanvasPointerSession,
  interaction: RenderedWebglBrowserProbeInteraction,
  presentationMode?: RenderedWebglBrowserProbePresentationMode,
): Promise<RenderedWebglBrowserProbeInteractionEvidence>;

export function applyRenderedWebglResourceOccupantInteraction(
  session: RenderedWebglCastleCanvasPointerSession,
  presentationMode: RenderedWebglBrowserProbePresentationMode,
  expectedReducedMotion?: boolean,
): Promise<RenderedWebglResourceOccupantEvidence>;

export function applyRenderedWebglOccupancyStressInteraction(
  session: RenderedWebglCastleCanvasPointerSession,
): Promise<RenderedWebglOccupancyStressEvidence>;

export function analyzeRenderedWebglPngScreenshot(
  value: Buffer,
  viewport: Readonly<{ width: number; height: number }>
): Readonly<{
  distinctColourBuckets: number;
  luminanceRange: number;
  averageSaturationBasisPoints: number;
  saturationP95BasisPoints: number;
  clippedBlackSamples: number;
  clippedWhiteSamples: number;
  opaqueSamples: number;
  sampleCount: number;
}>;

export type RenderedWebglQualityMetrics = Readonly<{
  cameraMode: 'realm' | 'approach' | 'keep';
  cameraProjectionCount: number;
  cameraProjectionToken: string;
  cameraStateToken: string;
  cameraSynchronized: true;
  cameraTargetKind:
    | 'realm'
    | 'founding-district'
    | 'keep'
    | 'cell'
    | 'cell-location'
    | 'castle'
    | 'castle-location';
  cameraZoom: string;
  decorativeForestCacheEntries: number;
  decorativeForestCacheHighWaterMark: number;
  decorativeForestCacheLimit: number;
  decorativeForestDrawCalls: number;
  decorativeForestInstances: number;
  decorativeForestMotionState: 'static';
  decorativeForestTriangles: number;
  grassAnimated: boolean;
  grassTargetAnimationCadence: number;
  grassCacheEntries: number;
  grassCacheHighWaterMark: number;
  grassCacheLimit: number;
  grassDrawCalls: number;
  grassInstances: number;
  grassTriangles: number;
  presentationBand: 'overview' | 'strategy' | 'close';
  quality: 'high' | 'balanced' | 'reduced';
  routeDrawCalls: number;
  routeSegments: number;
  routeTriangles: number;
  routeVisible: number;
  sharedForestInstances: number;
  sharedForestTriangles: number;
  terrainDetailDrawCalls: number;
  terrainDetailInstances: number;
  terrainTriangles: number;
  viewportHeight: number;
  viewportWidth: number;
  waterDrawCalls: number;
  waterTriangles: number;
  workerAnimated: number;
  workerAnimationTransitions: number;
  workerFallbackTriangles: number;
  workerModels: number;
  workerPresented: number;
}>;

export function parseRenderedWebglQualityMetrics(
  value: unknown
): RenderedWebglQualityMetrics;

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
  onQualityMetrics?: (metrics: RenderedWebglQualityMetrics) => void;
}>): Promise<14>;
