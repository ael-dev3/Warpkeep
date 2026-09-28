#!/usr/bin/env python3
"""Install verified, single-material runtime derivatives of the v3 biome trees."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path
from zipfile import ZipFile

from PIL import Image


RELEASE_TAG = "greater-realm-lush-biome-trees-2026-09-28-v3"
RELEASE_ARCHIVE = RELEASE_TAG + ".zip"
RELEASE_SHA256 = "039d2fb736b4a58857b84ba11c321208e1a9e8ca54eb1922d6684237144f547e"
PACKAGE_ROOT = RELEASE_TAG
RUNTIME_SCHEMA = "warpkeep-greater-realm-biome-trees.runtime.v1"
EXPECTED_BIOMES = tuple(range(1, 20)) + (23,)
TARGET_HEIGHTS = {
    1: 0.466, 2: 0.495, 3: 0.536, 4: 0.593, 5: 0.530,
    6: 0.538, 7: 0.295, 8: 0.303, 9: 0.430, 10: 0.430,
    11: 0.460, 12: 0.490, 13: 0.390821, 14: 0.522, 15: 0.524,
    16: 0.425, 17: 0.489, 18: 0.540, 19: 0.490, 23: 0.498,
}
COMPONENTS = {
    5123: ("H", 2),
    5125: ("I", 4),
    5126: ("f", 4),
}
WIDTHS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unpack_glb(payload: bytes) -> tuple[dict, bytes]:
    if len(payload) < 20:
        raise ValueError("truncated GLB")
    magic, version, declared_length = struct.unpack_from("<III", payload)
    if magic != 0x46546C67 or version != 2 or declared_length != len(payload):
        raise ValueError("invalid GLB header")
    json_length, json_kind = struct.unpack_from("<II", payload, 12)
    if json_kind != 0x4E4F534A:
        raise ValueError("missing GLB JSON chunk")
    document = json.loads(payload[20:20 + json_length])
    binary_header = 20 + json_length
    binary_length, binary_kind = struct.unpack_from("<II", payload, binary_header)
    if binary_kind != 0x004E4942 or binary_header + 8 + binary_length != len(payload):
        raise ValueError("invalid GLB binary chunk")
    return document, payload[binary_header + 8:]


def read_accessor(document: dict, binary: bytes, accessor_index: int) -> list[tuple]:
    accessor = document["accessors"][accessor_index]
    view = document["bufferViews"][accessor["bufferView"]]
    fmt, component_size = COMPONENTS[accessor["componentType"]]
    width = WIDTHS[accessor["type"]]
    item_bytes = component_size * width
    stride = view.get("byteStride", item_bytes)
    first = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    rows = []
    for index in range(accessor["count"]):
        values = struct.unpack_from("<" + fmt * width, binary, first + index * stride)
        rows.append(values)
    return rows


def image_bytes(document: dict, binary: bytes, image_index: int) -> bytes:
    image = document["images"][image_index]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    return binary[start:start + view["byteLength"]]


def padded(data: bytes) -> bytes:
    return data + b"\0" * ((-len(data)) % 4)


def build_runtime_glb(source_payload: bytes, source_row: dict) -> tuple[bytes, dict]:
    document, binary = unpack_glb(source_payload)
    primitives = document["meshes"][0]["primitives"]
    if len(primitives) != 2 or [row.get("material") for row in primitives] != [0, 1]:
        raise ValueError(f"{source_row['file']}: expected bark and foliage primitives")
    source_images = [Image.open(__import__("io").BytesIO(image_bytes(document, binary, i))).convert("RGBA")
                     for i in (0, 1)]
    bark_image, foliage_image = source_images
    variant = source_row["variant"]
    if variant == "near":
        if bark_image.size != (256, 512) or foliage_image.size != (512, 512):
            raise ValueError(f"{source_row['file']}: unexpected near atlas dimensions")
        atlas = Image.new("RGBA", (768, 512), (0, 0, 0, 0))
        atlas.paste(foliage_image, (0, 0))
        atlas.paste(bark_image, (512, 0))
        foliage_uv = lambda u, v: (u * (2 / 3), v)
        bark_uv = lambda u, v: (2 / 3 + u / 3, v)
    elif variant == "mobile":
        if bark_image.size != (256, 512) or foliage_image.size != (256, 256):
            raise ValueError(f"{source_row['file']}: unexpected mobile atlas dimensions")
        atlas = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
        atlas.paste(foliage_image, (0, 0))
        atlas.paste(bark_image, (256, 0))
        foliage_uv = lambda u, v: (u / 2, v / 2)
        bark_uv = lambda u, v: (0.5 + u / 2, v)
    else:
        raise ValueError(f"{source_row['file']}: unknown detail variant")
    import io
    # The source atlases are palette PNGs. Preserve a compact 8-bit runtime
    # atlas; alpha remains a dedicated transparent palette entry for leaf-card
    # cutouts, and the source atlases remain byte-identical in the Assets pack.
    packed_atlas = atlas.quantize(
        colors=255,
        method=Image.Quantize.FASTOCTREE,
        dither=Image.Dither.NONE,
    )
    atlas_bytes = io.BytesIO()
    packed_atlas.save(atlas_bytes, format="PNG", optimize=True)
    atlas_png = atlas_bytes.getvalue()
    del source_images

    names = ("POSITION", "NORMAL", "TEXCOORD_0", "COLOR_0")
    merged: dict[str, list[tuple]] = {name: [] for name in names}
    indices: list[int] = []
    vertex_base = 0
    for primitive in primitives:
        attributes = primitive["attributes"]
        rows = {name: read_accessor(document, binary, attributes[name]) for name in names}
        if len({len(rows[name]) for name in names}) != 1:
            raise ValueError(f"{source_row['file']}: vertex attribute counts differ")
        remap = bark_uv if primitive["material"] == 0 else foliage_uv
        rows["TEXCOORD_0"] = [remap(*uv) for uv in rows["TEXCOORD_0"]]
        for name in names:
            merged[name].extend(rows[name])
        local_indices = read_accessor(document, binary, primitive["indices"])
        indices.extend(vertex_base + row[0] for row in local_indices)
        vertex_base += len(rows["POSITION"])
    if len(indices) % 3:
        raise ValueError(f"{source_row['file']}: index buffer is not triangles")

    sections: list[tuple[str, int, int, int, list[tuple]]] = []
    for name, target, component_type, gltf_type in (
        ("POSITION", 34962, 5126, "VEC3"),
        ("NORMAL", 34962, 5126, "VEC3"),
        ("TEXCOORD_0", 34962, 5126, "VEC2"),
        ("COLOR_0", 34962, 5126, "VEC4"),
        ("indices", 34963, 5123, "SCALAR"),
    ):
        if name == "indices":
            rows = [(index,) for index in indices]
        else:
            rows = merged[name]
        sections.append((name, target, component_type, WIDTHS[gltf_type], rows))

    blob = bytearray()
    views = []
    accessors = []
    mins = {"POSITION": [float("inf")] * 3, "indices": [min(indices)]}
    maxs = {"POSITION": [float("-inf")] * 3, "indices": [max(indices)]}
    attributes = {}
    for name, target, component_type, width, rows in sections:
        while len(blob) % 4:
            blob.append(0)
        offset = len(blob)
        if name == "indices":
            packed = struct.pack("<" + "H" * len(indices), *indices)
            accessor_index = len(accessors)
            accessor = {
                "bufferView": len(views), "componentType": component_type,
                "count": len(rows), "type": "SCALAR",
                "min": mins[name], "max": maxs[name],
            }
        else:
            flat = [value for row in rows for value in row]
            packed = struct.pack("<" + "f" * len(flat), *flat)
            accessor_index = len(accessors)
            gltf_type = {2: "VEC2", 3: "VEC3", 4: "VEC4"}[width]
            accessor = {"bufferView": len(views), "componentType": component_type,
                        "count": len(rows), "type": gltf_type}
            if name == "POSITION":
                accessor["min"] = [min(row[axis] for row in rows) for axis in range(3)]
                accessor["max"] = [max(row[axis] for row in rows) for axis in range(3)]
        blob.extend(packed)
        views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(packed), "target": target})
        accessors.append(accessor)
        if name != "indices":
            attributes[name] = accessor_index
        else:
            index_accessor = accessor_index

    while len(blob) % 4:
        blob.append(0)
    image_offset = len(blob)
    blob.extend(atlas_png)
    views.append({"buffer": 0, "byteOffset": image_offset, "byteLength": len(atlas_png)})

    mesh_name = f"{source_row['label']} {variant} v3 runtime"
    output_document = {
        "asset": {"version": "2.0", "generator": "Warpkeep 0.4 v3 runtime atlas installer",
                  "extras": {"sourceRelease": RELEASE_TAG, "sourceFile": source_row["file"],
                             "sourceSha256": source_row["sha256"]}},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0, "name": mesh_name}],
        "meshes": [{"name": mesh_name, "primitives": [{
            "attributes": attributes, "indices": index_accessor,
            "material": 0, "mode": 4,
        }]}],
        "materials": [{"name": f"{source_row['label']} combined painted atlas",
                       "doubleSided": True, "alphaMode": "MASK", "alphaCutoff": 0.42,
                       "pbrMetallicRoughness": {"baseColorTexture": {"index": 0},
                                                "metallicFactor": 0, "roughnessFactor": 0.9}}],
        "textures": [{"sampler": 0, "source": 0}],
        "samplers": [{"magFilter": 9729, "minFilter": 9987,
                       "wrapS": 33071, "wrapT": 33071}],
        "images": [{"bufferView": len(views) - 1, "mimeType": "image/png",
                    "name": f"{source_row['slug']}-{variant}-combined-atlas.png"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(blob)}],
    }
    json_bytes = json.dumps(output_document, separators=(",", ":")).encode("utf-8")
    json_chunk = json_bytes + b" " * ((-len(json_bytes)) % 4)
    binary_chunk = padded(bytes(blob))
    total = 12 + 8 + len(json_chunk) + 8 + len(binary_chunk)
    output = bytearray(struct.pack("<III", 0x46546C67, 2, total))
    output.extend(struct.pack("<II", len(json_chunk), 0x4E4F534A))
    output.extend(json_chunk)
    output.extend(struct.pack("<II", len(binary_chunk), 0x004E4942))
    output.extend(binary_chunk)
    geometry_bytes = sum(view["byteLength"] for view in views[:-1])
    return bytes(output), {"geometryBytes": geometry_bytes, "atlasBytes": len(atlas_png),
                           "triangles": len(indices) // 3,
                           "targetHeight": TARGET_HEIGHTS[source_row["biomeClass"]]}


def write_catalog(entries: list[dict], archive_sha256: str, source_root: Path) -> None:
    groups: dict[int, dict] = {}
    for entry in entries:
        biome = entry["biomeClass"]
        group = groups.setdefault(biome, {"label": entry["label"], "slug": entry["slug"]})
        group[entry["variant"]] = entry
    rows = []
    for biome, group in sorted(groups.items()):
        rows.append(f"  {biome}: Object.freeze({{")
        for variant, profile in (("near", "high"), ("mobile", "mobile")):
            entry = group[variant]
            rows.append(f"    {profile}: Object.freeze({{ path: {json.dumps(entry['path'])},")
            rows.append(f"      bytes: {entry['bytes']}, sha256: {json.dumps(entry['sha256'])},")
            rows.append(f"      triangles: {entry['triangles']}, geometryBytes: {entry['geometryBytes']},")
            rows.append(f"      targetHeight: {entry['targetHeight']}, label: {json.dumps(group['label'])} }}),")
        rows.append("  }),")
    source = "\n".join([
        "/** Generated from the pinned Greater Realm lush biome tree v3 release. */",
        "export const GREATER_REALM_BIOME_TREE_V3_RELEASE = Object.freeze({",
        f"  tag: {json.dumps(RELEASE_TAG)},",
        f"  archiveSha256: {json.dumps(archive_sha256)},",
        "  runtimeSchema: " + json.dumps(RUNTIME_SCHEMA) + ",",
        "});",
        "",
        "export const GREATER_REALM_BIOME_TREE_V3 = Object.freeze({",
        *rows,
        "} as const);",
        "",
    ])
    (source_root / "src/greater-realm/biomeTreeV3Catalog.ts").write_text(source, encoding="utf-8")


def install(archive: Path, runtime_dir: Path, source_root: Path) -> dict:
    archive_bytes = archive.read_bytes()
    archive_sha256 = digest(archive_bytes)
    if archive.name != RELEASE_ARCHIVE or archive_sha256 != RELEASE_SHA256:
        raise ValueError("source archive name or SHA-256 does not match the pinned v3 release")
    with ZipFile(archive) as package:
        names = package.namelist()
        prefix = PACKAGE_ROOT + "/"
        if len(names) != 113 or any(not name.startswith(prefix) for name in names):
            raise ValueError("source archive inventory does not match the pinned 113-entry package")
        manifest_bytes = package.read(prefix + "manifest.json")
        source_manifest = json.loads(manifest_bytes)
        if source_manifest.get("schema") != "warpkeep-original-lush-biome-trees.v3":
            raise ValueError("unexpected v3 model manifest schema")
        models = source_manifest.get("models", [])
        if len(models) != 40 or {row["biomeClass"] for row in models} != set(EXPECTED_BIOMES):
            raise ValueError("v3 source must contain all 20 biome near/mobile model pairs")
        if any(sum(row["biomeClass"] == biome and row["variant"] == variant for row in models) != 1
               for biome in EXPECTED_BIOMES for variant in ("near", "mobile")):
            raise ValueError("v3 source has duplicate or missing biome detail variants")
        runtime_dir.mkdir(parents=True, exist_ok=True)
        entries = []
        for source_row in sorted(models, key=lambda row: (row["biomeClass"], row["variant"])):
            source_name = source_row["file"]
            if not source_name.startswith("models/") or ".." in Path(source_name).parts:
                raise ValueError("unexpected model path in the source inventory")
            source_payload = package.read(prefix + source_name)
            if len(source_payload) != source_row["bytes"] or digest(source_payload) != source_row["sha256"]:
                raise ValueError(f"source model failed its pinned inventory: {source_name}")
            converted, measured = build_runtime_glb(source_payload, source_row)
            if measured["triangles"] != source_row["triangles"]:
                raise ValueError(f"triangle count changed during material merge: {source_name}")
            filename = Path(source_name).name
            output_path = runtime_dir / filename
            output_path.write_bytes(converted)
            entries.append({
                "biomeClass": source_row["biomeClass"],
                "slug": source_row["slug"],
                "label": source_row["label"],
                "variant": source_row["variant"],
                "path": "/" + output_path.relative_to(source_root / "public").as_posix(),
                "bytes": len(converted),
                "sha256": digest(converted),
                "sourceFile": source_name,
                "sourceSha256": source_row["sha256"],
                **measured,
            })
    manifest = {
        "schema": RUNTIME_SCHEMA,
        "sourceRelease": {"tag": RELEASE_TAG, "archiveSha256": archive_sha256},
        "atlasPacking": {"near": "foliage left 512x512, bark right 256x512 in 768x512 atlas",
                         "mobile": "foliage left 256x256, bark right 256x512 in 512x512 atlas",
                         "drawCallsPerTreeBiome": 1},
        "models": entries,
    }
    (runtime_dir / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    write_catalog(entries, archive_sha256, source_root)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    root = args.root.resolve()
    runtime = root / "public/models/greater-realm/biome-trees/v3"
    manifest = install(args.archive.resolve(), runtime, root)
    print(f"Installed {len(manifest['models'])} verified runtime trees from {RELEASE_TAG}.")
    print(f"Runtime GLB bytes: {sum(row['bytes'] for row in manifest['models']):,}.")


if __name__ == "__main__":
    main()
