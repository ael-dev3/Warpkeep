#!/var/lib/warpkeep/release-recovery-v1/toolchains/node-v24.19.0-linux-x64/bin/node

import { spawn, spawnSync } from 'node:child_process'
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto'
import {
  chmodSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const STATE_ROOT = '/var/lib/warpkeep/release-recovery-v1'
const CATALOG_PATH = `${STATE_ROOT}/cache-catalog-v1.json`
const MANIFEST_PATH = `${STATE_ROOT}/toolchains/linux-x64.json`
const REPOSITORY = `${STATE_ROOT}/source-caches/repository.git`
const GIT = '/usr/bin/git'
const IP = '/usr/sbin/ip'
const NODE_24 = `${STATE_ROOT}/toolchains/node-v24.19.0-linux-x64/bin/node`
const NODE_22 = `${STATE_ROOT}/toolchains/node-v22.22.3-linux-x64/bin/node`
const PNPM = `${STATE_ROOT}/toolchains/pnpm-11.7.0/package/bin/pnpm.mjs`
const SPACETIME = `${STATE_ROOT}/toolchains/spacetime-2.6.1/spacetime`
const STANDALONE = `${STATE_ROOT}/toolchains/spacetime-2.6.1/spacetimedb-standalone`
const KECCAK_MODULE = `${STATE_ROOT}/toolchains/noble-hashes-1.8.0/sha3.js`
const RUN_PARENT = `${STATE_ROOT}/runs`
const MATERIALIZER_PATH = '/opt/warpkeep/release-recovery-v1/bin/materialize-spacetime-fixtures-v1'
const G001_BASELINE_COMMIT = '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
const G001_BASELINE_TREE = '90deebb5faf4129282f5c35999244f540001b27d'
const G001_BASELINE_SPACETIME_TREE = 'ab450fd2b3dcdd3ed67ef1f0431e18ae507382ac'
const G001_PREPARATION_COMMIT = 'd945256b217fa13ade944b9ed9880e8463b46123'
const G001_PREPARATION_TREE = '8c2b0b0eda17cefc212f08716a287c44b0e84d48'
const G001_PREPARATION_SOURCE_SHA256 =
  '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251'
const G001_MATERIALIZER_PATH = 'scripts/genesis001-frozen-materializer.mjs'
const G001_MATERIALIZER_SHA256 =
  'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93'
const G001_BASELINE_ABI_SHA256 =
  'cb7d69d2bed316702ffa1aa8696a4e1ca1934a775b8312129b305a9c33eb0e03'
const GIT_SHA256 = '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668'
const IP_SHA256 = '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0'
const G001_FREEZE_NONCE = '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00'
const HEX40 = /^[0-9a-f]{40}$/u
const HEX64 = /^[0-9a-f]{64}$/u
const SAFE_REALM = /^(?:g001|g002|ptr)$/u
const MAX_REQUEST_BYTES = 256 * 1024
const MAX_CATALOG_BYTES = 8 * 1024 * 1024
const MAX_MANIFEST_BYTES = 512 * 1024
const MAX_BUNDLE_BYTES = 64 * 1024 * 1024
const MAX_SCHEMA_BYTES = 2 * 1024 * 1024
const FIXED_ENVIRONMENT_KEYS = Object.freeze([
  'CI', 'HOME', 'LANG', 'LC_ALL', 'NO_COLOR', 'PATH', 'TMPDIR', 'TZ',
  'WSL_DISTRO_NAME', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
])

class Invalid extends Error {}

function fail() {
  throw new Invalid()
}

function exact(value, keys) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail()
  return value
}

function canonicalJson(bytes, maximumBytes) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > maximumBytes) fail()
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const value = JSON.parse(text)
  if (text !== `${JSON.stringify(value)}\n`) fail()
  return value
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function inside(parent, child) {
  const path = relative(parent, child)
  return path === '' || (!path.startsWith(`..${sep}`) && path !== '..' && !path.startsWith('/'))
}

function privateDirectory(path) {
  mkdirSync(path, { mode: 0o700, recursive: true })
  chmodSync(path, 0o700)
  const status = lstatSync(path)
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || status.uid !== process.getuid()
    || (status.mode & 0o777) !== 0o700
    || realpathSync.native(path) !== path
  ) fail()
}

function privateFile(path, bytes) {
  writeFileSync(path, bytes, { flag: 'wx', mode: 0o600 })
  chmodSync(path, 0o600)
  const status = lstatSync(path)
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || status.uid !== process.getuid()
    || (status.mode & 0o777) !== 0o600
  ) fail()
}

