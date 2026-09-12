// @vitest-environment node

import { createHash } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT = '/home/warpkeep/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const CACHE_ROOT = `${ROOT}/cache/ptr`;
const ORIGINAL_GETUID = Object.getOwnPropertyDescriptor(process, 'getuid');
const EDGES = Object.freeze({
  '@esbuild/linux-x64@0.25.12': [],
  'base64-js@1.5.1': [],
  'esbuild@0.25.12': ['@esbuild/linux-x64@0.25.12'],
  'get-tsconfig@4.14.3': ['resolve-pkg-maps@1.0.0'],
  'headers-polyfill@4.0.3': [],
  'object-inspect@1.13.4': [],
  'prettier@3.9.6': [],
  'pure-rand@7.0.1': [],
  'resolve-pkg-maps@1.0.0': [],
  'safe-stable-stringify@2.5.0': [],
  'spacetimedb@2.6.1': [
    'base64-js@1.5.1', 'headers-polyfill@4.0.3', 'object-inspect@1.13.4',
    'prettier@3.9.6', 'pure-rand@7.0.1', 'safe-stable-stringify@2.5.0',
    'statuses@2.0.2', 'url-polyfill@1.1.14',
  ],
  'statuses@2.0.2': [],
  'tsx@4.20.6': ['esbuild@0.25.12', 'get-tsconfig@4.14.3'],
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
    | 'success' | 'status' | 'redirect' | 'encoding' | 'oversize' | 'timeout' | 'sri'
    | 'trickle' | 'truncated' | 'incomplete',
  changedSource: '',
  mutateDuringDownload: '',
  currentCommit: '1'.repeat(40),
  escapedRoot: '',
  responseDestroyCount: 0,
  requestDestroyCount: 0,
  dataEvents: 0,
}));

const normalized = (value: unknown) => String(value).replaceAll('\\', '/');

