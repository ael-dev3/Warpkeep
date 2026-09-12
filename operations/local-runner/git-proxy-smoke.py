"""Public ref read only; no checkout, credentials, disk writes or job identity."""
import json
import os
import re
import subprocess
import sys

assert sys.argv[1:] in ([], ["--unavailable"])
assert os.getuid() == 1001
assert os.environ.get("https_proxy") == "http://172.30.240.2:3128"
assert os.environ.get("no_proxy") == ""
result = subprocess.run(
    ["/usr/bin/git", "-c", "http.lowSpeedLimit=1", "-c", "http.lowSpeedTime=10",
     "ls-remote", "--exit-code", "https://github.com/ael-dev3/Warpkeep.git", "refs/heads/main"],
    capture_output=True, timeout=25, check=False,
)
if sys.argv[1:] == ["--unavailable"]:
    assert result.returncode != 0 and result.stdout == b""
    print(json.dumps({"gitStoppedProxyDenied": True}))
else:
    assert result.returncode == 0, "Public Git proxy read failed"
    assert re.fullmatch(rb"[0-9a-f]{40}\trefs/heads/main\n", result.stdout)
    print(json.dumps({"gitHttpsProxy": True, "publicMainRefRead": True}))
