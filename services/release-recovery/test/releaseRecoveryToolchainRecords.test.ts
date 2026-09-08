import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const digest = (value: string): string => createHash('sha256').update(value).digest('hex')
const h = (character: string): string => character.repeat(64)

function sourcePolicy(): Record<string, unknown> {
  const node = (version: string, algorithm: string, fingerprint: string, keyBytes: number,
    keySha256: string, archiveSha256: string) => ({
    version,
    archiveUrl: `https://nodejs.org/dist/v${version}/node-v${version}-linux-x64.tar.xz`,
    archiveBytes: 10_000,
    archiveSha256,
    archiveMemberPath: `node-v${version}-linux-x64/bin/node`,
    archiveMemberMode: '755',
    archiveMemberBytes: 9_000,
    archiveMemberSha256: h(version.startsWith('24') ? '1' : '2'),
    shasumsUrl: `https://nodejs.org/dist/v${version}/SHASUMS256.txt`,
    shasumsBytes: 5_000,
    shasumsSha256: h(version.startsWith('24') ? '3' : '4'),
    signatureUrl: `https://nodejs.org/dist/v${version}/SHASUMS256.txt.sig`,
    signatureBytes: 1_000,
    signatureSha256: h(version.startsWith('24') ? '5' : '6'),
    signingAlgorithm: algorithm,
    signerFingerprint: fingerprint,
    publicKeyUrl: `https://raw.githubusercontent.com/nodejs/release-keys/5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/${fingerprint}.asc`,
    publicKeyBytes: keyBytes,
    publicKeySha256: keySha256,
  })
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-toolchain-source-policy-v1',
    distribution: 'WarpkeepRunner',
    platform: 'linux',
    architecture: 'x64',
    recoveryBuildProfile: 'warpkeep-release-recovery-cross-platform-program-build-v1',
    hostGuest: {
      wslExecutable: String.raw`C:\Windows\System32\wsl.exe`,
      wslExecutableBytes: 274_432,
      wslExecutableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2',
      wslFileVersion: '10.0.26100.8737',
      wslProductVersion: '10.0.26100.8737',
      wslVersion: '2.7.11.0',
      guestOsReleaseBytes: 400,
      guestOsReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829',
      guestKernelReleaseBytes: 34,
      guestKernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92',
    },
    nodeReleases: {
      '24.19.0': node(
        '24.19.0',
        'EdDSA',
        '5BE8A3F6C8A5C01D106C0AD820B1A390B168D356',
        924,
        '5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a',
        '14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647',
      ),
      '22.22.3': node(
        '22.22.3',
        'RSA',
        'CC68F5A3106FF448322E48ED27F5E38D5B0A215F',
        3_163,
        'e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27',
        '2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f',
      ),
    },
    pnpm: {
      version: '11.7.0',
      url: 'https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz',
      compressedBytes: 4_590_455,
      sri: 'sha512-GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA==',
      sha256: 'deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee',
      members: {
        'package/bin/pnpm.mjs': { mode: '755', bytes: 1_464, sha256: 'ff3224d46b47fbb24a7e9fe15fededef7e00892d07d4e376b6762d4899906bfd' },
        'package/dist/pnpm.mjs': { mode: '644', bytes: 12_565_169, sha256: 'd3a7f4bde2f32c5acc5f012d1edc24c24ea247c2f6c8823146f8cd69ed70b22f' },
        'package/package.json': { mode: '644', bytes: 2_216, sha256: '2b20455ee8d69d072df339bf9851edea94ee08a9ea14db9289a7fca0bbb7abb0' },
      },
    },
    spacetime: {
      version: '2.6.1',
      commit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
      archiveUrl: 'https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.6.1/spacetime-x86_64-unknown-linux-gnu.tar.gz',
      archiveBytes: 57_464_969,
      archiveSha256: 'cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118',
      redirectPolicy: 'github-release-one-hop-headerless',
      members: {
        'spacetimedb-cli': { mode: '755', bytes: 47_905_552, sha256: 'cac13c929049f31cb588c230a0d7fe5f388505b4c64047a68b1d5cfdc811624b' },
        'spacetimedb-standalone': { mode: '755', bytes: 130_219_584, sha256: 'a9185a737c9b739896c8f51326e1c3aedefba80a0f01def76ce26f358d5c187b' },
      },
    },
    systemTools: {
      git: { package: 'git', version: '1:2.43.0-1ubuntu7.3', path: '/usr/bin/git', sha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668' },
      gpg: { package: 'gpg', version: '2.4.4-2ubuntu17.6', path: '/usr/bin/gpg', sha256: '403e04c779ad9fab3895c405f8c53d35ab59fa8e3b8bbe3437f61bc41f468dd4' },
      gpgv: { package: 'gpgv', version: '2.4.4-2ubuntu17.6', path: '/usr/bin/gpgv', sha256: 'f14d026b9eae172c432e015bce227483293b4966f2f3fdcfa582f71d3dbb2ae8' },
      unshare: { package: 'util-linux', version: '2.39.3-9ubuntu6.6', path: '/usr/bin/unshare', sha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c' },
      ip: { package: 'iproute2', version: '6.1.0-1ubuntu6.2', path: '/usr/sbin/ip', sha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0' },
    },
    sourceRules: {
      g001: {
        sourceCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b',
        sourceTree: '90deebb5faf4129282f5c35999244f540001b27d',
        modulePath: 'spacetimedb',
        importer: 'warpkeep-spacetimedb-module',
        nodeVersion: '24.19.0',
        dependencyPaths: ['spacetimedb/package.json', 'spacetimedb/pnpm-lock.yaml', 'spacetimedb/pnpm-workspace.yaml'],
        dependencyBlobs: ['faf7214653f1248a3f9231fd6a13dda130821014', '649efdebd25528f593aff612ca8aef6f761d1e94', 'a640febaa07fad295f2de4b4416b7a22910eb2e6'],
        preparationCommit: 'd945256b217fa13ade944b9ed9880e8463b46123',
        preparationTree: '8c2b0b0eda17cefc212f08716a287c44b0e84d48',
        preparationManifestPath: 'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json',
        preparationManifestBlob: '768efb5147661671ad558e03fec191a96d81efe1',
        preparationManifestBytes: 201_077,
        preparationManifestSha256: '38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251',
        materializerPath: 'scripts/genesis001-frozen-materializer.mjs',
        materializerBlob: 'c50182e99ed2e2fab1ca994c905818d383782cfc',
        materializerSha256: 'a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93',
      },
      g002: {
        modulePath: 'spacetimedb/genesis002',
        workspacePath: 'spacetimedb',
        lockImporter: 'genesis002',
        packageName: 'warpkeep-genesis-002-spacetimedb-module',
        nodeVersion: '22.22.3',
        dependencyPaths: ['spacetimedb/package.json', 'spacetimedb/pnpm-workspace.yaml', 'spacetimedb/pnpm-lock.yaml', 'spacetimedb/genesis002/package.json'],
      },
      ptr: {
        modulePath: 'spacetimedb/ptr',
        importer: 'warpkeep-ptr-spacetimedb-module',
        nodeVersion: '22.22.3',
        dependencyPaths: ['spacetimedb/ptr/package.json', 'spacetimedb/ptr/pnpm-lock.yaml'],
      },
    },
    packageFetchPolicy: 'canonical-registry-no-redirect-no-credential',
    lifecycleScripts: false,
    noClobber: true,
  }
}

function sourceClosure(realm: string): string {
  const hash = createHash('sha256')
  hash.update(`warpkeep.release-recovery.source-dependencies.${realm}.v1\n`)
  for (const file of [...dependencyFiles(realm)].sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)))) {
    hash.update(`${file.path}\0${file.blob}\0${file.bytes}\0${file.sha256}\n`)
  }
  return hash.digest('hex')
}

