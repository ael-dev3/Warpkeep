#!/usr/bin/python3 -I
"""Verify an externally provisioned, content-addressed recovery build cache.

This fixed guest program deliberately does not learn package coordinates from the
network or the current checkout.  A separately authenticated cache catalog must
already exist at the source-fixed ext4 location.  The host pins this program's
exact bytes before installing and invoking it.
"""

from __future__ import annotations

import hashlib
import json
import os
import stat
import sys
from pathlib import PurePosixPath


STATE_ROOT = "/var/lib/warpkeep/release-recovery-v1"
CATALOG_PATH = f"{STATE_ROOT}/cache-catalog-v1.json"
MANIFEST_RELATIVE_PATH = "toolchains/linux-x64.json"
MAX_REQUEST_BYTES = 256 * 1024
MAX_CATALOG_BYTES = 8 * 1024 * 1024
MAX_MANIFEST_BYTES = 512 * 1024
MAX_CACHE_FILES = 100_000
MAX_FILE_BYTES = 256 * 1024 * 1024
HEX64 = frozenset("0123456789abcdef")


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


def positive_integer(value: object, maximum: int) -> int:
    if type(value) is not int or value < 1 or value > maximum:
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
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
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


def validate_request(value: object) -> tuple[dict[str, object], dict[str, object]]:
    request = exact(value, ("schemaVersion", "profile", "policy", "platform", "toolchain"))
    if (
        request["schemaVersion"] != 1
        or request["profile"] != "warpkeep-release-recovery-wsl-toolchain-bootstrap-request-v1"
    ):
        fail()
    policy = exact(request["policy"], (
        "schemaVersion", "profile", "distribution", "platform", "architecture",
        "nodeVersions", "pnpmVersion", "spacetimeVersion", "spacetimeCommit",
        "gitPackageVersion", "wslVersion", "packageFetchPolicy",
        "nodeReleaseSignatures", "pnpm", "spacetime", "gnupg",
        "lifecycleScripts", "noClobber",
    ))
    if (
        policy["schemaVersion"] != 1
        or policy["profile"] != "warpkeep-release-recovery-wsl-toolchain-bootstrap-v1"
        or policy["distribution"] != "Ubuntu-24.04"
        or policy["platform"] != "linux"
        or policy["architecture"] != "x64"
        or policy["nodeVersions"] != ["24.19.0", "22.22.3"]
        or policy["pnpmVersion"] != "11.7.0"
        or policy["spacetimeVersion"] != "2.6.1"
        or policy["spacetimeCommit"] != "052c83fe984a4c4eb7bb4f9afa5c6b1903891d87"
        or policy["gitPackageVersion"] != "1:2.43.0-1ubuntu7.3"
        or policy["wslVersion"] != "2.7.11.0"
        or policy["packageFetchPolicy"] != "fixed-https-no-redirect-no-credential"
        or policy["lifecycleScripts"] is not False
        or policy["noClobber"] is not True
    ):
        fail()
    toolchain = exact(request["toolchain"], (
        "manifestSha256", "cacheCatalogSha256", "bootstrapProgramBytes",
        "bootstrapProgramSha256", "materializerProgramBytes",
        "materializerProgramSha256",
    ))
    lower_hex_64(toolchain["manifestSha256"])
    lower_hex_64(toolchain["cacheCatalogSha256"])
    lower_hex_64(toolchain["bootstrapProgramSha256"])
    lower_hex_64(toolchain["materializerProgramSha256"])
    positive_integer(toolchain["bootstrapProgramBytes"], 16 * 1024 * 1024)
    positive_integer(toolchain["materializerProgramBytes"], 16 * 1024 * 1024)
    return policy, toolchain


