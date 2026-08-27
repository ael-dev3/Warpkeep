# Greater Realm C0 Yield Repair Implementation Plan

> **For agentic workers:** use test-driven development and verification before
> completion for every task. Keep private candidate material out of commands,
> diffs, logs, and review artifacts.

**Goal:** Produce a reviewable `.19` candidate generator whose unchanged normal
lane preserves prior output and whose separate bounded Lowlands-reserve repair
lane raises owner-private candidate yield without weakening final world proofs.

**Architecture:** The `.18` normal authority and ranked search remain the first
lane. A separately stored child-0 reserve authority and capped repair frontier
are consulted only after a complete normal no-match. Both lanes use the same
allocator commit path and final invariant suite.

**Spec:**
`docs/superpowers/specs/2026-08-26-greater-realm-c0-yield-repair.md`

## Constraints

- Work from protected `main` SHA
  `f39d57c8622077e6543a16e5610d0e4ec73910da` in an isolated checkout.
- Keep the terrain seed namespace `.3`; change the generator/package version
  from `.18` to `.19` only after behavior and pins are coherent.
- Never port the diagnostic spike, its 200,000-node traversal, its global search
  ordering, or its lowered borrowed-footprint threshold.
- Use public or synthetic fixtures in tests. Never persist a private root,
  ordinal, seed, coordinate, or path.

---

### Task 1: Lock the fallback contract with failing pure tests

**Files:**
- Modify: `tests/greaterRealmGateApronSearch.test.ts`
- Modify: `scripts/atlas/greater-realm-candidate-generator.ts` (exports only)

- [ ] Add a pure two-lane sequencing test: normal match skips repair; normal
  node/plan limits stay terminal; only normal no-match invokes repair.
- [ ] Add a repair-edge predicate matrix covering Lowlands ownership, dry
  endpoints, protected exclusion, Tier-II reserve exclusion, and foreign-child
  rejection.
- [ ] Add stable own-first option and frontier-cap tests, including shuffled
  input and a theoretical maximum of 128 complete plans.
- [ ] Run the focused test and record the expected red failures before adding
  implementation.

### Task 2: Implement separate reserve authority and bounded repair search

**Files:**
- Modify: `scripts/atlas/greater-realm-candidate-generator.ts`

- [ ] Preserve ordinary edge insertion and caches exactly.
- [ ] Collect eligible child-0 reserve edges in a distinct owned map and clear
  every retained private path on success and failure.
- [ ] Build repair-only bundles and sibling pairs with deterministic own-first
  selection.
- [ ] Extract capacity-frontier construction without changing normal ranking;
  cap only the repair frontier at 16 assignments and two pairs per parent.
- [ ] Run the ordinary lane first and the repair lane only after complete
  no-match. Retain the existing global search budgets.
- [ ] Assert reserve ownership and Lowlands apron ownership before commit.
- [ ] Run the focused tests to green.

### Task 3: Add integration regression evidence

**Files:**
- Modify: `tests/greaterRealmCandidateGenerator.test.ts`
- Modify as needed: `tests/greaterRealmTierTwoCapacityAuthority.test.ts`
- Modify as needed: `tests/greaterRealmAdvancedInvariants.test.ts`

- [ ] Prove the pinned ordinary fixture keeps its exact prior final digest and
  does not visit repair.
- [ ] Add a public deterministic fixture that visits repair and passes the
  final gate-footing and eligibility proofs.
- [ ] Prove every reserve cell remains region `0` and protected bytes remain
  unchanged.
- [ ] Recompute semantic-interface and immutable-perimeter density from final
  hydrology, and cover interleaved regions, detached islands, and tendrils with
  adversarial pure tests while retaining the 1,000-basis-point threshold.
- [ ] Run all focused generator, capacity, advanced-invariant, strategic-audit,
  and ordinary-yield suites.

### Task 4: Advance the coherent `.19` package contract

**Files:**
- Modify: `scripts/atlas/greater-realm-candidate-generator.ts`
- Modify: `scripts/atlas/greater-realm-candidate-rejection.ts`
- Modify: `tests/greaterRealmAttemptCheckpoint.test.ts`
- Modify: `tests/greaterRealmCandidatePackage.test.ts`
- Modify: `tests/greaterRealmCandidateRejection.test.ts`
- Modify: `docs/design/greater-realm-natural-continent.md`
- Modify: `docs/design/greater-realm-living-world-assets.md`
- Modify: `docs/security/greater-realm-private-generation.md`

- [ ] Change every exact generator/package pin from `.18` to `.19`, keeping the
  seed namespace `.3`.
- [ ] State that `.18` checkpoints/packages cannot resume or publish as `.19`.
- [ ] Run version/pin, checkpoint, rejection, package, and public-boundary tests.

### Task 5: Full verification and independent review

- [ ] Run `git diff --check`, typecheck, the complete test suite, build, runtime
  asset checks, public-boundary checks, release-gate checks, license checks,
  secret scans, and file-size checks from the isolated checkout.
- [ ] Independently review normal-selection preservation, memory/path cleanup,
  fallback bounds, reserve ownership, and private-data handling.
- [ ] Open and merge a protected successor only after all local gates pass;
  authenticate the exact push-triggered Verify run on protected `main`.

### Task 6: Fresh private C0 generation

- [ ] Start a new owner-private `.19` checkpoint; never resume `.18`.
- [ ] Generate the approved candidate batch, verify every package and preview,
  and display only approved preview images and aggregate evidence.
- [ ] Select and package the chosen candidate with an exact `.19` tuple. Any
  later C0 code change invalidates the package and restarts generation.
