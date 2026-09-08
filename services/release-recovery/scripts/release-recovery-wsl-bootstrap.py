#!/usr/bin/python3 -I
"""Build the fixed recovery toolchain/cache from authenticated public inputs.

The operator entrypoint accepts only a host-derived public Git object-database
transport locator. All source and network authority remains in the canonical
stdin policy and authenticated source coordinates. Publication is no-clobber and
occurs only after signatures, archives, objects, dependencies, and the complete
cache inventory have been independently verified.
"""

from __future__ import annotations

import base64
import hashlib
import http.client
import io
import json
import os
import shutil
import ssl
import stat
import subprocess
import sys
import tarfile
import zlib
from pathlib import Path, PurePosixPath
from urllib.parse import urlsplit


STATE_ROOT = "/var/lib/warpkeep/release-recovery-v1"
BOOTSTRAP_PROGRAM = "/opt/warpkeep/release-recovery-v1/bin/bootstrap-toolchain-v1"
MATERIALIZER_PROGRAM = "/opt/warpkeep/release-recovery-v1/bin/materialize-spacetime-fixtures-v1"
CATALOG_PATH = f"{STATE_ROOT}/cache-catalog-v2.json"
MANIFEST_RELATIVE_PATH = "toolchains/linux-x64.json"
TRANSACTION_PATH = f"{STATE_ROOT}/.bootstrap-transaction-v1"
JOURNAL_PATH = f"{TRANSACTION_PATH}/journal.json"
STAGE_PATH = f"{TRANSACTION_PATH}/stage"
MAX_REQUEST_BYTES = 256 * 1024
MAX_CATALOG_BYTES = 8 * 1024 * 1024
MAX_MANIFEST_BYTES = 512 * 1024
MAX_CACHE_FILES = 100_000
MAX_FILE_BYTES = 256 * 1024 * 1024
MAX_SOURCE_OBJECTS = 100_000
MAX_SOURCE_OBJECT_BYTES = 512 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 100_000
HEX64 = frozenset("0123456789abcdef")
HEX40 = HEX64


class Invalid(Exception):
    pass


def fail() -> None:
    raise Invalid()


def exact(value: object, keys: tuple[str, ...]) -> dict[str, object]:
    if type(value) is not dict or tuple(value.keys()) != keys:
        fail()
    return value


def lower_hex_64(value: object) -> str:
    if (
        type(value) is not str
        or len(value) != 64
        or any(character not in HEX64 for character in value)
        or value == "0" * 64
    ):
        fail()
    return value


def lower_hex_40(value: object) -> str:
    if (
        type(value) is not str
        or len(value) != 40
        or any(character not in HEX40 for character in value)
        or value == "0" * 40
    ):
        fail()
    return value


def positive_integer(value: object, maximum: int) -> int:
    if type(value) is not int or value < 1 or value > maximum:
        fail()
    return value


def nonnegative_integer(value: object, maximum: int) -> int:
    if type(value) is not int or value < 0 or value > maximum:
        fail()
    return value


def duplicate_rejecting_object(pairs: list[tuple[str, object]]) -> dict[str, object]:
    result: dict[str, object] = {}
    for key, value in pairs:
        if key in result:
            fail()
        result[key] = value
    return result


def canonical_json_bytes(raw: bytes, maximum: int) -> object:
    if len(raw) < 2 or len(raw) > maximum or not raw.endswith(b"\n"):
        fail()
    try:
        text = raw.decode("utf-8", "strict")
        value = json.loads(text, object_pairs_hook=duplicate_rejecting_object)
        canonical = json.dumps(
            value,
            ensure_ascii=False,
            separators=(",", ":"),
        ) + "\n"
    except (Invalid, UnicodeDecodeError, json.JSONDecodeError, TypeError, ValueError):
        fail()
    if canonical != text:
        fail()
    return value


def descriptor_read(path: str, maximum: int, expected_mode: int) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        named = os.lstat(path)
        if (
            not stat.S_ISREG(before.st_mode)
            or stat.S_ISLNK(named.st_mode)
            or before.st_dev != named.st_dev
            or before.st_ino != named.st_ino
            or before.st_uid != 0
            or before.st_gid != 0
            or stat.S_IMODE(before.st_mode) != expected_mode
            or before.st_nlink != 1
            or before.st_size < 1
            or before.st_size > maximum
        ):
            fail()
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(descriptor, min(remaining, 64 * 1024))
            if not chunk:
                fail()
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(descriptor)
        if (
            after.st_dev != before.st_dev
            or after.st_ino != before.st_ino
            or after.st_size != before.st_size
        ):
            fail()
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def safe_relative_path(value: object) -> str:
    if type(value) is not str or len(value) < 1 or len(value) > 1024:
        fail()
    candidate = PurePosixPath(value)
    if (
        candidate.is_absolute()
        or "\\" in value
        or "\x00" in value
        or any(part in ("", ".", "..") for part in candidate.parts)
        or candidate.parts[0] not in ("toolchains", "pnpm-store", "source-caches")
    ):
        fail()
    return value


def safe_git_path(value: object) -> str:
    if type(value) is not str or len(value) < 1 or len(value) > 4096:
        fail()
    candidate = PurePosixPath(value)
    if (
        candidate.is_absolute()
        or "\\" in value
        or "\x00" in value
        or any(part in ("", ".", "..") for part in candidate.parts)
    ):
        fail()
    return value


def verify_parent_chain(path: str) -> None:
    root = os.path.realpath(STATE_ROOT)
    if root != STATE_ROOT:
        fail()
    current = STATE_ROOT
    relative = os.path.relpath(path, STATE_ROOT)
    if relative == ".." or relative.startswith("../"):
        fail()
    for part in relative.split("/")[:-1]:
        current = os.path.join(current, part)
        value = os.lstat(current)
        if not stat.S_ISDIR(value.st_mode) or stat.S_ISLNK(value.st_mode):
            fail()


def validate_member(value: object, expected_mode: str) -> dict[str, object]:
    member = exact(value, ("mode", "bytes", "sha256"))
    if member["mode"] != expected_mode:
        fail()
    positive_integer(member["bytes"], 256 * 1024 * 1024)
    lower_hex_64(member["sha256"])
    return member


def validate_node_release(
    value: object,
    version: str,
    algorithm: str,
    fingerprint: str,
    key_bytes: int,
    key_sha256: str,
) -> dict[str, object]:
    release = exact(value, (
        "version", "archiveUrl", "archiveBytes", "archiveSha256",
        "archiveMemberPath", "archiveMemberMode", "archiveMemberBytes",
        "archiveMemberSha256", "shasumsUrl", "shasumsBytes",
        "shasumsSha256", "signatureUrl", "signatureBytes",
        "signatureSha256", "signingAlgorithm", "signerFingerprint",
        "publicKeyUrl", "publicKeyBytes", "publicKeySha256",
    ))
    if (
        release["version"] != version
        or release["archiveUrl"]
        != f"https://nodejs.org/dist/v{version}/node-v{version}-linux-x64.tar.xz"
        or release["archiveMemberPath"]
        != f"node-v{version}-linux-x64/bin/node"
        or release["archiveMemberMode"] != "755"
        or release["shasumsUrl"]
        != f"https://nodejs.org/dist/v{version}/SHASUMS256.txt"
        or release["signatureUrl"]
        != f"https://nodejs.org/dist/v{version}/SHASUMS256.txt.sig"
        or release["signingAlgorithm"] != algorithm
        or release["signerFingerprint"] != fingerprint
        or release["publicKeyUrl"]
        != (
            "https://raw.githubusercontent.com/nodejs/release-keys/"
            "5b7f55f4a7e35d1176d27a6b81b0c3c3b794216b/keys/"
            f"{fingerprint}.asc"
        )
        or release["publicKeyBytes"] != key_bytes
        or release["publicKeySha256"] != key_sha256
    ):
        fail()
    positive_integer(release["archiveBytes"], 100 * 1024 * 1024)
    positive_integer(release["archiveMemberBytes"], 192 * 1024 * 1024)
    positive_integer(release["shasumsBytes"], 64 * 1024)
    positive_integer(release["signatureBytes"], 4 * 1024)
    for key in (
        "archiveSha256", "archiveMemberSha256", "shasumsSha256",
        "signatureSha256",
    ):
        lower_hex_64(release[key])
    return release


def validate_source_policy(value: object) -> dict[str, object]:
    policy = exact(value, (
        "schemaVersion", "profile", "distribution", "platform",
        "architecture", "recoveryBuildProfile", "hostGuest", "nodeReleases",
        "pnpm", "spacetime", "systemTools", "sourceRules",
        "packageFetchPolicy", "lifecycleScripts", "noClobber",
    ))
    if (
        policy["schemaVersion"] != 1
        or policy["profile"]
        != "warpkeep-release-recovery-wsl-toolchain-source-policy-v1"
        or policy["distribution"] != "WarpkeepRunner"
        or policy["platform"] != "linux"
        or policy["architecture"] != "x64"
        or policy["recoveryBuildProfile"]
        != "warpkeep-release-recovery-cross-platform-program-build-v1"
        or policy["packageFetchPolicy"]
        != "canonical-registry-no-redirect-no-credential"
        or policy["lifecycleScripts"] is not False
        or policy["noClobber"] is not True
    ):
        fail()
    host_guest = exact(policy["hostGuest"], (
        "wslExecutable", "wslExecutableBytes", "wslExecutableSha256",
        "wslFileVersion", "wslProductVersion", "wslVersion",
        "guestOsReleaseBytes", "guestOsReleaseSha256",
        "guestKernelReleaseBytes", "guestKernelReleaseSha256",
    ))
    if host_guest != {
        "wslExecutable": r"C:\Windows\System32\wsl.exe",
        "wslExecutableBytes": 274432,
        "wslExecutableSha256": "27cc8dd52be326e138a89f8889241b1d8c51dd1978b22eb70be77036ccdee3c2",
        "wslFileVersion": "10.0.26100.8737",
        "wslProductVersion": "10.0.26100.8737",
        "wslVersion": "2.7.11.0",
        "guestOsReleaseBytes": 400,
        "guestOsReleaseSha256": "01af466feb100306498c86aa6bad1815e33036019aa34d4362c20f374ea5c829",
        "guestKernelReleaseBytes": 34,
        "guestKernelReleaseSha256": "600c01e56d5afd93f0ecd74ff4ebb5ef91623d779bbba04388a866c3b581fc92",
    }:
        fail()
    nodes = exact(policy["nodeReleases"], ("24.19.0", "22.22.3"))
    validate_node_release(
        nodes["24.19.0"], "24.19.0", "EdDSA",
        "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356", 924,
        "5115095e2f8010c75da052ecb1cfb3af630e084f0f8daa93a863557b01b0f90a",
    )
    validate_node_release(
        nodes["22.22.3"], "22.22.3", "RSA",
        "CC68F5A3106FF448322E48ED27F5E38D5B0A215F", 3163,
        "e31e1aa40a8331f01d753cef475f7b9eab934fc25f5f0b36995bfd80bd66ad27",
    )
    pnpm = exact(policy["pnpm"], (
        "version", "url", "compressedBytes", "sri", "sha256", "members",
    ))
    if (
        pnpm["version"] != "11.7.0"
        or pnpm["url"] != "https://registry.npmjs.org/pnpm/-/pnpm-11.7.0.tgz"
        or pnpm["compressedBytes"] != 4590455
        or pnpm["sri"]
        != "sha512-GcyFLBIMcSV2DyRD7mvgyltA+fUFmN4aCaHxd1A+AQ5Xwjx3ZG4B52HeWb+HT7IqM5jDOrlpH8E+uUa28PTWIA=="
        or pnpm["sha256"]
        != "deafa7ec98a1218b6a047289b92fbe2395c1e22d3495bb711653013218ee15ee"
    ):
        fail()
    members = exact(pnpm["members"], (
        "package/bin/pnpm.mjs", "package/dist/pnpm.mjs", "package/package.json",
    ))
    validate_member(members["package/bin/pnpm.mjs"], "755")
    validate_member(members["package/dist/pnpm.mjs"], "644")
    validate_member(members["package/package.json"], "644")
    spacetime = exact(policy["spacetime"], (
        "version", "commit", "archiveUrl", "archiveBytes", "archiveSha256",
        "redirectPolicy", "members",
    ))
    if (
        spacetime["version"] != "2.6.1"
        or spacetime["commit"] != "052c83fe984a4c4eb7bb4f9afa5c6b1903891d87"
        or spacetime["archiveUrl"]
        != "https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.6.1/spacetime-x86_64-unknown-linux-gnu.tar.gz"
        or spacetime["archiveBytes"] != 57464969
        or spacetime["archiveSha256"]
        != "cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118"
        or spacetime["redirectPolicy"] != "github-release-one-hop-headerless"
    ):
        fail()
    spacetime_members = exact(
        spacetime["members"], ("spacetimedb-cli", "spacetimedb-standalone")
    )
    validate_member(spacetime_members["spacetimedb-cli"], "755")
    validate_member(spacetime_members["spacetimedb-standalone"], "755")
    expected_tools = {
        "git": ("git", "1:2.43.0-1ubuntu7.3", "/usr/bin/git", "2a8c18fbf43da9f692d75474c72bea9dfd796c260b0f3dfe456376abc3bbd668"),
        "gpg": ("gpg", "2.4.4-2ubuntu17.4", "/usr/bin/gpg", "7ecb1341104b0ee1107fe908abce37e24546de1db0848b29c75f59f72094f4e8"),
        "gpgv": ("gpgv", "2.4.4-2ubuntu17.4", "/usr/bin/gpgv", "097b577cdf8b51dcc1fb42417d5ef3ca2e22b36a8ad16c9df4bd083a38fe476c"),
        "unshare": ("util-linux", "2.39.3-9ubuntu6.6", "/usr/bin/unshare", "a23c8863860669003dc4660039fe642f5795c8c2195898ebc5d01afa1ac3d11c"),
        "ip": ("iproute2", "6.1.0-1ubuntu6.2", "/usr/sbin/ip", "81a95d97c70f3677d1883b9d8fe13b1771ab208d5bca56bc447aaaff0b0480e0"),
    }
    tools = exact(policy["systemTools"], tuple(expected_tools))
    for name, expected in expected_tools.items():
        tool = exact(tools[name], ("package", "version", "path", "sha256"))
        if tuple(tool.values()) != expected:
            fail()
    rules = exact(policy["sourceRules"], ("g001", "g002", "ptr"))
    g001 = exact(rules["g001"], (
        "sourceCommit", "sourceTree", "modulePath", "importer", "nodeVersion",
        "dependencyPaths", "dependencyBlobs", "preparationCommit",
        "preparationTree", "preparationManifestPath", "preparationManifestBlob",
        "preparationManifestBytes", "preparationManifestSha256",
        "materializerPath", "materializerBlob", "materializerSha256",
    ))
    if g001 != {
        "sourceCommit": "2ae51984e1fa6ce5b0028c1a250359fed79d819b",
        "sourceTree": "90deebb5faf4129282f5c35999244f540001b27d",
        "modulePath": "spacetimedb",
        "importer": "warpkeep-spacetimedb-module",
        "nodeVersion": "24.19.0",
        "dependencyPaths": ["spacetimedb/package.json", "spacetimedb/pnpm-lock.yaml", "spacetimedb/pnpm-workspace.yaml"],
        "dependencyBlobs": ["faf7214653f1248a3f9231fd6a13dda130821014", "649efdebd25528f593aff612ca8aef6f761d1e94", "a640febaa07fad295f2de4b4416b7a22910eb2e6"],
        "preparationCommit": "d945256b217fa13ade944b9ed9880e8463b46123",
        "preparationTree": "8c2b0b0eda17cefc212f08716a287c44b0e84d48",
        "preparationManifestPath": "scripts/auth-bridge-notification-prepared-deploy-closure-v1.json",
        "preparationManifestBlob": "768efb5147661671ad558e03fec191a96d81efe1",
        "preparationManifestBytes": 201077,
        "preparationManifestSha256": "38cd67fa1dcfc6875d0f7696b24995416ef92b5d088c920c9cb10f4753235251",
        "materializerPath": "scripts/genesis001-frozen-materializer.mjs",
        "materializerBlob": "c50182e99ed2e2fab1ca994c905818d383782cfc",
        "materializerSha256": "a85df9f4c76f26ecd171e0ab7d1fcc03b928eb9b3331df188598628b10e58a93",
    }:
        fail()
    g002 = exact(rules["g002"], (
        "modulePath", "workspacePath", "lockImporter", "packageName",
        "nodeVersion", "dependencyPaths",
    ))
    if g002 != {
        "modulePath": "spacetimedb/genesis002",
        "workspacePath": "spacetimedb",
        "lockImporter": "genesis002",
        "packageName": "warpkeep-genesis-002-spacetimedb-module",
        "nodeVersion": "22.22.3",
        "dependencyPaths": [
            "spacetimedb/package.json", "spacetimedb/pnpm-workspace.yaml",
            "spacetimedb/pnpm-lock.yaml", "spacetimedb/genesis002/package.json",
        ],
    }:
        fail()
    dynamic_rules = {
        "ptr": ("spacetimedb/ptr", "warpkeep-ptr-spacetimedb-module", ["spacetimedb/ptr/package.json", "spacetimedb/ptr/pnpm-lock.yaml"]),
    }
    for realm, expected in dynamic_rules.items():
        rule = exact(rules[realm], (
            "modulePath", "importer", "nodeVersion", "dependencyPaths",
        ))
        if (
            rule["modulePath"] != expected[0]
            or rule["importer"] != expected[1]
            or rule["nodeVersion"] != "22.22.3"
            or rule["dependencyPaths"] != expected[2]
        ):
            fail()
    return policy


