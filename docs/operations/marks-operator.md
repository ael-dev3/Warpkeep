# Local Marks operator

The Alpha 0.3.2 Marks operator is an offline-first, fail-closed macOS utility. It recognizes the canonical normal SNAP `Burned(...)` event on Ethereum mainnet and prepares privacy-safe 1:1 Mark-credit dry runs. It does not connect a browser wallet, initiate a burn, write directly to database tables, or make a production credit.

`marks:apply` is deliberately unavailable. It always exits with
`MARKS_APPLY_DISABLED`, even when `--confirm` is supplied. The deployed
protocol-3 module has private generation-CAS wallet snapshots and a resumable
two-phase scan batch, but this utility intentionally has no admin application
transport until that end-to-end path and a fresh production approval gate are
separately reviewed. Do not bypass it with direct table writes.

## Commands and network defaults

| Command | Network by default | Effect |
| --- | --- | --- |
| `npm run marks:plan` | No | Writes the current policy/capability plan. |
| `npm run marks:scan -- --dry-run --input-stdin` | Only after both opt-ins | Runs a resumable two-provider finalized scan and writes a private reconciliation report. |
| `npm run marks:reconcile -- --input-stdin` | No | Compares privacy-safe scan and database aggregates supplied by the private wrapper. |
| `npm run marks:inspect` | No | Reads report metadata only; it never opens report bodies. |
| `npm run marks:apply -- --confirm` | No | Fails closed because application transport and production approval are deliberately absent. |

RPC URLs, bearer material, trusted wallet links, FIDs, and the optional report-alias HMAC key are accepted only in a bounded JSON document on stdin. The CLI rejects endpoint- or credential-shaped argv. It does not read RPC/admin configuration from environment variables. A scan without both `--dry-run` and `--input-stdin` stops before network access.

The scan requires two distinct HTTPS provider origins (or distinct loopback origins for controlled fixtures). Both must independently return chain ID `1` before the operator reads a finalized head. The operator reconciles their common finalized block, resolves the EIP-1967 implementation, and pins proxy bytecode, implementation bytecode, symbol, decimals, and event topic. Every scanned range also reconciles standard EIP-1967 `Upgraded(address)` logs, and every distinct burn-event block is checked against the canonical block hash, approved implementation pointer, and approved implementation bytecode hash. The third indexed burn word remains semantically opaque, but providers must agree on it exactly.

Each `eth_getLogs` request covers at most 2,000 inclusive blocks. The planning horizon is capped before ranges are allocated; a run processes at most 256 ranges and attests at most 4,096 distinct event blocks. Responses are byte-capped while streaming, JSON-RPC protocol/request IDs are checked, and each run has a cumulative event ceiling. Provider disagreement, cursor hash disagreement, reorg evidence, any unapproved historical upgrade, an event-block implementation mismatch, or metadata drift stops before a report can claim reconciliation.

The private scan input has this shape. Replace placeholders only inside the Keychain item or another owner-only stdin producer—never commit a populated copy:

```json
{
  "rpcProviders": [
    { "url": "https://<independent-provider-one>", "authorization": "<private-value>" },
    { "url": "https://<independent-provider-two>", "authorization": "<private-value>" }
  ],
  "trustedWallets": [
    { "fid": "<decimal-fid>", "address": "<current-linked-wallet>", "active": true, "whitelisted": true }
  ],
  "cursor": {
    "lastFinalizedBlock": "<decimal-block>",
    "lastFinalizedBlockHash": "<canonical-block-hash>"
  },
  "maximumRanges": 64,
  "reportAliasKey": "<keychain-only-random-value-at-least-32-bytes>"
}
```

Omit `cursor` for the first dry run. Copy the cursor from the prior private report for the next run. The optional alias key creates stable HMAC account aliases for private per-account reconciliation; it is never written to the report. Without it, reports remain counts-only. Never move raw event receipts, wallet links, transaction hashes, or populated input JSON into tickets, commits, chat, screenshots, shell history, or logs.

`marks:reconcile` accepts exactly `scan` and `database` aggregate objects. Each contains `policyId`, integer `creditedEvents`, integer `creditedAccounts`, and decimal-string `creditedMicros`. All four fields must match exactly and the micros total must fit the u128 ledger bound. Obtain the database aggregate only through the separate canonical, counts-only Keychain wrapper; this runner intentionally has no general-purpose SpacetimeDB endpoint or table-write transport.

The deployed, currently unused server transaction is intentionally two phase. A complete
wallet snapshot is replaced atomically only when no batch is pending. Batch
begin compare-and-swaps the exact finalized cursor and freezes the snapshot
generation/count, range hashes, implementation attestation, expected receipt
count, and expected micros without moving the cursor. Each immutable receipt is
bound to that batch and deduplicated through indexed event and burn references.
Finalize recomputes only the batch's receipt aggregate and advances the cursor
in the same transaction after exact equality. A crash leaves a resumable
pending batch; it never silently deletes the batch or skips the range. An
incorrect frozen total can require a reviewed schema/recovery action, so apply
must remain disabled until the wrapper proves plan construction and recovery on
a disposable local database.

Reports live by default in `~/Library/Application Support/Warpkeep/marks/reports`. The operator enforces mode `0700` on that directory and `0600` on each atomically written report. Reports contain policy/attestation outcomes, aggregate counts, integer micros, a resumable finalized cursor, and optional HMAC aliases. They exclude endpoints, credentials, raw FIDs, wallet addresses, transaction hashes, and event receipts. `.operator.lock` prevents overlapping runs and is never automatically treated as stale.

## Non-root launchd installation

