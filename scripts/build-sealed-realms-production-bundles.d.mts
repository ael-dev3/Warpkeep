import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';

export class SealedRealmsProductionBundlesError extends Error { readonly code: string; constructor(code: string); }
export type SealedRealmsProductionBundleLane = 'activation' | 'g001' | 'g002' | 'ptr';
export type SealedRealmsProductionNode22Attestation = Readonly<{
  path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node'; version: 'v22.22.3';
  sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c'; teamId: 'HX7739G8FX';
}>;
declare const bundleBuildCapabilityBrand: unique symbol;
export type SealedRealmsProductionBundleBuildCapability = Readonly<{ [bundleBuildCapabilityBrand]: true }>;
export function createSealedRealmsProductionBundleBuildCapability(input: Readonly<{ attest: () => Readonly<{
  profile: 'warpkeep-sealed-realms-pinned-esbuild-v1'; node: SealedRealmsProductionNode22Attestation;
  tool: 'esbuild'; version: '0.28.1';
}> }>): SealedRealmsProductionBundleBuildCapability;
type GraphMember = Readonly<{ path: string; byteLength: number; sha256: string }>;
type LoadRequest = Readonly<{
  file: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node'; args: readonly ['--input-type=module', '--eval'];
  shell: false; env: Readonly<Record<never, never>>; lane: SealedRealmsProductionBundleLane; basename: string;
  bytes: Uint8Array; byteDigest: string; sourceClosureDigest: string; graphManifest: readonly GraphMember[];
  exportNames: readonly string[]; factoryExport: string; factoryFailureCode: string;
}>;
type LoadAttestation = Readonly<{
  node: SealedRealmsProductionNode22Attestation; lane: SealedRealmsProductionBundleLane; byteDigest: string;
  sourceClosureDigest: string; loaded: true; byteLength: number; exportNames: readonly string[];
  factoryExport: string; factoryKind: 'function'; factoryFailureCode: string;
}>;
export function buildSealedRealmsProductionBundles(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState; buildCapability: SealedRealmsProductionBundleBuildCapability;
  loadHook: (request: LoadRequest) => LoadAttestation | Promise<LoadAttestation>;
}>): Promise<Readonly<{ lanes: readonly ['activation', 'g001', 'g002', 'ptr'] }>>;
