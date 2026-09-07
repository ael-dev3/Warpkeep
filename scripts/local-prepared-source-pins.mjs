import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const GENERATOR = 'scripts/generate-0.4.0-sealed-launch-activation.mjs';
const VERIFIER = 'scripts/verify-0.4.0-sealed-launch.mjs';
const BOOTSTRAP = 'scripts/greater-realm-production-bootstrap.mjs';
const MAX_BYTES = 4 * 1024 * 1024;
const INLINE_PINS = [
  ['genesis002ContractSource', 'spacetimedb/genesis002/src/contract.ts', 1],
  ['genesis002AdminPolicySource', 'spacetimedb/genesis002/src/adminPolicy.ts', 1],
  ['genesis002AuthSource', 'spacetimedb/genesis002/src/auth.ts', 1],
  ['genesis002LifecycleSource', 'spacetimedb/genesis002/src/lifecycle.ts', 1],
  ['genesis002AtlasImportSource', 'spacetimedb/genesis002/src/atlasImportReducers.ts', 1],
  ['authBridgeConfigSource', 'services/auth-bridge/src/config.ts', 1],
  ['authBridgeJwtSource', 'services/auth-bridge/src/jwt.ts', 2],
  ['authBridgeSource', 'services/auth-bridge/src/app.ts', 2],
  ['genesis002PublisherCoreSource', 'scripts/genesis002-production-publisher.mjs', 1],
  ['genesis002TransportSource', 'scripts/genesis002-production-transport.ts', 1],
  ['authBridgeTypesSource', 'services/auth-bridge/src/types.ts', 1],
  ['ptrOwnerPolicySource', 'spacetimedb/ptr/src/ownerPolicy.ts', 1],
  ['ptrAuthSource', 'spacetimedb/ptr/src/auth.ts', 1],
  ['ptrAtlasImportReducersSource', 'spacetimedb/ptr/src/atlasImportReducers.ts', 1],
  ['ptrOwnerReducersSource', 'spacetimedb/ptr/src/ownerReducers.ts', 1],
  ['ptrProductionAdminTokenSource', 'scripts/ptr-production-admin-token.ts', 1],
  ['ptrProductionTransportSource', 'scripts/ptr-production-transport.ts', 1],
  ['ptrProductionImportCoreSource', 'scripts/ptr-production-import-core.ts', 1],
  ['ptrProductionReleaseReceiptsSource', 'scripts/ptr-production-release-receipts.ts', 1],
  ['ptrProductionImportOperatorSource', 'scripts/ptr-production-import-operator.ts', 1],
  ['ptrProductionReceiptFileSource', 'scripts/ptr-production-receipt-file.ts', 1],
  ['ptrOwnerProvisionOperatorSource', 'scripts/ptr-owner-provision-operator.ts', 1],
  ['ptrPublisherCoreSource', 'scripts/ptr-production-publisher.mjs', 1],
  ['ptrPublisherCliSource', 'scripts/ptr-production-publisher-cli.ts', 1],
];
const SOURCE_PINS = [
  ['SEALED_REALMS_SOURCE_AUTHORITY_SOURCE_SHA256', 'scripts/sealed-realms-production-source-authority.mjs'],
  ['SEALED_REALMS_SOURCE_AUTHORITY_DECLARATION_SHA256', 'scripts/sealed-realms-production-source-authority.d.mts'],
  ['GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_SOURCE_SHA256', BOOTSTRAP],
  ['GENESIS_001_POLICY_OBSERVATION_SOURCE_SHA256', 'scripts/genesis001-policy-observation-receipt.mjs'],
  ['GENESIS_001_ADMISSION_MONITOR_CURRENT_STATE_SOURCE_SHA256', 'scripts/genesis001-admission-monitor-current-state.mjs'],
  ['GENESIS_001_SEALED_LAUNCH_ADOPTION_SOURCE_SHA256', 'scripts/genesis001-sealed-launch-adoption.mjs'],
  ['SEALED_LAUNCH_ACTIVATION_GENERATOR_SOURCE_SHA256', GENERATOR],
];
function fail() { throw new Error('LOCAL_PREPARED_SOURCE_PINS_INVALID'); }
function sha(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function replacePin(source, name, digest) {
  const declarations = new RegExp(`^(?:export\\s+)?const\\s+${name}\\s*=`, 'gm');
  const pattern = new RegExp(`^(const ${name} =\\r?\\n  ')[a-f0-9]{64}(';)(?=\\r?$)`, 'gm');
  if ([...source.matchAll(declarations)].length !== 1 || [...source.matchAll(pattern)].length !== 1) fail();
  return source.replace(pattern, (_match, before, after) => `${before}${digest}${after}`);
}
function replaceInlinePins(source, sources) {
  const pattern = /^(    \[sources\.(\w+),\r?\n      ')[a-f0-9]{64}('\],)(?=\r?$)/gm;
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== INLINE_PINS.reduce((sum, [, , count]) => sum + count, 0)) fail();
  const digests = new Map();
  for (const [key, path, count] of INLINE_PINS) {
    if (matches.filter(match => match[2] === key).length !== count) fail();
    digests.set(key, sha(sources.get(path)));
  }
  return source.replace(pattern, (_match, before, key, after) => `${before}${digests.get(key)}${after}`);
}

