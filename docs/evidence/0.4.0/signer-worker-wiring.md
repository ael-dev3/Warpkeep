# Private signer Worker wiring — 2026-09-07

## Initial preparation entry — 2026-09-18

The separate `index-preparation-signer.ts` and
`wrangler.preparation-signer.toml` now make the existing disabled preparation
phase buildable before final production evidence exists. The same named signer
entry exposes `prepare`, `preparationObservation`, `ptrObservation`,
`ptrUpdateObservation` and `g002UpdateObservation`. It exposes none of the six
final recovery methods. The service, V2 ledger class/binding/migration, observer
and epoch match the final configuration; public routes remain disabled.

Wrangler 4.110.0 with Node 22.22.3 successfully dry-ran the actual preparation
configuration with all four final fixture files absent and no test aliases.
The emitted input graph contains no final signer, fixture, test-double or final
issuance/claim adapter. No upload occurred. Workerd tests call the actual named
preparation RPC, verify all six final methods are absent and check sanitized
gateway status failure; the former inert-fixture test alias was removed.
An independent source/bundle review found no actionable defect.

This is an initial deployment entry, not an armed-recovery replacement. Fresh
provider readback found the signer and gateway absent; the existing auth bridge
was present but did not export `ReleaseRecoveryObservationEntrypoint`. Complete
the existing prepared bridge transition and observer configuration before the
signer and gateway; preserve production authentication through that transition.
Initial service provisioning, GitHub App authentication, operation
policy and private inputs, final adoption-aware fixture generation, live
readback and recovery acceptance remain open. The final signer retains its
strict production imports and all existing authentication/arming checks.

## Original full-signer wiring evidence

The named `ReleaseRecoverySignerEntrypoint` now delegates the six fixed RPC
methods to the composed signer. The default fetch entrypoint returns an empty
404/no-store response. `wrangler.signer.toml` disables routes, workers.dev,
preview URLs and observability; it declares the named auth-bridge observer and
V2 SQLite ledger namespace. Secret values and arming manifest are absent.

The environment adapter selects the fixed V2 control object and request-UUID
objects, passes only explicit configuration/secret projections, and uses the
platform fetch implementation. Program pins are parsed by the existing strict
parser. Schema bytes are bounded and subsequently validated against the pins
by the realm observer. These compiled inputs are not RPC parameters.

Four Data-module imports refer to the existing fixed generator's outputs:

- `fixtures/spacetime/manifest.json`
- `fixtures/spacetime/g001.raw-module-def-v10.json`
- `fixtures/spacetime/g002.raw-module-def-v10.json`
- `fixtures/spacetime/ptr.raw-module-def-v10.json`

No synthetic files were installed in those paths. ArrayBuffer imports preserve
the exact captured bytes instead of JSON reserialization.

Verification with pinned Node 22.22.3:

- Service and Workerd TypeScript checks exit 0.
- signerEnvironment, signerSecrets and spacetimeProgramPins: 16 tests passed.
  The environment test mocks the pin parser and signer constructor to inspect
  wiring; it is not a deployed named-RPC or successful-bundle test. Separate
  pin and signer tests exercise those real components.
- Wrangler 4.110.0 `deploy --dry-run --config wrangler.signer.toml`: exit 1,
  four ENOENT errors from the Data-module collector for the fixed paths above.
  No upload or provider mutation occurred. Missing modules are a real build
  dependency; TypeScript declarations do not establish that those files exist.

Read-only presence check at the fixed private root also found no
`fixture-materialization/wsl-toolchain-attestation-v1.json` and none of the seven
required G002/PTR publish, atlas-import, owner-provision and sealed-live receipt
files. No contents or secrets were read. This checks only local file presence,
not whether any corresponding production operation happened elsewhere.

R11–R13 remain incomplete. Complete the real local materialization/receipt
producer paths, generate/verify these outputs, then rerun the bundle and named
Worker/gateway runtime journey. Do not treat mocked wiring tests as completed
release operations. Generated signer binding types, gateway wiring, independent
review, fresh provider evidence and live deployment remain outstanding.
