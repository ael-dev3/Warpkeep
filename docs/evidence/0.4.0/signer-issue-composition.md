# Recovery issuance composition — 2026-09-07

R12 remains incomplete. `RecoverySigner.issue` now calls the existing workflow
identity verifier, GitHub candidate/artifact loader, realm observer, V2 ledger
reservation/finalization, and pinned JWS signer. Server dependencies are not
request parameters. The named Worker entrypoint is still missing.

New issuance builds the complete authorization from those sources, refreshes
control before reservation and finalization, and returns the durable result.
The reservation's timestamp is selected after the awaited control refresh and
used for both payload and ledger event. Protected source buffers are wiped in
`finally`. This does not guarantee erasure of immutable JS strings/objects.

An issued retry verifies fresh workflow identity and uses `readIssued` with
exact locators. It returns retained bytes without another archive download or
realm observation. An interrupted reservation reloads GitHub evidence and
asks the ledger for the retained payload, without supplying fresh authorization
terms or extending its validity. Concurrent conflicting operations may fail
closed; callers must use the explicit retry protocol, not automatic retries.

The integration test uses real ledger transitions, key checks, JWS signing and
verification with ephemeral test-only pins. GitHub identity/evidence and realm
observation are mocked at their component boundaries: this is not authenticated
workflow, provider, Durable Object, or live-deployment evidence.

Covered: new issuance, second-boundary control delay, retained-byte retry with
fresh verifier invocation, changed artifact and workflow attempt, verifier
failure, interruption before finalization/reservation recovery, exact 120-second
acceptance and stale 121-second
observation interval, future observation, G001 admission mutation, populated
G002, missing PTR owner, wrong database and wrong core digest. Negative realm
cases leave the request armed, without a signed authorization being returned.

Focused verification: 66 tests passed across signerSecrets, signerControl,
signerRequests, crypto and ledgerV2; service TypeScript `--noEmit` passed. A final
focused signer rerun after the workflow-attempt case also passed (4 tests).

Initial unrestricted full service run: 892 passed, 5 failed, all five reporting
the unchanged 5-second timeout in WSL/toolchain tests (28 files, 89.15 seconds).
A `--maxWorkers=2` rerun completed with 894 passed and 3 timeouts in different
tests (two fixture-output transaction cases and localAuthorizationVerifier;
52.28 seconds). This suggests scheduling/timing sensitivity but does not prove
its cause or establish a green full suite. No timeout was increased.
The targeted seven-file `--maxWorkers=1` diagnostic finished with 81 passed,
3 timed out in releaseRecoverySpacetimeFixtures (50.83 seconds); the other six
files, including the final signer integration with exact-120-second acceptance,
passed. Reduced concurrency alone therefore does not resolve all timeouts.

Read-only GitHub check: Verify run 34096853280 for the preceding `daacca0`
checkpoint had release-recovery, native-contract and auth-bridge jobs successful;
linux and spacetimedb-module were still running. This is not CI evidence for
the new issuance source, nor an overall green Verify run.
Independent review and named Worker/runtime verification remain pending.
No production credentials were read, and no deployment occurred.
