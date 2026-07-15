import type { ChildProcess } from 'node:child_process';

export const RENDERED_WEBGL_QA_CHROME:
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const RENDERED_WEBGL_QA_CHROME_APP: '/Applications/Google Chrome.app';
export const RENDERED_WEBGL_QA_CHROME_TEAM_ID: 'EQHXZ8M8AV';

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
export type RenderedWebglBrowserProbeInteraction =
  | 'default'
  | 'inspector'
  | 'explore'
  | 'cluster';

export type RenderedWebglBrowserProbeCase = Readonly<{
  id:
    | 'desktop-high'
    | 'desktop-balanced'
    | 'desktop-balanced-cluster'
    | 'desktop-reduced'
    | 'desktop-invalid-fallback'
    | 'mobile-balanced'
    | 'mobile-reduced-inspector'
    | 'short-landscape-explore';
  expectedQuality: RenderedWebglBrowserProbeQuality;
  interaction: RenderedWebglBrowserProbeInteraction;
  minimumLabelCount: number;
  /** Confirms a real cluster control existed immediately before activation. */
  clusterButtonCountBefore?: number;
  /** Confirms that control represented at least one castle before activation. */
  clusterMemberCountBefore?: number;
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
    stdio: 'ignore';
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

export function parseDevtoolsActivePort(value: string): Readonly<{
  port: number;
  browserPath: string;
}>;

export function selectBlankPageTarget(value: unknown, devtoolsPort: number): Readonly<{
  targetId: string;
  webSocketDebuggerUrl: string;
}>;

export function isAllowedRenderedWebglPageUrl(value: unknown, loopbackOrigin: string): boolean;

export function parseRenderedWebglBrowserDom(
  value: unknown,
  expected: RenderedWebglBrowserProbeCase
): Readonly<{
  version: 1;
  fixture: 'synthetic-canonical-100';
  renderer: 'webgl';
  quality: RenderedWebglBrowserProbeQuality;
  castleCount: 100;
  readyAfterMilliseconds: number;
}>;

export function analyzeRenderedWebglPngScreenshot(
  value: Buffer,
  viewport: Readonly<{ width: number; height: number }>
): Readonly<{
  distinctColourBuckets: number;
  luminanceRange: number;
  opaqueSamples: number;
  sampleCount: number;
}>;

export function runRenderedWebglBrowserProbe(): Promise<void>;
