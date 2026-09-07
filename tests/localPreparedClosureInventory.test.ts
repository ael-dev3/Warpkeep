// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const scanner = vi.hoisted(() => ({ paths: ['scripts/a.mjs', 'src/b.ts'] }));
vi.mock('../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs', () => ({
  deriveAuthBridgeNotificationPreparedDeployClosurePaths: () => scanner.paths,
}));
import { derivePreparedClosurePolicySource, derivePreparedClosureInventorySource, derivePreparedClosureInventoryAndCounts } from '../scripts/local-prepared-closure-inventory.mjs';
const declaration = (paths: string[], newline = '\n') => `export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =${newline}  Object.freeze([${newline}${paths.map(path => `    '${path}',${newline}`).join('')}  ]);`;
let root: string;
let path: string;
const policyPath = 'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';
const bundleMembers = [
  ...['activation', 'g001', 'g002', 'ptr'].flatMap(lane => ['d.mts', 'mjs'].map(suffix =>
    `scripts/sealed-realms-production-${lane}-lane.bundle.${suffix}`)),
  'scripts/sealed-realms-production-bundle-manifest-v1.json',
].sort();
const policyDeclaration = (paths: string[], newline = '\n') =>
  `const STATIC_SECURITY_INPUTS = Object.freeze([${newline}${paths.map(path => `  '${path}',${newline}`).join('')}]);`;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-inventory-test-'));
  mkdirSync(join(root, 'scripts'));
  path = join(root, 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs');
  scanner.paths = ['scripts/a.mjs', 'src/b.ts'];
});
afterEach(() => rmSync(root, { recursive: true }));
it.each(['\n', '\r\n'])('derives mandatory bundle policy without requiring artifacts to exist, preserves source, and converges (%j)', newline => {
  const originalPaths = ['src/z.ts', 'scripts/a.mjs'];
  const original = `// retained α${newline}${policyDeclaration(originalPaths, newline)}${newline}export const sentinel = 73;${newline}`;
  writeFileSync(join(root, policyPath), original);
  const result = derivePreparedClosurePolicySource({ repositoryRoot: root });
  expect(result.path).toBe(policyPath);
  expect(Buffer.from(result.bytes).toString()).toBe(original.replace(policyDeclaration(originalPaths, newline), policyDeclaration([...originalPaths, ...bundleMembers], newline)));
  expect(readFileSync(join(root, policyPath), 'utf8')).toBe(original);
  writeFileSync(join(root, policyPath), result.bytes);
  expect(derivePreparedClosurePolicySource({ repositoryRoot: root })).toEqual(result);
});
it.each(['missing', 'duplicate-declaration', 'duplicate-path', 'partial-family', 'expression', 'traversal', 'invalid-utf8'])('rejects %s policy without changing it', kind => {
  let source = policyDeclaration(['src/a.ts']);
  if (kind === 'missing') source = '// no policy';
  if (kind === 'duplicate-declaration') source += `\n${source}`;
  if (kind === 'duplicate-path') source = policyDeclaration(['src/a.ts', 'src/a.ts']);
  if (kind === 'partial-family') source = policyDeclaration(['src/a.ts', bundleMembers[0]]);
  if (kind === 'expression') source = source.replace("'src/a.ts'", 'callerInput()');
  if (kind === 'traversal') source = policyDeclaration(['src/../a.ts']);
  const bytes = kind === 'invalid-utf8' ? Buffer.from([255]) : Buffer.from(source);
  writeFileSync(join(root, policyPath), bytes);
  expect(() => derivePreparedClosurePolicySource({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID');
  expect(readFileSync(join(root, policyPath))).toEqual(bytes);
});
it.each(['\n', '\r\n'])('expands only the inventory and converges with newline %j', newline => {
  const original = `// untouched α${newline}${declaration(['scripts/a.mjs'], newline)}${newline}export const sentinel = 73;${newline}`;
  writeFileSync(path, original);
  const result = derivePreparedClosureInventorySource({ repositoryRoot: root });
  const expected = `// untouched α${newline}${declaration(scanner.paths, newline)}${newline}export const sentinel = 73;${newline}`;
  expect(Buffer.from(result.bytes).toString()).toBe(expected);
  expect(result.memberCount).toBe(2);
  expect(readFileSync(path, 'utf8')).toBe(original);
  writeFileSync(path, result.bytes);
  expect(derivePreparedClosureInventorySource({ repositoryRoot: root }).bytes).toEqual(result.bytes);
});
it.each(['missing', 'duplicate', 'expression', 'invalid-utf8'])('rejects %s inventory source without writing', kind => {
  let source = declaration(['scripts/a.mjs']);
  if (kind === 'missing') source = 'export const unrelated = [];';
  if (kind === 'duplicate') source += `\n${source}`;
  if (kind === 'expression') source = source.replace("'scripts/a.mjs'", "readCallerInput()");
  const bytes = kind === 'invalid-utf8' ? Buffer.from([0xff]) : Buffer.from(source);
  writeFileSync(path, bytes);
  expect(() => derivePreparedClosureInventorySource({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID');
  expect(readFileSync(path)).toEqual(bytes);
});
it.each([['../escape'], ['scripts/a.mjs', 'scripts/a.mjs'], ['src/b.ts', 'scripts/a.mjs'], []].map(paths => ({ paths })))('rejects invalid scanner paths $paths', ({ paths }) => {
  scanner.paths = paths;
  writeFileSync(path, declaration(['scripts/a.mjs']));
  expect(() => derivePreparedClosureInventorySource({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID');
});
it('rejects unknown options and accessor input without executing it', () => {
  writeFileSync(path, declaration(['scripts/a.mjs']));
  expect(() => derivePreparedClosureInventorySource({ repositoryRoot: root, paths: scanner.paths } as never)).toThrow();
  let called = false;
  expect(() => derivePreparedClosureInventorySource({ get repositoryRoot() { called = true; return root; } })).toThrow();
  expect(called).toBe(false);
});
it('rejects an oversized source file without rewriting it', () => {
  const original = Buffer.alloc(4 * 1024 * 1024 + 1, 32);
  writeFileSync(path, original);
  expect(() => derivePreparedClosureInventorySource({ repositoryRoot: root })).toThrow();
  expect(readFileSync(path).equals(original)).toBe(true);
});
it.skipIf(process.platform === 'win32')('rejects a source symlink without changing its target', () => {
  const target = join(root, 'original.mjs');
  const original = declaration(['scripts/a.mjs']);
  writeFileSync(target, original); symlinkSync(target, path);
  expect(() => derivePreparedClosureInventorySource({ repositoryRoot: root })).toThrow();
  expect(readFileSync(target, 'utf8')).toBe(original);
});

const countConsumers = {
  'scripts/production-player-canary-activation-launcher.mjs': 'export const EXPECTED_PROTECTED_SOURCE_CLOSURE_MEMBER_COUNT = 997;',
  'scripts/production-player-canary-activation-launcher.d.mts': 'export const EXPECTED_PROTECTED_SOURCE_CLOSURE_MEMBER_COUNT: 997;',
  'tests/authBridgeNotificationB0Closure.test.ts': '    expect(derived).toHaveLength(1027);',
  'tests/authBridgeNotificationPreparedReleaseProjection.test.ts': '      expect(authority.memberCount).toBe(1027);\n    expect(baseline.memberCount).toBe(1027);\n    expect(verify(root).memberCount).toBe(1027);\n    expect(verify(root).memberCount).toBe(1027);',
  'tests/authBridgeNotificationPreparedWorkflow.test.ts': '        executableSecurityClosureMemberCount: 1027,\n    expect(paths).toHaveLength(1027);\n        memberCount: 1027,',
  'tests/greaterRealmReleaseGateDeployBoundary.test.ts': '    expect(checkedMembers).toHaveLength(997);',
};
function writeConsumers() {
  mkdirSync(join(root, 'tests'));
  writeFileSync(path, declaration(['scripts/a.mjs']));
  for (const [name, body] of Object.entries(countConsumers)) writeFileSync(join(root, name), `${body}\n// unrelated 997 and 1027\n`);
}
it('derives all eleven count slots together without touching unrelated numbers or source files', () => {
  writeConsumers();
  const result = derivePreparedClosureInventoryAndCounts({ repositoryRoot: root });
  expect(result.files).toHaveLength(7);
  expect(result.memberCount).toBe(2);
  for (const [name, body] of Object.entries(countConsumers)) {
    const file = result.files.find(file => file.path === name)!;
    expect(Buffer.from(file.bytes).toString()).toBe(`${body.replace(/997|1027/gu, '2')}\n// unrelated 997 and 1027\n`);
    expect(readFileSync(join(root, name), 'utf8')).toBe(`${body}\n// unrelated 997 and 1027\n`);
  }
  for (const file of result.files) writeFileSync(join(root, file.path), file.bytes);
  expect(derivePreparedClosureInventoryAndCounts({ repositoryRoot: root })).toEqual(result);
});
it.each(['missing', 'duplicate'])('rejects a %s count slot instead of returning a partial family', kind => {
  writeConsumers();
  const name = 'scripts/production-player-canary-activation-launcher.d.mts';
  const body = kind === 'missing' ? '// missing declaration' : `${countConsumers[name]}\n${countConsumers[name]}`;
  writeFileSync(join(root, name), body);
  expect(() => derivePreparedClosureInventoryAndCounts({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID');
  expect(readFileSync(join(root, name), 'utf8')).toBe(body);
});

it.each(['0', '01', '2049', '-1', '1.5', '1 + 1'])('rejects invalid existing count %s without modifying consumers', value => {
  writeConsumers();
  const name = 'scripts/production-player-canary-activation-launcher.mjs';
  const body = countConsumers[name].replace('997', value);
  writeFileSync(join(root, name), body);
  expect(() => derivePreparedClosureInventoryAndCounts({ repositoryRoot: root })).toThrow('LOCAL_PREPARED_CLOSURE_INVENTORY_INVALID');
  expect(readFileSync(join(root, name), 'utf8')).toBe(body);
});
