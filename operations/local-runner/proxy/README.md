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

## Restricted listener/client checkpoint — 2026-09-07

The current configuration supersedes the unrestricted listener in the initial
prototype: it binds only `172.30.240.2:3128` and allows CONNECT requests only
from the designated runner at `172.30.240.3`. The disposable harness reserves
`172.30.240.0/29`; an existing overlapping Docker network makes creation fail,
not select a broader fallback. Only the harness-owned runner/proxy containers
receive these addresses; no host mount or Docker socket is exposed to them.

Updated exact image:
`sha256:59a9b5038312c48ee4a787da0db7f81c1c1d48f74e070eece79b05db3a23c0ec`.
The full `test-egress.ps1` run exited zero on Docker 29.7.2. A second client at
`172.30.240.4` was denied CONNECT to otherwise-allowed `api.github.com` with 403.
The designated client retained certificate-verified GitHub HTTPS 200. The ten
original destination/method denials, direct TCP/DNS/route denials, stopped-proxy
checks, and all five private-resolution cases still passed. The exact labeled
test containers/networks were absent after cleanup; both images remain local.

These are credential-free network tests, not authenticated job admission.
DNS rebinding race coverage, full Actions endpoint connectivity, job-specific
authorization, persistent private handoff/log handling, and runner registration
remain unfinished. IP filtering alone is not a credential or repository boundary.

### Actual listener verification

`proxy-listener-smoke.py` now examines `/proc/net/tcp` and `/proc/net/tcp6`
inside the disposable proxy's network namespace. It requires exactly the
`172.30.240.2:3128` IPv4 listener and rejects wildcard or IPv6 proxy listeners.
The observer runs non-root from the fixed runner image, with read-only root,
all capabilities dropped, no-new-privileges, and no host mounts or credentials.
It shares only the test proxy's network namespace, never the host namespace.

The complete updated `test-egress.ps1` passed on 2026-09-07, including this
kernel-listener check and all earlier connectivity/denial assertions. Test
resources with suffix `f7916413d9c8` were removed by the harness. This proves the
observed listener scope, not job admission, DNS race resistance, or production
network readiness; those remaining requirements above are unchanged.
