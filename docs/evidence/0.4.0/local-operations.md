# Local operations evidence

Dated local and authenticated inventory. **Not deployment evidence.**

## Current source and protected checks — 2026-09-11

Windows and native WSL are synchronized on
`codex/prepared-keep-bindings-fix` at head `e664e2f4`. The functional source
checkpoint is `aef672061e22cebeec66a7d22bda92bcb459d9d1` with generated refreeze
`4bbe860b`. Every required Verify and CodeQL context is green on the head;
GitHub still reports the PR merge state as `BLOCKED` because protected `main`
requires signed commits and this development history is unsigned, so R14
remains a protection/merge reconciliation gate. The native release
evidence below is bound to those exact source coordinates; later documentation
commits do not create a new release candidate.

The hidden `Warpkeep Runner Keepalive` task was manually started once after its
registration and the `WarpkeepRunner` guest remained available. This verifies
the task action can hold the guest open in the current session; it does not
prove pre-logon, sleep or reboot availability.

## Dedicated runner repair — 2026-09-10

At 21:20 UTC, systemd reported the `WarpkeepRunner` service enabled/active/running
and GitHub reported existing Linux runner ID 22 online/idle. The repair completed
the existing installation's missing service helper and marker, after verifying
the unit against its installed official template. The fixed Node 22.22.3 bytes,
account UID/GID 1000 and path modes were independently checked. Empty sealed
private directories were subsequently provisioned with checked descriptors,
no-follow opens, owner-only modes and directory fsync. No credential or receipt
was created or migrated, and no protected production job was dispatched.

The workflow audit also reproduced a real executable defect: the G001 policy
operation failed CLI parsing despite being selected by the workflow. A regression
test failed at `phase: input` before the parser was repaired to share the dispatch
map. The executable now requires host attestation for that operation. See the
[runner guide](../../operations/0.4.0-linux-runner.md) for the precise operating
profile and remaining authenticated recovery composition.

Verification for this repair: pinned Windows Node 22.22.3 ran the four focused
operation/preflight/dispatch/workflow suites with 43 passing and 66 skipped
platform/fixture cases. Focused strict test types passed. The actual installed
Linux Node separately passed nine fresh-process CLI boundary checks with no
runner environment: all four supported operations stopped at host attestation,
and five unsupported/prototype names stopped at input. These do not execute a
privileged prepared operation. A direct Windows prepared-closure invocation
refused the unsupported POSIX repository boundary; no fresh full native closure
acceptance is claimed for this repair.

At approximately 21:30 UTC, a final availability check found `WarpkeepRunner`
stopped after interactive commands exited; GitHub consequently reported offline.
The enabled service restarted successfully when the guest reopened. A hidden
Windows WSL process now holds this exact guest open for the current session, and
the registered per-user `Warpkeep Runner Keepalive` task repeats that hold at
interactive logon. This does not establish availability before logon or after
Windows sleep. The [runner guide](../../operations/0.4.0-linux-runner.md)
includes the task details, idempotent manual command and limits.

## Native release assembler — 2026-09-11

The final marker-safe pass prepared and independently checked candidate
`release-workspace-342ea5448bfeb9bdf9dc51c7e31b67e4` from source tree
`5def926b9ad4f4cd940742a67bb5335f6b21a1ef`. Its family digest is
`c632804d2990d8f18c7bbf5405775a245139ddddc8fa5a99c01a44a5b69e10df` and its
closure manifest digest is
`0013fc94514cf623b829138d2fe2ed1564dc90498ce84e8cd516bd9aac7dd07b`.
The pass checked 3,181 source/candidate files, 101 generated outputs, 444
compiled bundle inputs and 7 recovery inputs. The closure verifier passed 1,195
members; the public-boundary verifier passed; and the activation artifact had
zero private marker tokens. This is still preparation evidence, not a release
grant.

The earlier functional source-bound checkpoint `22a834e6d7d0106e5d6cfd535a90692bdfe17ff5`
was prepared and independently checked again from the native checkout. Both
lanes returned candidate `release-workspace-328713ba2532b2dcef3815d7e9d7daa2`,
source tree `cec3750ef8a363b55b7f71cd55c0522e160be3a7`, family digest
`c9cf06c09bdd7c52869ecb6b06d091bc912141fae8277c4ad3f963edf43850d8`, closure
manifest digest `445e5f7131ba85dbbe89edb4b28abff39a9d584f73118fbe3ec35d051908320a`,
and transaction `58393eda2cb2d4b7c7226f972f5bd1cc`. They checked 3,181 source
files, 3,181 candidate files, 101 generated outputs, 444 compiled bundle
inputs and 7 recovery inputs. `finalReleasePrepared` remains false. Generated
protected-family refreeze `b8a6c5ab811f8ef6b2cf916d1446336428606823` passes the
native 1,195-member closure verifier. Later branch commits after this
functional checkpoint change documentation only and must not be treated as
native release candidates without a fresh source identity check.

