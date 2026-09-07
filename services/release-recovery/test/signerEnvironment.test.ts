import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({ construct: vi.fn(), parse: vi.fn(() => ({ testOnlyPins: true })) }))
vi.mock('../src/signer.js', () => ({ RecoverySigner: class { constructor(...args: unknown[]) { boundary.construct(...args) } } }))
vi.mock('../src/spacetimeProgramPins.js', () => ({ parseSpacetimeProgramPins: boundary.parse }))
import { signerFromEnvironment, type RecoverySignerEnvironment } from '../src/signerEnvironment.js'

it('selects only the fixed control namespace, explicit secrets, compiled schemas and named observer', () => {
  const control = { testOnlyStub: 'control' }
  const request = { testOnlyStub: 'request' }
  const getByName = vi.fn((name: string) => name === 'warpkeep-release-recovery-control-v2' ? control : request)
  const observer = { observeReleaseRecoveryState: vi.fn() }
  const env = { RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: '1', RECOVERY_ARMING_MANIFEST: 'test-only-manifest',
    RECOVERY_SIGNING_PRIVATE_JWK: 'test-only-key', RELEASE_RECOVERY_RPC_SECRET: 'test-only-secret',
    GITHUB_APP_ID: '1', GITHUB_APP_INSTALLATION_ID: '2', GITHUB_APP_PRIVATE_KEY_PEM: 'test-only-pem',
    AUTH_BRIDGE_OBSERVER: observer, RECOVERY_LEDGER_V2: { getByName }, unrelated: 'must not propagate' } as unknown as RecoverySignerEnvironment
  const bytes = new Uint8Array([1, 2, 3]).buffer
  signerFromEnvironment(env, { manifest: bytes, g001: bytes, g002: bytes, ptr: bytes })
  const [configuration, secrets, stub, clock, runtime] = boundary.construct.mock.calls[0]
  expect(configuration).toEqual({ RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: '1', RECOVERY_ARMING_MANIFEST: 'test-only-manifest' })
  expect(secrets).toEqual({ RECOVERY_SIGNING_PRIVATE_JWK: 'test-only-key', RELEASE_RECOVERY_RPC_SECRET: 'test-only-secret' })
  expect(stub).toBe(control)
  expect(Number.isSafeInteger(clock())).toBe(true)
  expect(runtime.fetch).toBe(globalThis.fetch)
  expect(runtime.observation.bridge).not.toBe(observer)
  expect(Object.getPrototypeOf(runtime.observation.bridge)).toBe(Object.prototype)
  expect(Reflect.ownKeys(runtime.observation.bridge)).toEqual(['observeReleaseRecoveryState'])
  expect(runtime.observation.pins).toEqual({ testOnlyPins: true })
  expect(runtime.observation.expectedRawModuleDefV10Fixtures.g001).toEqual(new Uint8Array(bytes))
  expect(runtime.requestLedger('test-only-request')).toBe(request)
  expect(getByName.mock.calls.map(call => call[0])).toEqual(['warpkeep-release-recovery-control-v2', 'test-only-request'])
  boundary.construct.mockClear()
  expect(() => signerFromEnvironment(env, { manifest: bytes, g001: new ArrayBuffer(0), g002: bytes, ptr: bytes })).toThrow('RECOVERY_SIGNER_CONFIGURATION_INVALID')
  expect(boundary.construct).not.toHaveBeenCalled()
})

it('declares no public route, secret values, remote fixture paths or configurable ledger identity', () => {
  const config = readFileSync(new URL('../wrangler.signer.toml', import.meta.url), 'utf8')
  const entry = readFileSync(new URL('../src/index-signer.ts', import.meta.url), 'utf8')
  expect(config).toContain('workers_dev = false')
  expect(config).toContain('preview_urls = false')
  expect(config).toContain('routes = []')
  expect(config).toContain('entrypoint = "ReleaseRecoveryObservationEntrypoint"')
  expect(config).toContain('class_name = "ReleaseRecoveryAuthorizationLedgerV2"')
  expect(config).toContain('type = "Data"')
  expect(config).not.toMatch(/RECOVERY_SIGNING_PRIVATE_JWK|RELEASE_RECOVERY_RPC_SECRET|GITHUB_APP_PRIVATE_KEY_PEM/u)
  for (const name of ['manifest', 'g001.raw-module-def-v10', 'g002.raw-module-def-v10', 'ptr.raw-module-def-v10']) expect(entry).toContain(`../fixtures/spacetime/${name}.json`)
  for (const method of ['status', 'issue', 'claim', 'complete', 'reconcile', 'terminal']) expect(entry).toContain(`async ${method}(`)
  expect(entry).toContain('status: 404')
})
