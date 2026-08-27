# Genesis 001 admission-monitor suspension

The local Hermes admission monitor is read-only: it inventories pending access
requests and emits private operator notifications, but it cannot admit, allow,
reset, disable, or otherwise mutate a player. Even so, the 0.4.0 cutover treats
it as part of the admission process and persistently suspends it before Pages can
present Genesis 002.

Keep the monitor running until both of these operations have completed:

1. the exact same-schema Genesis 001 freeze is deployed and independently
   verified; and
2. the stable, two-pass applicant census has been written to the private
   administrator Desktop.

Then run the suspension operator from a clean, detached checkout whose `HEAD`
and local `origin/main` both equal the reviewed protected-main commit. Inspect
first:

```sh
node node_modules/tsx/dist/cli.mjs \
  scripts/genesis001-admission-monitor-suspension.ts \
  inspect \
  --source-commit <40-hex-protected-main-commit>
```

The operator accepts only the fixed launchd label, mode-0600 plist, mode-0700
program, and reviewed SHA-256 values checked into its source. It ignores ambient
`HOME`, passes a minimal environment to system children, and emits no monitor
output or applicant data.

After the census file has been verified, persistently disable and unload the
exact job:

```sh
node node_modules/tsx/dist/cli.mjs \
  scripts/genesis001-admission-monitor-suspension.ts \
  suspend \
  --source-commit <40-hex-protected-main-commit> \
  --confirm GENESIS_001_ADMISSION_MONITOR_SUSPEND
```

The operator reconciles an ambiguous `launchctl` response only from fresh exact
state, requires two final disabled-and-unloaded observations, and never deletes
the plist or program. It writes a non-overwritable mode-0600 receipt beneath the
canonical administrator `Library/Application Support/Warpkeep/operations/audit/private`
directory. Terminal output contains only the receipt basename and digest. Bind
that digest into the 0.4.0 activation receipt; do not copy the private receipt
into Git, CI, tickets, or chat.

The retained files make suspension reversible, but this release intentionally
contains no re-enable command. Re-enabling requires the future reviewed
admission implementation and a new operator contract.