After the closure refreeze, the synchronized native checkout completed both
release-assembler lanes at `c0e30a37` (`8bc06b320f3cddd53225e5d81b1e5965147e399b`):

- `prepare` created candidate `release-workspace-3f372602a3f664b8f5aa5931b28c3244`
  and wrote its owner-private prepared-source marker.
- Independent `check` rebuilt the family from a fresh draft and returned the
  same candidate transaction and digests.
- Both lanes checked 3,181 source files, 3,181 candidate files, 101 generated
  outputs, 444 compiled bundle inputs and 7 recovery inputs.
- The closure verifier passed at 1,195 members. The manifest was generated from
  Linux checkout bytes after the Windows CRLF discrepancy was identified.

This closes local native preparation and restart-safe candidate verification.
It does not establish GitHub protected workflow completion, recovery-service
deployment/readback, live Cloudflare or SpacetimeDB authority, owner admission,
physical-device performance, or final release approval.

## Current-head connected rerun — 2026-09-10

Against synchronized head `5b9ba9657d6e66319f41aabd396faf2a6c947b29`,
`npm run qa:fullstack:local` passed. The run covered the title-gateway
departure/focus matrix, exact-current Terms continuity, authoritative Inner
Keep City Mill start/completion and discounted Lumber Camp start, hard-reload
persistence, fresh-browser four-phase Worker re-entry, delayed/failing private
reads with in-place recovery, timeout/missing/torn/visibility seams, the
canonical browser realm, four-worker Gold/Food/Wood/Stone dispatch, individual
recall, Recall All, automatic settlement, return completion and released-node
reuse. The visual aggregate recorded 39 colour buckets, luminance range 178,
zero clipped black/white samples, and both cool high-albedo and warm low-green
sample families. This is disposable local synthetic evidence; it does not
establish physical-device performance, an authenticated owner journey or live
deployment acceptance.

## Windows connected full-stack QA — current source 2026-09-10

The latest recorded run came from synchronized checkout (`f5378daf`, functional
source `211b0b1a`); the published branch has since advanced to
`5b9ba9657d6e66319f41aabd396faf2a6c947b29`. `npm run qa:fullstack:local` passed
at that recorded source. The run repeated the title gateway
departure/focus matrix, restored Terms continuity, authoritative Inner Keep
start/completion and discounted construction, hard-reload persistence,
fresh-browser four-phase Worker re-entry, private-read retry seams,
timeout/missing/torn/visibility cases, four-worker Gold/Food/Wood/Stone
dispatch, individual recall, Recall All, automatic settlement, return
completion and released-node reuse. The visual aggregate again contained cool
high-albedo and warm low-green samples with zero clipped black or white
samples. This is synthetic desktop browser/runtime evidence; it does not
establish physical-phone performance, authenticated owner play or production
delivery.

## Windows connected full-stack QA — 2026-09-10

From the synchronized checkout (`e9f79984`, functional source checkpoint
`1c214e7f`), `npm run qa:fullstack:local` passed. The run covered the title
gateway departure/focus matrix (9 cases, 973 frames), restored Terms continuity,
authoritative Inner Keep City Mill start/completion, discounted Lumber Camp start
with one Builder, hard-reload persistence, fresh-browser four-phase Worker
re-entry, delayed/failing private reads, timeout/missing/torn/visibility seams,
four-worker Gold/Food/Wood/Stone dispatch, individual recall, Recall All,
automatic settlement, return-completion lifecycle and released-node reuse.
The visual aggregate contained 651 samples, 151 cool high-albedo samples and
150 warm low-green samples, with zero clipped black or white samples. This is
synthetic desktop browser/runtime evidence; it does not establish physical-phone
performance, authenticated owner play or production delivery.

## Windows Inner Keep browser QA — 2026-09-10

From the synchronized branch tip (`a3ef1822`, functional source `211b0b1a`),
`npm run qa:inner-keep` passed all 18 synthetic cases. The lane exercised the
single-renderer lifecycle, construction and completion states, schematic
fallback, responsive layouts and browser teardown. It is current Windows
browser evidence for the mobile visual foundation; it does not establish
physical-phone frame pacing, thermal behavior or authenticated owner acceptance.

## Repository-wide test host boundary — 2026-09-10

The focused 0.4 presentation suites, `npm run typecheck`, production build and
`npm run verify:visual-foundation` pass on the synchronized Windows checkout.
The repository-wide `npm test` command was also sampled after the `211b0b1a`
Worker presentation change, but it does not complete green on this host: its
failures cluster in protected operator, private-publication and signal/lifecycle
fixtures that require Unix permission and process-group semantics. Those suites
are covered by the dedicated Linux/CI rails; this Windows result is a host
capability boundary rather than a failed Keep04 assertion. Rerun the full suite
in the supported Linux runner before release evidence is sealed.

