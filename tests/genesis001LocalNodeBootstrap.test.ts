// @vitest-environment node

import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ROOT = '/home/snapmeter/.warpkeep/release-preparation-v1';
const TOOLCHAIN = `${ROOT}/toolchain`;
const RUNS = `${ROOT}/runs`;
const CACHE_PARENT = `${ROOT}/cache`;
const CACHE = `${CACHE_PARENT}/node-v24.19.0-provenance-v1`;
const BOOTSTRAP_NODE = `${TOOLCHAIN}/node-v22.22.3-linux-x64/bin/node`;
const FINAL_VERSION = `${TOOLCHAIN}/node-v24.19.0-linux-x64`;
const FINAL_BIN = `${FINAL_VERSION}/bin`;
const FINAL_NODE = `${FINAL_BIN}/node`;
const FINGERPRINT = '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356';
const ARCHIVE_HASH = '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647';
const NODE_HASH = 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12';
const ORIGINAL_GETUID = Object.getOwnPropertyDescriptor(process, 'getuid');
const ORIGINAL_NODE_OPTIONS = process.env.NODE_OPTIONS;
const SOURCE_PATHS = [
  'scripts/bootstrap-genesis001-local-node.mjs',
  'scripts/bootstrap-genesis001-local-node-core.mjs',
  'scripts/local-binding-bounded-file.mjs',
  'services/release-recovery/scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
] as const;
const RECORD = {
  version: '24.19.0',
  archiveUrl: 'https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.xz',
  archiveBytes: 31633904,
  archiveSha256: ARCHIVE_HASH,
  archiveMemberPath: 'node-v24.19.0-linux-x64/bin/node', archiveMemberMode: '755',
  archiveMemberBytes: 125989464, archiveMemberSha256: NODE_HASH,
  shasumsUrl: 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt', shasumsBytes: 2967,
  shasumsSha256: 'be0629ee2bcd8e40bb856abdd3407f0762101b76bd60a36b8867f637733631c0',
  signatureUrl: 'https://nodejs.org/dist/v24.19.0/SHASUMS256.txt.sig', signatureBytes: 119,
  signatureSha256: '801534e2d4c769c087e2e3eec89e879032872357e64e82336f86f03e72ece630',
  signingAlgorithm: 'EdDSA', signerFingerprint: FINGERPRINT,
  publicKeyUrl: 'https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/5BE8A3F6C8A5C01D106C0AD820B1A390B168D356.asc',
  publicKeyBytes: 924,
  publicKeySha256: '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
} as const;

type Directory = { mode: number; uid: number; ino: bigint; mtimeNs: bigint; symlink?: boolean };
type FileEntry = { body: Buffer; mode: number; uid: number; valid: boolean; ino: bigint };
const boundary = vi.hoisted(() => ({
  directories: new Map<string, Directory>(), files: new Map<string, FileEntry>(),
  committed: new Map<string, Buffer>(),
  descriptors: new Map<number, { path: string; directory?: boolean; pending?: FileEntry }>(),
  nextDescriptor: 100, nextIno: 1000n, changedSource: '', escapedPath: '',
  invalidFilePath: '',
  fetchScenario: 'status' as 'status' | 'redirect' | 'encoding' | 'oversize' | 'trickle' | 'short',
  processScenario: '' as '' | 'failure' | 'timeout' | 'bad-key' | 'bad-import'
    | 'bad-signature' | 'expired-signature' | 'bad-version' | 'bad-member' | 'mutate-node',
  fetches: 0, writes: 0,
  executions: [] as Array<{ executable: string; arguments: readonly string[]; env: Record<string, string> }>,
  requestDestroys: 0, responseDestroys: 0, dataEvents: 0,
  cleanupFailure: false, fsyncFailure: false,
}));