function fixedRun(executable, args, environment, maximumBytes = 8 * 1024 * 1024) {
  const result = spawnSync(executable, args, {
    cwd: '/',
    encoding: null,
    env: environment,
    maxBuffer: maximumBytes,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10 * 60_000,
  })
  if (
    result.error !== undefined
    || result.status !== 0
    || result.signal !== null
    || !(result.stdout instanceof Uint8Array)
    || !(result.stderr instanceof Uint8Array)
    || result.stderr.byteLength !== 0
    || result.stdout.byteLength > maximumBytes
  ) fail()
  return Buffer.from(result.stdout)
}

function git(args, environment, maximumBytes = 64 * 1024 * 1024) {
  return fixedRun(GIT, ['--git-dir', REPOSITORY, ...args], environment, maximumBytes)
}

function assertNoForbiddenCoordinate(value) {
  if (value === null || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (/^(?:privateRoot|root|canonicalPath|url|command|credential|output)$/u.test(key)) fail()
    assertNoForbiddenCoordinate(child)
  }
}

function validateRequest(value) {
  const request = exact(value, ['schemaVersion', 'profile', 'platform', 'plan', 'network'])
  if (
    request.schemaVersion !== 1
    || request.profile !== 'warpkeep-release-recovery-wsl-fixture-request-v1'
    || request.network !== 'initialize-and-attest-loopback-only-before-install'
  ) fail()
  const plan = exact(request.plan, [
    'schemaVersion', 'profile', 'recoveryBuildProfile', 'toolchain', 'realms',
  ])
  if (
    plan.schemaVersion !== 1
    || plan.profile !== 'warpkeep-release-recovery-wsl-fixture-plan-v1'
    || plan.recoveryBuildProfile !== 'warpkeep-release-recovery-cross-platform-program-build-v1'
  ) fail()
  const toolchain = exact(plan.toolchain, [
    'manifestSha256', 'cacheCatalogSha256', 'platform', 'architecture',
    'offlineReady', 'signaturesVerified', 'materializerProgramBytes',
    'materializerProgramSha256',
  ])
  if (
    !HEX64.test(toolchain.manifestSha256)
    || !HEX64.test(toolchain.cacheCatalogSha256)
    || toolchain.platform !== 'linux'
    || toolchain.architecture !== 'x64'
    || toolchain.offlineReady !== true
    || toolchain.signaturesVerified !== true
    || !Number.isSafeInteger(toolchain.materializerProgramBytes)
    || toolchain.materializerProgramBytes < 1
    || toolchain.materializerProgramBytes > 16 * 1024 * 1024
    || !HEX64.test(toolchain.materializerProgramSha256)
  ) fail()
  const realms = exact(plan.realms, ['g001', 'g002', 'ptr'])
  const g001 = exact(realms.g001, [
    'realm', 'sourceAuthority', 'baselineCommit', 'baselineTree', 'baselineSpacetimeTree',
    'freezePreparationCommit', 'freezePreparationTree', 'freezePreparationSourceSha256',
    'materializerSha256', 'freezeReleaseNonce', 'modulePath', 'nodeVersion',
  ])
  if (
    g001.realm !== 'g001'
    || g001.sourceAuthority !== 'fixed-g001-frozen-materializer-v1'
    || g001.baselineCommit !== G001_BASELINE_COMMIT
    || g001.baselineTree !== G001_BASELINE_TREE
    || g001.baselineSpacetimeTree !== G001_BASELINE_SPACETIME_TREE
    || g001.freezePreparationCommit !== G001_PREPARATION_COMMIT
    || g001.freezePreparationTree !== G001_PREPARATION_TREE
    || g001.freezePreparationSourceSha256 !== G001_PREPARATION_SOURCE_SHA256
    || g001.materializerSha256 !== G001_MATERIALIZER_SHA256
    || g001.freezeReleaseNonce !== G001_FREEZE_NONCE
    || g001.modulePath !== 'spacetimedb'
    || g001.nodeVersion !== '24.19.0'
  ) fail()
  const validateAuthenticatedRealm = (raw, realm, modulePath) => {
    const authenticated = exact(raw, [
      'realm', 'sourceAuthority', 'receiptSha256', 'databaseIdentity', 'sourceCommit',
      'sourceTree', 'publishedModuleSha256', 'dependencyLockClosureSha256',
      'modulePath', 'nodeVersion',
    ])
    if (
      authenticated.realm !== realm
      || authenticated.sourceAuthority !== 'authenticated-publish-receipt-v1'
      || !HEX64.test(authenticated.receiptSha256)
      || !HEX64.test(authenticated.databaseIdentity)
      || !HEX40.test(authenticated.sourceCommit)
      || !HEX40.test(authenticated.sourceTree)
      || !HEX64.test(authenticated.publishedModuleSha256)
      || !HEX64.test(authenticated.dependencyLockClosureSha256)
      || authenticated.modulePath !== modulePath
      || authenticated.nodeVersion !== '22.22.3'
    ) fail()
    return authenticated
  }
  const g002 = validateAuthenticatedRealm(realms.g002, 'g002', 'spacetimedb/genesis002')
  const ptr = validateAuthenticatedRealm(realms.ptr, 'ptr', 'spacetimedb/ptr')
  if (g002.databaseIdentity === ptr.databaseIdentity) fail()
  assertNoForbiddenCoordinate(request)
  return plan
}

