import base64
import hashlib
import importlib.util
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("local_binding_yaml_generator", sys.argv[1])
generator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(generator)


def archive(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as tar:
        for path, body, kind in entries:
            info = tarfile.TarInfo(path)
            info.mode = 0o644
            if kind == "file":
                encoded = body.encode("utf-8")
                info.size = len(encoded)
                tar.addfile(info, io.BytesIO(encoded))
            elif kind == "link":
                info.type = tarfile.SYMTYPE
                info.linkname = "../../outside"
                tar.addfile(info)
    return output.getvalue()


def run_generated(compressed):
    generator.ARCHIVE_BYTES = len(compressed)
    generator.ARCHIVE_SHA256 = hashlib.sha256(compressed).hexdigest()
    generator.ARCHIVE_SRI = "sha512-" + base64.b64encode(hashlib.sha512(compressed).digest()).decode("ascii")
    with tempfile.TemporaryDirectory() as root:
        path = pathlib.Path(root) / "fixture.tgz"
        path.write_bytes(compressed)
        return generator.generate(path)


def required(package=None):
    metadata = package or {
        "name": "yaml", "version": "2.9.0", "type": "commonjs",
        "exports": {".": {"node": "./dist/index.js"}},
    }
    return [
        ("package/package.json", json.dumps(metadata), "file"),
        ("package/dist/index.js", "module.exports = {}\n", "file"),
    ]


class GeneratorBoundaryTest(unittest.TestCase):
    def test_rejects_link_member(self):
        with self.assertRaisesRegex(RuntimeError, "LOCAL_BINDING_YAML_MEMBER_INVALID"):
            run_generated(archive(required() + [("package/dist/escape.js", "", "link")]))

    def test_rejects_traversal_member(self):
        with self.assertRaisesRegex(RuntimeError, "LOCAL_BINDING_YAML_MEMBER_INVALID"):
            run_generated(archive(required() + [("package/../escape.js", "x", "file")]))

    def test_rejects_wrong_package_identity(self):
        metadata = {
            "name": "other", "version": "2.9.0", "type": "commonjs",
            "exports": {".": {"node": "./dist/index.js"}},
        }
        with self.assertRaisesRegex(RuntimeError, "LOCAL_BINDING_YAML_PACKAGE_INVALID"):
            run_generated(archive(required(metadata)))


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]])
