import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import {
  isAbsolute,
  parse,
  relative,
  resolve,
  sep,
} from 'node:path';
import { pathToFileURL } from 'node:url';

export const PRODUCTION_PLAYER_CANARY_BROWSER_LAUNCHER_PROFILE =
  'warpkeep-production-player-canary-browser-launcher-v1';

const PACKET_KEYS = Object.freeze([
  'evidenceNonce',
  'reviewedAdmissionPlanDigest',
  'routeSetCommitment',
]);
const SHA256 = /^[0-9a-f]{64}$/u;
const MAXIMUM_PACKET_BYTES = 512;

export class ProductionPlayerCanaryBrowserLauncherError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryBrowserLauncherError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryBrowserLauncherError(code);
}

function exactPacket(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).some(key => typeof key !== 'string')
    || Reflect.ownKeys(value).length !== PACKET_KEYS.length
    || Reflect.ownKeys(value).sort().join('\0') !== [...PACKET_KEYS].sort().join('\0')
  ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const evidenceNonce = descriptors.evidenceNonce?.value;
  const reviewedAdmissionPlanDigest = descriptors.reviewedAdmissionPlanDigest?.value;
  const routeSetCommitment = descriptors.routeSetCommitment?.value;
  if (
    typeof evidenceNonce !== 'string'
    || !SHA256.test(evidenceNonce)
    || typeof reviewedAdmissionPlanDigest !== 'string'
    || !SHA256.test(reviewedAdmissionPlanDigest)
    || typeof routeSetCommitment !== 'string'
    || !SHA256.test(routeSetCommitment)
  ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
  return Object.freeze({
    evidenceNonce,
    reviewedAdmissionPlanDigest,
    routeSetCommitment,
  });
}

export function encodeProductionPlayerCanaryBrowserLaunchPacket(value) {
  const packet = exactPacket(value);
  return Buffer.from(`${JSON.stringify(packet, null, 2)}\n`, 'utf8');
}

function currentUid() {
  const uid = typeof process.getuid === 'function' ? process.getuid() : undefined;
  if (!Number.isSafeInteger(uid) || uid < 0) {
    fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_OWNER_INVALID');
  }
  return uid;
}