function buildEnvironment(cleanRoot, nodeExecutable) {
  const values = {
    HOME: `${cleanRoot}/home`,
    XDG_CACHE_HOME: `${cleanRoot}/xdg-cache`,
    XDG_CONFIG_HOME: `${cleanRoot}/xdg-config`,
    XDG_DATA_HOME: `${cleanRoot}/xdg-data`,
    TMPDIR: `${cleanRoot}/tmp`,
    LANG: 'C',
    LC_ALL: 'C',
    TZ: 'UTC',
    NO_COLOR: '1',
    CI: '1',
    WSL_DISTRO_NAME: 'Ubuntu-24.04',
    PATH: dirname(nodeExecutable),
  }
  for (const path of [values.HOME, values.XDG_CACHE_HOME, values.XDG_CONFIG_HOME,
    values.XDG_DATA_HOME, values.TMPDIR]) privateDirectory(path)
  return Object.freeze(values)
}

function gitEnvironment(cleanRoot) {
  return Object.freeze({
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_INDEX_FILE: `${cleanRoot}/git-index`,
    HOME: `${cleanRoot}/home`,
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
    TZ: 'UTC',
  })
}

function verifyCatalog(expectedSha256) {
  const bytes = readFileSync(CATALOG_PATH)
  if (bytes.byteLength > MAX_CATALOG_BYTES || sha256(bytes) !== expectedSha256) fail()
  const catalog = exact(canonicalJson(bytes, MAX_CATALOG_BYTES), [
    'schemaVersion', 'profile', 'platform', 'architecture', 'manifestPath',
    'manifestSha256', 'cacheClosureSha256', 'signaturesVerified', 'offlineReady', 'files',
  ])
  if (
    catalog.schemaVersion !== 1
    || catalog.profile !== 'warpkeep-release-recovery-wsl-cache-catalog-v1'
    || catalog.platform !== 'linux'
    || catalog.architecture !== 'x64'
    || catalog.manifestPath !== 'toolchains/linux-x64.json'
    || catalog.signaturesVerified !== true
    || catalog.offlineReady !== true
    || !Array.isArray(catalog.files)
  ) fail()
  const entries = new Map()
  let previousPath = Buffer.alloc(0)
  for (const raw of catalog.files) {
    const entry = exact(raw, ['path', 'bytes', 'sha256', 'mode'])
    const encodedPath = typeof entry.path === 'string' ? Buffer.from(entry.path, 'utf8') : null
    if (
      encodedPath === null
      || encodedPath.byteLength < 1
      || encodedPath.byteLength > 1_024
      || encodedPath.compare(previousPath) <= 0
      || !Buffer.from(encodedPath.toString('utf8'), 'utf8').equals(encodedPath)
      || entry.path.includes('\\')
      || entry.path.startsWith('/')
      || entry.path.split('/').some(part => part === '' || part === '.' || part === '..')
      || !/^(?:toolchains|pnpm-store|source-caches)\//u.test(entry.path)
      || entries.has(entry.path)
      || !HEX64.test(entry.sha256)
      || !Number.isSafeInteger(entry.bytes)
      || entry.bytes < 1
      || entry.bytes > 256 * 1024 * 1024
      || (entry.mode !== '400' && entry.mode !== '500')
    ) fail()
    previousPath = encodedPath
    entries.set(entry.path, entry)
  }
  for (const path of [
    'toolchains/linux-x64.json',
    'toolchains/node-v24.19.0-linux-x64/bin/node',
    'toolchains/node-v22.22.3-linux-x64/bin/node',
    'toolchains/pnpm-11.7.0/package/bin/pnpm.mjs',
    'toolchains/spacetime-2.6.1/spacetime',
    'toolchains/spacetime-2.6.1/spacetimedb-standalone',
    'toolchains/noble-hashes-1.8.0/sha3.js',
    'source-caches/g001-dependency-closure-sha256.txt',
    'source-caches/g002-dependency-closure-sha256.txt',
    'source-caches/ptr-dependency-closure-sha256.txt',
  ]) if (!entries.has(path)) fail()
  return Object.freeze({ catalog, entries })
}

