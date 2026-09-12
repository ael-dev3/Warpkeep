import { expect, it, vi } from 'vitest'
import { createSignerObservationService } from '../src/signerObservationService.js'
import type { ReleaseRecoveryObservationRequest } from '../src/realmEvidence.js'

const request = {} as ReleaseRecoveryObservationRequest

it('captures an exact plain capability and preserves the service receiver and request', async () => {
  const response = { testOnly: true }
  class Service {
    async observeReleaseRecoveryState(input: ReleaseRecoveryObservationRequest) {
      expect(this).toBe(service)
      expect(input).toBe(request)
      return response
    }
  }
  const service = new Service()
  const adapter = createSignerObservationService(service)
  expect(Object.getPrototypeOf(adapter)).toBe(Object.prototype)
  expect(Reflect.ownKeys(adapter)).toEqual(['observeReleaseRecoveryState'])
  service.observeReleaseRecoveryState = vi.fn(async () => { throw new Error('must not recapture') })
  const detached = adapter.observeReleaseRecoveryState
  expect(await detached(request)).toBe(response)
})

it('removes only the RPC lifecycle descriptor without hiding invalid evidence fields', async () => {
  const foreign = Symbol('untrusted')
  const getter = vi.fn(() => 'must not read')
  const dispose = vi.fn(() => { throw new Error('private fixture error') })
  const prototype = { unexpectedPrototype: true }
  const response = Object.create(prototype, {
    extra: { value: 'reject downstream', enumerable: true },
    accessor: { get: getter, enumerable: true },
    [foreign]: { value: true },
    [Symbol.dispose]: { value: dispose },
  })
  const adapter = createSignerObservationService({ async observeReleaseRecoveryState() { return response } })
  const copied = await adapter.observeReleaseRecoveryState(request) as object
  expect(Object.getPrototypeOf(copied)).toBe(prototype)
  expect(Reflect.ownKeys(copied)).toEqual(['extra', 'accessor', foreign])
  expect(Object.getOwnPropertyDescriptor(copied, 'accessor')?.get).toBe(getter)
  expect(getter).not.toHaveBeenCalled()
  expect(dispose).toHaveBeenCalledOnce()
  expect(dispose.mock.contexts[0]).toBe(response)
})

it('rejects malformed lifecycle metadata without invoking accessors', async () => {
  const getter = vi.fn()
  for (const descriptor of [{ value: () => {}, enumerable: true }, { value: 'bad' }, { get: getter }]) {
    const response = Object.defineProperty({}, Symbol.dispose, descriptor)
    const adapter = createSignerObservationService({ async observeReleaseRecoveryState() { return response } })
    await expect(adapter.observeReleaseRecoveryState(request)).rejects.toThrow('RECOVERY_REALM_EVIDENCE_FAILED')
  }
  expect(getter).not.toHaveBeenCalled()
})