const normalized = (value: unknown) => String(value).replaceAll('\\', '/');
const identity = (value: { mode: number; uid: number; ino: bigint; mtimeNs?: bigint }, size = 0) => ({
  dev: 1n, ino: value.ino, mode: BigInt(value.mode), uid: BigInt(value.uid), nlink: 1n,
  size: BigInt(size), mtimeNs: value.mtimeNs ?? 1n, ctimeNs: 1n,
});
const directoryState = (value: Directory) => ({
  ...identity({ ...value, mode: 0o040000 | value.mode }),
  isDirectory: () => true, isSymbolicLink: () => value.symlink === true, isFile: () => false,
});
const fileState = (value: FileEntry) => ({
  ...identity({ ...value, mode: 0o100000 | value.mode }, value.body.length),
  isDirectory: () => false, isSymbolicLink: () => false, isFile: () => true,
});

vi.mock('../scripts/local-binding-bounded-file.mjs', () => ({
  readLocalBindingBoundedFile(path: string, options: Record<string, unknown>) {
    const exact = normalized(path);
    const sourcePath = SOURCE_PATHS.find(candidate => exact.endsWith(`/${candidate}`));
    if (sourcePath !== undefined) {
      const body = Buffer.from(boundary.committed.get(sourcePath)!);
      if (boundary.changedSource === sourcePath) body[0] ^= 1;
      if (body.length !== options.expectedBytes
          || createHash('sha256').update(body).digest('hex') !== options.expectedSha256) {
        throw new Error('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
      }
      return { body, identity: identity({ mode: 0o100644, uid: 1000, ino: 5n }, body.length) };
    }
    if (['/usr/lib/os-release', '/usr/bin/git', '/usr/bin/gpg',
      '/usr/bin/gpgv', '/usr/bin/tar', '/usr/bin/xz', BOOTSTRAP_NODE].includes(exact)) {
      if (boundary.invalidFilePath === exact) throw new Error('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
      return { body: Buffer.alloc(0), identity: identity({ mode: 0o100755,
        uid: Number(options.expectedUid ?? 0), ino: BigInt(exact.length + 10) },
      Number(options.expectedBytes ?? 0)) };
    }
    const entry = boundary.files.get(exact);
    if (entry === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    if (!entry.valid || (options.expectedMode !== undefined && entry.mode !== options.expectedMode)
        || (options.expectedUid !== undefined && entry.uid !== options.expectedUid)) {
      throw new Error('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    }
    const state = identity({ mode: 0o100000 | entry.mode, uid: entry.uid, ino: entry.ino }, entry.body.length);
    if (options.expectedIdentity !== undefined
        && Object.entries(options.expectedIdentity as Record<string, unknown>)
          .some(([key, value]) => String(state[key as keyof typeof state]) !== value)) {
      throw new Error('LOCAL_BINDING_BOUNDED_FILE_CHANGED');
    }
    return { body: options.discardBody === true ? Buffer.alloc(0) : Buffer.from(entry.body), identity: state };
  },
}));

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
  return { ...actual,
    existsSync(path: string) { const exact = normalized(path); return boundary.directories.has(exact) || boundary.files.has(exact); },
    lstatSync(path: string) {
      const exact = normalized(path); const dir = boundary.directories.get(exact);
      if (dir !== undefined) return directoryState(dir);
      const file = boundary.files.get(exact); if (file !== undefined) return fileState(file);
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    realpathSync(path: string) { const exact = normalized(path); return boundary.escapedPath === exact ? `${path}-escaped` : path; },
    readdirSync(path: string) {
      const exact = `${normalized(path)}/`; const names = new Set<string>();
      for (const candidate of [...boundary.directories.keys(), ...boundary.files.keys()]) {
        if (candidate.startsWith(exact)) { const rest = candidate.slice(exact.length); if (rest && !rest.includes('/')) names.add(rest); }
      }
      return [...names];
    },
    mkdirSync(path: string, options?: { mode?: number }) {
      const exact = normalized(path);
      if (boundary.directories.has(exact) || boundary.files.has(exact)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
      boundary.directories.set(exact, { mode: options?.mode ?? 0o777, uid: 1000, ino: boundary.nextIno++, mtimeNs: 1n });
      const parent = exact.slice(0, exact.lastIndexOf('/'));
      const parentEntry = boundary.directories.get(parent);
      if (parentEntry !== undefined) parentEntry.mtimeNs += 1n;
    },
    chmodSync(path: string, mode: number) { const entry = boundary.directories.get(normalized(path)); if (entry) entry.mode = mode; },
    openSync(path: string, flags: number, mode?: number) {
      const exact = normalized(path); const descriptor = boundary.nextDescriptor++;
      if ((flags & actual.constants.O_WRONLY) !== 0) {
        if (boundary.files.has(exact)) throw Object.assign(new Error('EEXIST'), { code: 'EEXIST' });
        boundary.descriptors.set(descriptor, { path: exact, pending: {
          body: Buffer.alloc(0), mode: mode ?? 0, uid: 1000, valid: true, ino: boundary.nextIno++,
        } });
      } else boundary.descriptors.set(descriptor, { path: exact, directory: true });
      return descriptor;
    },
    writeSync(descriptor: number, body: Buffer, offset: number, length: number) {
      boundary.writes += 1; const entry = boundary.descriptors.get(descriptor)!.pending!;
      entry.body = Buffer.concat([entry.body, body.subarray(offset, offset + length)]); return length;
    },
    fchmodSync(descriptor: number, mode: number) { boundary.descriptors.get(descriptor)!.pending!.mode = mode; },
    fstatSync(descriptor: number) {
      const value = boundary.descriptors.get(descriptor)!;
      return value.pending ? fileState(value.pending) : directoryState(boundary.directories.get(value.path)!);
    },
    fsyncSync() { if (boundary.fsyncFailure) throw new Error('fixture fsync failure'); },
    closeSync(descriptor: number) {
      const value = boundary.descriptors.get(descriptor); if (value?.pending) boundary.files.set(value.path, value.pending);
      boundary.descriptors.delete(descriptor);
    },
    rmSync(path: string) {
      if (boundary.cleanupFailure) throw new Error('fixture cleanup failure');
      const exact = normalized(path);
      for (const candidate of [...boundary.directories.keys()]) if (candidate === exact || candidate.startsWith(`${exact}/`)) boundary.directories.delete(candidate);
      for (const candidate of [...boundary.files.keys()]) if (candidate.startsWith(`${exact}/`)) boundary.files.delete(candidate);
    },
    unlinkSync(path: string) { boundary.files.delete(normalized(path)); },
  };
});

vi.mock('node:child_process', () => ({
  spawnSync(executable: string, arguments_: readonly string[], options: { env: Record<string, string> }) {
    boundary.executions.push({ executable, arguments: [...arguments_], env: { ...options.env } });
    if (boundary.processScenario === 'timeout') return { status: null, signal: 'SIGKILL', error: Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }), stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    if (boundary.processScenario === 'failure' && executable !== '/usr/bin/git') return { status: 1, signal: null, error: undefined, stdout: Buffer.alloc(0), stderr: Buffer.from('private fixture detail') };
    let stdout = Buffer.alloc(0);
    if (executable === '/usr/bin/git') {
      if (arguments_[0] === 'rev-parse') stdout = Buffer.from(arguments_.at(-1) === 'HEAD^{tree}' ? `${'2'.repeat(40)}\n` : `${'1'.repeat(40)}\n`);
      else if (arguments_[0] === 'show') stdout = Buffer.from(boundary.committed.get(arguments_[1]!.split(':').slice(1).join(':'))!);
    } else if (executable === '/usr/bin/gpg' && arguments_.includes('show-only')) {
      stdout = Buffer.from(boundary.processScenario === 'bad-key'
        ? `pub:-:255:1:BAD::::::::\nfpr:::::::::${'0'.repeat(40)}:\n`
        : `pub:-:255:22:KEY::::::::\nfpr:::::::::${FINGERPRINT}:\nsub:-:255:18:SUB::::::::\nfpr:::::::::${'0'.repeat(40)}:\n`);
    } else if (executable === '/usr/bin/gpg' && arguments_.includes('--import')) {
      stdout = Buffer.from(boundary.processScenario === 'bad-import' ? '[GNUPG:] IMPORT_PROBLEM 1\n' : `[GNUPG:] IMPORT_OK 1 ${FINGERPRINT}\n`);
    } else if (executable === '/usr/bin/gpg' && arguments_.includes('--verify')) {
      stdout = Buffer.from(boundary.processScenario === 'bad-signature' ? '[GNUPG:] BADSIG BAD bad\n'
        : boundary.processScenario === 'expired-signature' ? `[GNUPG:] EXPKEYSIG ${FINGERPRINT} bad\n`
          : `[GNUPG:] VALIDSIG ${FINGERPRINT} 2026-09-06 0 0 4 0 22 8 00 ${FINGERPRINT}\n`);
    } else if (executable === FINAL_NODE) {
      stdout = Buffer.from(boundary.processScenario === 'bad-version' ? 'v24.19.1\n' : 'v24.19.0\n');
      if (boundary.processScenario === 'mutate-node') boundary.files.get(FINAL_NODE)!.ino = boundary.nextIno++;
    }
    else if (executable === '/usr/bin/tar') stdout = Buffer.from(boundary.processScenario === 'bad-member' ? 'bad member' : 'fixture member');
    return { status: 0, signal: null, error: undefined, stdout, stderr: Buffer.alloc(0) };
  },
}));

vi.mock('node:https', () => ({
  request(_url: URL, options: { headers: Record<string, string>; agent: boolean }, callback: (response: unknown) => void) {
    boundary.fetches += 1;
    expect(options).toMatchObject({ agent: false, headers: { 'accept-encoding': 'identity' } });
    const requestHandlers = new Map<string, (value?: unknown) => void>(); let interval: ReturnType<typeof setInterval> | undefined; let stopped = false;
    const stop = () => { stopped = true; if (interval) clearInterval(interval); };
    const request = { on(name: string, handler: (value?: unknown) => void) { requestHandlers.set(name, handler); return request; },
      destroy() { boundary.requestDestroys += 1; stop(); }, end() { queueMicrotask(() => {
        if (stopped) return; const handlers = new Map<string, (value?: unknown) => void>();
        const response = { statusCode: boundary.fetchScenario === 'status' ? 503 : boundary.fetchScenario === 'redirect' ? 302 : 200,
          headers: { ...(boundary.fetchScenario === 'redirect' ? { location: 'https://example.invalid/' } : {}),
            ...(boundary.fetchScenario === 'encoding' ? { 'content-encoding': 'gzip' } : {}),
            ...(boundary.fetchScenario === 'oversize' ? { 'content-length': '925' } : {}) },
          on(name: string, handler: (value?: unknown) => void) { handlers.set(name, handler); return response; },
          destroy() { boundary.responseDestroys += 1; stop(); } };
        callback(response);
        if (stopped || ['status', 'redirect', 'encoding', 'oversize'].includes(boundary.fetchScenario)) return;
        if (boundary.fetchScenario === 'trickle') interval = setInterval(() => { if (!stopped) { boundary.dataEvents += 1; handlers.get('data')?.(Buffer.from('x')); } }, 1_000);
        else { handlers.get('data')?.(Buffer.from('short')); handlers.get('end')?.(); }
      }); } };
    return request;
  },
}));

vi.mock('node:os', () => ({ release: () => '6.18.33.2-microsoft-standard-WSL2' }));

function policyBody() { return Buffer.from(JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-release-recovery-wsl-toolchain-source-policy-v1', distribution: 'Ubuntu-24.04', platform: 'linux', architecture: 'x64', nodeReleases: { '24.19.0': RECORD } })); }
function provenanceBody() { return Buffer.from(`${JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-genesis001-local-node-bootstrap-linux-x64-v1', nodeVersion: '24.19.0', signerFingerprint: FINGERPRINT, publicKeySha256: RECORD.publicKeySha256, shasumsSha256: RECORD.shasumsSha256, signatureSha256: RECORD.signatureSha256, archiveSha256: RECORD.archiveSha256, archiveMemberSha256: RECORD.archiveMemberSha256 })}\n`); }
function addDirectory(path: string, mode = 0o700, uid = 1000) { boundary.directories.set(path, { mode, uid, ino: boundary.nextIno++, mtimeNs: 1n }); }
function addFile(path: string, body: Buffer, mode = 0o400, uid = 1000, valid = true) { boundary.files.set(path, { body: Buffer.from(body), mode, uid, valid, ino: boundary.nextIno++ }); }
function seedEvidence() {
  addFile(`${CACHE}/node-release-key.asc`, Buffer.from('fixture key'));
  addFile(`${CACHE}/SHASUMS256.txt`, Buffer.from(`${ARCHIVE_HASH}  node-v24.19.0-linux-x64.tar.xz\n`));
  addFile(`${CACHE}/SHASUMS256.txt.sig`, Buffer.from('fixture signature'));
  addFile(`${CACHE}/node-v24.19.0-linux-x64.tar.xz`, Buffer.from('fixture archive'));
  addFile(`${CACHE}/provenance.json`, provenanceBody());
}

beforeEach(() => {
  vi.restoreAllMocks(); boundary.directories.clear(); boundary.files.clear(); boundary.committed.clear(); boundary.descriptors.clear(); boundary.executions.length = 0;
  boundary.nextDescriptor = 100; boundary.nextIno = 1000n; boundary.changedSource = ''; boundary.escapedPath = ''; boundary.invalidFilePath = ''; boundary.fetchScenario = 'status'; boundary.processScenario = '';
  boundary.fetches = 0; boundary.writes = 0; boundary.requestDestroys = 0; boundary.responseDestroys = 0; boundary.dataEvents = 0; boundary.cleanupFailure = false; boundary.fsyncFailure = false;
  for (const path of [ROOT, TOOLCHAIN, RUNS, CACHE_PARENT, CACHE, FINAL_VERSION, FINAL_BIN]) addDirectory(path);
  for (const path of SOURCE_PATHS) boundary.committed.set(path, path.endsWith('source-policy-v1.json') ? policyBody() : Buffer.from(`committed:${path}`));
  seedEvidence(); addFile(FINAL_NODE, Buffer.alloc(0), 0o500);
  vi.spyOn(process, 'platform', 'get').mockReturnValue('linux'); vi.spyOn(process, 'arch', 'get').mockReturnValue('x64');
  vi.spyOn(process, 'execPath', 'get').mockReturnValue(BOOTSTRAP_NODE); vi.spyOn(process, 'execArgv', 'get').mockReturnValue([]);
  Object.defineProperty(process, 'getuid', { configurable: true, value: () => 1000 }); delete process.env.NODE_OPTIONS;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(() => { if (ORIGINAL_GETUID === undefined) delete (process as { getuid?: unknown }).getuid; else Object.defineProperty(process, 'getuid', ORIGINAL_GETUID); if (ORIGINAL_NODE_OPTIONS === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = ORIGINAL_NODE_OPTIONS; });
async function bootstrap() { const module = await import('../scripts/bootstrap-genesis001-local-node.mjs'); return module.bootstrapGenesis001LocalNode(); }

describe('Genesis 001 fixed Node 24 bootstrap', () => {
  it('rejects explicit undefined before importing or running the core', async () => {
    const module = await import('../scripts/bootstrap-genesis001-local-node.mjs');
    expect(Object.keys(module).sort()).toEqual(['Genesis001LocalNodeBootstrapError', 'bootstrapGenesis001LocalNode']);
    await expect((module.bootstrapGenesis001LocalNode as unknown as (value: unknown) => Promise<unknown>)(undefined)).rejects.toMatchObject({ code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_ARGUMENTS_INVALID' });
    expect(boundary.executions).toHaveLength(0); expect(boundary.fetches).toBe(0); expect(boundary.writes).toBe(0);
  });

  it.each([
    ['platform', () => vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')], ['architecture', () => vi.spyOn(process, 'arch', 'get').mockReturnValue('arm64')],
    ['uid', () => Object.defineProperty(process, 'getuid', { configurable: true, value: () => 0 })], ['bootstrap executable', () => vi.spyOn(process, 'execPath', 'get').mockReturnValue('/usr/bin/node')],
    ['preload options', () => { process.env.NODE_OPTIONS = '--require=/tmp/ambient.cjs'; }], ['root mode', () => { boundary.directories.get(ROOT)!.mode = 0o755; }],
    ['root symlink', () => { boundary.directories.get(ROOT)!.symlink = true; }],
  ] as const)('rejects wrong %s before network, installation, or execution', async (_name, mutate) => {
    mutate(); await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0); expect(boundary.writes).toBe(0); expect(boundary.executions).toHaveLength(0);
  });

  it.each(SOURCE_PATHS)('rejects drift in closure member %s before network or install', async path => {
    boundary.changedSource = path; await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0); expect(boundary.writes).toBe(0);
    expect(boundary.executions.every(value => value.executable === '/usr/bin/git')).toBe(true);
  });

  it.each(['/usr/bin/git', '/usr/bin/gpg', '/usr/bin/gpgv', '/usr/bin/tar', '/usr/bin/xz', BOOTSTRAP_NODE])(
    'rejects drift in pinned executable %s before network or destination changes', async path => {
      boundary.invalidFilePath = path; await expect(bootstrap()).rejects.toBeInstanceOf(Error);
      expect(boundary.fetches).toBe(0); expect(boundary.writes).toBe(0);
    },
  );

  it('rejects a committed policy URL substitution before network or install', async () => {
    const policy = JSON.parse(policyBody().toString());
    policy.nodeReleases['24.19.0'].archiveUrl = 'https://example.invalid/node.tar.xz';
    boundary.committed.set(SOURCE_PATHS.at(-1)!, Buffer.from(JSON.stringify(policy)));
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0); expect(boundary.writes).toBe(0);
  });

  it.each(['status', 'redirect', 'encoding', 'oversize', 'short'] as const)('rejects %s fetch without populating evidence', async scenario => {
    boundary.files.delete(`${CACHE}/node-release-key.asc`); boundary.fetchScenario = scenario;
    await expect(bootstrap()).rejects.toBeInstanceOf(Error); expect(boundary.fetches).toBe(1); expect(boundary.files.has(`${CACHE}/node-release-key.asc`)).toBe(false);
  });

  it('enforces absolute deadline and prevents late writes', async () => {
    vi.useFakeTimers(); boundary.files.delete(`${CACHE}/node-release-key.asc`); boundary.fetchScenario = 'trickle'; let outcome = 'pending';
    void bootstrap().then(() => { outcome = 'resolved'; }, () => { outcome = 'rejected'; });
    await vi.advanceTimersByTimeAsync(29_999); expect(outcome).toBe('pending'); expect(boundary.dataEvents).toBeGreaterThan(1);
    await vi.advanceTimersByTimeAsync(1); expect(outcome).toBe('rejected'); expect(boundary.requestDestroys).toBe(1); expect(boundary.responseDestroys).toBe(1);
    const events = boundary.dataEvents; await vi.advanceTimersByTimeAsync(60_000); expect(boundary.dataEvents).toBe(events); expect(boundary.writes).toBe(0);
  });

  it.each([['key fingerprint/algorithm', 'bad-key'], ['key import', 'bad-import'], ['signature', 'bad-signature'], ['expired signature', 'expired-signature']] as const)(
    'rejects wrong %s before archive execution or destination change', async (_name, scenario) => {
      boundary.processScenario = scenario; await expect(bootstrap()).rejects.toBeInstanceOf(Error);
      expect(boundary.executions.some(value => value.executable === '/usr/bin/tar')).toBe(false); expect(boundary.files.has(FINAL_NODE)).toBe(true);
    },
  );

  it('requires the exact archive sums line exactly once', async () => {
    boundary.files.get(`${CACHE}/SHASUMS256.txt`)!.body = Buffer.from('unrelated\n'); await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.executions.some(value => value.executable === FINAL_NODE)).toBe(false);
  });

  it.each([['key', `${CACHE}/node-release-key.asc`], ['sums', `${CACHE}/SHASUMS256.txt`], ['signature', `${CACHE}/SHASUMS256.txt.sig`], ['archive', `${CACHE}/node-v24.19.0-linux-x64.tar.xz`], ['provenance', `${CACHE}/provenance.json`]] as const)(
    'rejects existing mismatched %s without overwrite', async (_name, path) => {
      boundary.files.get(path)!.valid = false; const before = Buffer.from(boundary.files.get(path)!.body);
      await expect(bootstrap()).rejects.toBeInstanceOf(Error); expect(boundary.files.get(path)?.body).toEqual(before); expect(boundary.fetches).toBe(0);
    },
  );

  it.each([['partial version', () => boundary.directories.delete(FINAL_BIN)], ['extra version entry', () => addFile(`${FINAL_VERSION}/extra`, Buffer.from('x'))], ['extra bin entry', () => addFile(`${FINAL_BIN}/extra`, Buffer.from('x'))], ['node mode', () => { boundary.files.get(FINAL_NODE)!.mode = 0o700; }], ['node identity', () => { boundary.files.get(FINAL_NODE)!.valid = false; }]] as const)(
    'retains and rejects %s without repair', async (_name, mutate) => {
      mutate(); await expect(bootstrap()).rejects.toBeInstanceOf(Error); expect(boundary.directories.has(FINAL_VERSION)).toBe(true);
      expect(boundary.executions.some(value => value.executable === '/usr/bin/tar')).toBe(false);
    },
  );

  it('keeps selected member stdout binary and rejects wrong size/hash before installation', async () => {
    boundary.files.delete(FINAL_NODE); boundary.directories.delete(FINAL_BIN); boundary.directories.delete(FINAL_VERSION);
    boundary.processScenario = 'bad-member';
    await expect(bootstrap()).rejects.toMatchObject({ code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_MEMBER_INVALID' });
    expect(boundary.executions.some(value => value.executable === '/usr/bin/tar'
      && value.arguments.includes('--to-stdout')
      && value.arguments.includes('--use-compress-program=/usr/bin/xz'))).toBe(true);
    expect(boundary.files.has(FINAL_NODE)).toBe(false);
  });

  it('rejects executable mutation after --version reattestation', async () => {
    boundary.processScenario = 'mutate-node';
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
  });

  it('fails closed on directory fsync failure without fetching', async () => {
    boundary.fsyncFailure = true;
    await expect(bootstrap()).rejects.toBeInstanceOf(Error);
    expect(boundary.fetches).toBe(0);
  });

  it('rejects subprocess failure and timeout with fixed public errors', async () => {
    boundary.processScenario = 'failure'; await expect(bootstrap()).rejects.toMatchObject({ code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_FAILED' });
    boundary.processScenario = 'timeout'; await expect(bootstrap()).rejects.toMatchObject({ code: 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_TIMEOUT' });
  });

  it('preserves primary and cleanup failures', async () => {
    boundary.processScenario = 'bad-signature'; boundary.cleanupFailure = true; let cause: unknown;
    try { await bootstrap(); } catch (error) { cause = (error as Error & { cause?: unknown }).cause; }
    expect(cause).toBeInstanceOf(AggregateError); expect((cause as AggregateError).errors).toHaveLength(2);
  });

  it('revalidates exact evidence and existing installation without fetch or mutation', async () => {
    const before = new Map([...boundary.files].map(([path, value]) => [path, Buffer.from(value.body)])); const result = await bootstrap();
    expect(result).toEqual({ profile: 'warpkeep-genesis001-local-node-bootstrap-linux-x64-v1', sourceCommit: '1'.repeat(40), sourceTree: '2'.repeat(40), nodeVersion: '24.19.0', nodeSha256: NODE_HASH, installed: false });
    expect(boundary.fetches).toBe(0); for (const [path, body] of before) expect(boundary.files.get(path)?.body).toEqual(body);
    const commands = boundary.executions.filter(value => value.executable !== '/usr/bin/git');
    expect(commands.some(value => value.executable === '/usr/bin/gpg' && value.arguments.includes('--no-options') && value.arguments.includes('--no-autostart'))).toBe(true);
    expect(commands.some(value => value.executable === FINAL_NODE && JSON.stringify(value.arguments) === JSON.stringify(['--version']))).toBe(true);
    expect(commands.every(value => !('NODE_OPTIONS' in value.env) && !('LD_PRELOAD' in value.env) && !('HTTPS_PROXY' in value.env))).toBe(true);
  });

  it('populates only missing provenance after authentication', async () => {
    boundary.files.delete(`${CACHE}/provenance.json`); const result = await bootstrap();
    expect(result.installed).toBe(false); expect(boundary.fetches).toBe(0); expect(boundary.files.get(`${CACHE}/provenance.json`)?.mode).toBe(0o400);
    expect(boundary.files.get(`${CACHE}/provenance.json`)?.body).toEqual(provenanceBody());
  });
});
