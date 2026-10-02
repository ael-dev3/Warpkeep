#!/usr/bin/env bash
# Disposable synthetic HTTP tests. This grants no production workflow authority.
set -euo pipefail
test "$(uname -s)" = Linux && test "$(uname -m)" = x86_64
self=$(realpath -- "${BASH_SOURCE[0]}")

if test "${1-}" = --cleanup; then
  # Only this noninteractive sudo caller may signal one birth-bound member of its own session.
  test "$#" = 10 && test "$(id -u)" = 0
  exec /usr/bin/python3 - "$self" "${@:2}" <<'PY'
import json, os, pathlib, re, signal, sys
signal.alarm(3)
def require(condition, code):
    if not condition:
        raise RuntimeError('NATIVE_NAMESPACE_CLEANUP_' + code)
def bounded(path, maximum):
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    try:
        body = os.read(fd, maximum + 1)
        require(len(body) <= maximum, 'PROC_UNBOUNDED')
        return body.decode('ascii')
    finally:
        os.close(fd)
def facts(pid, require_alive=False):
    text = bounded('/proc/' + str(pid) + '/stat', 8192)
    fields = text[text.rfind(')') + 2:].split()
    require(len(fields) >= 20 and re.fullmatch('[0-9]{1,20}', fields[19]) is not None, 'PROC_INVALID')
    require(not require_alive or fields[0] not in ('Z', 'X', 'x'), 'OWNER_CHANGED')
    status = bounded('/proc/' + str(pid) + '/status', 16384)
    uid = re.search(r'^Uid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)$', status, re.M)
    gid = re.search(r'^Gid:\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)\s+([0-9]+)$', status, re.M)
    require(uid is not None and gid is not None, 'PROC_INVALID')
    return {'pid': pid, 'pgid': int(fields[2]), 'identity': 'linux-v1:' + boot + ':' + fields[19],
        'uids': [int(value) for value in uid.groups()], 'gids': [int(value) for value in gid.groups()]}
try:
    require(len(sys.argv) == 11 and hasattr(os, 'pidfd_open') and hasattr(signal, 'pidfd_send_signal'), 'INPUT_INVALID')
    self, raw_uid, raw_gid, raw_repo, raw_owner, raw_pgid, owner_identity, raw_target, target_identity, signal_name = sys.argv[1:]
    require(all(re.fullmatch('[1-9][0-9]{0,9}', value) is not None for value in (raw_uid, raw_gid, raw_owner, raw_pgid, raw_target)), 'INPUT_INVALID')
    uid, gid, owner_pid, pgid, target_pid = map(int, (raw_uid, raw_gid, raw_owner, raw_pgid, raw_target))
    require(os.getuid() == 0 and os.environ.get('SUDO_UID') == raw_uid and os.environ.get('SUDO_GID') == raw_gid, 'CALLER_INVALID')
    require(owner_pid == pgid and target_pid != owner_pid and signal_name in ('SIGTERM', 'SIGKILL'), 'INPUT_INVALID')
    repo = pathlib.Path(raw_repo)
    require(str(repo.resolve(strict=True)) == raw_repo and repo.stat().st_uid == uid and repo.stat().st_gid == gid, 'SOURCE_INVALID')
    require(str((repo / 'scripts/test-sealed-realms-existing-update-linux.sh').resolve(strict=True)) == self, 'SOURCE_INVALID')
    boot = bounded('/proc/sys/kernel/random/boot_id', 64).strip()
    birth = re.compile(r'linux-v1:([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}):(0|[1-9][0-9]{0,19})')
    require(all(birth.fullmatch(value) is not None and birth.fullmatch(value).group(1) == boot for value in (owner_identity, target_identity)), 'BOOT_INVALID')
    owner_fd = os.pidfd_open(owner_pid)
    try:
        owner = facts(owner_pid, True)
        require(owner['identity'] == owner_identity and owner['pgid'] == pgid
            and owner['uids'] == [uid] * 4 and owner['gids'] == [gid] * 4, 'OWNER_CHANGED')
        actor = facts(os.getpid())
        require(actor['pgid'] == pgid, 'CALLER_GROUP_INVALID')
        status = 'absent'
        try:
            target_fd = os.pidfd_open(target_pid)
        except ProcessLookupError:
            target_fd = None
        if target_fd is not None:
            try:
                try:
                    target = facts(target_pid)
                except FileNotFoundError:
                    target = None
                if target is not None:
                    require(target['identity'] == target_identity and target['pgid'] == pgid
                        # sudo's monitor retains the caller's real UID with root effective/saved/fs IDs.
                        and target['uids'] in ([0] * 4, [uid] * 4, [uid, 0, 0, 0])
                        and target['gids'] in ([0] * 4, [gid] * 4), 'TARGET_CHANGED')
                    # Keep both pidfds held through the final /proc checks and signal; never use a PID/group kill.
                    require(facts(owner_pid, True) == owner
                        and bounded('/proc/sys/kernel/random/boot_id', 64).strip() == boot, 'IDENTITY_CHANGED')
                    try:
                        final_target = facts(target_pid)
                    except FileNotFoundError:
                        final_target = None
                    if final_target is not None:
                        require(final_target == target, 'IDENTITY_CHANGED')
                        try:
                            signal.pidfd_send_signal(target_fd, getattr(signal, signal_name), None, 0)
                            status = 'signaled'
                        except ProcessLookupError:
                            pass
            finally:
                os.close(target_fd)
        print(json.dumps({'profile': 'warpkeep-owned-namespace-cleanup-v1', 'status': status,
            'owner': {'pid': owner_pid, 'pgid': pgid, 'identity': owner_identity, 'uid': uid, 'gid': gid},
            'target': {'pid': target_pid, 'pgid': pgid, 'identity': target_identity}, 'signal': signal_name,
            'actor': {key: actor[key] for key in ('pid', 'pgid', 'identity')}}), flush=True)
    finally:
        os.close(owner_fd)
