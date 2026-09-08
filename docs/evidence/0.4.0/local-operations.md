# Local operations evidence

2026-09-09 authenticated/read-only inventory. **Not deployment evidence.**

## Current local execution checkpoint — 2026-09-09

The Windows/GitHub source head is `051a189`; the dedicated Linux operating
checkout is `d6cfc5c` and has matching native preparation/rebuild provenance.
Linux G001 policy preparation, the privileged caller suite, and bounded
source/private-record scenarios passed. A dedicated GitHub Actions runner was
registered as `warpkeep-wsl-production-01` (runner id 22) but is offline: its
service installation timed out while the WSL PID 1 remained in a kernel wait.
Only the dedicated `WarpkeepRunner` distro termination was requested after the
protected jobs finished; no other distro was restarted. No provider secret was
read, no production workflow was dispatched, and no live mutation was made.

The protected closure audit now includes the complete Linux G001 native
launcher, materializer, child, boundary, runtime helpers, synthetic entry,
workflow evidence codec and source manifest at 1,193 members. The remaining
operating gap is concrete: the native materializer and child still need to
execute inside the assembled WarpkeepRunner artifact before R11–R13 can close.

## GitHub runner gap

Command: `gh api repos/ael-dev3/Warpkeep/actions/runners` with output restricted
to runner identifiers, labels and status (no tokens).

Only one runner was returned: id21, `warpkeep-production-runner-01`, macOS,
offline, not busy. Labels: self-hosted, macOS, ARM64,
warpkeep-production-admin, warpkeep-repository-exclusive.
No local Windows/Linux repository runner is registered in this inventory.
Do not restart or rely on this Mac: the owner excluded it from the release path.

Current checkout workflow dependencies found:

| Workflow | macOS-dependent locations |
| --- | --- |
| `.github/workflows/verify.yml` | native contract job at328 and OS assertion at340 |
| `.github/workflows/sealed-realms-production.yml` | production runner labels at48–53 |
| `.github/workflows/deploy-pages.yml` | production runner labels at452 and627 |
| `.github/workflows/notification-bridge-b0.yml` | runner labels at24 |
| `.github/workflows/notification-bridge-prepared.yml` | runner labels at32 |

These are source migration points, not permission to replace macOS labels alone:
toolchain, identity, workflow provenance, private state, and deployment checks must
agree with the actual supported local runner. Keep unprivileged verification
separate from production credentials. No runner registration/token creation,
workflow dispatch or provider write was performed during this inventory.

## Hosting and environment observations

`gh api repos/ael-dev3/Warpkeep/pages` confirms workflow-based GitHub Pages,
custom domain warpkeep.com, URL https://warpkeep.com/, HTTPS enforced.
Returned Pages status was null; it does not prove live health or version.

`gh api repos/ael-dev3/Warpkeep/environments` returned:
- github-pages: custom deployment branch policy.
- notification-bridge-b0: protected-branches deployment policy.
- notification-bridge-prepared: protected-branches deployment policy.

Only branch-policy protection rules were shown by this response. Do not infer
that repository branch protections or other deployment constraints are absent.
Preserve applicable protections and revalidate before deployment.

## Remaining acceptance

### Cloudflare authenticated CLI recheck — 2026-09-06

Repo-local Wrangler `services/auth-bridge/node_modules/wrangler/bin/wrangler.js`
reports 4.110.0 under pinned Windows Node 22.22.3. No installation performed.
Default `whoami` in the isolated checkout selects account
`48862210185b802e4244417031acb51b`, **not Warpkeep production**.

`auth list` shows existing profile `warpkeep-production`, bound to the sibling
`Warpkeep` checkout. `whoami --profile` is rejected by this installed CLI;
`whoami --cwd` pointing at that existing bound checkout confirms account
`c647739b4535010b0b13e6fc296e2c4e`, OAuth authentication and Workers write scopes.
No profile activation/global credential change was made and no token was printed.

Successful authenticated read:
`deployments list --profile warpkeep-production --name warpkeep-auth-bridge --json`.
The newest returned deployment by created_on is
`ec7c0f41-1404-40f8-9330-3c531afae621`, created
2026-08-28T07:54:39.545445Z, with version
`79dfceec-9810-4868-afca-5b794d08a9a5` at 100 percent. Its annotation names B0
source `308f901d91a1fb68d90f157a2ec164ed1acaf51d`; that annotation is not independent
source-byte attestation. Route binding, deployed bytes/config and live protocol
checks remain required. This demonstrates real provider interaction, not a
deployment attempt or proof of every required permission.

