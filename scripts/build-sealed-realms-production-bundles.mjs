import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build as esbuild } from 'esbuild';

import { assertSealedRealmsProductionPrivateState } from
  './sealed-realms-production-private-state.mjs';
import {
  buildSealedRealmOperationBundle,
  SealedRealmsProductionBundlesError,
} from './sealed-realms-production-bundle-engine.mjs';

export { SealedRealmsProductionBundlesError };

const EXPECTED_NODE = Object.freeze({
  path: '/private/var/db/warpkeep/runtime/node-v22.22.3-darwin-arm64/bin/node',
  version: 'v22.22.3',
  sha256: '5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c',
  teamId: 'HX7739G8FX',
});
const EXPECTED_BUILD = Object.freeze({
  profile: 'warpkeep-sealed-realms-pinned-esbuild-v1',
  node: EXPECTED_NODE,
  tool: 'esbuild',
  version: '0.28.1',
});
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '..');
const EMPTY_ENVIRONMENT = Object.freeze({});
const buildCapabilities = new WeakMap();
const LANES = Object.freeze(['activation', 'g001', 'g002', 'ptr']);

function fail(code) { throw new SealedRealmsProductionBundlesError(code); }

function exactObject(value, keys, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
  return value;
}

function exactNode(value, code) {
  exactObject(value, ['path', 'version', 'sha256', 'teamId'], code);
  if (JSON.stringify(value) !== JSON.stringify(EXPECTED_NODE)) fail(code);
}

function validateBuildAttestation(value) {
  exactObject(value, ['profile', 'node', 'tool', 'version'], 'SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  exactNode(value.node, 'SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  if (
    value.profile !== EXPECTED_BUILD.profile || value.tool !== EXPECTED_BUILD.tool
    || value.version !== EXPECTED_BUILD.version
  ) fail('SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
}

/** Captures the fixed preinstalled build environment before any graph is read. */
export function createSealedRealmsProductionBundleBuildCapability(input) {
  const options = exactObject(input, ['attest'], 'SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  if (typeof options.attest !== 'function') fail('SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID');
  let attestation;
  try { attestation = options.attest(); } catch { fail('SEALED_REALMS_BUNDLES_BUILD_AUTHORITY_INVALID'); }
  validateBuildAttestation(attestation);
  const capability = Object.freeze({});
  buildCapabilities.set(capability, Object.freeze(attestation));
  return capability;
}

async function buildLane(lane) {
  return buildSealedRealmOperationBundle({ lane, sourceRoot: REPOSITORY_ROOT, build: esbuild });
}
function validateLoadAttestation(value, expected) {
  exactObject(value, [
    'node', 'lane', 'byteDigest', 'sourceClosureDigest', 'loaded', 'byteLength',
    'exportNames', 'factoryExport', 'factoryKind', 'factoryFailureCode',
  ], 'SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
  exactNode(value.node, 'SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
  if (
    value.lane !== expected.lane || value.byteDigest !== expected.byteDigest
    || value.sourceClosureDigest !== expected.sourceClosureDigest || value.loaded !== true
    || value.byteLength !== expected.bytes.byteLength
    || JSON.stringify(value.exportNames) !== JSON.stringify(expected.exportNames)
    || value.factoryExport !== expected.factoryExport || value.factoryKind !== 'function'
    || value.factoryFailureCode !== expected.factoryFailureCode
  ) fail('SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
}

export async function buildSealedRealmsProductionBundles(input = {}) {
  const options = exactObject(
    input, ['privateState', 'buildCapability', 'loadHook'], 'SEALED_REALMS_BUNDLES_INPUT_INVALID',
  );
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  if (!buildCapabilities.has(options.buildCapability) || typeof options.loadHook !== 'function') {
    fail('SEALED_REALMS_BUNDLES_INPUT_INVALID');
  }
  const artifacts = [];
  try {
    for (const lane of LANES) {
      const first = await buildLane(lane);
      const second = await buildLane(lane);
      if (
        first.byteDigest !== second.byteDigest
        || first.sourceClosureDigest !== second.sourceClosureDigest
        || JSON.stringify(first.graphManifest) !== JSON.stringify(second.graphManifest)
        || !first.bytes.equals(second.bytes)
      ) fail('SEALED_REALMS_BUNDLES_NONDETERMINISTIC');
      second.bytes.fill(0);
      artifacts.push(first);
    }
    for (const artifact of artifacts) {
      let loaded;
      try {
        loaded = await options.loadHook(Object.freeze({
          file: EXPECTED_NODE.path,
          args: Object.freeze(['--input-type=module', '--eval']),
          shell: false,
          env: EMPTY_ENVIRONMENT,
          lane: artifact.lane,
          basename: artifact.basename,
          bytes: Buffer.from(artifact.bytes),
          byteDigest: artifact.byteDigest,
          sourceClosureDigest: artifact.sourceClosureDigest,
          graphManifest: artifact.graphManifest,
          exportNames: artifact.exportNames,
          factoryExport: artifact.factoryExport,
          factoryFailureCode: artifact.factoryFailureCode,
        }));
      } catch (error) {
        if (error instanceof SealedRealmsProductionBundlesError) throw error;
        fail('SEALED_REALMS_BUNDLES_LOAD_HOOK_INVALID');
      }
      validateLoadAttestation(loaded, artifact);
    }
    try {
      privateState.writeFamily({
        root: 'cache',
        relativeDirectory: 'bundles',
        members: artifacts.map(artifact => Object.freeze({
          basename: artifact.basename, bytes: artifact.bytes,
        })),
      });
    } catch (error) {
      if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FAMILY_EXISTS'
        || error?.code === 'SEALED_REALMS_PRIVATE_STATE_FAMILY_BUSY') {
        fail('SEALED_REALMS_BUNDLES_ALREADY_PUBLISHED');
      }
      fail('SEALED_REALMS_BUNDLES_EMIT_FAILED');
    }
    return Object.freeze({ lanes: Object.freeze([...LANES]) });
  } finally {
    for (const artifact of artifacts) artifact.bytes.fill(0);
  }
}
