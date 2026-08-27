# 0.4.0 realm chooser implementation plan

> Use test-driven development and verification before completion.

**Goal:** Add an accessible two-realm choice to the existing main menu while
preserving Genesis 001 entry and keeping Genesis 002 completely sealed.

### Task 1: Add the pure realm-access presentation contract

- [x] Add failing tests for authenticated, pending, anonymous, and sealed
  states.
- [x] Implement immutable realm descriptors and derived status/tooltips.
- [x] Prove only an authenticated Genesis 001 session can derive `admitted`.

### Task 2: Add the menu selector and tooltips

- [x] Add failing component tests for selection, accessible names, check/X
  symbols, tooltip IDs, hover, and keyboard focus.
- [x] Render the selector without changing the default Genesis 001 entry flow.
- [x] Add responsive and reduced-motion-safe styling.

### Task 3: Seal Genesis 002 interaction and request intake

- [x] Add failing tests proving Genesis 002 entry invokes no auth, request,
  backend, or realm callback.
- [x] Present the suspended-admissions notice on attempted Genesis 002 entry.
- [x] Remove/hide request-access actions while the release suspension policy is
  active.

### Task 4: Integrate and verify

- [x] Run focused menu/auth/experience/responsive tests.
- [ ] Run typecheck, production build, accessibility/browser QA, and the full
  release gates.
- [x] Capture a visual review image before production deployment.
