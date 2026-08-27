# Greater Realm C0 deterministic-yield repair

Status: approved under the 0.4.0 release authorization

Source baseline: protected `main` at
`f39d57c8622077e6543a16e5610d0e4ec73910da`

## Outcome

Advance the candidate generator from `.18` to `.19` without rerolling the
terrain namespace. Candidate generation must retain the existing ordinary
allocator byte-for-byte whenever it finds a plan, while adding one bounded
fallback for the recurring case where the immutable Lowlands reserve is the
only safe Lowlands-owned Tier-I/Tier-II apron contact.

## Non-negotiable boundaries

- `GREATER_REALM_TERRAIN_SEED_NAMESPACE` remains
  `greater-realm-v2-natural-continent-pr-a.3`.
- The ordinary apron edge set, option ranking, capacity ranking, diagonal
  search order, 20,000-node budget, and 128-complete-plan budget remain
  unchanged.
- The fallback is constructed only after the ordinary lane returns a complete
  `no-match`, including the equivalent empty ordinary capacity frontier. A
  normal match returns before fallback construction. Ordinary node-limit and
  complete-plan-limit results remain terminal and never widen into fallback.
- `legacyProtectedCell` is immutable and excluded from every endpoint,
  corridor, ownership forest, growth patch, and swap.
- A reserve endpoint is eligible only for child `0`, only when its original
  and trial owner remain Lowlands, and only when both sides of the tier boundary
  are dry. Reserve cells are never borrowed, donated, swapped, reassigned, or
  used by a foreign child or Tier-II ownership forest.
- The fallback does not relax the existing 512-cell borrowed-apron footprint,
  the final 64-cell robust-core proof, or the later 512-cell gate-footing
  authority. Every final gate is still independently reconstructed and proved.
- The unchanged 1,000-basis-point compactness threshold measures only edges
  against another passable semantic region. Final-water, sealed geological
  barrier, and off-grid perimeter are retained as a separate coordinate-free
  diagnostic. Connectivity, minor-fragment, and tendril gates remain
  independent, so immutable perimeter cannot conceal islands or thin regions.
- Private roots, seeds, ordinals, coordinates, candidate paths, and applicant or
  player identifiers never enter Git, test output, CI output, or diagnostics.

## Two-lane allocator

### Lane A: frozen ordinary search

Derive and search the same ordinary authority as `.18`. Standard discovery
continues to exclude every reserve and protected endpoint. Existing bundle
ranking and the first successful plan are unchanged.

### Lane B: bounded Lowlands repair

If and only if Lane A completes with no match:

1. Derive a separate Lowlands-reserve edge set. Each edge has child `0`, a dry
   reserve Tier-I endpoint owned by Lowlands, a dry non-reserve Tier-II
   endpoint in an eligible component, no protected cell in either endpoint or
   retained corridor, and the existing pair of vertex-disjoint approaches.
2. Build Lowlands bundles from that separate edge set without inserting them
   into ordinary caches or rankings.
3. For every non-Lowlands child, prefer compatible own-region bundles. Borrow
   non-Lowlands terrain only when that child has no own option; the existing
   count-balanced 512-cell repartition remains mandatory for such borrowing.
4. Rank repair candidates deterministically, retain at most 16 capacity
   assignments, and retain at most two sibling pairs per parent. Therefore the
   theoretical complete frontier is at most `16 * 2 * 2 * 2 = 128`.
5. Search that frontier with the existing 20,000-node and 128-complete-plan
   ceilings. Do not add a larger diagnostic budget or a special global parent
   order.
6. Before committing a repair plan, assert that every reserve cell still has
   region `0`, every selected Lowlands apron cell has original and trial owner
   `0`, and all ordinary count, connectivity, hydrology, barrier, and final
   gate proofs remain true.

## Verification contract

Focused tests must prove:

- a normal match never constructs or visits the repair lane;
- ordinary limit outcomes remain terminal;
- only a dry, non-protected, Lowlands-owned reserve endpoint can enter the
  repair edge set;
- protected cells, Tier-II reserve cells, foreign children, foreign ownership,
  and reserve mutation are rejected;
- fallback option ordering is deterministic and own-first;
- the repair frontier remains at most 16 assignments, two pairs per parent,
  and 128 complete plans regardless of input order;
- all reserve cells remain Lowlands-owned after repartition;
- semantic-interface compactness rejects adversarial interleaving while the
  separate immutable-perimeter diagnostic does not suppress fragmentation or
  tendril failures;
- the pinned public ordinary fixture retains its exact `.18` final digest under
  `.19`, demonstrating that Lane A is unchanged;
- at least one non-secret deterministic fixture reaches Lane B and still passes
  the existing final 512-footing and full eligibility proof.

Before any private `.19` generation, all generator-version pins in code, tests,
design documentation, security documentation, rejection tooling, and package
evidence must name `.19`. A `.18` checkpoint or package is not resumable under
`.19`; generation starts from a fresh owner-private checkpoint.
