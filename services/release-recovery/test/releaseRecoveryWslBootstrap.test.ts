import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

describe('release recovery WSL bootstrap source', () => {
  const PROCESS_TEST_TIMEOUT = 60_000
  const runHarness = (mode: string): string => execFileSync('python', [
    '-I',
    'test/release_recovery_wsl_bootstrap_harness.py',
    mode,
  ], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      WINDIR: process.env.WINDIR,
    },
    timeout: PROCESS_TEST_TIMEOUT,
    windowsHide: true,
  }).trim()

  it('exercises the real strict request parser without running the operator program', () => {
    expect(runHarness('request-parser')).toBe('request-parser:ok')
  })

  it('exports and re-verifies only the bounded exact Git object closure', () => {
    expect(runHarness('source-export')).toBe('source-export:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('uses a real disposable isolated Git repository for exact-object export', () => {
    const harnessPath = fileURLToPath(new URL('release_recovery_wsl_bootstrap_harness.py', import.meta.url))
    const wslHarnessPath = `/mnt/${harnessPath[0]!.toLowerCase()}${harnessPath.slice(2).replaceAll('\\', '/')}`
    expect(execFileSync(String.raw`C:\Windows\System32\wsl.exe`, [
      '--distribution',
      'Ubuntu-24.04',
      '--exec',
      '/usr/bin/python3',
      '-I',
      wslHarnessPath,
      'real-source-export',
    ], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
      },
      timeout: PROCESS_TEST_TIMEOUT,
      windowsHide: true,
    }).trim()).toBe('real-source-export:ok')
  }, PROCESS_TEST_TIMEOUT + 5_000)

  it('keeps historical publisher and Linux source dependency commitments distinct', () => {
    expect(runHarness('receipt-digest-separation')).toBe('receipt-digest-separation:ok')
  })

  it('enforces bounded fixed HTTPS, redirect, signature, archive, and SRI checks', () => {
    expect(runHarness('artifact-boundaries')).toBe('artifact-boundaries:ok')
  })

  it('accepts a valid and rejects an invalid detached signature with isolated real GPG/GPGv', () => {
    const harnessPath = fileURLToPath(new URL('release_recovery_wsl_bootstrap_harness.py', import.meta.url))
    const wslHarnessPath = `/mnt/${harnessPath[0]!.toLowerCase()}${harnessPath.slice(2).replaceAll('\\', '/')}`
    expect(execFileSync(String.raw`C:\Windows\System32\wsl.exe`, [
      '--distribution', 'Ubuntu-24.04', '--exec', '/usr/bin/python3', '-I',
      wslHarnessPath, 'real-signature-boundary',
    ], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
      },
      timeout: PROCESS_TEST_TIMEOUT,
      windowsHide: true,
    }).trim()).toBe('real-signature-boundary:ok')
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

  it('keeps the tracked guest Python attribute rule narrow and exact', () => {
    expect(readFileSync(new URL('../scripts/.gitattributes', import.meta.url), 'utf8'))
      .toMatch(/^\*\.py text eol=lf\r?\n$/)
    const repositoryRoot = new URL('../../..', import.meta.url)
    const programPath = 'services/release-recovery/scripts/release-recovery-wsl-bootstrap.py'
    expect(execFileSync('git', [
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