def validate_request(value: object) -> dict[str, object]:
    request = exact(value, (
        "schemaVersion", "profile", "sourcePolicy", "sourcePolicySha256",
        "platform", "sources", "programs",
    ))
    if (
        request["schemaVersion"] != 1
        or request["profile"]
        != "warpkeep-release-recovery-wsl-toolchain-bootstrap-request-v1"
    ):
        fail()
    policy = validate_source_policy(request["sourcePolicy"])
    policy_digest = lower_hex_64(request["sourcePolicySha256"])
    policy_bytes = (
        json.dumps(policy, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")
    if hashlib.sha256(policy_bytes).hexdigest() != policy_digest:
        fail()
    platform = exact(request["platform"], (
        "schemaVersion", "profile", "executableSha256", "wslVersion",
        "distribution", "osReleaseSha256", "kernelReleaseSha256", "gitSha256",
        "unshareSha256", "loopbackToolSha256",
    ))
    if (
        platform["schemaVersion"] != 1
        or platform["profile"]
        != "warpkeep-release-recovery-wsl-host-guest-preflight-v1"
        or platform["executableSha256"] != policy["hostGuest"]["wslExecutableSha256"]
        or platform["wslVersion"] != policy["hostGuest"]["wslVersion"]
        or platform["distribution"] != policy["distribution"]
        or platform["osReleaseSha256"] != policy["hostGuest"]["guestOsReleaseSha256"]
        or platform["kernelReleaseSha256"] != policy["hostGuest"]["guestKernelReleaseSha256"]
        or platform["gitSha256"] != policy["systemTools"]["git"]["sha256"]
        or platform["unshareSha256"] != policy["systemTools"]["unshare"]["sha256"]
        or platform["loopbackToolSha256"] != policy["systemTools"]["ip"]["sha256"]
    ):
        fail()
    dynamic_sources = exact(request["sources"], ("g002", "ptr"))
    sources: dict[str, object] = {
        "g001": {
            "sourceCommit": policy["sourceRules"]["g001"]["sourceCommit"],
            "sourceTree": policy["sourceRules"]["g001"]["sourceTree"],
        }
    }
    for realm in ("g002", "ptr"):
        source = exact(dynamic_sources[realm], (
            "sourceCommit", "sourceTree", "historicalDependencyClosureSha256",
        ))
        lower_hex_40(source["sourceCommit"])
        lower_hex_40(source["sourceTree"])
        lower_hex_64(source["historicalDependencyClosureSha256"])
        sources[realm] = dict(source)
    programs = exact(request["programs"], (
        "bootstrapProgramBytes", "bootstrapProgramSha256",
        "materializerProgramBytes", "materializerProgramSha256",
    ))
    positive_integer(programs["bootstrapProgramBytes"], 16 * 1024 * 1024)
    positive_integer(programs["materializerProgramBytes"], 16 * 1024 * 1024)
    lower_hex_64(programs["bootstrapProgramSha256"])
    lower_hex_64(programs["materializerProgramSha256"])
    return {
        "sourcePolicy": policy,
        "sourcePolicySha256": policy_digest,
        "platform": platform,
        "sources": sources,
        "programs": programs,
    }


def canonical_bytes(value: object) -> bytes:
    return (
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _inside(parent: str, child: str) -> bool:
    try:
        return os.path.commonpath((parent, child)) == parent
    except ValueError:
        return False


def _validate_public_object_database(path: object) -> str:
    if (
        type(path) is not str
        or len(path) < len("/mnt/c/a/.git/objects")
        or len(path) > 4096
        or not path.startswith("/mnt/")
        or not path.endswith("/.git/objects")
        or "\\" in path
        or "\x00" in path
        or any(part in ("", ".", "..") for part in PurePosixPath(path).parts[1:])
        or os.path.realpath(path) != path
    ):
        fail()
    current = "/"
    for part in PurePosixPath(path).parts[1:]:
        current = os.path.join(current, part)
        value = os.lstat(current)
        if not stat.S_ISDIR(value.st_mode) or stat.S_ISLNK(value.st_mode):
            fail()
    for poison in ("info/alternates", "info/http-alternates"):
        if os.path.lexists(os.path.join(path, poison)):
            fail()
    git_directory = os.path.dirname(path)
    for poison in ("info/grafts", "refs/replace"):
        if os.path.lexists(os.path.join(git_directory, poison)):
            fail()
    return path


def _fixed_process(
    executable: str,
    arguments: list[str],
    environment: dict[str, str],
    maximum_bytes: int,
    input_bytes: bytes | None = None,
) -> bytes:
    result = subprocess.run(
        [executable, *arguments],
        check=False,
        cwd="/",
        env=environment,
        input=input_bytes,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=600,
    )
    if (
        result.returncode != 0
        or len(result.stderr) != 0
        or len(result.stdout) > maximum_bytes
    ):
        fail()
    return result.stdout


def _git_environment(object_directory: str, git_directory: str) -> dict[str, str]:
    return {
        "GIT_ALTERNATE_OBJECT_DIRECTORIES": "",
        "GIT_ASKPASS": "/bin/false",
        "GIT_CONFIG_GLOBAL": "/dev/null",
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_SYSTEM": "/dev/null",
        "GIT_DIR": git_directory,
        "GIT_OBJECT_DIRECTORY": object_directory,
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_TERMINAL_PROMPT": "0",
        "HOME": f"{STAGE_PATH}/source-home",
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "SSH_ASKPASS": "/bin/false",
        "TZ": "UTC",
    }


def _read_git_object(
    object_id: str,
    object_directory: str,
    git_directory: str,
    runner=_fixed_process,
) -> tuple[str, bytes]:
    lower_hex_40(object_id)
    environment = _git_environment(object_directory, git_directory)
    object_type = runner(
        "/usr/bin/git", ["--no-replace-objects", "cat-file", "-t", object_id],
        environment, 16,
    )
    if object_type not in (b"blob\n", b"tree\n", b"commit\n"):
        fail()
    kind = object_type[:-1].decode("ascii")
    raw_size = runner(
        "/usr/bin/git", ["--no-replace-objects", "cat-file", "-s", object_id],
        environment, 32,
    )
    if not raw_size.endswith(b"\n") or not raw_size[:-1].isdigit():
        fail()
    size = int(raw_size[:-1])
    if size < 0 or size > MAX_FILE_BYTES:
        fail()
    content = runner(
        "/usr/bin/git", ["--no-replace-objects", "cat-file", kind, object_id],
        environment, size + 1,
    )
    if len(content) != size:
        fail()
    calculated = hashlib.sha1(
        f"{kind} {size}\0".encode("ascii") + content,
        usedforsecurity=False,
    ).hexdigest()
    if calculated != object_id:
        fail()
    return kind, content


def _tree_entries(content: bytes) -> list[tuple[str, str, str]]:
    entries: list[tuple[str, str, str]] = []
    cursor = 0
    seen: set[bytes] = set()
    while cursor < len(content):
        separator = content.find(b" ", cursor)
        terminator = content.find(b"\0", separator + 1)
        if separator <= cursor or terminator <= separator or terminator + 21 > len(content):
            fail()
        mode = content[cursor:separator]
        name_bytes = content[separator + 1:terminator]
        object_id = content[terminator + 1:terminator + 21].hex()
        if (
            mode not in (b"40000", b"100644", b"100755")
            or len(name_bytes) < 1
            or len(name_bytes) > 255
            or name_bytes in seen
            or b"/" in name_bytes
            or b"\\" in name_bytes
            or b"\n" in name_bytes
            or b"\r" in name_bytes
            or name_bytes in (b".", b"..")
        ):
            fail()
        try:
            name = name_bytes.decode("utf-8", "strict")
        except UnicodeDecodeError:
            fail()
        seen.add(name_bytes)
        entries.append((mode.decode("ascii"), name, object_id))
        cursor = terminator + 21
    if cursor != len(content):
        fail()
    return entries


def _commit_tree(content: bytes) -> str:
    if len(content) < 46 or content[:5] != b"tree " or content[45:46] != b"\n":
        fail()
    try:
        tree = content[5:45].decode("ascii")
    except UnicodeDecodeError:
        fail()
    return lower_hex_40(tree)


def _walk_tree(
    root: str,
    read_object,
    objects: dict[str, tuple[str, bytes]],
) -> None:
    pending = [root]
    visited: set[str] = set()
    while pending:
        object_id = pending.pop()
        if object_id in visited:
            continue
        visited.add(object_id)
        known = objects.get(object_id)
        kind, content = known if known is not None else read_object(object_id)
        if kind != "tree":
            fail()
        objects[object_id] = (kind, content)
        for mode, _name, child in _tree_entries(content):
            child_kind, child_content = read_object(child)
            expected_kind = "tree" if mode == "40000" else "blob"
            if child_kind != expected_kind:
                fail()
            prior = objects.get(child)
            if prior is not None and prior != (child_kind, child_content):
                fail()
            objects[child] = (child_kind, child_content)
            if child_kind == "tree":
                pending.append(child)
        if len(objects) > MAX_SOURCE_OBJECTS:
            fail()


def _resolve_tree_path(root: str, path: str, objects: dict[str, tuple[str, bytes]]) -> str:
    safe_git_path(path)
    current = root
    for index, component in enumerate(PurePosixPath(path).parts):
        kind, content = objects.get(current, (None, None))
        if kind != "tree" or type(content) is not bytes:
            fail()
        matches = [entry for entry in _tree_entries(content) if entry[1] == component]
        if len(matches) != 1:
            fail()
        mode, _name, current = matches[0]
        if index < len(PurePosixPath(path).parts) - 1 and mode != "40000":
            fail()
    return current


def _make_directory(path: str, mode: int = 0o700) -> None:
    os.mkdir(path, mode)
    os.chmod(path, mode)


def _write_exclusive(path: str, content: bytes, mode: int) -> None:
    descriptor = os.open(
        path,
        os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0),
        mode,
    )
    try:
        written = 0
        while written < len(content):
            count = os.write(descriptor, content[written:])
            if count < 1:
                fail()
            written += count
        os.fsync(descriptor)
    finally:
        os.close(descriptor)
    os.chmod(path, mode)


def _write_loose_object(repository: str, object_id: str, kind: str, content: bytes) -> str:
    directory = os.path.join(repository, "objects", object_id[:2])
    if not os.path.exists(directory):
        _make_directory(directory)
    target = os.path.join(directory, object_id[2:])
    encoded = zlib.compress(f"{kind} {len(content)}\0".encode("ascii") + content, 9)
    _write_exclusive(target, encoded, 0o400)
    return target


def _source_coordinates(parsed: dict[str, object]) -> list[dict[str, object]]:
    policy = parsed["sourcePolicy"]
    rules = policy["sourceRules"]
    return [
        {
            "realm": "g001",
            "role": "source",
            "commit": rules["g001"]["sourceCommit"],
            "tree": rules["g001"]["sourceTree"],
            "treePath": "",
        },
        {
            "realm": "g001",
            "role": "preparation",
            "commit": rules["g001"]["preparationCommit"],
            "tree": rules["g001"]["preparationTree"],
            "treePath": "",
        },
        {
            "realm": "g002",
            "role": "source",
            "commit": parsed["sources"]["g002"]["sourceCommit"],
            "tree": parsed["sources"]["g002"]["sourceTree"],
            "treePath": rules["g002"]["modulePath"],
        },
        {
            "realm": "ptr",
            "role": "source",
            "commit": parsed["sources"]["ptr"]["sourceCommit"],
            "tree": parsed["sources"]["ptr"]["sourceTree"],
            "treePath": rules["ptr"]["modulePath"],
        },
    ]


def _export_source_objects(
    parsed: dict[str, object],
    object_directory: str,
    destination: str,
    runner=_fixed_process,
) -> tuple[
    dict[str, object],
    dict[str, list[dict[str, object]]],
    dict[str, dict[str, bytes]],
]:
    if os.path.lexists(destination):
        fail()
    parent = os.path.dirname(destination)
    if not os.path.isdir(parent) or os.path.islink(parent):
        fail()
    _make_directory(destination)
    for name in ("objects", "refs"):
        _make_directory(os.path.join(destination, name))
    _write_exclusive(os.path.join(destination, "HEAD"), b"ref: refs/heads/never\n", 0o400)
    _write_exclusive(
        os.path.join(destination, "config"),
        b"[core]\n\trepositoryformatversion = 0\n\tbare = true\n",
        0o400,
    )
    source_git_directory = os.path.join(os.path.dirname(destination), ".source-reader.git")
    _make_directory(source_git_directory)
    _make_directory(os.path.join(source_git_directory, "refs"))
    _write_exclusive(os.path.join(source_git_directory, "HEAD"), b"ref: refs/heads/never\n", 0o400)
    _write_exclusive(
        os.path.join(source_git_directory, "config"),
        b"[core]\n\trepositoryformatversion = 0\n\tbare = true\n",
        0o400,
    )
    objects: dict[str, tuple[str, bytes]] = {}

    def source_read(object_id: str) -> tuple[str, bytes]:
        return _read_git_object(
            object_id, object_directory, source_git_directory, runner,
        )

    coordinates = _source_coordinates(parsed)
    roots: dict[str, str] = {}
    for coordinate in coordinates:
        commit = coordinate["commit"]
        expected_tree = coordinate["tree"]
        kind, content = source_read(commit)
        if kind != "commit":
            fail()
        root_tree = _commit_tree(content)
        objects[commit] = (kind, content)
        _walk_tree(root_tree, source_read, objects)
        selected_tree = root_tree
        if coordinate["treePath"]:
            selected_tree = _resolve_tree_path(root_tree, coordinate["treePath"], objects)
        if selected_tree != expected_tree:
            fail()
        roots[f"{coordinate['realm']}:{coordinate['role']}"] = root_tree
    total = sum(len(content) for _kind, content in objects.values())
    if len(objects) < 1 or len(objects) > MAX_SOURCE_OBJECTS or total > MAX_SOURCE_OBJECT_BYTES:
        fail()
    for object_id, (kind, content) in sorted(objects.items()):
        _write_loose_object(destination, object_id, kind, content)

    dependency_files: dict[str, list[dict[str, object]]] = {}
    dependency_contents: dict[str, dict[str, bytes]] = {}
    rules = parsed["sourcePolicy"]["sourceRules"]
    for realm in ("g001", "g002", "ptr"):
        root_tree = roots[f"{realm}:source"]
        records: list[dict[str, object]] = []
        contents: dict[str, bytes] = {}
        for index, evidence_path in enumerate(rules[realm]["dependencyPaths"]):
            blob = _resolve_tree_path(root_tree, evidence_path, objects)
            kind, content = objects.get(blob, (None, None))
            if kind != "blob" or type(content) is not bytes:
                fail()
            if realm == "g001" and blob != rules[realm]["dependencyBlobs"][index]:
                fail()
            records.append({
                "path": evidence_path,
                "blob": blob,
                "bytes": len(content),
                "sha256": sha256_bytes(content),
            })
            contents[evidence_path] = content
        dependency_files[realm] = records
        dependency_contents[realm] = contents
    preparation_checks = (
        (rules["g001"]["preparationManifestPath"], rules["g001"]["preparationManifestBlob"], rules["g001"]["preparationManifestBytes"], rules["g001"]["preparationManifestSha256"]),
        (rules["g001"]["materializerPath"], rules["g001"]["materializerBlob"], None, rules["g001"]["materializerSha256"]),
    )
    preparation_root = roots["g001:preparation"]
    for path, expected_blob, expected_bytes, expected_sha in preparation_checks:
        blob = _resolve_tree_path(preparation_root, path, objects)
        kind, content = objects.get(blob, (None, None))
        if (
            blob != expected_blob
            or kind != "blob"
            or type(content) is not bytes
            or (expected_bytes is not None and len(content) != expected_bytes)
            or sha256_bytes(content) != expected_sha
        ):
            fail()

    closure = hashlib.sha256()
    closure.update(b"warpkeep.release-recovery.source-object-export.v1\n")
    inventory_entries: list[dict[str, object]] = []
    for object_id, (kind, content) in sorted(objects.items()):
        entry = {
            "objectId": object_id,
            "type": kind,
            "bytes": len(content),
            "sha256": sha256_bytes(content),
        }
        inventory_entries.append(entry)
        closure.update(
            f"{object_id}\0{kind}\0{len(content)}\0{entry['sha256']}\n".encode("ascii")
        )
        verified_kind, verified_content = _read_git_object(
            object_id,
            os.path.join(destination, "objects"),
            destination,
            runner,
        )
        if verified_kind != kind or verified_content != content:
            fail()
    inventory = {
        "schemaVersion": 1,
        "profile": "warpkeep-release-recovery-source-object-inventory-v1",
        "domain": "warpkeep.release-recovery.source-object-export.v1",
        "objectCount": len(inventory_entries),
        "objectBytes": total,
        "objectClosureSha256": closure.hexdigest(),
        "entries": inventory_entries,
    }
    inventory_path = os.path.join(parent, "repository-object-inventory-v1.json")
    _write_exclusive(inventory_path, canonical_bytes(inventory), 0o400)
    source_evidence = {
        "profile": "warpkeep-release-recovery-source-object-export-v1",
        "repositoryPath": "source-caches/repository.git",
        "objectFormat": "sha1",
        "objectInventoryDomain": "warpkeep.release-recovery.source-object-export.v1",
        "objectInventoryRecordPath": "source-caches/repository-object-inventory-v1.json",
        "objectCount": len(inventory_entries),
        "objectBytes": total,
        "objectClosureSha256": closure.hexdigest(),
        "exactObjectsVerified": True,
        "sources": {
            "g001": {
                "sourceCommit": parsed["sources"]["g001"]["sourceCommit"],
                "sourceTree": parsed["sources"]["g001"]["sourceTree"],
                "preparationCommit": rules["g001"]["preparationCommit"],
                "preparationTree": rules["g001"]["preparationTree"],
            },
            "g002": {
                "sourceCommit": parsed["sources"]["g002"]["sourceCommit"],
                "sourceTree": parsed["sources"]["g002"]["sourceTree"],
            },
            "ptr": {
                "sourceCommit": parsed["sources"]["ptr"]["sourceCommit"],
                "sourceTree": parsed["sources"]["ptr"]["sourceTree"],
            },
        },
    }
    _remove_tree(source_git_directory)
    return source_evidence, dependency_files, dependency_contents


def _parsed_https_url(value: object, expected_host: str | None = None):
    if type(value) is not str or len(value) < 12 or len(value) > 2048:
        fail()
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.port is not None
        or parsed.fragment
        or (expected_host is not None and parsed.hostname != expected_host)
    ):
        fail()
    if parsed.hostname in ("localhost", "localhost.localdomain"):
        fail()
    try:
        host_bytes = parsed.hostname.encode("ascii", "strict")
    except UnicodeEncodeError:
        fail()
    if len(host_bytes) < 1 or len(host_bytes) > 253:
        fail()
    return parsed


def _request_once(
    url: str,
    maximum_bytes: int,
    connection_factory=http.client.HTTPSConnection,
) -> tuple[int, dict[str, str], bytes]:
    if maximum_bytes < 0 or maximum_bytes > MAX_FILE_BYTES:
        fail()
    parsed = _parsed_https_url(url)
    path = parsed.path or "/"
    if parsed.query:
        path += f"?{parsed.query}"
    connection = None
    response = None
    chunks: list[bytes] = []
    total = 0
    try:
        context = ssl.create_default_context()
        connection = connection_factory(
            parsed.hostname,
            443,
            timeout=60,
            context=context,
        )
        connection.putrequest("GET", path, skip_accept_encoding=True)
        connection.endheaders()
        response = connection.getresponse()
        headers: dict[str, str] = {}
        for name, raw_value in response.getheaders():
            lowered = name.lower()
            if lowered in headers or "\r" in raw_value or "\n" in raw_value:
                fail()
            headers[lowered] = raw_value
        if headers.get("content-encoding", "identity").lower() not in ("", "identity"):
            fail()
        raw_length = headers.get("content-length")
        if raw_length is not None:
            if not raw_length.isascii() or not raw_length.isdigit():
                fail()
            announced = int(raw_length)
            if announced > maximum_bytes:
                fail()
        while True:
            chunk = response.read(min(64 * 1024, maximum_bytes - total + 1))
            if not isinstance(chunk, bytes):
                fail()
            if not chunk:
                break
            total += len(chunk)
            if total > maximum_bytes:
                fail()
            chunks.append(chunk)
        content = b"".join(chunks)
        if raw_length is not None and len(content) != int(raw_length):
            fail()
        return response.status, headers, content
    finally:
        if response is not None:
            response.close()
        if connection is not None:
            connection.close()


def _verify_download(content: bytes, expected_bytes: int, expected_sha256: str) -> bytes:
    if len(content) != expected_bytes or sha256_bytes(content) != expected_sha256:
        fail()
    return content


def _fetch_exact(
    url: str,
    expected_bytes: int,
    expected_sha256: str,
    requester=_request_once,
) -> bytes:
    status, headers, content = requester(url, expected_bytes)
    if status != 200 or "location" in headers:
        fail()
    return _verify_download(content, expected_bytes, expected_sha256)


def _fetch_spacetime(
    policy: dict[str, object],
    requester=_request_once,
) -> bytes:
    first_url = policy["archiveUrl"]
    _parsed_https_url(first_url, "github.com")
    status, headers, first_body = requester(first_url, 64 * 1024)
    if status != 302 or "location" not in headers:
        fail()
    # The first response is transport metadata only and can never be artifact bytes.
    del first_body
    target = headers["location"]
    _parsed_https_url(target, "release-assets.githubusercontent.com")
    status, second_headers, content = requester(target, policy["archiveBytes"])
    if status != 200 or "location" in second_headers:
        fail()
    return _verify_download(content, policy["archiveBytes"], policy["archiveSha256"])


def _safe_archive_name(value: str) -> str:
    if (
        len(value) < 1
        or len(value) > 4096
        or value.startswith("/")
        or "\\" in value
        or "\x00" in value
        or any(part in ("", ".", "..") for part in PurePosixPath(value).parts)
    ):
        fail()
    return value


def _extract_selected_members(
    archive: bytes,
    mode: str,
    expectations: dict[str, dict[str, object]],
) -> dict[str, bytes]:
    if mode not in ("r:xz", "r:gz") or not expectations:
        fail()
    selected: dict[str, bytes] = {}
    count = 0
    try:
        opened = tarfile.open(fileobj=io.BytesIO(archive), mode=mode)
        with opened:
            for member in opened:
                count += 1
                if count > MAX_ARCHIVE_MEMBERS:
                    fail()
                name = _safe_archive_name(member.name)
                if name not in expectations:
                    continue
                if name in selected or not member.isfile():
                    fail()
                expected = expectations[name]
                if (
                    stat.S_IMODE(member.mode) != int(expected["mode"], 8)
                    or member.size != expected["bytes"]
                    or member.size > MAX_FILE_BYTES
                ):
                    fail()
                stream = opened.extractfile(member)
                if stream is None:
                    fail()
                content = stream.read(expected["bytes"] + 1)
                if (
                    len(content) != expected["bytes"]
                    or sha256_bytes(content) != expected["sha256"]
                ):
                    fail()
                selected[name] = content
    except (tarfile.TarError, EOFError, OSError):
        fail()
    if set(selected) != set(expectations):
        fail()
    return selected


def _validate_shasums(content: bytes, archive_url: str, archive_sha256: str) -> None:
    archive_name = PurePosixPath(urlsplit(archive_url).path).name
    expected = f"{archive_sha256}  {archive_name}".encode("ascii")
    lines = content.splitlines()
    if lines.count(expected) != 1:
        fail()
    for line in lines:
        if b"\x00" in line or b"\r" in line or len(line) > 4096:
            fail()


def _validate_gpg_listing(content: bytes, fingerprint: str, algorithm: str) -> None:
    try:
        lines = content.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError:
        fail()
    public_positions = [index for index, line in enumerate(lines) if line.startswith("pub:")]
    expected_algorithm = "22" if algorithm == "EdDSA" else "1" if algorithm == "RSA" else None
    if expected_algorithm is None or len(public_positions) != 1:
        fail()
    public = lines[public_positions[0]].split(":")
    primary_fingerprint = None
    for line in lines[public_positions[0] + 1:]:
        if line.startswith(("pub:", "sub:")):
            break
        if line.startswith("fpr:"):
            fields = line.split(":")
            if len(fields) < 10 or primary_fingerprint is not None:
                fail()
            primary_fingerprint = fields[9]
    if len(public) < 5 or public[3] != expected_algorithm or primary_fingerprint != fingerprint:
        fail()


def _validate_gpgv_status(content: bytes, fingerprint: str) -> None:
    try:
        lines = content.decode("utf-8", "strict").splitlines()
    except UnicodeDecodeError:
        fail()
    valid = [line.split() for line in lines if line.startswith("[GNUPG:] VALIDSIG ")]
    if len(valid) != 1 or len(valid[0]) < 3 or valid[0][2] != fingerprint:
        fail()
    if any(line.startswith("[GNUPG:] ") and any(token in line for token in (
        "BADSIG", "ERRSIG", "NO_PUBKEY", "EXPSIG", "EXPKEYSIG", "REVKEYSIG",
    )) for line in lines):
        fail()


def _verify_node_signature(
    key: bytes,
    shasums: bytes,
    signature: bytes,
    release: dict[str, object],
    working_directory: str,
    runner=_fixed_process,
) -> None:
    if os.path.lexists(working_directory):
        fail()
    _make_directory(working_directory)
    key_path = os.path.join(working_directory, "release-key.asc")
    sums_path = os.path.join(working_directory, "SHASUMS256.txt")
    signature_path = os.path.join(working_directory, "SHASUMS256.txt.sig")
    _write_exclusive(key_path, key, 0o400)
    _write_exclusive(sums_path, shasums, 0o400)
    _write_exclusive(signature_path, signature, 0o400)
    environment = {
        "GNUPGHOME": working_directory,
        "HOME": working_directory,
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin",
        "TZ": "UTC",
    }
    runner("/usr/bin/gpg", [
        "--homedir", working_directory, "--batch", "--no-options",
        "--no-auto-key-locate", "--no-autostart", "--quiet",
        "--status-fd=1", "--logger-fd=1", "--import", key_path,
    ], environment, 64 * 1024)
    listing = runner("/usr/bin/gpg", [
        "--homedir", working_directory, "--batch", "--no-options",
        "--no-auto-key-locate", "--no-autostart", "--quiet",
        "--logger-fd=1", "--with-colons",
        "--fingerprint", "--list-keys",
    ], environment, 64 * 1024)
    _validate_gpg_listing(
        listing, release["signerFingerprint"], release["signingAlgorithm"]
    )
    status = runner("/usr/bin/gpgv", [
        "--status-fd=1", "--logger-fd=1", "--keyring",
        os.path.join(working_directory, "pubring.kbx"),
        signature_path, sums_path,
    ], environment, 64 * 1024)
    _validate_gpgv_status(status, release["signerFingerprint"])


def _verify_sri(content: bytes, sri: str) -> None:
    if not sri.startswith("sha512-"):
        fail()
    try:
        expected = base64.b64decode(sri[7:], validate=True)
    except (ValueError, TypeError):
        fail()
    if len(expected) != 64 or hashlib.sha512(content).digest() != expected:
        fail()


def _yaml_scalar(value: str) -> str:
    value = value.strip()
    if len(value) >= 2 and value[0] == "'" and value[-1] == "'":
        return value[1:-1].replace("''", "'")
    if (
        not value
        or value[0] in ('"', "[", "{")
        or " #" in value
        or any(character in value for character in "\r\n\0")
    ):
        fail()
    return value


def _yaml_key(line: str, indentation: int) -> str:
    prefix = " " * indentation
    if not line.startswith(prefix) or line.startswith(prefix + " ") or not line.endswith(":"):
        fail()
    return _yaml_scalar(line[indentation:-1])


def _yaml_section(lines: list[str], name: str) -> list[str]:
    positions = [index for index, line in enumerate(lines) if line == f"{name}:"]
    if len(positions) != 1:
        fail()
    start = positions[0] + 1
    end = len(lines)
    for index in range(start, len(lines)):
        if lines[index] and not lines[index].startswith(" "):
            end = index
            break
    return lines[start:end]


def _yaml_records(lines: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    current: str | None = None
    for line in lines:
        if not line or line.startswith("#"):
            continue
        if line.startswith("  ") and not line.startswith("    "):
            current = _yaml_key(line, 2)
            if current in result:
                fail()
            result[current] = []
        elif current is None or not line.startswith("    "):
            fail()
        else:
            result[current].append(line)
    return result


def _inline_list(value: str) -> list[str]:
    value = value.strip()
    if not value.startswith("[") or not value.endswith("]"):
        fail()
    body = value[1:-1].strip()
    if not body:
        return []
    return [_yaml_scalar(item.strip()) for item in body.split(",")]


def _package_coordinate(value: str) -> tuple[str, str]:
    head = value.split("(", 1)[0]
    marker = head.find("@", head.find("/") + 1) if head.startswith("@") else head.find("@")
    if marker <= 0 or marker == len(head) - 1:
        fail()
    name = head[:marker]
    version = head[marker + 1:]
    if (
        not name
        or not version
        or not all(character.isalnum() or character in "@/._~-" for character in name)
        or not all(character.isalnum() or character in ".-_+" for character in version)
    ):
        fail()
    return name, version


def _dependency_groups(lines: list[str], parent_indent: int) -> list[tuple[str, str, bool]]:
    result: list[tuple[str, str, bool]] = []
    group: str | None = None
    current_name: str | None = None
    for line in lines:
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))
        if indent == parent_indent and stripped in (
            "dependencies:", "devDependencies:", "optionalDependencies:",
        ):
            group = stripped[:-1]
            current_name = None
        elif group is not None and indent == parent_indent + 2 and stripped.endswith(":"):
            current_name = _yaml_key(line, parent_indent + 2)
        elif (
            group is not None
            and current_name is not None
            and indent == parent_indent + 4
            and stripped.startswith("version:")
        ):
            reference = _yaml_scalar(stripped[len("version:"):])
            result.append((current_name, reference, group == "optionalDependencies"))
            current_name = None
        elif group is not None and indent == parent_indent + 2 and ":" in stripped:
            name, reference = stripped.split(":", 1)
            result.append((
                _yaml_scalar(name), _yaml_scalar(reference),
                group == "optionalDependencies",
            ))
            current_name = None
    return result


