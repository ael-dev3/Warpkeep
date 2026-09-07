# Credential-free egress prototype

This is a connectivity prototype, **not an approved production network**.
Squid permits only CONNECT to port 443 on the listed GitHub domains, rejects
numeric destinations without reverse DNS, and denies listed non-public
destination ranges. It does not decrypt TLS or receive GitHub credentials.
The allowlist is incomplete for a full Actions job; add only demonstrated
required endpoints after review. Domain filtering is not job authorization
and does not stop an authorized job sending data to an allowed service.

On 2026-09-07 the local Docker build succeeded with Squid
`6.14-0ubuntu0.24.04.4`, image ID:
`sha256:ca0567dfc0c47273f7af1522dddf04e135d17a578b5cef7f58b08f4843f99b1b`.
Signed current Ubuntu indexes are used, so later builds are not promised
byte-identical. Record the final image/package inventory before deployment.

The actual disposable test used:

- Runner image recorded in the parent README, unregistered, UID 1001.
- Runner attached only to a new internal isolated-gateway bridge with
  `--dns 127.0.0.1`, read-only root, all capabilities dropped, no-new-privileges,
  no host mounts or published ports, 64 PIDs and 256 MiB memory limit.
- Proxy running as the image's `proxy` user, read-only root, all capabilities
  dropped, no-new-privileges, 64 PIDs, 256 MiB and one CPU, tmpfs `/run` and
  `/var/log/squid`; no host mounts, secrets or published ports.
- Proxy attached to that internal network with alias `warpkeep-egress`, plus
  the default bridge for this credential-free experiment only.

`proxy-smoke.py`, passed via stdin to Python in the runner container, passed
ten denial cases and an actual certificate-verified HTTPS HEAD request to
`api.github.com` returning 200. A separate curl request also returned 200.
No tokens, repository data or production writes were involved.

## Repeatable dedicated-network test

Run `./operations/local-runner/test-egress.ps1` from the repository root in
PowerShell after building both recorded images. The harness uses those exact
image IDs, unique labeled networks and disposable containers; it never mounts
host files or supplies credentials. It removes only its own test resources
in `finally`, leaving the images available for subsequent runs.

The 2026-09-07 full run exited zero. Unlike the initial experiment, the proxy
used a dedicated external bridge with inter-container communication disabled.
The runner used only the separate internal isolated-gateway network.
Verified outcomes:

- Normal GitHub certificate-verified HTTPS returned 200; ten denial cases passed.
- Direct external TCP, external DNS and gateway/default routes remained denied
  while the proxy was connected, and again after it stopped.
- The stopped proxy was unavailable; no direct fallback was enabled.
- Five fresh proxies independently mapped allowed `api.github.com` to
  `127.0.0.1`, `10.0.0.1`, `169.254.169.254`, `::1`, and `fd00::1` using
  Docker's hosts-file override. Every CONNECT was denied with HTTP 403.

The hosts-file cases test resolved-address ACL behavior, **not a live DNS
rebinding race**. An initial harness attempt expected a readiness log message
that was not emitted; it failed and cleaned up. The corrected harness checks
actual bounded TCP readiness before running acceptance assertions.

Before production: restrict the listening interface/client; test DNS rebinding
behavior and full required Actions endpoints. Complete protected
job admission and disposable credential lifecycle separately. These tests
do not establish those properties.

Configuration semantics: [Squid ACL reference](https://www.squid-cache.org/Doc/config/acl/),
[access rules](https://www.squid-cache.org/Doc/config/http_access/).
