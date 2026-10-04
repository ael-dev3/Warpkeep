import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import {
  inspectPublicMirror,
  PUBLIC_PAGES_MIRROR_MANIFEST_PATH,
  PUBLIC_PAGES_WORKFLOW_PATH,
  PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH,
  PUBLIC_PAGES_WORKFLOW_TEMPLATE_SHA256,
  PUBLIC_PAGES_WORKFLOW_TEMPLATE_BYTE_LENGTH,
  PUBLIC_PAGES_LEGAL_HEADERS_PATH,
  publicPagesLegalHeadersBytes,
  renderPublicPagesMirrorReadme,
  SOURCE_PUBLIC_DOCUMENTS,
  verifyPublicPagesMirrorPlan,
} from './verify-public-pages-mirror-plan.mjs';
import { allowedGeneratedPath } from './verify-public-pages-postflight.mjs';

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}$/u;
const IDENTITY = /^[A-Za-z0-9._+@-]{3,128}$/u;
const PUBLIC_REF = 'refs/heads/main';
const MAX_PLAN_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
// The public Pages tree now contains both the existing Alpha root and 0.4 PTR.
const MAX_TREE_BYTES = 320 * 1024 * 1024;
const MAX_FILES = 20_000;
const PRESERVED_ROOT_HOST_FILES = new Set(['.nojekyll', '404.html', 'CNAME']);
const HOSTING_FILES = new Set([
  'README.md', PUBLIC_PAGES_MIRROR_MANIFEST_PATH, 'ptr/404.html',
  PUBLIC_PAGES_LEGAL_HEADERS_PATH,
]);
const PRESERVED_ROOT_REQUIRED = ['.nojekyll', '404.html', 'CNAME', 'index.html'];
const REQUIRED_GENERATED = [
  '.well-known/farcaster.json',
  'apple-touch-icon-180-fe27e8dc1c97cc36.png',
  'favicon-64-7b82ca973fe757f5.png',
  'index.html',
  'legal/warpkeep-legal.css',
  'owner-canary/index.html',
  'privacy/index.html',
  'social-contract/index.html',
  'terms/index.html',
  'warpkeep-boot.css',
  'warpkeep-noscript.css',
];
const REQUIRED_PTR_GENERATED = REQUIRED_GENERATED.map(path => `ptr/${path}`);
const DOCUMENTS = new Set(SOURCE_PUBLIC_DOCUMENTS);

export class PublicPagesPublicationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PublicPagesPublicationError';
    this.code = code;
  }
}

function fail(code) { throw new PublicPagesPublicationError(code); }
function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function git(root, args, { input, indexFile, maximumBytes = 64 * 1024 } = {}) {
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE']) {
    delete env[name];
  }
  if (indexFile) env.GIT_INDEX_FILE = indexFile;
  const result = spawnSync('git', args, {
    cwd: root,
    env,
    input,
    encoding: null,
    shell: false,
    timeout: 60_000,
    maxBuffer: maximumBytes + 1024,
    windowsHide: true,
  });
  if (result.error || result.status !== 0 || result.signal || result.stdout.length > maximumBytes) {
    fail('PUBLIC_PAGES_PUBLICATION_GIT_FAILED');
  }
  return result.stdout;
}

function gitText(root, args, options) {
  return git(root, args, options).toString('utf8').trim();
}

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1024
    && !/[^\x20-\x7e]/u.test(path) && !path.includes('\\')
    && path.split('/').every(part => part !== '.' && part !== '..'
      && /^[A-Za-z0-9._-]+$/u.test(part));
}

function allowedPtrGeneratedPath(path) {
  if (!path.startsWith('ptr/')) return false;
  const nestedPath = path.slice('ptr/'.length);
  return !nestedPath.startsWith('ptr/') && allowedGeneratedPath(nestedPath);
}

function preservedRootEntries(entries) {
  return [...entries.values()].filter(entry => entry.origin === 'preserved-existing');
}