def _package_metadata(lines: list[str]) -> tuple[str, list[str], list[str]]:
    integrity: str | None = None
    os_values: list[str] = []
    cpu_values: list[str] = []
    resolution_open = False
    for line in lines:
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))
        if indent == 4 and stripped.startswith("resolution: {") and stripped.endswith("}"):
            body = stripped[len("resolution: {"):-1]
            pairs = [part.strip() for part in body.split(",")]
            for pair in pairs:
                if pair.startswith("integrity:"):
                    if integrity is not None:
                        fail()
                    integrity = _yaml_scalar(pair[len("integrity:"):])
        elif indent == 4 and stripped == "resolution:":
            resolution_open = True
        elif resolution_open and indent == 6 and stripped.startswith("integrity:"):
            if integrity is not None:
                fail()
            integrity = _yaml_scalar(stripped[len("integrity:"):])
        elif indent == 4 and stripped.startswith("os:"):
            os_values = _inline_list(stripped[len("os:"):])
        elif indent == 4 and stripped.startswith("cpu:"):
            cpu_values = _inline_list(stripped[len("cpu:"):])
    if integrity is None or not integrity.startswith("sha512-"):
        fail()
    return integrity, os_values, cpu_values


def _compatible_platform(os_values: list[str], cpu_values: list[str]) -> bool:
    os_allowed = not os_values or "linux" in os_values
    cpu_allowed = not cpu_values or "x64" in cpu_values
    if "!linux" in os_values or "!x64" in cpu_values:
        return False
    return os_allowed and cpu_allowed