## Rendered WebGL host boundary — 2026-09-10

The generic `npm run qa:rendered-webgl` lane remains the signed macOS observer
probe because its contract attests `/Applications/Google Chrome.app` with
`codesign`. Running that command on Windows therefore fails closed before
renderer work when the macOS executable is absent. Windows coverage uses the
platform-aware `npm run qa:inner-keep`, `npm run qa:fullstack:local` and
Keep04 capture lanes; those lanes passed on this checkout. This host selection
boundary preserves the signed-browser contract and is not a product-renderer
failure.

## Windows preparation verifier — 2026-09-10

The published branch tip was cloned into a fresh Windows checkout with
`core.autocrlf=false` and verified with:

```sh
node scripts/verify-0.4.0-sealed-launch.mjs --phase=preparation
```

The verifier returned the checked-in sealed-launch profile with
`phase=preparation`, `packageVersion=0.3.43`, and `pagesDeploymentApproved=false`.
The exact policy-observation shell envelope used `bash.exe -n`, and the local
Git history adapter used `git.exe`; both preserve the existing fail-closed,
no-config checks. This closes the Windows host-command defect without changing
the production envelope or any realm state. The full Windows verifier suite
passed 166 tests; one symlink-only fixture is skipped because this host does not
permit creating symlinks. This is local preparation evidence, not deployment,
owner acceptance, physical-device, or live 0.4 evidence.

## Windows rendered QA profile cleanup — 2026-09-10

The current Windows browser probe initially reached its full scenario set but
failed while removing the disposable Chrome profile because Chromium still held
`first_party_sets.db`. The reviewed headless launch contracts now disable the
First Party Sets feature and the shared teardown removes transiently locked
profiles with a bounded retry for `EBUSY`, `EPERM` and `EACCES`; persistent
failures still fail closed. The rerun completed all 18 synthetic Inner Keep
cases and removed its disposable profile. This changes QA teardown reliability
only; it is not phone performance, owner gameplay or live-release evidence.

## Current local execution checkpoint — 2026-09-09

The Windows/GitHub source head and the dedicated Linux checkout now match
`206c03683c9039b513b878d7b0d3c6770eda2626` with source tree
`ebc91c6cc7bf205de22e331d127b1f2f7b8ba5da`. The pinned WarpkeepRunner Ubuntu
24.04 guest executed the current native materializer/child path successfully;
the operation-bundle runtime produced activation, G001, G002 and PTR lanes.
The program-artifact path also completed for both frozen G001 and current G002
modules, and the all-realms binding run completed without an error.

The compact all-realms result is retained in the local runner at
`/home/warpkeep/warpkeep-all-realms-206c036.json` and records:

| Lane | Result identity |
| --- | --- |
| G001 current | bundle `7811ce8485cb101e9bd864ca801ade3823353389832921554c757a847d8cf48a`; closure `fcc9b32282ff947da96738a15735aa809919f9229e2861d9a53cb0c98acb6e62`; 180 binding files |
| G001 frozen compatibility | bundle `a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49`; descriptor `cf3cbfff9087c04bd9de553410adb49100c40dbdecebc59e265f83cb904dd04d` |
| G002 | bundle `0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3`; closure `3135e65b47acf95b174adcf10d9453955afabde9f122382a0166b0a9d5bc26d5`; 50 bindings |
| PTR | bundle `0c8b531995779dc5102ece40e7b4d54ffc4af4809f3873b5231716795ee1e5bf`; closure `acd9fe64d963d38715183a0451e6cc21b25abbfed5092c787d7e01842ab91901`; 25 bindings |

The retained program-artifact manifest records G001 frozen bytes as SHA-256
`a2d7f204ed591aadb98696225d68332ee573519187e0989e68f528da8064cd49` and
Keccak-256 `70fe690512101acc1f63c9d2879cf4ee324e5a0a6df6dc0ad2feef6dc769858f`
(3,439,766 bytes), and G002 current bytes as SHA-256
`0037a0979a460aea8607a36fccd649d4311046925faeb3d8186276ac0a6ccbd3` and
Keccak-256 `0ec47634134fa4b0cdd8f55c8c04c1c002ed46c26676973ca7d4db3d0af4c786`
(3,648,993 bytes).

The separate program-artifact record uses Node 24.19.0 for frozen G001 and
Node 22.22.3 for current G002, with artifact SHA-256/Keccak provenance retained
in the runner output. This closes the local native execution gap for the
assembled artifact. It does not prove provider deployment, live owner admission,
physical-device acceptance, or the remaining R11–R13 production gates.

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
