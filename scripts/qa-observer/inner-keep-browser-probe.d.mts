export type InnerKeepQaScreenshotViewport = Readonly<{
  width: number;
  height: number;
}>;

export function analyzeInnerKeepQaScreenshot(
  value: string,
  viewport: InnerKeepQaScreenshotViewport
): Readonly<{
  distinctColourBuckets: number;
  luminanceRange: number;
  averageSaturationBasisPoints: number;
  saturationP95BasisPoints: number;
  clippedBlackSamples: number;
  clippedWhiteSamples: number;
  coolHighAlbedoSamples: number;
  coolSpatialBuckets: readonly number[];
  warmLowGreenSamples: number;
  warmSpatialBuckets: readonly number[];
  hotYellowSamples: number;
  opaqueSamples: number;
  sampleCount: number;
}>;

export function assertInnerKeepQaScreenshotWindow(
  beforeValue: unknown,
  afterValue: unknown,
  expectedScenarioId: string,
  phase?: 'steady' | 'reveal' | 'completed'
): Readonly<{
  activeConversationCount: number;
  quality: 'high' | 'balanced' | 'reduced';
  scenario: string;
}>;

export function runInnerKeepBrowserProbe(options?: Readonly<{
  onEvidence?: (value: Readonly<{
    scenario: string;
    renderMode: 'webgl' | 'fallback';
    responsive: boolean;
  }>) => void;
}>): Promise<number>;