function attestFixedFile(path, expected) {
  const status = lstatSync(path)
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || status.nlink !== 1
    || status.uid !== 0
    || status.gid !== 0
    || (status.mode & 0o777) !== expected.mode
    || status.size < 1
    || status.size > 256 * 1024 * 1024
    || (expected.bytes !== undefined && status.size !== expected.bytes)
    || realpathSync.native(path) !== path
  ) fail()
  if (sha256(readFileSync(path)) !== expected.sha256) fail()
}

function verifyMaterializedStore(store, expected) {
  const observed = new Map()
  const visit = current => {
    const directory = lstatSync(current)
    if (
      !directory.isDirectory()
      || directory.isSymbolicLink()
      || directory.uid !== process.getuid()
      || (directory.mode & 0o777) !== 0o700
      || realpathSync.native(current) !== current
    ) fail()
    for (const name of readdirSync(current).sort()) {
      const path = join(current, name)
      const status = lstatSync(path)
      if (status.isSymbolicLink()) fail()
      if (status.isDirectory()) {
        visit(path)
        continue
      }
      if (!status.isFile() || status.nlink !== 1 || status.uid !== process.getuid()) fail()
      const relativePath = relative(store, path).split(sep).join('/')
      const entry = expected.get(relativePath)
      if (
        entry === undefined
        || status.size !== entry.bytes
        || (status.mode & 0o777) !== entry.mode
        || sha256(readFileSync(path)) !== entry.sha256
      ) fail()
      observed.set(relativePath, true)
    }
  }
  visit(store)
  if (observed.size !== expected.size) fail()
}

function materializeRealmStore(realm, cleanRoot, catalogEntries) {
  if (!SAFE_REALM.test(realm)) fail()
  const prefix = `pnpm-store/${realm}/`
  const store = `${cleanRoot}/.pnpm-store`
  privateDirectory(store)
  const expected = new Map()
  for (const [catalogPath, catalogEntry] of catalogEntries) {
    if (!catalogPath.startsWith(prefix)) continue
    const relativePath = catalogPath.slice(prefix.length)
    if (
      relativePath.length < 1
      || relativePath.split('/').some(part => part === '' || part === '.' || part === '..')
      || expected.has(relativePath)
    ) fail()
    const target = resolve(store, relativePath)
    if (!inside(store, target)) fail()
    privateDirectory(dirname(target))
    const bytes = readFileSync(resolve(STATE_ROOT, catalogPath))
    if (bytes.byteLength !== catalogEntry.bytes || sha256(bytes) !== catalogEntry.sha256) fail()
    privateFile(target, bytes)
    const mode = Number.parseInt(catalogEntry.mode, 8)
    chmodSync(target, mode)
    expected.set(relativePath, Object.freeze({
      bytes: catalogEntry.bytes,
      mode,
      sha256: catalogEntry.sha256,
    }))
  }
  if (expected.size < 1) fail()
  verifyMaterializedStore(store, expected)
  return Object.freeze({
    path: store,
    verify: () => verifyMaterializedStore(store, expected),
  })
}

function attestNetworkNamespace() {
  fixedRun(IP, ['link', 'set', 'lo', 'up'], process.env, 4 * 1024)
  const links = JSON.parse(fixedRun(IP, ['-json', 'link', 'show'], process.env, 64 * 1024))
  const routes = JSON.parse(fixedRun(IP, ['-json', 'route', 'show', 'table', 'all'], process.env, 64 * 1024))
  if (
    !Array.isArray(links)
    || links.length !== 1
    || links[0]?.ifname !== 'lo'
    || !links[0]?.flags?.includes('LOOPBACK')
    || !links[0]?.flags?.includes('UP')
    || !Array.isArray(routes)
    || routes.some(route => route?.dev !== 'lo')
  ) fail()
}

