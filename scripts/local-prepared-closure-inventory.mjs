import { resolve } from 'node:path';
import { deriveAuthBridgeNotificationPreparedDeployClosurePaths } from './auth-bridge-notification-prepared-deploy-closure-policy.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const PATH = 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
const NAME = 'AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS';
const MAX_BYTES = 4 * 1024 * 1024;
const POLICY_PATH = 'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';
const BUNDLE_MEMBERS = Object.freeze([
  ...['activation', 'g001', 'g002', 'ptr'].flatMap(lane => ['d.mts', 'mjs'].map(suffix =>
    `scripts/sealed-realms-production-${lane}-lane.bundle.${suffix}`)),
  'scripts/sealed-realms-production-bundle-manifest-v1.json',
  'scripts/recovery-workflow-bundle-manifest-v1.json',
  'scripts/recovery-workflow-prepare-claim.mjs',
  'services/release-recovery/scripts/prepare-recovery-workflow-claim.bundle.mjs',
].sort());
function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID'); }
function repositoryOption(options) {
  if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype
    || Reflect.ownKeys(options).length !== 1 || !Object.hasOwn(options, 'repositoryRoot')
    || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'repositoryRoot'), 'value')
    || typeof options.repositoryRoot !== 'string') fail();
  return options.repositoryRoot;
}

/** Derive before scanning the prospective candidate; never edit the source checkout.
 * Bundle presence is mandatory in the resulting closure, not a filesystem-dependent
 * optional expansion. The closure reader subsequently verifies every member body.
 */
export function derivePreparedClosurePolicySource(options) {
  let body;
  try {
    const root = repositoryOption(options);
    body = readLocalBindingBoundedFile(resolve(root, POLICY_PATH), { maximumBytes: MAX_BYTES, minimumBytes: 1 }).body;
    const source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (!Buffer.from(source).equals(body)) fail();
    const header = 'const STATIC_SECURITY_INPUTS = Object.freeze([';
    if (source.split(header).length !== 2) fail();
    const matches = [...source.matchAll(/^const STATIC_SECURITY_INPUTS = Object\.freeze\(\[(\r?\n)((?:  '[A-Za-z0-9._/-]+',\r?\n)+)\]\);/gm)];
    if (matches.length !== 1) fail();
    const match = matches[0];
    const paths = match[2].split(/\r?\n/u).filter(Boolean).map(line => line.slice(3, -2));
    // The established list is not sorted: preserve its order and all existing
    // security inputs. Validate uniqueness/canonical paths separately.
    pathsValid([...paths].sort());
    const existing = paths.filter(path => BUNDLE_MEMBERS.includes(path));
    const legacy = BUNDLE_MEMBERS.filter(path => path.startsWith('scripts/sealed-realms-production-'));
    const completeLegacy = existing.length === legacy.length && legacy.every(path => existing.includes(path));
    if (existing.length !== 0 && existing.length !== BUNDLE_MEMBERS.length && !completeLegacy) fail();
    const members = [...paths, ...BUNDLE_MEMBERS.filter(path => !paths.includes(path))];
    const declaration = `${header}${match[1]}${members.map(path => `  '${path}',${match[1]}`).join('')}]);`;
    const bytes = new Uint8Array(Buffer.from(`${source.slice(0, match.index)}${declaration}${source.slice(match.index + match[0].length)}`));
    if (bytes.length > MAX_BYTES) fail();
    return Object.freeze({ path: POLICY_PATH, bytes });
  } catch { fail(); }
  finally { body?.fill(0); }
}
function pathsValid(paths) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 2048) fail();
  let previous = '';
  const seen = new Set();
  for (const path of paths) {
    if (typeof path !== 'string' || path.length > 240 || !/^[A-Za-z0-9._/-]+$/u.test(path)
      || path.split('/').some(part => !part || part === '.' || part === '..')
      || path <= previous || seen.has(path.toLowerCase())) fail();
    seen.add(path.toLowerCase()); previous = path;
  }
}

/** Internal source transformation only; never installation or release authority. */
export function derivePreparedClosureInventorySource(options) {
  return deriveInventory(options, false);
}

