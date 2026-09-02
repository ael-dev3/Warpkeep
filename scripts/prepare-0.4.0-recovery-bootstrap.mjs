import { execFileSync, spawnSync } from 'node:child_process';
import { constants, chmodSync, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

import { isExactCurrentOwnerOnlyAcl } from './recovery-bootstrap-acl.mjs';

const KEY_ID = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const PRIVATE_FILE = 'recovery-signing-private.jwk.json';
const PUBLIC_FILE = 'recovery-signing-public.jwk.json';
const THUMBPRINT_FILE = 'recovery-signing-thumbprint.txt';

class BootstrapError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function fail(code) {
  throw new BootstrapError(code);
}

function portablePath(value) {
  const absolute = resolve(value);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
}

function isWithin(parent, child) {
  const parentPath = portablePath(parent);
  const childPath = portablePath(child);
  const relation = relative(parentPath, childPath);
  return relation === '' || (!relation.startsWith(`..${sep}`) && relation !== '..' && !isAbsolute(relation));
}

function existingStat(path) {
  return lstatSync(path, { throwIfNoEntry: false });
}

function assertNoSymlinkComponents(path) {
  const absolute = resolve(path);
  const root = parse(absolute).root;
  const components = relative(root, absolute).split(sep).filter(Boolean);
  let current = root;
  for (const component of components) {
    current = join(current, component);
    const stat = existingStat(current);
    if (!stat) break;
    if (stat.isSymbolicLink()) fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
    if (!stat.isDirectory()) fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  }
}

function gitWorktreeRoots() {
  try {
    const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
      cwd: process.cwd(), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']
    });
    const roots = output.split(/\r?\n\r?\n/u)
      .map((record) => record.split(/\r?\n/u).find((line) => line.startsWith('worktree ')))
      .filter((line) => line !== undefined)
      .map((line) => resolve(line.slice('worktree '.length)));
    if (roots.length === 0) fail('RECOVERY_BOOTSTRAP_REPOSITORY_UNAVAILABLE');
    return roots;
  } catch {
    fail('RECOVERY_BOOTSTRAP_REPOSITORY_UNAVAILABLE');
  }
}

function parseArguments(argv) {
  let generate = false;
  let privateRoot;
  const unexpected = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--generate') {
      generate = true;
    } else if (argument === '--private-root') {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.length === 0) fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
      privateRoot = value;
      index += 1;
    } else {
      unexpected.push(argument);
    }
  }
  return { generate, privateRoot: privateRoot === undefined ? undefined : resolve(privateRoot), unexpected };
}

function assertPrivateRoot(path) {
  const worktrees = gitWorktreeRoots();
  const userProfile = process.env.USERPROFILE || process.env.HOME || homedir();
  const desktops = [join(userProfile, 'Desktop'), join(userProfile, 'OneDrive', 'Desktop')];
  if (worktrees.some((worktree) => isWithin(worktree, path)) || desktops.some((desktop) => isWithin(desktop, path))) {
    fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  }
  assertNoSymlinkComponents(path);
}

function ensurePrivateDirectory(path) {
  assertNoSymlinkComponents(path);
  mkdirSync(path, { recursive: true, mode: 0o700 });
  const stat = existingStat(path);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  if (process.platform !== 'win32') {
    chmodSync(path, 0o700);
  } else {
    configureWindowsOwnerOnlyAcl(path, true);
  }
}

function assertSecureRegularFile(path) {
  const stat = existingStat(path);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
  }
  if (process.platform === 'win32') assertWindowsOwnerOnlyAcl(path);
}

function windowsUsername() {
  const username = process.env.USERNAME;
  if (!username) fail('RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE');
  return username;
}

function assertWindowsOwnerOnlyAcl(path) {
  if (process.platform !== 'win32') return;
  const inspected = spawnSync('icacls', [path], { encoding: 'utf8', windowsHide: true });
  if (inspected.status !== 0 || !isExactCurrentOwnerOnlyAcl(inspected.stdout, windowsUsername())) {
    fail('RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE');
  }
}

function configureWindowsOwnerOnlyAcl(path, isDirectory = false) {
  if (process.platform !== 'win32') return;
  const grant = isDirectory ? '(OI)(CI)(F)' : '(F)';
  const configured = spawnSync('icacls', [path, '/inheritance:r', '/grant:r', `${windowsUsername()}:${grant}`], {
    encoding: 'utf8', windowsHide: true
  });
  if (configured.status !== 0) fail('RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE');
  assertWindowsOwnerOnlyAcl(path);
}