/** Internal fixed-path derivation; callers cannot supply hashes or source maps. */
export function derivePreparedSourcePins(options) {
  const owned = [];
  try {
    if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype
      || Reflect.ownKeys(options).length !== 1 || !Object.hasOwn(options, 'repositoryRoot')
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'repositoryRoot'), 'value')
      || typeof options.repositoryRoot !== 'string') fail();
    const sources = new Map();
    for (const path of new Set([...SOURCE_PINS.map(([, path]) => path), ...INLINE_PINS.map(([, path]) => path), VERIFIER])) {
      const { body } = readLocalBindingBoundedFile(resolve(options.repositoryRoot, path), { maximumBytes: MAX_BYTES, minimumBytes: 1 });
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(body);
        if (!Buffer.from(text).equals(body)) fail();
        sources.set(path, text);
      } finally { body.fill(0); }
    }
    const bootstrap = sources.get(BOOTSTRAP);
    const start = 'async function completeBootstrapLaunch(input)';
    const end = '\nfunction packageNameAndVersion(';
    if (bootstrap.split(start).length !== 2 || bootstrap.split(end).length !== 2) fail();
    const startAt = bootstrap.indexOf(start);
    const endAt = bootstrap.indexOf(end);
    if (endAt <= startAt) fail();
    const finalizationDigest = sha(bootstrap.slice(startAt, endAt));

    // The verifier must hash the newly derived generator, never its old bytes.
    sources.set(GENERATOR, replacePin(sources.get(GENERATOR), 'EXPECTED_BOOTSTRAP_SHA256', sha(bootstrap)));
    let verifier = sources.get(VERIFIER);
    for (const [name, path] of SOURCE_PINS) verifier = replacePin(verifier, name, sha(sources.get(path)));
    verifier = replacePin(verifier, 'GENESIS_001_POLICY_OBSERVATION_BOOTSTRAP_FINALIZATION_SHA256', finalizationDigest);
    verifier = replaceInlinePins(verifier, sources);
    sources.set(VERIFIER, verifier);
    const files = [GENERATOR, VERIFIER].map(path => {
      const bytes = new Uint8Array(Buffer.from(sources.get(path)));
      owned.push(bytes);
      if (bytes.length > MAX_BYTES) fail();
      return Object.freeze({ path, bytes });
    });
    return Object.freeze({ files: Object.freeze(files) });
  } catch {
    for (const bytes of owned) bytes.fill(0);
    fail();
  }
}
