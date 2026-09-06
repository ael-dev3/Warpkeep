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
  requestProfile: string;
  nonce: string;
  sourceCommit: string;
  sourceTree: string;
  moduleTreeId: string;
  dependencyClosureDigest: string;
}>): Readonly<Record<string, unknown>>;