function preservedRootManifestSha256(entries) {
  return sha256(Buffer.from(JSON.stringify(preservedRootEntries(entries))));
}

function requireSigner(fingerprint, identity) {
  if (!FINGERPRINT.test(fingerprint ?? '') || !IDENTITY.test(identity ?? '')) {
    fail('PUBLIC_PAGES_PUBLICATION_SIGNER_INVALID');
  }
}

function verifySignedCommit(root, commit, fingerprint, identity) {
  if (!COMMIT.test(commit ?? '')) fail('PUBLIC_PAGES_PUBLICATION_COMMIT_INVALID');
  requireSigner(fingerprint, identity);
  try { git(root, ['verify-commit', '--raw', commit]); }
  catch { fail('PUBLIC_PAGES_PUBLICATION_SIGNATURE_INVALID'); }
  const lines = gitText(root, ['log', '-1', '--format=%G?%n%GK%n%GS', commit])
    .split(/\r?\n/u);
  if (lines.length !== 3 || lines[0] !== 'G'
    || lines[1] !== fingerprint || lines[2] !== identity) {
    fail('PUBLIC_PAGES_PUBLICATION_SIGNATURE_INVALID');
  }
}

function parseReviewedPlan(bytes, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > MAX_PLAN_BYTES
    || !DIGEST.test(expectedSha256 ?? '') || sha256(bytes) !== expectedSha256) {
    fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
  }
  let plan;
  try { plan = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)); }
  catch { fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID'); }
  if (!plan || Array.isArray(plan) || typeof plan !== 'object'
    || !Buffer.from(`${JSON.stringify(plan)}\n`).equals(bytes)
    || plan.schemaVersion !== 2 || plan.profile !== 'warpkeep-public-pages-ptr-mirror-plan-v1'
    || plan.publicationPath !== '/ptr/'
    || (plan.deploymentMode !== undefined && plan.deploymentMode !== 'workflow')
    || !COMMIT.test(plan.sourceCommit ?? '') || !COMMIT.test(plan.sourceTree ?? '')
    || !COMMIT.test(plan.publicParentCommit ?? '') || !COMMIT.test(plan.publicParentTree ?? '')
    || !DIGEST.test(plan.payloadManifestSha256 ?? '')
    || !Number.isSafeInteger(plan.preservedRootEntryCount) || plan.preservedRootEntryCount < 4
    || !DIGEST.test(plan.preservedRootManifestSha256 ?? '')
    || !Array.isArray(plan.targetEntries) || !Array.isArray(plan.obsoleteGeneratedPaths)
    || plan.targetEntries.length < REQUIRED_PTR_GENERATED.length + PRESERVED_ROOT_REQUIRED.length
      + HOSTING_FILES.size + DOCUMENTS.size + 1
    || plan.targetEntries.length > MAX_FILES + REQUIRED_PTR_GENERATED.length
      + PRESERVED_ROOT_REQUIRED.length + HOSTING_FILES.size + DOCUMENTS.size + 2
    || plan.targetFileCount !== plan.targetEntries.length) {
    fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
  }
  const entries = new Map();
  const folded = new Set();
  let previous;
  for (const entry of plan.targetEntries) {
    if (!entry || !safePath(entry.path) || folded.has(entry.path.toLowerCase())
      || (previous !== undefined && Buffer.compare(Buffer.from(previous), Buffer.from(entry.path)) >= 0)
      || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0
      || entry.byteLength > MAX_FILE_BYTES || !DIGEST.test(entry.sha256 ?? '')
      || entry.origin !== (plan.deploymentMode === 'workflow' && entry.path === PUBLIC_PAGES_WORKFLOW_PATH
        ? 'reviewed-control' : HOSTING_FILES.has(entry.path) ? 'hosting'
        : DOCUMENTS.has(entry.path) ? 'reviewed-source'
          : allowedPtrGeneratedPath(entry.path) ? 'generated'
            : (PRESERVED_ROOT_HOST_FILES.has(entry.path) || allowedGeneratedPath(entry.path))
              && !entry.path.startsWith('ptr/') ? 'preserved-existing' : undefined)) {
      fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    }
    entries.set(entry.path, entry);
    folded.add(entry.path.toLowerCase());
    previous = entry.path;
  }
  if ([...HOSTING_FILES, ...DOCUMENTS, ...REQUIRED_PTR_GENERATED,
    ...PRESERVED_ROOT_REQUIRED, 'ptr/404.html'].some(path => !entries.has(path))) {
    fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
  }
  const control = entries.get(PUBLIC_PAGES_WORKFLOW_PATH);
  if (plan.deploymentMode === 'workflow') {
    if (!control || control.byteLength !== PUBLIC_PAGES_WORKFLOW_TEMPLATE_BYTE_LENGTH
      || control.sha256 !== PUBLIC_PAGES_WORKFLOW_TEMPLATE_SHA256) {
      fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    }
  } else if (control) fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
  const preserved = preservedRootEntries(entries);
  if (preserved.length !== plan.preservedRootEntryCount
    || preservedRootManifestSha256(entries) !== plan.preservedRootManifestSha256
    || preserved.some(entry => entry.path.startsWith('ptr/'))
    || entries.get('.nojekyll').byteLength !== 0
    || entries.get('.nojekyll').sha256 !== sha256(Buffer.alloc(0))
    || entries.get('404.html').sha256 !== entries.get('index.html').sha256
    || entries.get('404.html').byteLength !== entries.get('index.html').byteLength
    || ![sha256(Buffer.from('warpkeep.com\n')), sha256(Buffer.from('warpkeep.com\r\n'))]
      .includes(entries.get('CNAME').sha256)) {
    fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
  }
  const obsolete = new Set();
  for (const path of plan.obsoleteGeneratedPaths) {
    if (!safePath(path) || !path.startsWith('ptr/') || !allowedPtrGeneratedPath(path)
      || folded.has(path.toLowerCase()) || obsolete.has(path.toLowerCase())) {
      fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
    }
    obsolete.add(path.toLowerCase());
  }
  return { plan, entries };
}

