import { Buffer } from 'node:buffer'

import { describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => {
  const BufferCtor = globalThis.Buffer
  const osReleasePrefix = BufferCtor.from(
    'ID=ubuntu\nVERSION_ID=24.04\nVERSION_CODENAME=noble\nPADDING=',
    'utf8',
  )
  const osRelease = BufferCtor.from(
    `${osReleasePrefix.toString('utf8')}${'x'.repeat(399 - osReleasePrefix.byteLength)}\n`,
    'utf8',
  )
  return {
    spawnSync: vi.fn(),
    wslPath: String.raw`C:\Windows\System32\wsl.exe`,
    privateRoot: String.raw`C:\Users\heyas\.warpkeep\private\release-recovery-v1`,
    wsl: BufferCtor.alloc(274_432, 0x11),
    osRelease,
    kernelRelease: BufferCtor.from('6.18.33.2-microsoft-standard-WSL2\n', 'utf8'),
    git: BufferCtor.from('synthetic-fixed-git', 'utf8'),
    unshare: BufferCtor.from('synthetic-fixed-unshare', 'utf8'),
    ip: BufferCtor.from('synthetic-fixed-ip', 'utf8'),
    privateRecord: BufferCtor.from('{"synthetic":true}\n', 'utf8'),
    closeSync: vi.fn(),
    fstatSync: vi.fn(),
    lstatSync: vi.fn(),
    openSync: vi.fn(),
    realpathNative: vi.fn(),
  }
})

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: boundary.spawnSync,
}))

// The operator is a fixed Windows host. Model that path boundary even when
// Vitest runs on Linux; unrelated real source paths retain native semantics.
vi.mock('node:path', async importOriginal => {
  const original = await importOriginal<typeof import('node:path')>()
  const windowsPath = (values: string[]) => values.some(value => /^[A-Za-z]:[\\/]/u.test(value))
  return {
    ...original,
    sep: original.win32.sep,
    resolve: (...values: string[]) => (windowsPath(values) ? original.win32 : original).resolve(...values),
    relative: (from: string, to: string) => (windowsPath([from, to]) ? original.win32 : original).relative(from, to),
    join: (...values: string[]) => (windowsPath(values) ? original.win32 : original).join(...values),
    isAbsolute: (value: string) => original.win32.isAbsolute(value) || original.isAbsolute(value),
  }
})

vi.mock('node:fs', async importOriginal => {
  const original = await importOriginal<typeof import('node:fs')>()
  const realpathSync = original.realpathSync.bind(undefined) as typeof original.realpathSync
  realpathSync.native = boundary.realpathNative as typeof original.realpathSync.native
  return {
    ...original,
    closeSync: boundary.closeSync,
    fstatSync: boundary.fstatSync,
    lstatSync: boundary.lstatSync,
    openSync: boundary.openSync,
    readFileSync: ((path: unknown, ...args: unknown[]) => (
      typeof path === 'number'
        ? boundary.privateRecord
        : path === boundary.wslPath
        ? Buffer.from(boundary.wsl)
        : (original.readFileSync as (...values: unknown[]) => unknown)(path, ...args)
    )) as typeof original.readFileSync,
    realpathSync,
    statSync: ((path: unknown, ...args: unknown[]) => (
      path === boundary.wslPath
        ? { isFile: () => true, size: boundary.wsl.byteLength }
        : (original.statSync as (...values: unknown[]) => unknown)(path, ...args)
    )) as typeof original.statSync,
  }
})

