import { createHash } from 'node:crypto'
import { types } from 'node:util'

const HEX40 = /^[0-9a-f]{40}$/u
const HEX64 = /^[0-9a-f]{64}$/u
const SRI512 = /^sha512-[A-Za-z0-9+/]{86}==$/u
const MAX_POLICY_BYTES = 512 * 1024
const REALMS = Object.freeze(['g001', 'g002', 'ptr'])

function fail() {
  const error = new Error('RECOVERY_FIXTURE_INPUT_INVALID')
  delete error.stack
  throw error
}

function exact(value, keys) {
  if (
    types.isProxy(value)
    || value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail()
  return value
}

function integer(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) fail()
  return value
}

function hex(value, expression) {
  if (typeof value !== 'string' || !expression.test(value) || /^0+$/u.test(value)) fail()
  return value
}

function canonicalJson(bytes, maximum = MAX_POLICY_BYTES) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 2 || bytes.byteLength > maximum) fail()
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    const value = JSON.parse(text)
    if (text !== `${JSON.stringify(value)}\n`) fail()
    return value
  } catch {
    fail()
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function safeRelativePath(value) {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 1_024
    || value.includes('\\')
    || value.startsWith('/')
    || value.split('/').some(part => part === '' || part === '.' || part === '..')
  ) fail()
  return value
}

function validateMember(value, expectedMode) {
  const member = exact(value, ['mode', 'bytes', 'sha256'])
  if (member.mode !== expectedMode) fail()
  integer(member.bytes, 256 * 1024 * 1024)
  hex(member.sha256, HEX64)
  return member
}

function validateNodeRelease(value, version, expected) {
  const release = exact(value, [
    'version', 'archiveUrl', 'archiveBytes', 'archiveSha256', 'archiveMemberPath',
    'archiveMemberMode', 'archiveMemberBytes', 'archiveMemberSha256', 'shasumsUrl',
    'shasumsBytes', 'shasumsSha256', 'signatureUrl', 'signatureBytes',
    'signatureSha256', 'signingAlgorithm', 'signerFingerprint', 'publicKeyUrl',
    'publicKeyBytes', 'publicKeySha256',
  ])
  if (
    release.version !== version
    || release.archiveUrl !== `https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz`
    || release.archiveMemberPath !== `node-v${version}-linux-x64/bin/node`
    || release.archiveMemberMode !== '755'
    || release.shasumsUrl !== `https://nodejs.org/dist/v${version}/SHASUMS256.txt`
    || release.signatureUrl !== `https://nodejs.org/dist/v${version}/SHASUMS256.txt.sig`
    || release.signingAlgorithm !== expected.algorithm
    || release.signerFingerprint !== expected.fingerprint
    || release.publicKeyUrl !== `https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/${expected.fingerprint}.asc`
    || release.publicKeyBytes !== expected.keyBytes
    || release.publicKeySha256 !== expected.keySha256
  ) fail()
  integer(release.archiveBytes, 100 * 1024 * 1024)
  integer(release.archiveMemberBytes, 192 * 1024 * 1024)
  integer(release.shasumsBytes, 64 * 1024)
  integer(release.signatureBytes, 4 * 1024)
  for (const digest of [
    release.archiveSha256,
    release.archiveMemberSha256,
    release.shasumsSha256,
    release.signatureSha256,
  ]) hex(digest, HEX64)
  return release
}

function validatePnpm(value) {
  const pnpm = exact(value, [
    'version', 'url', 'compressedBytes', 'sri', 'sha256', 'members',
  ])
  if (
    pnpm.version !== '11.7.0'
    || pnpm.url !== 'https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz'
    || pnpm.compressedBytes !== 4_590_455
    || pnpm.sri !== 'sha512-GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA=='
    || pnpm.sha256 !== 'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee'
  ) fail()
  const members = exact(pnpm.members, [
    'package/bin/pnpm.mjs', 'package/dist/pnpm.mjs', 'package/package.json',
  ])
  validateMember(members['package/bin/pnpm.mjs'], '755')
  validateMember(members['package/dist/pnpm.mjs'], '644')
  validateMember(members['package/package.json'], '644')
  return pnpm
}

