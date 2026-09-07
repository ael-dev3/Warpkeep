# Disposable runner runtime only. Registration and job authorization are separate.
# Base digest and runner digest were checked against their publishers on 2026-09-07.
FROM ubuntu:24.04@sha256:33ceb71981b602c1a7443a53469e4dba065f7503eab3078a2d7a57a2ab987517

RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
       ca-certificates curl git jq python3 tar gzip xz-utils \
       libicu74 libssl3t64 zlib1g libkrb5-3 liblttng-ust1t64 libunwind8 \
    && useradd --uid 1001 --create-home --shell /bin/bash runner

WORKDIR /home/runner
RUN curl --fail --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 300 \
      --output /tmp/warpkeep-runner.tar.gz \
      https://github.com/actions/runner/releases/download/v2.337.0/actions-runner-linux-x64-2.337.0.tar.gz \
    && echo '70920811a4f8ad4328818682bca5c6469c1c942fab52448868071d0063816613  /tmp/warpkeep-runner.tar.gz' | sha256sum --check --strict \
    && tar --extract --gzip --file /tmp/warpkeep-runner.tar.gz --no-same-owner \
    && rm /tmp/warpkeep-runner.tar.gz \
    && chown -R 1001:1001 /home/runner

# Pinned job Node/npm, separate from the runner's embedded Actions runtimes.
RUN curl --fail --location --proto '=https' --proto-redir '=https' \
      --connect-timeout 15 --max-time 300 \
      --output /tmp/warpkeep-node.tar.xz \
      https://nodejs.org/dist/v22.22.3/node-v22.22.3-linux-x64.tar.xz \
    && echo '2e5d13569282d016861fae7c8f935e741693c269101a5bebcf761a5376d1f99f  /tmp/warpkeep-node.tar.xz' | sha256sum --check --strict \
    && tar --extract --xz --file /tmp/warpkeep-node.tar.xz --directory /opt --no-same-owner \
    && rm /tmp/warpkeep-node.tar.xz
ENV PATH=/opt/node-v22.22.3-linux-x64/bin:$PATH

# Runtime-only fixed isolated-network contract; never used for image downloads.
# Supply both spellings for Node, the runner, git and individual Actions clients.
# The proxy enforces destinations; environment variables are not the firewall.
ENV NODE_USE_ENV_PROXY=1 \
    HTTPS_PROXY=http://172.30.240.2:3128 \
    HTTP_PROXY=http://172.30.240.2:3128 \
    https_proxy=http://172.30.240.2:3128 \
    http_proxy=http://172.30.240.2:3128 \
    NO_PROXY="" \
    no_proxy=""

# No sudo, host mount, Docker socket, registration token, or production secret.
USER 1001:1001
ENV HOME=/home/runner
ENTRYPOINT ["/home/runner/run.sh"]