function inspectCommit(root, commit, parent, tree, fingerprint, identity) {
  verifySignedCommit(root, commit, fingerprint, identity);
  if (gitText(root, ['rev-parse', `${commit}^{tree}`]) !== tree
    || gitText(root, ['rev-list', '--parents', '-n', '1', commit]) !== `${commit} ${parent}`) {
    fail('PUBLIC_PAGES_PUBLICATION_COMMIT_INVALID');
  }
}

function readTargetFile(entry, sourceRoot, publicRoot, plan, manifestBytes, manifest) {
  const { path } = entry;
  if (entry.origin === 'preserved-existing') {
    try {
      return git(publicRoot, ['show', `${plan.publicParentCommit}:${path}`], {
        maximumBytes: MAX_FILE_BYTES,
      });
    } catch { fail('PUBLIC_PAGES_PUBLICATION_PARENT_CHANGED'); }
  }
  if (path === 'README.md') return renderPublicPagesMirrorReadme(manifest, plan.payloadManifestSha256);
  if (path === PUBLIC_PAGES_MIRROR_MANIFEST_PATH) return Buffer.from(manifestBytes);
  if (path === PUBLIC_PAGES_LEGAL_HEADERS_PATH) return publicPagesLegalHeadersBytes();
  const sourcePath = path === 'ptr/404.html' ? 'dist/index.html'
    : path === PUBLIC_PAGES_WORKFLOW_PATH && plan.deploymentMode === 'workflow'
      ? PUBLIC_PAGES_WORKFLOW_TEMPLATE_PATH
    : DOCUMENTS.has(path) ? path
      : entry.origin === 'generated' ? `dist/${path.slice('ptr/'.length)}` : undefined;
  if (!sourcePath) fail('PUBLIC_PAGES_PUBLICATION_PLAN_INVALID');
  const file = join(sourceRoot, sourcePath);
  try {
    return readLocalBindingBoundedFile(file, { maximumBytes: MAX_FILE_BYTES }).body;
  } catch { fail('PUBLIC_PAGES_PUBLICATION_SOURCE_CHANGED'); }
}