vi.mock('node:crypto', async importOriginal => {
  const original = await importOriginal<typeof import('node:crypto')>()
  const known = [
    [boundary.wsl, '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2'],
    [boundary.osRelease, '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829'],
    [boundary.kernelRelease, '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92'],
    [boundary.git, '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668'],
    [boundary.unshare, 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c'],
    [boundary.ip, '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0'],
  ] as const
  return {
    ...original,
    createHash: ((algorithm: string) => {
      if (algorithm !== 'sha256') return original.createHash(algorithm)
      const chunks: Buffer[] = []
      const hash = {
        update(value: string | NodeJS.ArrayBufferView) {
          chunks.push(Buffer.from(value as Uint8Array))
          return hash
        },
        digest(encoding: 'hex') {
          const bytes = Buffer.concat(chunks)
          const match = known.find(([candidate]) => candidate.equals(bytes))
          return match === undefined
            ? original.createHash('sha256').update(bytes).digest(encoding)
            : match[1]
        },
      }
      return hash
    }) as typeof original.createHash,
  }
})

import {
  closeFixedPrivateRoot,
  openFixedPrivateRoot,
  preflightFixedWslHostAndGuest,
  readFixedPrivateRecord,
  verifyFixedGuestExistingStateSources,
} from '../scripts/release-recovery-fixture-host.mjs'
import { WSL_EXECUTION_POLICY } from '../scripts/run-release-recovery-spacetime-fixtures-wsl.mjs'

function success(stdout: string | Buffer) {
  const binary = Buffer.isBuffer(stdout)
  return {
    error: undefined,
    status: 0,
    signal: null,
    stdout,
    stderr: binary ? Buffer.alloc(0) : '',
  }
}

function guestPreflightResponse(_executable: unknown, rawArgs: unknown[]) {
  let numericVersionChecked = true
      const args = rawArgs.map(String)
      if (args.includes('-NoProfile')) {
        const script = args.at(-1)!
        for (const prefix of ['File', 'Product']) {
          for (const part of ['MajorPart', 'MinorPart', 'BuildPart', 'PrivatePart']) {
            expect(script).toContain(`${prefix}${part}`)
          }
        }
        numericVersionChecked = true
        return success('10.0.26100.8737\n10.0.26100.8737\n')
      }
      if (args.length === 1 && args[0] === '--version') {
        expect(numericVersionChecked).toBe(true)
        return success('WSL version: 2.7.11.0\n')
      }
      if (args.includes('/bin/cat')) {
        const path = args.at(-1)
        if (path === '/etc/os-release') return success(boundary.osRelease)
        if (path === '/proc/sys/kernel/osrelease') return success(boundary.kernelRelease)
        if (path === '/usr/bin/git') return success(boundary.git)
        if (path === '/usr/bin/unshare') return success(boundary.unshare)
        if (path === '/usr/sbin/ip') return success(boundary.ip)
      }
      if (args.includes('/usr/bin/dpkg-query')) {
        const versions: Record<string, string> = {
          git: '1:2.43.0-1ubuntu7.3',
          'util-linux': '2.39.3-9ubuntu6.6',
          iproute2: '6.1.0-1ubuntu6.2',
        }
        return success(versions[args.at(-1)!]!)
      }
      if (args.includes('/usr/bin/unshare')) {
        const link = JSON.stringify([{
          ifname: 'lo',
          flags: ['LOOPBACK', 'UP'],
        }])
        const route = JSON.stringify([{ dev: 'lo' }])
        const shellProgram = args.at(-1)!
        return success(`${link}\n${shellProgram.includes("printf '\\n'") ? '\n' : ''}${route}\n`)
      }
      if (args.includes('/usr/bin/git') && args.at(-1) === '--version') {
        return success('git version 2.43.0\n')
      }
      if (args.includes('/bin/sh')) return success('WarpkeepRunner\n')
      throw new Error(`unexpected synthetic boundary: ${JSON.stringify(args)}`)
}

describe('fixed recovery fixture host preflight', () => {
  it('accepts normal newline-terminated link and route JSON from the fixed namespace', async () => {
    let numericVersionChecked = false
    boundary.spawnSync.mockImplementation((_executable: unknown, rawArgs: unknown[]) => {
      const args = rawArgs.map(String)
      if (args.includes('-NoProfile')) {
        const script = args.at(-1)!
        for (const prefix of ['File', 'Product']) {
          for (const part of ['MajorPart', 'MinorPart', 'BuildPart', 'PrivatePart']) {
            expect(script).toContain(`${prefix}${part}`)
          }
        }
        numericVersionChecked = true
        return success('10.0.26100.8737\n10.0.26100.8737\n')
      }
      if (args.length === 1 && args[0] === '--version') {
        expect(numericVersionChecked).toBe(true)
        return success('WSL version: 2.7.11.0\n')
      }
      if (args.includes('/bin/cat')) {
        const path = args.at(-1)
        if (path === '/etc/os-release') return success(boundary.osRelease)
        if (path === '/proc/sys/kernel/osrelease') return success(boundary.kernelRelease)
        if (path === '/usr/bin/git') return success(boundary.git)
        if (path === '/usr/bin/unshare') return success(boundary.unshare)
        if (path === '/usr/sbin/ip') return success(boundary.ip)
      }
      if (args.includes('/usr/bin/dpkg-query')) {
        const versions: Record<string, string> = {
          git: '1:2.43.0-1ubuntu7.3',
          'util-linux': '2.39.3-9ubuntu6.6',
          iproute2: '6.1.0-1ubuntu6.2',
        }
        return success(versions[args.at(-1)!]!)
      }
      if (args.includes('/usr/bin/unshare')) {
        const link = JSON.stringify([{
          ifname: 'lo',
          flags: ['LOOPBACK', 'UP'],
        }])
        const route = JSON.stringify([{ dev: 'lo' }])
        const shellProgram = args.at(-1)!
        return success(`${link}\n${shellProgram.includes("printf '\\n'") ? '\n' : ''}${route}\n`)
      }
      if (args.includes('/usr/bin/git') && args.at(-1) === '--version') {
        return success('git version 2.43.0\n')
      }
      if (args.includes('/bin/sh')) return success('WarpkeepRunner\n')
      throw new Error(`unexpected synthetic boundary: ${JSON.stringify(args)}`)
    })

    await expect(preflightFixedWslHostAndGuest({
      policy: WSL_EXECUTION_POLICY,
    })).resolves.toEqual({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-wsl-host-guest-preflight-v1',
      executableSha256: '27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2',
      wslVersion: '2.7.11.0',
      distribution: 'WarpkeepRunner',
      osReleaseSha256: '01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829',
      kernelReleaseSha256: '600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92',
      gitSha256: '2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668',
      unshareSha256: 'a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c',
      loopbackToolSha256: '81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0',
    })
    expect(numericVersionChecked).toBe(true)
  })

  it('clears the original host read buffer after returning an isolated record copy', async () => {
    const expected = Buffer.from('{"synthetic":true}\n', 'utf8')
    expected.copy(boundary.privateRecord)
    const rootDescriptor = 71
    const fileDescriptor = 72
    const directoryStat = {
      dev: 1,
      ino: 2,
      mode: 0o700,
      size: 0,
      isDirectory: () => true,
      isFile: () => false,
      isSymbolicLink: () => false,
    }
    const fileStat = {
      dev: 1,
      ino: 3,
      mode: 0o600,
      size: expected.byteLength,
      isDirectory: () => false,
      isFile: () => true,
      isSymbolicLink: () => false,
    }
    boundary.lstatSync.mockImplementation((path: unknown) => (
      String(path).endsWith('recovery-bootstrap-marker.json') ? fileStat : directoryStat
    ))
    boundary.realpathNative.mockImplementation((path: unknown) => path)
    boundary.openSync.mockImplementation((path: unknown) => (
      String(path).endsWith('recovery-bootstrap-marker.json') ? fileDescriptor : rootDescriptor
    ))
    boundary.fstatSync.mockImplementation((descriptor: number) => (
      descriptor === fileDescriptor ? fileStat : directoryStat
    ))
    boundary.closeSync.mockReset()
    boundary.spawnSync.mockClear()
    boundary.spawnSync.mockImplementation((executable: unknown, rawArgs: unknown[]) => {
      const args = rawArgs.map(String)
      if (String(executable).endsWith('whoami.exe')) return success('synthetic-user\n')
      if (String(executable).endsWith('icacls.exe')) {
        return success(`${args[0]} SYNTHETIC\\synthetic-user:(F)\n`)
      }
      if (String(executable).endsWith('powershell.exe')) {
        return success('S-1-5-21-1\nS-1-5-21-1\n')
      }
      throw new Error('unexpected synthetic owner boundary')
    })

    const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' })
    try {
      const root = await openFixedPrivateRoot(boundary.privateRoot)
      try {
        const record = await readFixedPrivateRecord(root, 'recovery-bootstrap-marker.json', 256)
        expect(Buffer.from((record as { bytes: Uint8Array }).bytes)).toEqual(expected)
        expect(boundary.privateRecord.every(byte => byte === 0)).toBe(true)
        const commands = boundary.spawnSync.mock.calls.map(([executable]) => String(executable))
        for (const executable of ['whoami.exe', 'icacls.exe', 'powershell.exe']) {
          expect(commands.filter(command => command.endsWith(executable))).toHaveLength(2)
        }
      } finally {
        await closeFixedPrivateRoot(root)
      }
    } finally {
      Object.defineProperty(process, 'platform', platformDescriptor)
    }
  })
})

const retainedCommit = 'a'.repeat(40), retainedTree = 'b'.repeat(40)
function retainedSources() {
  const make = (realm: 'g002' | 'ptr') => ({ sourceAuthority: 'authenticated-existing-state-adoption-v1',
    adoptionReceiptSha256: 'c'.repeat(64), updateReceiptSha256: 'd'.repeat(64),
    databaseIdentity: realm === 'g002' ? 'c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194' : 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e',
    sourceCommit: 'e'.repeat(40), sourceRootTree: 'f'.repeat(40), sourceTree: '1'.repeat(40),
    installedModuleSha256: '2'.repeat(64), installedProgramKeccak256: '3'.repeat(64), historicalDependencyClosureSha256: '4'.repeat(64) })
  return { schemaVersion: 1, profile: 'warpkeep-release-recovery-authenticated-adoption-sources-v1',
    operatingCommit: retainedCommit, operatingTree: retainedTree, sources: { g002: make('g002'), ptr: make('ptr') } }
}
async function nativeReadFixture(scenario: string) {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  Object.defineProperty(process, 'platform', { ...descriptor, value: 'win32' })
  const calls: Array<{ executable: string; args: string[]; env: unknown }> = []
  const retainedBuffers: Buffer[] = []
  const token = 'gh-fixture-secret-' + 'x'.repeat(32)
  let attestations = 0, nativeCalls = 0, tokenCalls = 0
  boundary.spawnSync.mockClear()
  boundary.lstatSync.mockImplementation(() => scenario === 'public' ? undefined : ({ isFile: () => true, isSymbolicLink: () => false }))
  boundary.spawnSync.mockImplementation((rawExecutable: unknown, rawArgs: unknown[], rawOptions: any) => {
    const executable = String(rawExecutable), args = rawArgs.map(String)
    calls.push({ executable, args, env: rawOptions.env })
    if (executable.endsWith('git.exe')) {
      if (args.includes('ls-tree')) return success(Buffer.from('100644 blob ' + '5'.repeat(40) + '\t' + args.at(-1) + '\0'))
      if (args.includes('cat-file')) return success(Buffer.from('synthetic committed bootstrap'))
      if (args.includes('remote')) return success(Buffer.from('https://github.com/ael-dev3/Warpkeep.git\n'))
      const value = args.at(-1)!.endsWith('^{tree}') ? retainedTree : scenario === 'main-moved' && attestations > 0 ? '6'.repeat(40) : retainedCommit
      return success(Buffer.from(value + '\n'))
    }
    if (executable.endsWith('gh.exe')) {
      if (args[0] === 'api') return success(Buffer.from(scenario === 'wrong-account' ? 'someone|9\n' : 'ael-dev3|183124839\n'))
      expect(args).toEqual(['auth', 'token', '--hostname', 'github.com', '--user', 'ael-dev3'])
      tokenCalls += 1; const buffer = Buffer.from(token + '\n'); retainedBuffers.push(buffer); return success(buffer)
    }
    if (args.includes('/bin/sh') && args.some(arg => arg.includes("printf 'attested"))) {
      attestations += 1
      if (scenario === 'bootstrap-changed' && attestations === 2) return { ...success(''), status: 1 }
      return success('attested\n')
    }
    if (args.some(arg => arg.endsWith('release-recovery-native-adoption-read.mjs'))) {
      nativeCalls += 1
      expect(attestations).toBe(2)
      expect(args.slice(0, 8)).toEqual(['--distribution', 'WarpkeepRunner', '--user', 'warpkeep', '--cd', '/home/warpkeep/Warpkeep-0.4', '--exec', '/usr/bin/env'])
      expect(rawOptions.timeout).toBe(180000)
      const input = JSON.parse(rawOptions.input.toString('utf8'))
      expect(input).toEqual({ schemaVersion: 1, profile: 'warpkeep-release-recovery-native-adoption-read-v1', operatingCommit: retainedCommit, githubToken: scenario === 'public' ? null : token })
      retainedBuffers.push(rawOptions.input)
      const result = retainedSources()
      if (scenario === 'wrong-operating-tree') result.operatingTree = '7'.repeat(40)
      if (scenario === 'private-extra') Object.assign(result.sources.ptr, { receipt: 'private fixture receipt' })
      if (scenario === 'wrong-database') result.sources.ptr.databaseIdentity = '8'.repeat(64)
      if (scenario === 'malformed-digest') result.sources.ptr.installedProgramKeccak256 = '0'.repeat(64)
      if (scenario === 'native-failure') { const output = Buffer.from(token); retainedBuffers.push(output); return { ...success(output), status: 1 } }
      return success(Buffer.from(JSON.stringify(result) + '\n'))
    }
    return guestPreflightResponse(executable, args)
  })
  try {
    if (['valid', 'public'].includes(scenario)) await expect(verifyFixedGuestExistingStateSources()).resolves.toEqual(retainedSources())
    else await expect(verifyFixedGuestExistingStateSources()).rejects.toThrow(/^RECOVERY_FIXTURE_INPUT_INVALID$/u)
    expect(JSON.stringify(calls)).not.toContain(token)
    expect(retainedBuffers.every(bytes => bytes.every(byte => byte === 0))).toBe(true)
    if (['wrong-account', 'bootstrap-changed', 'main-moved'].includes(scenario)) expect(nativeCalls).toBe(0)
    if (scenario === 'wrong-account') expect(tokenCalls).toBe(0)
    if (scenario === 'valid') { expect(nativeCalls).toBe(1); expect(attestations).toBe(3) }
  } finally { Object.defineProperty(process, 'platform', descriptor) }
}
describe('fixed authenticated retained-source host transport', () => {
  it.each(['valid', 'public', 'wrong-account', 'bootstrap-changed', 'main-moved', 'wrong-operating-tree',
    'private-extra', 'wrong-database', 'malformed-digest', 'native-failure'])('enforces %s across private stdin and source reattestation', nativeReadFixture)
  it('rejects caller-selected authority before any process', async () => {
    boundary.spawnSync.mockClear()
    await expect((verifyFixedGuestExistingStateSources as any)({ operatingCommit: retainedCommit })).rejects.toThrow('RECOVERY_FIXTURE_INPUT_INVALID')
    expect(boundary.spawnSync).not.toHaveBeenCalled()
  })
})
