// @vitest-environment node

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const NODE_PATH = `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin/node`;
const CACHE_ROOT = `${ROOT}/cache/operation-bundles`;
const ORIGINAL_GETUID = Object.getOwnPropertyDescriptor(process, 'getuid');
const ESBUILD_URL = 'https://registry.npmjs.org/esbuild/-/esbuild-0.28.1.tgz';
const LINUX_X64_URL = 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.28.1.tgz';
const ESBUILD_SRI = 'sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==';
const LINUX_X64_SRI = 'sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==';
const ESBUILD_BODY = Buffer.from('fixture:esbuild-0.28.1');
const LINUX_X64_BODY = Buffer.from('fixture:@esbuild/linux-x64-0.28.1');
const FFLATE_URL = 'https://registry.npmjs.org/fflate/-/fflate-0.8.3.tgz';
const FFLATE_SRI = 'sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==';
const FFLATE_BODY = Buffer.from('fixture:fflate-0.8.3');

type Directory = { mode: number; uid: number; symbolic?: boolean; escaped?: boolean };
type Archive = { body: Buffer; mode: number; uid: number; symbolic?: boolean };
type Scenario = 'success' | 'status' | 'redirect' | 'encoding' | 'declared'
  | 'streamed' | 'timeout' | 'truncated' | 'incomplete' | 'sri' | 'trickle';

const boundary = vi.hoisted(() => ({
  directories: new Map<string, Directory>(),
  archives: new Map<string, Archive>(),
  pending: new Map<number, { path: string; body: Buffer; mode: number }>(),
  downloads: new Map<string, Buffer>(),
  lock: {} as Record<string, unknown>,
  nextDescriptor: 100,
  fetches: [] as string[],
  scenario: 'success' as Scenario,
  responseDestroyCount: 0,
  requestDestroyCount: 0,
  dataEvents: 0,
  driftAfterFetchPath: '',
}));

const normalized = (value: unknown) => String(value).replaceAll('\\', '/');
const sriHex = (integrity: string) => Buffer.from(integrity.slice('sha512-'.length), 'base64').toString('hex');
const archivePath = (integrity: string) => {
  const digest = sriHex(integrity);
  return `${CACHE_ROOT}/_cacache/content-v2/sha512/${digest.slice(0, 2)}/${digest.slice(2, 4)}/${digest.slice(4)}`;
};

vi.mock('node:crypto', async () => {
  const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
  const esbuildBody = Buffer.from('fixture:esbuild-0.28.1');
  const linuxX64Body = Buffer.from('fixture:@esbuild/linux-x64-0.28.1');
  const digestHex = (integrity: string) => Buffer.from(
    integrity.slice('sha512-'.length), 'base64',
  ).toString('hex');
  return {
    ...actual,
    createHash(algorithm: string) {
      if (algorithm !== 'sha512') return actual.createHash(algorithm);
      const chunks: Buffer[] = [];
      return {
        update(value: Buffer) { chunks.push(Buffer.from(value)); return this; },
        digest(encoding: 'hex') {
          const body = Buffer.concat(chunks);
          if (body.equals(Buffer.from('fixture:fflate-0.8.3'))) return digestHex('sha512-tbZNuJrLwGUp3zshBtdy4W+ORxZuIh8a5ilyIEQDC5rY1f3U20JMry0Ll3WBzU58EZKsEuJFXhb5gwv8CsPvgA==');
          if (body.equals(esbuildBody)) return digestHex('sha512-HrJrvZv5ayxBzPfwphOoNzkzOIIlifzk0KJrGK2c8R4+LKpMtpYLQeUdjnwjWv/LZlkH2laZk+4w78pi99D4Vw==');
          if (body.equals(linuxX64Body)) return digestHex('sha512-u/anNYF2mmVOEDwLtnQ1wOr3EZ9sTNGLWrsYGYwHWzGA3Si84IOkHXlbWTD1NB+9/1lcnweYKO54uhxZydNzfA==');
          return actual.createHash('sha512').update(body).digest(encoding);
        },
      };
    },
  };
});

vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({
  readLocalBindingBoundedFile(path: string, options: Record<string, unknown>) {
    const exact = normalized(path);
    if (exact.endsWith('/package-lock.json')) {
      const body = Buffer.from(JSON.stringify(boundary.lock));
      if (body.length > Number(options.maximumBytes)) throw new Error('LOCAL_BINDING_BOUNDED_FILE_INVALID');
      return { body, identity: Object.freeze({ path: exact }) };
    }
    if (exact.includes('/cache/operation-bundles/_cacache/')) {
      const archive = boundary.archives.get(exact);
      if (archive === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      if (archive.symbolic === true || archive.mode !== options.expectedMode
          || archive.uid !== options.expectedUid) {
        throw new Error('LOCAL_BINDING_BOUNDED_FILE_INVALID');
      }
      return { body: Buffer.from(archive.body), identity: Object.freeze({ path: exact }) };
    }
    if (options.requireExecutable === true) {
      return { body: Buffer.alloc(0), identity: Object.freeze({ path: exact }) };
    }
    throw new Error(`UNEXPECTED_BOUNDED_FILE:${exact}`);
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return {
    ...actual,
    lstatSync(path: string) {
      const exact = normalized(path);
      const directory = boundary.directories.get(exact);
      if (directory !== undefined) return {
        mode: BigInt(0o040000 | directory.mode), uid: BigInt(directory.uid),
        isDirectory: () => !directory.symbolic, isSymbolicLink: () => directory.symbolic === true,
        isFile: () => false,
      };
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    realpathSync(path: string) {
      const directory = boundary.directories.get(normalized(path));
      return directory?.escaped === true ? `${path}-escaped` : path;
    },
    existsSync(path: string) {
      const exact = normalized(path);
      return boundary.directories.has(exact) || boundary.archives.has(exact);
    },
    mkdirSync(path: string, options?: { mode?: number }) {
      boundary.directories.set(normalized(path), { mode: options?.mode ?? 0o777, uid: 1000 });
    },
    chmodSync(path: string, mode: number) {
      boundary.directories.set(normalized(path), { mode, uid: 1000 });
    },
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
        boundary.archives.set(pending.path, { body: pending.body, mode: pending.mode, uid: 1000 });
        boundary.pending.delete(descriptor);
      }
    },
    fsyncSync() {},
  };
});

vi.mock('node:https', () => ({
  request(url: URL, _options: unknown, callback: (response: unknown) => void) {
    boundary.fetches.push(String(url));
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
          if (boundary.scenario === 'timeout') {
            requestHandlers.get('timeout')?.();
            return;
          }
          const responseHandlers = new Map<string, (value?: unknown) => void>();
          const response = {
            statusCode: boundary.scenario === 'status' ? 503 : 200,
            headers: {
              ...(boundary.scenario === 'redirect' ? { location: 'https://example.invalid/archive.tgz' } : {}),
              ...(boundary.scenario === 'encoding' ? { 'content-encoding': 'gzip' } : {}),
              ...(boundary.scenario === 'declared' ? { 'content-length': '01' } : {}),
              ...(boundary.scenario === 'truncated' ? { 'content-length': '100' } : {}),
            },
            on(name: string, handler: (value?: unknown) => void) {
              responseHandlers.set(name, handler); return response;
            },
            destroy() { boundary.responseDestroyCount += 1; stop(); },
          };
          callback(response);
          if (['status', 'redirect', 'encoding', 'declared'].includes(boundary.scenario) || stopped) return;
          if (boundary.scenario === 'trickle') {
            trickleTimer = setInterval(() => {
              if (stopped) return;
              boundary.dataEvents += 1;
              responseHandlers.get('data')?.(Buffer.from('x'));
            }, 1_000);
            return;
          }
          let body = boundary.scenario === 'sri' ? Buffer.from('wrong archive')
            : Buffer.from(boundary.downloads.get(String(url))!);
          if (boundary.scenario === 'streamed') body = Buffer.alloc(33 * 1024 * 1024, 1);
          boundary.dataEvents += 1;
          responseHandlers.get('data')?.(body);
          if (boundary.scenario === 'incomplete') responseHandlers.get('close')?.();
          else responseHandlers.get('end')?.();
          if (boundary.driftAfterFetchPath !== '' && boundary.fetches.length === 2) {
            boundary.directories.get(boundary.driftAfterFetchPath)!.mode = 0o755;
          }
        });
      },
    };
    return request;
  },
}));