function sources() {
  return {
    g001: { sourceCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b', sourceTree: '90deebb5faf4129282f5c35999244f540001b27d', historicalDependencyClosureSha256: null },
    g002: { sourceCommit: '8'.repeat(40), sourceTree: '9'.repeat(40), historicalDependencyClosureSha256: h('a') },
    ptr: { sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40), historicalDependencyClosureSha256: h('b') },
  }
}

function dependencyFiles(realm: string) {
  const paths = realm === 'g001'
    ? ['spacetimedb/package.json', 'spacetimedb/pnpm-lock.yaml', 'spacetimedb/pnpm-workspace.yaml']
    : realm === 'g002'
      ? ['spacetimedb/package.json', 'spacetimedb/pnpm-workspace.yaml', 'spacetimedb/pnpm-lock.yaml', 'spacetimedb/genesis002/package.json']
      : ['spacetimedb/ptr/package.json', 'spacetimedb/ptr/pnpm-lock.yaml']
  const fixedG001Blobs = [
    'faf7214653f1248a3f9231fd6a13dda130821014',
    '649efdebd25528f593aff612ca8aef6f761d1e94',
    'a640febaa07fad295f2de4b4416b7a22910eb2e6',
  ]
  return paths.map((path, index) => ({
    path,
    blob: realm === 'g001' ? fixedG001Blobs[index]! : (index + (realm === 'g002' ? 3 : 8)).toString(16).repeat(40).slice(0, 40),
    bytes: 100 + index,
    sha256: digest(`${realm}:${path}`),
  }))
}