function materializeCommit(commit, tree, modulePath, cleanRoot) {
  if (!HEX40.test(commit) || !HEX40.test(tree)) fail()
  const environment = gitEnvironment(cleanRoot)
  const resolvedCommit = git(['rev-parse', '--verify', `${commit}^{commit}`], environment, 128)
    .toString('utf8').trim()
  const resolvedTree = git(['rev-parse', '--verify', `${commit}:${modulePath}`], environment, 128)
    .toString('utf8').trim()
  if (resolvedCommit !== commit || resolvedTree !== tree) fail()
  const prefix = modulePath === 'spacetimedb/ptr' ? modulePath : 'spacetimedb'
  const listing = git(
    ['ls-tree', '-rz', '--full-tree', '--long', commit, '--', prefix],
    environment,
    16 * 1024 * 1024,
  )
  const records = listing.subarray(0, listing.byteLength - 1).toString('binary').split('\0')
  if (listing.byteLength < 2 || listing.at(-1) !== 0 || records.length < 1) fail()
  const seen = new Set()
  let totalBytes = 0
  for (const encodedRecord of records) {
    const record = Buffer.from(encodedRecord, 'binary')
    const tab = record.indexOf(9)
    if (tab < 1) fail()
    const metadata = record.subarray(0, tab).toString('ascii')
    const match = /^(100644|100755) blob ([0-9a-f]{40}) +([0-9]+)$/u.exec(metadata)
    const pathBytes = record.subarray(tab + 1)
    const path = pathBytes.toString('utf8')
    if (
      match === null
      || !Buffer.from(path, 'utf8').equals(pathBytes)
      || path.length < 1
      || path.length > 4_096
      || path.includes('\\')
      || path.startsWith('/')
      || !path.startsWith(`${prefix}/`)
      || path.split('/').some(part => part === '' || part === '.' || part === '..')
      || seen.has(path)
    ) fail()
    seen.add(path)
    const size = Number(match[3])
    if (!Number.isSafeInteger(size) || size < 0 || size > 64 * 1024 * 1024) fail()
    totalBytes += size
    if (totalBytes > 256 * 1024 * 1024) fail()
    const bytes = git(['cat-file', 'blob', match[2]], environment, size + 1)
    if (bytes.byteLength !== size) fail()
    const target = resolve(cleanRoot, path)
    if (!inside(cleanRoot, target)) fail()
    privateDirectory(dirname(target))
    privateFile(target, bytes)
    if (match[1] === '100755') chmodSync(target, 0o500)
  }
}

async function materializeG001(destination, runRoot, plan) {
  const environment = gitEnvironment(runRoot)
  const source = git(
    ['show', `${G001_PREPARATION_COMMIT}:${G001_MATERIALIZER_PATH}`],
    environment,
    2 * 1024 * 1024,
  )
  if (sha256(source) !== G001_MATERIALIZER_SHA256) fail()
  const modulePath = `${runRoot}/g001-materializer.mjs`
  privateFile(modulePath, source)
  const materializer = await import(`${pathToFileURL(modulePath).href}?sha256=${G001_MATERIALIZER_SHA256}`)
  if (typeof materializer.materializeGenesis001Frozen !== 'function') fail()
  const result = materializer.materializeGenesis001Frozen({
    repoRoot: REPOSITORY,
    destination,
  })
  exact(result, ['baseline', 'baselineAbiSha256', 'extractedFileCount', 'freezeNonce'])
  if (
    result.baseline !== plan.baselineCommit
    || result.baselineAbiSha256 !== G001_BASELINE_ABI_SHA256
    || !Number.isSafeInteger(result.extractedFileCount)
    || result.extractedFileCount < 1
    || result.freezeNonce !== plan.freezeReleaseNonce
  ) fail()
  unlinkSync(modulePath)
}

function sourceClosure(root) {
  const entries = []
  const visit = current => {
    for (const name of readdirSync(current).sort()) {
      if (name === 'node_modules' || name === 'dist') continue
      const path = join(current, name)
      const status = lstatSync(path)
      if (status.isSymbolicLink()) fail()
      if (status.isDirectory()) visit(path)
      else if (status.isFile() && status.nlink === 1) entries.push(path)
      else fail()
    }
  }
  visit(root)
  const digest = createHash('sha256')
  digest.update('warpkeep.release-recovery.transformed-source-closure.v1\n')
  for (const path of entries.sort((left, right) => Buffer.from(relative(root, left)).compare(Buffer.from(relative(root, right))))) {
    const bytes = readFileSync(path)
    digest.update(relative(root, path).split(sep).join('/')).update('\0')
    digest.update(String(bytes.byteLength)).update('\0').update(bytes)
  }
  return digest.digest('hex')
}

