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
