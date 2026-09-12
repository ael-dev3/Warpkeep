import type { LocalBindingFileIdentity } from './local-binding-bounded-file.mjs';

export function preserveLocalBindingWorkerBundle(input: Readonly<{
  bundlePath: string;
  handoffRoot: string;
  handoffPath: string;
}>): Readonly<{
  path: string;
  sha256: string;
  byteLength: number;
  identity: LocalBindingFileIdentity;
  bytes: Uint8Array;
}>;

export function createLocalBindingWorkerResult(input: Readonly<{
  bundlePath: string;
  handoffRoot: string;
  handoffPath: string;
  requestProfile: 'warpkeep-local-binding-worker-v1'
    | 'warpkeep-local-binding-genesis002-worker-v1'
    | 'warpkeep-local-binding-genesis001-worker-v1'
    | 'warpkeep-local-binding-genesis001-current-worker-v1';
  nonce: string;
  sourceCommit: string;
  sourceTree: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
}>): Readonly<Record<string, unknown>>;