async function buildOnce(realm, realmPlan, catalogEntries) {
  if (!SAFE_REALM.test(realm)) fail()
  const cleanRoot = mkdtempSync(`${RUN_PARENT}/${realm}-build-`)
  chmodSync(cleanRoot, 0o700)
  let bundle
  try {
    const sourceRoot = `${cleanRoot}/source`
    const node = realm === 'g001' ? NODE_24 : NODE_22
    const modulePath = realm === 'g001'
      ? `${sourceRoot}/spacetimedb`
      : realm === 'g002'
        ? `${sourceRoot}/spacetimedb/genesis002`
        : `${sourceRoot}/spacetimedb/ptr`
    const workspacePath = realm === 'ptr' ? modulePath : `${sourceRoot}/spacetimedb`
    const importer = realm === 'g001'
      ? 'warpkeep-spacetimedb-module'
      : realm === 'g002'
        ? 'warpkeep-genesis-002-spacetimedb-module'
        : 'warpkeep-ptr-spacetimedb-module'
    const environment = buildEnvironment(cleanRoot, node)
    const store = materializeRealmStore(realm, cleanRoot, catalogEntries)
    if (realm === 'g001') await materializeG001(sourceRoot, cleanRoot, realmPlan)
    else {
      privateDirectory(sourceRoot)
      materializeCommit(
        realmPlan.sourceCommit,
        realmPlan.sourceTree,
        realmPlan.modulePath,
        sourceRoot,
      )
    }
    const transformedSourceClosureSha256 = realm === 'g001'
      ? sourceClosure(`${sourceRoot}/spacetimedb`)
      : null
    const dependencyDigest = readFileSync(
      `${STATE_ROOT}/source-caches/${realm}-dependency-closure-sha256.txt`,
      'utf8',
    )
    if (dependencyDigest !== `${realmPlan.dependencyLockClosureSha256 ?? dependencyDigest.trim()}\n`) fail()
    fixedRun(node, [
      PNPM,
      '--dir', workspacePath,
      '--filter', importer,
      'install',
      '--offline',
      '--frozen-lockfile',
      '--ignore-scripts',
      `--store-dir=${store.path}`,
      `--virtual-store-dir=${modulePath}/node_modules/.pnpm`,
    ], environment)
    store.verify()
    const shim = `${modulePath}/node_modules/.bin/tsc`
    const shimStatus = lstatSync(shim)
    if (!shimStatus.isFile() || shimStatus.isSymbolicLink() || shimStatus.size < 1 || shimStatus.size > 64 * 1024) fail()
    unlinkSync(shim)
    const launcher = `${modulePath}/node_modules/.bin/warpkeep-tsc-launcher.cjs`
    privateFile(launcher, Buffer.from(`#!${node}\nrequire('../typescript/bin/tsc');\n`))
    chmodSync(launcher, 0o500)
    symlinkSync('warpkeep-tsc-launcher.cjs', shim)
    const dist = `${modulePath}/dist`
    try { lstatSync(dist); fail() } catch (error) { if (error instanceof Invalid) throw error }
    fixedRun(SPACETIME, ['build', '--module-path', modulePath], environment)
    if (JSON.stringify(readdirSync(dist)) !== JSON.stringify(['bundle.js'])) fail()
    const bundlePath = `${dist}/bundle.js`
    const status = lstatSync(bundlePath)
    if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1 || status.size > MAX_BUNDLE_BYTES) fail()
    bundle = Uint8Array.from(readFileSync(bundlePath))
    return Object.freeze({ bundle, transformedSourceClosureSha256 })
  } finally {
    rmSync(cleanRoot, { recursive: true, force: true })
  }
}

async function freePort() {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.once('error', rejectPromise)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') return rejectPromise(new Invalid())
      server.close(error => error === undefined ? resolvePromise(address.port) : rejectPromise(error))
    })
  })
}

async function boundedResponse(response, expectedUrl, maximumBytes) {
  if (response.url !== expectedUrl || response.status !== 200) fail()
  const type = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()
  if (type !== 'application/json') fail()
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength < 1 || bytes.byteLength > maximumBytes) fail()
  return bytes
}

async function acquireIdentity(server) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const url = `${server}/v1/identity`
      const response = await fetch(url, {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(1_000),
      })
      const bytes = await boundedResponse(response, url, 4 * 1024)
      const value = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
      if (!HEX64.test(value.identity) || typeof value.token !== 'string' || value.token.length > 8 * 1024) fail()
      return value
    } catch {
      await new Promise(resolvePromise => setTimeout(resolvePromise, 100))
    }
  }
  fail()
}

function parsePublished(stdout, name) {
  const match = new TextDecoder('utf8', { fatal: true }).decode(stdout).match(
    /^Created new database with name: ([a-z0-9-]{1,63}), identity: ([0-9a-f]{64})\r?\n$/u,
  )
  if (match === null || match[1] !== name) fail()
  return match[2]
}

