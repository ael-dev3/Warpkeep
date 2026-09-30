# Working on Warpkeep

Read [AGENTS.md](AGENTS.md) for project working rules, [README.md](README.md)
for product direction, and the [current execution handoff](docs/agent-notes/0.4.0/execution-handoff.md)
for the actual source, verification state and next action. The user's current
instructions take precedence over historical plans and evidence.

<!-- BEGIN github-actions-conservation -->
## GitHub Actions conservation

- Validate locally with checks proportionate to the change and inspect the diff. Batch related edits into coherent, reviewed checkpoints before remote actions; use local diagnosis to resolve failures and avoid repeated CI experiments.
- Before remote actions that may start, repeat, cancel or change Actions, inspect repository-wide workflow runs across branches and event types. Include queued/running runs, completed evidence and rerun attempts; paginate results as needed. Reuse applicable evidence and avoid duplicate runs while relevant work is already running.
- Inspect workflow triggers and downstream chains, including push/PR events, workflow_run, workflow_call/reusable workflows, tags/releases and deployments. Account for follow-on runs before pushes, PR updates, merges, dispatches, reruns or workflow/settings changes.
- Resolve limits and approval decisions from the user's current GitHub Actions policy and custom rules, including where they override older publish/merge defaults. This guidance grants no permissions. Keep numeric custom-rule limits and permission grants out of instruction files and memories so the current policy remains authoritative and independently changeable.
<!-- END github-actions-conservation -->
