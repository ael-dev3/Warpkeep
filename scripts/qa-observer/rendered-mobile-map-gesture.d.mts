export type RenderedMobileMapGestureEvidence = Readonly<{
  inputClean: true;
  nonCastleControlExercised: true;
  panMoved: true;
  pinchZoomed: true;
  rendererStable: true;
  selectionTapped: true;
  touchEnvironmentReady: true;
  viewportExact: true;
  worldControlActivationSuppressed: true;
  worldControlsOwnTouch: true;
}>;

export type RenderedMobileMapGestureProbeCase = Readonly<{
  id: 'iphone-chromium-emulation' | 'android-chromium-emulation';
  expectedPresentationMode: 'player';
  expectedQuality: 'balanced';
  interaction: 'default';
  maximumLabelOverflowCount: 0;
  minimumLabelCount: 4;
  url: string;
  viewport: Readonly<{ width: number; height: number }>;
  deviceScaleFactor: number;
}>;

export function parseRenderedMobileMapGestureEvidence(
  value: unknown
): RenderedMobileMapGestureEvidence;

export function renderedMobileMapGestureProbeCases(
  port: number
): readonly RenderedMobileMapGestureProbeCase[];

export function applyRenderedMobileMapGestureInteraction(
  session: Readonly<{
    command: (
      method: string,
      params?: Readonly<Record<string, unknown>>,
      timeoutMilliseconds?: number
    ) => Promise<unknown>;
  }>,
  probeCase: RenderedMobileMapGestureProbeCase
): Promise<RenderedMobileMapGestureEvidence>;
