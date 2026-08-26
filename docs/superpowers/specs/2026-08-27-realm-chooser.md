# 0.4.0 realm chooser

Status: approved product requirement

## Outcome

The main menu presents two explicit realm choices before entry:

- `Genesis 001` is the preserved `0.3.43` game. A signed-in identity that is
  already admitted sees a green check. Every other state sees a red X.
- `Genesis 002` is the `0.4.0` Greater Realm. It shows a red X for every
  identity while the realm is sealed.

Each status mark has a hover and keyboard-focus tooltip. The visible symbol,
accessible name, and tooltip all convey the state, so color is never the only
signal.

## Interaction contract

- Genesis 001 is selected by default to preserve the established entry flow.
- Selecting Genesis 001 and choosing `ENTER REALM` uses the existing
  authenticated Genesis 001 path. Only the bridge's current `authenticated`
  state qualifies for the checkmark; cached identity metadata does not.
- Selecting Genesis 002 is allowed so the choice is inspectable, but `ENTER
  REALM` performs no authentication, admission, database, or gameplay request.
  It presents a deterministic notice that admissions are suspended.
- Anonymous, expired, checking, and error states never receive a checkmark.
- The selector stores no realm choice or admission result in local storage,
  query parameters, or other authority-bearing persistence.

## Admission suspension

Before the 0.4.0 launcher is deployed:

- all Genesis 001 admission mutations and access-request submissions fail
  before table or audit mutation;
- Genesis 002 has zero admissions and exposes no admission or player path;
- the launcher contains no request-access action while suspension is active;
- existing Genesis 001 admissions remain playable and cannot be added,
  disabled, reset, or epoch-rotated by the sealed writers.

## Preservation boundary

The exact f39 GitHub Pages artifact is retained as private release/rollback
evidence. The 0.4.0 shell may present the realm chooser, but the Genesis 001
gameplay authority, map, admitted set, and player-facing realm version remain
`0.3.43`. Genesis 002 remains a separate database and security domain.

## Verification

- Component tests cover both realm selections and every access icon state.
- Pointer hover and keyboard focus expose the matching tooltip.
- Genesis 002 selection cannot call sign-in, admission check, request access,
  realm entry, or backend callbacks.
- Existing Genesis 001 authenticated and unauthenticated entry tests remain
  green.
- Browser QA covers desktop, compact/mobile, reduced motion, and screen-reader
  naming.