Do not install the scheduler until a complete manual dry run has been reviewed. The supplied templates are inert and contain no production values:

- `scripts/marks/launchd/com.warpkeep.marks-scan.plist.template`
- `scripts/marks/launchd/marks-keychain-wrapper.zsh.template`

1. In Keychain Access, create a generic-password item with account `warpkeep-marks-operator` and service `com.warpkeep.marks-scan-input`. Paste the complete compact scan-input JSON into its password field. Using Keychain Access avoids exposing it in a shell argument.
2. Copy the wrapper template into an owner-only directory outside the repository. Replace only the repository and Node executable placeholders. Set its mode to `0700`.
3. Copy the plist template to `~/Library/LaunchAgents/com.warpkeep.marks-scan.plist`. Replace its two path placeholders; do not add secrets, endpoints, or environment variables. Set its mode to `0600` and validate it with `plutil -lint`.
4. Load it as the signed-in user with `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.warpkeep.marks-scan.plist`. Never use `sudo` and never install it as a daemon.
5. Trigger one supervised dry run with `launchctl kickstart -k gui/$(id -u)/com.warpkeep.marks-scan`, then inspect counts with `npm run marks:inspect`. Review the new private report locally.

The template runs daily at 03:17 local time, suppresses launchd stdout/stderr, uses a conservative throttle, and retrieves the entire private input directly from Keychain into the operator's stdin. Scheduling does not enable `apply`.

To uninstall, first run `launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.warpkeep.marks-scan.plist`, then remove the copied plist and private wrapper. Keep or securely archive the private reports according to the owner retention policy. Delete the Keychain item in Keychain Access only when the scanner is retired; secret deletion/rotation remains an explicit owner action.

If inspection reports a lock after a crash, verify in Activity Monitor that no Marks operator process exists before removing `.operator.lock`. Never automatically delete or age out a lock. A live process, unexplained cursor mismatch, provider disagreement, or contract attestation mismatch is a hard stop requiring review—not a retry loop.

## Public Farcaster profile operator

Profile refresh is a separate, public-data-only operator. It does not call the
Marks scanner and cannot mutate admission, wallets, castles, Marks, or world
state. Its only mutation capability is the existing
`admin_upsert_realm_profile_v1` reducer.

| Command | Network by default | Effect |
| --- | --- | --- |
| `npm run profiles:plan` | No | Writes capability metadata only. |
| `npm run profiles:refresh -- --input-stdin --dry-run` | Yes, bounded read-only | Reads the code-pinned official Snapchain current-user envelope for every authoritative founded profile, retains only four public presentation fields, and writes an exact reviewed plan; it performs no reducer call. |
| `npm run profiles:apply -- --input-stdin --confirm` | Maincloud only | Applies one fresh, previously reviewed plan without re-fetching Farcaster data, then performs a fresh read-only verification. |
| `npm run profiles:inspect` | No | Reads private operator-report metadata only. |

Production profile refresh uses one code-pinned, owner-reviewed Farcaster
source. Its host provenance, TLS surface, and API contract are attested as
separate claims rather than inferred from one another. The CLI accepts no URL,
origin, API key, authorization header, or FID list in private input. Adding
credentials or changing the source requires a reviewed code change and changes
the source-configuration digest, invalidating every older plan.

Refresh stdin contains only the pinned source ID. The operator first reads the
authoritative current profile rows and derives the complete founded set in
memory; callers cannot omit or add a FID. Keep even this control document in an
owner-only stdin producer:

```json
{
  "source": {
    "sourceId": "owner-reviewed-snapchain-mainnet-v1"
  }
}
```

The operator requests one bounded `/v1/userDataByFid` current envelope per
authoritative founder. It validates every returned message against the expected
FID, mainnet, and user-data contract, then retains only `USERNAME`, `DISPLAY`,
`BIO`, and `PFP`; unrelated user-data fields are discarded and never persisted
or reported. Redirects and pagination are rejected, response bodies and
deadlines are bounded, and PFP URLs are re-sanitized. A successful complete
current envelope can authoritatively clear a field; only unavailable or
incomplete responses retain last-known-good public data.

The dry run reads the canonical current profile rows and writes a private
`profiles-reviewed-plan-*.json` file in
`~/Library/Application Support/Warpkeep/profiles/reports`. The artifact contains
the sanitized current and intended public profile fields needed for exact
precondition checks, so it is sensitive operational material even though the
fields are public. The directory is mode `0700`; the atomically published plan
is mode `0600`, content-attested, expires after 30 minutes, and can be claimed
only once. Review it locally in an owner-only editor. Never paste its contents
into chat, tickets, screenshots, commits, or shell history.

Refresh returns only the plan filename, SHA-256 digest, and expiry. After local
review, pass that exact reference to apply through stdin:

```json
{
  "reviewedPlan": {
    "filename": "profiles-reviewed-plan-<timestamp>-<id>.json",
    "sha256": "<digest-returned-by-refresh>"
  }
}
```

Apply verifies the file mode, content digest, policy/source/target attestation,
expiry, and unchanged database preconditions before it creates a one-use claim
and submits any reducer. It never contacts Snapchain. Every reducer has its own
bounded deadline. Before submission and after each result, the operator
atomically appends a mode-`0600`, identity-free audit event. A timeout or
unexpected disconnect is recorded as ambiguous and is never retried. A
disconnect error cannot replace a reducer result. Finally, a fresh read-only
subscription checks every intended profile; mismatch or unavailable
verification exits fail-closed. Create a new dry run after any failed,
ambiguous, expired, drifted, or already-claimed plan.
