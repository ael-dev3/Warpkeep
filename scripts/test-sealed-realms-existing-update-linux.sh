#!/usr/bin/env bash
# Disposable synthetic HTTP tests. This grants no production workflow authority.
set -euo pipefail
test "$(uname -s)" = Linux && test "$(uname -m)" = x86_64
self=$(realpath -- "${BASH_SOURCE[0]}")

if test "$#" = 0; then
  test "$(id -u)" -ne 0 || { echo 'Root invocation requires --as UID GID NODE REPOSITORY.' >&2; exit 1; }
  repo=$(realpath -- "$(dirname -- "$self")/..")
  node=$(realpath -- "$(command -v node)")
  exec /usr/bin/sudo -n /bin/bash "$self" --as "$(id -u)" "$(id -g)" "$node" "$repo"
fi

test "$#" = 5 && test "$(id -u)" = 0
phase=$1
fixture_uid=$2
fixture_gid=$3
node=$4
repo=$5
[[ "$fixture_uid" =~ ^[1-9][0-9]*$ && "$fixture_gid" =~ ^[1-9][0-9]*$ ]]
test "$(realpath -- "$repo")" = "$repo"
test "$(stat -c %u -- "$repo")" = "$fixture_uid"
test "$(stat -c %g -- "$repo")" = "$fixture_gid"
test "$(realpath -- "$repo/scripts/test-sealed-realms-existing-update-linux.sh")" = "$self"
test "$(realpath -- "$node")" = "$node" && test -f "$node" && test -x "$node"

if test "$phase" = --as; then
  # Retain the real launching namespace, including when the host is a container.
  exec 3</proc/self/ns/net
  exec /usr/bin/unshare --mount --net /bin/bash "$self" --inside "$fixture_uid" "$fixture_gid" "$node" "$repo"
fi
test "$phase" = --inside
test "$(readlink /proc/self/ns/net)" != "$(readlink /proc/self/fd/3)"
mount --make-rprivate /
mount -t tmpfs -o mode=0755,nosuid,nodev,noexec tmpfs /run
touch /run/warpkeep-synthetic-host-netns
chmod 0444 /run/warpkeep-synthetic-host-netns
mount --bind /proc/self/fd/3 /run/warpkeep-synthetic-host-netns
exec 3<&-
/usr/sbin/ip link set lo up
cd "$repo"
exec /usr/bin/setpriv --reuid="$fixture_uid" --regid="$fixture_gid" --clear-groups \
  --inh-caps=-all --ambient-caps=-all --bounding-set=-all --no-new-privs \
  /usr/bin/env -i HOME=/tmp TMPDIR=/tmp PATH="$(dirname -- "$node"):/usr/bin:/bin" \
  NODE_ENV=test NO_COLOR=1 WARPKEEP_REQUIRE_SYNTHETIC_NETWORK=1 \
  "$node" node_modules/vitest/vitest.mjs run \
  tests/sealedRealmsExistingUpdate.test.ts tests/sealedRealmsProductionContinuation.test.ts \
  tests/sealedRealmsProductionDispatcher.test.ts \
  tests/ptrProductionExistingUpdateContinuation.test.ts --maxWorkers=1 --no-cache