def _canonical_package_url(name: str, version: str) -> str:
    basename = name.split("/")[-1]
    return f"https://registry.npmjs.org/{name}/-/{basename}-{version}.tgz"


def _parse_lock_packages(lock_bytes: bytes, importer: str) -> list[dict[str, object]]:
    if len(lock_bytes) < 1 or len(lock_bytes) > 16 * 1024 * 1024:
        fail()
    try:
        text = lock_bytes.decode("utf-8", "strict")
    except UnicodeDecodeError:
        fail()
    if "\r" in text or "\0" in text or not text.endswith("\n"):
        fail()
    lines = text.splitlines()
    if lines.count("lockfileVersion: '9.0'") != 1:
        fail()
    importer_records = _yaml_records(_yaml_section(lines, "importers"))
    package_records = _yaml_records(_yaml_section(lines, "packages"))
    snapshot_records = _yaml_records(_yaml_section(lines, "snapshots"))
    if importer not in importer_records:
        fail()
    package_by_coordinate: dict[tuple[str, str], tuple[str, list[str], list[str]]] = {}
    for key, record in package_records.items():
        coordinate = _package_coordinate(key)
        if coordinate in package_by_coordinate:
            fail()
        package_by_coordinate[coordinate] = _package_metadata(record)

    pending = _dependency_groups(importer_records[importer], 4)
    selected: dict[tuple[str, str], dict[str, object]] = {}
    visited_snapshots: set[str] = set()
    while pending:
        name, reference, optional = pending.pop()
        if reference.startswith(("link:", "workspace:", "file:", "http:", "https:")):
            fail()
        snapshot_key = f"{name}@{reference}"
        if snapshot_key not in snapshot_records:
            base_reference = reference.split("(", 1)[0]
            snapshot_key = f"{name}@{base_reference}"
        if snapshot_key not in snapshot_records:
            fail()
        coordinate = _package_coordinate(snapshot_key)
        metadata = package_by_coordinate.get(coordinate)
        if metadata is None:
            fail()
        integrity, os_values, cpu_values = metadata
        if not _compatible_platform(os_values, cpu_values):
            if optional:
                continue
            fail()
        selected[coordinate] = {
            "name": coordinate[0],
            "version": coordinate[1],
            "url": _canonical_package_url(*coordinate),
            "sri": integrity,
            "os": os_values,
            "cpu": cpu_values,
        }
        if snapshot_key not in visited_snapshots:
            visited_snapshots.add(snapshot_key)
            pending.extend(_dependency_groups(snapshot_records[snapshot_key], 4))
        if len(selected) > 10_000:
            fail()
    ordered = [selected[key] for key in sorted(
        selected, key=lambda coordinate: f"{coordinate[0]}@{coordinate[1]}".encode("utf-8")
    )]
    if not any(
        entry["name"] == "@esbuild/linux-x64"
        and entry["os"] == ["linux"]
        and entry["cpu"] == ["x64"]
        for entry in ordered
    ):
        fail()
    return ordered


