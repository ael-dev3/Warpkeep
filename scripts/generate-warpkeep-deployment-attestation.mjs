import { createHash } from 'node:crypto';
import { lstatSync, readdirSync, realpathSync, mkdirSync, openSync, writeFileSync, fsyncSync, closeSync, fstatSync, constants } from 'node:fs';
import { resolve, join } from 'node:path';
import { types } from 'node:util';
import { fileURLToPath } from 'node:url';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';

const ATTESTATION = '.well-known/warpkeep-deployment-v1.json';
const KEYS = ['candidateCommit', 'candidateTree', 'recoveryAuthorizationCoreSha256', 'sourceClosureProfile', 'sourceClosureSha256'];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function fail() { throw new Error('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID'); }
function record(input, keys) {
  if (types.isProxy(input) || input === null || typeof input !== 'object'
      || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length
      || keys.some(key => !descriptors[key]?.enumerable || !Object.hasOwn(descriptors[key], 'value'))) fail();
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function capture(options) {
  const { distRoot, identity: raw } = record(options, ['distRoot', 'identity']);
  const identity = record(raw, KEYS);
  for (const key of KEYS) {
    const valid = key === 'sourceClosureProfile'
      ? identity[key] === 'warpkeep-0.4.0-recovery-source-closure-v1'
      : typeof identity[key] === 'string' && new RegExp(`^[a-f0-9]{${key.startsWith('candidate') ? 40 : 64}}$`, 'u').test(identity[key]);
    if (!valid) fail();
  }
  if (typeof distRoot !== 'string' || resolve(distRoot) !== distRoot || realpathSync(distRoot) !== distRoot) fail();
  const entries = [];
  const capturedIdentities = [];
  const seen = new Set();
  // Minimum TAR footprint: two terminators, headers, and 512-byte body padding.
  // The eventual packager must additionally check its chosen metadata/record padding.
  let total = 1024;
  let count = 0;
  let pathMetadataBytes = ATTESTATION.length;
  function walk(directory, prefix = '') {
    const before = lstatSync(directory, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()) fail();
    capturedIdentities.push({ path: directory, identity: Object.fromEntries(
      ['dev', 'ino', 'mode', 'uid', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].map(key => [key, String(before[key])])) });
    for (const name of readdirSync(directory)) {
      const path = prefix + name;
      if (++count > 20000 || Buffer.byteLength(path) > 1024 || /[^\x20-\x7e]|\\/u.test(path)
          || name === '.' || name === '..' || name === 'node_modules' || seen.has(path.toLowerCase())) fail();
      seen.add(path.toLowerCase());
      if (path !== ATTESTATION) pathMetadataBytes += Buffer.byteLength(path);
      if (pathMetadataBytes > 4 * 1024 * 1024) fail();
      const full = join(directory, name);
      const status = lstatSync(full, { bigint: true });
      if (status.isSymbolicLink()) fail();
      if ((path === '.well-known' && !status.isDirectory())
          || (path.startsWith('.well-known/') && !status.isFile())) fail();
      if (name.startsWith('.') && path !== '.well-known') fail();
      if (path.startsWith('.well-known/') && ![ATTESTATION, '.well-known/farcaster.json'].includes(path)) fail();
      if (status.isDirectory()) { total += 512; walk(full, `${path}/`); continue; }
      if (!status.isFile() || status.nlink !== 1n) fail();
      const opened = readLocalBindingBoundedFile(full, { maximumBytes: path === ATTESTATION ? 16384 : 64 * 1024 * 1024 });
      try {
        capturedIdentities.push({ path: full, identity: opened.identity });
        if (path !== ATTESTATION) total += 512 + Math.ceil(opened.body.length / 512) * 512;
        if (total > 150 * 1024 * 1024) fail();
        if (path !== ATTESTATION) entries.push({ path, byteLength: opened.body.length, sha256: sha(opened.body) });
      } finally { opened.body.fill(0); }
    }
    const after = lstatSync(directory, { bigint: true });
    if (['dev', 'ino', 'mtimeNs', 'ctimeNs'].some(key => before[key] !== after[key])) fail();
  }
  walk(distRoot);
  if (count + (seen.has(ATTESTATION) ? 0 : 1) > 20000) fail();
  for (const captured of capturedIdentities) {
    const current = lstatSync(captured.path, { bigint: true });
    if (Object.entries(captured.identity).some(([key, value]) => String(current[key]) !== value)) fail();
  }
  if (entries.length === 0) fail();
  entries.sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
  const contentManifestSha256 = sha(JSON.stringify(entries));
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-deployment-attestation-v1',
    ...identity, releaseVersion: '0.4.0', canonicalOrigin: 'https://warpkeep.com',
    contentManifestSha256 }));
  if (total + 512 + Math.ceil(bytes.length / 512) * 512 > 150 * 1024 * 1024) fail();
  return { distRoot, bytes, contentManifestSha256, rootIdentity: capturedIdentities[0].identity };
}