function verifyPlannedTree(root, tree, entries, plan) {
  if (!COMMIT.test(tree ?? '')) fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
  const raw = git(root, ['ls-tree', '-r', '-z', '--full-tree', tree], {
    maximumBytes: 4 * 1024 * 1024,
  });
  if (raw.length < 1 || raw.at(-1) !== 0) fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
  const seen = new Set();
  let total = 0;
  let manifestBytes;
  let ptrIndexBytes;
  let ptr404Bytes;
  for (const record of raw.toString('utf8').slice(0, -1).split('\0')) {
    const match = /^(100644) blob ([a-f0-9]{40})\t(.+)$/u.exec(record);
    if (!match || !entries.has(match[3]) || seen.has(match[3])) {
      fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
    }
    const entry = entries.get(match[3]);
    const bytes = git(root, ['cat-file', 'blob', match[2]], {
      maximumBytes: entry.byteLength,
    });
    total += bytes.length;
    if (total > MAX_TREE_BYTES || bytes.length !== entry.byteLength
      || sha256(bytes) !== entry.sha256) fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
    if (entry.path === PUBLIC_PAGES_MIRROR_MANIFEST_PATH) manifestBytes = Buffer.from(bytes);
    if (entry.path === 'ptr/index.html') ptrIndexBytes = Buffer.from(bytes);
    if (entry.path === 'ptr/404.html') ptr404Bytes = Buffer.from(bytes);
    seen.add(entry.path);
  }
  if (seen.size !== entries.size || !manifestBytes || !ptrIndexBytes || !ptr404Bytes
    || sha256(manifestBytes) !== plan.payloadManifestSha256
    || sha256(ptr404Bytes) !== sha256(ptrIndexBytes)
    || entries.get('ptr/404.html').sha256 !== sha256(ptrIndexBytes)
    || entries.get('ptr/404.html').byteLength !== entries.get('ptr/index.html').byteLength
    || entries.get('404.html').sha256 !== entries.get('index.html').sha256
    || entries.get('.nojekyll').sha256 !== sha256(Buffer.alloc(0))
    || ![sha256(Buffer.from('warpkeep.com\n')), sha256(Buffer.from('warpkeep.com\r\n'))]
      .includes(entries.get('CNAME').sha256)
    || preservedRootEntries(entries).length !== plan.preservedRootEntryCount
    || preservedRootManifestSha256(entries) !== plan.preservedRootManifestSha256) {
    fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
  }
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString('utf8')); }
  catch { fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID'); }
  if (!Buffer.from(`${JSON.stringify(manifest)}\n`).equals(manifestBytes)
    || manifest.schemaVersion !== 1
    || manifest.profile !== 'warpkeep-public-pages-payload-v1'
    || manifest.sourceCommit !== plan.sourceCommit
    || manifest.sourceTree !== plan.sourceTree
    || manifest.canonicalOrigin !== 'https://warpkeep.com'
    || manifest.publicationPath !== '/ptr/'
    || !Array.isArray(manifest.files)
    || manifest.fileCount !== manifest.files.length
    || manifest.rootHtmlSha256 !== sha256(ptrIndexBytes)
    || manifest.totalByteLength !== manifest.files.reduce((total, file) => total + file.byteLength, 0)
    || manifest.contentManifestSha256 !== sha256(Buffer.from(JSON.stringify(manifest.files)))
    || sha256(renderPublicPagesMirrorReadme(manifest, plan.payloadManifestSha256))
      !== entries.get('README.md').sha256) {
    fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
  }
  const generated = [...entries.values()].filter(entry => entry.origin === 'generated');
  if (manifest.files.length !== generated.length
    || generated.some((entry, index) => (
      `ptr/${manifest.files[index]?.path}` !== entry.path
      || manifest.files[index]?.byteLength !== entry.byteLength
      || manifest.files[index]?.sha256 !== entry.sha256
    ))) fail('PUBLIC_PAGES_PUBLICATION_TREE_INVALID');
  return total;
}

