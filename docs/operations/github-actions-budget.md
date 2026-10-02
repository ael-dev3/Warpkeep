# GitHub Actions operating policy

The current owner's policy is represented by
[the operational configuration](../../config/github-actions-budget.json).
Keep configurable limits there, rather than copying them into instructions,
handoffs or memories. This guide explains enforcement and evidence; it grants no
new permission and does not replace release acceptance.

## Current enforcement

Repository-wide Actions permissions are disabled for:

- `ael-dev3/Warpkeep`
- `ael-dev3/Warpkeep-Live`
- `ael-dev3/Warpkeep-Assets`
- `ael-dev3/Warpkeep-Water-Engine`

The global disabled setting is the hard stop. It covers automatic events,
explicit dispatches, reruns and downstream workflows across branches, including
hosted and self-hosted execution. An individual workflow catalog can still report
`active`; that state is distinct from the repository's `enabled: false`
permission. Account billing availability and commit skip markers do not replace
this setting.

Preserve the stop. Do not automatically enable Actions, dispatch or retry a run,
change billing, reset a branch or move a PR head to recover CI. Read-only evidence
inspection and local work can continue within the current task. A later policy
change must be reflected in both the owning configuration and actual settings,
with fresh readback; a plan that appears to fit does not perform that change.

### Check the current stop

Run `npm run verify:actions-hold` as a standalone operator check. Its
[operator script](../../scripts/check-github-actions-hold.mjs) uses GitHub GET
requests to inspect every configured repository's disabled permissions, each
active status and a second permission read. Unknown or nonempty queues fail the
check; it does not cancel work or change settings. It writes no file and is not
a normal build/test dependency.

This checks current settings and idle queues only. Retained full history,
attempts, source/PR refs and downstream-trigger review remain separate. Its
output does not claim a known daily total, atomic reservation or release pass.

## Continue local development and source backup

Use proportionate local tests, types, rendered controls and lifecycle checks.
Preserve active builds' exact source until their owned processes finish. Review
and sign coherent checkpoints, scan the complete outgoing range, push explicit
non-forced refs and verify the actual remote commit. Follow the existing
[synchronization procedure](0.4.0-development-sync.md); keep private state,
credentials and disposable outputs outside Git.

Before remote steps, reuse complete retained histories and refresh the applicable
activity, rerun attempts, global permissions, refs, PR identities and workflow
catalogs across every configured repository. Include downstream chains such as
main Verify to Pages and public-repository publication. Paginate active statuses
and any changed history. An incomplete response, ambiguous run or changed attempt
is unresolved evidence, not permission to repeat work.

Record source backup separately from PR integration, CI, deployment and usable
owner PTR. Disabling Actions preserves future execution capacity; it does not
prove that earlier daily usage was empty or that the game shipped.

## Accounting and plan estimates

[The pure accounting module](../../scripts/github-actions-budget.mjs) reads the
runtime configuration supplied by its caller and normalized complete evidence.
It rounds each allocated job separately, sums parallel jobs and all attempts
across repositories, and conservatively charges a midnight-straddling job's full
rounded duration to each touched UTC day. Workflow wall time is not the sum of job
allocations. All runner types are included by the current policy.

Unknown or active job costs, missing pagination, attempt gaps, malformed timing
and stale inventory hold accounting. Unknown daily totals remain unknown; partial
observations are labeled lower bounds. A never-started job is treated as having
no allocation only with terminal evidence, no runner, no start timestamp and an
empty step list. A success, skip or billing annotation alone does not prove this.

A bounded plan must include each job, setup/post execution, possible repeats and
all downstream allocations. Estimates are arithmetic, not atomic reservations.
The module refuses admission under the current disabled enforcement and cannot
enable, dispatch, rerun or change settings. It is a local reporting aid, not the
mechanism enforcing the hard stop or an exact GitHub billing statement.

## Release-route compatibility

The existing full hosted Verify and main-to-Pages route cannot be treated as a
bounded permitted lane merely by shortening one timeout or switching to manual
dispatch. Parallel jobs, reruns and downstream execution add allocations. A
manual run also does not replace a contract requiring genuine push-to-main
evidence.

Continue local release preparation and useful source repairs while that route is
held. A replacement needs explicit review of the actual source/check/artifact,
runner isolation, OIDC and provider-authority contracts. Keep those requirements
intact: do not relabel local receipts as successful GitHub CI, synthesize workflow
identity or execute arbitrary PR tests on the privileged production-admin runner.
Older directions to restore billing and rerun the entire lane are historical;
the current configuration and owner policy take precedence.