/** Derives bytes only; caller coordinates are data, never deployment authority. */
export function deriveWarpkeepDeploymentAttestation(options) {
  const { bytes } = capture(options);
  return Object.freeze({ path: ATTESTATION, bytes: new Uint8Array(bytes) });
}
export function verifyWarpkeepDeploymentAttestation(options) {
  const { distRoot, bytes, contentManifestSha256 } = capture(options);
  const opened = readLocalBindingBoundedFile(join(distRoot, ATTESTATION), { maximumBytes: 16384 });
  try {
    if (!opened.body.equals(bytes)) fail();
    // Derived from the re-read file tree, never copied from unchecked JSON.
    return Object.freeze({ deploymentAttestationSha256: sha(bytes), contentManifestSha256 });
  } finally { opened.body.fill(0); }
}

/** Installs once in a disposable build directory; does not authorize deployment. */
export function installWarpkeepDeploymentAttestation(options) {
  if (process.platform !== 'linux') throw new Error('WARPKEEP_DEPLOYMENT_ATTESTATION_INSTALL_REQUIRES_LINUX');
  // Validate the entire input before creating even the well-known directory.
  const initial = capture(options);
  initial.bytes.fill(0);
  let rootDescriptor;
  let directoryDescriptor;
  let descriptor;
  let bytes;
  try {
    rootDescriptor = openSync(initial.distRoot, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    const rootStatus = fstatSync(rootDescriptor, { bigint: true });
    if (Object.entries(initial.rootIdentity).some(([key, value]) => String(rootStatus[key]) !== value)) fail();
    // Held directory descriptors prevent ancestor substitution from redirecting
    // writes outside this captured disposable dist, including during mkdir.
    const directory = `/proc/self/fd/${rootDescriptor}/.well-known`;
    try { mkdirSync(directory); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    directoryDescriptor = openSync(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
    // Count the added directory's TAR header and validate the current tree.
    ({ bytes } = capture(options));
    descriptor = openSync(`/proc/self/fd/${directoryDescriptor}/warpkeep-deployment-v1.json`,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o644);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    fsyncSync(directoryDescriptor);
    fsyncSync(rootDescriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
    if (rootDescriptor !== undefined) closeSync(rootDescriptor);
    bytes?.fill(0);
  }
  // Re-scan actual output, not the bytes just passed to writeFileSync. Any
  // failed installation stays in the disposable candidate for inspection;
  // do not unlink a path that another process may have replaced.
  return verifyWarpkeepDeploymentAttestation(options);
}

let invokedDirectly = false;
try {
  invokedDirectly = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url);
} catch { /* Embedded importers need not supply a filesystem entry point. */ }
if (invokedDirectly) {
  try {
    if (process.argv.length !== 3 || !['--write', '--check'].includes(process.argv[2])) fail();
    const { readRecoveryAttestationSource } = await import('./recovery-attestation-source.mjs');
    const repositoryRoot = process.cwd();
    const identity = readRecoveryAttestationSource(repositoryRoot);
    const options = { distRoot: join(repositoryRoot, 'dist'), identity };
    const result = process.argv[2] === '--write'
      ? installWarpkeepDeploymentAttestation(options)
      : verifyWarpkeepDeploymentAttestation(options);
    if (JSON.stringify(readRecoveryAttestationSource(repositoryRoot)) !== JSON.stringify(identity)) fail();
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch {
    process.stderr.write('WARPKEEP_DEPLOYMENT_ATTESTATION_INVALID\n');
    process.exitCode = 1;
  }
}
