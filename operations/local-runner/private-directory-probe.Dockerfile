# Diagnostic only: fixed runner base, supplied local Node and two test files.
FROM warpkeep-local-runner:2.337.0@sha256:5027b7108810a0c601e43a77d9f4b2fefb6757d59c8f0def279dd6c64b4b745c
COPY --chmod=0555 node /tmp/node
COPY --chmod=0444 recovery-workflow-private-directory.mjs probe.mjs /tmp/
ENTRYPOINT ["/tmp/node", "/tmp/probe.mjs"]