function createSignedCommit(root, tree, parent, message, fingerprint, identity) {
  const commit = gitText(root, ['commit-tree', '-S', tree, '-p', parent, '-m', message]);
  if (!COMMIT.test(commit)) fail('PUBLIC_PAGES_PUBLICATION_COMMIT_INVALID');
  inspectCommit(root, commit, parent, tree, fingerprint, identity);
  return commit;
}

function defaultReadRemoteHead(root) {
  const line = gitText(root, ['ls-remote', '--exit-code', 'origin', PUBLIC_REF]);
  const match = /^([a-f0-9]{40})\trefs\/heads\/main$/u.exec(line);
  if (!match) fail('PUBLIC_PAGES_PUBLICATION_REMOTE_INVALID');
  return match[1];
}

function defaultPushCommit(root, commit) {
  git(root, ['push', '--porcelain', 'origin', `${commit}:${PUBLIC_REF}`], {
    maximumBytes: 128 * 1024,
  });
}

function currentHead(root) { return gitText(root, ['rev-parse', 'HEAD']); }

function synchronizeLocal(root, oldHead, newHead) {
  try {
    if (currentHead(root) === newHead) {
      inspectPublicMirror(root, newHead);
      return;
    }
    inspectPublicMirror(root, oldHead);
    // Fast-forward merge refuses tracked edits and untracked collisions instead
    // of overwriting a change made after the clean preflight.
    git(root, ['merge', '--ff-only', '--no-stat', newHead]);
    inspectPublicMirror(root, newHead);
  } catch {
    fail('PUBLIC_PAGES_PUBLICATION_LOCAL_SYNC_FAILED');
  }
}

function publishPreparedCommit({
  publicRoot, parent, candidate, targetTree, fingerprint, identity,
  readRemoteHead = defaultReadRemoteHead,
  pushCommit = defaultPushCommit,
}) {
  const root = realpathSync(resolve(publicRoot));
  if (typeof readRemoteHead !== 'function' || typeof pushCommit !== 'function') {
    fail('PUBLIC_PAGES_PUBLICATION_ARGUMENT_INVALID');
  }
  const local = currentHead(root);
  if (local !== parent && local !== candidate) {
    fail('PUBLIC_PAGES_PUBLICATION_LOCAL_CHANGED');
  }
  inspectPublicMirror(root, local);
  inspectCommit(root, candidate, parent, targetTree, fingerprint, identity);
  let remote = readRemoteHead(root);
  if (remote !== parent && remote !== candidate) {
    fail('PUBLIC_PAGES_PUBLICATION_REMOTE_CHANGED');
  }
  if (remote === parent) {
    try { pushCommit(root, candidate); }
    catch {
      // A transport error can occur after the server has accepted the push.
      if (readRemoteHead(root) !== candidate) fail('PUBLIC_PAGES_PUBLICATION_PUSH_FAILED');
    }
    remote = readRemoteHead(root);
    if (remote !== candidate) fail('PUBLIC_PAGES_PUBLICATION_REMOTE_CHANGED');
  }
  synchronizeLocal(root, parent, candidate);
  if (readRemoteHead(root) !== candidate) fail('PUBLIC_PAGES_PUBLICATION_REMOTE_CHANGED');
  return Object.freeze({ publicCommit: candidate, publicTree: targetTree,
    localHead: currentHead(root), remoteHead: candidate });
}

