// @vitest-environment node

import { createHash } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const CACHE_ROOT = `${ROOT}/cache/genesis002`;
const ORIGINAL_GETUID = Object.getOwnPropertyDescriptor(process, 'getuid');
const EDGES = Object.freeze({
  '@esbuild/linux-x64@0.25.12': [],
  'base64-js@1.5.1': [],
  'esbuild@0.25.12': ['@esbuild/linux-x64@0.25.12'],
  'get-tsconfig@4.14.0': ['resolve-pkg-maps@1.0.0'],
  'headers-polyfill@4.0.3': [],
  'object-inspect@1.13.4': [],
  'prettier@3.9.5': [],
  'pure-rand@7.0.1': [],
  'resolve-pkg-maps@1.0.0': [],
  'safe-stable-stringify@2.5.0': [],
  'spacetimedb@2.6.1': [
    'base64-js@1.5.1', 'headers-polyfill@4.0.3', 'object-inspect@1.13.4',
    'prettier@3.9.5', 'pure-rand@7.0.1', 'safe-stable-stringify@2.5.0',
    'statuses@2.0.2', 'url-polyfill@1.1.14',
  ],
  'statuses@2.0.2': [],
  'tsx@4.20.6': ['esbuild@0.25.12', 'get-tsconfig@4.14.0'],
  'typescript@5.6.3': [],
  'url-polyfill@1.1.14': [],
} as const);

const boundary = vi.hoisted(() => ({
  directories: new Map<string, number>(),
  archives: new Map<string, Readonly<{ body: Buffer; mode: number }>>(),
  pending: new Map<number, { path: string; body: Buffer; mode: number }>(),
  committed: new Map<string, Buffer>(),
  lock: {} as Record<string, unknown>,
  downloads: new Map<string, Buffer>(),
  nextDescriptor: 100,
  fetches: 0,
  fetchScenario: 'success' as
    | 'success' | 'status' | 'redirect' | 'oversize' | 'timeout' | 'sri' | 'trickle',
  changedSource: false,
  escapedRoot: '',
  responseDestroyCount: 0,
  requestDestroyCount: 0,
  dataEvents: 0,
}));

const normalized = (value: unknown) => String(value).replaceAll('\\', '/');

vi.mock('node:child_process', () => ({
  spawnSync(_executable: string, args: readonly string[], options: { encoding: string | null }) {
    let body: Buffer | string;
    if (args[0] === 'rev-parse') body = args.at(-1) === 'HEAD^{tree}' ? '2'.repeat(40) : '1'.repeat(40);
    else if (args[0] === 'show') {
      body = boundary.committed.get(args[1]!.split(':').slice(1).join(':')) ?? Buffer.alloc(0);
    } else throw new Error(`UNEXPECTED_BOOTSTRAP_COMMAND:${args.join(' ')}`);
    const stdout = options.encoding === null ? Buffer.from(body) : Buffer.from(body).toString();
    return { status: 0, signal: null, error: undefined, stdout,
      stderr: options.encoding === null ? Buffer.alloc(0) : '' };
  },
}));

vi.mock('node:module', () => ({ createRequire: () => () => ({ parse: () => boundary.lock }) }));
vi.mock('../scripts/local-binding-runtime-core.mjs', () => ({
  validateLocalBindingYamlManifest: () => ({ entry: 'dist/index.js', files: [] }),
}));

vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({
  readLocalBindingBoundedFile(path: string, options: Record<string, unknown>) {
    const exact = normalized(path);
    if (exact.includes('/cache/genesis002/_cacache/')) {
      const archive = boundary.archives.get(exact);
      if (archive === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (archive.mode !== options.expectedMode) {
        throw new Error('GENESIS002_LOCAL_BINDING_CACHE_ARCHIVE_INVALID');
      }
      return { body: Buffer.from(archive.body), identity: Object.freeze({ path: exact }) };
    }
    if (options.requireExecutable === true) {
      return { body: Buffer.alloc(0), identity: Object.freeze({ path: exact }) };
    }
    const key = [...boundary.committed.keys()].find(value => exact.endsWith(`/${value}`));
    if (key === undefined) throw new Error(`UNEXPECTED_BOUNDED_FILE:${exact}`);
    const body = Buffer.from(boundary.committed.get(key)!);
    if (boundary.changedSource && key === 'scripts/bootstrap-genesis002-local-binding-cache.mjs') body[0] ^= 1;
    if (body.length !== options.expectedBytes
        || createHash('sha256').update(body).digest('hex') !== options.expectedSha256) {
      throw new Error('LOCAL_BINDING_BOUNDED_FILE_INVALID');
    }
    return { body, identity: Object.freeze({ path: exact }) };
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  const directoryState = (mode: number) => ({
    mode: BigInt(0o040000 | mode), uid: 1000n, isDirectory: () => true,
    isSymbolicLink: () => false, isFile: () => false,
  });
  return {
    ...actual,
    lstatSync(path: string) {
      const mode = boundary.directories.get(normalized(path));
      if (mode !== undefined) return directoryState(mode);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    realpathSync(path: string) {
      return boundary.escapedRoot === normalized(path) ? `${path}-escaped` : path;
    },
    existsSync(path: string) {
      const exact = normalized(path);
      return boundary.directories.has(exact) || boundary.archives.has(exact);
    },
    mkdirSync(path: string, options?: { mode?: number }) {
      boundary.directories.set(normalized(path), options?.mode ?? 0o777);
    },
    chmodSync(path: string, mode: number) { boundary.directories.set(normalized(path), mode); },
    openSync(path: string, flags: number, mode?: number) {
      const descriptor = boundary.nextDescriptor++;
      if ((flags & actual.constants.O_WRONLY) !== 0) {
        const exact = normalized(path);
        if (boundary.archives.has(exact)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        boundary.pending.set(descriptor, { path: exact, body: Buffer.alloc(0), mode: mode ?? 0 });
      }
      return descriptor;
    },
    writeSync(descriptor: number, body: Buffer, offset: number, length: number) {
      const pending = boundary.pending.get(descriptor)!;
      pending.body = Buffer.concat([pending.body, body.subarray(offset, offset + length)]);
      return length;
    },
    closeSync(descriptor: number) {
      const pending = boundary.pending.get(descriptor);
      if (pending !== undefined) {
        boundary.archives.set(pending.path, { body: pending.body, mode: pending.mode });
        boundary.pending.delete(descriptor);
      }
    },
    fsyncSync() {},
  };
});

vi.mock('node:https', () => ({
  request(url: URL, _options: unknown, callback: (response: unknown) => void) {
    boundary.fetches += 1;
    const requestHandlers = new Map<string, (value?: unknown) => void>();
    let trickleTimer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;
    const stop = () => {
      stopped = true;
      if (trickleTimer !== undefined) clearInterval(trickleTimer);
    };
    const request = {
      on(name: string, handler: (value?: unknown) => void) { requestHandlers.set(name, handler); return request; },
      destroy(error?: Error) {
        boundary.requestDestroyCount += 1;
        stop();
        if (error !== undefined) requestHandlers.get('error')?.(error);
      },
      end() {
        queueMicrotask(() => {
          if (stopped) return;
          if (boundary.fetchScenario === 'timeout') {
            requestHandlers.get('timeout')?.();
            return;
          }
          const responseHandlers = new Map<string, (value?: unknown) => void>();
          const response = {
            statusCode: boundary.fetchScenario === 'status' ? 503
              : boundary.fetchScenario === 'redirect' ? 302 : 200,
            headers: {
              ...(boundary.fetchScenario === 'redirect'
                ? { location: 'https://example.invalid/archive.tgz' } : {}),
              ...(boundary.fetchScenario === 'oversize'
                ? { 'content-length': String(256 * 1024 * 1024 + 1) } : {}),
            },
            on(name: string, handler: (value?: unknown) => void) {
              responseHandlers.set(name, handler); return response;
            },
            resume() {},
            destroy() { boundary.responseDestroyCount += 1; stop(); },
          };
          callback(response);
          if (boundary.fetchScenario === 'status' || boundary.fetchScenario === 'redirect'
              || boundary.fetchScenario === 'oversize' || stopped) return;
          if (boundary.fetchScenario === 'trickle') {
            trickleTimer = setInterval(() => {
              if (stopped) return;
              boundary.dataEvents += 1;
              responseHandlers.get('data')?.(Buffer.from('x'));
            }, 1_000);
            return;
          }
          const body = boundary.fetchScenario === 'sri'
            ? Buffer.from('wrong archive') : Buffer.from(boundary.downloads.get(String(url))!);
          boundary.dataEvents += 1;
          responseHandlers.get('data')?.(body);
          responseHandlers.get('end')?.();
        });
      },
    };
    return request;
  },
}));

function archivePath(body: Buffer) {
  const digest = createHash('sha512').update(body).digest('hex');
  return `${CACHE_ROOT}/_cacache/content-v2/sha512/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest.slice(4)}`;
}

function fixtureLock() {
  const packages: Record<string, unknown> = {};
  const snapshots: Record<string, unknown> = {};
  for (const [key, dependencies] of Object.entries(EDGES)) {
    const body = Buffer.from(`archive:${key}`);
    const separator = key.lastIndexOf('@');
    const name = key.slice(0, separator);
    const version = key.slice(separator + 1);
    packages[key] = { resolution: {
      integrity: `sha512-${createHash('sha512').update(body).digest('base64')}`,
    } };
    snapshots[key] = { dependencies: Object.fromEntries(dependencies.map(value => {
      const edgeSeparator = value.lastIndexOf('@');
      return [value.slice(0, edgeSeparator), value.slice(edgeSeparator + 1)];
    })) };
    const leaf = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
    boundary.downloads.set(`https://registry.npmjs.org/${name}/-/${leaf}-${version}.tgz`, body);
  }
  return { packages, snapshots };
}

function seedValidCache() {
  for (const body of boundary.downloads.values()) {
    boundary.archives.set(archivePath(body), { body: Buffer.from(body), mode: 0o400 });
  }
}

beforeEach(() => {
  vi.restoreAllMocks();
  boundary.directories.clear();
  boundary.archives.clear();
  boundary.pending.clear();
  boundary.committed.clear();
  boundary.downloads.clear();
  boundary.nextDescriptor = 100;
  boundary.fetches = 0;
  boundary.fetchScenario = 'success';
  boundary.changedSource = false;
  boundary.escapedRoot = '';
  boundary.responseDestroyCount = 0;
  boundary.requestDestroyCount = 0;
  boundary.dataEvents = 0;
  for (const path of [ROOT, `${ROOT}/toolchain`, `${ROOT}/toolchain/node-v22.22.3-linux-x64`,
    `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin`, `${ROOT}/toolchain/yaml-2.9.0/package`,
    `${ROOT}/cache`]) boundary.directories.set(path, 0o700);
  for (const path of [
    'scripts/bootstrap-genesis002-local-binding-cache.mjs', 'scripts/local-binding-bounded-file.mjs',
    'scripts/local-binding-runtime-core.mjs', 'scripts/local-binding-runtime-yaml-v1.json',
    'spacetimedb/pnpm-lock.yaml', 'spacetimedb/pnpm-workspace.yaml',
  ]) boundary.committed.set(path, Buffer.from(`committed:${path}`));
  boundary.lock = fixtureLock();
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
  vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
  vi.spyOn(process, 'execPath', 'get').mockReturnValue(NODE_PATH);
  vi.spyOn(process, 'execArgv', 'get').mockReturnValue([]);
  Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 });
});

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(() => {
  if (ORIGINAL_GETUID === undefined) delete (process as { getuid?: unknown }).getuid;
  else Object.defineProperty(process, 'getuid', ORIGINAL_GETUID);
});

async function bootstrap() {
  const module = await import('../scripts/bootstrap-genesis002-local-binding-cache.mjs');
  return module.bootstrapGenesis002LocalBindingCache();
}

describe('fixed Genesis 002 local-binding cache bootstrap', () => {
  it('rejects explicit undefined before side effects and exports no test injection', async () => {
    const module = await import('../scripts/bootstrap-genesis002-local-binding-cache.mjs');
    expect(Object.keys(module).sort()).toEqual([
      'Genesis002LocalBindingCacheError', 'bootstrapGenesis002LocalBindingCache',
    ]);
    await expect((module.bootstrapGenesis002LocalBindingCache as unknown as
      (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'GENESIS002_LOCAL_BINDING_CACHE_ARGUMENTS_INVALID' });
    expect(boundary.fetches).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each([
    ['platform', () => vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')],
    ['root identity', () => { boundary.escapedRoot = ROOT; }],
    ['root mode', () => { boundary.directories.set(ROOT, 0o755); }],
    ['source', () => { boundary.changedSource = true; }],
  ] as const)('rejects wrong %s before fetching or cache installation', async (_name, mutate) => {
    mutate();
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each(['status', 'redirect', 'oversize', 'timeout'] as const)(
    'rejects a %s response before cache installation', async scenario => {
      boundary.fetchScenario = scenario;
      await expect(bootstrap()).rejects.toBeInstanceOf(Error);
      expect(boundary.fetches).toBe(1);
      expect(boundary.archives.size).toBe(0);
    },
  );

  it('rejects an SRI mismatch before opening the destination', async () => {
    boundary.fetchScenario = 'sri';
    await expect(bootstrap()).rejects.toMatchObject({
      code: 'GENESIS002_LOCAL_BINDING_CACHE_ARCHIVE_INVALID',
    });
    expect(boundary.pending.size).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each([
    ['mode', (body: Buffer) => ({ body: Buffer.from(body), mode: 0o600 })],
    ['content', (_body: Buffer) => ({ body: Buffer.from('mismatched'), mode: 0o400 })],
  ] as const)('rejects an existing-file %s mismatch without fetch or overwrite', async (_name, entry) => {
    const body = boundary.downloads.values().next().value as Buffer;
    const path = archivePath(body);
    boundary.archives.set(path, entry(body));
    const before = Buffer.from(boundary.archives.get(path)!.body);
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0);
    expect(boundary.archives.get(path)?.body).toEqual(before);
  });

  it('enforces the absolute deadline despite continuous response activity and cancels late effects', async () => {
    vi.useFakeTimers();
    boundary.fetchScenario = 'trickle';
    let outcome = 'pending';
    void bootstrap().then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(boundary.dataEvents).toBeGreaterThan(1);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('rejected');
    expect(boundary.responseDestroyCount).toBe(1);
    expect(boundary.requestDestroyCount).toBe(1);
    expect(boundary.archives.size).toBe(0);
    const eventsAtDeadline = boundary.dataEvents;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(boundary.dataEvents).toBe(eventsAtDeadline);
    expect(boundary.archives.size).toBe(0);
  });

  it('installs exactly 15 verified 0400 archives and clears the deadline without late effects', async () => {
    vi.useFakeTimers();
    const result = await bootstrap();
    expect(result).toMatchObject({ packageCount: 15, installedCount: 15 });
    expect(boundary.fetches).toBe(15);
    expect([...boundary.archives.values()].every(value => value.mode === 0o400)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const before = boundary.archives.size;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(boundary.archives.size).toBe(before);
    expect(boundary.responseDestroyCount).toBe(0);
    expect(boundary.requestDestroyCount).toBe(0);
  });

  it('is idempotent for the exact valid cache without fetching or mutating PTR cache', async () => {
    seedValidCache();
    const before = [...boundary.archives].map(([path, value]) => [path, Buffer.from(value.body)] as const);
    const result = await bootstrap();
    expect(result).toMatchObject({ packageCount: 15, installedCount: 0 });
    expect(boundary.fetches).toBe(0);
    expect([...boundary.archives].map(([path, value]) => [path, value.body])).toEqual(before);
    expect([...boundary.directories.keys()].some(path => path.includes('/cache/ptr'))).toBe(false);
  });
});
