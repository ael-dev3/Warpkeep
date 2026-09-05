import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve, sep } from 'node:path'
import { mkdtempSync } from 'node:fs'

import { afterEach, describe, expect, it, vi } from 'vitest'

const filesystemFault = vi.hoisted(() => ({
  beforeRename: undefined as undefined | ((source: string, target: string) => void),
  beforeFsync: undefined as undefined | ((path: string) => void),
  descriptorPaths: new Map<number, string>(),
  events: [] as string[],
  executeRealWindowsMove: false,
  windowsNativeCalls: 0,
  actualRename: undefined as undefined | ((source: string, target: string) => void),
}))

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>()
  filesystemFault.actualRename = original.renameSync
  return {
    ...original,
    openSync: ((...args: Parameters<typeof original.openSync>) => {
      const descriptor = original.openSync(...args)
      filesystemFault.descriptorPaths.set(descriptor, String(args[0]))
      return descriptor
    }) as typeof original.openSync,
    closeSync: ((descriptor: number) => {
      try {
        return original.closeSync(descriptor)
      } finally {
        filesystemFault.descriptorPaths.delete(descriptor)
      }
    }) as typeof original.closeSync,
    fsyncSync: ((descriptor: number) => {
      const path = filesystemFault.descriptorPaths.get(descriptor)
      if (path === undefined) throw new Error('untracked test descriptor')
      filesystemFault.beforeFsync?.(path)
      const result = original.fsyncSync(descriptor)
      const status = original.lstatSync(path, { throwIfNoEntry: false })
      if (status?.isDirectory()) {
        filesystemFault.events.push(`flush-directory:${path}`)
      } else if (path.endsWith('transaction-journal-v1.ndjson')) {
        const lines = original.readFileSync(path, 'utf8').trimEnd().split('\n')
        const phase = JSON.parse(lines.at(-1)!).phase
        filesystemFault.events.push(`flush-journal:${phase}`)
      } else {
        filesystemFault.events.push(`flush-file:${path}`)
      }
      return result
    }) as typeof original.fsyncSync,
    unlinkSync: ((path: string) => {
      const result = original.unlinkSync(path)
      filesystemFault.events.push(`unlink:${path}`)
      return result
    }) as typeof original.unlinkSync,
    renameSync: ((source: string, target: string) => {
      filesystemFault.beforeRename?.(String(source), String(target))
      const result = original.renameSync(source, target)
      filesystemFault.events.push(`durable-rename:${source}->${target}`)
      return result
    }) as typeof original.renameSync,
  }
})

vi.mock('node:child_process', async importOriginal => {
  const original = await importOriginal<typeof import('node:child_process')>()
  return {
    ...original,
    spawnSync: ((...args: Parameters<typeof original.spawnSync>) => {
      const options = args[2] as { env?: NodeJS.ProcessEnv } | undefined
      const source = options?.env?.WARPKEEP_DURABLE_SOURCE
      const target = options?.env?.WARPKEEP_DURABLE_TARGET
      if (source !== undefined || target !== undefined) {
        if (source === undefined || target === undefined) throw new Error('partial durable move request')
        filesystemFault.beforeRename?.(source, target)
        if (!filesystemFault.executeRealWindowsMove) {
          if (filesystemFault.actualRename === undefined) throw new Error('missing test rename boundary')
          filesystemFault.actualRename(source, target)
          filesystemFault.events.push(`durable-rename:${source}->${target}`)
          return {
            pid: 1,
            output: [null, Buffer.alloc(0), Buffer.alloc(0)],
            stdout: Buffer.alloc(0),
            stderr: Buffer.alloc(0),
            status: 0,
            signal: null,
          } as ReturnType<typeof original.spawnSync>
        }
        filesystemFault.windowsNativeCalls += 1
        const result = original.spawnSync(...args)
        if (result.status === 0 && result.error === undefined) {
          filesystemFault.events.push(`durable-rename:${source}->${target}`)
        }
        return result
      }
      return original.spawnSync(...args)
    }) as typeof original.spawnSync,
  }
})

import { createFixedFixtureOutputStore } from '../scripts/release-recovery-fixture-output-transaction.mjs'