FINAL_CACHE_NAMES = (
    "toolchains", "pnpm-store", "source-caches", "cache-catalog-v2.json",
)


def _fsync_directory(path: str) -> None:
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0))
    except OSError:
        if os.name == "nt":
            return
        raise
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _ensure_private_directories(path: str, stop: str) -> None:
    stop = os.path.abspath(stop)
    path = os.path.abspath(path)
    if not _inside(stop, path):
        fail()
    relative = os.path.relpath(path, stop)
    current = stop
    if relative == ".":
        return
    for component in Path(relative).parts:
        if component in ("", ".", ".."):
            fail()
        current = os.path.join(current, component)
        if os.path.lexists(current):
            status = os.lstat(current)
            if not stat.S_ISDIR(status.st_mode) or stat.S_ISLNK(status.st_mode):
                fail()
        else:
            _make_directory(current)


def _install_cache_file(
    root: str,
    relative_path: str,
    content: bytes,
    mode: int,
    *,
    catalog_file: bool = False,
) -> None:
    if (
        type(content) is not bytes
        or len(content) > MAX_FILE_BYTES
        or mode not in (0o400, 0o500)
    ):
        fail()
    if catalog_file:
        if relative_path != "cache-catalog-v2.json":
            fail()
    else:
        safe_relative_path(relative_path)
    root = os.path.abspath(root)
    target = os.path.abspath(os.path.join(root, *PurePosixPath(relative_path).parts))
    if not _inside(root, target) or target == root:
        fail()
    _ensure_private_directories(os.path.dirname(target), root)
    _write_exclusive(target, content, mode)


def _inventory_cache(root: str) -> list[dict[str, object]]:
    root = os.path.abspath(root)
    entries: list[dict[str, object]] = []
    total_files = 0

    def visit(relative_path: str) -> None:
        nonlocal total_files
        path = os.path.join(root, *PurePosixPath(relative_path).parts)
        named = os.lstat(path)
        if stat.S_ISLNK(named.st_mode) or os.path.realpath(path) != path:
            fail()
        if stat.S_ISDIR(named.st_mode):
            if os.name != "nt" and stat.S_IMODE(named.st_mode) != 0o700:
                fail()
            entries.append({
                "path": relative_path,
                "type": "directory",
                "mode": "700",
            })
            try:
                children = os.listdir(path)
            except OSError:
                fail()
            encoded: list[tuple[bytes, str]] = []
            for child in children:
                if child in ("", ".", "..") or "/" in child or "\\" in child:
                    fail()
                try:
                    child_bytes = child.encode("utf-8", "strict")
                except UnicodeEncodeError:
                    fail()
                encoded.append((child_bytes, child))
            for _child_bytes, child in sorted(encoded):
                visit(f"{relative_path}/{child}")
            return
        observed_mode = 0o400 if os.name == "nt" else stat.S_IMODE(named.st_mode)
        if (
            not stat.S_ISREG(named.st_mode)
            or named.st_nlink != 1
            or observed_mode not in (0o400, 0o500)
            or named.st_size < 0
            or named.st_size > MAX_FILE_BYTES
        ):
            fail()
        total_files += 1
        if total_files > MAX_CACHE_FILES:
            fail()
        content = (
            Path(path).read_bytes()
            if os.name == "nt"
            else _read_cache_file(path, named.st_size, observed_mode)
        )
        entries.append({
            "path": relative_path,
            "type": "file",
            "mode": format(observed_mode, "o"),
            "bytes": len(content),
            "sha256": sha256_bytes(content),
        })

    for inventory_root in ("pnpm-store", "source-caches", "toolchains"):
        visit(inventory_root)
    entries.sort(key=lambda entry: entry["path"].encode("utf-8", "strict"))
    if total_files < 1:
        fail()
    return entries


def _cache_closure(entries: list[dict[str, object]]) -> str:
    digest = hashlib.sha256()
    digest.update(b"warpkeep.release-recovery.wsl-cache-catalog-closure.v2\n")
    previous = b""
    for entry in entries:
        path = safe_relative_path(entry["path"])
        encoded = path.encode("utf-8", "strict")
        if encoded <= previous:
            fail()
        previous = encoded
        if entry["type"] == "directory":
            if tuple(entry.keys()) != ("path", "type", "mode") or entry["mode"] != "700":
                fail()
            digest.update(f"directory\0{path}\0{entry['mode']}\n".encode("utf-8"))
        elif entry["type"] == "file":
            if tuple(entry.keys()) != ("path", "type", "mode", "bytes", "sha256"):
                fail()
            nonnegative_integer(entry["bytes"], MAX_FILE_BYTES)
            lower_hex_64(entry["sha256"])
            if entry["mode"] not in ("400", "500"):
                fail()
            digest.update(
                f"file\0{path}\0{entry['bytes']}\0{entry['sha256']}\0{entry['mode']}\n"
                .encode("utf-8")
            )
        else:
            fail()
    return digest.hexdigest()


def _create_cache_catalog(
    root: str,
    manifest_sha256: str,
) -> tuple[dict[str, object], bytes]:
    lower_hex_64(manifest_sha256)
    entries = _inventory_cache(root)
    manifest = [
        entry for entry in entries
        if entry["path"] == MANIFEST_RELATIVE_PATH and entry["type"] == "file"
    ]
    if len(manifest) != 1 or manifest[0]["sha256"] != manifest_sha256:
        fail()
    catalog = {
        "schemaVersion": 2,
        "profile": "warpkeep-release-recovery-wsl-cache-catalog-v2",
        "platform": "linux",
        "architecture": "x64",
        "inventoryRoots": ["pnpm-store", "source-caches", "toolchains"],
        "manifestPath": MANIFEST_RELATIVE_PATH,
        "manifestSha256": manifest_sha256,
        "cacheClosureSha256": _cache_closure(entries),
        "signaturesVerified": True,
        "offlineReady": True,
        "entries": entries,
    }
    return catalog, canonical_bytes(catalog)


def _journal_record(
    state: str,
    installed: list[str],
    next_name: str | None,
    result: dict[str, object] | None,
) -> dict[str, object]:
    if state not in ("BUILDING", "INSTALLING", "COMMITTED"):
        fail()
    if any(name not in FINAL_CACHE_NAMES for name in installed) or len(set(installed)) != len(installed):
        fail()
    if next_name is not None and next_name not in FINAL_CACHE_NAMES:
        fail()
    if state == "BUILDING" and (installed or next_name is not None or result is not None):
        fail()
    if state == "INSTALLING" and result is not None:
        fail()
    if state == "COMMITTED" and (
        installed != list(FINAL_CACHE_NAMES) or next_name is not None or type(result) is not dict
    ):
        fail()
    return {
        "schemaVersion": 1,
        "profile": "warpkeep-release-recovery-wsl-bootstrap-transaction-v1",
        "state": state,
        "installed": installed,
        "next": next_name,
        "result": result,
    }


def _write_journal(record: dict[str, object]) -> None:
    record = _journal_record(
        record["state"], list(record["installed"]), record["next"], record["result"],
    )
    temporary = f"{JOURNAL_PATH}.next"
    if os.path.lexists(temporary):
        fail()
    _write_exclusive(temporary, canonical_bytes(record), 0o600)
    os.replace(temporary, JOURNAL_PATH)
    _fsync_directory(TRANSACTION_PATH)


def _read_journal_path(path: str) -> dict[str, object]:
    raw = (
        Path(path).read_bytes()
        if os.name == "nt"
        else descriptor_read(path, 64 * 1024, 0o600)
    )
    value = exact(canonical_json_bytes(raw, 64 * 1024), (
        "schemaVersion", "profile", "state", "installed", "next", "result",
    ))
    if (
        value["schemaVersion"] != 1
        or value["profile"]
        != "warpkeep-release-recovery-wsl-bootstrap-transaction-v1"
        or type(value["installed"]) is not list
    ):
        fail()
    return _journal_record(
        value["state"], value["installed"], value["next"], value["result"],
    )


def _read_journal() -> dict[str, object]:
    return _read_journal_path(JOURNAL_PATH)


def _remove_exact_cache_target(name: str) -> None:
    if name not in FINAL_CACHE_NAMES:
        fail()
    target = os.path.join(STATE_ROOT, name)
    if not os.path.lexists(target):
        return
    status = os.lstat(target)
    if stat.S_ISLNK(status.st_mode):
        fail()
    if stat.S_ISDIR(status.st_mode):
        _remove_tree(target)
    elif stat.S_ISREG(status.st_mode):
        os.unlink(target)
    else:
        fail()
    _fsync_directory(STATE_ROOT)


def _remove_tree(path: str) -> None:
    if os.name == "nt":
        for current, directories, files in os.walk(path, topdown=False):
            for name in files:
                os.chmod(os.path.join(current, name), 0o600)
            for name in directories:
                os.chmod(os.path.join(current, name), 0o700)
        os.chmod(path, 0o700)
    shutil.rmtree(path)


def _recover_transaction() -> None:
    if not os.path.lexists(TRANSACTION_PATH):
        return
    transaction = os.lstat(TRANSACTION_PATH)
    if stat.S_ISLNK(transaction.st_mode) or not stat.S_ISDIR(transaction.st_mode):
        fail()
    temporary_journal = f"{JOURNAL_PATH}.next"
    if os.path.lexists(temporary_journal):
        _read_journal_path(temporary_journal)
        if os.path.lexists(JOURNAL_PATH):
            os.unlink(temporary_journal)
        else:
            os.replace(temporary_journal, JOURNAL_PATH)
        _fsync_directory(TRANSACTION_PATH)
    record = _read_journal()
    if record["state"] == "INSTALLING":
        rollback = list(record["installed"])
        if record["next"] is not None and record["next"] not in rollback:
            rollback.append(record["next"])
        for name in reversed(rollback):
            _remove_exact_cache_target(name)
    elif record["state"] == "COMMITTED":
        for name in FINAL_CACHE_NAMES:
            if not os.path.lexists(os.path.join(STATE_ROOT, name)):
                fail()
        return
    _remove_tree(TRANSACTION_PATH)
    _fsync_directory(STATE_ROOT)


def _begin_transaction() -> None:
    if os.path.lexists(TRANSACTION_PATH):
        fail()
    if any(os.path.lexists(os.path.join(STATE_ROOT, name)) for name in FINAL_CACHE_NAMES):
        fail()
    _make_directory(TRANSACTION_PATH)
    _make_directory(STAGE_PATH)
    _write_journal(_journal_record("BUILDING", [], None, None))
    _fsync_directory(STATE_ROOT)


def _durable_rename(source: str, destination: str) -> None:
    os.rename(source, destination)
    _fsync_directory(STATE_ROOT)


def _commit_transaction(result: dict[str, object]) -> None:
    installed: list[str] = []
    _write_journal(_journal_record("INSTALLING", installed, None, None))
    for name in FINAL_CACHE_NAMES:
        source = os.path.join(STAGE_PATH, name)
        destination = os.path.join(STATE_ROOT, name)
        if not os.path.lexists(source) or os.path.lexists(destination):
            fail()
        _write_journal(_journal_record("INSTALLING", list(installed), name, None))
        _durable_rename(source, destination)
        installed.append(name)
        _write_journal(_journal_record("INSTALLING", list(installed), None, None))
    _write_journal(_journal_record("COMMITTED", list(installed), None, dict(result)))


def _dependency_closure(
    realm: str,
    records: list[dict[str, object]],
) -> str:
    if realm not in ("g001", "g002", "ptr"):
        fail()
    digest = hashlib.sha256()
    digest.update(f"warpkeep.release-recovery.source-dependencies.{realm}.v1\n".encode("ascii"))
    normalized: list[tuple[bytes, dict[str, object]]] = []
    for record in records:
        entry = exact(record, ("path", "blob", "bytes", "sha256"))
        path = safe_git_path(entry["path"])
        encoded = path.encode("utf-8", "strict")
        lower_hex_40(entry["blob"])
        positive_integer(entry["bytes"], 16 * 1024 * 1024)
        lower_hex_64(entry["sha256"])
        normalized.append((encoded, entry))
    normalized.sort(key=lambda item: item[0])
    if any(
        normalized[index - 1][0] == normalized[index][0]
        for index in range(1, len(normalized))
    ):
        fail()
    for _encoded, entry in normalized:
        path = entry["path"]
        digest.update(
            f"{path}\0{entry['blob']}\0{entry['bytes']}\0{entry['sha256']}\n"
            .encode("utf-8")
        )
    return digest.hexdigest()


