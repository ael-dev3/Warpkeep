export const QA_JOURNEY_BROWSER_DIRECT_CASE_COUNT: 22;
export const QA_JOURNEY_BROWSER_RESPONSIVE_CASE_COUNT: 2;
export const QA_JOURNEY_BROWSER_FLOW_STAGE_COUNT: 15;

export function isAllowedQaJourneyResourceUrl(value: unknown): boolean;

export type QaJourneyBrowserProbeCase = Readonly<{
  id: string;
  kind: 'direct' | 'responsive';
  scenario: import('../../src/dev/qaJourneyScenarioManifest.mjs').QaJourneyScenarioManifestId;
  expectedExternalAnchorCount: 0 | 1 | 2;
  landmark: Readonly<{
    role: 'dialog' | 'heading' | 'main' | 'navigation' | 'region';
    name: string;
  }>;
  screenshot: boolean;
  url: string;
  viewport: Readonly<{ width: number; height: number }>;
}>;

export function qaJourneyBrowserProbeCases(port: number): readonly QaJourneyBrowserProbeCase[];

export function parseQaJourneyDirectObservation(
  value: unknown,
  expected: QaJourneyBrowserProbeCase,
): Readonly<{ scenario: string; responsive: boolean }>;

export function parseQaJourneyFlowObservation(
  value: unknown,
  stage:
    | 'menu'
    | 'initial-terms'
    | 'creating'
    | 'awaiting'
    | 'verifying'
    | 'pending'
    | 'admitted'
    | 'final-terms'
    | 'realm'
    | 'realm-menu'
    | 'realm-settings'
    | 'realm-menu-after-settings'
    | 'realm-explore'
    | 'realm-menu-return'
    | 'returned-menu',
  expectedHref: string,
): Readonly<{ stage: string }>;

export function parseQaJourneyMenuSurfaceObservation(
  value: unknown,
  stage:
    | 'patch-open'
    | 'patch-closed'
    | 'settings-open'
    | 'settings-closed'
    | 'credits-open'
    | 'credits-reading'
    | 'credits-closed',
  expectedHref: string,
  viewport: Readonly<{ width: number; height: number }>,
): Readonly<{ stage: string }>;

export function runQaJourneyBrowserCases(
  session: Readonly<{ command(method: string, params?: unknown): Promise<unknown> }>,
  cases: readonly QaJourneyBrowserProbeCase[],
  state: Readonly<{ violation: string; allowedUrls: Set<string> }>,
): Promise<25>;
