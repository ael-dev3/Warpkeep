"""Credential-free offline container test. Feed on stdin; mount no host paths."""
import json
import os
from pathlib import Path

status = dict(
    line.split(":", 1)
    for line in Path("/proc/self/status").read_text().splitlines()
    if ":" in line
)
assert os.getuid() == 1001 and os.getgid() == 1001
assert int(status["CapEff"].strip(), 16) == 0
assert status["NoNewPrivs"].strip() == "1"
assert os.listdir("/sys/class/net") == ["lo"]
assert not any(Path(path).exists() for path in [
    "/mnt/c", "/var/run/docker.sock", "/home/runner/.runner",
    "/home/runner/.credentials", "/usr/bin/sudo",
])
assert not os.access("/etc", os.W_OK)
print(json.dumps({
    "nonRoot": True,
    "capabilitiesDropped": True,
    "noNewPrivileges": True,
    "networkDisabled": True,
    "hostPathsAbsent": True,
    "unregistered": True,
}))