def _source_evidence_records(
    parsed: dict[str, object],
    dependency_files: dict[str, list[dict[str, object]]],
) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for realm in ("g001", "g002", "ptr"):
        records = dependency_files[realm]
        paths = parsed["sourcePolicy"]["sourceRules"][realm]["dependencyPaths"]
        if [record["path"] for record in records] != paths:
            fail()
        linux_source_closure = _dependency_closure(realm, records)
        historical_closure = parsed["sources"][realm].get(
            "historicalDependencyClosureSha256"
        )
        result[realm] = {
            "realm": realm,
            "sourceCommit": parsed["sources"][realm]["sourceCommit"],
            "sourceTree": parsed["sources"][realm]["sourceTree"],
            "historicalDependencyClosureSha256": historical_closure,
            "linuxSourceDependencyClosureSha256": linux_source_closure,
            "dependencyInventoryDomain":
                f"warpkeep.release-recovery.source-dependencies.{realm}.v1",
            "dependencyClosureRecordPath":
                f"source-caches/{realm}-linux-source-dependency-closure-sha256.txt",
            "dependencyFiles": records,
        }
    return result


def _json_document(raw: bytes, maximum: int) -> dict[str, object]:
    if len(raw) < 2 or len(raw) > maximum:
        fail()
    try:
        value = json.loads(
            raw.decode("utf-8", "strict"),
            object_pairs_hook=duplicate_rejecting_object,
        )
    except (Invalid, UnicodeDecodeError, json.JSONDecodeError):
        fail()
    if type(value) is not dict:
        fail()
    return value


def _workspace_policy(raw: bytes, module_path: str) -> None:
    try:
        text = raw.decode("utf-8", "strict")
    except UnicodeDecodeError:
        fail()
    if "\r" in text or "\0" in text or not text.endswith("\n"):
        fail()
    lines = text.splitlines()
    package_markers: list[str] = []
    allow_builds: dict[str, str] = {}
    section: str | None = None
    for line in lines:
        stripped = line.strip()
        indent = len(line) - len(line.lstrip(" "))
        if indent == 0 and stripped.endswith(":"):
            section = stripped[:-1]
            continue
        if section == "packages" and indent == 2 and stripped.startswith("- "):
            package_markers.append(_yaml_scalar(stripped[2:]))
        elif section == "allowBuilds" and indent == 2 and ":" in stripped:
            name, value = stripped.split(":", 1)
            name = _yaml_scalar(name)
            value = _yaml_scalar(value)
            if name in allow_builds:
                fail()
            allow_builds[name] = value
    if allow_builds != {"esbuild": "true"}:
        fail()
    relative = module_path.removeprefix("spacetimedb/")
    candidates = {module_path, relative, "."}
    matched = False
    for marker in package_markers:
        if marker in candidates:
            matched = True
        elif marker.endswith("/*"):
            prefix = marker[:-1]
            if module_path.startswith(prefix) or relative.startswith(prefix):
                matched = True
    if not matched:
        fail()


def _validate_dependency_documents(
    parsed: dict[str, object],
    contents: dict[str, dict[str, bytes]],
) -> dict[str, list[dict[str, object]]]:
    packages: dict[str, list[dict[str, object]]] = {}
    for realm in ("g001", "g002", "ptr"):
        rule = parsed["sourcePolicy"]["sourceRules"][realm]
        files = contents[realm]
        if set(files) != set(rule["dependencyPaths"]):
            fail()
        package_path = (
            "spacetimedb/package.json" if realm == "g001"
            else "spacetimedb/genesis002/package.json" if realm == "g002"
            else "spacetimedb/ptr/package.json"
        )
        package = _json_document(files[package_path], 1024 * 1024)
        package_name = rule["packageName"] if realm == "g002" else rule["importer"]
        if (
            package.get("name") != package_name
            or package.get("private") is not True
            or package.get("packageManager") != "pnpm@11.7.0"
            or type(package.get("scripts")) is not dict
        ):
            fail()
        if realm in ("g001", "g002"):
            workspace_path = (
                "spacetimedb/pnpm-workspace.yaml"
                if realm == "g001" else f"{rule['workspacePath']}/pnpm-workspace.yaml"
            )
            _workspace_policy(files[workspace_path], rule["modulePath"])
        lock_path = (
            "spacetimedb/pnpm-lock.yaml" if realm == "g001"
            else f"{rule['workspacePath']}/pnpm-lock.yaml" if realm == "g002"
            else "spacetimedb/ptr/pnpm-lock.yaml"
        )
        importer = rule["lockImporter"] if realm == "g002" else "."
        packages[realm] = _parse_lock_packages(files[lock_path], importer)
    return packages


def _attest_installed_file(
    path: str,
    expected_sha256: str,
    expected_mode: int,
    maximum: int = 256 * 1024 * 1024,
) -> int:
    if not os.path.isabs(path) or os.path.realpath(path) != path:
        fail()
    current = "/"
    for component in PurePosixPath(path).parts[1:-1]:
        current = os.path.join(current, component)
        value = os.lstat(current)
        if (
            stat.S_ISLNK(value.st_mode)
            or not stat.S_ISDIR(value.st_mode)
            or value.st_uid != 0
            or value.st_gid != 0
        ):
            fail()
    content = descriptor_read(path, maximum, expected_mode)
    if sha256_bytes(content) != expected_sha256:
        fail()
    return len(content)


def _system_environment() -> dict[str, str]:
    return {
        "HOME": "/root",
        "LANG": "C",
        "LC_ALL": "C",
        "PATH": "/usr/bin:/bin:/usr/sbin",
        "TZ": "UTC",
    }


def _attest_system_tools(policy: dict[str, object]) -> dict[str, dict[str, object]]:
    evidence: dict[str, dict[str, object]] = {}
    environment = _system_environment()
    for name in ("git", "gpg", "gpgv", "unshare", "ip"):
        expected = policy["systemTools"][name]
        installed_bytes = _attest_installed_file(
            expected["path"], expected["sha256"], 0o755, 64 * 1024 * 1024,
        )
        version = _fixed_process(
            "/usr/bin/dpkg-query",
            ["-W", "-f=${Version}\\n", expected["package"]],
            environment,
            1024,
        )
        if version != f"{expected['version']}\n".encode("utf-8"):
            fail()
        evidence[name] = {
            **expected,
            "installedBytes": installed_bytes,
            "installedMode": "755",
            "installedVerified": True,
        }
    return evidence


def _attest_programs(programs: dict[str, object]) -> dict[str, object]:
    bootstrap_bytes = _attest_installed_file(
        BOOTSTRAP_PROGRAM,
        programs["bootstrapProgramSha256"],
        0o500,
        16 * 1024 * 1024,
    )
    materializer_bytes = _attest_installed_file(
        MATERIALIZER_PROGRAM,
        programs["materializerProgramSha256"],
        0o500,
        16 * 1024 * 1024,
    )
    if (
        bootstrap_bytes != programs["bootstrapProgramBytes"]
        or materializer_bytes != programs["materializerProgramBytes"]
    ):
        fail()
    return {
        **programs,
        "installedMode": "500",
        "installedVerified": True,
    }


def _verified_node_release(
    version: str,
    release: dict[str, object],
    root: str,
) -> dict[str, object]:
    key = _fetch_exact(
        release["publicKeyUrl"], release["publicKeyBytes"], release["publicKeySha256"],
        _request_once,
    )
    shasums = _fetch_exact(
        release["shasumsUrl"], release["shasumsBytes"], release["shasumsSha256"],
        _request_once,
    )
    signature = _fetch_exact(
        release["signatureUrl"], release["signatureBytes"], release["signatureSha256"],
        _request_once,
    )
    archive = _fetch_exact(
        release["archiveUrl"], release["archiveBytes"], release["archiveSha256"],
        _request_once,
    )
    _validate_shasums(shasums, release["archiveUrl"], release["archiveSha256"])
    signature_root = os.path.join(STAGE_PATH, ".work", f"node-{version}-signature")
    _verify_node_signature(key, shasums, signature, release, signature_root, _fixed_process)
    provenance_root = f"source-caches/public-provenance/node-v{version}"
    for name, content in (
        ("release-key.asc", key),
        ("SHASUMS256.txt", shasums),
        ("SHASUMS256.txt.sig", signature),
    ):
        _install_cache_file(root, f"{provenance_root}/{name}", content, 0o400)
    members = _extract_selected_members(archive, "r:xz", {
        release["archiveMemberPath"]: {
            "mode": release["archiveMemberMode"],
            "bytes": release["archiveMemberBytes"],
            "sha256": release["archiveMemberSha256"],
        },
    })
    _install_cache_file(
        root,
        f"toolchains/node-v{version}-linux-x64/bin/node",
        members[release["archiveMemberPath"]],
        0o500,
    )
    return {**release, "signatureVerified": True, "extractedMemberVerified": True}


def _verify_retained_node_signatures(
    parsed: dict[str, object],
    root: str,
) -> None:
    for version in ("24.19.0", "22.22.3"):
        release = parsed["sourcePolicy"]["nodeReleases"][version]
        provenance = os.path.join(
            root, "source-caches", "public-provenance", f"node-v{version}",
        )
        records = {}
        for name, maximum, expected_size, expected_digest in (
            ("release-key.asc", 64 * 1024, release["publicKeyBytes"], release["publicKeySha256"]),
            ("SHASUMS256.txt", 64 * 1024, release["shasumsBytes"], release["shasumsSha256"]),
            ("SHASUMS256.txt.sig", 64 * 1024, release["signatureBytes"], release["signatureSha256"]),
        ):
            path = os.path.join(provenance, name)
            content = (
                Path(path).read_bytes()
                if os.name == "nt"
                else descriptor_read(path, maximum, 0o400)
            )
            if len(content) != expected_size or sha256_bytes(content) != expected_digest:
                fail()
            records[name] = content
        _validate_shasums(
            records["SHASUMS256.txt"],
            release["archiveUrl"],
            release["archiveSha256"],
        )
        working = os.path.join(root, f".offline-node-signature-{version}")
        try:
            _verify_node_signature(
                records["release-key.asc"],
                records["SHASUMS256.txt"],
                records["SHASUMS256.txt.sig"],
                release,
                working,
                _fixed_process,
            )
        finally:
            if os.path.lexists(working):
                _remove_tree(working)


def _install_toolchains(
    parsed: dict[str, object],
) -> tuple[dict[str, object], dict[str, object], dict[str, object]]:
    policy = parsed["sourcePolicy"]
    node_evidence = {
        version: _verified_node_release(version, policy["nodeReleases"][version], STAGE_PATH)
        for version in ("24.19.0", "22.22.3")
    }
    pnpm = policy["pnpm"]
    pnpm_archive = _fetch_exact(
        pnpm["url"], pnpm["compressedBytes"], pnpm["sha256"], _request_once,
    )
    _verify_sri(pnpm_archive, pnpm["sri"])
    pnpm_members = _extract_selected_members(pnpm_archive, "r:gz", pnpm["members"])
    for path, content in pnpm_members.items():
        _install_cache_file(
            STAGE_PATH,
            f"toolchains/pnpm-{pnpm['version']}/{path}",
            content,
            0o500 if path == "package/bin/pnpm.mjs" else 0o400,
        )
    spacetime = policy["spacetime"]
    spacetime_archive = _fetch_spacetime(spacetime, _request_once)
    spacetime_members = _extract_selected_members(
        spacetime_archive, "r:gz", spacetime["members"],
    )
    for source, target in (
        ("spacetimedb-cli", "spacetime"),
        ("spacetimedb-standalone", "spacetimedb-standalone"),
    ):
        _install_cache_file(
            STAGE_PATH,
            f"toolchains/spacetime-{spacetime['version']}/{target}",
            spacetime_members[source],
            0o500,
        )
    return (
        node_evidence,
        {**pnpm, "archiveVerified": True, "membersVerified": True},
        {**spacetime, "archiveVerified": True, "membersVerified": True},
    )


def _fetch_registry_package(entry: dict[str, object]) -> tuple[dict[str, object], bytes]:
    _parsed_https_url(entry["url"], "registry.npmjs.org")
    status, headers, content = _request_once(entry["url"], 64 * 1024 * 1024)
    if status != 200 or "location" in headers or len(content) < 1:
        fail()
    _verify_sri(content, entry["sri"])
    return {
        "name": entry["name"],
        "version": entry["version"],
        "url": entry["url"],
        "sri": entry["sri"],
        "bytes": len(content),
        "sha256": sha256_bytes(content),
        "os": entry["os"],
        "cpu": entry["cpu"],
    }, content


def _write_work_file(root: str, relative_path: str, content: bytes) -> str:
    safe_git_path(relative_path)
    target = os.path.abspath(os.path.join(root, *PurePosixPath(relative_path).parts))
    if not _inside(os.path.abspath(root), target):
        fail()
    _ensure_private_directories(os.path.dirname(target), root)
    _write_exclusive(target, content, 0o400)
    return target


