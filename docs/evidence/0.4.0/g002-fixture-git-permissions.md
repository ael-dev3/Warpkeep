# G002 fixture Git permissions — 2026-09-07

CI run 34085974535 failed at production Git context-file attestation in the
G002 native fixture. The local default-mask run passed; running the same source
with `umask 027` reproduced the exact error and stack. Git-created context files
then have mode 0640, outside the verifier's exact 0600/0644 contract. This is a
reproduced cause, not proof of the original runner's unrecorded umask.

The fixture now explicitly sets its own Git config and optional info/exclude
to 0600 after initialization. The native test checks these permissions before
using the real committed-tree materializer. No production verifier changed.

Final Ubuntu 24.04, Node 22.22.3, Vitest 4.1.9 verification under umask 027:
`vitest run tests/genesis002BindingLinuxLockedSourceBuildNative.test.ts tests/genesis002BindingLinuxLockedSourceBuild.test.ts`
passed all 30 tests. Root `tsc -b` passed. The initial missing-import error during
implementation was corrected before these final runs.

This verifies fixture setup and local source-materialization behavior only.
CI confirmation, independent review, final release assembly and live acceptance
remain pending.
