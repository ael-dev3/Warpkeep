// Internal data codec only. Native capture, locks, fsync, and independent release
// verification belong to the assembler. A parsed record is never authority.
const PROFILE = 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
const MAX_ENTRIES = 2048;
const MAX_JOURNAL_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FAMILY_BYTES = 128 * 1024 * 1024;
const FACT_KEYS = ['dev', 'ino', 'uid', 'mode', 'size', 'sha256'];

// Task 7's installation namespace, not a claim of complete-family membership.
// The assembler must additionally require its exact derived output set.
const FIXED_OUTPUTS = new Set([
  ...['g001', 'g002', 'ptr', 'activation'].flatMap(lane => [
    `scripts/sealed-realms-production-${lane}-lane.bundle.mjs`,
    `scripts/sealed-realms-production-${lane}-lane.bundle.d.mts`,
  ]),
  ...[
    'auth-bridge-notification-prepared-deploy-closure-policy',
    'auth-bridge-notification-prepared-deploy-closure',
    'sealed-realms-production-dispatch', 'greater-realm-production-bootstrap',
    'sealed-realms-production-auth-bridge-state',
    'production-player-canary-activation-launcher',
    'generate-0.4.0-sealed-launch-activation', 'verify-0.4.0-sealed-launch',
    'verify-sealed-realms-public-activation-artifact',
  ].flatMap(name => [`scripts/${name}.mjs`, `scripts/${name}.d.mts`]),
  'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json',
  'scripts/sealed-realms-production-bundle-manifest-v1.json',
  ...['sealed-realms-production', 'notification-bridge-b0',
    'notification-bridge-prepared', 'deploy-pages', 'verify']
    .map(name => `.github/workflows/${name}.yml`),
  ...[
    'sealedLaunchActivationGenerator', 'sealedLaunchVerifier',
    'sealedRealmsPublicActivationArtifactVerifier', 'authBridgeNotificationB0Closure',
    'authBridgeNotificationPreparedReleaseProjection', 'authBridgeNotificationPreparedWorkflow',
    'authBridgeNotificationB0Workflow', 'notificationPagesPrivateDeployWorkflow',
    'sealedRealmsProductionWorkflow', 'workflowSecurity',
    'greaterRealmReleaseGateDeployBoundary', 'authBridgeNotificationPreparedClosureRefreeze',
    'sealedRealmsProductionBundleRefreeze',
  ].map(name => `tests/${name}.test.ts`),
]);

export class LocalReleaseRecoveryJournalError extends Error {
  constructor(code = 'LOCAL_RELEASE_RECOVERY_JOURNAL_INVALID') {
    super(code);
    this.name = 'LocalReleaseRecoveryJournalError';
    this.code = code;
  }
}

function fail() { throw new LocalReleaseRecoveryJournalError(); }

function object(value, keys) {
  if (value === null || typeof value !== 'object'
      || Object.getPrototypeOf(value) !== Object.prototype
      || Reflect.ownKeys(value).length !== keys.length
      || !keys.every(key => Object.hasOwn(value, key)
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) fail();
  return value;
}

function list(value, maximum) {
  if (!Array.isArray(value) || value.length < 1 || value.length > maximum
      || Reflect.ownKeys(value).length !== value.length + 1) fail();
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)
        || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, index), 'value')) fail();
  }
  return value;
}

function decimal(value, positive = false) {
  return typeof value === 'string' && /^(?:0|[1-9][0-9]{0,19})$/u.test(value)
    && BigInt(value) <= 18446744073709551615n && (!positive || value !== '0');
}

function hex(value, length) {
  return typeof value === 'string' && value.length === length && /^[0-9a-f]+$/u.test(value);
}

export function isPreparedReleaseOutputPath(path) {
  if (typeof path !== 'string' || path.length > 240) return false;
  if (FIXED_OUTPUTS.has(path)) return true;
  return /^(?:scripts\/genesis002_module_bindings|spacetimedb\/ptr\/generated-bindings)\/(?:[a-zA-Z0-9_][a-zA-Z0-9_-]*\/)*[a-zA-Z0-9_][a-zA-Z0-9_-]*\.ts$/u.test(path);
}

function copyFact(value, device) {
  object(value, FACT_KEYS);
  if (!decimal(value.dev) || value.dev !== device || !decimal(value.ino, true)
      || value.uid !== 1000 || ![384, 420].includes(value.mode)
      || !Number.isSafeInteger(value.size) || value.size < 0 || value.size > MAX_FILE_BYTES
      || !hex(value.sha256, 64)) fail();
  return Object.freeze({ dev: value.dev, ino: value.ino, uid: value.uid,
    mode: value.mode, size: value.size, sha256: value.sha256 });
}

