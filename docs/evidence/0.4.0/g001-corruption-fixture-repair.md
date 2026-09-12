# G001 corruption fixture repair — 2026-09-07

CI run 34085974535, Linux job 101629971509, failed before exercising corruption:
`writeFileSync` received EACCES for Git's read-only loose object. The fixture now
checks that each object is a regular, non-symlink, single-link file in its
`--no-hardlinks` disposable clone before making that copy owner-writable.
Production source verification is unchanged.

The subsequent native Linux run reached all four corruption checks but exceeded
the default ten-second test timeout (12.7 seconds for this history-copy test).
This fixture now has a 120-second test allowance, with explicit 60-second limits
on clone and each unpack command. The unpack shell replaces itself with Git so
timeout termination targets Git directly. No gameplay, renderer, production
timeout, or acceptance budget changed.

Final verification: all 8 native Linux tests passed in 21.5 seconds, including
the four-object corruption case (10.5 seconds). Root `tsc -b` and diff check
passed. Independent review remains pending; no review approval is claimed.

Native Ubuntu 24.04 / Node 22.22.3 command:
`node node_modules/vitest/vitest.mjs run tests/genesis001BindingFrozenSource.test.ts`.
Git corruption diagnostics are expected negative-test output, not corruption of
the development repository. This evidence does not establish live G001 preservation.
