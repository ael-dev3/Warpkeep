import { execFileSync, spawnSync } from 'node:child_process';
import { constants, chmodSync, closeSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import {
  createECDH,
  createHash,
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  timingSafeEqual
} from 'node:crypto';
import { homedir } from 'node:os';
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path';

import { isExactCurrentOwnerOnlyAcl } from './recovery-bootstrap-acl.mjs';

const KEY_ID = 'warpkeep-0.4.0-recovery-2026-09-03-1';
const PRIVATE_FILE = 'recovery-signing-private.jwk.json';
const PUBLIC_FILE = 'recovery-signing-public.jwk.json';
const THUMBPRINT_FILE = 'recovery-signing-thumbprint.txt';
const RPC_SECRET_FILE = 'recovery-rpc-secret.txt';
const CENSUS_PEPPER_FILE = 'recovery-census-pepper.txt';
const CANARY_FID_FILE = 'player-canary-owner-fid.txt';
const AUTH_BRIDGE_PUBLIC_JWK_FILE = 'auth-bridge-signing-public.jwk.json';
const MARKER_FILE = 'recovery-bootstrap-marker.json';
const MARKER_BYTES = `${JSON.stringify({
  schemaVersion: 1,
  profile: 'warpkeep-0.4.0-recovery-bootstrap-v1',
  keyId: KEY_ID,
  enabled: false
})}\n`;

const GENESIS_001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const BRIDGE_CONFIG_PROFILE = 'warpkeep-release-recovery-bridge-config-v1';
const BRIDGE_WORKER_VERSION = 'warpkeep-auth-bridge-release-recovery-v1';
const SPACETIME_ORIGIN = 'https://maincloud.spacetimedb.com';
const GENESIS_001_AUDIENCE = 'warpkeep-spacetimedb';
const GENESIS_002_AUDIENCE = 'warpkeep-genesis-002-spacetimedb';
const PTR_AUDIENCE = 'warpkeep-ptr-spacetimedb';
const BRIDGE_CONFIG_DOMAIN = 'warpkeep.release-recovery.bridge-config.v1\n';
const CANARY_FID_DOMAIN = 'warpkeep.release-recovery.bridge-config.canary-fid.v1\n';
const BASE64URL_32_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const LOWERHEX_40_PATTERN = /^[0-9a-f]{40}$/u;
const LOWERHEX_64_PATTERN = /^[0-9a-f]{64}$/u;
const POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]{0,15}$/u;

const PRIVATE_JWK_MAX_BYTES = 2048;
const PUBLIC_JWK_MAX_BYTES = 1024;
const THUMBPRINT_MAX_BYTES = 44;
const SECRET_FILE_BYTES = 44;
const CANARY_FID_MAX_BYTES = 17;
const MARKER_MAX_BYTES = 256;

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

function runWindowsPowerShell(script, environment, maxOutputBytes, code) {
  const inspected = spawnSync(
    'powershell.exe',
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    {
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...environment }
    }
  );
  if (
    inspected.status !== 0
    || inspected.signal !== null
    || typeof inspected.stdout !== 'string'
    || typeof inspected.stderr !== 'string'
    || inspected.stderr.length !== 0
    || Buffer.byteLength(inspected.stdout, 'utf8') > maxOutputBytes
    || inspected.stdout.includes('\0')
  ) fail(code);
  return inspected.stdout.trim();
}

let cachedWindowsProtectedRoots;