function fixtureLock() {
  return {
    lockfileVersion: 3,
    packages: {
      'node_modules/esbuild': {
        version: '0.28.1', resolved: ESBUILD_URL, integrity: ESBUILD_SRI,
        optionalDependencies: { '@esbuild/linux-x64': '0.28.1', '@esbuild/win32-x64': '0.28.1' },
      },
      'node_modules/@esbuild/linux-x64': {
        version: '0.28.1', resolved: LINUX_X64_URL, integrity: LINUX_X64_SRI,
        os: ['linux'], cpu: ['x64'], optional: true,
      },
      'node_modules/@esbuild/win32-x64': {
        version: '0.28.1', resolved: 'https://registry.npmjs.org/@esbuild/win32-x64/-/win32-x64-0.28.1.tgz',
        integrity: 'sha512-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
        os: ['win32'], cpu: ['x64'], optional: true,
      },
    },
  };
}

function seedValidCache() {
  boundary.archives.set(archivePath(ESBUILD_SRI), { body: Buffer.from(ESBUILD_BODY), mode: 0o400, uid: 1000 });
  boundary.archives.set(archivePath(LINUX_X64_SRI), { body: Buffer.from(LINUX_X64_BODY), mode: 0o400, uid: 1000 });
}

beforeEach(() => {
  vi.restoreAllMocks();
  boundary.directories.clear();
  boundary.archives.clear();
  boundary.pending.clear();
  boundary.downloads.clear();
  boundary.nextDescriptor = 100;
  boundary.fetches.length = 0;
  boundary.scenario = 'success';
  boundary.responseDestroyCount = 0;
  boundary.requestDestroyCount = 0;
  boundary.dataEvents = 0;
  boundary.driftAfterFetchPath = '';
  for (const path of [ROOT, `${ROOT}/toolchain`, `${ROOT}/toolchain/node-v22.22.3-linux-x64`,
    `${ROOT}/toolchain/node-v22.22.3-linux-x64/bin`, `${ROOT}/cache`]) {
    boundary.directories.set(path, { mode: 0o700, uid: 1000 });
  }
  boundary.downloads.set(ESBUILD_URL, ESBUILD_BODY);
  boundary.downloads.set(LINUX_X64_URL, LINUX_X64_BODY);
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

async function module_() {
  return import('../scripts/bootstrap-operation-bundle-cache.mjs');
}

async function bootstrap() {
  return (await module_()).bootstrapOperationBundleCache();
}

describe('fixed Linux operation compiler archive bootstrap', () => {
  function addRecoveryPin() {
    (boundary.lock.packages as Record<string, unknown>)['node_modules/fflate'] = {
      version: '0.8.3', resolved: FFLATE_URL, integrity: FFLATE_SRI,
    };
    boundary.downloads.set(FFLATE_URL, FFLATE_BODY);
  }

  it('bootstraps exactly three recovery archives and reuses them without transport', async () => {
    addRecoveryPin();
    const { bootstrapRecoveryBundleCache: recovery } = await module_();
    await expect(recovery()).resolves.toEqual({
      profile: 'warpkeep-recovery-bundle-cache-bootstrap-linux-x64-v1', packageCount: 3, installedCount: 3,
    });
    expect(boundary.fetches).toEqual([ESBUILD_URL, LINUX_X64_URL, FFLATE_URL]);
    boundary.fetches.length = 0;
    await expect(recovery()).resolves.toMatchObject({packageCount: 3, installedCount: 0});
    expect(boundary.fetches).toEqual([]);
    await expect(bootstrap()).resolves.toMatchObject({packageCount: 2, installedCount: 0});
  });

  it('rejects missing recovery pins and caller overrides before transport', async () => {
    const { bootstrapRecoveryBundleCache: recovery } = await module_();
    await expect(recovery()).rejects.toMatchObject({code: 'OPERATION_BUNDLE_CACHE_LOCK_INVALID'});
    await expect(Reflect.apply(recovery, null, [undefined])).rejects.toMatchObject({code: 'OPERATION_BUNDLE_CACHE_ARGUMENTS_INVALID'});
    expect(boundary.fetches).toEqual([]); expect(boundary.archives.size).toBe(0);
  });

  it('preserves and rejects corrupted recovery cache bytes without replacing them', async () => {
    addRecoveryPin();
    const { bootstrapRecoveryBundleCache: recovery } = await module_();
    await recovery();
    const cached = boundary.archives.get(archivePath(FFLATE_SRI))!;
    cached.body = Buffer.from('corrupt'); boundary.fetches.length = 0;
    await expect(recovery()).rejects.toMatchObject({code: 'OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID'});
    expect(cached.body.toString()).toBe('corrupt'); expect(boundary.fetches).toEqual([]);
  });
  it('rejects explicit undefined before side effects and exposes no authority seam', async () => {
    const module = await module_();
    expect(Object.keys(module).sort()).toEqual([
      'OperationBundleCacheError', 'bootstrapOperationBundleCache', 'bootstrapRecoveryBundleCache',
    ]);
    await expect((module.bootstrapOperationBundleCache as unknown as
      (value: unknown) => Promise<unknown>)(undefined))
      .rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_ARGUMENTS_INVALID' });
    expect(boundary.fetches).toHaveLength(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each([
    ['platform', () => vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')],
    ['architecture', () => vi.spyOn(process, 'arch', 'get').mockReturnValue('arm64')],
    ['uid', () => Object.defineProperty(process, 'getuid', { configurable: true, value: () => 0 })],
    ['node path', () => vi.spyOn(process, 'execPath', 'get').mockReturnValue('/usr/bin/node')],
  ] as const)('rejects wrong %s before transport or installation', async (_name, mutate) => {
    mutate();
    await expect(bootstrap()).rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_HOST_INVALID' });
    expect(boundary.fetches).toHaveLength(0);
    expect(boundary.archives.size).toBe(0);
  });

  it('rejects a non-canonical private root before transport or installation', async () => {
    boundary.directories.get(ROOT)!.escaped = true;
    await expect(bootstrap()).rejects.toMatchObject({
      code: 'OPERATION_BUNDLE_CACHE_DIRECTORY_INVALID',
    });
    expect(boundary.fetches).toHaveLength(0);
    expect(boundary.archives.size).toBe(0);
  });

  it('rejects a non-registry transport URL before making a request', async () => {
    const { downloadLocalPreparationArchive } = await import('../scripts/local-preparation-archive-download.mjs');
    await expect(downloadLocalPreparationArchive(new URL('https://example.invalid/archive.tgz'), {
      maximumBytes: 32, deadlineMs: 30_000, errorCode: 'TEST_FETCH_REJECTED',
    })).rejects.toThrow('TEST_FETCH_REJECTED');
    expect(boundary.fetches).toHaveLength(0);
  });

  it('selects exactly the two fixed Linux packages while ignoring other platform lock entries', async () => {
    const result = await bootstrap();
    expect(result).toEqual({
      profile: 'warpkeep-operation-bundle-cache-bootstrap-linux-x64-v1',
      packageCount: 2,
      installedCount: 2,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(boundary.fetches).toEqual([ESBUILD_URL, LINUX_X64_URL]);
    expect(boundary.archives.size).toBe(2);
  });

  it.each([
    ['esbuild version', (lock: any) => { lock.packages['node_modules/esbuild'].version = '0.28.0'; }],
    ['esbuild resolved URL', (lock: any) => { lock.packages['node_modules/esbuild'].resolved += '?mirror=1'; }],
    ['esbuild integrity', (lock: any) => { lock.packages['node_modules/esbuild'].integrity = LINUX_X64_SRI; }],
    ['optional Linux version', (lock: any) => { lock.packages['node_modules/esbuild'].optionalDependencies['@esbuild/linux-x64'] = '0.28.0'; }],
    ['companion version', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].version = '0.28.0'; }],
    ['companion resolved URL', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].resolved = ESBUILD_URL; }],
    ['companion integrity', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].integrity = ESBUILD_SRI; }],
    ['companion os', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].os = ['darwin']; }],
    ['companion cpu', (lock: any) => { lock.packages['node_modules/@esbuild/linux-x64'].cpu = ['arm64']; }],
  ])('rejects %s drift before transport or installation', async (_name, mutate) => {
    mutate(boundary.lock);
    await expect(bootstrap()).rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_LOCK_INVALID' });
    expect(boundary.fetches).toHaveLength(0);
    expect(boundary.archives.size).toBe(0);
  });

  it('rejects a downloaded SHA512 mismatch before opening the cache destination', async () => {
    boundary.scenario = 'sri';
    await expect(bootstrap()).rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID' });
    expect(boundary.pending.size).toBe(0);
    expect(boundary.archives.size).toBe(0);
  });

  it('accepts an exact existing cache without transport or mutation', async () => {
    seedValidCache();
    const before = [...boundary.archives].map(([path, value]) => [path, Buffer.from(value.body)] as const);
    const result = await bootstrap();
    expect(result.installedCount).toBe(0);
    expect(boundary.fetches).toHaveLength(0);
    expect([...boundary.archives].map(([path, value]) => [path, value.body])).toEqual(before);
  });

  it('revalidates the complete private cache namespace after downloads', async () => {
    boundary.driftAfterFetchPath = `${CACHE_ROOT}/_cacache`;
    await expect(bootstrap()).rejects.toMatchObject({
      code: 'OPERATION_BUNDLE_CACHE_DIRECTORY_INVALID',
    });
  });

  it.each([
    ['content', (entry: Archive) => { entry.body = Buffer.from('corrupt'); }],
    ['mode', (entry: Archive) => { entry.mode = 0o600; }],
    ['owner', (entry: Archive) => { entry.uid = 0; }],
    ['symlink', (entry: Archive) => { entry.symbolic = true; }],
  ] as const)('rejects existing archive %s drift without fetch or replacement', async (_name, mutate) => {
    seedValidCache();
    const path = archivePath(ESBUILD_SRI);
    const entry = boundary.archives.get(path)!;
    mutate(entry);
    const before = Buffer.from(entry.body);
    await expect(bootstrap()).rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_ARCHIVE_INVALID' });
    expect(boundary.fetches).toHaveLength(0);
    expect(boundary.archives.get(path)?.body).toEqual(before);
  });

  it.each([
    ['writable', (directory: Directory) => { directory.mode = 0o755; }],
    ['wrong owner', (directory: Directory) => { directory.uid = 0; }],
    ['symlink', (directory: Directory) => { directory.symbolic = true; }],
  ] as const)('rejects a %s cache namespace without fetch or mutation', async (_name, mutate) => {
    const directory = boundary.directories.get(`${ROOT}/cache`)!;
    mutate(directory);
    await expect(bootstrap()).rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_DIRECTORY_INVALID' });
    expect(boundary.fetches).toHaveLength(0);
    expect(boundary.archives.size).toBe(0);
  });

  it.each(['status', 'redirect', 'encoding', 'declared', 'streamed', 'timeout', 'truncated', 'incomplete'] as const)(
    'rejects a %s transport response without installing an archive', async scenario => {
      boundary.scenario = scenario;
      await expect(bootstrap()).rejects.toMatchObject({ code: 'OPERATION_BUNDLE_CACHE_FETCH_REJECTED' });
      expect(boundary.fetches).toHaveLength(1);
      expect(boundary.archives.size).toBe(0);
    },
  );

  it('enforces the total deadline during continuous response activity and cancels late effects', async () => {
    vi.useFakeTimers();
    boundary.scenario = 'trickle';
    let outcome = 'pending';
    void bootstrap().then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
    await vi.advanceTimersByTimeAsync(29_999);
    expect(boundary.dataEvents).toBeGreaterThan(1);
    expect(outcome).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    expect(outcome).toBe('rejected');
    expect(boundary.responseDestroyCount).toBe(1);
    expect(boundary.requestDestroyCount).toBe(1);
    const eventsAtDeadline = boundary.dataEvents;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(boundary.dataEvents).toBe(eventsAtDeadline);
    expect(boundary.archives.size).toBe(0);
  });
});