function ownerPrivateDirectory(directory) {
  const requested = resolve(directory);
  if (!isAbsolute(directory) || requested !== directory) {
    fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_DIRECTORY_INVALID');
  }
  const root = parse(requested).root;
  const uid = currentUid();
  let current = root;
  for (const component of relative(root, requested).split(sep).filter(Boolean)) {
    current = resolve(current, component);
    let metadata;
    try { metadata = lstatSync(current); } catch {
      fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_DIRECTORY_INVALID');
    }
    const stickySystemAncestor = metadata.uid === 0
      && (metadata.mode & 0o1000) !== 0
      && (metadata.mode & 0o002) !== 0;
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || (metadata.uid !== uid && metadata.uid !== 0)
      || ((metadata.mode & 0o022) !== 0 && !stickySystemAncestor)
    ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_DIRECTORY_INVALID');
  }
  let canonical;
  let finalMetadata;
  try {
    canonical = realpathSync(requested);
    finalMetadata = lstatSync(requested);
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_DIRECTORY_INVALID');
  }
  if (
    canonical !== requested
    || !finalMetadata.isDirectory()
    || finalMetadata.isSymbolicLink()
    || finalMetadata.uid !== uid
    || (finalMetadata.mode & 0o7777) !== 0o700
  ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_DIRECTORY_INVALID');
  return Object.freeze({ path: canonical, metadata: finalMetadata, uid });
}

function canonicalPacketPath(path) {
  if (
    typeof path !== 'string'
    || !isAbsolute(path)
    || resolve(path) !== path
    || path === parse(path).root
    || path.includes('\0')
  ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_PATH_INVALID');
  return path;
}

export function writeProductionPlayerCanaryBrowserLaunchPacket({ destination, packet }) {
  const path = canonicalPacketPath(destination);
  const directory = ownerPrivateDirectory(parse(path).dir);
  const bytes = encodeProductionPlayerCanaryBrowserLaunchPacket(packet);
  let descriptor;
  let openedMetadata;
  let complete = false;
  try {
    descriptor = openSync(
      path,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    openedMetadata = fstatSync(descriptor);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    fchmodSync(descriptor, 0o600);
    const metadata = fstatSync(descriptor);
    const currentDirectory = lstatSync(directory.path);
    if (
      !metadata.isFile()
      || metadata.uid !== directory.uid
      || metadata.nlink !== 1
      || (metadata.mode & 0o7777) !== 0o600
      || metadata.size !== bytes.byteLength
      || !currentDirectory.isDirectory()
      || currentDirectory.isSymbolicLink()
      || currentDirectory.dev !== directory.metadata.dev
      || currentDirectory.ino !== directory.metadata.ino
    ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_WRITE_INVALID');
    complete = true;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryBrowserLauncherError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_WRITE_INVALID');
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
    if (!complete && openedMetadata !== undefined) {
      try {
        const residue = lstatSync(path);
        if (
          residue.isFile()
          && !residue.isSymbolicLink()
          && residue.dev === openedMetadata.dev
          && residue.ino === openedMetadata.ino
        ) unlinkSync(path);
      } catch {
        // Preserve the bounded writer failure; never unlink a substituted path.
      }
    }
  }
  return inspectProductionPlayerCanaryBrowserLaunchPacket({ path });
}

export function inspectProductionPlayerCanaryBrowserLaunchPacket({ path: rawPath }) {
  const path = canonicalPacketPath(rawPath);
  const directory = ownerPrivateDirectory(parse(path).dir);
  let descriptor;
  let bytes;
  try {
    const before = lstatSync(path);
    if (
      !before.isFile()
      || before.isSymbolicLink()
      || before.uid !== directory.uid
      || before.nlink !== 1
      || (before.mode & 0o7777) !== 0o600
      || before.size < 1
      || before.size > MAXIMUM_PACKET_BYTES
    ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_METADATA_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const opened = fstatSync(descriptor);
    const currentDirectory = lstatSync(directory.path);
    if (
      !opened.isFile()
      || opened.dev !== before.dev
      || opened.ino !== before.ino
      || opened.uid !== directory.uid
      || opened.nlink !== 1
      || (opened.mode & 0o7777) !== 0o600
      || opened.size !== before.size
      || !currentDirectory.isDirectory()
      || currentDirectory.isSymbolicLink()
      || currentDirectory.uid !== directory.uid
      || (currentDirectory.mode & 0o7777) !== 0o700
      || currentDirectory.dev !== directory.metadata.dev
      || currentDirectory.ino !== directory.metadata.ino
    ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_METADATA_INVALID');
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== opened.dev
      || after.ino !== opened.ino
      || after.uid !== opened.uid
      || after.nlink !== 1
      || (after.mode & 0o7777) !== 0o600
      || after.size !== opened.size
    ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_METADATA_INVALID');
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
    }
    const packet = exactPacket(parsed);
    const canonical = encodeProductionPlayerCanaryBrowserLaunchPacket(packet);
    try {
      if (!bytes.equals(canonical)) {
        fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
      }
    } finally {
      canonical.fill(0);
    }
    return packet;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryBrowserLauncherError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_READ_INVALID');
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

async function readBoundedStandardInput() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.byteLength;
    if (length > MAXIMUM_PACKET_BYTES) {
      for (const retained of chunks) retained.fill(0);
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
    }
    chunks.push(bytes);
  }
  const input = Buffer.concat(chunks, length);
  for (const chunk of chunks) chunk.fill(0);
  return input;
}

export async function runProductionPlayerCanaryBrowserLauncherCli(
  arguments_ = process.argv.slice(2),
) {
  if (
    !Array.isArray(arguments_)
    || arguments_.length !== 2
    || (arguments_[0] !== 'write' && arguments_[0] !== 'inspect')
    || typeof arguments_[1] !== 'string'
  ) fail('PRODUCTION_PLAYER_CANARY_BROWSER_LAUNCHER_USAGE');
  if (arguments_[0] === 'inspect') {
    inspectProductionPlayerCanaryBrowserLaunchPacket({ path: arguments_[1] });
    process.stdout.write('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_VALID\n');
    return;
  }
  const bytes = await readBoundedStandardInput();
  try {
    let packet;
    try {
      packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_INVALID');
    }
    writeProductionPlayerCanaryBrowserLaunchPacket({
      destination: arguments_[1],
      packet,
    });
    process.stdout.write('PRODUCTION_PLAYER_CANARY_BROWSER_PACKET_WRITTEN\n');
  } finally {
    bytes.fill(0);
  }
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  runProductionPlayerCanaryBrowserLauncherCli().catch(error => {
    process.stderr.write(`${
      error instanceof ProductionPlayerCanaryBrowserLauncherError
        ? error.code
        : 'PRODUCTION_PLAYER_CANARY_BROWSER_LAUNCHER_FAILED'
    }\n`);
    process.exitCode = 1;
  });
}
