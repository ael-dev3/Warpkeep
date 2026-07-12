# SpacetimeDB closed-alpha plan

Warpkeep contains a live TypeScript SpacetimeDB authority module under [`spacetimedb/`](../spacetimedb/). It is the first authoritative shared-world slice, not a browser mock. The production issuer chain is deployed; the browser reaches it only through the explicitly configured closed-alpha Pages build.

## Version contract

| Component | Pinned version |
| --- | --- |
| SpacetimeDB CLI | `2.6.1` (`052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`) |
| Browser client SDK | `2.6.1` |
| TypeScript server SDK | `2.6.1` |

Bindings are generated from the local module and committed at [`src/spacetime/module_bindings/`](../src/spacetime/module_bindings/). `npm run stdb:verify-bindings` regenerates to a temporary directory and fails on any difference. Private tables are deliberately absent from that generated browser surface.

## Identity and authorization

SpacetimeDB receives a bridge-issued OIDC JWT using `.withToken(jwt)`. The stable JWT subject is `farcaster:<verified decimal fid>`; no browser device record, reducer argument, or display field chooses the game account.

Connection lifecycle validates:

- exact issuer;
- expected audience;
- `token_type === "spacetime-access"`;
- a safe positive decimal FID and exact `sub`/FID match for player tokens;
- unsigned 32-bit `auth_epoch`;
- matching `session_iat`/`session_exp` claims with a maximum 30-day window,
  preserved through connection-token exchange and rechecked against module
  time on every player call;
- strict `service:hermes` / `roles: ["warpkeep-admin"]` shape for admin tokens.

`WARPKEEP_BACKEND_PROTOCOL_VERSION = 1` is a backend-only compatibility
contract, separate from the player-facing `ALPHA 0.2.0` release and the
player-facing `GENESIS 001` realm label (`HEGEMONY_GENESIS_001` internally).
A valid player or Hermes connection may call `get_alpha_backend_info` to read
only static protocol/world-seed metadata before using the shared realm; the
browser rejects a protocol/seed mismatch before admission, bootstrap, or public
table subscription. It does not expose private admission data or live player
aggregates.

Anonymous/no-token connections are rejected. Valid but unadmitted player JWTs may connect solely so `get_my_admission_status` can return a private, caller-specific status. Every gameplay reducer independently enforces the whitelist and auth epoch.

## Schema

| Table | Visibility | Purpose |
| --- | --- | --- |
| `allowed_fid` | private | FID primary key, enabled flag, auth epoch, invitation metadata and note. |
| `admin_audit` | private | Admin action trace only. |
| `world_tile` | public | Exactly 61 canonical radius-four Lowlands gameplay hexes. |
| `player` | public | One server identity and public profile projection per admitted FID. |
| `castle` | public | One persistent level-one keep per FID and one occupant per tile. |

The renderer's 30-cell radius-five visual apron is not authoritative data. No resource, building, unit, combat, alliance, chat, or season system is added in this slice.

## Admission and bootstrap

`get_my_admission_status` derives the caller from the signed JWT and exposes only:

```txt
not_admitted | admitted_needs_bootstrap | ready | disabled
```

`bootstrap_player` is transactional and idempotent:

1. derive FID from strict player claims;
2. require an enabled allowlist record and matching auth epoch;
3. preserve an existing consistent player/castle pair;
4. allocate the first deterministic unoccupied canonical tile (`0,0` first);
5. insert player and level-one castle, then atomically mark tile occupancy.

No denied call creates a player or castle. A changed auth epoch invalidates old player tokens at the module authorization layer. Before minting a new player token, the bridge resolves the current epoch through the documented private HTTP procedure `POST /v1/database/warpkeep-89e4u/call/admin_get_fid_auth_epoch`, authenticated by a fresh approximately 60-second Hermes OIDC JWT.

## Hermes-only operations

Admin reducers require the exact short-lived Hermes JWT shape:

```txt
admin_seed_world
admin_allow_fid
admin_disable_fid
admin_bump_auth_epoch
```

`admin_seed_world` is idempotent and refuses to overwrite a conflicting pre-existing world row. `admin_allow_fid` is idempotent; `admin_disable_fid` blocks gameplay immediately; `admin_bump_auth_epoch` revokes prior player tokens.

The admin-only procedures `admin_get_alpha_status` and `admin_get_fid_auth_epoch({ fid })` expose only aggregate counts or the current epoch needed by trusted Hermes/bridge services. The bridge calls the latter through the documented Maincloud HTTP `call` endpoint with a JSON `[fid]` argument and accepts only its raw unsigned 32-bit epoch result. They do not make the whitelist public.

Use the root Hermes wrapper only after bridge deployment:

```sh
npm run stdb:inspect-alpha
npm run stdb:seed-world -- --confirm
npm run stdb:allow-fid -- 12345 "invited through Farcaster DM" --confirm
```

The wrapper obtains an admin token in memory, never writes or prints it, supports `--dry-run`, and requires confirmation for mutations.

## Maincloud safety

The closed-alpha database is `warpkeep-89e4u` on `https://maincloud.spacetimedb.com`. The production-issuer module was published non-destructively after read-only inspection. Protected aggregate inspection reports exactly 61 world tiles, zero allowlist rows, zero enabled FIDs, zero players, and zero castles; a second seed remained at 61. The repository has no authority to clear it or add a real FID.

The publish guard refuses if the impossible placeholder returns, confirms the configured public issuer's discovery/JWKS are reachable, and requires `WARPKEEP_PUBLISH_CONFIRM=warpkeep-89e4u`. It invokes:

```txt
spacetime publish --server maincloud --module-path spacetimedb --delete-data=never --yes=remote warpkeep-89e4u
```

It never uses `--delete-data`, `--break-clients`, `--yes=all`, or destructive reset flags. After a safe publish, seed only the 61 world tiles and verify:

```txt
world_tile = 61
enabled real-user allowed_fid = 0
player = 0
castle = 0
```

If existing state differs, stop and report it; do not erase it automatically.

## What follows this slice

Only after the identity chain and empty-whitelist denial QA are live should Warpkeep add server-authoritative resource timers, building queues, units, scouting, combat, alliances, seasons, and public activity reports. AI can produce flavor or summaries, but never write authority tables directly.
