import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('release recovery WSL bootstrap source', () => {
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
    windowsHide: true,
  }).trim()

  it('exercises the real strict request parser without running the operator program', () => {
    expect(runHarness('request-parser')).toBe('request-parser:ok')
  })

  it('exports and re-verifies only the bounded exact Git object closure', () => {
    expect(runHarness('source-export')).toBe('source-export:ok')
  }, 20_000)

  it('enforces bounded fixed HTTPS, redirect, signature, archive, and SRI checks', () => {
    expect(runHarness('artifact-boundaries')).toBe('artifact-boundaries:ok')
  })

  it('derives only the selected Linux/x64 lock graph and requires esbuild', () => {
    expect(runHarness('lock-graph')).toBe('lock-graph:ok')
  })

  it('publishes only a complete v2 inventory and durably rolls back an interrupted install', () => {
    expect(runHarness('transaction-catalog')).toBe('transaction-catalog:ok')
  })

  it('connects authenticated source and artifact evidence to one idempotent fixed producer', () => {
    expect(runHarness('producer-control-flow')).toBe('producer-control-flow:ok')
  }, 20_000)

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
