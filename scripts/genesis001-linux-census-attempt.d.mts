export const GENESIS_001_LINUX_CENSUS_COMPLETE_PROFILE: 'warpkeep-g001-linux-census-complete-v1';
export type Genesis001LinuxCensusSample = Readonly<{
  schemaVersion: 1; profile: 'warpkeep-sealed-realms-g001-census-private-v1'; sourceCommit: string;
  applicant: Readonly<Record<string, any>>;
  admitted: import('./genesis001-admitted-player-census.mjs').Genesis001AdmittedPlayerCensusPrivateReceipt;
  observedAt: string;
}>;
export function createGenesis001LinuxCensusSample(value: unknown, sourceCommit: string): Genesis001LinuxCensusSample;
export function validateGenesis001LinuxCensusPair(first: unknown, second: unknown, sourceCommit: string): Readonly<{
  first: Genesis001LinuxCensusSample; second: Genesis001LinuxCensusSample;
}>;
export function createGenesis001LinuxCensusAttempt(value: unknown, execution: unknown, completedAt: string): Readonly<Record<string, any>>;
export function verifyGenesis001LinuxCensusAttempt(value: unknown): Readonly<Record<string, any>>;
export function retainGenesis001LinuxCensusRecord(root: string, basename: 'first.json' | 'second.json' | 'complete.json', value: unknown): void;
export function verifyGenesis001LinuxCensusRetainedSamples(root: string, first: unknown, second: unknown, sourceCommit: string): void;