function windowsProtectedRoots() {
  if (process.platform !== 'win32') {
    return Object.freeze({ profiles: [], desktops: [], oneDrives: [] });
  }
  if (cachedWindowsProtectedRoots !== undefined) return cachedWindowsProtectedRoots;
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$profile = [Environment]::GetFolderPath([Environment+SpecialFolder]::UserProfile, [Environment+SpecialFolderOption]::DoNotVerify)
$desktop = [Environment]::GetFolderPath([Environment+SpecialFolder]::DesktopDirectory, [Environment+SpecialFolderOption]::DoNotVerify)
$oneDrives = [Collections.Generic.List[string]]::new()
foreach ($name in @('OneDrive', 'OneDriveConsumer', 'OneDriveCommercial')) {
  foreach ($target in @([EnvironmentVariableTarget]::User, [EnvironmentVariableTarget]::Process)) {
    $value = [Environment]::GetEnvironmentVariable($name, $target)
    if (-not [string]::IsNullOrWhiteSpace($value)) { $oneDrives.Add($value) }
  }
}
$accounts = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\OneDrive\Accounts'
if (Test-Path -LiteralPath $accounts) {
  foreach ($account in Get-ChildItem -LiteralPath $accounts -ErrorAction Stop) {
    $value = (Get-ItemProperty -LiteralPath $account.PSPath -Name UserFolder -ErrorAction SilentlyContinue).UserFolder
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      $oneDrives.Add([Environment]::ExpandEnvironmentVariables($value))
    }
  }
}
$payload = [ordered]@{
  profiles = @($profile)
  desktops = @($desktop)
  oneDrives = @($oneDrives | Sort-Object -Unique)
}
[Console]::Out.Write(($payload | ConvertTo-Json -Compress -Depth 3))
`;
  let parsed;
  try {
    parsed = JSON.parse(runWindowsPowerShell(
      script,
      {},
      16 * 1024,
      'RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED'
    ));
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  }
  if (
    typeof parsed !== 'object'
    || parsed === null
    || Array.isArray(parsed)
    || JSON.stringify(Object.keys(parsed)) !== JSON.stringify(['profiles', 'desktops', 'oneDrives'])
  ) fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  const normalizePaths = (values) => {
    if (!Array.isArray(values) || values.length > 32) {
      fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
    }
    return [...new Set(values.filter((value) => {
      return typeof value === 'string'
        && value.length > 0
        && value.length <= 32767
        && !/[\0\r\n]/u.test(value)
        && isAbsolute(value);
    }).map(value => resolve(value)))];
  };
  const profiles = normalizePaths(parsed.profiles);
  const desktops = normalizePaths(parsed.desktops);
  const oneDrives = normalizePaths(parsed.oneDrives);
  if (profiles.length < 1) fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  cachedWindowsProtectedRoots = Object.freeze({ profiles, desktops, oneDrives });
  return cachedWindowsProtectedRoots;
}

function parseArguments(argv) {
  let mode;
  const values = new Map();
  const valueOptions = new Set([
    '--private-root',
    '--bridge-source-commit',
    '--bridge-config-epoch',
    '--genesis-002-database',
    '--ptr-database'
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--generate' || argument === '--verify') {
      if (mode !== undefined) fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
      mode = argument.slice(2);
    } else if (valueOptions.has(argument)) {
      const value = argv[index + 1];
      if (
        values.has(argument)
        || typeof value !== 'string'
        || value.length === 0
        || value.startsWith('--')
      ) fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
      values.set(argument, value);
      index += 1;
    } else {
      fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
    }
  }
  if (mode === undefined) fail('RECOVERY_BOOTSTRAP_GENERATION_REQUIRED');
  const privateRoot = values.get('--private-root');
  if (privateRoot === undefined || !isAbsolute(privateRoot)) {
    fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
  }
  const verificationNames = [
    '--bridge-source-commit',
    '--bridge-config-epoch',
    '--genesis-002-database',
    '--ptr-database'
  ];
  if (
    (mode === 'generate' && verificationNames.some(name => values.has(name)))
    || (mode === 'verify' && verificationNames.some(name => !values.has(name)))
  ) fail('RECOVERY_BOOTSTRAP_ARGUMENTS_INVALID');
  return {
    mode,
    privateRoot: resolve(privateRoot),
    bridgeSourceCommit: values.get('--bridge-source-commit'),
    bridgeConfigEpoch: values.get('--bridge-config-epoch'),
    genesis002Database: values.get('--genesis-002-database'),
    ptrDatabase: values.get('--ptr-database')
  };
}

function assertPrivateRoot(path) {
  const absolute = resolve(path);
  if (portablePath(absolute) === portablePath(parse(absolute).root)) {
    fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  }
  const worktrees = gitWorktreeRoots();
  const userProfile = process.env.USERPROFILE || process.env.HOME || homedir();
  const osRoots = windowsProtectedRoots();
  const profiles = [userProfile, ...osRoots.profiles];
  const desktops = [
    join(userProfile, 'Desktop'),
    join(userProfile, 'OneDrive', 'Desktop'),
    ...osRoots.desktops
  ];
  if (
    profiles.some((profile) => isWithin(path, profile))
    || worktrees.some((worktree) => isWithin(worktree, path) || isWithin(path, worktree))
    || desktops.some((desktop) => isWithin(desktop, path) || isWithin(path, desktop))
    || osRoots.oneDrives.some((oneDrive) => isWithin(oneDrive, path) || isWithin(path, oneDrive))
  ) {
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

let cachedWindowsPrincipal;
let cachedWindowsPrincipalSid;

function windowsPrincipal() {
  if (cachedWindowsPrincipal !== undefined) return cachedWindowsPrincipal;
  const inspected = spawnSync('whoami', [], { encoding: 'utf8', windowsHide: true });
  const principal = inspected.stdout?.trim();
  if (
    inspected.status !== 0
    || typeof principal !== 'string'
    || principal.length === 0
    || principal.includes(':')
    || /[\r\n]/u.test(principal)
  ) fail('RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE');
  cachedWindowsPrincipal = principal;
  return cachedWindowsPrincipal;
}

function assertWindowsCurrentOwner(path) {
  const targetVariable = 'WARPKEEP_RECOVERY_ACL_TARGET_B64';
  const script = String.raw`