All later Cloudflare operations from this isolated checkout must explicitly use
the correct existing production profile and recheck the target. Never infer the
default account is production. Installed-command help and the
[Wrangler command reference](https://developers.cloudflare.com/workers/wrangler/commands/)
were consulted for this read-only check.

Public discovery and JWKS reads also succeed on 2026-09-06 using curl with
15-second timeout, no redirects and 65536-byte size limit. Discovery at
`https://auth.warpkeep.com/.well-known/openid-configuration` names that exact
issuer and `https://auth.warpkeep.com/.well-known/jwks.json`, with ES256 support.
JWKS advertises `kid=warpkeep-alpha-2026-07-01`, EC/P-256, ES256, use=sig.
These are reachable public metadata endpoints, not a verified token signature,
owner login, private-key possession, or proof of PTR-specific JWT/database claims.

### SpacetimeDB authenticated CLI recheck — 2026-09-06

Installed Windows CLI at
`%LOCALAPPDATA%/Programs/SpacetimeDB/2.6.1/spacetime.exe` reports 2.6.1,
commit `052c83fe984a4c4eb7bb4f9afa5c6b1903891d87`.
`login show` (without `--token`) confirms the recorded publisher identity.
`server ping maincloud` succeeds for https://maincloud.spacetimedb.com.
`list --server maincloud --yes` authenticates and returns these Warpkeep mappings:

| Database | Immutable identity |
| --- | --- |
| warpkeep | c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e |
| warpkeep-genesis-002 | c2003223f6e3c86e988775ddd458c3a45635d0d021e11131551471617c392194 |
| warpkeep-ptr | c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e |

`describe --server maincloud --no-config --yes --json warpkeep-ptr` succeeds;
schema metadata returns 24 tables, 10 reducers and 7 miscellaneous exports.
No table rows, signing keys or auth tokens were requested or printed. The CLI
warns these commands are unstable; record the version with evidence.

This proves configured CLI authentication, endpoint reachability, associated
database identities and a schema read. It does not prove current owner gameplay
admission, deployed module digest, receipt authority, row-read permissions or
successful production mutation. Do not use schema counts as a module hash or
as evidence that 0.4 gameplay is deployed. No database mutation occurred.

### Recorded frontend deployment candidate

Authenticated read on 2026-09-06:
`gh api 'repos/ael-dev3/Warpkeep/deployments?environment=github-pages&per_page=3'`
returned latest listed deployment `6104429969`, created 2026-08-26T13:07:39Z,
ref `main`, source `f39d57c8622077e6543a16e5610d0e4ec73910da`.
`gh api repos/ael-dev3/Warpkeep/deployments/6104429969/statuses`
returned success status `17361302492` at 2026-08-26T13:08:35Z for
https://warpkeep.com/, linked to Actions run `32970007073`, job `98188899707`.

This is provider-recorded deployment history, not proof of currently served
bytes, the frontend version, or a complete G001 baseline. Before mutation,
bind the live frontend bytes/artifact identity to the deployment and separately
capture service/module identities and the private admitted-player baseline.
No production changes were made by these reads.

Follow-up authenticated reads of `actions/runs/32970007073` and its `/artifacts`
endpoint bind that deployment history to completed/successful `Deploy GitHub
Pages`, workflow `.github/workflows/deploy-pages.yml`, event `workflow_run`,
attempt 1, the same source SHA, and one `github-pages` artifact:

- Artifact ID: `9608080344`.
- Size: `78449586` bytes.
- Provider digest: `sha256:bc4f3c14c398b2263b7dca233b378c82f5b931c82e35f81a3baa92a700fbf715`.
- Created: 2026-08-26T13:07:36Z; expired: 2026-08-27T13:07:33Z.
- API explicitly reports `expired: true` on 2026-09-06.

The expired artifact metadata is historical provenance only. Its bytes have not
been recovered or verified, and it is not an available rollback package. Do not
claim that a fresh rebuild reproduces this archive digest without comparing
actual bytes. Establish the served-byte baseline and a tested forward-compatible
recovery artifact independently before production mutation; preserve live player
writes throughout recovery.

Public live HEAD check at response Date 2026-09-06T15:20:22Z:
`curl.exe --head --silent --show-error --max-time 15 --max-redirs 0 https://warpkeep.com/`
returned HTTP 200, GitHub.com server, HTML UTF-8, Content-Length 5351,
Last-Modified 2026-08-26T13:08:19Z, and ETag `"6a8ee543-14e7"`.
This confirms a reachable frontend response and is temporally consistent with
the recorded deployment. The ETag is not a SHA-256 digest; HEAD does not verify
body bytes, loaded assets, application health, or source identity. Do not use it
as an artifact hash or mark the G001 preservation gate complete.

Follow-up bounded GET (System.Net.Http.HttpClient, redirects disabled, 15-second
timeout, 65536-byte maximum response buffer) at response Date
2026-09-06T15:22:27Z returned 5351 bytes, HTTP 200, same ETag, final URL
https://warpkeep.com/. SHA-256 of the raw response bytes:
`e8139922fac3619edff5cbece46a3d9516b75b2b26801935068459502b57d061`.
The fetched HTML references `/assets/application-CJkabyye.js` and
`/assets/application-BRbFA04E.css`; those names are observations, not verified
content digests. This records the served entry-document identity only. Transitive
assets, exact source binding and full application/realm health remain unverified.

R11/R12 remain incomplete: supported local runner/execution setup, source workflow
migration, complete local release execution, genuine workflow/OIDC evidence where
required, and isolated recovery verification. Cloudflare and SpacetimeDB targeting
need separate fresh authenticated checks. Frontend setting verification alone
does not satisfy the complete hosting or live-release gates.
