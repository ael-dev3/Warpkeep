import { resolve } from 'node:path';
import { deriveAuthBridgeNotificationPreparedDeployClosurePaths } from './auth-bridge-notification-prepared-deploy-closure-policy.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const PATH = 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
const NAME = 'AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS';
const MAX_BYTES = 4 * 1024 * 1024;
function fail() { throw new Error('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID'); }
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
  let body;
  try {
    if (options === null || typeof options !== 'object' || Object.getPrototypeOf(options) !== Object.prototype
      || Reflect.ownKeys(options).length !== 1 || !Object.hasOwn(options, 'repositoryRoot')
      || !Object.hasOwn(Object.getOwnPropertyDescriptor(options, 'repositoryRoot'), 'value')
      || typeof options.repositoryRoot !== 'string') fail();
    const paths = deriveAuthBridgeNotificationPreparedDeployClosurePaths(options);
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
  const owned = [];
  try {
    const inventory = derivePreparedClosureInventorySource(options);
    owned.push(inventory.bytes);
    const files = [{ path: inventory.path, bytes: inventory.bytes }];
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