$ErrorActionPreference = 'Stop'
$utf8 = [Text.UTF8Encoding]::new($false, $true)
$target = $utf8.GetString([Convert]::FromBase64String($env:WARPKEEP_RECOVERY_ACL_TARGET_B64))
if ([IO.Directory]::Exists($target)) {
  $security = [IO.Directory]::GetAccessControl($target)
} elseif ([IO.File]::Exists($target)) {
  $security = [IO.File]::GetAccessControl($target)
} else {
  throw 'target unavailable'
}
$ownerSid = $security.GetOwner([Security.Principal.SecurityIdentifier]).Value
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
[Console]::Out.Write($currentSid + [Environment]::NewLine + $ownerSid + [Environment]::NewLine)
`;
  const output = runWindowsPowerShell(
    script,
    { [targetVariable]: Buffer.from(path, 'utf8').toString('base64') },
    512,
    'RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE'
  );
  const values = output.split(/\r?\n/u);
  const sidPattern = /^S-[0-9]+(?:-[0-9]+)+$/u;
  if (
    values.length !== 2
    || !sidPattern.test(values[0])
    || !sidPattern.test(values[1])
    || values[0] !== values[1]
    || (cachedWindowsPrincipalSid !== undefined && cachedWindowsPrincipalSid !== values[0])
  ) fail('RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE');
  cachedWindowsPrincipalSid = values[0];
}

function assertWindowsOwnerOnlyAcl(path) {
  if (process.platform !== 'win32') return;
  assertWindowsCurrentOwner(path);
  const inspected = spawnSync('icacls', [path], { encoding: 'utf8', windowsHide: true });
  if (inspected.status !== 0 || !isExactCurrentOwnerOnlyAcl(inspected.stdout, windowsPrincipal())) {
    fail('RECOVERY_BOOTSTRAP_ACL_UNAVAILABLE');
  }
}

function assertExistingPrivateDirectory(path) {
  assertNoSymlinkComponents(path);
  const stat = existingStat(path);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) {
    fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  }
  if (process.platform !== 'win32' && (stat.mode & 0o077) !== 0) {
    fail('RECOVERY_BOOTSTRAP_PRIVATE_ROOT_REJECTED');
  }
  if (process.platform === 'win32') assertWindowsOwnerOnlyAcl(path);
}

function configureWindowsOwnerOnlyAcl(path, isDirectory = false) {
  if (process.platform !== 'win32') return;
  const grant = isDirectory ? '(OI)(CI)(F)' : '(F)';
  const configured = spawnSync('icacls', [path, '/inheritance:r', '/grant:r', `${windowsPrincipal()}:${grant}`], {
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
    writeFileSync(descriptor, bytes);
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

function readSecureRegularFile(path, maxBytes) {
  assertSecureRegularFile(path);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 1 || before.size > maxBytes) {
      fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    }
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

function publicJwkFromPrivate(privateJwk) {
  let scalar;
  let suppliedX;
  let suppliedY;
  let derivedPoint;
  try {
    if (
      typeof privateJwk !== 'object'
      || privateJwk === null
      || Array.isArray(privateJwk)
      || Object.getPrototypeOf(privateJwk) !== Object.prototype
      || JSON.stringify(Object.keys(privateJwk).sort()) !== JSON.stringify(['crv', 'd', 'kty', 'x', 'y'])
      || privateJwk.kty !== 'EC'
      || privateJwk.crv !== 'P-256'
      || typeof privateJwk.x !== 'string'
      || typeof privateJwk.y !== 'string'
      || typeof privateJwk.d !== 'string'
    ) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    suppliedX = decodeCanonical32ByteBase64Url(
      privateJwk.x,
      'RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED'
    );
    suppliedY = decodeCanonical32ByteBase64Url(
      privateJwk.y,
      'RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED'
    );
    scalar = decodeCanonical32ByteBase64Url(
      privateJwk.d,
      'RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED'
    );
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(scalar);
    derivedPoint = ecdh.getPublicKey(undefined, 'uncompressed');
    if (
      derivedPoint.length !== 65
      || derivedPoint[0] !== 0x04
      || !timingSafeEqual(suppliedX, derivedPoint.subarray(1, 33))
      || !timingSafeEqual(suppliedY, derivedPoint.subarray(33, 65))
    ) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    return {
      kty: 'EC',
      crv: 'P-256',
      x: derivedPoint.subarray(1, 33).toString('base64url'),
      y: derivedPoint.subarray(33, 65).toString('base64url')
    };
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
  } finally {
    scalar?.fill(0);
    suppliedX?.fill(0);
    suppliedY?.fill(0);
    derivedPoint?.fill(0);
  }
}

function readPrivateJwk(path) {
  let bytes;
  try {
    bytes = readSecureRegularFile(path, PRIVATE_JWK_MAX_BYTES);
    const text = bytes.toString('utf8');
    const parsed = JSON.parse(text);
    if (text !== `${JSON.stringify(parsed)}\n`) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    publicJwkFromPrivate(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof BootstrapError) throw error;
    fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
  } finally {
    bytes?.fill(0);
  }
}

function readAuthBridgePublicJwk(path) {
  let bytes;
  let xBytes;
  let yBytes;
  try {
    bytes = readSecureRegularFile(path, PUBLIC_JWK_MAX_BYTES);
    const text = bytes.toString('utf8');
    const parsed = JSON.parse(text);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || Array.isArray(parsed)
      || Object.getPrototypeOf(parsed) !== Object.prototype
      || JSON.stringify(Object.keys(parsed)) !== JSON.stringify(['kty', 'crv', 'x', 'y'])
      || parsed.kty !== 'EC'
      || parsed.crv !== 'P-256'
      || typeof parsed.x !== 'string'
      || typeof parsed.y !== 'string'
    ) fail('RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED');
    const canonical = { kty: 'EC', crv: 'P-256', x: parsed.x, y: parsed.y };
    if (text !== `${JSON.stringify(canonical)}\n`) {
      fail('RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED');
    }
    xBytes = decodeCanonical32ByteBase64Url(
      parsed.x,
      'RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED'
    );
    yBytes = decodeCanonical32ByteBase64Url(
      parsed.y,
      'RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED'
    );
    const imported = createPublicKey({ key: canonical, format: 'jwk' }).export({ format: 'jwk' });
    if (
      imported.kty !== canonical.kty
      || imported.crv !== canonical.crv
      || imported.x !== canonical.x
      || imported.y !== canonical.y
    ) fail('RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED');
    return canonical;
  } catch (error) {
    if (
      error instanceof BootstrapError
      && error.code === 'RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED'
    ) throw error;
    fail('RECOVERY_BOOTSTRAP_BRIDGE_PUBLIC_KEY_REJECTED');
  } finally {
    bytes?.fill(0);
    xBytes?.fill(0);
    yBytes?.fill(0);
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

function decodeCanonical32ByteBase64Url(value, code) {
  if (typeof value !== 'string' || !BASE64URL_32_PATTERN.test(value)) fail(code);
  let bytes;
  try {
    bytes = Buffer.from(value, 'base64url');
  } catch {
    fail(code);
  }
  if (bytes.length !== 32 || bytes.toString('base64url') !== value) {
    bytes.fill(0);
    fail(code);
  }
  return bytes;
}

function readSecretFile(path) {
  let fileBytes;
  try {
    fileBytes = readSecureRegularFile(path, SECRET_FILE_BYTES);
    const wire = fileBytes.toString('utf8');
    if (fileBytes.length !== SECRET_FILE_BYTES || wire.at(-1) !== '\n') {
      fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    }
    return decodeCanonical32ByteBase64Url(
      wire.slice(0, -1),
      'RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED'
    );
  } finally {
    fileBytes?.fill(0);
  }
}

function bytesEqual(left, right) {
  return left.length === right.length && timingSafeEqual(left, right);
}

function generateDistinctSecret(excluded) {
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const candidate = randomBytes(32);
    if (!excluded.some(value => bytesEqual(candidate, value))) return candidate;
    candidate.fill(0);
  }
  fail('RECOVERY_BOOTSTRAP_SECRET_GENERATION_FAILED');
}

function assertSeparated(signingScalar, rpcSecret, censusPepper) {
  if (
    bytesEqual(signingScalar, rpcSecret)
    || bytesEqual(signingScalar, censusPepper)
    || bytesEqual(rpcSecret, censusPepper)
  ) fail('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED');
}

function assertOrCreatePublicFile(path, expected) {
  const expectedBytes = `${JSON.stringify(expected)}\n`;
  if (!existingStat(path)) {
    writeExclusive(path, expectedBytes);
    return true;
  }
  if (readSecureRegularFile(path, PUBLIC_JWK_MAX_BYTES).toString('utf8') !== expectedBytes) {
    fail('RECOVERY_BOOTSTRAP_PUBLIC_OUTPUT_REJECTED');
  }
  return false;
}

function assertOrCreateThumbprintFile(path, expected) {
  if (!existingStat(path)) {
    writeExclusive(path, `${expected}\n`);
    return true;
  }
  if (readSecureRegularFile(path, THUMBPRINT_MAX_BYTES).toString('utf8') !== `${expected}\n`) {
    fail('RECOVERY_BOOTSTRAP_PUBLIC_OUTPUT_REJECTED');
  }
  return false;
}

function assertOrCreateExactFile(path, expected, code) {
  if (!existingStat(path)) {
    writeExclusive(path, expected);
    return true;
  }
  if (readSecureRegularFile(path, Buffer.byteLength(expected)).toString('utf8') !== expected) fail(code);
  return false;
}

function assertExactExistingFile(path, expected, maxBytes, code) {
  if (!existingStat(path)) fail(code);
  if (readSecureRegularFile(path, maxBytes).toString('utf8') !== expected) fail(code);
}

function privatePaths(privateRoot) {
  return Object.freeze({
    privateKey: join(privateRoot, PRIVATE_FILE),
    publicKey: join(privateRoot, PUBLIC_FILE),
    thumbprint: join(privateRoot, THUMBPRINT_FILE),
    rpcSecret: join(privateRoot, RPC_SECRET_FILE),
    censusPepper: join(privateRoot, CENSUS_PEPPER_FILE),
    canaryFid: join(privateRoot, CANARY_FID_FILE),
    authBridgePublicJwk: join(privateRoot, AUTH_BRIDGE_PUBLIC_JWK_FILE),
    marker: join(privateRoot, MARKER_FILE)
  });
}

function generateBootstrap(privateRoot) {
  assertPrivateRoot(privateRoot);
  ensurePrivateDirectory(privateRoot);
  const paths = privatePaths(privateRoot);
  let createdCount = 0;
  if (assertOrCreateExactFile(
    paths.marker,
    MARKER_BYTES,
    'RECOVERY_BOOTSTRAP_MARKER_REJECTED'
  )) createdCount += 1;

  let privateJwk;
  if (existingStat(paths.privateKey)) {
    privateJwk = readPrivateJwk(paths.privateKey);
  } else {
    privateJwk = generatedPrivateJwk();
    publicJwkFromPrivate(privateJwk);
    writeExclusive(paths.privateKey, `${JSON.stringify(privateJwk)}\n`);
    createdCount += 1;
  }

  const signingScalar = decodeCanonical32ByteBase64Url(
    privateJwk.d,
    'RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED'
  );
  let rpcSecret;
  let censusPepper;
  let rpcCreated = false;
  let censusCreated = false;
  try {
    rpcSecret = existingStat(paths.rpcSecret) ? readSecretFile(paths.rpcSecret) : undefined;
    censusPepper = existingStat(paths.censusPepper) ? readSecretFile(paths.censusPepper) : undefined;
    if (rpcSecret !== undefined && bytesEqual(signingScalar, rpcSecret)) {
      fail('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED');
    }
    if (censusPepper !== undefined && bytesEqual(signingScalar, censusPepper)) {
      fail('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED');
    }
    if (rpcSecret !== undefined && censusPepper !== undefined && bytesEqual(rpcSecret, censusPepper)) {
      fail('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED');
    }
    if (rpcSecret === undefined) {
      rpcSecret = generateDistinctSecret([
        signingScalar,
        ...(censusPepper === undefined ? [] : [censusPepper])
      ]);
      rpcCreated = true;
    }
    if (censusPepper === undefined) {
      censusPepper = generateDistinctSecret([signingScalar, rpcSecret]);
      censusCreated = true;
    }
    assertSeparated(signingScalar, rpcSecret, censusPepper);
    if (rpcCreated) {
      writeExclusive(paths.rpcSecret, `${rpcSecret.toString('base64url')}\n`);
      createdCount += 1;
    }
    if (censusCreated) {
      writeExclusive(paths.censusPepper, `${censusPepper.toString('base64url')}\n`);
      createdCount += 1;
    }
  } finally {
    signingScalar.fill(0);
    rpcSecret?.fill(0);
    censusPepper?.fill(0);
  }

  const publicJwk = publicJwkFromPrivate(privateJwk);
  const keyThumbprint = thumbprint(publicJwk);
  if (assertOrCreatePublicFile(paths.publicKey, publicJwk)) createdCount += 1;
  if (assertOrCreateThumbprintFile(paths.thumbprint, keyThumbprint)) createdCount += 1;
  const status = createdCount === 6 ? 'generated' : createdCount === 0 ? 'existing' : 'updated';
  process.stdout.write(`RECOVERY_BOOTSTRAP_READY ${status} ${keyThumbprint}\n`);
}

function validatedBridgeCoordinates(options) {
  const {
    bridgeSourceCommit,
    bridgeConfigEpoch,
    genesis002Database,
    ptrDatabase
  } = options;
  if (
    typeof bridgeSourceCommit !== 'string'
    || !LOWERHEX_40_PATTERN.test(bridgeSourceCommit)
    || typeof bridgeConfigEpoch !== 'string'
    || !POSITIVE_DECIMAL_PATTERN.test(bridgeConfigEpoch)
    || typeof genesis002Database !== 'string'
    || !LOWERHEX_64_PATTERN.test(genesis002Database)
    || typeof ptrDatabase !== 'string'
    || !LOWERHEX_64_PATTERN.test(ptrDatabase)
  ) fail('RECOVERY_BOOTSTRAP_BRIDGE_CONFIG_REJECTED');
  const epoch = Number(bridgeConfigEpoch);
  if (
    !Number.isSafeInteger(epoch)
    || epoch <= 0
    || String(epoch) !== bridgeConfigEpoch
    || genesis002Database === GENESIS_001_DATABASE
    || ptrDatabase === GENESIS_001_DATABASE
    || ptrDatabase === genesis002Database
  ) fail('RECOVERY_BOOTSTRAP_BRIDGE_CONFIG_REJECTED');
  return Object.freeze({ bridgeSourceCommit, bridgeConfigEpoch: epoch, genesis002Database, ptrDatabase });
}

function readCanonicalCanaryFid(path) {
  let bytes;
  try {
    bytes = readSecureRegularFile(path, CANARY_FID_MAX_BYTES);
    const value = bytes.toString('utf8');
    if (!/^[1-9][0-9]{0,15}\n$/u.test(value)) fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    const canonical = value.slice(0, -1);
    const numeric = Number(canonical);
    if (!Number.isSafeInteger(numeric) || numeric <= 0 || String(numeric) !== canonical) {
      fail('RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED');
    }
    return canonical;
  } finally {
    bytes?.fill(0);
  }
}

function framedInput(domain, payload) {
  const domainBytes = Buffer.from(`warpkeep-recovery-v1:${domain}:`, 'utf8');
  const result = Buffer.alloc(4 + domainBytes.length + 8 + payload.length);
  result.writeUInt32BE(domainBytes.length, 0);
  domainBytes.copy(result, 4);
  result.writeBigUInt64BE(BigInt(payload.length), 4 + domainBytes.length);
  payload.copy(result, 12 + domainBytes.length);
  return result;
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function verifyBootstrap(options) {
  const coordinates = validatedBridgeCoordinates(options);
  assertPrivateRoot(options.privateRoot);
  assertExistingPrivateDirectory(options.privateRoot);
  const paths = privatePaths(options.privateRoot);
  assertExactExistingFile(
    paths.marker,
    MARKER_BYTES,
    MARKER_MAX_BYTES,
    'RECOVERY_BOOTSTRAP_MARKER_REJECTED'
  );
  const privateJwk = readPrivateJwk(paths.privateKey);
  const recoveryPublicJwk = publicJwkFromPrivate(privateJwk);
  const recoveryKeyThumbprint = thumbprint(recoveryPublicJwk);
  assertExactExistingFile(
    paths.publicKey,
    `${JSON.stringify(recoveryPublicJwk)}\n`,
    PUBLIC_JWK_MAX_BYTES,
    'RECOVERY_BOOTSTRAP_PUBLIC_OUTPUT_REJECTED'
  );
  assertExactExistingFile(
    paths.thumbprint,
    `${recoveryKeyThumbprint}\n`,
    THUMBPRINT_MAX_BYTES,
    'RECOVERY_BOOTSTRAP_PUBLIC_OUTPUT_REJECTED'
  );
  const authBridgePublicJwk = readAuthBridgePublicJwk(paths.authBridgePublicJwk);
  const authBridgeKeyThumbprint = thumbprint(authBridgePublicJwk);
  if (
    (
      authBridgePublicJwk.x === recoveryPublicJwk.x
      && authBridgePublicJwk.y === recoveryPublicJwk.y
    )
    || authBridgeKeyThumbprint === recoveryKeyThumbprint
  ) fail('RECOVERY_BOOTSTRAP_SECRET_SEPARATION_REJECTED');

  const signingScalar = decodeCanonical32ByteBase64Url(
    privateJwk.d,
    'RECOVERY_BOOTSTRAP_PRIVATE_FILE_REJECTED'
  );
  const rpcSecret = readSecretFile(paths.rpcSecret);
  const censusPepper = readSecretFile(paths.censusPepper);
  let canaryPayload;
  let canaryFrame;
  let identityFrame;
  try {
    assertSeparated(signingScalar, rpcSecret, censusPepper);
    const canaryFid = readCanonicalCanaryFid(paths.canaryFid);
    canaryPayload = Buffer.from(canaryFid, 'utf8');
    canaryFrame = framedInput(CANARY_FID_DOMAIN, canaryPayload);
    const projection = {
      schemaVersion: 1,
      profile: BRIDGE_CONFIG_PROFILE,
      bridgeWorkerVersion: BRIDGE_WORKER_VERSION,
      bridgeSourceCommit: coordinates.bridgeSourceCommit,
      bridgeConfigEpoch: coordinates.bridgeConfigEpoch,
      spacetimeOrigin: SPACETIME_ORIGIN,
      genesis001Database: GENESIS_001_DATABASE,
      genesis002Database: coordinates.genesis002Database,
      ptrDatabase: coordinates.ptrDatabase,
      genesis001Audience: GENESIS_001_AUDIENCE,
      genesis002Audience: GENESIS_002_AUDIENCE,
      ptrAudience: PTR_AUDIENCE,
      ptrEnabled: true,
      signingPublicJwkThumbprint: authBridgeKeyThumbprint,
      rpcCredentialSha256: sha256Hex(rpcSecret),
      censusPepperSha256: sha256Hex(censusPepper),
      canaryFidHmacSha256: createHmac('sha256', censusPepper).update(canaryFrame).digest('hex')
    };
    identityFrame = framedInput(BRIDGE_CONFIG_DOMAIN, Buffer.from(JSON.stringify(projection), 'utf8'));
    const bridgeConfigIdentity = sha256Hex(identityFrame);
    process.stdout.write(`RECOVERY_BOOTSTRAP_VERIFIED ${bridgeConfigIdentity}\n`);
  } finally {
    signingScalar.fill(0);
    rpcSecret.fill(0);
    censusPepper.fill(0);
    canaryPayload?.fill(0);
    canaryFrame?.fill(0);
    identityFrame?.fill(0);
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.mode === 'generate') {
    generateBootstrap(options.privateRoot);
  } else {
    verifyBootstrap(options);
  }
}

try {
  main();
} catch (error) {
  const code = error instanceof BootstrapError ? error.code : 'RECOVERY_BOOTSTRAP_FAILED';
  process.stderr.write(`${code}\n`);
  process.exitCode = 1;
}