function deriveInventory(options, expandBundles) {
  let body;
  try {
    repositoryOption(options);
    const scanned = deriveAuthBridgeNotificationPreparedDeployClosurePaths(options);
    pathsValid(scanned);
    // The generated policy changes only this fixed static set, not graph roots
    // or traversal semantics. Compute its exact union without loading executable
    // candidate source or accepting a caller-selected inventory override.
    const paths = expandBundles ? [...new Set([...scanned, ...BUNDLE_MEMBERS])].sort() : scanned;
    pathsValid(paths);
    const opened = readLocalBindingBoundedFile(resolve(options.repositoryRoot, PATH), { maximumBytes: MAX_BYTES, minimumBytes: 1 });
    body = opened.body;
    const source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (!Buffer.from(source).equals(body)) fail();
    const header = `export const ${NAME} =`;
    if (source.split(header).length !== 2) fail();
    const pattern = new RegExp(`^${header}(\\r?\\n)  Object\\.freeze\\(\\[\\r?\\n((?:    '[A-Za-z0-9._/-]+',\\r?\\n)+)  \\]\\);`, 'gm');
    const matches = [...source.matchAll(pattern)];
    if (matches.length !== 1) fail();
    const match = matches[0];
    const newline = match[1];
    const oldPaths = match[2].split(/\r?\n/u).filter(Boolean).map(line => line.slice(5, -2));
    pathsValid(oldPaths);
    const declaration = entries => `${header}${newline}  Object.freeze([${newline}${entries.map(path => `    '${path}',${newline}`).join('')}  ]);`;
    if (declaration(oldPaths) !== match[0]) fail();
    const updated = `${source.slice(0, match.index)}${declaration(paths)}${source.slice(match.index + match[0].length)}`;
    const bytes = Buffer.from(updated);
    if (bytes.length > MAX_BYTES) fail();
    return Object.freeze({ path: PATH, bytes: new Uint8Array(bytes), memberCount: paths.length });
  } catch { fail(); }
  finally { body?.fill(0); }
}

const COUNT_CONSUMERS = [
  ['scripts/production-player-canary-activation-launcher.mjs', [
    ['export const EXPECTED_PROTECTED_SOURCE_CLOSURE_MEMBER_COUNT = ', ';', 1],
  ]],
  ['scripts/production-player-canary-activation-launcher.d.mts', [
    ['export const EXPECTED_PROTECTED_SOURCE_CLOSURE_MEMBER_COUNT: ', ';', 1],
  ]],
  ['tests/authBridgeNotificationB0Closure.test.ts', [['expect(derived).toHaveLength(', ');', 1]]],
  ['tests/authBridgeNotificationPreparedReleaseProjection.test.ts', [
    ['expect(authority.memberCount).toBe(', ');', 1],
    ['expect(baseline.memberCount).toBe(', ');', 1],
    ['expect(verify(root).memberCount).toBe(', ');', 2],
  ]],
  ['tests/authBridgeNotificationPreparedWorkflow.test.ts', [
    ['executableSecurityClosureMemberCount: ', ',', 1],
    ['expect(paths).toHaveLength(', ');', 1],
    ['memberCount: ', ',', 1],
  ]],
  ['tests/greaterRealmReleaseGateDeployBoundary.test.ts', [['expect(checkedMembers).toHaveLength(', ');', 1]]],
];
const escapePattern = text => text.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** Derive the inventory-dependent subset, never a complete installed candidate. */
export function derivePreparedClosureInventoryAndCounts(options) {
  return deriveCounts(options, false);
}

/** One consistent prospective policy/inventory/count family; no installation. */
export function derivePreparedClosurePolicyInventoryAndCounts(options) {
  return deriveCounts(options, true);
}

function deriveCounts(options, expandBundles) {
  const owned = [];
  try {
    const files = [];
    if (expandBundles) {
      const policy = derivePreparedClosurePolicySource(options);
      owned.push(policy.bytes);
      files.push(policy);
    }
    const inventory = deriveInventory(options, expandBundles);
    owned.push(inventory.bytes);
    files.push({ path: inventory.path, bytes: inventory.bytes });
    for (const [path, slots] of COUNT_CONSUMERS) {
      const opened = readLocalBindingBoundedFile(resolve(options.repositoryRoot, path), { maximumBytes: MAX_BYTES, minimumBytes: 1 });
      let source;
      try {
        source = new TextDecoder('utf-8', { fatal: true }).decode(opened.body);
        if (!Buffer.from(source).equals(opened.body)) fail();
      } finally { opened.body.fill(0); }
      for (const [prefix, suffix, count] of slots) {
        const pattern = new RegExp(`^([ \\t]*${escapePattern(prefix)})([1-9][0-9]{0,3})(${escapePattern(suffix)})(?=\\r?$)`, 'gm');
        const matches = [...source.matchAll(pattern)];
        if (matches.length !== count || matches.some(match => Number(match[2]) > 2048)) fail();
        source = source.replace(pattern, (_match, before, _old, after) => `${before}${inventory.memberCount}${after}`);
      }
      const bytes = new Uint8Array(Buffer.from(source));
      if (bytes.length > MAX_BYTES) fail();
      owned.push(bytes); files.push({ path, bytes });
    }
    files.sort((left, right) => left.path < right.path ? -1 : 1);
    return Object.freeze({ memberCount: inventory.memberCount, files: Object.freeze(files.map(file => Object.freeze(file))) });
  } catch {
    for (const bytes of owned) bytes.fill(0);
    fail();
  }
}
