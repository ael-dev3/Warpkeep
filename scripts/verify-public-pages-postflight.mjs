import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
import {
  inspectPublicMirror,
  PUBLIC_PAGES_MIRROR_MANIFEST_PATH,
  renderPublicPagesMirrorReadme,
  SOURCE_PUBLIC_DOCUMENTS,
} from './verify-public-pages-mirror-plan.mjs';
import { rootAssetUrls } from './verify-alpha-production.mjs';

const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const SIGNER_FINGERPRINT = /^SHA256:[A-Za-z0-9+/]{43}$/u;
const LIVE_ORIGIN = 'https://warpkeep.com';
const PUBLIC_REPOSITORY = 'ael-dev3/Warpkeep-Live';
const PAGES_WORKFLOW_PATH = 'dynamic/pages/pages-build-deployment';
const PRESERVED_ROOT_HOST_PATHS = Object.freeze(['.nojekyll', '404.html', 'CNAME']);
const HOSTING_PATHS = Object.freeze(['README.md', PUBLIC_PAGES_MIRROR_MANIFEST_PATH, 'ptr/404.html']);
const PRESERVED_ROOT_REQUIRED = Object.freeze(['.nojekyll', '404.html', 'CNAME', 'index.html']);
const REQUIRED_GENERATED_FILES = Object.freeze([
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
]);
const GENERATED_ROOT_FILES = new Set(REQUIRED_GENERATED_FILES.filter(path => !path.includes('/')));
const MAX_PLAN_BYTES = 8 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 150 * 1024 * 1024;
// The public Pages tree now contains both the existing Alpha root and 0.4 PTR.
const MAX_PUBLIC_TREE_BYTES = 320 * 1024 * 1024;
const MAX_FILES = 20_000;
const MAX_HTTP_MS = 180_000;
const MAX_REQUEST_MS = 10_000;

export class PublicPagesPostflightError extends Error {
  constructor(code) {
    super(code);
    this.name = 'PublicPagesPostflightError';
    this.code = code;
  }
}

function fail(code) {
  throw new PublicPagesPostflightError(code);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function git(root, args, maximumBytes = 64 * 1024) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: null,
    shell: false,
    windowsHide: true,
    timeout: 30_000,
    maxBuffer: maximumBytes + 1024,
  });
  if (result.error || result.status !== 0 || result.signal || result.stdout.length > maximumBytes) {
    fail('PUBLIC_PAGES_POSTFLIGHT_GIT_INVALID');
  }
  return result.stdout;
}

function safePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && path.length <= 1024
    && !/[^\x20-\x7e]/u.test(path)
    && !path.includes('\\')
    && path.split('/').every(part => part !== '.' && part !== '..'
      && /^[A-Za-z0-9._-]+$/u.test(part));
}

export function allowedGeneratedPath(path) {
  if (!safePath(path)) return false;
  if (!path.includes('/')) return GENERATED_ROOT_FILES.has(path);
  if (REQUIRED_GENERATED_FILES.includes(path)) return true;
  const parts = path.split('/');
  const name = parts.at(-1);
  if (parts[0] === 'assets') return /\.(?:css|js)$/u.test(name);
  if (parts[0] === 'audio') return /\.mp3$/u.test(name)
    || path === 'audio/warpkeep-verdant-menu-theme.m4a'
    || path === 'audio/warpkeep-genesis-002-theme.m4a';
  if (parts[0] === 'images') return /\.(?:png|webp)$/u.test(name);
  if (parts[0] === 'models') return /\.glb$/u.test(name)
    || path === 'models/greater-realm/biome-trees/v3/manifest.json';
  if (parts[0] === 'video') return /\.mp4$/u.test(name);
  return false;
}

function allowedPtrGeneratedPath(path) {
  if (typeof path !== 'string' || !path.startsWith('ptr/')) return false;
  const nestedPath = path.slice('ptr/'.length);
  return !nestedPath.startsWith('ptr/') && allowedGeneratedPath(nestedPath);
}

