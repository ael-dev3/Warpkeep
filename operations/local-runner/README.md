# Local recovery runner runtime

This builds an **unregistered, credential-free runtime**, not an authorized
production runner. No job polling, credentials, host volumes or Docker socket
are configured. The build context excludes everything except its Dockerfile.

The Ubuntu base is digest-pinned. GitHub runner 2.337.0 is downloaded from its
fixed official release URL and checked against the release asset SHA-256 before
extraction. The image runs as UID/GID 1001 without sudo. Ubuntu dependencies
are installed from signed current package indexes: rebuilding later is **not**
claimed to produce identical image bytes. Capture and review the final package
inventory/image identity before production use; this is not the separately
attested compiler toolchain.

From the repository root in PowerShell:

```powershell
wsl -d Ubuntu-24.04 --exec docker build --pull=false --tag warpkeep-local-runner:2.337.0 --file /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/operations/local-runner/Dockerfile /mnt/c/Users/heyas/Documents/Codex/2026-08-11/pl/Warpkeep-0.4.0-worktree/operations/local-runner
wsl -d Ubuntu-24.04 --exec docker image inspect warpkeep-local-runner:2.337.0 --format '{{.Id}} {{.Config.User}} {{.Os}}/{{.Architecture}}'
```

The 2026-09-07 local build returned image ID
`sha256:5027b7108810a0c601e43a77d9f4b2fefb6757d59c8f0def279dd6c64b4b745c`.
The following exact-image offline checks passed; the listener returned `2.337.0`:

```powershell
wsl -d Ubuntu-24.04 --exec docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 2 --tmpfs /home/runner/_diag:uid=1001,gid=1001,mode=0700 --entrypoint /home/runner/bin/Runner.Listener sha256:5027b7108810a0c601e43a77d9f4b2fefb6757d59c8f0def279dd6c64b4b745c --version
Get-Content -Raw operations/local-runner/smoke.py | wsl -d Ubuntu-24.04 --exec docker run --rm --interactive --network none --read-only --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 2 --entrypoint /usr/bin/python3 sha256:5027b7108810a0c601e43a77d9f4b2fefb6757d59c8f0def279dd6c64b4b745c -
```

The test checks non-root execution, zero effective capabilities,
`NoNewPrivs`, loopback-only networking, absence of host/credential/registration
paths and sudo, and lack of write permission to `/etc`. Containers created by
these commands are disposable; the built image remains installed locally.

## Remaining before any registration or production job

- Use a fresh single-job runner with the exact selected local name/labels and
  verify actual GitHub metadata against the signer profile.
- Authenticate the protected candidate/job before allowing credential-bearing
  execution. Do not accept pull-request or arbitrary branch jobs.
- Keep job storage disposable and separate from Windows credentials, source
  checkouts, compiler caches, other containers, and the Docker control socket.
- Establish and test required outbound-only connectivity without exposing local
  services. The offline smoke test above proves no network, **not** safe online
  networking. No privileged container, host network or host mount is a fallback.
- Complete the real recovery workflow, pinned job toolchain, private credential
  lifecycle, external diagnostic-log handling and cleanup/reconciliation.
- Verify genuine Actions/OIDC execution. Merely running this image proves none
  of repository authorization, protected environment approval or deployment.

GitHub recommends ephemeral execution and documents the risks of self-hosted
runners, especially for public repositories: [runner reference](https://docs.github.com/en/actions/reference/runners/self-hosted-runners),
[security guidance](https://docs.github.com/en/enterprise-cloud%40latest/actions/reference/security/secure-use?learn=getting_started&learnProduct=actions).
Runner source/release: [actions/runner v2.337.0](https://github.com/actions/runner/releases/tag/v2.337.0).