def _offline_pnpm(arguments: list[str], work: str) -> None:
    if (
        not arguments
        or len(arguments) > 20_000
        or any(type(value) is not str or "\0" in value for value in arguments)
    ):
        fail()
    environment_arguments = [
        f"HOME={work}/home",
        f"XDG_CACHE_HOME={work}/xdg-cache",
        f"XDG_CONFIG_HOME={work}/xdg-config",
        f"XDG_DATA_HOME={work}/xdg-data",
        f"TMPDIR={work}/tmp",
        "LANG=C",
        "LC_ALL=C",
        "TZ=UTC",
        "CI=1",
        "NO_COLOR=1",
        "npm_config_ignore_scripts=true",
        "npm_config_offline=true",
        "npm_config_update_notifier=false",
        "PATH=/usr/bin:/bin:/usr/sbin",
    ]
    for name in ("home", "xdg-cache", "xdg-config", "xdg-data", "tmp"):
        path = os.path.join(work, name)
        if not os.path.exists(path):
            _make_directory(path)
    _fixed_process(
        "/usr/bin/unshare",
        [
            "--user", "--map-root-user", "--net", "/usr/bin/env", "-i",
            *environment_arguments,
            f"{STAGE_PATH}/toolchains/node-v24.19.0-linux-x64/bin/node",
            f"{STAGE_PATH}/toolchains/pnpm-11.7.0/package/bin/pnpm.mjs",
            *arguments,
        ],
        {},
        1024 * 1024,
    )


def _normalize_cache_tree(root: str) -> None:
    if not os.path.isdir(root) or os.path.islink(root):
        fail()
    for current, directories, files in os.walk(root):
        directories.sort(key=lambda value: value.encode("utf-8", "strict"))
        files.sort(key=lambda value: value.encode("utf-8", "strict"))
        status = os.lstat(current)
        if stat.S_ISLNK(status.st_mode) or not stat.S_ISDIR(status.st_mode):
            fail()
        os.chmod(current, 0o700)
        for name in directories:
            path = os.path.join(current, name)
            value = os.lstat(path)
            if stat.S_ISLNK(value.st_mode) or not stat.S_ISDIR(value.st_mode):
                fail()
        for name in files:
            path = os.path.join(current, name)
            value = os.lstat(path)
            if stat.S_ISLNK(value.st_mode) or not stat.S_ISREG(value.st_mode):
                fail()
            if value.st_size > MAX_FILE_BYTES:
                fail()
            if value.st_nlink != 1:
                content = Path(path).read_bytes()
                replacement = f"{path}.normalize"
                _write_exclusive(replacement, content, 0o400)
                os.replace(replacement, path)
            os.chmod(path, 0o400)


def _dependency_cache_closure(
    realm: str,
    source: dict[str, object],
    packages: list[dict[str, object]],
    root: str,
) -> str:
    if realm not in ("g001", "g002", "ptr"):
        fail()
    store_path = f"pnpm-store/{realm}"
    entries = [
        entry for entry in _inventory_cache(root)
        if entry["path"] == store_path
        or entry["path"].startswith(f"{store_path}/")
    ]
    if not entries or entries[0] != {
        "path": store_path, "type": "directory", "mode": "700",
    }:
        fail()
    digest = hashlib.sha256()
    domain = f"warpkeep.release-recovery.linux-dependency-cache.{realm}.v1"
    digest.update(f"{domain}\n".encode("ascii"))
    historical = source["historicalDependencyClosureSha256"]
    digest.update(
        (
            f"source\0{source['sourceCommit']}\0{source['sourceTree']}\0"
            f"{historical if historical is not None else '-'}\0"
            f"{source['linuxSourceDependencyClosureSha256']}\n"
        ).encode("ascii")
    )
    previous_package = b""
    for package in packages:
        coordinate = f"{package['name']}@{package['version']}".encode("utf-8")
        if coordinate <= previous_package:
            fail()
        previous_package = coordinate
        digest.update(b"package\0")
        digest.update(canonical_bytes(package))
    for entry in entries:
        relative = "." if entry["path"] == store_path else entry["path"][len(store_path) + 1:]
        if entry["type"] == "directory":
            digest.update(
                f"directory\0{relative}\0{entry['mode']}\n".encode("utf-8")
            )
        else:
            digest.update(
                f"file\0{relative}\0{entry['bytes']}\0{entry['sha256']}\0{entry['mode']}\n"
                .encode("utf-8")
            )
    return digest.hexdigest()


def _build_dependency_caches(
    parsed: dict[str, object],
    dependency_contents: dict[str, dict[str, bytes]],
    selected_packages: dict[str, list[dict[str, object]]],
    source_evidence: dict[str, dict[str, object]],
) -> dict[str, dict[str, object]]:
    caches: dict[str, dict[str, object]] = {}
    work_parent = os.path.join(STAGE_PATH, ".work")
    for realm in ("g001", "g002", "ptr"):
        work = os.path.join(work_parent, f"dependencies-{realm}")
        _make_directory(work)
        workspace = os.path.join(work, "workspace")
        _make_directory(workspace)
        for path, content in dependency_contents[realm].items():
            _write_work_file(workspace, path, content)
        downloads = os.path.join(work, "downloads")
        _make_directory(downloads)
        verified_packages: list[dict[str, object]] = []
        archive_paths: list[str] = []
        for entry in selected_packages[realm]:
            evidence, archive = _fetch_registry_package(entry)
            archive_path = _write_work_file(
                downloads, f"{evidence['sha256']}.tgz", archive,
            )
            archive_paths.append(archive_path)
            verified_packages.append(evidence)
        store = os.path.join(STAGE_PATH, "pnpm-store", realm)
        _make_directory(store)
        for archive_path in archive_paths:
            _offline_pnpm([
                f"--store-dir={store}", "--reporter=silent", "store", "add",
                archive_path,
            ], work)
        rule = parsed["sourcePolicy"]["sourceRules"][realm]
        project = (
            os.path.join(workspace, "spacetimedb") if realm == "g001"
            else os.path.join(workspace, rule["workspacePath"])
            if realm == "g002"
            else os.path.join(workspace, "spacetimedb", "ptr")
        )
        package_name = rule["packageName"] if realm == "g002" else rule["importer"]
        _offline_pnpm([
            "--dir", project,
            "--filter", package_name,
            "--store-dir", store,
            "--reporter=silent",
            "fetch", "--offline", "--frozen-lockfile", "--ignore-scripts",
        ], work)
        if not os.listdir(store):
            fail()
        _normalize_cache_tree(store)
        if not any(
            entry["name"] == "@esbuild/linux-x64"
            and entry["os"] == ["linux"]
            and entry["cpu"] == ["x64"]
            for entry in verified_packages
        ):
            fail()
        source = source_evidence[realm]
        cache_closure = _dependency_cache_closure(
            realm, source, verified_packages, STAGE_PATH,
        )
        caches[realm] = {
            "realm": realm,
            "sourceCommit": source["sourceCommit"],
            "sourceTree": source["sourceTree"],
            "storePath": f"pnpm-store/{realm}",
            "closureRecordPath": source["dependencyClosureRecordPath"],
            "historicalDependencyClosureSha256":
                source["historicalDependencyClosureSha256"],
            "linuxSourceDependencyClosureSha256":
                source["linuxSourceDependencyClosureSha256"],
            "linuxCacheClosureSha256": cache_closure,
            "cacheInventoryDomain":
                f"warpkeep.release-recovery.linux-dependency-cache.{realm}.v1",
            "containsLinuxX64Esbuild": True,
            "packages": verified_packages,
        }
        _remove_tree(work)
    return caches


def _ensure_state_root() -> None:
    parent = os.path.dirname(STATE_ROOT)
    for path in (parent, STATE_ROOT):
        if os.path.lexists(path):
            status = os.lstat(path)
            if (
                stat.S_ISLNK(status.st_mode)
                or not stat.S_ISDIR(status.st_mode)
                or status.st_uid != 0
                or status.st_gid != 0
                or os.path.realpath(path) != path
                or stat.S_IMODE(status.st_mode) != 0o700
            ):
                fail()
        else:
            os.mkdir(path, 0o700)


def _build_manifest(
    parsed: dict[str, object],
    programs: dict[str, object],
    system_tools: dict[str, dict[str, object]],
    node_releases: dict[str, object],
    pnpm: dict[str, object],
    spacetime: dict[str, object],
    source_export: dict[str, object],
    sources: dict[str, dict[str, object]],
    dependency_caches: dict[str, dict[str, object]],
) -> dict[str, object]:
    policy = parsed["sourcePolicy"]
    return {
        "schemaVersion": 1,
        "profile": "warpkeep-release-recovery-wsl-linux-x64-toolchain-v1",
        "platform": "linux",
        "architecture": "x64",
        "distribution": "WarpkeepRunner",
        "recoveryBuildProfile": policy["recoveryBuildProfile"],
        "sourcePolicySha256": parsed["sourcePolicySha256"],
        "hostGuest": {**policy["hostGuest"], "platformVerified": True},
        "programs": programs,
        "nodeReleases": node_releases,
        "pnpm": pnpm,
        "spacetime": spacetime,
        "systemTools": system_tools,
        "sourceObjectExport": source_export,
        "sources": sources,
        "dependencyCaches": dependency_caches,
        "signaturesVerified": True,
        "offlineReady": True,
    }


def _validate_result(value: object) -> dict[str, object]:
    result = exact(value, (
        "prepared", "sourcePolicySha256", "manifestSha256", "cacheSha256",
        "cacheClosureSha256", "signaturesVerified", "offlineReady",
    ))
    if (
        result["prepared"] is not True
        or result["signaturesVerified"] is not True
        or result["offlineReady"] is not True
    ):
        fail()
    for key in (
        "sourcePolicySha256", "manifestSha256", "cacheSha256",
        "cacheClosureSha256",
    ):
        lower_hex_64(result[key])
    return result


def _read_cache_file(path: str, maximum: int, expected_mode: int) -> bytes:
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_BINARY", 0)
    descriptor = os.open(path, flags)
    try:
        before = os.fstat(descriptor)
        named = os.lstat(path)
        if (
            not stat.S_ISREG(before.st_mode)
            or stat.S_ISLNK(named.st_mode)
            or before.st_dev != named.st_dev
            or before.st_ino != named.st_ino
            or before.st_uid != 0
            or before.st_gid != 0
            or stat.S_IMODE(before.st_mode) != expected_mode
            or before.st_nlink != 1
            or before.st_size < 0
            or before.st_size > maximum
        ):
            fail()
        chunks: list[bytes] = []
        remaining = before.st_size
        while remaining:
            chunk = os.read(descriptor, min(remaining, 64 * 1024))
            if not chunk:
                fail()
            chunks.append(chunk)
            remaining -= len(chunk)
        after = os.fstat(descriptor)
        if (
            after.st_dev != before.st_dev
            or after.st_ino != before.st_ino
            or after.st_size != before.st_size
        ):
            fail()
        return b"".join(chunks)
    finally:
        os.close(descriptor)