vi.mock('node:child_process', () => ({
  spawnSync(_executable: string, args: readonly string[], options: { encoding: string | null }) {
    let body: Buffer | string;
    if (args[0] === 'rev-parse') body = args.at(-1) === 'HEAD^{tree}' ? '2'.repeat(40) : boundary.currentCommit;
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
    if (exact.includes('/cache/ptr/_cacache/')) {
      const archive = boundary.archives.get(exact);
      if (archive === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (archive.mode !== options.expectedMode) {
        throw new Error('PTR_LOCAL_BINDING_CACHE_ARCHIVE_INVALID');
      }
      return { body: Buffer.from(archive.body), identity: Object.freeze({ path: exact }) };
    }
    if (options.requireExecutable === true) {
      return { body: Buffer.alloc(0), identity: Object.freeze({ path: exact }) };
    }
    const key = [...boundary.committed.keys()].find(value => exact.endsWith(`/${value}`));
    if (key === undefined) throw new Error(`UNEXPECTED_BOUNDED_FILE:${exact}`);
    const body = Buffer.from(boundary.committed.get(key)!);
    if (boundary.changedSource === key) body[0] ^= 1;
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
              ...(boundary.fetchScenario === 'encoding' ? { 'content-encoding': 'gzip' } : {}),
              ...(boundary.fetchScenario === 'truncated' ? { 'content-length': '100' } : {}),
            },
            on(name: string, handler: (value?: unknown) => void) {
              responseHandlers.set(name, handler); return response;
            },
            resume() {},
            destroy() { boundary.responseDestroyCount += 1; stop(); },
          };
          callback(response);
          if (boundary.fetchScenario === 'status' || boundary.fetchScenario === 'redirect'
              || boundary.fetchScenario === 'encoding' || boundary.fetchScenario === 'oversize'
              || stopped) return;
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
          if (boundary.mutateDuringDownload === 'race-valid' || boundary.mutateDuringDownload === 'race-invalid') {
            boundary.archives.set(archivePath(body), { body: boundary.mutateDuringDownload === 'race-valid' ? Buffer.from(body) : Buffer.from('raced-invalid'), mode: 0o400 });
          } else if (boundary.mutateDuringDownload === 'head') boundary.currentCommit = '9'.repeat(40);
          else if (boundary.mutateDuringDownload) boundary.changedSource = boundary.mutateDuringDownload;
          responseHandlers.get('data')?.(body);
          if (boundary.fetchScenario === 'incomplete') responseHandlers.get('close')?.();
          else responseHandlers.get('end')?.();
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
  Object.assign(packages['@esbuild/linux-x64@0.25.12'] as object, { os: ['linux'], cpu: ['x64'] });
  Object.assign(snapshots['@esbuild/linux-x64@0.25.12'] as object, { optional: true });
  const dependencyEntries = (values: Record<string, string>) => Object.fromEntries(
    Object.entries(values).map(([name, version]) => [name, { specifier: version, version }]));
  return { lockfileVersion: '9.0', settings: { autoInstallPeers: true, excludeLinksFromLockfile: false },
    importers: { '.': { dependencies: dependencyEntries({ spacetimedb: '2.6.1' }),
      devDependencies: dependencyEntries({ esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' }) } },
    packages, snapshots };

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
  boundary.changedSource = '';
  boundary.mutateDuringDownload = '';
  boundary.currentCommit = '1'.repeat(40);
  boundary.escapedRoot = '';
  boundary.responseDestroyCount = 0;
  boundary.requestDestroyCount = 0;
  boundary.dataEvents = 0;
  for (const path of [ROOT, `${ROOT}/toolchain`, `${ROOT}/toolchain/node-v22.22.3-linux-x64`,
    `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin`, `${ROOT}/toolchain/yaml-2.9.0/package`,
    `${ROOT}/cache`]) boundary.directories.set(path, 0o700);
  for (const path of [
    'scripts/bootstrap-ptr-local-binding-cache.mjs', 'scripts/local-binding-bounded-file.mjs',
    'scripts/local-preparation-archive-download.mjs',
    'scripts/local-binding-runtime-core.mjs', 'scripts/local-binding-runtime-cli-snapshot.mjs',
    'scripts/local-program-artifact.mjs', 'scripts/local-binding-native-ts-hooks.mjs',
    'scripts/local-binding-runtime-process.mjs', 'scripts/local-binding-runtime-yaml-v1.json',
    'spacetimedb/ptr/pnpm-lock.yaml', 'spacetimedb/ptr/package.json',
  ]) boundary.committed.set(path, Buffer.from(`committed:${path}`));
  boundary.committed.set('spacetimedb/ptr/package.json', Buffer.from(JSON.stringify({
    name: 'warpkeep-ptr-spacetimedb-module', private: true, type: 'module', packageManager: 'pnpm@11.7.0',
    dependencies: { spacetimedb: '2.6.1' },
    devDependencies: { esbuild: '0.25.12', tsx: '4.20.6', typescript: '5.6.3' },
  })));
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
  const module = await import('../scripts/bootstrap-ptr-local-binding-cache.mjs');
  return module.bootstrapPtrLocalBindingCache();
}

describe('fixed PTR local-binding cache bootstrap', () => {
  it('revalidates an archive created concurrently without clobbering or counting it as installed', async () => {
    boundary.mutateDuringDownload = 'race-valid';
    const result = await bootstrap();
    expect(result.installedCount).toBe(0);
    expect(boundary.archives.size).toBe(15);
    expect(boundary.pending.size).toBe(0);
  });
  it('preserves and rejects invalid bytes that race the exclusive destination creation', async () => {
    boundary.mutateDuringDownload = 'race-invalid';
    await expect(bootstrap()).rejects.toMatchObject({ code: 'PTR_LOCAL_BINDING_CACHE_ARCHIVE_INVALID' });
    expect(boundary.archives.size).toBe(1);
    expect([...boundary.archives.values()][0]?.body.toString()).toBe('raced-invalid');
    expect(boundary.pending.size).toBe(0);
  });

  it.each(['head', 'spacetimedb/ptr/pnpm-lock.yaml', 'scripts/local-program-artifact.mjs'])(
    'refuses source %s changing during download before creating an archive', async changed => {
      boundary.mutateDuringDownload = changed;
      await expect(bootstrap()).rejects.toBeInstanceOf(Error);
      expect(boundary.fetches).toBe(1);
      expect(boundary.archives.size).toBe(0);
    });

  it.each(['importer', 'platform', 'edge', 'integrity', 'optional'])(
    'rejects invalid selected %s before any network request', async kind => {
      const lock = boundary.lock as Record<string, any>;
      if (kind === 'importer') lock.importers.extra = lock.importers['.'];
      if (kind === 'platform') lock.packages['@esbuild/linux-x64@0.25.12'].cpu = ['arm64'];
      if (kind === 'edge') lock.snapshots['spacetimedb@2.6.1'].dependencies.prettier = '3.9.5';
      if (kind === 'integrity') lock.packages['typescript@5.6.3'].resolution.tarball = 'https://example.invalid/x';
      if (kind === 'optional') delete lock.snapshots['@esbuild/linux-x64@0.25.12'].optional;
      await expect(bootstrap()).rejects.toBeInstanceOf(Error);
      expect(boundary.fetches).toBe(0);
    });

  it('accepts the actual committed PTR lock platform graph before the controlled network rejection', async () => {
    const actualFs = await vi.importActual<typeof import('node:fs')>('node:fs');
    const yaml = await vi.importActual<typeof import('yaml')>('yaml');
    boundary.lock = yaml.parse(actualFs.readFileSync(new URL('../spacetimedb/ptr/pnpm-lock.yaml', import.meta.url), 'utf8'));
    boundary.fetchScenario = 'status';
    await expect(bootstrap()).rejects.toMatchObject({ code: 'PTR_LOCAL_BINDING_CACHE_FETCH_REJECTED' });
    expect(boundary.fetches).toBe(1);
    expect(boundary.archives.size).toBe(0);
  });

  it('rejects explicit undefined before side effects and exports no test injection', async () => {
    const module = await import('../scripts/bootstrap-ptr-local-binding-cache.mjs');
    expect(Object.keys(module).sort()).toEqual([
      'PtrLocalBindingCacheError', 'bootstrapPtrLocalBindingCache',
    ]);
    await expect((module.bootstrapPtrLocalBindingCache as unknown as
      (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'PTR_LOCAL_BINDING_CACHE_ARGUMENTS_INVALID' });
    expect(boundary.fetches).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each([
    ['platform', () => vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')],
    ['root identity', () => { boundary.escapedRoot = ROOT; }],
    ['root mode', () => { boundary.directories.set(ROOT, 0o755); }],
    ['source', () => { boundary.changedSource = 'scripts/bootstrap-ptr-local-binding-cache.mjs'; }],
  ] as const)('rejects wrong %s before fetching or cache installation', async (_name, mutate) => {
    mutate();
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each([
    'scripts/local-binding-runtime-cli-snapshot.mjs',
    'scripts/local-binding-runtime-process.mjs',
  ])('rejects drift in executing helper %s before fetch or cache installation', async path => {
    boundary.changedSource = path;
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each(['status', 'redirect', 'encoding', 'oversize', 'timeout', 'truncated', 'incomplete'] as const)(
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
      code: 'PTR_LOCAL_BINDING_CACHE_ARCHIVE_INVALID',
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

  it('is idempotent for the exact valid cache without fetching or mutating G002 cache', async () => {
    seedValidCache();
    const before = [...boundary.archives].map(([path, value]) => [path, Buffer.from(value.body)] as const);
    const result = await bootstrap();
    expect(result).toMatchObject({ packageCount: 15, installedCount: 0 });
    expect(boundary.fetches).toBe(0);
    expect([...boundary.archives].map(([path, value]) => [path, value.body])).toEqual(before);
    expect([...boundary.directories.keys()].some(path => path.includes('/cache/genesis002'))).toBe(false);
  });
});