/** Build a signed publication commit without changing the public checkout or remote. */
export function preparePublicPagesPublication({
  sourceRoot, publicRoot, reviewedPlanBytes, expectedReviewedPlanSha256,
  expectedSignerFingerprint, expectedSignerIdentity,
}) {
  const { plan, entries } = parseReviewedPlan(reviewedPlanBytes, expectedReviewedPlanSha256);
  const source = realpathSync(resolve(sourceRoot));
  const publicPath = realpathSync(resolve(publicRoot));
  requireSigner(expectedSignerFingerprint, expectedSignerIdentity);
  const fresh = verifyPublicPagesMirrorPlan({
    sourceRoot: source, expectedSourceCommit: plan.sourceCommit,
    publicRoot: publicPath, expectedPublicHead: plan.publicParentCommit,
    ...(plan.deploymentMode === 'workflow' ? { deploymentMode: 'workflow' } : {}),
  });
  if (!Buffer.from(`${JSON.stringify(fresh)}\n`).equals(reviewedPlanBytes)) {
    fail('PUBLIC_PAGES_PUBLICATION_PLAN_DRIFT');
  }
  verifySignedCommit(source, plan.sourceCommit,
    expectedSignerFingerprint, expectedSignerIdentity);
  verifySignedCommit(publicPath, plan.publicParentCommit,
    expectedSignerFingerprint, expectedSignerIdentity);
  const manifestPath = join(source, 'artifacts/delivery/0.4.0/public-pages-payload-v1.json');
  let manifestBytes;
  try {
    manifestBytes = readLocalBindingBoundedFile(manifestPath, {
      maximumBytes: 4 * 1024 * 1024,
    }).body;
  } catch { fail('PUBLIC_PAGES_PUBLICATION_SOURCE_CHANGED'); }
  if (sha256(manifestBytes) !== plan.payloadManifestSha256) {
    fail('PUBLIC_PAGES_PUBLICATION_SOURCE_CHANGED');
  }
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const temporary = mkdtempSync(join(tmpdir(), 'warpkeep-public-pages-index-'));
  const indexFile = join(temporary, 'index');
  try {
    git(publicPath, ['read-tree', '--empty'], { indexFile });
    for (const entry of entries.values()) {
      const bytes = readTargetFile(entry, source, publicPath, plan, manifestBytes, manifest);
      try {
        if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
          fail('PUBLIC_PAGES_PUBLICATION_SOURCE_CHANGED');
        }
        const blob = gitText(publicPath, ['hash-object', '-w', '--stdin'], {
          input: bytes, indexFile,
        });
        if (!COMMIT.test(blob)) fail('PUBLIC_PAGES_PUBLICATION_GIT_FAILED');
        git(publicPath, ['update-index', '--add', '--cacheinfo',
          `100644,${blob},${entry.path}`], { indexFile });
      } finally { bytes.fill(0); }
    }
    const tree = gitText(publicPath, ['write-tree'], { indexFile });
    verifyPlannedTree(publicPath, tree, entries, plan);
    if (!Buffer.from(`${JSON.stringify(verifyPublicPagesMirrorPlan({
      sourceRoot: source, expectedSourceCommit: plan.sourceCommit,
      publicRoot: publicPath, expectedPublicHead: plan.publicParentCommit,
      ...(plan.deploymentMode === 'workflow' ? { deploymentMode: 'workflow' } : {}),
    }))}\n`).equals(reviewedPlanBytes)) {
      fail('PUBLIC_PAGES_PUBLICATION_PLAN_DRIFT');
    }
    const commit = createSignedCommit(publicPath, tree, plan.publicParentCommit,
      'Publish Warpkeep 0.4 owner PTR', expectedSignerFingerprint, expectedSignerIdentity);
    return Object.freeze({ publicCommit: commit, publicTree: tree,
      publicParentCommit: plan.publicParentCommit,
      reviewedPlanSha256: expectedReviewedPlanSha256 });
  } finally {
    manifestBytes.fill(0);
    // The temporary directory contains only Git's known index and lock files.
    // Non-recursive cleanup will never remove an unexpected child or its target.
    for (const path of [indexFile, `${indexFile}.lock`]) {
      if (existsSync(path)) unlinkSync(path);
    }
    rmdirSync(temporary);
  }
}

