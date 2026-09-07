import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const GENERATOR = 'scripts/generate-0.4.0-sealed-launch-activation.mjs';
const VERIFIER = 'scripts/verify-0.4.0-sealed-launch.mjs';
const BOOTSTRAP = 'scripts/greater-realm-production-bootstrap.mjs';
const MAX_BYTES = 4 * 1024 * 1024;
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

/** Internal fixed-path derivation; callers cannot supply hashes or source maps. */
export function derivePreparedSourcePins(options) {
  const owned = [];
  try {
    if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype
      || Reflect.ownKeys(options).length !== 1 || !Object.hasOwn(options, 'repositoryRoot')
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'repositoryRoot'), 'value')
      || typeof options.repositoryRoot !== 'string') fail();
    const sources = new Map();
    for (const path of new Set([...SOURCE_PINS.map(([, path]) => path), VERIFIER])) {
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
