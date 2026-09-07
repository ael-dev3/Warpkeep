// @vitest-environment node
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const scanner = vi.hoisted(() => ({ paths: ['scripts/a.mjs', 'src/b.ts'] }));
vi.mock('../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs', () => ({
  deriveAuthBridgeNotificationPreparedDeployClosurePaths: () => scanner.paths,
}));
import { derivePreparedClosureInventorySource } from '../scripts/local-prepared-closure-inventory.mjs';
const declaration = (paths: string[], newline = '\n') => `export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =${newline}  Object.freeze([${newline}${paths.map(path => `    '${path}',${newline}`).join('')}  ]);`;
let root: string;
let path: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpkeep-inventory-test-'));
  mkdirSync(join(root, 'scripts'));
  path = join(root, 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs');
  scanner.paths = ['scripts/a.mjs', 'src/b.ts'];
});
afterEach(() => rmSync(root, { recursive: true }));
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
