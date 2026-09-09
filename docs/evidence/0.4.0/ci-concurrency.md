# PR verification backlog repair — 2026-09-07

Current source is `47a85607e0df68f9c6f491be84e797436c1cbc0e`; its Verify and
CodeQL runs are the active authority for the branch. The historical cleanup and
run identifiers below retain their original scope.

Authenticated inspection found 19 nonterminal Verify runs for PR228, including
current head `1c8591e7949e625ace7a1b6e981752a028dda704`. There was no Verify
concurrency policy. Repeated development pushes had left superseded work
competing with current-head verification. This is an R14 workflow-throughput
repair; it adds no release acceptance gate and skips no test.

Verify now uses a `verify-pr-` group keyed by PR number, falling back to the
unique run ID for other events. Cancellation is conditional on `pull_request`.
Consequently separate PRs do not cancel each other, and main pushes retain
independent runs. Pages keeps its separate `warpkeep-production-state` group
with `cancel-in-progress: false`. Implementation follows GitHub's documented
[conditional concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency).

`workflowSecurity.test.ts` and `recoveryVerificationWorkflow.test.ts`: 19 tests
passed on Node 22.22.3. The new regression checks the parsed Verify group and
cancellation expression, absence of job overrides, and unchanged Pages lock.
Required jobs, permission scopes, and aggregate success conditions are unchanged.

One-time cleanup requested cancellation of these exact superseded Verify runs:

```text
34139054051 34138724996 34138148964 34137698550 34137494699 34137174570
34136876699 34136552711 34136309020 34135978991 34135782273 34135569580
34135302582 34135048391 34134740704 34134518399 34133926555 34133697871
```

Before each request, authenticated run metadata was re-read and required the
exact Verify path, pull_request event, this branch, sole PR228 association, and
a non-current source SHA proven locally to be an ancestor of current PR head.
Completed runs were excluded. All 18 normal cancellation requests were accepted;
the next read confirmed 15 completed/cancelled and three still in progress
while cancellation drained (34138724996, 34136876699, 34135569580). No forced
cancellation, run deletion, production workflow, other PR, or main run was used.

Current-head Verify run 34139910959 was preserved and subsequently reported
in_progress. That is evidence of execution, not a passing CI or release result.
Old workflow versions did not have the new concurrency group, so this one-time
cleanup was needed; future superseded PR runs use the checked-in policy.
