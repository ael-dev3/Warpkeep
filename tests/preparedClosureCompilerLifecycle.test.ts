// @vitest-environment node

import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { API, type Snapshot } from '../services/auth-bridge/node_modules/typescript/dist/api/sync/api.js';
import { AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS } from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import { deriveAuthBridgeNotificationPreparedDeployClosurePaths } from '../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const repositoryRoot = resolve(import.meta.dirname, '..');
const rootMember = 'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs';
const secondMember = 'scripts/auth-bridge-notification-b0-deploy-adapter.mjs';
let fixtureRoot: string;
let originalRoot: string;
let originalSecond: string;
const testCompilers = new Set<API>();
const closeCompiler = API.prototype.close;

beforeAll(() => {
  fixtureRoot = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-compiler-lifecycle-')));
  for (const member of AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS) {
    const destination = resolve(fixtureRoot, member);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(resolve(repositoryRoot, member), destination);
  }
  originalRoot = readFileSync(resolve(fixtureRoot, rootMember), 'utf8');
  originalSecond = readFileSync(resolve(fixtureRoot, secondMember), 'utf8');
}, 30_000);

afterEach(async () => {
  vi.restoreAllMocks();
  for (const api of testCompilers) closeCompiler.call(api);
  testCompilers.clear();
  writeFileSync(resolve(fixtureRoot, rootMember), originalRoot);
  writeFileSync(resolve(fixtureRoot, secondMember), originalSecond);
  // Native child exit events can only be reaped once synchronous traversal yields.
  await new Promise<void>(done => setImmediate(done));
});

afterAll(() => rmSync(fixtureRoot, { recursive: true, force: true }));

function observeCompiler(options: { failUpdate?: number; failDispose?: boolean; failClose?: boolean } = {}) {
  const instances = new Set<API>();
  const closed = new Set<API>();
  const snapshots: Snapshot[] = [];
  const update = API.prototype.updateSnapshot;
  const close = API.prototype.close;
  let updates = 0;
  let peakUndisposed = 0;
  vi.spyOn(API.prototype, 'updateSnapshot').mockImplementation(function (this: API, params) {
    instances.add(this);
    testCompilers.add(this);
    // Stop a regression before it starts hundreds of native compiler children.
    if (instances.size > 3) throw new Error('test compiler startup cap exceeded');
    updates += 1;
    if (updates === options.failUpdate) throw new Error('test snapshot transport failure');
    const snapshot = update.call(this, params);
    snapshots.push(snapshot);
    peakUndisposed = Math.max(peakUndisposed, snapshots.filter(item => !item.isDisposed()).length);
    if (options.failDispose) {
      const dispose = snapshot.dispose.bind(snapshot);
      vi.spyOn(snapshot, 'dispose').mockImplementation(() => {
        dispose();
        throw new Error('test snapshot disposal failure');
      });
    }
    return snapshot;
  });
  vi.spyOn(API.prototype, 'close').mockImplementation(function (this: API) {
    close.call(this);
    closed.add(this);
    if (options.failClose) throw new Error('test compiler close failure');
  });
  return {
    instances,
    assertReleased() {
      expect(instances.size).toBeGreaterThan(0);
      expect(closed.size).toBe(instances.size);
      expect([...instances].every(instance => closed.has(instance))).toBe(true);
      expect(snapshots.every(snapshot => snapshot.isDisposed())).toBe(true);
      expect(peakUndisposed).toBeLessThanOrEqual(1);
    },
  };
}

function scan() {
  return deriveAuthBridgeNotificationPreparedDeployClosurePaths({ repositoryRoot: fixtureRoot });
}

function nativeChildren(): string[] {
  return readFileSync(`/proc/${process.pid}/task/${process.pid}/children`, 'utf8')
    .trim().split(/\s+/u).filter(Boolean);
}

describe('prepared closure compiler ownership', () => {
  it('derives the complete graph with bounded compiler startups and released snapshots', async () => {
    const childrenBefore = process.platform === 'linux' ? nativeChildren() : [];
    const observation = observeCompiler();
    expect(scan()).toEqual(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS);
    expect(observation.instances.size).toBe(3);
    observation.assertReleased();
    if (process.platform === 'linux') {
      // Unlike API-close observations, /proc includes unreaped zombie children.
      // Even before yielding, startup count must be independent of file count.
      const addedChildren = () => nativeChildren().filter(pid => !childrenBefore.includes(pid));
      expect(addedChildren().length).toBeLessThanOrEqual(3);
      await vi.waitFor(() => expect(addedChildren()).toEqual([]), { timeout: 2_000, interval: 10 });
    }
  }, 90_000);

  it('rejects invalid syntax after a valid file and closes the graph compiler', () => {
    writeFileSync(resolve(fixtureRoot, secondMember), 'export const broken = ;\n');
    const observation = observeCompiler();
    expect(scan).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_SOURCE_INVALID');
    expect(observation.instances.size).toBe(1);
    observation.assertReleased();
  });

  it('does not reuse a previous scan or its source bytes after a failure', () => {
    writeFileSync(resolve(fixtureRoot, rootMember), 'export const broken = ;\n');
    const failed = observeCompiler();
    expect(scan).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_SOURCE_INVALID');
    failed.assertReleased();
    vi.restoreAllMocks();
    writeFileSync(resolve(fixtureRoot, rootMember), originalRoot);
    const repaired = observeCompiler();
    expect(scan()).toEqual(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS);
    expect([...repaired.instances].some(instance => failed.instances.has(instance))).toBe(false);
    repaired.assertReleased();
  }, 90_000);

  it.each([
    ['dynamic import', 'import(globalThis.untrustedPath);', 'IMPORT_INVALID'],
    ['require', 'require("untrusted");', 'REQUIRE_FORBIDDEN'],
    ['unresolved import', 'import "./not-present-in-fixture.ts";', 'IMPORT_UNRESOLVED'],
  ])('preserves %s rejection and releases the compiler', (_name, source, code) => {
    writeFileSync(resolve(fixtureRoot, secondMember), source);
    const observation = observeCompiler();
    expect(scan).toThrow(`AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_${code}`);
    expect(observation.instances.size).toBe(1);
    observation.assertReleased();
  });

  it('closes the graph compiler when creating the next snapshot fails', () => {
    const observation = observeCompiler({ failUpdate: 2 });
    expect(scan).toThrow('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_SOURCE_INVALID');
    expect(observation.instances.size).toBe(1);
    observation.assertReleased();
  });

  it('still closes the compiler when snapshot disposal throws', () => {
    const observation = observeCompiler({ failDispose: true });
    expect(scan).toThrow();
    observation.assertReleased();
  });

  it.each([
    ['import and dispose', 'import(globalThis.untrustedPath);', 'IMPORT_INVALID', { failDispose: true }],
    ['import and close', 'import(globalThis.untrustedPath);', 'IMPORT_INVALID', { failClose: true }],
    ['syntax and close', 'export const broken = ;', 'SOURCE_INVALID', { failClose: true }],
    ['path and close', 'import "./not-present-in-fixture.ts";', 'IMPORT_UNRESOLVED', { failClose: true }],
  ])('preserves the policy failure when %s fail together', (_name, source, code, options) => {
    writeFileSync(resolve(fixtureRoot, rootMember), source);
    const observation = observeCompiler(options);
    expect(scan).toThrow(`AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_${code}`);
    observation.assertReleased();
  });
});
