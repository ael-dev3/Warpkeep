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
}))

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>()
  return {
    ...original,
    renameSync: ((source: string, target: string) => {
      filesystemFault.beforeRename?.(String(source), String(target))
      return original.renameSync(source, target)
    }) as typeof original.renameSync,
  }
})

import { createFixedFixtureOutputStore } from '../scripts/release-recovery-fixture-output-transaction.mjs'

const temporaryRoots: string[] = []

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
  })

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