def _validate_manifest_identity(
    manifest_bytes: bytes,
    parsed: dict[str, object],
    programs: dict[str, object],
) -> dict[str, object]:
    manifest = exact(canonical_json_bytes(manifest_bytes, MAX_MANIFEST_BYTES), (
        "schemaVersion", "profile", "platform", "architecture", "distribution",
        "recoveryBuildProfile", "sourcePolicySha256", "hostGuest", "programs",
        "nodeReleases", "pnpm", "spacetime", "systemTools", "sourceObjectExport",
        "sources", "dependencyCaches", "signaturesVerified", "offlineReady",
    ))
    if (
        manifest["schemaVersion"] != 1
        or manifest["profile"]
        != "warpkeep-release-recovery-wsl-linux-x64-toolchain-v1"
        or manifest["platform"] != "linux"
        or manifest["architecture"] != "x64"
        or manifest["distribution"] != "WarpkeepRunner"
        or manifest["recoveryBuildProfile"]
        != parsed["sourcePolicy"]["recoveryBuildProfile"]
        or manifest["sourcePolicySha256"] != parsed["sourcePolicySha256"]
        or manifest["programs"] != programs
        or manifest["signaturesVerified"] is not True
        or manifest["offlineReady"] is not True
    ):
        fail()
    exact(manifest["programs"], (
        "bootstrapProgramBytes", "bootstrapProgramSha256",
        "materializerProgramBytes", "materializerProgramSha256",
        "installedMode", "installedVerified",
    ))
    host_guest = exact(manifest["hostGuest"], tuple([
        *parsed["sourcePolicy"]["hostGuest"].keys(), "platformVerified",
    ]))
    if (
        {key: host_guest[key] for key in parsed["sourcePolicy"]["hostGuest"]}
        != parsed["sourcePolicy"]["hostGuest"]
        or host_guest["platformVerified"] is not True
    ):
        fail()
    nodes = exact(manifest["nodeReleases"], ("24.19.0", "22.22.3"))
    for version in ("24.19.0", "22.22.3"):
        node = exact(nodes[version], tuple([
            *parsed["sourcePolicy"]["nodeReleases"][version].keys(),
            "signatureVerified", "extractedMemberVerified",
        ]))
        if (
            {key: node[key] for key in parsed["sourcePolicy"]["nodeReleases"][version]}
            != parsed["sourcePolicy"]["nodeReleases"][version]
            or node["signatureVerified"] is not True
            or node["extractedMemberVerified"] is not True
        ):
            fail()
    for name, verified_fields in (
        ("pnpm", ("archiveVerified", "membersVerified")),
        ("spacetime", ("archiveVerified", "membersVerified")),
    ):
        artifact = exact(manifest[name], tuple([
            *parsed["sourcePolicy"][name].keys(), *verified_fields,
        ]))
        if (
            {key: artifact[key] for key in parsed["sourcePolicy"][name]}
            != parsed["sourcePolicy"][name]
            or any(artifact[field] is not True for field in verified_fields)
        ):
            fail()
    tools = exact(manifest["systemTools"], ("git", "gpg", "gpgv", "unshare", "ip"))
    for name, expected in parsed["sourcePolicy"]["systemTools"].items():
        tool = exact(tools[name], tuple([
            *expected.keys(), "installedBytes", "installedMode", "installedVerified",
        ]))
        if (
            {key: tool[key] for key in expected} != expected
            or positive_integer(tool["installedBytes"], 64 * 1024 * 1024) < 1
            or tool["installedMode"] != "755"
            or tool["installedVerified"] is not True
        ):
            fail()
    sources = exact(manifest["sources"], ("g001", "g002", "ptr"))
    caches = exact(manifest["dependencyCaches"], ("g001", "g002", "ptr"))
    for realm in ("g001", "g002", "ptr"):
        source = exact(sources[realm], (
            "realm", "sourceCommit", "sourceTree",
            "historicalDependencyClosureSha256",
            "linuxSourceDependencyClosureSha256", "dependencyInventoryDomain",
            "dependencyClosureRecordPath", "dependencyFiles",
        ))
        if (
            source["realm"] != realm
            or source["sourceCommit"] != parsed["sources"][realm]["sourceCommit"]
            or source["sourceTree"] != parsed["sources"][realm]["sourceTree"]
            or source["dependencyInventoryDomain"]
            != f"warpkeep.release-recovery.source-dependencies.{realm}.v1"
            or source["dependencyClosureRecordPath"]
            != f"source-caches/{realm}-linux-source-dependency-closure-sha256.txt"
            or type(source["dependencyFiles"]) is not list
            or _dependency_closure(realm, source["dependencyFiles"])
            != source["linuxSourceDependencyClosureSha256"]
        ):
            fail()
        expected_historical = parsed["sources"][realm].get(
            "historicalDependencyClosureSha256"
        )
        if source["historicalDependencyClosureSha256"] != expected_historical:
            fail()
        cache = exact(caches[realm], (
            "realm", "sourceCommit", "sourceTree", "storePath", "closureRecordPath",
            "historicalDependencyClosureSha256",
            "linuxSourceDependencyClosureSha256", "linuxCacheClosureSha256",
            "cacheInventoryDomain", "containsLinuxX64Esbuild", "packages",
        ))
        if (
            cache["realm"] != realm
            or cache["sourceCommit"] != source["sourceCommit"]
            or cache["sourceTree"] != source["sourceTree"]
            or cache["storePath"] != f"pnpm-store/{realm}"
            or cache["closureRecordPath"] != source["dependencyClosureRecordPath"]
            or cache["historicalDependencyClosureSha256"]
            != source["historicalDependencyClosureSha256"]
            or cache["linuxSourceDependencyClosureSha256"]
            != source["linuxSourceDependencyClosureSha256"]
            or cache["cacheInventoryDomain"]
            != f"warpkeep.release-recovery.linux-dependency-cache.{realm}.v1"
            or cache["containsLinuxX64Esbuild"] is not True
            or type(cache["packages"]) is not list
            or len(cache["packages"]) < 1
        ):
            fail()
        lower_hex_64(cache["linuxCacheClosureSha256"])
        previous = b""
        esbuild = False
        for raw_package in cache["packages"]:
            package = exact(raw_package, (
                "name", "version", "url", "sri", "bytes", "sha256", "os", "cpu",
            ))
            coordinate = f"{package['name']}@{package['version']}".encode("utf-8")
            if coordinate <= previous:
                fail()
            previous = coordinate
            positive_integer(package["bytes"], 64 * 1024 * 1024)
            lower_hex_64(package["sha256"])
            if type(package["sri"]) is not str or not package["sri"].startswith("sha512-"):
                fail()
            try:
                sri_digest = base64.b64decode(package["sri"][7:], validate=True)
            except (TypeError, ValueError):
                fail()
            if len(sri_digest) != 64:
                fail()
            if (
                package["name"] == "@esbuild/linux-x64"
                and package["os"] == ["linux"]
                and package["cpu"] == ["x64"]
            ):
                esbuild = True
        if not esbuild:
            fail()
        if cache["linuxCacheClosureSha256"] != _dependency_cache_closure(
            realm, source, cache["packages"], STATE_ROOT,
        ):
            fail()
    exported = exact(manifest["sourceObjectExport"], (
        "profile", "repositoryPath", "objectFormat", "objectInventoryDomain",
        "objectInventoryRecordPath", "objectCount", "objectBytes",
        "objectClosureSha256", "exactObjectsVerified", "sources",
    ))
    if (
        exported["profile"] != "warpkeep-release-recovery-source-object-export-v1"
        or exported["repositoryPath"] != "source-caches/repository.git"
        or exported["objectFormat"] != "sha1"
        or exported["objectInventoryDomain"]
        != "warpkeep.release-recovery.source-object-export.v1"
        or exported["objectInventoryRecordPath"]
        != "source-caches/repository-object-inventory-v1.json"
        or exported["exactObjectsVerified"] is not True
    ):
        fail()
    positive_integer(exported["objectCount"], MAX_SOURCE_OBJECTS)
    positive_integer(exported["objectBytes"], MAX_SOURCE_OBJECT_BYTES)
    lower_hex_64(exported["objectClosureSha256"])
    return manifest


def _verify_published_cache(
    parsed: dict[str, object],
    programs: dict[str, object],
) -> dict[str, object]:
    catalog_bytes = (
        Path(CATALOG_PATH).read_bytes()
        if os.name == "nt"
        else descriptor_read(CATALOG_PATH, MAX_CATALOG_BYTES, 0o400)
    )
    catalog = exact(canonical_json_bytes(catalog_bytes, MAX_CATALOG_BYTES), (
        "schemaVersion", "profile", "platform", "architecture", "inventoryRoots",
        "manifestPath", "manifestSha256", "cacheClosureSha256",
        "signaturesVerified", "offlineReady", "entries",
    ))
    if (
        catalog["schemaVersion"] != 2
        or catalog["profile"] != "warpkeep-release-recovery-wsl-cache-catalog-v2"
        or catalog["platform"] != "linux"
        or catalog["architecture"] != "x64"
        or catalog["inventoryRoots"] != ["pnpm-store", "source-caches", "toolchains"]
        or catalog["manifestPath"] != MANIFEST_RELATIVE_PATH
        or catalog["signaturesVerified"] is not True
        or catalog["offlineReady"] is not True
        or type(catalog["entries"]) is not list
    ):
        fail()
    observed = _inventory_cache(STATE_ROOT)
    if catalog["entries"] != observed or catalog["cacheClosureSha256"] != _cache_closure(observed):
        fail()
    manifest_path = os.path.join(STATE_ROOT, *PurePosixPath(MANIFEST_RELATIVE_PATH).parts)
    manifest_bytes = (
        Path(manifest_path).read_bytes()
        if os.name == "nt"
        else descriptor_read(manifest_path, MAX_MANIFEST_BYTES, 0o400)
    )
    manifest_sha256 = sha256_bytes(manifest_bytes)
    if manifest_sha256 != catalog["manifestSha256"]:
        fail()
    _validate_manifest_identity(manifest_bytes, parsed, programs)
    _verify_retained_node_signatures(parsed, STATE_ROOT)
    return _validate_result({
        "prepared": True,
        "sourcePolicySha256": parsed["sourcePolicySha256"],
        "manifestSha256": manifest_sha256,
        "cacheSha256": sha256_bytes(catalog_bytes),
        "cacheClosureSha256": catalog["cacheClosureSha256"],
        "signaturesVerified": True,
        "offlineReady": True,
    })


def _prepare_toolchain(
    parsed: dict[str, object],
    object_directory: str,
    programs: dict[str, object],
    system_tools: dict[str, dict[str, object]],
) -> dict[str, object]:
    _ensure_state_root()
    _recover_transaction()
    if os.path.lexists(TRANSACTION_PATH):
        record = _read_journal()
        if record["state"] != "COMMITTED":
            fail()
        recovered = _verify_published_cache(parsed, programs)
        if recovered != _validate_result(record["result"]):
            fail()
        return recovered
    existing = [os.path.lexists(os.path.join(STATE_ROOT, name)) for name in FINAL_CACHE_NAMES]
    if all(existing):
        fail()
    if any(existing):
        fail()
    _begin_transaction()
    try:
        for root in ("pnpm-store", "source-caches", "toolchains"):
            _make_directory(os.path.join(STAGE_PATH, root))
        work = os.path.join(STAGE_PATH, ".work")
        _make_directory(work)
        source_export, dependency_files, dependency_contents = _export_source_objects(
            parsed,
            object_directory,
            os.path.join(STAGE_PATH, "source-caches", "repository.git"),
            _fixed_process,
        )
        sources = _source_evidence_records(parsed, dependency_files)
        for realm in ("g001", "g002", "ptr"):
            _install_cache_file(
                STAGE_PATH,
                f"source-caches/{realm}-linux-source-dependency-closure-sha256.txt",
                f"{sources[realm]['linuxSourceDependencyClosureSha256']}\n".encode("ascii"),
                0o400,
            )
        selected_packages = _validate_dependency_documents(parsed, dependency_contents)
        node_releases, pnpm, spacetime = _install_toolchains(parsed)
        dependency_caches = _build_dependency_caches(
            parsed, dependency_contents, selected_packages, sources,
        )
        _remove_tree(work)
        manifest = _build_manifest(
            parsed,
            programs,
            system_tools,
            node_releases,
            pnpm,
            spacetime,
            source_export,
            sources,
            dependency_caches,
        )
        manifest_bytes = canonical_bytes(manifest)
        if len(manifest_bytes) > MAX_MANIFEST_BYTES:
            fail()
        manifest_sha256 = sha256_bytes(manifest_bytes)
        _install_cache_file(
            STAGE_PATH, MANIFEST_RELATIVE_PATH, manifest_bytes, 0o400,
        )
        catalog, catalog_bytes = _create_cache_catalog(STAGE_PATH, manifest_sha256)
        if len(catalog_bytes) > MAX_CATALOG_BYTES:
            fail()
        _install_cache_file(
            STAGE_PATH,
            "cache-catalog-v2.json",
            catalog_bytes,
            0o400,
            catalog_file=True,
        )
        result = _validate_result({
            "prepared": True,
            "sourcePolicySha256": parsed["sourcePolicySha256"],
            "manifestSha256": manifest_sha256,
            "cacheSha256": sha256_bytes(catalog_bytes),
            "cacheClosureSha256": catalog["cacheClosureSha256"],
            "signaturesVerified": True,
            "offlineReady": True,
        })
        _commit_transaction(result)
        verified = _verify_published_cache(parsed, programs)
        if verified != result:
            fail()
        return verified
    except BaseException:
        _recover_transaction()
        raise


def main() -> None:
    expected_environment = {
        "HOME": f"{STATE_ROOT}/home",
        "XDG_CACHE_HOME": f"{STATE_ROOT}/xdg-cache",
        "XDG_CONFIG_HOME": f"{STATE_ROOT}/xdg-config",
        "XDG_DATA_HOME": f"{STATE_ROOT}/xdg-data",
        "TMPDIR": f"{STATE_ROOT}/tmp",
        "LANG": "C",
        "LC_ALL": "C",
        "TZ": "UTC",
        "NO_COLOR": "1",
        "CI": "1",
        "WSL_DISTRO_NAME": "WarpkeepRunner",
        "PATH": "/usr/bin:/bin:/usr/sbin",
    }
    if (
        os.name != "posix"
        or os.geteuid() != 0
        or os.environ != expected_environment
        or len(sys.argv) != 3
        or sys.argv[0] != BOOTSTRAP_PROGRAM
        or sys.argv[1] != "--public-object-database"
        or os.path.realpath(sys.argv[0]) != BOOTSTRAP_PROGRAM
    ):
        fail()
    request_bytes = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    parsed = validate_request(canonical_json_bytes(request_bytes, MAX_REQUEST_BYTES))
    object_directory = _validate_public_object_database(sys.argv[2])
    programs = _attest_programs(parsed["programs"])
    system_tools = _attest_system_tools(parsed["sourcePolicy"])
    response = _prepare_toolchain(parsed, object_directory, programs, system_tools)
    sys.stdout.buffer.write(canonical_bytes(response))


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        sys.exit(1)
