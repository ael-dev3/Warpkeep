import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const release = Object.freeze({
  tag: 'title-stone-letters-2026-07-12',
  attachment: 'warpkeep-title-assemblies-v1.zip',
  bytes: 5_994_957,
  sha256: '492af33d4b0ff5ab80f2e726b68c2f8d497cd75bbcc036f57f2388e0b4089177'
});
const archive = process.env.WARPKEEP_TITLE_ARCHIVE
  ? resolve(process.env.WARPKEEP_TITLE_ARCHIVE)
  : process.env.WARPKEEP_TITLE_ARCHIVE_CACHE
    ? resolve(process.env.WARPKEEP_TITLE_ARCHIVE_CACHE)
    : resolve(root, '.cache/warpkeep-assets', release.tag, release.attachment);
const outputDirectory = resolve(root, 'public/models/title');
const bundleRoot = 'warpkeep-title-assemblies-v1';
const models = Object.freeze([
  {
    member: `${bundleRoot}/warpkeep-title-high.glb`,
    destination: 'warpkeep-title-high.glb',
    bytes: 3_844_364,
    sha256: '2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5'
  },
  {
    member: `${bundleRoot}/warpkeep-title-compact.glb`,
    destination: 'warpkeep-title-compact.glb',
    bytes: 1_714_060,
    sha256: 'd29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8'
  }
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExact(bytes, expected, label) {
  if (bytes.byteLength !== expected.bytes) throw new Error(`${label} byte length changed: ${bytes.byteLength}.`);
  const hash = sha256(bytes);
  if (hash !== expected.sha256) throw new Error(`${label} hash changed: ${hash}.`);
}

function unzip(args, encoding = 'utf8') {
  const result = spawnSync('unzip', args, {
    cwd: root,
    encoding,
    maxBuffer: 24 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`unzip failed (${result.status}): ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

function assertSafeArchive(entries) {
  const normalized = new Set();
  for (const entry of entries) {
    if (!entry || entry.includes('\\') || entry.includes('\0') || entry.startsWith('/') || /^[A-Za-z]:/.test(entry)) {
      throw new Error(`Unsafe ZIP entry: ${JSON.stringify(entry)}.`);
    }
    const parts = entry.split('/').filter(Boolean);
    if (parts.some((part) => part === '.' || part === '..')) throw new Error(`Unsafe ZIP path: ${entry}.`);
    const key = entry.normalize('NFC');
    if (normalized.has(key)) throw new Error(`Duplicate ZIP entry: ${entry}.`);
    normalized.add(key);
    if (parts[0] !== bundleRoot) throw new Error(`Unexpected ZIP root: ${entry}.`);
  }
  const listing = unzip(['-Z', '-l', archive]);
  if (listing.split(/\r?\n/).some((line) => /^l[rwx-]{9}\s/.test(line))) {
    throw new Error('The title archive contains a symbolic link.');
  }
  for (const model of models) {
    if (!normalized.has(model.member)) throw new Error(`Missing ZIP member: ${model.member}.`);
  }
}

if (!statSync(archive, { throwIfNoEntry: false })) {
  throw new Error(
    `Missing verified title archive at ${archive}. Run "npm run assets:fetch" or set WARPKEEP_TITLE_ARCHIVE to an offline copy.`
  );
}
const archiveBytes = readFileSync(archive);
assertExact(archiveBytes, release, `${release.tag}/${release.attachment}`);
const entries = unzip(['-Z1', archive]).split(/\r?\n/).filter(Boolean);
assertSafeArchive(entries);

mkdirSync(outputDirectory, { recursive: true });
for (const model of models) {
  const bytes = unzip(['-p', archive, model.member], null);
  assertExact(bytes, model, model.member);
  if (bytes.subarray(0, 4).toString('ascii') !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error(`${model.member} is not a glTF 2.0 binary.`);
  }
  if (bytes.readUInt32LE(8) !== bytes.byteLength) {
    throw new Error(`${model.member} has a mismatched declared GLB length.`);
  }
  const destination = resolve(outputDirectory, basename(model.destination));
  writeFileSync(destination, bytes);
  console.log(`${model.destination}: ${model.bytes} bytes, sha256 ${model.sha256}`);
}