except Exception as error:
    message = str(error)
    print(message if message.startswith('NATIVE_NAMESPACE_CLEANUP_') else 'NATIVE_NAMESPACE_CLEANUP_FAILED', file=sys.stderr)
    sys.exit(1)
PY
fi

if test "$#" = 0; then
  test "$(id -u)" -ne 0 || { echo 'Root invocation requires --as UID GID NODE REPOSITORY.' >&2; exit 1; }
  repo=$(realpath -- "$(dirname -- "$self")/..")
  node=$(realpath -- "$(command -v node)")
  exec /usr/bin/sudo -n /bin/bash "$self" --as "$(id -u)" "$(id -g)" "$node" "$repo"
fi

{ test "$#" = 5 || test "$#" = 7; } && test "$(id -u)" = 0
phase=$1
fixture_uid=$2
fixture_gid=$3
node=$4
repo=$5
report_forward=()
report_args=()
if test "$#" = 7; then
  test "$6" = --report-json
  report=$7
  # Only the producer's already-reserved, owned direct QA output is accepted.
  test "$(realpath -- "$report")" = "$report"
  test "$(dirname -- "$report")" = "$repo/artifacts/qa"
  [[ "$(basename -- "$report")" =~ ^[A-Za-z0-9._-]+\.report\.json$ ]]
  test -f "$report" && test ! -L "$report"
  test "$(stat -c '%h:%u:%g:%a:%s' -- "$report")" = "1:$fixture_uid:$fixture_gid:600:0"
  report_forward=(--report-json "$report")
  report_args=(--reporter=json "--outputFile=$report")
fi
[[ "$fixture_uid" =~ ^[1-9][0-9]*$ && "$fixture_gid" =~ ^[1-9][0-9]*$ ]]
test "$(realpath -- "$repo")" = "$repo"
test "$(stat -c %u -- "$repo")" = "$fixture_uid"
test "$(stat -c %g -- "$repo")" = "$fixture_gid"
test "$(realpath -- "$repo/scripts/test-sealed-realms-existing-update-linux.sh")" = "$self"
test "$(realpath -- "$node")" = "$node" && test -f "$node" && test -x "$node"

if test "$phase" = --as; then
  # Retain the real launching namespace, including when the host is a container.
  exec 3</proc/self/ns/net
  exec /usr/bin/unshare --mount --net /bin/bash "$self" --inside "$fixture_uid" "$fixture_gid" "$node" "$repo" "${report_forward[@]}"
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
  tests/ptrProductionExistingUpdateContinuation.test.ts --maxWorkers=1 --no-cache "${report_args[@]}"
