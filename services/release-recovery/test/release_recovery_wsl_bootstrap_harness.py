from __future__ import annotations

import copy
import atexit
import base64
import hashlib
import importlib.util
import io
import json
import pathlib
import os
import subprocess
import tempfile
import sys
import tarfile
import zlib


SERVICE_ROOT = pathlib.Path(__file__).resolve().parent.parent
PROGRAM_PATH = SERVICE_ROOT / "scripts" / "release-recovery-wsl-bootstrap.py"
POLICY_PATH = (
    SERVICE_ROOT
    / "scripts"
    / "release-recovery-wsl-toolchain-source-policy-v1.json"
)


def load_program():
    spec = importlib.util.spec_from_file_location("release_recovery_wsl_bootstrap", PROGRAM_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("program import unavailable")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def valid_request() -> dict[str, object]:
    policy_bytes = POLICY_PATH.read_bytes()
    policy = json.loads(policy_bytes)
    return {
        "schemaVersion": 1,
        "profile": "warpkeep-release-recovery-wsl-toolchain-bootstrap-request-v1",
        "sourcePolicy": policy,
        "sourcePolicySha256": hashlib.sha256(policy_bytes).hexdigest(),
        "platform": {
            "schemaVersion": 1,
            "profile": "warpkeep-release-recovery-wsl-host-guest-preflight-v1",
            "executableSha256": policy["hostGuest"]["wslExecutableSha256"],
            "wslVersion": policy["hostGuest"]["wslVersion"],
            "distribution": policy["distribution"],
            "osReleaseSha256": policy["hostGuest"]["guestOsReleaseSha256"],
            "kernelReleaseSha256": policy["hostGuest"]["guestKernelReleaseSha256"],
            "gitSha256": policy["systemTools"]["git"]["sha256"],
            "unshareSha256": policy["systemTools"]["unshare"]["sha256"],
            "loopbackToolSha256": policy["systemTools"]["ip"]["sha256"],
        },
        "sources": {
            "g002": {
                "sourceCommit": "8" * 40,
                "sourceTree": "9" * 40,
                "historicalDependencyClosureSha256": "a" * 64,
            },
            "ptr": {
                "sourceCommit": "b" * 40,
                "sourceTree": "c" * 40,
                "historicalDependencyClosureSha256": "d" * 64,
            },
        },
        "programs": {
            "bootstrapProgramBytes": 12_345,
            "bootstrapProgramSha256": "e" * 64,
            "materializerProgramBytes": 23_456,
            "materializerProgramSha256": "f" * 64,
        },
    }


def expect_invalid(module, value: dict[str, object]) -> None:
    try:
        module.validate_request(value)
    except module.Invalid:
        return
    raise AssertionError("invalid request accepted")


def request_parser() -> None:
    module = load_program()
    request = valid_request()
    parsed = module.validate_request(request)
    if parsed["sourcePolicySha256"] != request["sourcePolicySha256"]:
        raise AssertionError("policy digest lost")
    if parsed["sources"]["g001"]["sourceCommit"] != request["sourcePolicy"]["sourceRules"]["g001"]["sourceCommit"]:
        raise AssertionError("fixed historical source not derived")

    extra = copy.deepcopy(request)
    extra["adapter"] = True
    expect_invalid(module, extra)
    selected = copy.deepcopy(request)
    selected["sources"]["g001"] = {
        "sourceCommit": "1" * 40,
        "sourceTree": "2" * 40,
        "historicalDependencyClosureSha256": "3" * 64,
    }
    expect_invalid(module, selected)
    for forbidden in ("root", "privateRoot", "url", "command", "credential", "output"):
        poisoned = copy.deepcopy(request)
        poisoned[forbidden] = "caller-selected"
        expect_invalid(module, poisoned)
    print("request-parser:ok")


def git_object(kind: str, content: bytes) -> str:
    return hashlib.sha1(
        f"{kind} {len(content)}\0".encode("ascii") + content,
        usedforsecurity=False,
    ).hexdigest()


def build_tree(files: dict[str, bytes], objects: dict[str, tuple[str, bytes]]) -> str:
    root: dict[str, object] = {}
    for path, content in files.items():
        parts = path.split("/")
        current = root
        for part in parts[:-1]:
            current = current.setdefault(part, {})
        current[parts[-1]] = content

    def encode_tree(value: dict[str, object]) -> str:
        records = bytearray()
        for name in sorted(value):
            child = value[name]
            if isinstance(child, dict):
                child_id = encode_tree(child)
                mode = "40000"
            else:
                assert isinstance(child, bytes)
                child_id = git_object("blob", child)
                objects[child_id] = ("blob", child)
                mode = "100644"
            records.extend(f"{mode} {name}".encode("utf-8"))
            records.append(0)
            records.extend(bytes.fromhex(child_id))
        content = bytes(records)
        tree_id = git_object("tree", content)
        objects[tree_id] = ("tree", content)
        return tree_id

    return encode_tree(root)


def tree_path(module, root: str, path: str, objects: dict[str, tuple[str, bytes]]) -> str:
    return module._resolve_tree_path(root, path, objects)


def add_commit(root: str, label: str, objects: dict[str, tuple[str, bytes]]) -> str:
    content = (
        f"tree {root}\nauthor Synthetic <synthetic@example.invalid> 1 +0000\n"
        f"committer Synthetic <synthetic@example.invalid> 1 +0000\n\n{label}\n"
    ).encode("ascii")
    commit = git_object("commit", content)
    objects[commit] = ("commit", content)
    return commit


class FakeGit:
    def __init__(self, source: str, objects: dict[str, tuple[str, bytes]]):
        self.source = source
        self.objects = objects
        self.calls: list[tuple[list[str], dict[str, str]]] = []

    def __call__(self, executable, arguments, environment, maximum, input_bytes=None):
        del maximum, input_bytes
        if executable != "/usr/bin/git":
            raise AssertionError("unexpected executable")
        self.calls.append((list(arguments), dict(environment)))
        if arguments[:3] != ["--no-replace-objects", "cat-file", arguments[2]]:
            raise AssertionError("unexpected Git vector")
        operation = arguments[2]
        object_id = arguments[3]
        if environment["GIT_OBJECT_DIRECTORY"] == self.source:
            item = self.objects.get(object_id)
        else:
            loose = pathlib.Path(environment["GIT_OBJECT_DIRECTORY"]) / object_id[:2] / object_id[2:]
            if not loose.is_file():
                item = None
            else:
                expanded = zlib.decompress(loose.read_bytes())
                header, content = expanded.split(b"\0", 1)
                kind, size = header.decode("ascii").split(" ")
                if int(size) != len(content):
                    raise AssertionError("bad loose object")
                item = (kind, content)
        if item is None:
            raise RuntimeError("missing synthetic object")
        kind, content = item
        if operation == "-t":
            return f"{kind}\n".encode("ascii")
        if operation == "-s":
            return f"{len(content)}\n".encode("ascii")
        if operation != kind:
            raise AssertionError("type mismatch")
        return content


def synthetic_export_inputs():
    module = load_program()
    parsed = module.validate_request(valid_request())
    objects: dict[str, tuple[str, bytes]] = {}
    g001_files = {
        "spacetimedb/package.json": b"{\"name\":\"g001\"}\n",
        "spacetimedb/pnpm-lock.yaml": b"lockfileVersion: '9.0'\n",
        "spacetimedb/pnpm-workspace.yaml": b"packages: ['.']\n",
        "spacetimedb/src/module.ts": b"export const g001 = true\n",
    }
    preparation_manifest = b"{\"syntheticPreparation\":true}\n"
    materializer = b"export const syntheticMaterializer = true\n"
    preparation_files = {
        "scripts/auth-bridge-notification-prepared-deploy-closure-v1.json": preparation_manifest,
        "scripts/genesis001-frozen-materializer.mjs": materializer,
    }
    g002_files = {
        "spacetimedb/package.json": b"{\"name\":\"workspace\"}\n",
        "spacetimedb/pnpm-lock.yaml": b"lockfileVersion: '9.0'\n",
        "spacetimedb/pnpm-workspace.yaml": b"packages: ['genesis002']\n",
        "spacetimedb/genesis002/package.json": b"{\"name\":\"g002\"}\n",
        "spacetimedb/genesis002/src/module.ts": b"export const g002 = true\n",
    }
    ptr_files = {
        "spacetimedb/ptr/package.json": b"{\"name\":\"ptr\"}\n",
        "spacetimedb/ptr/pnpm-lock.yaml": b"lockfileVersion: '9.0'\n",
        "spacetimedb/ptr/src/module.ts": b"export const ptr = true\n",
    }
    roots = {
        "g001": build_tree(g001_files, objects),
        "preparation": build_tree(preparation_files, objects),
        "g002": build_tree(g002_files, objects),
        "ptr": build_tree(ptr_files, objects),
    }
    commits = {name: add_commit(root, name, objects) for name, root in roots.items()}
    rules = parsed["sourcePolicy"]["sourceRules"]
    rules["g001"].update({
        "sourceCommit": commits["g001"],
        "sourceTree": roots["g001"],
        "dependencyBlobs": [
            tree_path(module, roots["g001"], path, objects)
            for path in rules["g001"]["dependencyPaths"]
        ],
        "preparationCommit": commits["preparation"],
        "preparationTree": roots["preparation"],
        "preparationManifestBlob": tree_path(
            module, roots["preparation"], rules["g001"]["preparationManifestPath"], objects
        ),
        "preparationManifestBytes": len(preparation_manifest),
        "preparationManifestSha256": hashlib.sha256(preparation_manifest).hexdigest(),
        "materializerBlob": tree_path(
            module, roots["preparation"], rules["g001"]["materializerPath"], objects
        ),
        "materializerSha256": hashlib.sha256(materializer).hexdigest(),
    })
    parsed["sources"]["g001"].update({
        "sourceCommit": commits["g001"], "sourceTree": roots["g001"]
    })
    for realm in ("g002", "ptr"):
        module_path = rules[realm]["modulePath"]
        parsed["sources"][realm].update({
            "sourceCommit": commits[realm],
            "sourceTree": tree_path(module, roots[realm], module_path, objects),
        })

    return module, parsed, objects


def source_export() -> None:
    module, parsed, objects = synthetic_export_inputs()

    with tempfile.TemporaryDirectory(prefix="warpkeep-source-export-") as temporary:
        source = pathlib.Path(temporary) / "objects"
        source.mkdir()
        cache = pathlib.Path(temporary) / "cache"
        cache.mkdir()
        destination = cache / "repository.git"
        runner = FakeGit(str(source), objects)
        evidence, dependencies, dependency_contents = module._export_source_objects(
            parsed, str(source), str(destination), runner
        )
        if evidence["objectCount"] != len(objects):
            raise AssertionError("object inventory incomplete")
        if set(dependencies) != {"g001", "g002", "ptr"}:
            raise AssertionError("dependency inventory incomplete")
        if set(dependency_contents) != {"g001", "g002", "ptr"}:
            raise AssertionError("dependency content inventory incomplete")
        inventory_path = cache / "repository-object-inventory-v1.json"
        inventory = json.loads(inventory_path.read_bytes())
        if inventory["objectClosureSha256"] != evidence["objectClosureSha256"]:
            raise AssertionError("closure mismatch")
        all_arguments = "\n".join(" ".join(arguments) for arguments, _env in runner.calls)
        for forbidden in ("HEAD", "checkout", "clone", "fetch", "remote", "config"):
            if forbidden in all_arguments:
                raise AssertionError(f"forbidden Git operation: {forbidden}")
        for _arguments, environment in runner.calls:
            if environment["GIT_CONFIG_NOSYSTEM"] != "1" or environment["GIT_CONFIG_GLOBAL"] != "/dev/null":
                raise AssertionError("ambient Git config not disabled")

        missing = dict(objects)
        missing.pop(next(iter(missing)))
        second_cache = pathlib.Path(temporary) / "cache-missing"
        second_cache.mkdir()
        try:
            module._export_source_objects(
                parsed, str(source), str(second_cache / "repository.git"),
                FakeGit(str(source), missing),
            )
        except (module.Invalid, RuntimeError):
            pass
        else:
            raise AssertionError("missing object accepted")
    print("source-export:ok")


def real_source_export() -> None:
    module, parsed, objects = synthetic_export_inputs()
    if os.name != "posix" or not pathlib.Path("/usr/bin/git").is_file():
        raise AssertionError("real disposable Git test requires the authorized Linux test host")
    with tempfile.TemporaryDirectory(prefix="warpkeep-real-source-export-") as temporary:
        root = pathlib.Path(temporary)
        source_repository = root / "source.git"
        (source_repository / "objects").mkdir(parents=True)
        for object_id, (kind, content) in sorted(objects.items()):
            module._write_loose_object(str(source_repository), object_id, kind, content)
        stage = root / "stage"
        (stage / "source-caches").mkdir(parents=True)
        module.STAGE_PATH = str(stage)
        destination = stage / "source-caches" / "repository.git"
        evidence, dependency_files, _dependency_contents = module._export_source_objects(
            parsed,
            str(source_repository / "objects"),
            str(destination),
        )
        if evidence["objectCount"] != len(objects):
            raise AssertionError("real Git export omitted an authenticated object")
        if dependency_files["g002"][0]["path"] != "spacetimedb/package.json":
            raise AssertionError("G002 object coordinate was relabelled")
        if not (destination / "HEAD").is_file() or not (destination / "refs").is_dir():
            raise AssertionError("exported cache is not a minimal Git repository")
        if (stage / "source-caches" / ".source-reader.git").exists():
            raise AssertionError("temporary isolated reader survived exact export")

        invalid = copy.deepcopy(parsed)
        invalid["sources"]["ptr"]["sourceCommit"] = "f" * 40
        second_stage = root / "invalid-stage"
        (second_stage / "source-caches").mkdir(parents=True)
        module.STAGE_PATH = str(second_stage)
        try:
            module._export_source_objects(
                invalid,
                str(source_repository / "objects"),
                str(second_stage / "source-caches" / "repository.git"),
            )
        except module.Invalid:
            pass
        else:
            raise AssertionError("missing authenticated Git object was accepted")
    print("real-source-export:ok")


def receipt_digest_separation() -> None:
    module = load_program()
    request = valid_request()
    historical = {"g002": "a" * 64, "ptr": "d" * 64}
    for realm, digest in historical.items():
        request["sources"][realm] = {
            "sourceCommit": request["sources"][realm]["sourceCommit"],
            "sourceTree": request["sources"][realm]["sourceTree"],
            "historicalDependencyClosureSha256": digest,
        }
    parsed = module.validate_request(request)
    dependency_files = {}
    for realm in ("g001", "g002", "ptr"):
        dependency_files[realm] = [
            {
                "path": path,
                "blob": (
                    parsed["sourcePolicy"]["sourceRules"][realm]["dependencyBlobs"][index]
                    if realm == "g001" else ("1" if realm == "g002" else "2") * 40
                ),
                "bytes": len(path.encode("utf-8")),
                "sha256": hashlib.sha256(path.encode("utf-8")).hexdigest(),
            }
            for index, path in enumerate(
                parsed["sourcePolicy"]["sourceRules"][realm]["dependencyPaths"]
            )
        ]
    evidence = module._source_evidence_records(parsed, dependency_files)
    for realm in ("g002", "ptr"):
        if evidence[realm]["historicalDependencyClosureSha256"] != historical[realm]:
            raise AssertionError("authenticated historical receipt digest was replaced")
        if evidence[realm]["linuxSourceDependencyClosureSha256"] == historical[realm]:
            raise AssertionError("unrelated Linux source digest was conflated with receipt digest")
    if evidence["g001"]["historicalDependencyClosureSha256"] is not None:
        raise AssertionError("G001 invented a historical publisher receipt digest")
    print("receipt-digest-separation:ok")


class FakeResponse:
    def __init__(self, status: int, headers: list[tuple[str, str]], chunks: list[bytes]):
        self.status = status
        self._headers = headers
        self._chunks = list(chunks)
        self.closed = False

    def getheaders(self):
        return list(self._headers)

    def read(self, maximum):
        if not self._chunks:
            return b""
        value = self._chunks.pop(0)
        if len(value) <= maximum:
            return value
        self._chunks.insert(0, value[maximum:])
        return value[:maximum]

    def close(self):
        self.closed = True


class FakeConnection:
    def __init__(self, response, calls, *arguments, **options):
        self.response = response
        self.calls = calls
        self.calls.append(("connect", arguments, options))

    def putrequest(self, *arguments, **options):
        self.calls.append(("request", arguments, options))

    def endheaders(self):
        self.calls.append(("headers-complete",))

    def getresponse(self):
        return self.response

    def close(self):
        self.calls.append(("close",))


def tar_bytes(files: dict[str, tuple[int, bytes]], mode: str) -> bytes:
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode=mode) as archive:
        for name, (permissions, content) in files.items():
            member = tarfile.TarInfo(name)
            member.mode = permissions
            member.size = len(content)
            member.mtime = 0
            archive.addfile(member, io.BytesIO(content))
    return output.getvalue()