function isPreservedRootPath(path) {
  return !path.startsWith('ptr/')
    && (PRESERVED_ROOT_HOST_PATHS.includes(path) || allowedGeneratedPath(path));
}

function preservedRootEntries(entries) {
  return [...entries.values()].filter(entry => entry.origin === 'preserved-existing');
}

function preservedRootManifestSha256(entries) {
  return sha256(Buffer.from(JSON.stringify(preservedRootEntries(entries))));
}

function githubJson(path) {
  const result = spawnSync('gh', ['api', '--hostname', 'github.com', path], {
    encoding: 'utf8', shell: false, windowsHide: true,
    timeout: 15_000, maxBuffer: 512 * 1024,
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail('PUBLIC_PAGES_POSTFLIGHT_REMOTE_UNAVAILABLE');
  }
  try { return JSON.parse(result.stdout); }
  catch { fail('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID'); }
}

/** Read-only default. The CLI never accepts a replacement repository or host. */
export function readPublicPagesRemoteState(expectedPublicCommit) {
  if (!COMMIT.test(expectedPublicCommit ?? '')) fail('PUBLIC_PAGES_POSTFLIGHT_COMMIT_INVALID');
  const prefix = `repos/${PUBLIC_REPOSITORY}`;
  return Object.freeze({
    main: githubJson(`${prefix}/git/ref/heads/main`),
    pages: githubJson(`${prefix}/pages`),
    latestBuild: githubJson(`${prefix}/pages/builds/latest`),
    runs: githubJson(`${prefix}/actions/runs?head_sha=${expectedPublicCommit}&per_page=100`),
  });
}

function verifyRemotePagesState(state, expectedPublicCommit) {
  if (
    state?.main?.ref !== 'refs/heads/main'
    || state.main.object?.type !== 'commit'
    || state.main.object.sha !== expectedPublicCommit
    || state.pages?.build_type !== 'legacy'
    || state.pages.source?.branch !== 'main'
    || state.pages.source.path !== '/'
    || state.pages.html_url !== `${LIVE_ORIGIN}/`
    || state.pages.status !== 'built'
    || state.latestBuild?.commit !== expectedPublicCommit
    || state.latestBuild.status !== 'built'
    || state.latestBuild.error?.message !== null
    || !Array.isArray(state.runs?.workflow_runs)
    || !Number.isSafeInteger(state.runs.total_count)
    || state.runs.total_count < 1
    || state.runs.total_count > 100
    || state.runs.workflow_runs.length < 1
    || state.runs.workflow_runs.length > 100
  ) fail('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
  const pagesRuns = state.runs.workflow_runs.filter(run => run?.path === PAGES_WORKFLOW_PATH);
  if (pagesRuns.length < 1 || pagesRuns.some(run => (
    !Number.isSafeInteger(run.id) || run.id <= 0
    || run.name !== 'pages build and deployment'
    || run.event !== 'dynamic'
    || run.head_branch !== 'main'
    || run.head_sha !== expectedPublicCommit
    || run.repository?.full_name !== PUBLIC_REPOSITORY
    || run.head_repository?.full_name !== PUBLIC_REPOSITORY
  ))) fail('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
  const latest = pagesRuns.reduce((current, run) => run.id > current.id ? run : current);
  if (latest.status !== 'completed' || latest.conclusion !== 'success') {
    fail('PUBLIC_PAGES_POSTFLIGHT_REMOTE_INVALID');
  }
  return latest.id;
}

function canonicalJson(bytes, maximumBytes, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > maximumBytes) fail(code);
  let value;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch { fail(code); }
  if (
    !value || Array.isArray(value) || typeof value !== 'object'
    || !Buffer.from(`${JSON.stringify(value)}\n`, 'utf8').equals(bytes)
  ) fail(code);
  return value;
}

function validatePlan(plan, reviewedPlanBytes, expectedReviewedPlanSha256) {
  if (
    !DIGEST.test(expectedReviewedPlanSha256 ?? '')
    || sha256(reviewedPlanBytes) !== expectedReviewedPlanSha256
    || plan.schemaVersion !== 2
    || plan.profile !== 'warpkeep-public-pages-ptr-mirror-plan-v1'
    || plan.publicationPath !== '/ptr/'
    || !COMMIT.test(plan.sourceCommit ?? '')
    || !COMMIT.test(plan.sourceTree ?? '')
    || !COMMIT.test(plan.publicParentCommit ?? '')
    || !COMMIT.test(plan.publicParentTree ?? '')
    || !DIGEST.test(plan.payloadManifestSha256 ?? '')
    || !Number.isSafeInteger(plan.preservedRootEntryCount) || plan.preservedRootEntryCount < 4
    || !DIGEST.test(plan.preservedRootManifestSha256 ?? '')
    || !Array.isArray(plan.targetEntries)
    || plan.targetEntries.length < HOSTING_PATHS.length + SOURCE_PUBLIC_DOCUMENTS.length
      + REQUIRED_GENERATED_FILES.length + PRESERVED_ROOT_REQUIRED.length + 1
    || plan.targetEntries.length > MAX_FILES + HOSTING_PATHS.length
      + SOURCE_PUBLIC_DOCUMENTS.length + REQUIRED_GENERATED_FILES.length
      + PRESERVED_ROOT_REQUIRED.length + 1
    || plan.targetFileCount !== plan.targetEntries.length
    || !Array.isArray(plan.obsoleteGeneratedPaths)
  ) fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  const seen = new Set();
  let previous;
  for (const entry of plan.targetEntries) {
    if (
      !entry || !safePath(entry.path)
      || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0
      || entry.byteLength > MAX_FILE_BYTES
      || !DIGEST.test(entry.sha256 ?? '')
      || !['generated', 'hosting', 'reviewed-source', 'preserved-existing'].includes(entry.origin)
      || entry.origin !== (HOSTING_PATHS.includes(entry.path) ? 'hosting'
        : SOURCE_PUBLIC_DOCUMENTS.includes(entry.path) ? 'reviewed-source'
          : allowedPtrGeneratedPath(entry.path) ? 'generated'
            : isPreservedRootPath(entry.path) ? 'preserved-existing' : undefined)
      || seen.has(entry.path.toLowerCase())
      || (previous !== undefined && Buffer.compare(Buffer.from(previous), Buffer.from(entry.path)) >= 0)
    ) fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    seen.add(entry.path.toLowerCase());
    previous = entry.path;
  }
  const obsolete = new Set();
  for (const path of plan.obsoleteGeneratedPaths) {
    if (!safePath(path) || !allowedPtrGeneratedPath(path)
      || obsolete.has(path) || seen.has(path.toLowerCase())) {
      fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    }
    obsolete.add(path);
  }
  const entries = new Map(plan.targetEntries.map(entry => [entry.path, entry]));
  const preserved = preservedRootEntries(entries);
  if (preserved.length !== plan.preservedRootEntryCount
    || preservedRootManifestSha256(entries) !== plan.preservedRootManifestSha256
    || [...PRESERVED_ROOT_REQUIRED].some(path => entries.get(path)?.origin !== 'preserved-existing')
    || entries.get('.nojekyll').byteLength !== 0
    || entries.get('.nojekyll').sha256 !== sha256(Buffer.alloc(0))
    || entries.get('404.html').byteLength !== entries.get('index.html').byteLength
    || entries.get('404.html').sha256 !== entries.get('index.html').sha256
    || ![sha256(Buffer.from('warpkeep.com\n')), sha256(Buffer.from('warpkeep.com\r\n'))]
      .includes(entries.get('CNAME').sha256)) {
    fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  }
  return entries;
}

function validateManifest(bytes, plan, entries) {
  if (bytes.length > MAX_MANIFEST_BYTES || sha256(bytes) !== plan.payloadManifestSha256) {
    fail('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
  }
  const manifest = canonicalJson(bytes, MAX_MANIFEST_BYTES, 'PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
  if (
    manifest.schemaVersion !== 1
    || manifest.profile !== 'warpkeep-public-pages-payload-v1'
    || manifest.canonicalOrigin !== LIVE_ORIGIN
    || manifest.publicationPath !== '/ptr/'
    || manifest.sourceCommit !== plan.sourceCommit
    || manifest.sourceTree !== plan.sourceTree
    || !DIGEST.test(manifest.rootHtmlSha256 ?? '')
    || !DIGEST.test(manifest.contentManifestSha256 ?? '')
    || !Array.isArray(manifest.files)
    || manifest.files.length < 1 || manifest.files.length > MAX_FILES
    || manifest.fileCount !== manifest.files.length
  ) fail('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
  let total = 0;
  let previous;
  const generated = new Set();
  for (const file of manifest.files) {
    if (
      !file || !allowedGeneratedPath(file.path)
      || !Number.isSafeInteger(file.byteLength) || file.byteLength < 0
      || file.byteLength > MAX_FILE_BYTES
      || !DIGEST.test(file.sha256 ?? '')
      || (previous !== undefined && Buffer.compare(Buffer.from(previous), Buffer.from(file.path)) >= 0)
      || entries.get(`ptr/${file.path}`)?.origin !== 'generated'
      || entries.get(`ptr/${file.path}`).byteLength !== file.byteLength
      || entries.get(`ptr/${file.path}`).sha256 !== file.sha256
    ) fail('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
    previous = file.path;
    generated.add(`ptr/${file.path}`);
    total += file.byteLength;
    if (total > MAX_PAYLOAD_BYTES) fail('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
  }
  if (
    REQUIRED_GENERATED_FILES.some(path => !generated.has(`ptr/${path}`))
    || total !== manifest.totalByteLength
    || sha256(Buffer.from(JSON.stringify(manifest.files))) !== manifest.contentManifestSha256
    || entries.get('ptr/index.html')?.sha256 !== manifest.rootHtmlSha256
    || generated.size + HOSTING_PATHS.length + SOURCE_PUBLIC_DOCUMENTS.length
      + preservedRootEntries(entries).length !== entries.size
  ) fail('PUBLIC_PAGES_POSTFLIGHT_MANIFEST_INVALID');
  for (const path of HOSTING_PATHS) {
    if (entries.get(path)?.origin !== 'hosting') fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  }
  for (const path of SOURCE_PUBLIC_DOCUMENTS) {
    if (entries.get(path)?.origin !== 'reviewed-source') fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  }
  if (
    entries.get('ptr/404.html').sha256 !== manifest.rootHtmlSha256
    || entries.get('ptr/404.html').byteLength !== entries.get('ptr/index.html').byteLength
    || entries.get(PUBLIC_PAGES_MIRROR_MANIFEST_PATH).byteLength !== bytes.length
    || entries.get(PUBLIC_PAGES_MIRROR_MANIFEST_PATH).sha256 !== sha256(bytes)
  ) fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  const readme = renderPublicPagesMirrorReadme(manifest, sha256(bytes));
  if (
    entries.get('README.md').byteLength !== readme.length
    || entries.get('README.md').sha256 !== sha256(readme)
  ) fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  for (const [path, entry] of entries) {
    if (!generated.has(path) && !HOSTING_PATHS.includes(path)
      && !SOURCE_PUBLIC_DOCUMENTS.includes(path) && entry.origin !== 'preserved-existing') {
      fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    }
    if (entry.origin === 'preserved-existing' && !isPreservedRootPath(path)) {
      fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    }
    if (entry.origin === 'reviewed-source' && entry.byteLength > 1024 * 1024) {
      fail('PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
    }
  }
  return manifest;
}

function inspectSignedCommit(root, expectedPublicCommit, expectedPublicTree, plan,
  expectedSignerFingerprint, expectedSignerIdentity) {
  if (
    !COMMIT.test(expectedPublicCommit ?? '')
    || !COMMIT.test(expectedPublicTree ?? '')
    || !SIGNER_FINGERPRINT.test(expectedSignerFingerprint ?? '')
    || typeof expectedSignerIdentity !== 'string'
    || !/^[A-Za-z0-9._+@-]{3,128}$/u.test(expectedSignerIdentity)
  ) fail('PUBLIC_PAGES_POSTFLIGHT_COMMIT_INVALID');
  const mirror = inspectPublicMirror(root, expectedPublicCommit);
  if (mirror.publicTree !== expectedPublicTree) fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
  const commitSource = git(root, ['cat-file', '-p', expectedPublicCommit], 1024 * 1024).toString('utf8');
  const headers = commitSource.split('\n\n', 1)[0].split('\n');
  const trees = headers.filter(line => line.startsWith('tree '));
  const parents = headers.filter(line => line.startsWith('parent '));
  if (
    trees.length !== 1 || trees[0] !== `tree ${expectedPublicTree}`
    || parents.length !== 1 || parents[0] !== `parent ${plan.publicParentCommit}`
    || git(root, ['rev-parse', `${plan.publicParentCommit}^{tree}`]).toString('utf8').trim()
      !== plan.publicParentTree
  ) fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
  git(root, ['verify-commit', '--raw', expectedPublicCommit]);
  const signature = git(root, ['log', '-1', '--format=%G?%n%GK%n%GS', expectedPublicCommit])
    .toString('utf8').trim().split(/\r?\n/u);
  if (
    signature.length !== 3 || signature[0] !== 'G'
    || signature[1] !== expectedSignerFingerprint
    || signature[2] !== expectedSignerIdentity
  ) fail('PUBLIC_PAGES_POSTFLIGHT_SIGNATURE_INVALID');
  return mirror;
}

function treePaths(root, commit) {
  const raw = git(root, ['ls-tree', '-r', '-z', '--full-tree', commit], 4 * 1024 * 1024);
  if (raw.length === 0 || raw.at(-1) !== 0) fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
  const paths = new Set();
  for (const record of raw.toString('utf8').slice(0, -1).split('\0')) {
    const match = /^(100644) blob ([a-f0-9]{40})\t(.+)$/u.exec(record);
    if (!match || !safePath(match[3]) || paths.has(match[3])) {
      fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
    }
    paths.add(match[3]);
  }
  return paths;
}

function verifyPreservedRootAgainstParent(root, parentCommit, entries) {
  const parentPaths = treePaths(root, parentCommit);
  const requiredPaths = new Set([...parentPaths].filter(isPreservedRootPath));
  const preserved = preservedRootEntries(entries);
  if (requiredPaths.size !== preserved.length
    || preserved.some(entry => !requiredPaths.has(entry.path))) {
    fail('PUBLIC_PAGES_POSTFLIGHT_ROOT_PRESERVATION_INVALID');
  }
  for (const entry of preserved) {
    const bytes = git(root, ['show', `${parentCommit}:${entry.path}`], MAX_FILE_BYTES);
    if (bytes.length !== entry.byteLength || sha256(bytes) !== entry.sha256) {
      fail('PUBLIC_PAGES_POSTFLIGHT_ROOT_PRESERVATION_INVALID');
    }
    bytes.fill(0);
  }
}

function verifyCommittedEntries(root, commit, entries) {
  const paths = treePaths(root, commit);
  if (paths.size !== entries.size || [...paths].some(path => !entries.has(path))) {
    fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
  }
  let total = 0;
  for (const [path, entry] of entries) {
    const bytes = git(root, ['show', `${commit}:${path}`], MAX_FILE_BYTES);
    total += bytes.length;
    if (
      total > MAX_PUBLIC_TREE_BYTES
      || bytes.length !== entry.byteLength
      || sha256(bytes) !== entry.sha256
    ) fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
    bytes.fill(0);
  }
  return total;
}

function liveRoutes(manifest, entries, rootHtml) {
  const routes = new Map();
  for (const file of manifest.files) {
    const expected = entries.get(`ptr/${file.path}`);
    routes.set(`${LIVE_ORIGIN}/ptr/${file.path}`, expected);
    if (file.path === 'index.html') {
      routes.set(`${LIVE_ORIGIN}/ptr/`, expected);
      routes.set(`${LIVE_ORIGIN}/ptr/index.html`, expected);
    }
    else if (file.path.endsWith('/index.html')) {
      routes.set(`${LIVE_ORIGIN}/ptr/${file.path.slice(0, -'index.html'.length)}`, expected);
    }
  }
  routes.set(`${LIVE_ORIGIN}/ptr/404.html`, entries.get('ptr/404.html'));
  routes.set(`${LIVE_ORIGIN}/`, entries.get('index.html'));
  routes.set(`${LIVE_ORIGIN}/index.html`, entries.get('index.html'));
  routes.set(`${LIVE_ORIGIN}/404.html`, entries.get('404.html'));
  if (entries.has('.well-known/farcaster.json')) {
    routes.set(`${LIVE_ORIGIN}/.well-known/farcaster.json`, entries.get('.well-known/farcaster.json'));
  }
  let rootAssets;
  try { rootAssets = rootAssetUrls(rootHtml, LIVE_ORIGIN); }
  catch { fail('PUBLIC_PAGES_POSTFLIGHT_ROOT_PRESERVATION_INVALID'); }
  for (const asset of rootAssets) {
    const path = asset.pathname.slice(1);
    const expected = entries.get(path);
    if (expected?.origin !== 'preserved-existing') {
      fail('PUBLIC_PAGES_POSTFLIGHT_ROOT_PRESERVATION_INVALID');
    }
    routes.set(asset.href, expected);
  }
  return routes;
}

async function verifyHttpRoute(url, expected, fetchImpl, deadline) {
  const remaining = Math.min(MAX_REQUEST_MS, deadline - Date.now());
  if (remaining <= 0) fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_TIMEOUT');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), remaining);
  let reader;
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept: '*/*' },
    });
    if (
      response?.status !== 200 || response.redirected === true
      || response.url !== url || response.headers?.get('location') !== null
      || !response.body || typeof response.body.getReader !== 'function'
    ) fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_ROUTE_INVALID');
    const declared = response.headers.get('content-length');
    if (
      declared !== null
      && (!/^(?:0|[1-9]\d*)$/u.test(declared) || Number(declared) > MAX_FILE_BYTES)
    ) fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_SIZE_INVALID');
    reader = response.body.getReader();
    const hash = createHash('sha256');
    let size = 0;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      if (!(chunk.value instanceof Uint8Array)) fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_INVALID');
      size += chunk.value.byteLength;
      if (size > expected.byteLength || size > MAX_FILE_BYTES) {
        fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_SIZE_INVALID');
      }
      hash.update(chunk.value);
    }
    if (size !== expected.byteLength || hash.digest('hex') !== expected.sha256) {
      fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_HASH_INVALID');
    }
    return size;
  } catch (error) {
    if (error instanceof PublicPagesPostflightError) throw error;
    fail(controller.signal.aborted
      ? 'PUBLIC_PAGES_POSTFLIGHT_HTTP_TIMEOUT'
      : 'PUBLIC_PAGES_POSTFLIGHT_HTTP_INVALID');
  } finally {
    clearTimeout(timer);
    if (reader) await reader.cancel().catch(() => {});
  }
}

/** Read-only exact-commit and live-static postflight for an already published mirror. */
export async function verifyPublicPagesPostflight({
  publicRoot,
  expectedPublicCommit,
  expectedPublicTree,
  reviewedPlanBytes,
  expectedReviewedPlanSha256,
  expectedSignerFingerprint,
  expectedSignerIdentity,
  readRemoteState = readPublicPagesRemoteState,
  fetchImpl = globalThis.fetch,
}) {
  if (typeof fetchImpl !== 'function' || typeof readRemoteState !== 'function') {
    fail('PUBLIC_PAGES_POSTFLIGHT_ARGUMENT_INVALID');
  }
  const plan = canonicalJson(reviewedPlanBytes, MAX_PLAN_BYTES, 'PUBLIC_PAGES_POSTFLIGHT_PLAN_INVALID');
  const entries = validatePlan(plan, reviewedPlanBytes, expectedReviewedPlanSha256);
  const mirror = inspectSignedCommit(publicRoot, expectedPublicCommit, expectedPublicTree,
    plan, expectedSignerFingerprint, expectedSignerIdentity);
  verifyPreservedRootAgainstParent(mirror.root, plan.publicParentCommit, entries);
  const manifestBytes = git(mirror.root,
    ['show', `${expectedPublicCommit}:${PUBLIC_PAGES_MIRROR_MANIFEST_PATH}`], MAX_MANIFEST_BYTES);
  const manifest = validateManifest(manifestBytes, plan, entries);
  verifyCommittedEntries(mirror.root, expectedPublicCommit, entries);
  const parentRootHtmlBytes = git(mirror.root,
    ['show', `${plan.publicParentCommit}:index.html`], MAX_FILE_BYTES);
  const parentRootHtml = parentRootHtmlBytes.toString('utf8');
  parentRootHtmlBytes.fill(0);
  const pagesRunId = verifyRemotePagesState(await readRemoteState(expectedPublicCommit),
    expectedPublicCommit);
  const routes = liveRoutes(manifest, entries, parentRootHtml);
  const deadline = Date.now() + MAX_HTTP_MS;
  let liveByteLength = 0;
  for (const [url, expected] of routes) {
    liveByteLength += await verifyHttpRoute(url, expected, fetchImpl, deadline);
    if (liveByteLength > 2 * MAX_PUBLIC_TREE_BYTES) fail('PUBLIC_PAGES_POSTFLIGHT_HTTP_SIZE_INVALID');
  }
  const after = inspectPublicMirror(publicRoot, expectedPublicCommit);
  if (after.publicTree !== expectedPublicTree) fail('PUBLIC_PAGES_POSTFLIGHT_TREE_INVALID');
  if (verifyRemotePagesState(await readRemoteState(expectedPublicCommit),
    expectedPublicCommit) !== pagesRunId) fail('PUBLIC_PAGES_POSTFLIGHT_REMOTE_CHANGED');
  return Object.freeze({
    publicCommit: expectedPublicCommit,
    publicTree: expectedPublicTree,
    sourceCommit: manifest.sourceCommit,
    reviewedPlanSha256: expectedReviewedPlanSha256,
    payloadManifestSha256: plan.payloadManifestSha256,
    pagesRunId,
    liveOrigin: LIVE_ORIGIN,
    verifiedFileCount: manifest.files.length,
    verifiedPreservedRootFileCount: preservedRootEntries(entries).length,
    verifiedRouteCount: routes.size,
    verifiedLiveByteLength: liveByteLength,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let planFile;
  try {
    const labels = [
      '--public-root', '--public-commit', '--public-tree', '--plan',
      '--plan-sha256', '--signer-fingerprint', '--signer-identity',
    ];
    if (process.argv.length !== 2 + labels.length * 2
      || labels.some((label, index) => process.argv[2 + index * 2] !== label)) {
      fail('PUBLIC_PAGES_POSTFLIGHT_ARGUMENT_INVALID');
    }
    planFile = readLocalBindingBoundedFile(process.argv[9], { maximumBytes: MAX_PLAN_BYTES });
    const result = await verifyPublicPagesPostflight({
      publicRoot: process.argv[3],
      expectedPublicCommit: process.argv[5],
      expectedPublicTree: process.argv[7],
      reviewedPlanBytes: planFile.body,
      expectedReviewedPlanSha256: process.argv[11],
      expectedSignerFingerprint: process.argv[13],
      expectedSignerIdentity: process.argv[15],
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof PublicPagesPostflightError
      ? error.code : 'PUBLIC_PAGES_POSTFLIGHT_INVALID'}\n`);
    process.exitCode = 1;
  } finally {
    planFile?.body.fill(0);
  }
}
