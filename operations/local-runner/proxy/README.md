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

Before production: replace the experimental shared external bridge with
dedicated reviewed networking and restrict the listening interface/client;
test allowed-host resolution to private destinations, IPv6 and DNS rebinding
behavior; verify proxy-unavailable failure, direct-route/DNS denial while
the proxy is attached, and full required Actions endpoints. Complete protected
job admission and disposable credential lifecycle separately. These tests
do not establish those properties.

Configuration semantics: [Squid ACL reference](https://www.squid-cache.org/Doc/config/acl/),
[access rules](https://www.squid-cache.org/Doc/config/http_access/).
