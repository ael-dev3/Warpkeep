# Marks policy v1

Status: **Alpha 0.3.2 candidate; not active in production**
Policy ID: `snap-current-linked-wallet-1to1-v1`
Last reviewed: 14 July 2026

Marks are Warpkeep's experimental Hegemony game-accounting unit. They are not a
token, payment instrument, investment, transferable asset, or promise of a
future benefit. Marks have no cash value, cannot be redeemed or transferred,
and may be corrected, changed, or reset while the Alpha is experimental.

## Conversion

SNAP and Marks both use six decimal places. An eligible finalized burn is
credited without rounding:

- `1.000000 SNAP` burned becomes `1.000000 Mark` earned;
- `0.250000 SNAP` burned becomes `0.250000 Mark` earned;
- one SNAP micro-unit becomes one Mark micro-unit.

For this policy version, spending is disabled and `spentMicros` remains zero.
The authoritative invariant is `balanceMicros = earnedMicros - spentMicros`.

## Pinned chain and event contract

- network: Ethereum mainnet, chain ID `1`;
- SNAP proxy: `0x49b5a631f54927c0007232844f06fe18cbf69786`;
- first scannable proxy block: `25,012,691`;
- token metadata: symbol `SNAP`, decimals `6`;
- reviewed implementation: `0xe9a747d64790d3ed0b647455b2f7503636f5e98a`;
- proxy bytecode hash: `0xa50288164ca4d99a6c559b6f601c35acc60fbf39e21b8c009d809ff35b955ed0`;
- implementation bytecode hash: `0x56d5edb395905863637b94ca9fde441c401b42e8353ad6f84deaf201182bf7c7`;
- `Burned(uint256,address,bytes32,uint256,uint32)` topic:
  `0x2bd3de8e7296e5766033a01c8991401d3f0b8b1dde97f35302773b62b2b0f4dc`.

This is an ordinary SNAP token burn on Ethereum mainnet. Warpkeep does not
describe or credit it as a HyperSnap-specific burn. The event's third indexed
argument is treated as opaque contract data and is never used to identify a
player or determine eligibility.

The scanner reads and reconciles chain ID `1` from both providers. It fails
closed if proxy code, implementation pointer, implementation code, token
metadata, event shape, source-chain field, or provider results differ from the
pinned policy. It also reconciles the proxy's upgrade events throughout every
scanned range and rechecks the approved implementation pointer, code hash, and
canonical block hash at each distinct burn-event block. A contract upgrade
pauses crediting until a new policy version is reviewed and published.

## Finality and attribution

Two separately configured Ethereum RPC providers must agree on the selected
finalized block and its hash. Logs are fetched in bounded ranges of at most
2,000 blocks, decoded independently, and compared exactly between providers,
including the otherwise uninterpreted third indexed word.
Removed, malformed, unfinalized, duplicated, or provider-disputed events are
not credited.

A finalized burn is eligible only when its sender is currently present as the
custody address or a verified EVM address for exactly one admitted FID in a
trusted Farcaster snapshot. Missing links and links shared by multiple FIDs are
quarantined. Historical wallet ownership is not inferred. One event key and one
burn ID can each be credited at most once.

Application is a private two-phase transaction. Batch begin freezes the exact
finalized cursor, range boundary hashes, wallet snapshot generation and count,
approved proxy/implementation code attestation, eligible event count, and
eligible micros total without advancing the cursor. Receipts are bound to that
pending batch. Finalize advances the cursor atomically only when the stored
counters and an indexed receipt recount both equal the frozen plan. Exact
receipt and batch retries are idempotent; a partial batch remains pending and
resumable.

## Privacy and visibility

Wallet snapshots, addresses, transaction references, block references, event
receipts, scan batches, scan cursors, and the authoritative Mark account remain private
server/operator state. Logs and public reports contain counts and policy status,
not FIDs paired with addresses, raw addresses, transaction hashes, RPC URLs,
tokens, or private upstream responses.

After a player's first intentional Alpha entry, the public realm profile may
show privacy-bounded aggregate totals: SNAP burned, Marks earned, Marks spent,
and Mark balance. It never exposes a linked address or individual event receipt.
The browser never scans or connects wallets and never requests a signature,
approval, transaction, payment, or custody.

## Correction and rollout

Credits are append-only receipts and balances are recomputed under the exact
policy invariant. A discrepancy, ambiguous attribution, reorganization,
provider disagreement, or implementation change stops the run for review; it
is not silently overwritten. A correction requires an auditable additive
policy/reducer action and must not edit production data without explicit
approval.

No production scan, credit, schema publication, admission, or public-stat
activation is implied by this document. Those remain separate, bounded rollout
gates.
