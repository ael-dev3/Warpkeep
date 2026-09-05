import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('release recovery WSL bootstrap source', () => {
  const PROCESS_TEST_TIMEOUT = 60_000
  const HARNESS_PATH = fileURLToPath(new URL(
    'release_recovery_wsl_bootstrap_harness.py',
    import.meta.url,
  ))
  const WINDOWS_WSL = String.raw`C:\Windows\System32\wsl.exe`
  const ROOT_LINUX_HARNESS_MODES = new Set([
    'combined-producer-authority',
    'producer-control-flow',
    'transaction-catalog',
  ])
  const windowsEnvironment = () => ({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    WINDIR: process.env.WINDIR,
  })
  const linuxEnvironment = () => ({
    LANG: 'C',
    LC_ALL: 'C',
    PATH: '/usr/bin:/bin',
    TZ: 'UTC',
  })
  const executeHarness = (
    executable: string,
    arguments_: string[],
    environment: NodeJS.ProcessEnv,
  ): string => execFileSync(executable, arguments_, {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: environment,
    timeout: PROCESS_TEST_TIMEOUT,
    windowsHide: true,
  }).trim()
  const runNativeLinuxHarness = (mode: string): string => {
    if (ROOT_LINUX_HARNESS_MODES.has(mode) && process.getuid?.() !== 0) {
      return executeHarness('/usr/bin/unshare', [
        '--user', '--map-root-user',
        '/usr/bin/python3', '-I', HARNESS_PATH, mode,
      ], linuxEnvironment())
    }
    return executeHarness(
      '/usr/bin/python3', ['-I', HARNESS_PATH, mode], linuxEnvironment(),
    )
  }
  const runHarness = (mode: string): string => {
    if (process.platform === 'win32') {
      return executeHarness('python', ['-I', HARNESS_PATH, mode], windowsEnvironment())
    }
    if (process.platform === 'linux') {
      return runNativeLinuxHarness(mode)
    }
    throw new Error('unsupported release-recovery test host')
  }
  const runLinuxHarness = (mode: string): string => {
    if (process.platform === 'linux') {
      return runNativeLinuxHarness(mode)
    }
    if (process.platform !== 'win32' || !/^[A-Za-z]:\\/u.test(HARNESS_PATH)) {
      throw new Error('unsupported release-recovery Linux test host')
    }
    const wslHarnessPath = `/mnt/${HARNESS_PATH[0]!.toLowerCase()}${HARNESS_PATH
      .slice(2)
      .replaceAll('\\', '/')}`
    const wslArguments = ['--distribution', 'Ubuntu-24.04']
    if (ROOT_LINUX_HARNESS_MODES.has(mode)) {
      wslArguments.push('--user', 'root')
    }
    wslArguments.push(
      '--exec', '/usr/bin/python3', '-I',
      wslHarnessPath, mode,
    )
    return executeHarness(WINDOWS_WSL, wslArguments, windowsEnvironment())
  }

  it('exercises the real strict request parser without running the operator program', () => {
    expect(runHarness('request-parser')).toBe('request-parser:ok')
  })

  it('exports and re-verifies only the bounded exact Git object closure', () => {
    expect(runHarness('source-export')).toBe('source-export:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('uses a real disposable isolated Git repository for exact-object export', () => {
    expect(runLinuxHarness('real-source-export')).toBe('real-source-export:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('keeps historical publisher and Linux source dependency commitments distinct', () => {
    expect(runHarness('receipt-digest-separation')).toBe('receipt-digest-separation:ok')
  })

  it('enforces bounded fixed HTTPS, redirect, signature, archive, and SRI checks', () => {
    expect(runHarness('artifact-boundaries')).toBe('artifact-boundaries:ok')
  })

  it('accepts a valid and rejects an invalid detached signature with isolated real GPG/GPGv', () => {
    expect(runLinuxHarness('real-signature-boundary')).toBe('real-signature-boundary:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('derives only the selected Linux/x64 lock graph and requires esbuild', () => {
    expect(runHarness('lock-graph')).toBe('lock-graph:ok')
  })

  it('uses the authenticated G002 Spacetime workspace and genesis002 lock importer', () => {
    expect(runHarness('workspace-layout')).toBe('workspace-layout:ok')
  })

  it('publishes only a complete v2 inventory and durably rolls back an interrupted install', () => {
    expect(runHarness('transaction-catalog')).toBe('transaction-catalog:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('connects authenticated evidence and rejects a tampered unanchored producer cache', () => {
    expect(runHarness('producer-control-flow')).toBe('producer-control-flow:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('runs the authenticated source, artifact, dependency, and cache authorities as one producer chain', () => {
    expect(runLinuxHarness('combined-producer-authority')).toBe('combined-producer-authority:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('keeps the tracked guest Python attribute rule narrow and exact', () => {
    expect(readFileSync(new URL('../scripts/.gitattributes', import.meta.url), 'utf8'))
      .toMatch(/^\*\.py text eol=lf\r?\n$/)
    const repositoryRoot = new URL('../../..', import.meta.url)
    const repositoryPath = fileURLToPath(repositoryRoot).replace(/[\\/]+$/u, '')
    const programPath = 'services/release-recovery/scripts/release-recovery-wsl-bootstrap.py'
    expect(execFileSync('git', [
      '-c', `safe.directory=${repositoryPath}`,
      'check-attr', 'text', 'eol', '--', programPath,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      windowsHide: true,
    })).toBe([
      `${programPath}: text: set`,
      `${programPath}: eol: lf`,
      '',
    ].join('\n'))
    expect(readFileSync(new URL('../scripts/release-recovery-wsl-bootstrap.py', import.meta.url)))
      .not.toContain(0x0d)
  })
})