function evidence(policy: any, policySha256: string): Record<string, unknown> {
  const sourceRecords = Object.fromEntries(Object.entries(sources()).map(([realm, source]: any) => [realm, {
    realm,
    ...source,
    linuxSourceDependencyClosureSha256: sourceClosure(realm),
    dependencyInventoryDomain: `warpkeep.release-recovery.source-dependencies.${realm}.v1`,
    dependencyClosureRecordPath: `source-caches/${realm}-linux-source-dependency-closure-sha256.txt`,
    dependencyFiles: dependencyFiles(realm),
  }]))
  const dependencyCaches = Object.fromEntries(Object.entries(sources()).map(([realm, source]: any) => [realm, {
    realm,
    sourceCommit: source.sourceCommit,
    sourceTree: source.sourceTree,
    storePath: `pnpm-store/${realm}`,
    closureRecordPath: `source-caches/${realm}-linux-source-dependency-closure-sha256.txt`,
    historicalDependencyClosureSha256: source.historicalDependencyClosureSha256,
    linuxSourceDependencyClosureSha256: sourceClosure(realm),
    linuxCacheClosureSha256: h(realm === 'g001' ? '4' : realm === 'g002' ? '5' : '6'),
    cacheInventoryDomain: `warpkeep.release-recovery.linux-dependency-cache.${realm}.v1`,
    containsLinuxX64Esbuild: true,
    packages: [{
      name: '@esbuild/linux-x64',
      version: '0.25.0',
      url: 'https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.0.tgz',
      sri: `sha512-${Buffer.alloc(64, realm.charCodeAt(0)).toString('base64')}`,
      bytes: 1_000,
      sha256: h(realm === 'g001' ? 'd' : realm === 'g002' ? 'e' : 'f'),
      os: ['linux'],
      cpu: ['x64'],
    }],
  }]))
  const verifiedNodes = Object.fromEntries(Object.entries(policy.nodeReleases).map(([version, value]: any) => [version, {
    ...value,
    signatureVerified: true,
    extractedMemberVerified: true,
  }]))
  const verifiedSystemTools = Object.fromEntries(Object.entries(policy.systemTools).map(([name, value]: any, index) => [name, {
    ...value,
    installedBytes: 1_000 + index,
    installedMode: '755',
    installedVerified: true,
  }]))
  return {
    schemaVersion: 1,
    profile: 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1',
    platform: 'linux',
    architecture: 'x64',
    distribution: 'WarpkeepRunner',
    recoveryBuildProfile: policy.recoveryBuildProfile,
    sourcePolicySha256: policySha256,
    hostGuest: { ...policy.hostGuest, platformVerified: true },
    programs: {
      bootstrapProgramBytes: 12_345,
      bootstrapProgramSha256: h('7'),
      materializerProgramBytes: 23_456,
      materializerProgramSha256: h('8'),
      installedMode: '500',
      installedVerified: true,
    },
    nodeReleases: verifiedNodes,
    pnpm: { ...policy.pnpm, archiveVerified: true, membersVerified: true },
    spacetime: { ...policy.spacetime, archiveVerified: true, membersVerified: true },
    systemTools: verifiedSystemTools,
    sourceObjectExport: {
      profile: 'warpkeep-release-recovery-source-object-export-v1',
      repositoryPath: 'source-caches/repository.git',
      objectFormat: 'sha1',
      objectInventoryDomain: 'warpkeep.release-recovery.source-object-export.v1',
      objectInventoryRecordPath: 'source-caches/repository-object-inventory-v1.json',
      objectCount: 7,
      objectBytes: 70_000,
      objectClosureSha256: h('9'),
      exactObjectsVerified: true,
      sources: {
        g001: {
          sourceCommit: (sources() as any).g001.sourceCommit,
          sourceTree: (sources() as any).g001.sourceTree,
          preparationCommit: policy.sourceRules.g001.preparationCommit,
          preparationTree: policy.sourceRules.g001.preparationTree,
        },
        g002: {
          sourceCommit: (sources() as any).g002.sourceCommit,
          sourceTree: (sources() as any).g002.sourceTree,
        },
        ptr: {
          sourceCommit: (sources() as any).ptr.sourceCommit,
          sourceTree: (sources() as any).ptr.sourceTree,
        },
      },
    },
    sources: sourceRecords,
    dependencyCaches,
    signaturesVerified: true,
    offlineReady: true,
  }
}