function copyRecord(value) {
  object(value, ['schemaVersion', 'profile', 'transactionId', 'sourceCommit',
    'sourceTree', 'candidate', 'entries']);
  if (value.schemaVersion !== 1 || value.profile !== PROFILE
      || !hex(value.transactionId, 32) || !hex(value.sourceCommit, 40)
      || !hex(value.sourceTree, 40)) fail();
  const root = object(value.candidate, ['dev', 'ino', 'uid', 'mode']);
  if (!decimal(root.dev) || !decimal(root.ino, true) || root.uid !== 1000 || root.mode !== 448) fail();
  const candidate = Object.freeze({ dev: root.dev, ino: root.ino, uid: root.uid, mode: root.mode });
  const identities = new Set([candidate.ino]);
  const paths = new Set();
  let previous = '';
  let aggregate = 0;
  function uniqueFact(input) {
    const result = copyFact(input, candidate.dev);
    if (identities.has(result.ino)) fail();
    identities.add(result.ino);
    return result;
  }
  const entries = list(value.entries, MAX_ENTRIES).map(input => {
    object(input, ['path', 'before', 'after']);
    if (!isPreparedReleaseOutputPath(input.path) || input.path <= previous || paths.has(input.path.toLowerCase())) fail();
    previous = input.path;
    paths.add(input.path.toLowerCase());
    let before = null;
    if (input.before !== null) {
      object(input.before, ['target', 'backup']);
      const target = uniqueFact(input.before.target);
      const backup = uniqueFact(input.before.backup);
      if (target.size !== backup.size || target.mode !== backup.mode
          || target.sha256 !== backup.sha256) fail();
      before = Object.freeze({ target, backup });
      aggregate += target.size;
    }
    const after = uniqueFact(input.after);
    aggregate += after.size;
    if (aggregate > MAX_FAMILY_BYTES) fail();
    return Object.freeze({ path: input.path, before, after });
  });
  return Object.freeze({ schemaVersion: 1, profile: PROFILE,
    transactionId: value.transactionId, sourceCommit: value.sourceCommit,
    sourceTree: value.sourceTree, candidate, entries: Object.freeze(entries) });
}

export function encodePreparedReleaseJournal(value) {
  try {
    const bytes = Buffer.from(`${JSON.stringify(copyRecord(value))}\n`, 'utf8');
    if (bytes.length > MAX_JOURNAL_BYTES) fail();
    return new Uint8Array(bytes);
  } catch { fail(); }
}

export function decodePreparedReleaseJournal(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1
        || bytes.byteLength > MAX_JOURNAL_BYTES) fail();
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const result = copyRecord(JSON.parse(source));
    if (!Buffer.from(bytes).equals(Buffer.from(encodePreparedReleaseJournal(result)))) fail();
    return result;
  } catch { fail(); }
}

function same(left, right) {
  return left === null || right === null ? left === right
    : FACT_KEYS.every(key => left[key] === right[key]);
}

// No filesystem effects occur here. A native installer must obtain fresh facts
// itself and recheck them under its exclusive candidate lock before each action.
export function planPreparedReleaseRollback(input) {
  try {
    object(input, ['journal', 'observations']);
    const journal = copyRecord(input.journal);
    const observations = list(input.observations, MAX_ENTRIES);
    if (observations.length !== journal.entries.length) fail();
    const actions = journal.entries.map((entry, index) => {
      const observation = object(observations[index], ['path', 'target', 'backup', 'stage']);
      if (observation.path !== entry.path) fail();
      const [target, backup, stage] = ['target', 'backup', 'stage'].map(key =>
        observation[key] === null ? null : copyFact(observation[key], journal.candidate.dev));
      let operation;
      if (entry.before === null) {
        if (backup !== null) fail();
        if (target === null && (stage === null || same(stage, entry.after))) operation = 'retain';
        else if (same(target, entry.after) && stage === null) operation = 'remove-created';
        else fail();
      } else if (same(target, entry.before.target)
          && same(backup, entry.before.backup) && same(stage, entry.after)) {
        operation = 'retain';
      } else if (same(target, entry.after) && same(backup, entry.before.backup) && stage === null) {
        operation = 'restore-backup';
      } else if (same(target, entry.before.backup) && backup === null && stage === null) {
        operation = 'retain';
      } else fail();
      return Object.freeze({ path: entry.path, operation });
    });
    return Object.freeze(actions);
  } catch { throw new LocalReleaseRecoveryJournalError('LOCAL_RELEASE_RECOVERY_STATE_INVALID'); }
}