/** Non-force push with exact remote readback; resumable after push/local-sync interruption. */
export function publishPublicPagesPublication({
  publicRoot, reviewedPlanBytes, expectedReviewedPlanSha256, expectedPublicCommit,
  expectedSignerFingerprint, expectedSignerIdentity, readRemoteHead, pushCommit,
}) {
  const { plan, entries } = parseReviewedPlan(reviewedPlanBytes, expectedReviewedPlanSha256);
  const root = realpathSync(resolve(publicRoot));
  if (!COMMIT.test(expectedPublicCommit ?? '')) fail('PUBLIC_PAGES_PUBLICATION_COMMIT_INVALID');
  verifySignedCommit(root, plan.publicParentCommit,
    expectedSignerFingerprint, expectedSignerIdentity);
  inspectCommit(root, expectedPublicCommit, plan.publicParentCommit,
    gitText(root, ['rev-parse', `${expectedPublicCommit}^{tree}`]),
    expectedSignerFingerprint, expectedSignerIdentity);
  const tree = gitText(root, ['rev-parse', `${expectedPublicCommit}^{tree}`]);
  verifyPlannedTree(root, tree, entries, plan);
  if (gitText(root, ['rev-parse', `${plan.publicParentCommit}^{tree}`])
    !== plan.publicParentTree) fail('PUBLIC_PAGES_PUBLICATION_PARENT_CHANGED');
  return publishPreparedCommit({ publicRoot: root, parent: plan.publicParentCommit,
    candidate: expectedPublicCommit, targetTree: tree,
    fingerprint: expectedSignerFingerprint, identity: expectedSignerIdentity,
    readRemoteHead, pushCommit });
}

/** Prepare a signed inverse of the exact published commit, preserving history. */
export function preparePublicPagesRollback({
  publicRoot, reviewedPlanBytes, expectedReviewedPlanSha256, expectedPublishedCommit,
  expectedSignerFingerprint, expectedSignerIdentity,
}) {
  const { plan, entries } = parseReviewedPlan(reviewedPlanBytes, expectedReviewedPlanSha256);
  const root = realpathSync(resolve(publicRoot));
  if (!COMMIT.test(expectedPublishedCommit ?? '')) fail('PUBLIC_PAGES_PUBLICATION_COMMIT_INVALID');
  inspectPublicMirror(root, expectedPublishedCommit);
  verifySignedCommit(root, plan.publicParentCommit,
    expectedSignerFingerprint, expectedSignerIdentity);
  const publishedTree = gitText(root, ['rev-parse', `${expectedPublishedCommit}^{tree}`]);
  inspectCommit(root, expectedPublishedCommit, plan.publicParentCommit, publishedTree,
    expectedSignerFingerprint, expectedSignerIdentity);
  verifyPlannedTree(root, publishedTree, entries, plan);
  if (gitText(root, ['rev-parse', `${plan.publicParentCommit}^{tree}`])
    !== plan.publicParentTree) fail('PUBLIC_PAGES_PUBLICATION_PARENT_CHANGED');
  const rollbackCommit = createSignedCommit(root, plan.publicParentTree,
    expectedPublishedCommit, 'Restore prior Warpkeep public Pages tree',
    expectedSignerFingerprint, expectedSignerIdentity);
  return Object.freeze({ rollbackCommit, rollbackTree: plan.publicParentTree,
    publishedCommit: expectedPublishedCommit,
    reviewedPlanSha256: expectedReviewedPlanSha256 });
}