def artifact_boundaries() -> None:
    module = load_program()
    calls: list[tuple[object, ...]] = []
    response = FakeResponse(200, [("Content-Length", "6")], [b"abc", b"def"])
    factory = lambda *args, **kwargs: FakeConnection(response, calls, *args, **kwargs)
    status, headers, body = module._request_once(
        "https://nodejs.org/fixed", 6, factory
    )
    if status != 200 or headers["content-length"] != "6" or body != b"abcdef":
        raise AssertionError("bounded response corrupted")
    request_calls = [call for call in calls if call[0] == "request"]
    if request_calls != [("request", ("GET", "/fixed"), {"skip_accept_encoding": True})]:
        raise AssertionError("request vector widened")
    if not response.closed:
        raise AssertionError("response not closed")

    overflow = FakeResponse(200, [], [b"abcdef"])
    try:
        module._request_once(
            "https://nodejs.org/fixed", 5,
            lambda *args, **kwargs: FakeConnection(overflow, [], *args, **kwargs),
        )
    except module.Invalid:
        pass
    else:
        raise AssertionError("oversize response accepted")
    if not overflow.closed:
        raise AssertionError("overflow response not closed")

    try:
        module._fetch_exact(
            "https://nodejs.org/fixed", 3, hashlib.sha256(b"abc").hexdigest(),
            lambda _url, _maximum: (302, {"location": "https://nodejs.org/else"}, b"abc"),
        )
    except module.Invalid:
        pass
    else:
        raise AssertionError("direct redirect accepted")

    spacetime = {
        "archiveUrl": "https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.6.1/fixed.tgz",
        "archiveBytes": 3,
        "archiveSha256": hashlib.sha256(b"abc").hexdigest(),
    }
    accepted_exchanges = iter([
        (302, {
            "location": "https://release-assets.githubusercontent.com/fixed",
            "x-harmless-future-header": "ignored",
        }, b"redirect metadata"),
        (200, {"content-length": "3"}, b"abc"),
    ])
    if module._fetch_spacetime(
        spacetime, lambda _url, _maximum: next(accepted_exchanges)
    ) != b"abc":
        raise AssertionError("one-hop release response rejected harmless metadata")
    exchanges = iter([
        (302, {"location": "https://release-assets.githubusercontent.com/fixed"}, b"redirect"),
        (302, {"location": "https://release-assets.githubusercontent.com/again"}, b"abc"),
    ])
    try:
        module._fetch_spacetime(spacetime, lambda _url, _maximum: next(exchanges))
    except module.Invalid:
        pass
    else:
        raise AssertionError("second redirect accepted")

    member_content = b"fixed-member"
    archive = tar_bytes({"package/member": (0o755, member_content)}, "w:gz")
    expected = {
        "package/member": {
            "mode": "755",
            "bytes": len(member_content),
            "sha256": hashlib.sha256(member_content).hexdigest(),
        }
    }
    if module._extract_selected_members(archive, "r:gz", expected) != {"package/member": member_content}:
        raise AssertionError("archive member not verified")
    wrong = copy.deepcopy(expected)
    wrong["package/member"]["mode"] = "644"
    try:
        module._extract_selected_members(archive, "r:gz", wrong)
    except module.Invalid:
        pass
    else:
        raise AssertionError("wrong member mode accepted")

    module._validate_gpg_listing(
        b"pub:-:255:22:KEY::::::\nfpr:::::::::5BE8A3F6C8A5C01D106C0AD820B1A390B168D356:\n",
        "5BE8A3F6C8A5C01D106C0AD820B1A390B168D356",
        "EdDSA",
    )
    module._validate_gpgv_status(
        b"[GNUPG:] VALIDSIG CC68F5A3106FF448322E48ED27F5E38D5B0A215F 1 2 3\n",
        "CC68F5A3106FF448322E48ED27F5E38D5B0A215F",
    )
    try:
        module._validate_gpgv_status(
            b"[GNUPG:] VALIDSIG " + b"0" * 40 + b" 1 2 3\n",
            "CC68F5A3106FF448322E48ED27F5E38D5B0A215F",
        )
    except module.Invalid:
        pass
    else:
        raise AssertionError("cross-release signer accepted")

    sri = "sha512-" + base64.b64encode(hashlib.sha512(b"package").digest()).decode("ascii")
    module._verify_sri(b"package", sri)
    try:
        module._verify_sri(b"substituted", sri)
    except module.Invalid:
        pass
    else:
        raise AssertionError("wrong SRI accepted")
    print("artifact-boundaries:ok")


