#!/usr/bin/env python3
"""Extract the unchanged castle meshes from Warplet's Watch v2 for FID-based guardians.

The archive's combined GLB has nine top-level `Castle /` meshes followed by the
Warplet skin. This keeps only those nine meshes and their referenced binary data;
it does not rebake positions, materials, vertex colors, or any geometry.
"""

import argparse
import hashlib
import json
import struct
from pathlib import Path

SOURCE_SHA256 = "2ab3f39cae142f0e168242095ce17b9608998d26384d91609c8084956ddae6a6"


def padded(data: bytes, fill: bytes) -> bytes:
    return data + fill * ((-len(data)) % 4)


def read_glb(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256:
        raise ValueError("Source must be the exact verified Warplet's Watch v2 GLB")
    magic, version, total = struct.unpack_from("<III", raw)
    if (magic, version, total) != (0x46546C67, 2, len(raw)):
        raise ValueError("Invalid GLB header")
    json_size, json_type = struct.unpack_from("<II", raw, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("Missing GLB JSON chunk")
    document = json.loads(raw[20 : 20 + json_size])
    bin_size, bin_type = struct.unpack_from("<II", raw, 20 + json_size)
    if bin_type != 0x004E4942:
        raise ValueError("Missing GLB BIN chunk")
    binary = raw[28 + json_size : 28 + json_size + bin_size]
    return document, binary


def derive(document: dict, binary: bytes) -> tuple[dict, bytes]:
    scene = document["scenes"][document["scene"]]
    castle_nodes = [
        index for index in scene["nodes"]
        if document["nodes"][index].get("name", "").startswith("Castle /")
    ]
    if castle_nodes != list(range(9)):
        raise ValueError("Unexpected castle node layout")
    mesh_indices = [document["nodes"][index]["mesh"] for index in castle_nodes]
    if mesh_indices != list(range(9)):
        raise ValueError("Unexpected castle mesh layout")

    meshes = document["meshes"][:9]
    material_indices = sorted({
        primitive["material"] for mesh in meshes for primitive in mesh["primitives"]
    })
    if material_indices != list(range(9)):
        raise ValueError("Unexpected castle material layout")
    accessor_indices = sorted({
        index
        for mesh in meshes
        for primitive in mesh["primitives"]
        for index in [*primitive["attributes"].values(), primitive["indices"]]
    })
    accessors = [document["accessors"][index].copy() for index in accessor_indices]
    accessor_map = {old: new for new, old in enumerate(accessor_indices)}
    for mesh in meshes:
        for primitive in mesh["primitives"]:
            primitive["attributes"] = {
                name: accessor_map[index] for name, index in primitive["attributes"].items()
            }
            primitive["indices"] = accessor_map[primitive["indices"]]

    view_indices = sorted({accessor["bufferView"] for accessor in accessors})
    view_map = {old: new for new, old in enumerate(view_indices)}
    new_views = []
    new_binary = bytearray()
    for old_index in view_indices:
        view = document["bufferViews"][old_index].copy()
        if view.get("buffer", 0) != 0:
            raise ValueError("Unexpected extra buffer")
        start = view["byteOffset"]
        end = start + view["byteLength"]
        view["byteOffset"] = len(new_binary)
        new_binary.extend(binary[start:end])
        new_binary.extend(b"\0" * ((-len(new_binary)) % 4))
        new_views.append(view)
    for accessor in accessors:
        accessor["bufferView"] = view_map[accessor["bufferView"]]

    base = {
        "asset": document["asset"],
        "scene": 0,
        "scenes": [{"name": "Warplet's Watch castle base", "nodes": list(range(9))}],
        "nodes": [document["nodes"][index] for index in castle_nodes],
        "materials": document["materials"][:9],
        "meshes": meshes,
        "accessors": accessors,
        "bufferViews": new_views,
        "buffers": [{"byteLength": len(new_binary)}],
    }
    return base, bytes(new_binary)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    document, binary = read_glb(args.source)
    base, new_binary = derive(document, binary)
    json_chunk = padded(json.dumps(base, separators=(",", ":"), ensure_ascii=False).encode(), b" ")
    bin_chunk = padded(new_binary, b"\0")
    total = 12 + 8 + len(json_chunk) + 8 + len(bin_chunk)
    output = (
        struct.pack("<III", 0x46546C67, 2, total)
        + struct.pack("<II", len(json_chunk), 0x4E4F534A)
        + json_chunk
        + struct.pack("<II", len(bin_chunk), 0x004E4942)
        + bin_chunk
    )
    args.destination.parent.mkdir(parents=True, exist_ok=True)
    args.destination.write_bytes(output)
    print(f"{args.destination}: {len(output)} bytes sha256={hashlib.sha256(output).hexdigest()}")


if __name__ == "__main__":
    main()
