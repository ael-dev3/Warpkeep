export type Keep04ProbeCase = Readonly<{ id: string; scenario: string; quality: string; width: number; height: number; url: string; cpuRate: number; frameP95Ms: number }>;
export const KEEP04_QA_ORIGIN: 'http://127.0.0.1:4176';
export type Keep04ProbeSession = { command: (method: string, parameters?: Record<string, unknown>) => Promise<unknown> };
export function keep04ProbePlan(args: readonly string[]): { cases: readonly Keep04ProbeCase[] };
export function readKeep04ProbeDom(entry: Keep04ProbeCase): unknown;
export function waitForKeep04ProbeObservation(session: Keep04ProbeSession, entry: Keep04ProbeCase, navigation: { frameId: string; loaderId: string }): Promise<unknown>;
export function runKeep04BrowserProbe(session: Keep04ProbeSession): Promise<unknown>;
