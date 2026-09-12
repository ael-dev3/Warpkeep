import { spawnSync } from 'node:child_process';
import { closeSync, constants, fchmodSync, fstatSync, fsyncSync, lstatSync, openSync,
  realpathSync, statfsSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

const LOCK_NAME = 'warpkeep-release-assembly.lock';
const heldLocks = new WeakMap();
const EXT4_SUPER_MAGIC = 0xef53;
// Like the B0 deployment journal: flock is attached to the inherited open-file
// description. This helper exits, while the parent's descriptor retains it.
const LOCK_HELPER = 'import fcntl,sys\ntry:\n fcntl.flock(3,fcntl.LOCK_EX|fcntl.LOCK_NB)\nexcept BlockingIOError:\n sys.exit(73)\nprint("LOCKED",flush=True)\n';

export class LocalReleaseCandidateLockError extends Error {
  constructor(code) { super(code); this.name = 'LocalReleaseCandidateLockError'; this.code = code; }
}
function fail(code) { throw new LocalReleaseCandidateLockError(`LOCAL_RELEASE_LOCK_${code}`); }

function same(left, right) {
  return ['dev', 'ino', 'uid', 'mode'].every(key => left[key] === right[key]);
}

function directory(path, privateRoot = false) {
  const status = lstatSync(path, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink() || status.uid !== 1000n
      || (status.mode & 0o022n) !== 0n
      || (privateRoot && (status.mode & 0o7777n) !== 0o700n)
      || realpathSync(path) !== path) fail('ROOT_INVALID');
  return status;
}

function file(status, device) {
  if (!status.isFile() || status.isSymbolicLink() || status.uid !== 1000n
      || status.nlink !== 1n || status.size !== 0n || status.dev !== device
      || (status.mode & 0o7777n) !== 0o600n) fail('FILE_INVALID');
}

/** Kernel mutual exclusion only; this does not authenticate release source. */
export function acquirePreparedReleaseCandidateLock(...args) {
  if (process.platform !== 'linux' || process.arch !== 'x64'
      || process.getuid?.() !== 1000 || process.versions.node !== '22.22.3') fail('HOST_INVALID');
  const [candidateRoot] = args;
  if (args.length !== 1 || typeof candidateRoot !== 'string'
      || !isAbsolute(candidateRoot) || resolve(candidateRoot) !== candidateRoot) fail('ROOT_INVALID');
  let descriptor;
  try {
    const candidate = directory(candidateRoot, true);
    if (statfsSync(candidateRoot).type !== EXT4_SUPER_MAGIC) fail('FILESYSTEM_INVALID');
    const gitRoot = join(candidateRoot, '.git');
    const git = directory(gitRoot);
    if (git.dev !== candidate.dev) fail('ROOT_INVALID');
    const lockPath = join(gitRoot, LOCK_NAME);
    let created = false;
    try {
      descriptor = openSync(lockPath, constants.O_RDWR | constants.O_CREAT
        | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      created = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      descriptor = openSync(lockPath, constants.O_RDWR | constants.O_NOFOLLOW);
    }
    // Correct only the inode we just exclusively created. Existing permissions
    // are evidence to validate, never something acquisition silently repairs.
    if (created) fchmodSync(descriptor, 0o600);
    const identity = fstatSync(descriptor, { bigint: true });
    file(identity, candidate.dev);
    let released = false;
    function assertActive() {
      if (released || descriptor === undefined) fail('RELEASED');
      try {
        if (!same(candidate, directory(candidateRoot, true)) || !same(git, directory(gitRoot))) fail('CHANGED');
        const held = fstatSync(descriptor, { bigint: true });
        const named = lstatSync(lockPath, { bigint: true });
        file(held, candidate.dev);
        file(named, candidate.dev);
        if (!same(identity, held) || !same(identity, named)) fail('CHANGED');
      } catch { fail('CHANGED'); }
    }
    assertActive();
    const helper = spawnSync('/usr/bin/python3', ['-I', '-c', LOCK_HELPER], {
      cwd: gitRoot, env: { PATH: '/usr/bin:/bin', HOME: '/nonexistent', LC_ALL: 'C' },
      stdio: ['ignore', 'pipe', 'pipe', descriptor], encoding: 'utf8',
      timeout: 5000, killSignal: 'SIGKILL', maxBuffer: 4096,
    });
    if (helper.status === 73 && helper.error === undefined && helper.signal === null
        && helper.stdout === '' && helper.stderr === '') fail('BUSY');
    if (helper.status !== 0 || helper.error !== undefined || helper.signal !== null
        || helper.stdout !== 'LOCKED\n' || helper.stderr !== '') fail('HELPER_FAILED');
    assertActive();
    fsyncSync(descriptor);
    const directoryFd = openSync(gitRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    try {
      if (!same(git, fstatSync(directoryFd, { bigint: true }))) fail('CHANGED');
      fsyncSync(directoryFd);
    } finally { closeSync(directoryFd); }
    assertActive();
    const lease = Object.freeze({
      assertActive,
      release() {
        if (released) return;
        let primary;
        try { assertActive(); } catch (error) { primary = error; }
        released = true;
        const held = descriptor;
        descriptor = undefined;
        try { closeSync(held); } catch { primary ??= new LocalReleaseCandidateLockError('LOCAL_RELEASE_LOCK_CLOSE_FAILED'); }
        if (primary !== undefined) throw primary;
      },
    });
    heldLocks.set(lease, candidateRoot);
    return lease;
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the initial fixed error. */ }
    }
    if (error instanceof LocalReleaseCandidateLockError) throw error;
    fail('UNAVAILABLE');
  }
}

/** Authenticate a live kernel lease from this module, not caller callbacks. */
export function assertPreparedReleaseCandidateLock(...args) {
  const [lease, candidateRoot] = args;
  if (args.length !== 2 || typeof candidateRoot !== 'string'
      || heldLocks.get(lease) !== candidateRoot) fail('CAPABILITY_INVALID');
  lease.assertActive();
}
