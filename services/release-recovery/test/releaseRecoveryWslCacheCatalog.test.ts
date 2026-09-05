import { createHash } from 'node:crypto'
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

const cacheBoundary = vi.hoisted(() => ({
  root: '',
  modes: new Map<string, number>(),
  fixedRoot: '/var/lib/warpkeep/release-recovery-v1',
}))

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>()
  const path = await import('node:path')
  const translate = (value: unknown) => {
    if (typeof value !== 'string' || !value.startsWith(cacheBoundary.fixedRoot)) return value
    const suffix = value.slice(cacheBoundary.fixedRoot.length).replace(/^\//u, '')
    return path.join(cacheBoundary.root, ...suffix.split('/').filter(Boolean))
  }
  const relativeCachePath = (value: string) => (
    value.slice(cacheBoundary.fixedRoot.length).replace(/^\//u, '')
  )
  const mockedRealpath = ((value: unknown, ...args: unknown[]) => (
    (original.realpathSync as (...values: unknown[]) => unknown)(translate(value), ...args)
  )) as typeof original.realpathSync
  mockedRealpath.native = ((value: unknown, ...args: unknown[]) => {
    const translated = translate(value)
    const actual = (original.realpathSync.native as (...values: unknown[]) => unknown)(
      translated,
      ...args,
    )
    if (typeof value !== 'string' || !value.startsWith(cacheBoundary.fixedRoot)) return actual
    return String(actual).toLowerCase() === resolve(String(translated)).toLowerCase()
      ? value
      : actual
  }) as typeof original.realpathSync.native
  return {
    ...original,
    lstatSync: ((value: unknown, ...args: unknown[]) => {
      const stat = (original.lstatSync as (...values: unknown[]) => any)(translate(value), ...args)
      if (
        stat === undefined
        || typeof value !== 'string'
        || !value.startsWith(cacheBoundary.fixedRoot)
      ) return stat
      const mode = cacheBoundary.modes.get(relativeCachePath(value))
      if (mode === undefined) return stat
      return new Proxy(stat, {
        get(target, property, receiver) {
          if (property === 'uid' || property === 'gid') return 0
          if (property === 'mode') return (target.mode & ~0o777) | mode
          return Reflect.get(target, property, receiver)
        },
      })
    }) as typeof original.lstatSync,
    readFileSync: ((value: unknown, ...args: unknown[]) => (
      (original.readFileSync as (...values: unknown[]) => unknown)(translate(value), ...args)
    )) as typeof original.readFileSync,
    readdirSync: ((value: unknown, ...args: unknown[]) => (
      (original.readdirSync as (...values: unknown[]) => unknown)(translate(value), ...args)
    )) as typeof original.readdirSync,
    realpathSync: mockedRealpath,
  }
})

const temporaryRoots: string[] = []

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-cache-catalog-test-'))
  temporaryRoots.push(root)
  return root
}

afterEach(() => {
  cacheBoundary.root = ''
  cacheBoundary.modes.clear()
  const temporaryParent = resolve(tmpdir())
  for (const root of temporaryRoots.splice(0)) {
    const absolute = resolve(root)
    if (
      relative(temporaryParent, absolute).startsWith(`..${sep}`)
      || !basename(absolute).startsWith('warpkeep-cache-catalog-test-')
    ) throw new Error('unsafe synthetic cleanup target')
    rmSync(absolute, { force: true, recursive: true })
  }
})

type DirectoryEntry = Readonly<{ path: string, type: 'directory', mode: string }>
type FileEntry = Readonly<{
  path: string
  type: 'file'
  mode: string
  bytes: number
  sha256: string
}>
type Entry = DirectoryEntry | FileEntry

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function cacheClosure(entries: readonly Entry[]): string {
  const hash = createHash('sha256')
  hash.update('warpkeep.release-recovery.wsl-cache-catalog-closure.v2\n')
  for (const entry of entries) {
    hash.update(entry.type === 'directory'
      ? `directory\0${entry.path}\0${entry.mode}\n`
      : `file\0${entry.path}\0${entry.bytes}\0${entry.sha256}\0${entry.mode}\n`)
  }
  return hash.digest('hex')
}

function installFile(root: string, path: string, text: string, mode: number): FileEntry {
  const target = join(root, ...path.split('/'))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, text, { flag: 'wx' })
  chmodSync(target, mode)
  cacheBoundary.modes.set(path, mode)
  const bytes = readFileSync(target)
  return { path, type: 'file', mode: mode.toString(8), bytes: bytes.byteLength, sha256: digest(bytes) }
}