def main() -> None:
    request_bytes = sys.stdin.buffer.read(MAX_REQUEST_BYTES + 1)
    policy, toolchain = validate_request(canonical_json_bytes(request_bytes, MAX_REQUEST_BYTES))
    catalog_bytes = descriptor_read(CATALOG_PATH, MAX_CATALOG_BYTES, 0o400)
    if hashlib.sha256(catalog_bytes).hexdigest() != toolchain["cacheCatalogSha256"]:
        fail()
    catalog = exact(canonical_json_bytes(catalog_bytes, MAX_CATALOG_BYTES), (
        "schemaVersion", "profile", "platform", "architecture", "manifestPath",
        "manifestSha256", "cacheClosureSha256", "signaturesVerified",
        "offlineReady", "files",
    ))
    if (
        catalog["schemaVersion"] != 1
        or catalog["profile"] != "warpkeep-release-recovery-wsl-cache-catalog-v1"
        or catalog["platform"] != "linux"
        or catalog["architecture"] != "x64"
        or catalog["manifestPath"] != MANIFEST_RELATIVE_PATH
        or catalog["manifestSha256"] != toolchain["manifestSha256"]
        or catalog["signaturesVerified"] is not True
        or catalog["offlineReady"] is not True
    ):
        fail()
    lower_hex_64(catalog["cacheClosureSha256"])
    files = catalog["files"]
    if type(files) is not list or len(files) < 1 or len(files) > MAX_CACHE_FILES:
        fail()
    closure = hashlib.sha256()
    closure.update(b"warpkeep.release-recovery.wsl-cache-closure.v1\n")
    previous = b""
    seen: set[str] = set()
    for raw_entry in files:
        entry = exact(raw_entry, ("path", "bytes", "sha256", "mode"))
        relative_path = safe_relative_path(entry["path"])
        encoded_path = relative_path.encode("utf-8", "strict")
        if encoded_path <= previous or relative_path in seen:
            fail()
        previous = encoded_path
        seen.add(relative_path)
        byte_length = positive_integer(entry["bytes"], MAX_FILE_BYTES)
        digest = lower_hex_64(entry["sha256"])
        if entry["mode"] not in ("400", "500"):
            fail()
        target = os.path.join(STATE_ROOT, *PurePosixPath(relative_path).parts)
        verify_parent_chain(target)
        content = descriptor_read(target, byte_length, int(entry["mode"], 8))
        if len(content) != byte_length or hashlib.sha256(content).hexdigest() != digest:
            fail()
        closure.update(encoded_path)
        closure.update(b"\x00")
        closure.update(str(byte_length).encode("ascii"))
        closure.update(b"\x00")
        closure.update(digest.encode("ascii"))
        closure.update(b"\x00")
        closure.update(entry["mode"].encode("ascii"))
        closure.update(b"\n")
    if MANIFEST_RELATIVE_PATH not in seen:
        fail()
    if closure.hexdigest() != catalog["cacheClosureSha256"]:
        fail()
    manifest_path = os.path.join(STATE_ROOT, MANIFEST_RELATIVE_PATH)
    manifest_bytes = descriptor_read(manifest_path, MAX_MANIFEST_BYTES, 0o400)
    if hashlib.sha256(manifest_bytes).hexdigest() != toolchain["manifestSha256"]:
        fail()
    manifest = exact(canonical_json_bytes(manifest_bytes, MAX_MANIFEST_BYTES), (
        "schemaVersion", "profile", "platform", "architecture", "nodeVersions",
        "pnpmVersion", "spacetimeVersion", "gitPackageVersion", "wslVersion",
    ))
    if (
        manifest["schemaVersion"] != 1
        or manifest["profile"] != "warpkeep-release-recovery-wsl-linux-x64-toolchain-v1"
        or manifest["platform"] != "linux"
        or manifest["architecture"] != "x64"
        or manifest["nodeVersions"] != policy["nodeVersions"]
        or manifest["pnpmVersion"] != policy["pnpmVersion"]
        or manifest["spacetimeVersion"] != policy["spacetimeVersion"]
        or manifest["gitPackageVersion"] != policy["gitPackageVersion"]
        or manifest["wslVersion"] != policy["wslVersion"]
    ):
        fail()
    response = {
        "prepared": True,
        "manifestSha256": toolchain["manifestSha256"],
        "cacheSha256": toolchain["cacheCatalogSha256"],
        "signaturesVerified": True,
        "offlineReady": True,
    }
    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    try:
        main()
    except BaseException:
        sys.exit(1)
