# Owner production player canary

Status: source-only, fail-closed, and not authorized for production deployment
or execution.

The unlinked `https://warpkeep.com/owner-canary/` document is a separate Vite
entry and module graph. It mounts only the Farcaster Mini App host, owner-canary
auth client/controller, and an injected evidence runtime. It does not import or
mount the normal `App`, `FarcasterAuthProvider`, `WarpkeepSpacetimeProvider`,
Greater Realm scene, or `greaterRealmProviderBridge`. Product version `0.3.43`
and both Greater Realm presentation-off constants remain unchanged. The page
has an exact narrow CSP, canonical URL, `no-referrer`, `noindex`, no manifest,
and no Open Graph or Farcaster discovery metadata.

## Browser-memory run contract

The local verifier privately provides one 256-bit evidence nonce as exactly 64
lowercase hexadecimal characters and one reviewed admission-plan digest with
the same shape. The page clears both input fields as the run begins. Neither is
placed in a URL, rendered status/result, log, storage API, cookie, or sanitized
evidence. Before the run, each exists transiently in its controlled input and
React state; start clears the current state references while the active run
retains only its call-stack input. Clearing does not promise physical memory
erasure, but makes those browser references eligible for garbage collection.

The evidence runtime must invoke the injected `runStage(stage, operation)` once
for each exact stage, in order:

1. `baseline`
2. `founder`
3. `routes`
4. `dispatch`
5. `dispatch-replay`
6. `gathering`
7. `recall`
8. `returning`
9. `terminal`
10. `evidence`

Before every stage, the owner sees a separate Continue control. That user
action calls Farcaster Quick Auth with `{ force: true }`, exchanges the bearer
through the owner-only bridge endpoint, verifies the same approved subject,
opens one opaque player authority, runs the stage, and closes it. The bridge
response player JWT, bridge-verified FID, Spacetime identity, worker IDs,
location/cell IDs, and dispatch/recall idempotency keys remain only in the
relevant call stack or the injected runtime's private in-memory closure. They
are never returned to React or the sanitized result. The pinned Farcaster SDK
retains its most recent Quick Auth bearer in module memory even after expiry,
until it is replaced or the page realm is destroyed; Warpkeep never copies
that SDK cache into React, storage, logs, or the runtime. The shared Mini App
host context separately carries an untrusted
presentation FID in React memory; the owner-canary code never reads, renders,
logs, compares, or uses it as authority. Cancellation, subject change, missing
consent, stage reordering, or evidence-shape drift terminates the run and
attempts to close its Warpkeep authority. Starting a run permanently consumes
that page session: success, failure, or cancellation cannot start a second run,
because a server mutation may have committed before a browser error or abort.
If authority closure or verifier handoff fails, the result is explicitly
unconfirmed. For every terminal outcome the owner must close the Mini App host
and obtain independent operator reconciliation before a separate reviewed run.
Closing the reviewed Mini App host also ends the remaining browser-memory
lifetime.

The browser validates a closed, ID-free journey shape and adds fixed claims:
`freshAuthenticationStageCount: 10`, `tokenPersisted: false`,
`adminImpersonation: false`, and `notificationBypass: false`. Returned evidence
is branded in a module-private `WeakSet`; `requireOwnerCanaryPlayerEvidence`
rejects parsed, spread, or reconstructed JSON. The same-subject commitment is
lowercase SHA-256 over these three UTF-8 text frames:

```text
warpkeep.production-player-canary.same-subject.v1
<private 64-hex evidence nonce>
farcaster:<verified decimal FID>
```

Each frame is encoded as ASCII decimal UTF-8 byte length, `:`, then raw UTF-8
bytes. Framed values are joined by `|` and one LF is appended after the final
frame. Only the digest leaves the controller; the nonce and FID do not.

The checked-in `loadOwnerCanaryProductionRuntime` deliberately returns `null`.
The separate live-v17 lane must inject the reviewed player operations, private
subject/admission-plan correlation, and mandatory sanitized evidence handoff
before the page can authenticate or mutate anything. The UI does not report
completion until that in-process handoff resolves successfully. If the player
stages finish but handoff completion cannot be confirmed, the outcome is
ambiguous: the page permanently blocks another run for that session, uses
non-claiming failure copy, and requires host teardown plus independent operator
reconciliation. It never retries a completed mutation sequence from browser
state alone.

## Approved Mini App reachability

A normal browser tab cannot run this page: the controller requires the SDK to
confirm a real Mini App host before it loads the production runtime. Once the
entry and runtime have separately passed deployment review, the owner must
reach it by exactly one of these reviewed mechanisms:

- open the logged-in desktop Farcaster Mini App Debug Tool and preview the
  exact URL `https://warpkeep.com/owner-canary/?miniApp=true`; or
- use the exact published Warpkeep Farcaster universal link with the
  `/owner-canary/` subpath, but only after the app ID/slug and resulting full
  link have been independently resolved from the official published app and
  recorded in the private operation plan. Do not add a `miniApp` parameter to
  the universal link: Farcaster appends its parameters to the published
  `homeUrl`, which already carries the hint. The observed resolved target must
  contain exactly one literal `miniApp=true` value and may not omit,
  duplicate, encode, or rewrite that hint.

Do not infer an app ID or slug, open the URL in an ordinary browser tab, add
discovery metadata to this document, or send the URL through an arbitrary
shared embed/preview service. Before entering either private value or granting
stage consent, confirm that the host reports the published Warpkeep Mini App
and the address is the exact canonical HTTPS subpath with exactly one literal
`miniApp=true` query value. The document's canonical metadata deliberately
remains the query-free base URL; it is not an authorized launch URL.

## Bridge secret and deployment blocker

`PLAYER_CANARY_OWNER_FID` is optional and managed-secret-only. If it is absent,
the endpoint returns generic `503 player_canary_unavailable` before verifier or
database work. If present, it must be one exact canonical positive safe-integer
decimal FID; whitespace, leading zeroes, and unsafe integers invalidate the
entire bridge configuration. Its value is excluded from response identity,
cookies, logs, configuration attestations, and release attestations.

The protected Cloudflare deployment currently recognizes exactly six secret
bindings. Its metadata uses `keep_bindings: ["secret_text", "secret_key"]`,
which preserves existing bindings but provides no reviewed creation path for a
new one. Do not deploy this bridge source until the deployment lane has an
audited transition that:

- accepts exactly the existing six names plus `PLAYER_CANARY_OWNER_FID`;
- stages the seventh value through a private managed-secret channel, never a
  repository variable, source file, output, receipt, shell argument, or log;
- proves the uploaded Worker sees all seven exact `secret_text` bindings;
- preserves the other six values unchanged and fails closed on ambiguity;
- records only the binding name/state, never the FID value; and
- has green recovery tests for interruption before and after secret staging.

## Required owner approvals

Separate explicit approval is required for each production-changing boundary:

- stage, replace, or remove `PLAYER_CANARY_OWNER_FID`;
- deploy/release the changed bridge and Pages artifacts;
- connect the live-v17 player runtime and private verifier handoff; and
- begin the canary that founds or mutates live player, worker, and resource
  state.

No token file, browser session export, owner FID disclosure, realm presentation
enablement, admin impersonation, notification bypass, commit, push, protected
ref update, or production call is part of this source change.