function materializerCatalogEntries(manifest: any): Map<string, Record<string, unknown>> {
  const entry = (path: string, mode: '400' | '500', bytes: number, sha256: string) => ({
    path,
    type: 'file',
    mode,
    bytes,
    sha256,
  })
  const result = new Map<string, Record<string, unknown>>()
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest)}\n`)
  result.set('toolchains/linux-x64.json', entry(
    'toolchains/linux-x64.json',
    '400',
    manifestBytes.byteLength,
    digest(manifestBytes.toString()),
  ))
  for (const version of ['24.19.0', '22.22.3']) {
    const release = manifest.nodeReleases[version]
    const path = `toolchains/node-v${version}-linux-x64/bin/node`
    result.set(path, entry(path, '500', release.archiveMemberBytes, release.archiveMemberSha256))
    for (const [name, bytes, sha256] of [
      ['release-key.asc', release.publicKeyBytes, release.publicKeySha256],
      ['SHASUMS256.txt', release.shasumsBytes, release.shasumsSha256],
      ['SHASUMS256.txt.sig', release.signatureBytes, release.signatureSha256],
    ] as const) {
      const evidencePath = `source-caches/public-provenance/node-v${version}/${name}`
      result.set(evidencePath, entry(evidencePath, '400', bytes, sha256))
    }
  }
  for (const [memberPath, member] of Object.entries(manifest.pnpm.members) as Array<[
    string,
    { bytes: number, sha256: string },
  ]>) {
    const path = `toolchains/pnpm-11.7.0/${memberPath}`
    result.set(path, entry(path, memberPath === 'package/bin/pnpm.mjs' ? '500' : '400',
      member.bytes, member.sha256))
  }
  for (const [memberPath, member] of Object.entries(manifest.spacetime.members) as Array<[
    string,
    { bytes: number, sha256: string },
  ]>) {
    const installedName = memberPath === 'spacetimedb-cli' ? 'spacetime' : memberPath
    const path = `toolchains/spacetime-2.6.1/${installedName}`
    result.set(path, entry(path, '500', member.bytes, member.sha256))
  }
  for (const realm of ['g001', 'g002', 'ptr']) {
    const path = `source-caches/${realm}-linux-source-dependency-closure-sha256.txt`
    const bytes = Buffer.from(`${manifest.sources[realm].linuxSourceDependencyClosureSha256}\n`, 'ascii')
    result.set(path, entry(path, '400', bytes.byteLength, digest(bytes.toString('ascii'))))
  }
  for (const [path, content] of [
    ['source-caches/repository.git/HEAD', 'ref: refs/heads/never\n'],
    ['source-caches/repository.git/config', '[core]\n\trepositoryformatversion = 0\n\tbare = true\n'],
  ]) {
    const bytes = Buffer.from(content, 'ascii')
    result.set(path, entry(path, '400', bytes.byteLength, digest(bytes.toString('ascii'))))
  }
  return result
}

describe('release recovery full toolchain records', () => {
  it('requires the verified GPG package and executable pair without accepting old or mixed tuples', async () => {
    const records = await import('../scripts/release-recovery-toolchain-records.mjs') as any
    const current = sourcePolicy()
    expect(() => records.parseToolchainSourcePolicyBytes(Buffer.from(`${JSON.stringify(current)}\n`))).not.toThrow()
    for (const [tool, oldHash] of [
      ['gpg', '7ecb1341104b0ee1107fe908abce37e24546de1db0848b29c75f59f72094f4e8'],
      ['gpgv', '097b577cdf8b51dcc1fb42417d5ef3ca2e22b36a8ad16c9df4bd083a38fe476c'],
    ]) {
      for (const change of [{ version: '2.4.4-2ubuntu17.4' }, { sha256: oldHash },
        { version: '2.4.4-2ubuntu17.4', sha256: oldHash }]) {
        const changed = structuredClone(current)
        const tools = changed.systemTools as Record<string, Record<string, unknown>>
        tools[tool!] = { ...tools[tool!], ...change }
        expect(() => records.parseToolchainSourcePolicyBytes(Buffer.from(`${JSON.stringify(changed)}\n`))).toThrow()
      }
    }
  })

  it('refuses old-distribution policies and manifests instead of reinterpreting historical evidence', async () => {
    const records = await import('../scripts/release-recovery-toolchain-records.mjs') as any
    const policy = sourcePolicy()
    expect(policy.distribution).toBe('WarpkeepRunner')
    const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`)
    const parsed = records.parseToolchainSourcePolicyBytes(policyBytes)
    expect(() => records.parseToolchainSourcePolicyBytes(Buffer.from(JSON.stringify({ ...policy, distribution: 'Ubuntu-24.04' }))))
      .toThrow()
    const manifest = evidence(policy, digest(policyBytes.toString()))
    expect(records.validateToolchainEvidence(manifest, parsed, sources())).toEqual(manifest)
    expect(() => records.validateToolchainEvidence({ ...manifest, distribution: 'Ubuntu-24.04' }, parsed, sources()))
      .toThrow()
  })

  it('strictly accepts complete source policy and acyclic full evidence', async () => {
    const records = await import('../scripts/release-recovery-toolchain-records.mjs') as any
    const policy = sourcePolicy()
    const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`)
    const parsed = records.parseToolchainSourcePolicyBytes(policyBytes)
    const manifest = evidence(policy, digest(policyBytes.toString()))

    expect(records.validateToolchainEvidence(manifest, parsed, sources()))
      .toEqual(manifest)
    expect(Object.keys(manifest)).not.toContain('cacheCatalogSha256')
  })

  it('binds every executed cached tool and closure record to fixed manifest evidence', async () => {
    const records = await import('../scripts/release-recovery-toolchain-records.mjs') as any
    const materializer = await import('../scripts/release-recovery-wsl-materialize.mjs') as any
    const policyBytes = readFileSync(new URL(
      '../scripts/release-recovery-wsl-toolchain-source-policy-v1.json',
      import.meta.url,
    ))
    const policy = JSON.parse(policyBytes.toString('utf8'))
    const parsed = records.parseToolchainSourcePolicyBytes(policyBytes)
    const manifest = evidence(policy, parsed.sha256) as any
    const entries = materializerCatalogEntries(manifest)
    const toolchain = { sourcePolicySha256: parsed.sha256, ...manifest.programs }
    const realms = {
      g001: {
        baselineCommit: (sources() as any).g001.sourceCommit,
        baselineTree: (sources() as any).g001.sourceTree,
      },
      g002: (sources() as any).g002,
      ptr: (sources() as any).ptr,
    }

    expect(materializer.validateToolchainManifestBytes(
      Buffer.from(`${JSON.stringify(manifest)}\n`),
      toolchain,
      realms,
      entries,
    )).toEqual(manifest)

    for (const [path, original] of entries) {
      const substituted = new Map(entries)
      substituted.set(path, { ...original, sha256: h('f') })
      expect(() => materializer.validateToolchainManifestBytes(
        Buffer.from(`${JSON.stringify(manifest)}\n`),
        toolchain,
        realms,
        substituted,
      ), path).toThrow()
    }

    const coordinated = structuredClone(manifest)
    coordinated.nodeReleases['22.22.3'].archiveMemberSha256 = h('f')
    expect(() => materializer.validateToolchainManifestBytes(
      Buffer.from(`${JSON.stringify(coordinated)}\n`),
      toolchain,
      realms,
      materializerCatalogEntries(coordinated),
    )).toThrow()
  })

  it('requires platform, fixed-program, preparation, and exact object-export evidence', async () => {
    const records = await import('../scripts/release-recovery-toolchain-records.mjs') as any
    const policy = sourcePolicy()
    const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`)
    const parsed = records.parseToolchainSourcePolicyBytes(policyBytes)
    const complete = evidence(policy, digest(policyBytes.toString())) as any

    for (const field of ['hostGuest', 'programs', 'sourceObjectExport']) {
      const missing = structuredClone(complete)
      delete missing[field]
      expect(() => records.validateToolchainEvidence(missing, parsed, sources())).toThrow()
    }
    const substituted = structuredClone(complete)
    substituted.sourceObjectExport.sources.g001.preparationCommit = 'f'.repeat(40)
    expect(() => records.validateToolchainEvidence(substituted, parsed, sources())).toThrow()
  })

  it('rejects the old versions-only manifest and cross-realm cache substitution', async () => {
    const records = await import('../scripts/release-recovery-toolchain-records.mjs') as any
    const policy = sourcePolicy()
    const policyBytes = Buffer.from(`${JSON.stringify(policy)}\n`)
    const parsed = records.parseToolchainSourcePolicyBytes(policyBytes)
    const complete = evidence(policy, digest(policyBytes.toString())) as any
    const old = {
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-linux-x64-toolchain-v1',
      platform: 'linux',
      architecture: 'x64',
      nodeVersions: ['24.19.0', '22.22.3'],
      pnpmVersion: '11.7.0',
      spacetimeVersion: '2.6.1',
      gitPackageVersion: '1:2.43.0-1ubuntu7.3',
      wslVersion: '2.7.11.0',
    }
    expect(() => records.validateToolchainEvidence(old, parsed, sources())).toThrow()

    complete.dependencyCaches.g002.sourceCommit = complete.sources.ptr.sourceCommit
    expect(() => records.validateToolchainEvidence(complete, parsed, sources())).toThrow()
  })
})