function validateSpacetime(value) {
  const spacetime = exact(value, [
    'version', 'commit', 'archiveUrl', 'archiveBytes', 'archiveSha256',
    'redirectPolicy', 'members',
  ])
  if (
    spacetime.version !== '2.6.1'
    || spacetime.commit !== '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87'
    || spacetime.archiveUrl !== 'https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.6.1/spacetime-x86_64-unknown-linux-gnu.tar.gz'
    || spacetime.archiveBytes !== 57_464_969
    || spacetime.archiveSha256 !== 'cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118'
    || spacetime.redirectPolicy !== 'github-release-one-hop-headerless'
  ) fail()
  const members = exact(spacetime.members, ['spacetimedb-cli', 'spacetimedb-standalone'])
  validateMember(members['spacetimedb-cli'], '755')
  validateMember(members['spacetimedb-standalone'], '755')
  return spacetime
}

const SYSTEM_TOOL_EXPECTATIONS = Object.freeze({
  git: Object.freeze(['git', '1:2.43.0-1ubuntu7.3', '/usr/bin/git', '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668']),
  gpg: Object.freeze(['gpg', '2.4.4-2ubuntu17.4', '/usr/bin/gpg', '7ecb1341104b0ee1107fe908abce37e24546de1db0848b29c75f59f72094f4e8']),
  gpgv: Object.freeze(['gpgv', '2.4.4-2ubuntu17.4', '/usr/bin/gpgv', '097b577cdf8b51dcc1fb42417d5ef3ca2e22b36a8ad16c9df4bd083a38fe476c']),
  unshare: Object.freeze(['util-linux', '2.39.3-9ubuntu6.6', '/usr/bin/unshare', 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c']),
  ip: Object.freeze(['iproute2', '6.1.0-1ubuntu6.2', '/usr/sbin/ip', '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0']),
})

function validateSystemTools(value) {
  const tools = exact(value, ['git', 'gpg', 'gpgv', 'unshare', 'ip'])
  for (const name of Object.keys(SYSTEM_TOOL_EXPECTATIONS)) {
    const tool = exact(tools[name], ['package', 'version', 'path', 'sha256'])
    const expected = SYSTEM_TOOL_EXPECTATIONS[name]
    if (
      tool.package !== expected[0]
      || tool.version !== expected[1]
      || tool.path !== expected[2]
      || tool.sha256 !== expected[3]
    ) fail()
  }
  return tools
}

function validateHostGuest(value) {
  const authority = exact(value, [
    'wslExecutable', 'wslExecutableBytes', 'wslExecutableSha256',
    'wslFileVersion', 'wslProductVersion', 'wslVersion', 'guestOsReleaseBytes',
    'guestOsReleaseSha256', 'guestKernelReleaseBytes', 'guestKernelReleaseSha256',
  ])
  if (
    authority.wslExecutable !== String.raw`C:\Windows\System32\wsl.exe`
    || authority.wslExecutableBytes !== 274_432
    || authority.wslExecutableSha256
      !== '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2'
    || authority.wslFileVersion !== '10.0.26100.8737'
    || authority.wslProductVersion !== '10.0.26100.8737'
    || authority.wslVersion !== '2.7.11.0'
    || authority.guestOsReleaseBytes !== 400
    || authority.guestOsReleaseSha256
      !== '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829'
    || authority.guestKernelReleaseBytes !== 34
    || authority.guestKernelReleaseSha256
      !== '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92'
  ) fail()
  return authority
}

function validateSourceRules(value) {
  const rules = exact(value, REALMS)
  const g001 = exact(rules.g001, [
    'sourceCommit', 'sourceTree', 'modulePath', 'importer', 'nodeVersion',
    'dependencyPaths', 'dependencyBlobs', 'preparationCommit', 'preparationTree',
    'preparationManifestPath', 'preparationManifestBlob',
    'preparationManifestBytes', 'preparationManifestSha256', 'materializerPath',
    'materializerBlob', 'materializerSha256',
  ])
  if (
    g001.sourceCommit !== '2ae51984e1fa6ce5b0028c1a250359fed79d819b'
    || g001.sourceTree !== '90deebb5faf4129282f5c35999244f540001b27d'
    || g001.modulePath !== 'spacetimedb'
    || g001.importer !== 'warpkeep-spacetimedb-module'
    || g001.nodeVersion !== '24.19.0'
    || !sameJson(g001.dependencyPaths, [
      'spacetimedb/package.json',
      'spacetimedb/pnpm-lock.yaml',
      'spacetimedb/pnpm-workspace.yaml',
    ])
    || !sameJson(g001.dependencyBlobs, [
      'faf7214653f1248a3f9231fd6a13dda130821014',
      '649efdebd25528f593aff612ca8aef6f761d1e94',
      'a640febaa07fad295f2de4b4416b7a22910eb2e6',
    ])
    || g001.preparationCommit !== 'd945256b217fa13ade944b9ed9880e8463b46123'
    || g001.preparationTree !== '8c2b0b0eda17cefc212f08716a287c44b0e84d48'
    || g001.preparationManifestPath
      !== 'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json'
    || g001.preparationManifestBlob !== '768efb5147661671ad558e03fec191a96d81efe1'
    || g001.preparationManifestBytes !== 201_077
    || g001.preparationManifestSha256
      !== '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251'
    || g001.materializerPath !== 'scripts/genesis001-frozen-materializer.mjs'
    || g001.materializerBlob !== 'c50182e99ed2e2fab1ca994c905818d383782cfc'
    || g001.materializerSha256
      !== 'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93'
  ) fail()
  const g002 = exact(rules.g002, [
    'modulePath', 'workspacePath', 'lockImporter', 'packageName', 'nodeVersion',
    'dependencyPaths',
  ])
  if (
    g002.modulePath !== 'spacetimedb/genesis002'
    || g002.workspacePath !== 'spacetimedb'
    || g002.lockImporter !== 'genesis002'
    || g002.packageName !== 'warpkeep-genesis-002-spacetimedb-module'
    || g002.nodeVersion !== '22.22.3'
    || !sameJson(g002.dependencyPaths, [
      'spacetimedb/package.json',
      'spacetimedb/pnpm-workspace.yaml',
      'spacetimedb/pnpm-lock.yaml',
      'spacetimedb/genesis002/package.json',
    ])
  ) fail()
  const dynamicExpected = Object.freeze({
    ptr: Object.freeze({
      modulePath: 'spacetimedb/ptr',
      importer: 'warpkeep-ptr-spacetimedb-module',
      paths: Object.freeze(['spacetimedb/ptr/package.json', 'spacetimedb/ptr/pnpm-lock.yaml']),
    }),
  })
  for (const realm of ['ptr']) {
    const rule = exact(rules[realm], [
      'modulePath', 'importer', 'nodeVersion', 'dependencyPaths',
    ])
    const expected = dynamicExpected[realm]
    if (
      rule.modulePath !== expected.modulePath
      || rule.importer !== expected.importer
      || rule.nodeVersion !== '22.22.3'
      || !sameJson(rule.dependencyPaths, expected.paths)
    ) fail()
  }
  return rules
}

export function validateToolchainSourcePolicy(value) {
  const policy = exact(value, [
    'schemaVersion', 'profile', 'distribution', 'platform', 'architecture',
    'recoveryBuildProfile', 'hostGuest', 'nodeReleases', 'pnpm', 'spacetime',
    'systemTools', 'sourceRules', 'packageFetchPolicy', 'lifecycleScripts',
    'noClobber',
  ])
  if (
    policy.schemaVersion !== 1
    || policy.profile !== 'warpkeep-release-recovery-wsl-toolchain-source-policy-v1'
    || policy.distribution !== 'WarpkeepRunner'
    || policy.platform !== 'linux'
    || policy.architecture !== 'x64'
    || policy.recoveryBuildProfile
      !== 'warpkeep-release-recovery-cross-platform-program-build-v1'
    || policy.packageFetchPolicy !== 'canonical-registry-no-redirect-no-credential'
    || policy.lifecycleScripts !== false
    || policy.noClobber !== true
  ) fail()
  validateHostGuest(policy.hostGuest)
  const nodes = exact(policy.nodeReleases, ['24.19.0', '22.22.3'])
  validateNodeRelease(nodes['24.19.0'], '24.19.0', {
    algorithm: 'EdDSA',
    fingerprint: '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
    keyBytes: 924,
    keySha256: '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
  })
  validateNodeRelease(nodes['22.22.3'], '22.22.3', {
    algorithm: 'RSA',
    fingerprint: 'CC68F5A3106FF448322E48ED27F5E38D5B0A215F',
    keyBytes: 3_163,
    keySha256: 'e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27',
  })
  validatePnpm(policy.pnpm)
  validateSpacetime(policy.spacetime)
  validateSystemTools(policy.systemTools)
  validateSourceRules(policy.sourceRules)
  return policy
}

export function parseToolchainSourcePolicyBytes(bytes) {
  const policy = validateToolchainSourcePolicy(canonicalJson(bytes))
  return Object.freeze({ policy, sha256: sha256(bytes) })
}

function validateSourceCoordinates(value) {
  const sources = exact(value, REALMS)
  for (const realm of REALMS) {
    const source = exact(sources[realm], [
      'sourceCommit', 'sourceTree', 'historicalDependencyClosureSha256',
    ])
    hex(source.sourceCommit, HEX40)
    hex(source.sourceTree, HEX40)
    if (realm === 'g001') {
      if (source.historicalDependencyClosureSha256 !== null) fail()
    } else {
      hex(source.historicalDependencyClosureSha256, HEX64)
    }
  }
  return sources
}

function validateSourceEvidence(value, realm, policy, expected) {
  const source = exact(value, [
    'realm', 'sourceCommit', 'sourceTree', 'historicalDependencyClosureSha256',
    'linuxSourceDependencyClosureSha256', 'dependencyInventoryDomain',
    'dependencyClosureRecordPath', 'dependencyFiles',
  ])
  if (
    source.realm !== realm
    || source.sourceCommit !== expected.sourceCommit
    || source.sourceTree !== expected.sourceTree
    || source.historicalDependencyClosureSha256
      !== expected.historicalDependencyClosureSha256
    || source.dependencyInventoryDomain
      !== `warpkeep.release-recovery.source-dependencies.${realm}.v1`
    || source.dependencyClosureRecordPath
      !== `source-caches/${realm}-linux-source-dependency-closure-sha256.txt`
    || !Array.isArray(source.dependencyFiles)
    || source.dependencyFiles.length !== policy.sourceRules[realm].dependencyPaths.length
  ) fail()
  const closure = createHash('sha256')
  closure.update(`${source.dependencyInventoryDomain}\n`)
  const closureRecords = []
  for (let index = 0; index < source.dependencyFiles.length; index += 1) {
    const file = exact(source.dependencyFiles[index], ['path', 'blob', 'bytes', 'sha256'])
    const encodedPath = Buffer.from(safeRelativePath(file.path), 'utf8')
    if (
      file.path !== policy.sourceRules[realm].dependencyPaths[index]
      || file.path === source.dependencyClosureRecordPath
    ) fail()
    hex(file.blob, HEX40)
    integer(file.bytes, 16 * 1024 * 1024)
    hex(file.sha256, HEX64)
    if (realm === 'g001' && file.blob !== policy.sourceRules.g001.dependencyBlobs[index]) fail()
    closureRecords.push({ encodedPath, file })
  }
  closureRecords.sort((left, right) => left.encodedPath.compare(right.encodedPath))
  for (let index = 0; index < closureRecords.length; index += 1) {
    if (index > 0 && closureRecords[index].encodedPath.equals(closureRecords[index - 1].encodedPath)) fail()
    const { file } = closureRecords[index]
    closure.update(`${file.path}\0${file.blob}\0${file.bytes}\0${file.sha256}\n`)
  }
  if (closure.digest('hex') !== source.linuxSourceDependencyClosureSha256) fail()
  return source
}

function validatePackage(value) {
  const entry = exact(value, [
    'name', 'version', 'url', 'sri', 'bytes', 'sha256', 'os', 'cpu',
  ])
  if (
    typeof entry.name !== 'string'
    || !/^(?:@[a-z0-9._~-]+\/[a-z0-9._~-]+|[a-z0-9._~-]+)$/u.test(entry.name)
    || typeof entry.version !== 'string'
    || !/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/u.test(entry.version)
    || typeof entry.url !== 'string'
    || !entry.url.startsWith('https://registry.npmjs.org/')
    || entry.url.includes('?')
    || entry.url.includes('#')
    || typeof entry.sri !== 'string'
    || !SRI512.test(entry.sri)
    || !Array.isArray(entry.os)
    || !Array.isArray(entry.cpu)
    || entry.os.some(item => typeof item !== 'string')
    || entry.cpu.some(item => typeof item !== 'string')
  ) fail()
  integer(entry.bytes, 64 * 1024 * 1024)
  hex(entry.sha256, HEX64)
  let parsed
  try { parsed = new URL(entry.url) } catch { fail() }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'registry.npmjs.org'
    || parsed.port !== ''
    || parsed.username !== ''
    || parsed.password !== ''
  ) fail()
  return entry
}

function validateCacheEvidence(value, realm, source) {
  const cache = exact(value, [
    'realm', 'sourceCommit', 'sourceTree', 'storePath', 'closureRecordPath',
    'historicalDependencyClosureSha256', 'linuxSourceDependencyClosureSha256',
    'linuxCacheClosureSha256', 'cacheInventoryDomain',
    'containsLinuxX64Esbuild', 'packages',
  ])
  if (
    cache.realm !== realm
    || cache.sourceCommit !== source.sourceCommit
    || cache.sourceTree !== source.sourceTree
    || cache.storePath !== `pnpm-store/${realm}`
    || cache.closureRecordPath !== source.dependencyClosureRecordPath
    || cache.historicalDependencyClosureSha256
      !== source.historicalDependencyClosureSha256
    || cache.linuxSourceDependencyClosureSha256
      !== source.linuxSourceDependencyClosureSha256
    || cache.cacheInventoryDomain
      !== `warpkeep.release-recovery.linux-dependency-cache.${realm}.v1`
    || cache.containsLinuxX64Esbuild !== true
    || !Array.isArray(cache.packages)
    || cache.packages.length < 1
    || cache.packages.length > 10_000
  ) fail()
  hex(cache.linuxCacheClosureSha256, HEX64)
  let previous = Buffer.alloc(0)
  let esbuild = false
  for (const raw of cache.packages) {
    const entry = validatePackage(raw)
    const coordinate = Buffer.from(`${entry.name}@${entry.version}`, 'utf8')
    if (coordinate.compare(previous) <= 0) fail()
    previous = coordinate
    if (
      entry.name === '@esbuild/linux-x64'
      && entry.os.includes('linux')
      && entry.cpu.includes('x64')
    ) esbuild = true
  }
  if (!esbuild) fail()
  return cache
}

function compareVerifiedArtifact(value, policyValue, keys) {
  for (const key of keys) if (!sameJson(value[key], policyValue[key])) fail()
}

function validateSystemToolEvidence(value, policy) {
  const tools = exact(value, ['git', 'gpg', 'gpgv', 'unshare', 'ip'])
  for (const name of Object.keys(SYSTEM_TOOL_EXPECTATIONS)) {
    const tool = exact(tools[name], [
      'package', 'version', 'path', 'sha256', 'installedBytes',
      'installedMode', 'installedVerified',
    ])
    compareVerifiedArtifact(tool, policy[name], Object.keys(policy[name]))
    integer(tool.installedBytes, 64 * 1024 * 1024)
    if (tool.installedMode !== '755' || tool.installedVerified !== true) fail()
  }
  return tools
}

function validateSourceObjectExport(value, policy, sources) {
  const exported = exact(value, [
    'profile', 'repositoryPath', 'objectFormat', 'objectInventoryDomain',
    'objectInventoryRecordPath', 'objectCount', 'objectBytes',
    'objectClosureSha256', 'exactObjectsVerified', 'sources',
  ])
  if (
    exported.profile !== 'warpkeep-release-recovery-source-object-export-v1'
    || exported.repositoryPath !== 'source-caches/repository.git'
    || exported.objectFormat !== 'sha1'
    || exported.objectInventoryDomain
      !== 'warpkeep.release-recovery.source-object-export.v1'
    || exported.objectInventoryRecordPath
      !== 'source-caches/repository-object-inventory-v1.json'
    || exported.exactObjectsVerified !== true
  ) fail()
  integer(exported.objectCount, 100_000)
  integer(exported.objectBytes, 512 * 1024 * 1024)
  hex(exported.objectClosureSha256, HEX64)
  const coordinates = exact(exported.sources, REALMS)
  const g001 = exact(coordinates.g001, [
    'sourceCommit', 'sourceTree', 'preparationCommit', 'preparationTree',
  ])
  if (
    g001.sourceCommit !== sources.g001.sourceCommit
    || g001.sourceTree !== sources.g001.sourceTree
    || g001.preparationCommit !== policy.sourceRules.g001.preparationCommit
    || g001.preparationTree !== policy.sourceRules.g001.preparationTree
  ) fail()
  for (const realm of ['g002', 'ptr']) {
    const source = exact(coordinates[realm], ['sourceCommit', 'sourceTree'])
    if (
      source.sourceCommit !== sources[realm].sourceCommit
      || source.sourceTree !== sources[realm].sourceTree
    ) fail()
  }
  return exported
}

export function validateToolchainEvidence(value, parsedPolicy, sourceCoordinates) {
  const parsed = exact(parsedPolicy, ['policy', 'sha256'])
  const policy = validateToolchainSourcePolicy(parsed.policy)
  hex(parsed.sha256, HEX64)
  const expectedSources = validateSourceCoordinates(sourceCoordinates)
  const manifest = exact(value, [
    'schemaVersion', 'profile', 'platform', 'architecture', 'distribution',
    'recoveryBuildProfile', 'sourcePolicySha256', 'hostGuest', 'programs',
    'nodeReleases', 'pnpm', 'spacetime', 'systemTools', 'sourceObjectExport',
    'sources', 'dependencyCaches', 'signaturesVerified', 'offlineReady',
  ])
  if (
    manifest.schemaVersion !== 1
    || manifest.profile !== 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1'
    || manifest.platform !== 'linux'
    || manifest.architecture !== 'x64'
    || manifest.distribution !== 'WarpkeepRunner'
    || manifest.recoveryBuildProfile !== policy.recoveryBuildProfile
    || manifest.sourcePolicySha256 !== parsed.sha256
    || manifest.signaturesVerified !== true
    || manifest.offlineReady !== true
  ) fail()
  const hostGuest = exact(manifest.hostGuest, [
    ...Object.keys(policy.hostGuest), 'platformVerified',
  ])
  compareVerifiedArtifact(hostGuest, policy.hostGuest, Object.keys(policy.hostGuest))
  if (hostGuest.platformVerified !== true) fail()
  const programs = exact(manifest.programs, [
    'bootstrapProgramBytes', 'bootstrapProgramSha256',
    'materializerProgramBytes', 'materializerProgramSha256', 'installedMode',
    'installedVerified',
  ])
  integer(programs.bootstrapProgramBytes, 16 * 1024 * 1024)
  integer(programs.materializerProgramBytes, 16 * 1024 * 1024)
  hex(programs.bootstrapProgramSha256, HEX64)
  hex(programs.materializerProgramSha256, HEX64)
  if (programs.installedMode !== '500' || programs.installedVerified !== true) fail()
  const nodes = exact(manifest.nodeReleases, ['24.19.0', '22.22.3'])
  for (const version of ['24.19.0', '22.22.3']) {
    const node = exact(nodes[version], [
      'version', 'archiveUrl', 'archiveBytes', 'archiveSha256', 'archiveMemberPath',
      'archiveMemberMode', 'archiveMemberBytes', 'archiveMemberSha256', 'shasumsUrl',
      'shasumsBytes', 'shasumsSha256', 'signatureUrl', 'signatureBytes',
      'signatureSha256', 'signingAlgorithm', 'signerFingerprint', 'publicKeyUrl',
      'publicKeyBytes', 'publicKeySha256', 'signatureVerified',
      'extractedMemberVerified',
    ])
    if (node.signatureVerified !== true || node.extractedMemberVerified !== true) fail()
    compareVerifiedArtifact(node, policy.nodeReleases[version], Object.keys(policy.nodeReleases[version]))
  }
  const pnpm = exact(manifest.pnpm, [
    'version', 'url', 'compressedBytes', 'sri', 'sha256', 'members',
    'archiveVerified', 'membersVerified',
  ])
  if (pnpm.archiveVerified !== true || pnpm.membersVerified !== true) fail()
  compareVerifiedArtifact(pnpm, policy.pnpm, Object.keys(policy.pnpm))
  const spacetime = exact(manifest.spacetime, [
    'version', 'commit', 'archiveUrl', 'archiveBytes', 'archiveSha256',
    'redirectPolicy', 'members', 'archiveVerified', 'membersVerified',
  ])
  if (spacetime.archiveVerified !== true || spacetime.membersVerified !== true) fail()
  compareVerifiedArtifact(spacetime, policy.spacetime, Object.keys(policy.spacetime))
  validateSystemToolEvidence(manifest.systemTools, policy.systemTools)
  const sources = exact(manifest.sources, REALMS)
  const caches = exact(manifest.dependencyCaches, REALMS)
  for (const realm of REALMS) {
    const source = validateSourceEvidence(sources[realm], realm, policy, expectedSources[realm])
    validateCacheEvidence(caches[realm], realm, source)
  }
  validateSourceObjectExport(manifest.sourceObjectExport, policy, expectedSources)
  return manifest
}

export function parseToolchainEvidenceBytes(bytes, parsedPolicy, sourceCoordinates) {
  return validateToolchainEvidence(canonicalJson(bytes), parsedPolicy, sourceCoordinates)
}
