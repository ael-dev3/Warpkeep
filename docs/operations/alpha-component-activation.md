# Alpha component activation

This runbook covers the additive Gold, forest, Food, Wood, Water, and Stone records.
It does not publish a module, backfill resources, expand the world, dispatch a
wagon, or alter player data.

## Inspect

Use the Hermes credential through the existing private input path. The v8
procedure returns only fixed policy identifiers, canonical digests, and table
counts; it never returns row data or player identifiers.

```sh
npm run stdb:inspect-alpha-v8 -- --json
npm run stdb:inspect-alpha-v10 -- --json
```

The check fails closed when the operator build and module disagree about a
policy version or digest, or when a catalog is neither empty nor complete.

## Seed one component

Review the local plan first:

```sh
npm run stdb:seed-alpha-component -- gold --dry-run
npm run stdb:seed-alpha-component -- forest --dry-run
npm run stdb:seed-alpha-component -- food --dry-run
npm run stdb:seed-alpha-component -- wood --dry-run
npm run stdb:seed-alpha-component -- water --dry-run
npm run stdb:seed-alpha-component -- stone --dry-run
```

This dry run does not connect, inspect live state, request a credential, or
submit a mutation. It presents the compiled policy for review; v8 covers the
older components and v10 covers Water and Stone.

After module publication and a fresh read-only inspection, apply only the
reviewed component by replacing `--dry-run` with `--confirm`. Confirmed seeds
are restricted to the immutable production database identity. Each command:

1. checks the relevant aggregate;
2. calls the existing Hermes-only canonical seed reducer only when needed;
3. checks the aggregate again and rejects unrelated count changes; and
4. emits a counts-and-policy-only receipt.

Exact reruns report `already-ready` without submitting a mutation. Partial or
unexpected catalogs are not repaired by this command; stop and investigate.

Water has a separate visibility gate. After its seed and a clean v10
inspection, use `npm run stdb:activate-alpha-water -- --dry-run`, then the same
command with `--confirm`. A final v10 inspection must report Water ready and
active with all counts unchanged.
