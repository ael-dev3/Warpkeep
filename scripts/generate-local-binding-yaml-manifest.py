#!/usr/bin/env python3
"""Generate/check the fixed yaml@2.9.0 physical namespace authority.

The aggregate digest uses unambiguous framing: each UTF-8 label and value is
preceded by its unsigned 64-bit big-endian byte length.  Fields are framed in
manifest order and each sorted file contributes path, decimal mode, decimal
byte count, and lowercase SHA-256.  The digest field itself is excluded.
"""

import base64
import hashlib
import json
import os
import pathlib
import sys
import tarfile

ARCHIVE_BYTES = 112086
ARCHIVE_SHA256 = "008fa204cb1ba700e0272ba045abbf09a6ffe63456e8146ba97cac6c2ad1ef91"
ARCHIVE_SRI = "sha512-2AvhNX3mb8zd6Zy7INTtSpl1F15HW6Wnqj0srWlkKLcpYl/gMIMJiyuGq2KeI2YFxUPjdlB+3Lc10seMLtL4cA=="
MAX_COMPRESSED = 32 * 1024 * 1024
MAX_MEMBERS = 4096
MAX_MEMBER = 16 * 1024 * 1024
MAX_EXPANDED = 64 * 1024 * 1024
PROFILE = "warpkeep-local-binding-yaml-v1"


def fail(code: str) -> None:
    raise RuntimeError(code)


def frame(digest, label: str, value: str) -> None:
    for item in (label, value):
        data = item.encode("utf-8")
        digest.update(len(data).to_bytes(8, "big"))
        digest.update(data)


def manifest_digest(record: dict) -> str:
    digest = hashlib.sha256()
    for key in ("schemaVersion", "profile", "name", "version", "sri", "entry"):
        frame(digest, key, str(record[key]))
    for entry in record["files"]:
        for key in ("path", "mode", "bytes", "sha256"):
            frame(digest, f"file.{key}", str(entry[key]))
    return digest.hexdigest()


def canonical_member_path(name: str) -> str:
    if not isinstance(name, str) or not name.startswith("package/"):
        fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
    relative = name[len("package/"):]
    parts = relative.split("/")
    if (
        not relative
        or name.startswith("/")
        or "\\" in name
        or any(not part or part in (".", "..") for part in parts)
        or any(any(ord(character) < 32 or ord(character) == 127 for character in part) for part in parts)
    ):
        fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
    return relative


def generate(archive_path: pathlib.Path) -> dict:
    try:
        compressed = archive_path.read_bytes()
    except OSError as error:
        raise RuntimeError("LOCAL_BINDING_YAML_ARCHIVE_INVALID") from error
    if (
        len(compressed) != ARCHIVE_BYTES
        or len(compressed) > MAX_COMPRESSED
        or hashlib.sha256(compressed).hexdigest() != ARCHIVE_SHA256
        or "sha512-" + base64.b64encode(hashlib.sha512(compressed).digest()).decode("ascii") != ARCHIVE_SRI
    ):
        fail("LOCAL_BINDING_YAML_ARCHIVE_INVALID")

    files = []
    bodies = {}
    directories = set()
    collision_paths = set()
    expanded = 0
    try:
        with tarfile.open(archive_path, mode="r:gz") as archive:
            members = archive.getmembers()
            if not members or len(members) > MAX_MEMBERS:
                fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
            for member in members:
                if member.name in ("package", "package/"):
                    if not member.isdir() or member.size != 0:
                        fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                    directories.add("")
                    continue
                relative = canonical_member_path(member.name)
                collision = relative.casefold()
                if collision in collision_paths:
                    fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                collision_paths.add(collision)
                if member.isdir():
                    if member.size != 0:
                        fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                    directories.add(relative.rstrip("/"))
                    continue
                if not member.isfile() or member.size < 0 or member.size > MAX_MEMBER:
                    fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                extracted = archive.extractfile(member)
                if extracted is None:
                    fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                body = extracted.read(MAX_MEMBER + 1)
                if len(body) != member.size or len(body) > MAX_MEMBER:
                    fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                expanded += len(body)
                if expanded > MAX_EXPANDED:
                    fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                mode = member.mode & 0o777
                if mode not in (0o644, 0o755):
                    fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
                bodies[relative] = body
                files.append({
                    "path": relative,
                    "mode": mode,
                    "bytes": len(body),
                    "sha256": hashlib.sha256(body).hexdigest(),
                })
    except RuntimeError:
        raise
    except (OSError, tarfile.TarError) as error:
        raise RuntimeError("LOCAL_BINDING_YAML_ARCHIVE_INVALID") from error

    files.sort(key=lambda entry: entry["path"])
    required_directories = {""}
    for entry in files:
        parts = entry["path"].split("/")
        required_directories.update("/".join(parts[:index]) for index in range(1, len(parts)))
    if not directories.issubset(required_directories):
        fail("LOCAL_BINDING_YAML_MEMBER_INVALID")
    try:
        package = json.loads(bodies["package.json"].decode("utf-8"))
    except (KeyError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RuntimeError("LOCAL_BINDING_YAML_PACKAGE_INVALID") from error
    exports = package.get("exports")
    root_export = exports.get(".") if isinstance(exports, dict) else None
    if (
        package.get("name") != "yaml"
        or package.get("version") != "2.9.0"
        or package.get("type") != "commonjs"
        or not isinstance(root_export, dict)
        or root_export.get("node") != "./dist/index.js"
        or "dist/index.js" not in bodies
    ):
        fail("LOCAL_BINDING_YAML_PACKAGE_INVALID")
    record = {
        "schemaVersion": 1,
        "profile": PROFILE,
        "name": "yaml",
        "version": "2.9.0",
        "sri": ARCHIVE_SRI,
        "entry": "dist/index.js",
        "files": files,
    }
    record["digest"] = manifest_digest(record)
    return record


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] not in ("--write", "--check"):
        fail("LOCAL_BINDING_YAML_ARGUMENTS_INVALID")
    repository = pathlib.Path(__file__).resolve().parent.parent
    archive = repository / ".git" / "yaml-2.9.0.tgz"
    output = repository / "scripts" / "local-binding-runtime-yaml-v1.json"
    encoded = (json.dumps(generate(archive), indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    if sys.argv[1] == "--check":
        try:
            actual = output.read_bytes()
        except OSError as error:
            raise RuntimeError("LOCAL_BINDING_YAML_MANIFEST_STALE") from error
        if actual != encoded:
            fail("LOCAL_BINDING_YAML_MANIFEST_STALE")
        return
    temporary = output.with_name(output.name + ".tmp")
    try:
        temporary.write_bytes(encoded)
        os.chmod(temporary, 0o644)
        os.replace(temporary, output)
    finally:
        try:
            temporary.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
