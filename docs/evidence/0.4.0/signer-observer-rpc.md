# Signer observer RPC boundary — 2026-09-07

The environment wiring previously passed the raw `AUTH_BRIDGE_OBSERVER` binding
to `realmEvidence`. That reader deliberately requires a plain object with exactly
one own method, while a real Workerd named service binding has a different
prototype. Real RPC result objects also carry a nonenumerable `Symbol.dispose`,
which the exact evidence-field validator rejects. Mocked environment tests had
not exercised either transport distinction.

`signerObservationService.ts` now captures the deploy-owned service method and
provides the exact plain capability expected by the reader. It invokes the
captured method with `Reflect.apply`, preserving the receiver. A native Workerd
test caught an intermediate `.call` implementation: RPC property lookup tried
to invoke a remote method named `call`. The final implementation passes that
test.

The adapter removes only the valid nonenumerable RPC lifecycle descriptor and
disposes the returned RPC result after copying descriptors. It preserves the
prototype, additional fields, other symbols, and accessors so the existing
strict evidence validator still rejects them. It does not validate, authorize,
or manufacture evidence. Request fields and realm/state/time/digest rules are
unchanged. No private observer payload is logged.

Verification with pinned Node 22.22.3:

- `vitest run test/signerObservationService.test.ts test/signerEnvironment.test.ts test/realmEvidence.test.ts --maxWorkers=1`:
  19 tests passed. Includes the actual realm validator accepting valid adapted
  fixture evidence and rejecting extra fields; provider data remains synthetic.
- `vitest run --config vitest.workerd.config.ts test-workerd/gateway.workerd.test.ts`:
  2 tests passed, including actual named-service RPC transport, method capture,
  plain capability shape and absence of lifecycle metadata after adaptation.
  The observer is explicitly test-only, not a live auth-bridge observation.
- Service and Workerd TypeScript checks: exit 0.
- Full local Workerd suite: 39 tests passed across 3 files in 52.43 seconds.

This repairs a runtime integration defect; it does not satisfy live observer,
owner PTR, generated signer-fixture, full signer-to-provider journey, or release
deployment acceptance. Those remain required.