def real_signature_boundary() -> None:
    module = load_program()
    if os.name != "posix" or not pathlib.Path("/usr/bin/gpgv").is_file():
        raise AssertionError("real disposable signature test requires the authorized Linux test host")
    with tempfile.TemporaryDirectory(prefix="warpkeep-real-signature-") as temporary:
        root = pathlib.Path(temporary)
        signer = root / "signer"
        signer.mkdir(mode=0o700)
        environment = {
            "GNUPGHOME": str(signer),
            "HOME": str(signer),
            "LANG": "C",
            "LC_ALL": "C",
            "PATH": "/usr/bin:/bin",
            "TZ": "UTC",
        }
        def kill_agent() -> None:
            subprocess.run(
                ["/usr/bin/gpgconf", "--homedir", str(signer), "--kill", "gpg-agent"],
                check=False,
                cwd="/",
                env=environment,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=10,
            )
        atexit.register(kill_agent)

        def gpg(arguments: list[str], input_bytes: bytes | None = None) -> bytes:
            result = subprocess.run(
                ["/usr/bin/gpg", "--homedir", str(signer), "--batch", "--no-options",
                 "--no-auto-key-locate", *arguments],
                check=False,
                cwd="/",
                env=environment,
                input=input_bytes,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30,
            )
            if result.returncode != 0:
                raise AssertionError("synthetic GPG setup failed")
            return result.stdout

        identity = "Warpkeep Recovery Synthetic Test <synthetic@example.invalid>"
        gpg([
            "--pinentry-mode", "loopback", "--passphrase", "",
            "--quick-generate-key", identity, "ed25519", "sign", "0",
        ])
        listing = gpg(["--with-colons", "--fingerprint", "--list-keys", identity])
        fingerprints = [
            line.split(":")[9]
            for line in listing.decode("utf-8").splitlines()
            if line.startswith("fpr:")
        ]
        if len(fingerprints) != 1 or len(fingerprints[0]) != 40:
            raise AssertionError("synthetic signer fingerprint unavailable")
        fingerprint = fingerprints[0]
        key = gpg(["--armor", "--export", fingerprint])
        shasums = (
            b"0" * 64
            + b"  node-v0.0.0-linux-x64.tar.xz\n"
        )
        sums_path = root / "SHASUMS256.txt"
        signature_path = root / "SHASUMS256.txt.sig"
        sums_path.write_bytes(shasums)
        gpg([
            "--pinentry-mode", "loopback", "--passphrase", "",
            "--local-user", fingerprint, "--detach-sign",
            "--output", str(signature_path), str(sums_path),
        ])
        signature = signature_path.read_bytes()
        release = {
            "signerFingerprint": fingerprint,
            "signingAlgorithm": "EdDSA",
        }
        module._verify_node_signature(
            key, shasums, signature, release, str(root / "verify-valid")
        )
        invalid = bytearray(signature)
        invalid[-1] ^= 1
        try:
            module._verify_node_signature(
                key, shasums, bytes(invalid), release, str(root / "verify-invalid")
            )
        except module.Invalid:
            pass
        else:
            raise AssertionError("invalid detached signature was accepted")
        kill_agent()
        atexit.unregister(kill_agent)
    print("real-signature-boundary:ok")


