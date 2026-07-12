import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';

const execFileAsync = promisify(execFile);
const moduleUrl = new URL(import.meta.url);
const defaultRepositoryRoot = moduleUrl.protocol === 'file:'
  ? resolve(fileURLToPath(new URL('..', moduleUrl)))
  : null;

export const CANONICAL_LICENSE_HASHES = Object.freeze({
  legacy0Bsd: 'ca4c1f2732106deec154294b650f3f87daa99bed9b570fbe01c9a124e852b701',
  legacyCc0: 'a2010f343487d3f7618affe54f789f5487602331c0a8d03f49e9a7c547cf0499',
  apache2: 'cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30',
  ccBy4: '9ba9550ad48438d0836ddab3da480b3b69ffa0aac7b7878b5a0039e7ab429411'
});

const CUTOVER_RECORD = 'docs/legal/v0.3.0-cutover.json';
const LEGACY_0BSD_PATH = 'licenses/legacy/LICENSE-0BSD-v0.2.0';
const LEGACY_CC0_PATH = 'licenses/legacy/LICENSE-CC0-1.0-v0.2.0';
const POLICY_FILES = [
  'ASSETS-LICENSE.md',
  'CONTRIBUTING.md',
  'LICENSING.md',
  'TRADEMARKS.md',
  'docs/legal/license-inventory.md',
  'docs/legal/v0.3.0-license-cutover.md'
];
const CUTOVER_FILES = [
  ...POLICY_FILES,
  '.reuse/dep5',
  'LICENSE',
  'LICENSE-CC-BY-4.0',
  LEGACY_0BSD_PATH,
  LEGACY_CC0_PATH,
  'NOTICE'
];

// SemVer 2.0.0, with numeric identifiers kept as strings and compared as BigInt.
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const utf8 = new TextDecoder('utf-8', { fatal: true });
const ACTIVE_SOFTWARE_POLICY = 'Active software license: Apache-2.0';
const ACTIVE_CREATIVE_POLICY = 'Active project-owned creative-content license: CC-BY-4.0';

