import type { ChildProcess } from 'node:child_process';

export const RENDERED_WEBGL_QA_CHROME:
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export type RenderedWebglBrowserProbeQuality = 'high' | 'balanced' | 'reduced';

export type RenderedWebglBrowserProbeCase = Readonly<{
  id: 'high' | 'balanced' | 'reduced' | 'invalid-fallback';
  expectedQuality: RenderedWebglBrowserProbeQuality;
  url: string;
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

export function runRenderedWebglBrowserProbe(): Promise<void>;