def lock_graph() -> None:
    module = load_program()
    if module._package_coordinate("@scope/package@1.2.3(peer@4.5.6)") != (
        "@scope/package", "1.2.3",
    ):
        raise AssertionError("scoped peer coordinate split at wrong at-sign")
    integrity = lambda value: "sha512-" + base64.b64encode(
        hashlib.sha512(value.encode("ascii")).digest()
    ).decode("ascii")
    lock = f"""lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      esbuild:
        specifier: 0.25.12
        version: 0.25.12
      typescript:
        specifier: 5.6.3
        version: 5.6.3

packages:

  '@esbuild/linux-x64@0.25.12':
    resolution: {{integrity: {integrity('linux')}}}
    cpu: [x64]
    os: [linux]

  '@esbuild/win32-x64@0.25.12':
    resolution: {{integrity: {integrity('windows')}}}
    cpu: [x64]
    os: [win32]

  esbuild@0.25.12:
    resolution: {{integrity: {integrity('esbuild')}}}

  typescript@5.6.3:
    resolution: {{integrity: {integrity('typescript')}}}

snapshots:

  '@esbuild/linux-x64@0.25.12':
    {{}}

  '@esbuild/win32-x64@0.25.12':
    {{}}

  esbuild@0.25.12:
    optionalDependencies:
      '@esbuild/linux-x64': 0.25.12
      '@esbuild/win32-x64': 0.25.12

  typescript@5.6.3:
    {{}}
""".encode("utf-8")
    packages = module._parse_lock_packages(lock, ".")
    names = [entry["name"] for entry in packages]
    if names != ["@esbuild/linux-x64", "esbuild", "typescript"]:
        raise AssertionError(f"unexpected lock graph: {names!r}")
    if packages[0]["url"] != "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.12.tgz":
        raise AssertionError("noncanonical package URL")
    without_esbuild = lock.replace(b"      '@esbuild/linux-x64': 0.25.12\n", b"")
    try:
        module._parse_lock_packages(without_esbuild, ".")
    except module.Invalid:
        pass
    else:
        raise AssertionError("missing Linux esbuild accepted")
    print("lock-graph:ok")


def workspace_layout() -> None:
    module = load_program()
    parsed = module.validate_request(valid_request())
    g002 = parsed["sourcePolicy"]["sourceRules"]["g002"]
    if g002 != {
        "modulePath": "spacetimedb/genesis002",
        "workspacePath": "spacetimedb",
        "lockImporter": "genesis002",
        "packageName": "warpkeep-genesis-002-spacetimedb-module",
        "nodeVersion": "22.22.3",
        "dependencyPaths": [
            "spacetimedb/package.json",
            "spacetimedb/pnpm-workspace.yaml",
            "spacetimedb/pnpm-lock.yaml",
            "spacetimedb/genesis002/package.json",
        ],
    }:
        raise AssertionError("G002 authenticated workspace policy changed")

    def package(name: str) -> bytes:
        return json.dumps({
            "name": name,
            "private": True,
            "packageManager": "pnpm@11.7.0",
            "scripts": {},
        }, separators=(",", ":")).encode() + b"\n"

    def lock(importer: str) -> bytes:
        integrity = "sha512-" + base64.b64encode(
            hashlib.sha512(importer.encode()).digest()
        ).decode("ascii")
        return f"""lockfileVersion: '9.0'

importers:

  {importer}:
    devDependencies:
      esbuild:
        specifier: 0.25.12
        version: 0.25.12

packages:

  '@esbuild/linux-x64@0.25.12':
    resolution: {{integrity: {integrity}}}
    cpu: [x64]
    os: [linux]

  esbuild@0.25.12:
    resolution: {{integrity: {integrity}}}

snapshots:

  '@esbuild/linux-x64@0.25.12':
    {{}}

  esbuild@0.25.12:
    optionalDependencies:
      '@esbuild/linux-x64': 0.25.12
""".encode()

    workspace = b"packages:\n  - genesis002\nallowBuilds:\n  esbuild: true\n"
    g001_workspace = b"packages:\n  - .\nallowBuilds:\n  esbuild: true\n"
    contents = {
        "g001": {
            "spacetimedb/package.json": package("warpkeep-spacetimedb-module"),
            "spacetimedb/pnpm-lock.yaml": lock("."),
            "spacetimedb/pnpm-workspace.yaml": g001_workspace,
        },
        "g002": {
            "spacetimedb/package.json": package("warpkeep-spacetimedb-module"),
            "spacetimedb/pnpm-workspace.yaml": workspace,
            "spacetimedb/pnpm-lock.yaml": lock("genesis002"),
            "spacetimedb/genesis002/package.json": package(
                "warpkeep-genesis-002-spacetimedb-module"
            ),
        },
        "ptr": {
            "spacetimedb/ptr/package.json": package("warpkeep-ptr-spacetimedb-module"),
            "spacetimedb/ptr/pnpm-lock.yaml": lock("."),
        },
    }
    selected = module._validate_dependency_documents(parsed, contents)
    if selected["g002"][0]["name"] != "@esbuild/linux-x64":
        raise AssertionError("G002 workspace lock graph was not selected")
    rejected = copy.deepcopy(contents)
    rejected["g002"]["spacetimedb/pnpm-lock.yaml"] = lock("spacetimedb/genesis002")
    try:
        module._validate_dependency_documents(parsed, rejected)
    except module.Invalid:
        pass
    else:
        raise AssertionError("repository-relative path was accepted as G002 lock importer")
    print("workspace-layout:ok")


