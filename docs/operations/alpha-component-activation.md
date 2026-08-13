# Alpha component activation

This runbook covers the additive Gold, forest, Food, Wood, Water, and Stone records.
It does not publish a module, backfill resources, expand the world, dispatch a
wagon, or alter player data.

> Greater Realm cutover freeze: the former production inspection, component
> seed, and Water activation aliases are refusal stubs. There is no approved
> trusted-launch row for these operations in the current release, and direct
> TypeScript invocation is not a fallback.

## Inspect

Production v8/v10 inspection is unavailable during this freeze. A future
post-cutover packet must add an exact trusted-launch row before those
counts-only checks may resume. The historical operator and its npm aliases
must not be run directly.

## Seed one component

Production seed and Water-visibility activation are unavailable during this
freeze. Source-only review may still use the repository's local bindings and
additive-migration verifiers, which operate against generated or disposable
loopback state. Those checks do not authorize a production read or mutation.

A future post-cutover launch packet must separately bind the immutable
database, current aggregate, reviewed component policy, late credential,
single reducer attempt, postflight, and crash-recovery receipt. Until that
packet exists, no component may be seeded or activated from this runbook.