function parseProgramHash(bytes) {
  const value = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
  const statement = Array.isArray(value) && value.length === 1 ? value[0] : fail()
  if (
    JSON.stringify(Object.keys(statement)) !== JSON.stringify(['schema', 'rows', 'total_duration_micros', 'stats'])
    || !Array.isArray(statement.rows)
    || statement.rows.length !== 1
    || !Array.isArray(statement.rows[0])
    || statement.rows[0].length !== 1
    || typeof statement.rows[0][0] !== 'string'
    || !/^0x(?:0|[1-9a-f][0-9a-f]{0,63})$/u.test(statement.rows[0][0])
  ) fail()
  const bytesBigEndian = statement.rows[0][0].slice(2).padStart(64, '0').match(/../gu)
  if (bytesBigEndian === null || bytesBigEndian.length !== 32) fail()
  return bytesBigEndian.reverse().join('')
}

async function captureSchemas(builds, environment) {
  const serverRoot = mkdtempSync(`${RUN_PARENT}/server-`)
  chmodSync(serverRoot, 0o700)
  let child
  let owner
  try {
    const generated = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    const publicKey = `${serverRoot}/jwt-public.pem`
    const privateKey = `${serverRoot}/jwt-private.pem`
    const data = `${serverRoot}/data`
    privateDirectory(data)
    privateFile(publicKey, generated.publicKey)
    privateFile(privateKey, generated.privateKey)
    const port = await freePort()
    const server = `http://127.0.0.1:${port}`
    child = spawn(STANDALONE, [
      'start', '--listen-addr', `127.0.0.1:${port}`, '--in-memory',
      '--data-dir', data, '--jwt-pub-key-path', publicKey,
      '--jwt-priv-key-path', privateKey, '--non-interactive',
    ], { cwd: '/', env: environment, stdio: 'ignore' })
    if (
      !Number.isSafeInteger(child.pid)
      || child.pid < 1
      || realpathSync.native(`/proc/${child.pid}/exe`) !== STANDALONE
    ) fail()
    owner = await acquireIdentity(server)
    const config = `${serverRoot}/cli.toml`
    privateFile(config, Buffer.from(`spacetimedb_token = ${JSON.stringify(owner.token)}\n`))
    const result = {}
    for (const realm of ['g001', 'g002', 'ptr']) {
      const bundlePath = `${serverRoot}/${realm}.bundle.js`
      privateFile(bundlePath, builds[realm].bundle)
      const name = `warpkeep-recovery-${realm}-${randomBytes(12).toString('hex')}`
      const identity = parsePublished(fixedRun(SPACETIME, [
        `--config-path=${config}`,
        'publish', '--server', server, '--js-path', bundlePath,
        '--delete-data=never', '--yes=skip-login', '--no-config', name,
      ], environment, 64 * 1024), name)
      const sqlUrl = `${server}/v1/database/${identity}/sql?confirmed=true`
      const sql = await boundedResponse(await fetch(sqlUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${owner.token}`,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
        body: 'SELECT program_hash FROM st_module',
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      }), sqlUrl, 64 * 1024)
      if (parseProgramHash(sql) !== builds[realm].programKeccak256) fail()
      const schemaUrl = `${server}/v1/database/${identity}/schema?version=10`
      const schema = await boundedResponse(await fetch(schemaUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${owner.token}`,
          Accept: 'application/json',
          'Cache-Control': 'no-store',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(5_000),
      }), schemaUrl, MAX_SCHEMA_BYTES)
      JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(schema))
      result[realm] = schema
      unlinkSync(bundlePath)
    }
    return result
  } finally {
    if (owner !== undefined && typeof owner.token === 'string') owner.token = ''
    if (child !== undefined) await terminateOwnedChild(child)
    rmSync(serverRoot, { recursive: true, force: true })
  }
}

async function terminateOwnedChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  const waitForExit = timeout => new Promise(resolvePromise => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise(true)
      return
    }
    let settled = false
    const finish = value => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      child.off('exit', onExit)
      child.off('error', onError)
      resolvePromise(value)
    }
    const onExit = () => finish(true)
    const onError = () => finish(false)
    const timer = setTimeout(() => finish(false), timeout)
    child.once('exit', onExit)
    child.once('error', onError)
  })
  const gracefulExit = waitForExit(5_000)
  child.kill('SIGTERM')
  if (await gracefulExit) return
  const forcedExit = waitForExit(5_000)
  child.kill('SIGKILL')
  if (!(await forcedExit)) fail()
}