def transaction_catalog() -> None:
    module = load_program()
    with tempfile.TemporaryDirectory(prefix="warpkeep-bootstrap-transaction-") as temporary:
        state = pathlib.Path(temporary) / "state"
        state.mkdir(mode=0o700)
        module.STATE_ROOT = str(state)
        module.CATALOG_PATH = str(state / "cache-catalog-v2.json")
        module.TRANSACTION_PATH = str(state / ".bootstrap-transaction-v1")
        module.JOURNAL_PATH = str(pathlib.Path(module.TRANSACTION_PATH) / "journal.json")
        module.STAGE_PATH = str(pathlib.Path(module.TRANSACTION_PATH) / "stage")
        module._make_directory(module.TRANSACTION_PATH)
        module._make_directory(module.STAGE_PATH)
        interrupted_begin = module._journal_record("BUILDING", [], None, None)
        module._write_exclusive(
            f"{module.JOURNAL_PATH}.next",
            module.canonical_bytes(interrupted_begin),
            0o600,
        )
        module._recover_transaction()
        if pathlib.Path(module.TRANSACTION_PATH).exists():
            raise AssertionError("interrupted initial journal survived recovery")
        module._begin_transaction()
        for root in ("pnpm-store", "source-caches", "toolchains"):
            module._make_directory(str(pathlib.Path(module.STAGE_PATH) / root))
        manifest = b'{"synthetic":true}\n'
        module._install_cache_file(
            module.STAGE_PATH, "toolchains/linux-x64.json", manifest, 0o400,
        )
        module._install_cache_file(
            module.STAGE_PATH, "pnpm-store/g001/files/value", b"package\n", 0o400,
        )
        module._install_cache_file(
            module.STAGE_PATH, "source-caches/value", b"source\n", 0o400,
        )
        catalog, catalog_bytes = module._create_cache_catalog(
            module.STAGE_PATH, hashlib.sha256(manifest).hexdigest(),
        )
        module._install_cache_file(
            module.STAGE_PATH, "cache-catalog-v2.json", catalog_bytes, 0o400,
            catalog_file=True,
        )
        paths = [entry["path"] for entry in catalog["entries"]]
        if paths != sorted(paths, key=lambda value: value.encode("utf-8")):
            raise AssertionError("catalog not byte-sorted")
        if "source-caches/value" not in paths or "pnpm-store/g001/files/value" not in paths:
            raise AssertionError("catalog omitted consumed cache file")

        result = {
            "prepared": True,
            "sourcePolicySha256": "1" * 64,
            "manifestSha256": hashlib.sha256(manifest).hexdigest(),
            "cacheSha256": hashlib.sha256(catalog_bytes).hexdigest(),
            "cacheClosureSha256": catalog["cacheClosureSha256"],
            "signaturesVerified": True,
            "offlineReady": True,
        }
        original_rename = module._durable_rename
        calls = 0

        def interrupted(source, destination):
            nonlocal calls
            calls += 1
            if calls == 2:
                raise OSError("synthetic interruption")
            return original_rename(source, destination)

        module._durable_rename = interrupted
        try:
            module._commit_transaction(result)
        except OSError:
            pass
        else:
            raise AssertionError("interrupted transaction committed")
        finally:
            module._durable_rename = original_rename
        if not pathlib.Path(module.JOURNAL_PATH).is_file():
            raise AssertionError("durable rollback journal missing")
        module._recover_transaction()
        for name in ("pnpm-store", "source-caches", "toolchains", "cache-catalog-v2.json"):
            if (state / name).exists():
                raise AssertionError("interrupted install survived rollback")
        if pathlib.Path(module.TRANSACTION_PATH).exists():
            raise AssertionError("transaction directory survived recovery")
    print("transaction-catalog:ok")


