# PTR session continuation

Date: 2026-09-08 (Europe/Budapest). Source: the change introducing this record,
based on `7e4b69f7ac696be156788811429dff60c3ba7d59`.
This is local implementation evidence for R08. Integrated owner and live release
acceptance remain open.

## Player behavior and authority

An owner who has entered PTR now stays in the realm flow when the short session
expires. The provider retires the expired authority and connection, obtains fresh
forced Quick Auth, verifies the same FID, database and authentication epoch, then
connects and preflights a new capability. Commands and the old surface are absent
during renewal. A transient failure offers an explicit retry or return to menu.
Denial, identity/scope changes and leaving cancel continuation.

The owner returns to the world or keep root after fresh state arrives. Detailed
panels, placement drafts, targets, quotes and command envelopes are discarded.
If an action was interrupted, a dismissible notice asks the owner to review the
latest state before retrying. A late result from the old controller cannot mutate
the new view, and no request is automatically replayed across sessions.

The server's 120-second maximum remains unchanged. Renewal occurs at expiry,
including foreground detection of an expired lease; it does not rotate early and
interrupt a still-valid command. Access verified on the menu still expires to an
unknown state and requires explicit entry. Healthy same-session refresh retains
its existing scene/focus behavior.

Implementation owners:

- `src/ptr/PtrRealmProvider.tsx`: continuation scope, expiry, single-flight renewal,
  retries, cancellation and reconnect/preflight publication.
- `src/ptr/ptrRealmAuthClient.ts`: authentication epoch retained in the private
  credential store; the comparison helper returns credential-free scope only.
- `src/components/WarpkeepExperience.tsx`: active-realm intent, recovery view,
  coarse destination and interrupted-action notice. Capability replacement also
  catches a fast renewal whose intermediate phase React batches away.
- `src/ptr/PtrGameplay04SurfaceHost.tsx`: fresh controller/navigation ownership,
  direct observation of command status and notice after a fresh read.
- `src/ptr/PtrSessionContinuation.tsx` and its CSS: recovery presentation, focus,
  touch controls and a notice above a stable scene container.

## Executed verification

Windows, Node 22.22.3, existing dependencies without installation into the shared
`node_modules` junction:

- Provider, auth client, connection, surface host and experience integration:
  **98 tests passed** across the five corresponding root Vitest files.
- Existing experience, G001 realm integration and surface navigation:
  **62 tests passed** across three files.
- Independent backend verification of gameplay controller, lifecycle and
  capability suites: **127 tests passed**.
- Explicit `tsconfig.app.json` and `tsconfig.node.json` noEmit checks passed.
- Complete `npm run build` passed, including generated dressing/catalog checks,
  types, asset integrity, production exclusions, atlas public boundary and
  Farcaster manifest verification. The existing large-chunk advisory remains;
  it is not a measured performance result.
- Independent authority/lifecycle review found no remaining blocking issue.
  The first integration run caught a test bridge-generation mismatch and a
  genuine fast-renewal notice race; both were corrected before the passing run.

The tests cover expiry during construction, both committed and uncommitted
interrupted requests, repeated renewals, retry failures, denial, FID/database/epoch
changes, late Quick Auth/connect/preflight results, leaving, foreground expiry,
and replacement authority expiring during preflight. Existing uncertain-command
and G001 paths remain covered. One world-scene test emitted React `act` warnings
while passing; they were not suppressed or converted into passing assertions.

## Rendered presentation and limits

The in-app browser loaded the actual new components and existing synthetic
`Keep04QaHarness` through a loopback-only temporary fixture. Checked recovery at
390 × 844 and 320 × 568 browser viewports; checked the keep notice at 390 × 844
and the default 1280 × 720 viewport. No horizontal document overflow occurred.
The recovery buttons were at least 44 pixels tall. Notice and scene bounds were
adjacent, not overlapping; dismissal removed the notice and left one canvas.
Panel focus was observed in the browser. Actual host dismissal-focus behavior is
covered by the surface test; the presentation fixture omits that host callback.
Temporary viewport overrides were reset.

This fixture has synthetic state, an extra QA toolbar and no authentication or
realm connection. It does not prove actual owner play, real phone behavior,
background timer scheduling, live command settlement or final performance.

Before R08 acceptance, exercise the integrated owner journey across expiry,
background/resume, uncertain outcome and repeated world/keep switches. No
production or admission policy was changed here.

## Mini App presentation updates and identity changes

A follow-up review reproduced an active PTR session returning to the menu when
the Mini App host published a safe-area or notification update. The provider was
using the entire host object as session identity, although the host intentionally
replaces that object when presentation state changes.

The provider now captures the actual identity and authority scope: host state,
Mini App eligibility, user and client FID, Quick Auth adapter and its token
function. Presentation changes preserve the active session. An observed account,
client, authentication adapter or eligibility change invalidates both current
and pending authority. Scalar snapshots also catch mutation of a reused host
object when the provider renders or returns from asynchronous authentication;
this does not claim to poll unreported host changes.

Provider, experience, surface, auth-client and Mini App host suites passed
**135 tests**, including twelve new provider cases. The explicit application
noEmit check passed. These tests verify the local integration, not live owner
play or actual mobile host account switching.