/** Publish a prepared inverse commit through the same non-force, resumable path. */
export function publishPublicPagesRollback({
  publicRoot, reviewedPlanBytes, expectedReviewedPlanSha256, expectedPublishedCommit,
  expectedRollbackCommit, expectedSignerFingerprint, expectedSignerIdentity,
  readRemoteHead, pushCommit,
}) {
  const { plan, entries } = parseReviewedPlan(reviewedPlanBytes, expectedReviewedPlanSha256);
  const root = realpathSync(resolve(publicRoot));
  if (!COMMIT.test(expectedPublishedCommit ?? '') || !COMMIT.test(expectedRollbackCommit ?? '')) {
    fail('PUBLIC_PAGES_PUBLICATION_COMMIT_INVALID');
  }
  verifySignedCommit(root, plan.publicParentCommit,
    expectedSignerFingerprint, expectedSignerIdentity);
  const publishedTree = gitText(root, ['rev-parse', `${expectedPublishedCommit}^{tree}`]);
  inspectCommit(root, expectedPublishedCommit, plan.publicParentCommit, publishedTree,
    expectedSignerFingerprint, expectedSignerIdentity);
  verifyPlannedTree(root, publishedTree, entries, plan);
  if (gitText(root, ['rev-parse', `${plan.publicParentCommit}^{tree}`])
    !== plan.publicParentTree) fail('PUBLIC_PAGES_PUBLICATION_PARENT_CHANGED');
  inspectCommit(root, expectedRollbackCommit, expectedPublishedCommit, plan.publicParentTree,
    expectedSignerFingerprint, expectedSignerIdentity);
  return publishPreparedCommit({ publicRoot: root, parent: expectedPublishedCommit,
    candidate: expectedRollbackCommit, targetTree: plan.publicParentTree,
    fingerprint: expectedSignerFingerprint, identity: expectedSignerIdentity,
    readRemoteHead, pushCommit });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const mode = process.argv[2];
    const pairs = process.argv.slice(3);
    if (!['prepare', 'publish', 'prepare-rollback', 'publish-rollback'].includes(mode)
      || pairs.length % 2 !== 0) fail('PUBLIC_PAGES_PUBLICATION_ARGUMENT_INVALID');
    const args = new Map();
    for (let i = 0; i < pairs.length; i += 2) {
      if (!/^--[a-z0-9-]+$/u.test(pairs[i]) || args.has(pairs[i])) {
        fail('PUBLIC_PAGES_PUBLICATION_ARGUMENT_INVALID');
      }
      args.set(pairs[i], pairs[i + 1]);
    }
    const required = mode === 'prepare'
      ? ['--source-root', '--public-root', '--plan', '--plan-sha256', '--signer-fingerprint', '--signer-identity']
      : mode === 'publish'
        ? ['--public-root', '--plan', '--plan-sha256', '--commit', '--signer-fingerprint', '--signer-identity']
        : mode === 'prepare-rollback'
          ? ['--public-root', '--plan', '--plan-sha256', '--published-commit', '--signer-fingerprint', '--signer-identity']
          : ['--public-root', '--plan', '--plan-sha256', '--published-commit', '--commit', '--signer-fingerprint', '--signer-identity'];
    if (args.size !== required.length || required.some(name => !args.has(name))) {
      fail('PUBLIC_PAGES_PUBLICATION_ARGUMENT_INVALID');
    }
    const planFile = readLocalBindingBoundedFile(args.get('--plan'), {
      maximumBytes: MAX_PLAN_BYTES,
    });
    try {
      const common = {
        publicRoot: args.get('--public-root'),
        reviewedPlanBytes: planFile.body,
        expectedReviewedPlanSha256: args.get('--plan-sha256'),
        expectedSignerFingerprint: args.get('--signer-fingerprint'),
        expectedSignerIdentity: args.get('--signer-identity'),
      };
      const result = mode === 'prepare'
        ? preparePublicPagesPublication({ ...common, sourceRoot: args.get('--source-root') })
        : mode === 'publish'
          ? publishPublicPagesPublication({ ...common, expectedPublicCommit: args.get('--commit') })
          : mode === 'prepare-rollback'
            ? preparePublicPagesRollback({ ...common,
              expectedPublishedCommit: args.get('--published-commit') })
            : publishPublicPagesRollback({ ...common,
              expectedPublishedCommit: args.get('--published-commit'),
              expectedRollbackCommit: args.get('--commit') });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } finally { planFile.body.fill(0); }
  } catch (error) {
    process.stderr.write(`${error instanceof PublicPagesPublicationError
      ? error.code : 'PUBLIC_PAGES_PUBLICATION_INVALID'}\n`);
    process.exitCode = 1;
  }
}