async function main() {
  if (process.platform !== 'linux' || process.arch !== 'x64' || process.getuid() !== 0) fail()
  if (JSON.stringify(Object.keys(process.env).sort()) !== JSON.stringify([...FIXED_ENVIRONMENT_KEYS].sort())) fail()
  if (
    process.argv.length !== 2
    || realpathSync.native(process.argv[1]) !== MATERIALIZER_PATH
  ) fail()
  attestNetworkNamespace()
  const chunks = []
  let length = 0
  for await (const chunk of process.stdin) {
    length += chunk.byteLength
    if (length > MAX_REQUEST_BYTES) fail()
    chunks.push(chunk)
  }
  const plan = validateRequest(canonicalJson(Buffer.concat(chunks), MAX_REQUEST_BYTES))
  attestFixedFile(MATERIALIZER_PATH, {
    bytes: plan.toolchain.materializerProgramBytes,
    mode: 0o500,
    sha256: plan.toolchain.materializerProgramSha256,
  })
  const verifiedCatalog = verifyCatalog(plan.toolchain.cacheCatalogSha256)
  if (verifiedCatalog.catalog.manifestSha256 !== plan.toolchain.manifestSha256) fail()
  for (const [path, entry] of verifiedCatalog.entries) {
    attestFixedFile(resolve(STATE_ROOT, path), {
      bytes: entry.bytes,
      mode: Number.parseInt(entry.mode, 8),
      sha256: entry.sha256,
    })
  }
  attestFixedFile(GIT, { mode: 0o755, sha256: GIT_SHA256 })
  attestFixedFile(IP, { mode: 0o755, sha256: IP_SHA256 })
  privateDirectory(RUN_PARENT)
  const { keccak_256: keccak256 } = await import(pathToFileURL(KECCAK_MODULE).href)
  const builds = {}
  for (const realm of ['g001', 'g002', 'ptr']) {
    const first = await buildOnce(realm, plan.realms[realm], verifiedCatalog.entries)
    const second = await buildOnce(realm, plan.realms[realm], verifiedCatalog.entries)
    if (!Buffer.from(first.bundle).equals(Buffer.from(second.bundle))) fail()
    const digest = sha256(first.bundle)
    if (realm !== 'g001' && digest !== plan.realms[realm].publishedModuleSha256) fail()
    builds[realm] = {
      bundle: first.bundle,
      dependencyLockClosureSha256: plan.realms[realm].dependencyLockClosureSha256
        ?? readFileSync(`${STATE_ROOT}/source-caches/g001-dependency-closure-sha256.txt`, 'utf8').trim(),
      transformedSourceClosureSha256: first.transformedSourceClosureSha256,
      firstBuildArtifactSha256: digest,
      secondBuildArtifactSha256: digest,
      programArtifactSha256: digest,
      programKeccak256: Buffer.from(keccak256(first.bundle)).toString('hex'),
    }
  }
  const serverEnvironmentRoot = mkdtempSync(`${RUN_PARENT}/server-environment-`)
  chmodSync(serverEnvironmentRoot, 0o700)
  let schemas
  try {
    const environment = buildEnvironment(serverEnvironmentRoot, NODE_24)
    schemas = await captureSchemas(builds, environment)
  } finally {
    rmSync(serverEnvironmentRoot, { recursive: true, force: true })
  }
  const manifest = readFileSync(MANIFEST_PATH)
  if (manifest.byteLength > MAX_MANIFEST_BYTES || sha256(manifest) !== plan.toolchain.manifestSha256) fail()
  const realmWire = realm => ({
    realm,
    dependencyLockClosureSha256: builds[realm].dependencyLockClosureSha256,
    transformedSourceClosureSha256: builds[realm].transformedSourceClosureSha256,
    firstBuildArtifactSha256: builds[realm].firstBuildArtifactSha256,
    secondBuildArtifactSha256: builds[realm].secondBuildArtifactSha256,
    programArtifactSha256: builds[realm].programArtifactSha256,
    programHashAlgorithm: 'keccak-256',
    programKeccak256: builds[realm].programKeccak256,
    rawModuleDefV10ResponseBase64url: Buffer.from(schemas[realm]).toString('base64url'),
  })
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-fixture-result-v1',
    toolchainManifestBase64url: Buffer.from(manifest).toString('base64url'),
    toolchainManifestSha256: plan.toolchain.manifestSha256,
    realms: { g001: realmWire('g001'), g002: realmWire('g002'), ptr: realmWire('ptr') },
  })}\n`)
}

try {
  await main()
} catch {
  process.exitCode = 1
}