const temporaryRoots: string[] = []
const TRANSACTION_TEST_TIMEOUT = 60_000

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-output-transaction-test-'))
  mkdirSync(join(root, 'services', 'release-recovery'), { recursive: true })
  temporaryRoots.push(root)
  return root
}

function stageRoot(repositoryRoot: string): string {
  return join(
    repositoryRoot,
    'services',
    'release-recovery',
    '.release-recovery-fixtures-stage-v1',
  )
}

afterEach(() => {
  filesystemFault.beforeRename = undefined
  filesystemFault.beforeFsync = undefined
  filesystemFault.descriptorPaths.clear()
  filesystemFault.events.splice(0)
  filesystemFault.executeRealWindowsMove = false
  filesystemFault.windowsNativeCalls = 0
  const temporaryParent = resolve(tmpdir())
  for (const root of temporaryRoots.splice(0)) {
    const absolute = resolve(root)
    if (
      relative(temporaryParent, absolute).startsWith(`..${sep}`)
      || !basename(absolute).startsWith('warpkeep-output-transaction-test-')
    ) throw new Error('unsafe synthetic cleanup target')
    rmSync(absolute, { force: true, recursive: true })
  }
})

describe('fixed fixture output transaction', () => {
  it('executes the fixed Win32 write-through move in disposable storage', async () => {
    if (process.platform !== 'win32') return
    const repositoryRoot = temporaryRoot()
    const path = 'fixtures/manifest.json'
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    filesystemFault.executeRealWindowsMove = true
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    const transaction = await store.begin([path])

    await transaction.stage(path, new TextEncoder().encode('new\n'))
    await transaction.commit()

    expect(filesystemFault.windowsNativeCalls).toBe(1)
    expect(readFileSync(join(repositoryRoot, path), 'utf8')).toBe('new\n')
  }, TRANSACTION_TEST_TIMEOUT)

  it('flushes staged data and every installed namespace before durable COMMITTED', async () => {
    const repositoryRoot = temporaryRoot()
    const path = 'fixtures/manifest.json'
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    writeFileSync(join(repositoryRoot, path), 'old\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    const transaction = await store.begin([path])

    await transaction.stage(path, new TextEncoder().encode('new\n'))
    await transaction.commit()

    const stagedFlush = filesystemFault.events.findIndex(event =>
      event.endsWith(`${sep}0.new`),
    )
    const installMove = filesystemFault.events.findIndex(event =>
      event.includes(`${sep}0.new->`) && event.endsWith(`${sep}manifest.json`),
    )
    const committed = filesystemFault.events.indexOf('flush-journal:COMMITTED')
    const outputDirectoryFlush = filesystemFault.events.findIndex((event, index) =>
      index > installMove
      && index < committed
      && event === `flush-directory:${join(repositoryRoot, 'fixtures')}`,
    )

    expect(stagedFlush).toBeGreaterThan(-1)
    expect(installMove).toBeGreaterThan(stagedFlush)
    expect(outputDirectoryFlush).toBeGreaterThan(installMove)
    expect(committed).toBeGreaterThan(outputDirectoryFlush)
    expect(filesystemFault.events.findIndex(event =>
      event.startsWith('unlink:') && event.endsWith(`${sep}0.old`)))
      .toBeGreaterThan(committed)
    if (process.platform === 'win32') {
      expect(filesystemFault.events.some(event => event.startsWith('durable-rename:')))
        .toBe(true)
    }
  }, TRANSACTION_TEST_TIMEOUT)

  it('does not rename any output when staged-file durability fails', async () => {
    const repositoryRoot = temporaryRoot()
    const path = 'fixtures/manifest.json'
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    writeFileSync(join(repositoryRoot, path), 'old\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    const transaction = await store.begin([path])
    filesystemFault.beforeFsync = flushPath => {
      if (flushPath.endsWith(`${sep}0.new`)) throw new Error('synthetic staged fsync failure')
    }

    await expect(transaction.stage(path, new TextEncoder().encode('new\n')))
      .rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')

    expect(filesystemFault.events.some(event => event.startsWith('durable-rename:')))
      .toBe(false)
    expect(readFileSync(join(repositoryRoot, path), 'utf8')).toBe('old\n')
    filesystemFault.beforeFsync = undefined
    await transaction.rollback()
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
  })

  it('retains backup state until an uncertain COMMITTED marker can be flushed on retry', async () => {
    const repositoryRoot = temporaryRoot()
    const path = 'fixtures/manifest.json'
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    writeFileSync(join(repositoryRoot, path), 'old\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    const transaction = await store.begin([path])
    await transaction.stage(path, new TextEncoder().encode('new\n'))
    filesystemFault.beforeFsync = flushPath => {
      if (!flushPath.endsWith('transaction-journal-v1.ndjson')) return
      const lines = readFileSync(flushPath, 'utf8').trimEnd().split('\n')
      if (JSON.parse(lines.at(-1)!).phase === 'COMMITTED') {
        throw new Error('synthetic committed-marker fsync failure')
      }
    }

    await expect(transaction.commit()).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')

    expect(readFileSync(join(repositoryRoot, path), 'utf8')).toBe('new\n')
    expect(readdirSync(stageRoot(repositoryRoot))).toContain('0.old')
    expect(filesystemFault.events).not.toContain('flush-journal:COMMITTED')

    filesystemFault.beforeFsync = undefined
    const restarted = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    await restarted.recover()
    expect(readFileSync(join(repositoryRoot, path), 'utf8')).toBe('new\n')
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
    expect(filesystemFault.events).toContain('flush-journal:COMMITTED')
  }, TRANSACTION_TEST_TIMEOUT)

  it('returns success after recovery durably resolves a transient COMMITTED flush error', async () => {
    const repositoryRoot = temporaryRoot()
    const path = 'fixtures/manifest.json'
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    writeFileSync(join(repositoryRoot, path), 'old\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    const transaction = await store.begin([path])
    await transaction.stage(path, new TextEncoder().encode('new\n'))
    let interrupted = false
    filesystemFault.beforeFsync = flushPath => {
      if (interrupted || !flushPath.endsWith('transaction-journal-v1.ndjson')) return
      const lines = readFileSync(flushPath, 'utf8').trimEnd().split('\n')
      if (JSON.parse(lines.at(-1)!).phase === 'COMMITTED') {
        interrupted = true
        throw new Error('one-shot committed-marker fsync failure')
      }
    }

    await expect(transaction.commit()).resolves.toBeUndefined()

    expect(interrupted).toBe(true)
    expect(readFileSync(join(repositoryRoot, path), 'utf8')).toBe('new\n')
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
    expect(filesystemFault.events).toContain('flush-journal:COMMITTED')
  }, TRANSACTION_TEST_TIMEOUT)

  it('restores the previous complete set when an installed-directory flush fails', async () => {
    const repositoryRoot = temporaryRoot()
    const path = 'fixtures/manifest.json'
    const outputDirectory = join(repositoryRoot, 'fixtures')
    mkdirSync(outputDirectory, { recursive: true })
    writeFileSync(join(repositoryRoot, path), 'old\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths: [path] })
    const transaction = await store.begin([path])
    await transaction.stage(path, new TextEncoder().encode('new\n'))
    let interrupted = false
    filesystemFault.beforeFsync = flushPath => {
      if (
        !interrupted
        && flushPath === outputDirectory
        && filesystemFault.events.some(event =>
          event.includes(`${sep}0.new->`) && event.endsWith(`${sep}manifest.json`))
      ) {
        interrupted = true
        throw new Error('synthetic directory flush interruption')
      }
    }

    await expect(transaction.commit()).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')

    expect(interrupted).toBe(true)
    expect(readFileSync(join(repositoryRoot, path), 'utf8')).toBe('old\n')
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
    expect(filesystemFault.events).not.toContain('flush-journal:COMMITTED')
  }, TRANSACTION_TEST_TIMEOUT)

  it('commits and reads one complete fixed output set', async () => {
    const repositoryRoot = temporaryRoot()
    const paths = ['fixtures/one.json', 'fixtures/two.json']
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    writeFileSync(join(repositoryRoot, paths[0]), 'old-one\n')
    writeFileSync(join(repositoryRoot, paths[1]), 'old-two\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths })
    const transaction = await store.begin(paths)

    await transaction.stage(paths[0], new TextEncoder().encode('new-one\n'))
    await transaction.stage(paths[1], new TextEncoder().encode('new-two\n'))
    await transaction.commit()

    await expect(store.read(paths[0])).resolves.toEqual(new TextEncoder().encode('new-one\n'))
    await expect(store.read(paths[1])).resolves.toEqual(new TextEncoder().encode('new-two\n'))
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
  }, TRANSACTION_TEST_TIMEOUT)

  it('retains a durable rollback journal and backups until a failed restore can retry', async () => {
    const repositoryRoot = temporaryRoot()
    const paths = ['fixtures/one.json', 'fixtures/two.json']
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    writeFileSync(join(repositoryRoot, paths[0]), 'old-one\n')
    writeFileSync(join(repositoryRoot, paths[1]), 'old-two\n')
    const store = createFixedFixtureOutputStore({ repositoryRoot, paths })
    const transaction = await store.begin(paths)
    await transaction.stage(paths[0], new TextEncoder().encode('new-one\n'))
    await transaction.stage(paths[1], new TextEncoder().encode('new-two\n'))
    let installFailed = false
    filesystemFault.beforeRename = (source) => {
      if (!installFailed && source.endsWith('1.new')) {
        installFailed = true
        throw new Error('synthetic install interruption')
      }
      if (installFailed && source.endsWith('.old')) {
        throw new Error('synthetic restore interruption')
      }
    }

    await expect(transaction.commit()).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')

    const interruptedStage = stageRoot(repositoryRoot)
    expect(existsSync(interruptedStage)).toBe(true)
    expect(readdirSync(interruptedStage).some(name => name.endsWith('.old'))).toBe(true)
    const beforeCheck = readdirSync(interruptedStage).sort()
    await expect(store.read(paths[0])).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')
    expect(readdirSync(interruptedStage).sort()).toEqual(beforeCheck)

    filesystemFault.beforeRename = undefined
    const restarted = createFixedFixtureOutputStore({ repositoryRoot, paths })
    await restarted.recover()

    expect(readFileSync(join(repositoryRoot, paths[0]), 'utf8')).toBe('old-one\n')
    expect(readFileSync(join(repositoryRoot, paths[1]), 'utf8')).toBe('old-two\n')
    expect(existsSync(interruptedStage)).toBe(false)
  })

  it('opens and rolls back a transaction beneath ordinary repository directories', async () => {
    const repositoryRoot = temporaryRoot()
    mkdirSync(join(repositoryRoot, 'fixtures'), { recursive: true })
    const store = createFixedFixtureOutputStore({
      repositoryRoot,
      paths: ['fixtures/manifest.json'],
    })

    const transaction = await store.begin(['fixtures/manifest.json'])
    expect(existsSync(stageRoot(repositoryRoot))).toBe(true)

    await transaction.rollback()
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
  })

  it('rejects a linked output parent before staging or touching its external target', async () => {
    const repositoryRoot = temporaryRoot()
    const outside = temporaryRoot()
    symlinkSync(outside, join(repositoryRoot, 'fixtures'), process.platform === 'win32' ? 'junction' : 'dir')
    const sentinel = join(outside, 'sentinel.txt')
    writeFileSync(sentinel, 'unchanged\n', { flag: 'wx' })
    const store = createFixedFixtureOutputStore({
      repositoryRoot,
      paths: ['fixtures/manifest.json'],
    })

    await expect(store.begin(['fixtures/manifest.json']))
      .rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')

    expect(readFileSync(sentinel, 'utf8')).toBe('unchanged\n')
    expect(existsSync(join(outside, 'manifest.json'))).toBe(false)
    expect(existsSync(stageRoot(repositoryRoot))).toBe(false)
  })

  it('rejects a linked stage root without deleting external data during recovery', async () => {
    const repositoryRoot = temporaryRoot()
    const outside = temporaryRoot()
    const sentinel = join(outside, 'sentinel.txt')
    writeFileSync(sentinel, 'unchanged\n', { flag: 'wx' })
    symlinkSync(
      outside,
      stageRoot(repositoryRoot),
      process.platform === 'win32' ? 'junction' : 'dir',
    )
    const store = createFixedFixtureOutputStore({
      repositoryRoot,
      paths: ['fixtures/manifest.json'],
    })

    await expect(store.recover()).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')

    expect(readFileSync(sentinel, 'utf8')).toBe('unchanged\n')
  })
})