function inventoryDirectories(root: string, files: readonly FileEntry[]): DirectoryEntry[] {
  const paths = new Set<string>()
  for (const file of files) {
    const components = file.path.split('/')
    for (let index = 1; index < components.length; index += 1) {
      paths.add(components.slice(0, index).join('/'))
    }
  }
  return [...paths].map(path => {
    chmodSync(join(root, ...path.split('/')), 0o700)
    cacheBoundary.modes.set(path, 0o700)
    return { path, type: 'directory' as const, mode: '700' }
  })
}

describe('release recovery WSL v2 cache catalog', () => {
  it('accepts its exact complete tree and rejects one uncatalogued repository file', async () => {
    const root = temporaryRoot()
    cacheBoundary.root = root
    const manifest = installFile(root, 'toolchains/linux-x64.json', '{"synthetic":true}\n', 0o400)
    const files = [
      manifest,
      installFile(root, 'toolchains/node-v24.19.0-linux-x64/bin/node', 'node24\n', 0o500),
      installFile(root, 'toolchains/node-v22.22.3-linux-x64/bin/node', 'node22\n', 0o500),
      installFile(root, 'toolchains/pnpm-11.7.0/package/bin/pnpm.mjs', 'pnpm\n', 0o500),
      installFile(root, 'toolchains/spacetime-2.6.1/spacetime', 'spacetime\n', 0o500),
      installFile(root, 'toolchains/spacetime-2.6.1/spacetimedb-standalone', 'standalone\n', 0o500),
      installFile(root, 'source-caches/g001-linux-source-dependency-closure-sha256.txt', `${'1'.repeat(64)}\n`, 0o400),
      installFile(root, 'source-caches/g002-linux-source-dependency-closure-sha256.txt', `${'2'.repeat(64)}\n`, 0o400),
      installFile(root, 'source-caches/ptr-linux-source-dependency-closure-sha256.txt', `${'3'.repeat(64)}\n`, 0o400),
      installFile(root, 'source-caches/repository.git/objects/aa/object', 'git-object\n', 0o400),
      installFile(root, 'pnpm-store/g001/files/a', 'g001-package\n', 0o400),
      installFile(root, 'pnpm-store/g002/files/a', 'g002-package\n', 0o400),
      installFile(root, 'pnpm-store/ptr/files/a', 'ptr-package\n', 0o400),
    ]
    const entries: Entry[] = [...inventoryDirectories(root, files), ...files]
      .sort((left, right) => Buffer.from(left.path).compare(Buffer.from(right.path)))
    const catalog = {
      schemaVersion: 2,
      profile: 'warpkeep-release-recovery-wsl-cache-catalog-v2',
      platform: 'linux',
      architecture: 'x64',
      inventoryRoots: ['pnpm-store', 'source-caches', 'toolchains'],
      manifestPath: 'toolchains/linux-x64.json',
      manifestSha256: manifest.sha256,
      cacheClosureSha256: cacheClosure(entries),
      signaturesVerified: true,
      offlineReady: true,
      entries,
    }
    const catalogBytes = Buffer.from(`${JSON.stringify(catalog)}\n`)
    const catalogPath = join(root, 'cache-catalog-v2.json')
    writeFileSync(catalogPath, catalogBytes, { flag: 'wx' })
    chmodSync(catalogPath, 0o400)
    cacheBoundary.modes.set('cache-catalog-v2.json', 0o400)
    const materializer = await import('../scripts/release-recovery-wsl-materialize.mjs') as any

    const verified = materializer.verifyCacheCatalog(digest(catalogBytes))
    expect(verified.catalog.cacheClosureSha256).toBe(catalog.cacheClosureSha256)

    cacheBoundary.modes.set('cache-catalog-v2.json', 0o600)
    expect(() => materializer.verifyCacheCatalog(digest(catalogBytes)))
      .toThrow()
    cacheBoundary.modes.set('cache-catalog-v2.json', 0o400)

    installFile(root, 'source-caches/repository.git/config', '[core]\nrepositoryformatversion = 0\n', 0o400)
    expect(() => materializer.verifyCacheCatalog(digest(catalogBytes)))
      .toThrow()
    expect(readdirSync(join(root, 'source-caches', 'repository.git'))).toContain('config')
  })
})