function fail(message) {
  throw new Error(`License policy verification failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function parseJson(content, label) {
  try {
    return JSON.parse(content);
  } catch {
    fail(`${label} must contain valid JSON`);
  }
}

function parseSemanticVersion(version, label = 'package version') {
  assert(typeof version === 'string', `${label} must be a SemVer string`);
  const match = SEMVER_PATTERN.exec(version);
  assert(match, `${label} must be a complete valid SemVer value`);
  return {
    raw: version,
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4] ?? null,
    build: match[5] ?? null
  };
}

function isCutoverVersion(version) {
  return version.major > 0n || (version.major === 0n && version.minor >= 3n);
}

function isCutoverBoundary(version) {
  return version.major === 0n && version.minor === 3n && version.patch === 0n;
}

function sha256(content) {
  return createHash('sha256').update(content).digest('hex');
}

function decodeUtf8(content, label) {
  try {
    return utf8.decode(content);
  } catch {
    fail(`${label} must be valid UTF-8 text`);
  }
}

async function workspaceBytes(repositoryRoot, relativePath) {
  try {
    return await readFile(resolve(repositoryRoot, relativePath));
  } catch {
    fail(`required file is missing or unreadable: ${relativePath}`);
  }
}

async function workspaceText(repositoryRoot, relativePath) {
  return decodeUtf8(await workspaceBytes(repositoryRoot, relativePath), relativePath);
}

async function workspaceRegularFileExists(repositoryRoot, relativePath) {
  try {
    return (await lstat(resolve(repositoryRoot, relativePath))).isFile();
  } catch {
    return false;
  }
}

async function workspacePathExists(repositoryRoot, relativePath) {
  try {
    await lstat(resolve(repositoryRoot, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function runGit(repositoryRoot, args, { allowFailure = false, binary = false } = {}) {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['--no-pager', '--no-replace-objects', '--literal-pathspecs', ...args],
      {
        cwd: repositoryRoot,
        encoding: binary ? null : 'utf8',
        env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true
      }
    );
    return { ok: true, stdout };
  } catch {
    if (allowFailure) return { ok: false, stdout: binary ? Buffer.alloc(0) : '' };
    fail('required Git history is unavailable');
  }
}

async function gitText(repositoryRoot, args, failureMessage) {
  const result = await runGit(repositoryRoot, args, { allowFailure: true });
  assert(result.ok, failureMessage);
  return String(result.stdout).trim();
}

async function snapshotFileMode(repositoryRoot, reference, relativePath) {
  const result = await runGit(
    repositoryRoot,
    ['ls-tree', '-z', reference, '--', relativePath],
    { allowFailure: true, binary: true }
  );
  if (!result.ok || !Buffer.isBuffer(result.stdout) || result.stdout.length === 0) return null;
  const firstSpace = result.stdout.indexOf(0x20);
  if (firstSpace <= 0) fail(`could not inspect Git mode for ${relativePath} at ${reference}`);
  return result.stdout.subarray(0, firstSpace).toString('ascii');
}

async function snapshotPathExists(repositoryRoot, reference, relativePath) {
  return (await snapshotFileMode(repositoryRoot, reference, relativePath)) !== null;
}

async function snapshotHasRegularFile(repositoryRoot, reference, relativePath) {
  return /^100(?:644|755)$/.test((await snapshotFileMode(repositoryRoot, reference, relativePath)) ?? '');
}

async function snapshotBytes(repositoryRoot, reference, relativePath, label = reference) {
  assert(
    await snapshotHasRegularFile(repositoryRoot, reference, relativePath),
    `required ordinary file is missing at ${label}: ${relativePath}`
  );
  const result = await runGit(
    repositoryRoot,
    ['show', `${reference}:${relativePath}`],
    { allowFailure: true, binary: true }
  );
  assert(result.ok && Buffer.isBuffer(result.stdout), `could not inspect ${relativePath} at ${label}`);
  return result.stdout;
}

async function snapshotText(repositoryRoot, reference, relativePath, label = reference) {
  return decodeUtf8(
    await snapshotBytes(repositoryRoot, reference, relativePath, label),
    `${relativePath} at ${label}`
  );
}

async function snapshotJson(repositoryRoot, reference, relativePath, label = reference) {
  return parseJson(
    await snapshotText(repositoryRoot, reference, relativePath, label),
    `${relativePath} at ${label}`
  );
}

async function snapshotPackageManifests(repositoryRoot, reference, label) {
  const result = await runGit(
    repositoryRoot,
    ['ls-tree', '-r', '-z', '--name-only', reference],
    { allowFailure: true, binary: true }
  );
  assert(result.ok && Buffer.isBuffer(result.stdout), `could not enumerate files at ${label}`);
  const paths = [];
  let offset = 0;
  for (let index = 0; index < result.stdout.length; index += 1) {
    if (result.stdout[index] !== 0) continue;
    const path = decodeUtf8(result.stdout.subarray(offset, index), `Git path at ${label}`);
    if (path === 'package.json' || path.endsWith('/package.json')) paths.push(path);
    offset = index + 1;
  }
  assert(offset === result.stdout.length, `Git path listing at ${label} must be NUL terminated`);
  assert(paths.includes('package.json'), `root package.json is missing at ${label}`);
  return paths;
}

function dep5LicenseMappings(content) {
  const mappings = new Map();
  const paragraphs = content.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n/);
  for (const paragraph of paragraphs) {
    let files = null;
    let license = null;
    for (const line of paragraph.split('\n')) {
      const filesMatch = /^Files:[ \t]+(.+)$/.exec(line);
      if (filesMatch) files = filesMatch[1].trim();
      const licenseMatch = /^License:[ \t]+([^ \t]+)(?:[ \t].*)?$/.exec(line);
      if (licenseMatch) license = licenseMatch[1];
    }
    if (files && license) {
      if (!mappings.has(license)) mappings.set(license, new Set());
      mappings.get(license).add(files);
    }
  }
  return mappings;
}

function validateHashConfiguration(expectedHashes) {
  for (const name of ['legacy0Bsd', 'legacyCc0', 'apache2', 'ccBy4']) {
    assert(
      typeof expectedHashes?.[name] === 'string' && SHA256_PATTERN.test(expectedHashes[name]),
      `internal ${name} license hash must be lowercase SHA-256`
    );
  }
}

async function verifyPreparationState(repositoryRoot, packageJson, expectedHashes) {
  for (const required of [...POLICY_FILES, 'LICENSE', 'LICENSE-CC0']) {
    assert(
      await workspaceRegularFileExists(repositoryRoot, required),
      `required ordinary policy file is missing: ${required}`
    );
  }
  assert(
    !(await workspacePathExists(repositoryRoot, CUTOVER_RECORD)),
    `${CUTOVER_RECORD} must not exist before the v0.3.0 cutover`
  );
  assert(
    !(await snapshotPathExists(repositoryRoot, 'HEAD', CUTOVER_RECORD)),
    `${CUTOVER_RECORD} must not be committed before the v0.3.0 cutover`
  );
  assert(
    sha256(await workspaceBytes(repositoryRoot, 'LICENSE')) === expectedHashes.legacy0Bsd,
    'root LICENSE must remain the exact historical 0BSD text before v0.3.0'
  );
  assert(packageJson.license === '0BSD', 'root package software license must remain 0BSD before v0.3.0');
  assert(
    sha256(await workspaceBytes(repositoryRoot, 'LICENSE-CC0')) === expectedHashes.legacyCc0,
    'LICENSE-CC0 must remain byte-for-byte unchanged before v0.3.0'
  );
  const committedPackage = await snapshotJson(repositoryRoot, 'HEAD', 'package.json', 'current HEAD');
  assert(committedPackage.license === '0BSD', 'committed root package license must remain 0BSD before v0.3.0');
  assert(
    sha256(await snapshotBytes(repositoryRoot, 'HEAD', 'LICENSE', 'current HEAD')) === expectedHashes.legacy0Bsd,
    'committed root LICENSE must remain the exact historical 0BSD text before v0.3.0'
  );
  assert(
    sha256(await snapshotBytes(repositoryRoot, 'HEAD', 'LICENSE-CC0', 'current HEAD')) === expectedHashes.legacyCc0,
    'committed LICENSE-CC0 must remain byte-for-byte unchanged before v0.3.0'
  );

  const licensing = await workspaceText(repositoryRoot, 'LICENSING.md');
  assert(licensing.includes('v0.3.0'), 'LICENSING.md must state the v0.3.0 transition');
  assert(licensing.includes('Apache-2.0'), 'LICENSING.md must state the future Apache-2.0 policy');
  assert(licensing.includes('CC-BY-4.0'), 'LICENSING.md must state the future CC-BY-4.0 policy');
  assert(
    licensing.includes('Historical 0BSD and CC0 grants are not revoked.'),
    'LICENSING.md must preserve historical grants explicitly'
  );

  const readme = await workspaceText(repositoryRoot, 'README.md');
  const opening = readme.split(/^## /m, 1)[0];
  assert(!/^#{1,6}\s+Licen[cs]e\b/im.test(readme), 'README must not contain a License heading');
  assert(
    (opening.match(/https:\/\/warpkeep\.com\//g) ?? []).length === 1,
    'README opening must contain exactly one canonical warpkeep.com URL'
  );
  assert(
    opening.includes('[warpkeep.com](https://warpkeep.com/)'),
    'README opening must use warpkeep.com as the visible product link'
  );
  assert(!readme.includes('ael-dev3.github.io/Warpkeep'), 'README must not use the legacy path-based Pages URL');
  assert(
    !/Historical 0BSD and CC0 grants are revoked/i.test(readme),
    'README must not claim historical grants were revoked'
  );
}

async function verifyHistoricalParent(repositoryRoot, reference, expectedHashes) {
  const label = 'the cutover parent';
  assert(
    !(await snapshotPathExists(repositoryRoot, reference, CUTOVER_RECORD)),
    'the cutover commit parent must not contain a premature cutover record'
  );
  const packageJson = await snapshotJson(repositoryRoot, reference, 'package.json', label);
  const version = parseSemanticVersion(packageJson.version, `${label} package version`);
  assert(!isCutoverVersion(version), 'the cutover commit parent must remain below the v0.3.0 line');
  assert(packageJson.license === '0BSD', 'the cutover commit parent must still declare 0BSD');
  assert(
    sha256(await snapshotBytes(repositoryRoot, reference, 'LICENSE', label)) === expectedHashes.legacy0Bsd,
    'the cutover commit parent must retain the exact historical 0BSD text'
  );
  assert(
    sha256(await snapshotBytes(repositoryRoot, reference, 'LICENSE-CC0', label)) === expectedHashes.legacyCc0,
    'the cutover commit parent must retain the exact historical CC0 text'
  );
}

async function verifyCutoverSnapshot(repositoryRoot, reference, expectedHashes, { boundary, label }) {
  for (const relativePath of CUTOVER_FILES) {
    assert(
      await snapshotHasRegularFile(repositoryRoot, reference, relativePath),
      `required ordinary cutover file is missing at ${label}: ${relativePath}`
    );
  }

  const rootPackage = await snapshotJson(repositoryRoot, reference, 'package.json', label);
  const version = parseSemanticVersion(rootPackage.version, `${label} package version`);
  assert(
    boundary ? isCutoverBoundary(version) : isCutoverVersion(version),
    boundary
      ? 'the attested cutover commit must use the v0.3.0 core version'
      : 'current HEAD must remain on or beyond the v0.3.0 line'
  );
  assert(rootPackage.license === 'Apache-2.0', `root package must declare Apache-2.0 at ${label}`);
  assert(
    sha256(await snapshotBytes(repositoryRoot, reference, 'LICENSE', label)) === expectedHashes.apache2,
    `root LICENSE must be the exact Apache-2.0 text at ${label}`
  );
  assert(
    sha256(await snapshotBytes(repositoryRoot, reference, 'LICENSE-CC-BY-4.0', label)) === expectedHashes.ccBy4,
    `active CC-BY-4.0 text must be exact at ${label}`
  );
  assert(
    sha256(await snapshotBytes(repositoryRoot, reference, LEGACY_0BSD_PATH, label)) === expectedHashes.legacy0Bsd,
    `legacy 0BSD text must be preserved exactly at ${label}`
  );
  assert(
    sha256(await snapshotBytes(repositoryRoot, reference, LEGACY_CC0_PATH, label)) === expectedHashes.legacyCc0,
    `legacy CC0 text must be preserved exactly at ${label}`
  );
  assert(
    !(await snapshotPathExists(repositoryRoot, reference, 'LICENSE-CC0')),
    `the historical root LICENSE-CC0 path must not remain active at ${label}`
  );

  for (const manifest of await snapshotPackageManifests(repositoryRoot, reference, label)) {
    const current = await snapshotJson(repositoryRoot, reference, manifest, label);
    assert(current.license === 'Apache-2.0', `${manifest} must declare Apache-2.0 at ${label}`);
  }

  const notice = await snapshotText(repositoryRoot, reference, 'NOTICE', label);
  assert(notice.trim().length > 0, `NOTICE must not be empty at ${label}`);
  const dep5 = await snapshotText(repositoryRoot, reference, '.reuse/dep5', label);
  assert(dep5.trim().length > 0, `.reuse/dep5 must not be empty at ${label}`);
  const mappings = dep5LicenseMappings(dep5);
  for (const license of ['Apache-2.0', 'CC-BY-4.0']) {
    assert(
      (mappings.get(license)?.size ?? 0) > 0,
      `.reuse/dep5 must contain a structured Files/License mapping for ${license} at ${label}`
    );
  }
  assert(
    [...(mappings.get('0BSD') ?? [])].some((files) => files.split(/[ \t]+/).includes(LEGACY_0BSD_PATH)),
    `.reuse/dep5 must map the preserved 0BSD path at ${label}`
  );
  assert(
    [...(mappings.get('CC0-1.0') ?? [])].some((files) => files.split(/[ \t]+/).includes(LEGACY_CC0_PATH)),
    `.reuse/dep5 must map the preserved CC0 path at ${label}`
  );
  const licensing = await snapshotText(repositoryRoot, reference, 'LICENSING.md', label);
  assert(
    licensing.includes('Historical 0BSD and CC0 grants are not revoked.'),
    `LICENSING.md must preserve historical grants at ${label}`
  );
  for (const evidence of [ACTIVE_SOFTWARE_POLICY, ACTIVE_CREATIVE_POLICY]) {
    assert(
      licensing.includes(evidence),
      `LICENSING.md must state the active v0.3.0 policy at ${label}: ${evidence}`
    );
  }
  assert(
    licensing.includes(LEGACY_0BSD_PATH) && licensing.includes(LEGACY_CC0_PATH),
    `LICENSING.md must name both preserved legacy paths at ${label}`
  );
  const assetsPolicy = await snapshotText(repositoryRoot, reference, 'ASSETS-LICENSE.md', label);
  assert(
    assetsPolicy.includes(ACTIVE_CREATIVE_POLICY),
    `ASSETS-LICENSE.md must state the active CC-BY-4.0 policy at ${label}`
  );
  const contributing = await snapshotText(repositoryRoot, reference, 'CONTRIBUTING.md', label);
  assert(
    contributing.includes(ACTIVE_SOFTWARE_POLICY) && contributing.includes(ACTIVE_CREATIVE_POLICY),
    `CONTRIBUTING.md must state both active contribution policies at ${label}`
  );
  const inventory = await snapshotText(repositoryRoot, reference, 'docs/legal/license-inventory.md', label);
  assert(
    inventory.includes('Apache-2.0') && inventory.includes('CC-BY-4.0'),
    `license inventory must retain both active policy identifiers at ${label}`
  );
  assert(
    inventory.includes(LEGACY_0BSD_PATH) && inventory.includes(LEGACY_CC0_PATH),
    `license inventory must name both preserved legacy paths at ${label}`
  );
}

function validateCutoverRecord(record) {
  assert(record && typeof record === 'object' && !Array.isArray(record), `${CUTOVER_RECORD} must contain an object`);
  const keys = Object.keys(record).sort();
  assert(
    JSON.stringify(keys) === JSON.stringify(['cutoverCommitSha', 'cutoverVersion', 'schemaVersion']),
    `${CUTOVER_RECORD} must contain only the documented fields`
  );
  assert(record.schemaVersion === 1, `${CUTOVER_RECORD} schemaVersion must be 1`);
  assert(record.cutoverVersion === '0.3.0', `${CUTOVER_RECORD} cutoverVersion must be 0.3.0`);
  assert(
    typeof record.cutoverCommitSha === 'string' && COMMIT_SHA_PATTERN.test(record.cutoverCommitSha),
    `${CUTOVER_RECORD} cutoverCommitSha must be a full lowercase commit SHA`
  );
  return record.cutoverCommitSha;
}

async function verifyCutoverState(repositoryRoot, workspacePackageJson, expectedHashes) {
  assert(
    await workspaceRegularFileExists(repositoryRoot, CUTOVER_RECORD),
    `${CUTOVER_RECORD} is required on or beyond the v0.3.0 line`
  );
  const head = await gitText(
    repositoryRoot,
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    'current HEAD commit is unavailable'
  );
  assert(COMMIT_SHA_PATTERN.test(head), 'current HEAD must resolve to a full commit SHA');
  const headPackage = await snapshotJson(repositoryRoot, head, 'package.json', 'current HEAD');
  assert(
    headPackage.version === workspacePackageJson.version,
    'working package version must match committed HEAD before cutover verification'
  );
  const trackedManifests = await snapshotPackageManifests(repositoryRoot, head, 'current HEAD');
  const relevantStatus = await gitText(
    repositoryRoot,
    [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--',
      ...new Set([...CUTOVER_FILES, CUTOVER_RECORD, ...trackedManifests])
    ],
    'could not inspect the cutover working tree'
  );
  assert(
    relevantStatus.length === 0,
    'cutover policy files and package manifests must match committed HEAD'
  );

  const record = validateCutoverRecord(
    await snapshotJson(repositoryRoot, head, CUTOVER_RECORD, 'current HEAD')
  );
  const resolvedCutover = await gitText(
    repositoryRoot,
    ['rev-parse', '--verify', `${record}^{commit}`],
    'the recorded cutover commit does not exist in Git history'
  );
  assert(resolvedCutover === record, 'the recorded cutover SHA must identify a commit directly');
  assert(record !== head, 'the attestation must be committed after the cutover commit');
  const ancestor = await runGit(
    repositoryRoot,
    ['merge-base', '--is-ancestor', record, head],
    { allowFailure: true }
  );
  assert(ancestor.ok, 'the recorded cutover commit must be an ancestor of current HEAD');
  assert(
    !(await snapshotPathExists(repositoryRoot, record, CUTOVER_RECORD)),
    'the machine-readable attestation must be added after the cutover commit'
  );

  const ancestry = (await gitText(
    repositoryRoot,
    ['rev-list', '--parents', '-n', '1', record],
    'could not inspect the cutover commit parent'
  )).split(/\s+/);
  assert(ancestry.length === 2, 'the cutover commit must have exactly one historical parent');
  await verifyHistoricalParent(repositoryRoot, ancestry[1], expectedHashes);

  await verifyCutoverSnapshot(repositoryRoot, record, expectedHashes, {
    boundary: true,
    label: 'the attested cutover commit'
  });
  await verifyCutoverSnapshot(repositoryRoot, head, expectedHashes, {
    boundary: false,
    label: 'current HEAD'
  });
}

export async function verifyLicensePolicy({
  repositoryRoot = defaultRepositoryRoot,
  expectedHashes = CANONICAL_LICENSE_HASHES
} = {}) {
  assert(repositoryRoot, 'repository root must be provided outside direct Node execution');
  repositoryRoot = resolve(repositoryRoot);
  validateHashConfiguration(expectedHashes);

  const packageJson = parseJson(
    await workspaceText(repositoryRoot, 'package.json'),
    'package.json'
  );
  const version = parseSemanticVersion(packageJson.version);
  const headPackage = await snapshotJson(repositoryRoot, 'HEAD', 'package.json', 'current HEAD');
  assert(
    headPackage.version === packageJson.version,
    'working package version must match committed HEAD'
  );

  if (isCutoverVersion(version)) {
    await verifyCutoverState(repositoryRoot, packageJson, expectedHashes);
    return {
      state: 'cutover',
      version: version.raw,
      message: `Verified Warpkeep v${version.raw} two-commit Apache-2.0/CC-BY-4.0 cutover state.`
    };
  }

  await verifyPreparationState(repositoryRoot, packageJson, expectedHashes);
  return {
    state: 'preparation',
    version: version.raw,
    message: `Verified Warpkeep v${version.raw} pre-v0.3.0 licensing transition state.`
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  verifyLicensePolicy()
    .then(({ message }) => console.log(message))
    .catch((error) => {
      console.error(error instanceof Error ? error.message : 'Could not verify license policy.');
      process.exitCode = 1;
    });
}