function writeExclusive(path, bytes) {
  let descriptor;
  let created = false;
  let completed = false;
  try {
    descriptor = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    created = true;
    chmodSync(path, 0o600);
    configureWindowsOwnerOnlyAcl(path);
    writeFileSync(descriptor, bytes, 'utf8');
    fsyncSync(descriptor);
    assertWindowsOwnerOnlyAcl(path);
    completed = true;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (created && !completed) {
      try { rmSync(path, { force: true }); } catch { /* preserve the primary fail-closed error */ }
    }
  }
}

function readSecureRegularFile(path) {
  assertSecureRegularFile(path);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile()) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const pathStat = existingStat(path);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || bytes.byteLength !== after.size || !pathStat?.isFile() || pathStat.isSymbolicLink()
      || pathStat.dev !== after.dev || pathStat.ino !== after.ino || pathStat.size !== after.size
    ) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    assertWindowsOwnerOnlyAcl(path);
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readJsonFile(path) {
  try {
    return JSON.parse(readSecureRegularFile(path).toString('utf8'));
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
  }
}

function publicJwkFromPrivate(privateJwk) {
  try {
    const privateKey = createPrivateKey({ key: privateJwk, format: 'jwk' });
    const publicJwk = createPublicKey(privateKey).export({ format: 'jwk' });
    if (
      publicJwk.kty !== 'EC'
      || publicJwk.crv !== 'P-256'
      || typeof publicJwk.x !== 'string'
      || typeof publicJwk.y !== 'string'
    ) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    return { kty: 'EC', crv: 'P-256', x: publicJwk.x, y: publicJwk.y };
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
  }
}

function thumbprint(publicJwk) {
  const canonical = JSON.stringify({ crv: publicJwk.crv, kty: publicJwk.kty, x: publicJwk.x, y: publicJwk.y });
  return createHash('sha256').update(canonical, 'utf8').digest('base64url');
}

function generatedPrivateJwk() {
  const generated = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    privateKeyEncoding: { format: 'jwk' }
  });
  return generated.privateKey;
}

function assertOrCreatePublicFile(path, expected) {
  if (!existingStat(path)) {
    writeExclusive(path, `${JSON.stringify(expected)}\n`);
    return;
  }
  const actual = readJsonFile(path);
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail('RECOVERY_BOOTSTRAP_PUBLIC_OUTPUT_REJECTED');
}

function assertOrCreateThumbprintFile(path, expected) {
  if (!existingStat(path)) {
    writeExclusive(path, `${expected}\n`);
    return;
  }
  if (readSecureRegularFile(path).toString('utf8') !== `${expected}\n`) {
    fail('RECOVERY_BOOTSTRAP_PUBLIC_OUTPUT_REJECTED');
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.generate) fail('RECOVERY_BOOTSTRAP_GENERATION_REQUIRED');
  if (options.privateRoot === undefined) fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
  assertPrivateRoot(options.privateRoot);
  if (options.unexpected.length > 0) fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
  ensurePrivateDirectory(options.privateRoot);

  const privatePath = join(options.privateRoot, PRIVATE_FILE);
  const publicPath = join(options.privateRoot, PUBLIC_FILE);
  const thumbprintPath = join(options.privateRoot, THUMBPRINT_FILE);
  let privateJwk;
  let generated = false;
  if (existingStat(privatePath)) {
    privateJwk = readJsonFile(privatePath);
  } else {
    privateJwk = generatedPrivateJwk();
    writeExclusive(privatePath, `${JSON.stringify(privateJwk)}\n`);
    generated = true;
  }
  const publicJwk = publicJwkFromPrivate(privateJwk);
  const keyThumbprint = thumbprint(publicJwk);
  assertOrCreatePublicFile(publicPath, publicJwk);
  assertOrCreateThumbprintFile(thumbprintPath, keyThumbprint);

  process.stdout.write(`${JSON.stringify({
    status: generated ? 'generated' : 'existing',
    enabled: false,
    keyId: KEY_ID,
    privateJwkPath: privatePath,
    publicJwkPath: publicPath,
    thumbprintPath,
    publicJwk,
    thumbprint: keyThumbprint
  })}\n`);
}

try {
  main();
} catch (error) {
  const code = error instanceof BootstrapError ? error.code : 'RECOVERY_BOOTSTRAP_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
