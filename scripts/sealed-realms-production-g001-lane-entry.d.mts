import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

export class SealedRealmsProductionG001LaneError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsG001LaunchAuthority: unique symbol;
export type SealedRealmsProductionG001LaunchAuthority = Readonly<{
  readonly [sealedRealmsG001LaunchAuthority]: true;
}>;

declare const sealedRealmsG001CurrentStateTestAdapter: unique symbol;
export type SealedRealmsProductionG001CurrentStateTestAdapter = Readonly<{
  readonly [sealedRealmsG001CurrentStateTestAdapter]: true;
}>;

declare const sealedRealmsG001CurrentStateReceipt: unique symbol;
export type SealedRealmsProductionG001CurrentStateReceipt = Readonly<{
  readonly [sealedRealmsG001CurrentStateReceipt]: true;
}>;

declare const sealedRealmsG001CensusAuthority: unique symbol;
export type SealedRealmsProductionG001CensusAuthority = Readonly<{
  readonly [sealedRealmsG001CensusAuthority]: true;
}>;

export type SealedRealmsFixedChildRequest = Readonly<{
  file: '/usr/bin/git' | '/bin/launchctl' | '/usr/bin/plutil';
  args: readonly string[];
  shell: false;
  env: Readonly<Record<string, string>>;
  input?: Uint8Array;
}>;

export type SealedRealmsFixedChildResult = Readonly<{
  status: number;
  stdout: string;
  stderr: string;
}>;

export type SealedRealmsG001CurrentStateConfiguration = Readonly<{
  runChild: (request: SealedRealmsFixedChildRequest) => SealedRealmsFixedChildResult
    | Promise<SealedRealmsFixedChildResult>;
  readFixedFile: (request: Readonly<{ kind: 'plist' | 'program'; path: string }>) => Readonly<{
    kind: 'plist' | 'program';
    path: string;
    body: Uint8Array;
    identity: Readonly<{
      dev: number;
      ino: number;
      uid: number;
      mode: number;
      nlink: number;
      size: number;
      mtimeNs: number;
      ctimeNs: number;
      realpath: string;
    }>;
  }>;
  resolveAccountUid: () => number;
  resolveAccountHome: () => string;
  testOnlyAdapter?: SealedRealmsProductionG001CurrentStateTestAdapter;
}>;

export function createSealedRealmsProductionG001CurrentStateTestAdapter(input: Readonly<{
  hashFixedFile: (input: Readonly<{ kind: 'plist' | 'program'; bytes: Uint8Array }>) => string;
}>): SealedRealmsProductionG001CurrentStateTestAdapter;

export function createSealedRealmsProductionG001LaunchAuthority(input: Readonly<{
  readRawGit: (args: readonly string[]) => string | Uint8Array | Promise<string | Uint8Array>;
  resolveAdminSecretPath: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    sourceCommit: string;
    path: string;
  }> | Promise<Readonly<{
    sourceCommit: string;
    path: string;
  }>>;
  persistPolicyObservation: (input: Readonly<{
    sourceCommit: string;
    bytes: Uint8Array;
  }>) => unknown | Promise<unknown>;
}>): SealedRealmsProductionG001LaunchAuthority;

export function createSealedRealmsProductionG001CensusAuthority(input: Readonly<{
  privateState: import('./sealed-realms-production-private-state.mjs').SealedRealmsProductionPrivateState;
  collect: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    applicant: object;
    admitted: object;
  }> | Promise<Readonly<{
    applicant: object;
    admitted: object;
  }>>;
  suspend: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  now: () => Date;
}>): SealedRealmsProductionG001CensusAuthority;

export function inspectSealedRealmsProductionG001CurrentState(input: Readonly<{
  authority: SealedRealmsProductionSourceAuthority;
  runChild: SealedRealmsG001CurrentStateConfiguration['runChild'];
  readFixedFile: SealedRealmsG001CurrentStateConfiguration['readFixedFile'];
  resolveAccountUid: SealedRealmsG001CurrentStateConfiguration['resolveAccountUid'];
  resolveAccountHome: SealedRealmsG001CurrentStateConfiguration['resolveAccountHome'];
  testOnlyAdapter?: SealedRealmsProductionG001CurrentStateTestAdapter;
}>): Promise<Readonly<{
  status: 'current-state-inspected';
  confirmation: SealedRealmsProductionG001CurrentStateReceipt;
}>>;

export function assertSealedRealmsProductionG001CurrentStateReceipt(
  receipt: unknown,
  authority: SealedRealmsProductionSourceAuthority,
): SealedRealmsProductionG001CurrentStateReceipt;

export function createSealedRealmsProductionG001Lane(input: Readonly<{
  launchAuthority: SealedRealmsProductionG001LaunchAuthority;
  attestDispatcherNode: () => Readonly<{
    path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node';
    version: 'v22.22.3';
    sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c';
    teamId: 'HX7739G8FX';
  }>;
  runEnvelopeChild: (request: Readonly<{
    file: '/usr/bin/env';
    args: readonly string[];
    shell: false;
    env: Readonly<Record<never, never>>;
  }>) => SealedRealmsFixedChildResult | Promise<SealedRealmsFixedChildResult>;
  censusAuthority?: SealedRealmsProductionG001CensusAuthority;
  currentState: SealedRealmsG001CurrentStateConfiguration;
  preflight: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
}>): Readonly<{
  execute: (input: Readonly<{
    operation: 'preflight' | 'g001-policy-observe' | 'g001-census-first'
      | 'g001-census-second-inspect' | 'g001-census-second-suspend' | 'g001-current-state';
    authority: SealedRealmsProductionSourceAuthority;
    input?: Readonly<{ confirmation: object }>;
  }>) => Promise<Readonly<{
    status: 'preflight-inspected' | 'completed' | 'current-state-inspected';
    confirmation?: object;
  }>>;
}>;

export function assertSealedRealmsProductionG001Lane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionG001Lane>;