def producer_control_flow() -> None:
    module = load_program()
    parsed = module.validate_request(valid_request())
    policy = parsed["sourcePolicy"]
    dependency_files: dict[str, list[dict[str, object]]] = {}
    dependency_contents: dict[str, dict[str, bytes]] = {}
    for realm in ("g001", "g002", "ptr"):
        records = []
        contents = {}
        for index, path in enumerate(policy["sourceRules"][realm]["dependencyPaths"]):
            content = f"synthetic:{realm}:{path}\n".encode("utf-8")
            records.append({
                "path": path,
                "blob": (
                    policy["sourceRules"][realm]["dependencyBlobs"][index]
                    if realm == "g001" else ("a" if realm == "g002" else "b") * 40
                ),
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            })
            contents[path] = content
        dependency_files[realm] = records
        dependency_contents[realm] = contents

    source_export = {
        "profile": "warpkeep-release-recovery-source-object-export-v1",
        "repositoryPath": "source-caches/repository.git",
        "objectFormat": "sha1",
        "objectInventoryDomain": "warpkeep.release-recovery.source-object-export.v1",
        "objectInventoryRecordPath": "source-caches/repository-object-inventory-v1.json",
        "objectCount": 4,
        "objectBytes": 100,
        "objectClosureSha256": "c" * 64,
        "exactObjectsVerified": True,
        "sources": {
            "g001": {
                "sourceCommit": parsed["sources"]["g001"]["sourceCommit"],
                "sourceTree": parsed["sources"]["g001"]["sourceTree"],
                "preparationCommit": policy["sourceRules"]["g001"]["preparationCommit"],
                "preparationTree": policy["sourceRules"]["g001"]["preparationTree"],
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
    programs = {
        **parsed["programs"], "installedMode": "500", "installedVerified": True,
    }
    system_tools = {
        name: {
            **value, "installedBytes": 100 + index,
            "installedMode": "755", "installedVerified": True,
        }
        for index, (name, value) in enumerate(policy["systemTools"].items())
    }
    selected = {
        realm: [{
            "name": "@esbuild/linux-x64",
            "version": "0.25.12",
            "url": "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.12.tgz",
            "sri": "sha512-" + base64.b64encode(hashlib.sha512(realm.encode()).digest()).decode(),
            "os": ["linux"],
            "cpu": ["x64"],
        }]
        for realm in ("g001", "g002", "ptr")
    }

    with tempfile.TemporaryDirectory(prefix="warpkeep-bootstrap-producer-") as temporary:
        state = pathlib.Path(temporary) / "state"
        module.STATE_ROOT = str(state)
        module.CATALOG_PATH = str(state / "cache-catalog-v2.json")
        module.TRANSACTION_PATH = str(state / ".bootstrap-transaction-v1")
        module.JOURNAL_PATH = str(pathlib.Path(module.TRANSACTION_PATH) / "journal.json")
        module.STAGE_PATH = str(pathlib.Path(module.TRANSACTION_PATH) / "stage")
        module._ensure_state_root = lambda: state.mkdir(mode=0o700, exist_ok=True)
        calls: list[str] = []

        def export_sources(_parsed, _objects, destination, _runner):
            calls.append("source-export")
            module._make_directory(destination)
            module._make_directory(str(pathlib.Path(destination) / "objects"))
            module._install_cache_file(
                module.STAGE_PATH,
                "source-caches/repository.git/objects/synthetic",
                b"object\n", 0o400,
            )
            module._install_cache_file(
                module.STAGE_PATH,
                "source-caches/repository-object-inventory-v1.json",
                b'{"synthetic":true}\n', 0o400,
            )
            return source_export, dependency_files, dependency_contents

        def validate_documents(_parsed, _contents):
            calls.append("dependency-authority")
            return selected

        def install_toolchains(_parsed):
            calls.append("artifact-verification")
            for path in (
                "toolchains/node-v24.19.0-linux-x64/bin/node",
                "toolchains/node-v22.22.3-linux-x64/bin/node",
                "toolchains/pnpm-11.7.0/package/bin/pnpm.mjs",
                "toolchains/spacetime-2.6.1/spacetime",
                "toolchains/spacetime-2.6.1/spacetimedb-standalone",
            ):
                module._install_cache_file(module.STAGE_PATH, path, path.encode(), 0o500)
            nodes = {
                version: {**value, "signatureVerified": True, "extractedMemberVerified": True}
                for version, value in policy["nodeReleases"].items()
            }
            return (
                nodes,
                {**policy["pnpm"], "archiveVerified": True, "membersVerified": True},
                {**policy["spacetime"], "archiveVerified": True, "membersVerified": True},
            )

        def build_caches(_parsed, _contents, _selected, sources):
            calls.append("offline-cache")
            result = {}
            for realm in ("g001", "g002", "ptr"):
                content = f"store:{realm}\n".encode()
                module._install_cache_file(
                    module.STAGE_PATH, f"pnpm-store/{realm}/files/value", content, 0o400,
                )
                package = {
                    "name": selected[realm][0]["name"],
                    "version": selected[realm][0]["version"],
                    "url": selected[realm][0]["url"],
                    "sri": selected[realm][0]["sri"],
                    "bytes": len(content),
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "os": selected[realm][0]["os"],
                    "cpu": selected[realm][0]["cpu"],
                }
                result[realm] = {
                    "realm": realm,
                    "sourceCommit": sources[realm]["sourceCommit"],
                    "sourceTree": sources[realm]["sourceTree"],
                    "storePath": f"pnpm-store/{realm}",
                    "closureRecordPath": sources[realm]["dependencyClosureRecordPath"],
                    "historicalDependencyClosureSha256":
                        sources[realm]["historicalDependencyClosureSha256"],
                    "linuxSourceDependencyClosureSha256":
                        sources[realm]["linuxSourceDependencyClosureSha256"],
                    "linuxCacheClosureSha256": module._dependency_cache_closure(
                        realm, sources[realm], [package], module.STAGE_PATH,
                    ),
                    "cacheInventoryDomain":
                        f"warpkeep.release-recovery.linux-dependency-cache.{realm}.v1",
                    "containsLinuxX64Esbuild": True,
                    "packages": [package],
                }
            return result

        module._export_source_objects = export_sources
        module._validate_dependency_documents = validate_documents
        module._install_toolchains = install_toolchains
        module._build_dependency_caches = build_caches
        module._verify_retained_node_signatures = lambda *_args: calls.append(
            "offline-signature"
        )
        result = module._prepare_toolchain(
            parsed, "/mnt/c/synthetic/.git/objects", programs, system_tools,
        )
        if calls != [
            "source-export", "dependency-authority", "artifact-verification", "offline-cache",
            "offline-signature",
        ]:
            raise AssertionError(f"unexpected producer order: {calls!r}")
        catalog_before = (state / "cache-catalog-v2.json").read_bytes()
        manifest = json.loads((state / "toolchains" / "linux-x64.json").read_bytes())
        if manifest["programs"] != programs or manifest["sourceObjectExport"] != source_export:
            raise AssertionError("full evidence omitted from manifest")
        journal = json.loads((state / ".bootstrap-transaction-v1" / "journal.json").read_bytes())
        if journal["state"] != "COMMITTED" or (state / ".work").exists():
            raise AssertionError("durable producer completion anchor missing")

        module._export_source_objects = lambda *_args: (_ for _ in ()).throw(
            AssertionError("idempotent readback rebuilt source cache")
        )
        repeated = module._prepare_toolchain(
            parsed, "/mnt/c/synthetic/.git/objects", programs, system_tools,
        )
        if repeated != result or (state / "cache-catalog-v2.json").read_bytes() != catalog_before:
            raise AssertionError("idempotent producer rewrote verified cache")

        transaction = state / ".bootstrap-transaction-v1"
        retained = state / ".bootstrap-transaction-retained"
        transaction.rename(retained)
        tampered = state / "pnpm-store" / "g001" / "files" / "value"
        tampered.chmod(0o600)
        tampered.write_bytes(b"tampered-unanchored-cache\n")
        tampered.chmod(0o400)
        before = module._inventory_cache(str(state))
        try:
            module._prepare_toolchain(
                parsed, "/mnt/c/synthetic/.git/objects", programs, system_tools,
            )
        except module.Invalid:
            pass
        else:
            raise AssertionError("unanchored existing cache received fresh trust")
        after = module._inventory_cache(str(state))
        if after != before or not retained.is_dir():
            raise AssertionError("rejected unanchored cache state was mutated")
    print("producer-control-flow:ok")


def combined_producer_authority() -> None:
    module = load_program()
    if os.name != "posix" or os.geteuid() != 0:
        raise AssertionError("combined producer authority test requires a root Linux test host")
    parsed = module.validate_request(valid_request())
    policy = parsed["sourcePolicy"]

    registry_archives = {
        "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.12.tgz":
            b"synthetic-linux-x64-package\n",
        "https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz":
            b"synthetic-esbuild-package\n",
    }
    registry_sri = {
        url: "sha512-" + base64.b64encode(hashlib.sha512(content).digest()).decode("ascii")
        for url, content in registry_archives.items()
    }

    def package_document(name: str) -> bytes:
        return json.dumps({
            "name": name,
            "private": True,
            "packageManager": "pnpm@11.7.0",
            "scripts": {},
        }, separators=(",", ":")).encode("utf-8") + b"\n"

    def lock_document(importer: str) -> bytes:
        linux_sri = registry_sri[
            "https://registry.npmjs.org/@esbuild/linux-x64/-/linux-x64-0.25.12.tgz"
        ]
        esbuild_sri = registry_sri[
            "https://registry.npmjs.org/esbuild/-/esbuild-0.25.12.tgz"
        ]
        return f"""lockfileVersion: '9.0'

importers:

  {importer}:
    devDependencies:
      esbuild:
        specifier: 0.25.12
        version: 0.25.12

packages:

  '@esbuild/linux-x64@0.25.12':
    resolution: {{integrity: {linux_sri}}}
    cpu: [x64]
    os: [linux]

  esbuild@0.25.12:
    resolution: {{integrity: {esbuild_sri}}}

snapshots:

  '@esbuild/linux-x64@0.25.12':
    {{}}

  esbuild@0.25.12:
    optionalDependencies:
      '@esbuild/linux-x64': 0.25.12
""".encode("utf-8")

    dependency_contents = {
        "g001": {
            "spacetimedb/package.json": package_document("warpkeep-spacetimedb-module"),
            "spacetimedb/pnpm-lock.yaml": lock_document("."),
            "spacetimedb/pnpm-workspace.yaml":
                b"packages:\n  - .\nallowBuilds:\n  esbuild: true\n",
        },
        "g002": {
            "spacetimedb/package.json": package_document("warpkeep-spacetimedb-module"),
            "spacetimedb/pnpm-workspace.yaml":
                b"packages:\n  - genesis002\nallowBuilds:\n  esbuild: true\n",
            "spacetimedb/pnpm-lock.yaml": lock_document("genesis002"),
            "spacetimedb/genesis002/package.json": package_document(
                "warpkeep-genesis-002-spacetimedb-module"
            ),
        },
        "ptr": {
            "spacetimedb/ptr/package.json": package_document(
                "warpkeep-ptr-spacetimedb-module"
            ),
            "spacetimedb/ptr/pnpm-lock.yaml": lock_document("."),
        },
    }
    objects: dict[str, tuple[str, bytes]] = {}
    preparation_manifest = b'{"syntheticPreparation":true}\n'
    materializer = b"export const syntheticMaterializer = true\n"
    source_files = {
        realm: {**contents, f"{policy['sourceRules'][realm]['modulePath']}/src/module.ts": (
            f"export const {realm} = true\n".encode("ascii")
        )}
        for realm, contents in dependency_contents.items()
    }
    roots = {
        realm: build_tree(files, objects)
        for realm, files in source_files.items()
    }
    preparation_root = build_tree({
        policy["sourceRules"]["g001"]["preparationManifestPath"]: preparation_manifest,
        policy["sourceRules"]["g001"]["materializerPath"]: materializer,
    }, objects)
    commits = {
        realm: add_commit(root, realm, objects)
        for realm, root in roots.items()
    }
    preparation_commit = add_commit(preparation_root, "preparation", objects)
    rules = policy["sourceRules"]
    rules["g001"].update({
        "sourceCommit": commits["g001"],
        "sourceTree": roots["g001"],
        "dependencyBlobs": [
            tree_path(module, roots["g001"], path, objects)
            for path in rules["g001"]["dependencyPaths"]
        ],
        "preparationCommit": preparation_commit,
        "preparationTree": preparation_root,
        "preparationManifestBlob": tree_path(
            module, preparation_root, rules["g001"]["preparationManifestPath"], objects,
        ),
        "preparationManifestBytes": len(preparation_manifest),
        "preparationManifestSha256": hashlib.sha256(preparation_manifest).hexdigest(),
        "materializerBlob": tree_path(
            module, preparation_root, rules["g001"]["materializerPath"], objects,
        ),
        "materializerSha256": hashlib.sha256(materializer).hexdigest(),
    })
    parsed["sources"]["g001"].update({
        "sourceCommit": commits["g001"],
        "sourceTree": roots["g001"],
    })
    for realm in ("g002", "ptr"):
        parsed["sources"][realm].update({
            "sourceCommit": commits[realm],
            "sourceTree": tree_path(
                module, roots[realm], rules[realm]["modulePath"], objects,
            ),
        })

    node_artifacts: dict[str, dict[str, bytes]] = {}
    for version, release in policy["nodeReleases"].items():
        member = f"synthetic-node-{version}\n".encode("ascii")
        archive = tar_bytes({release["archiveMemberPath"]: (0o755, member)}, "w:xz")
        archive_digest = hashlib.sha256(archive).hexdigest()
        archive_name = release["archiveUrl"].rsplit("/", 1)[1]
        shasums = f"{archive_digest}  {archive_name}\n".encode("ascii")
        key = f"synthetic-key-{version}\n".encode("ascii")
        signature = f"synthetic-signature-{version}\n".encode("ascii")
        release.update({
            "archiveBytes": len(archive),
            "archiveSha256": archive_digest,
            "archiveMemberBytes": len(member),
            "archiveMemberSha256": hashlib.sha256(member).hexdigest(),
            "shasumsBytes": len(shasums),
            "shasumsSha256": hashlib.sha256(shasums).hexdigest(),
            "signatureBytes": len(signature),
            "signatureSha256": hashlib.sha256(signature).hexdigest(),
            "publicKeyBytes": len(key),
            "publicKeySha256": hashlib.sha256(key).hexdigest(),
        })
        node_artifacts[version] = {
            "archive": archive,
            "member": member,
            "shasums": shasums,
            "signature": signature,
            "key": key,
        }

    pnpm_member_contents = {
        "package/bin/pnpm.mjs": b"synthetic-pnpm-entry\n",
        "package/dist/pnpm.mjs": b"synthetic-pnpm-distribution\n",
        "package/package.json": b'{"name":"pnpm","version":"11.7.0"}\n',
    }
    pnpm_archive = tar_bytes({
        path: (int(policy["pnpm"]["members"][path]["mode"], 8), content)
        for path, content in pnpm_member_contents.items()
    }, "w:gz")
    policy["pnpm"].update({
        "compressedBytes": len(pnpm_archive),
        "sri": "sha512-" + base64.b64encode(
            hashlib.sha512(pnpm_archive).digest()
        ).decode("ascii"),
        "sha256": hashlib.sha256(pnpm_archive).hexdigest(),
        "members": {
            path: {
                **policy["pnpm"]["members"][path],
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
            for path, content in pnpm_member_contents.items()
        },
    })

    spacetime_member_contents = {
        "spacetimedb-cli": b"synthetic-spacetime-cli\n",
        "spacetimedb-standalone": b"synthetic-spacetime-standalone\n",
    }
    spacetime_archive = tar_bytes({
        path: (0o755, content)
        for path, content in spacetime_member_contents.items()
    }, "w:gz")
    policy["spacetime"].update({
        "archiveBytes": len(spacetime_archive),
        "archiveSha256": hashlib.sha256(spacetime_archive).hexdigest(),
        "members": {
            path: {
                **policy["spacetime"]["members"][path],
                "bytes": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
            for path, content in spacetime_member_contents.items()
        },
    })
    parsed["sourcePolicySha256"] = hashlib.sha256(
        module.canonical_bytes(policy)
    ).hexdigest()

    direct_artifacts: dict[str, bytes] = {
        policy["pnpm"]["url"]: pnpm_archive,
        **registry_archives,
    }
    for version, release in policy["nodeReleases"].items():
        artifacts = node_artifacts[version]
        direct_artifacts.update({
            release["publicKeyUrl"]: artifacts["key"],
            release["shasumsUrl"]: artifacts["shasums"],
            release["signatureUrl"]: artifacts["signature"],
            release["archiveUrl"]: artifacts["archive"],
        })
    spacetime_redirect = "https://release-assets.githubusercontent.com/synthetic-fixed"
    request_calls: list[tuple[str, int]] = []

    def request_once(url: str, maximum: int):
        request_calls.append((url, maximum))
        if url == policy["spacetime"]["archiveUrl"]:
            return 302, {"location": spacetime_redirect}, b"synthetic redirect metadata"
        if url == spacetime_redirect:
            content = spacetime_archive
        else:
            content = direct_artifacts.get(url)
        if content is None or len(content) > maximum:
            raise AssertionError(f"unexpected or unbounded synthetic request: {url}")
        return 200, {"content-length": str(len(content))}, content

    with tempfile.TemporaryDirectory(prefix="warpkeep-combined-producer-") as temporary:
        root = pathlib.Path(temporary)
        state = root / "state"
        source = root / "public.git" / "objects"
        source.mkdir(parents=True, mode=0o700)
        module.STATE_ROOT = str(state)
        module.CATALOG_PATH = str(state / "cache-catalog-v2.json")
        module.TRANSACTION_PATH = str(state / ".bootstrap-transaction-v1")
        module.JOURNAL_PATH = str(pathlib.Path(module.TRANSACTION_PATH) / "journal.json")
        module.STAGE_PATH = str(pathlib.Path(module.TRANSACTION_PATH) / "stage")
        git_runner = FakeGit(str(source), objects)
        process_calls: list[tuple[str, list[str]]] = []

        def release_for_environment(environment: dict[str, str]):
            matches = [
                version for version in ("24.19.0", "22.22.3")
                if version in environment.get("GNUPGHOME", "")
            ]
            if len(matches) != 1:
                raise AssertionError("signature process did not bind one Node release")
            return matches[0], policy["nodeReleases"][matches[0]]

        def fixed_process(
            executable: str,
            arguments: list[str],
            environment: dict[str, str],
            maximum: int,
            input_bytes: bytes | None = None,
        ) -> bytes:
            process_calls.append((executable, list(arguments)))
            if executable == "/usr/bin/git":
                return git_runner(executable, arguments, environment, maximum, input_bytes)
            if input_bytes is not None or maximum < 1:
                raise AssertionError("unexpected synthetic process input")
            if executable in ("/usr/bin/gpg", "/usr/bin/gpgv"):
                version, release = release_for_environment(environment)
                artifacts = node_artifacts[version]
                if executable == "/usr/bin/gpg" and "--import" in arguments:
                    if pathlib.Path(arguments[-1]).read_bytes() != artifacts["key"]:
                        raise AssertionError("signature verifier imported substituted key bytes")
                    return b""
                if executable == "/usr/bin/gpg" and "--list-keys" in arguments:
                    algorithm = "22" if release["signingAlgorithm"] == "EdDSA" else "1"
                    return (
                        f"pub:-:255:{algorithm}:KEY::::::\n"
                        f"fpr:::::::::{release['signerFingerprint']}:\n"
                    ).encode("ascii")
                if executable == "/usr/bin/gpgv":
                    if (
                        pathlib.Path(arguments[-2]).read_bytes() != artifacts["signature"]
                        or pathlib.Path(arguments[-1]).read_bytes() != artifacts["shasums"]
                    ):
                        raise AssertionError("signature verifier received substituted signed bytes")
                    return (
                        f"[GNUPG:] VALIDSIG {release['signerFingerprint']} 1 2 3\n"
                    ).encode("ascii")
                raise AssertionError("unexpected GPG operation")
            if executable == "/usr/bin/unshare":
                pnpm_positions = [
                    index for index, value in enumerate(arguments)
                    if value.endswith("/package/bin/pnpm.mjs")
                ]
                if len(pnpm_positions) != 1:
                    raise AssertionError("offline command omitted the pinned pnpm entrypoint")
                command = arguments[pnpm_positions[0] + 1:]
                if "store" in command and "add" in command:
                    store_arguments = [
                        value.removeprefix("--store-dir=") for value in command
                        if value.startswith("--store-dir=")
                    ]
                    if len(store_arguments) != 1:
                        raise AssertionError("store add did not bind one store directory")
                    archive_path = pathlib.Path(command[-1])
                    archive = archive_path.read_bytes()
                    store = pathlib.Path(store_arguments[0])
                    files = store / "files"
                    files.mkdir(parents=True, exist_ok=True, mode=0o700)
                    files.chmod(0o700)
                    cached = files / hashlib.sha256(archive).hexdigest()
                    if cached.exists() and cached.read_bytes() != archive:
                        raise AssertionError("synthetic store collision")
                    cached.write_bytes(archive)
                    cached.chmod(0o600)
                    return b""
                if "fetch" in command:
                    if not all(flag in command for flag in (
                        "--offline", "--frozen-lockfile", "--ignore-scripts",
                    )):
                        raise AssertionError("dependency fetch widened its offline contract")
                    return b""
                raise AssertionError("unexpected offline pnpm operation")
            raise AssertionError(f"unexpected producer process: {executable}")

        authorities = {
            name: getattr(module, name)
            for name in (
                "_export_source_objects",
                "_source_evidence_records",
                "_validate_dependency_documents",
                "_install_toolchains",
                "_verified_node_release",
                "_build_dependency_caches",
                "_fetch_registry_package",
                "_verify_retained_node_signatures",
                "_verify_node_signature",
                "_verify_sri",
                "_extract_selected_members",
                "_verify_published_cache",
            )
        }
        module._request_once = request_once
        module._fixed_process = fixed_process
        programs = {
            **parsed["programs"],
            "installedMode": "500",
            "installedVerified": True,
        }
        system_tools = {
            name: {
                **value,
                "installedBytes": 100 + index,
                "installedMode": "755",
                "installedVerified": True,
            }
            for index, (name, value) in enumerate(policy["systemTools"].items())
        }
        result = module._prepare_toolchain(
            parsed, str(source), programs, system_tools,
        )
        if result["prepared"] is not True or result["signaturesVerified"] is not True:
            raise AssertionError("combined producer did not publish verified evidence")
        if any(getattr(module, name) is not function for name, function in authorities.items()):
            raise AssertionError("combined producer replaced an authority function")

        manifest = json.loads((state / "toolchains" / "linux-x64.json").read_bytes())
        for realm, contents in dependency_contents.items():
            observed = {
                record["path"]: record["sha256"]
                for record in manifest["sources"][realm]["dependencyFiles"]
            }
            expected = {
                path: hashlib.sha256(content).hexdigest()
                for path, content in contents.items()
            }
            if observed != expected:
                raise AssertionError("exported dependency bytes did not reach document authority")
            source_evidence = manifest["sources"][realm]
            cache_evidence = manifest["dependencyCaches"][realm]
            historical = parsed["sources"][realm].get(
                "historicalDependencyClosureSha256"
            )
            if (
                source_evidence["historicalDependencyClosureSha256"] != historical
                or cache_evidence["historicalDependencyClosureSha256"] != historical
                or cache_evidence["linuxSourceDependencyClosureSha256"]
                != source_evidence["linuxSourceDependencyClosureSha256"]
                or source_evidence["linuxSourceDependencyClosureSha256"] == historical
            ):
                raise AssertionError("historical, source, and cache commitments were conflated")
            packages = manifest["dependencyCaches"][realm]["packages"]
            if {
                package["url"]: package["sha256"] for package in packages
            } != {
                url: hashlib.sha256(content).hexdigest()
                for url, content in registry_archives.items()
            }:
                raise AssertionError("verified dependency archives did not reach cache evidence")
        if manifest["sourceObjectExport"]["objectCount"] != len(objects):
            raise AssertionError("combined producer omitted an authenticated Git object")
        if sum(1 for executable, _arguments in process_calls if executable == "/usr/bin/gpgv") != 4:
            raise AssertionError("installation and retained detached signatures were not verified")
        offline_calls = [
            arguments for executable, arguments in process_calls
            if executable == "/usr/bin/unshare"
        ]
        if len(offline_calls) != 9:
            raise AssertionError("combined producer did not build and fetch all three caches")
        expected_requests = 8 + 1 + 2 + 6
        if len(request_calls) != expected_requests:
            raise AssertionError(f"unexpected producer request census: {request_calls!r}")
        catalog = json.loads((state / "cache-catalog-v2.json").read_bytes())
        catalog_paths = {entry["path"] for entry in catalog["entries"]}
        if not all(
            f"source-caches/{realm}-linux-source-dependency-closure-sha256.txt"
            in catalog_paths
            for realm in ("g001", "g002", "ptr")
        ):
            raise AssertionError("published catalog omitted authenticated dependency closure")
    print("combined-producer-authority:ok")


if __name__ == "__main__":
    if sys.argv == [sys.argv[0], "request-parser"]:
        request_parser()
    elif sys.argv == [sys.argv[0], "source-export"]:
        source_export()
    elif sys.argv == [sys.argv[0], "real-source-export"]:
        real_source_export()
    elif sys.argv == [sys.argv[0], "receipt-digest-separation"]:
        receipt_digest_separation()
    elif sys.argv == [sys.argv[0], "artifact-boundaries"]:
        artifact_boundaries()
    elif sys.argv == [sys.argv[0], "real-signature-boundary"]:
        real_signature_boundary()
    elif sys.argv == [sys.argv[0], "lock-graph"]:
        lock_graph()
    elif sys.argv == [sys.argv[0], "workspace-layout"]:
        workspace_layout()
    elif sys.argv == [sys.argv[0], "transaction-catalog"]:
        transaction_catalog()
    elif sys.argv == [sys.argv[0], "producer-control-flow"]:
        producer_control_flow()
    elif sys.argv == [sys.argv[0], "combined-producer-authority"]:
        combined_producer_authority()
    else:
        raise SystemExit(2)
