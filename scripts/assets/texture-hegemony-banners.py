#!/usr/bin/env python3
"""Weave the supplied Hegemony emblem into Warplet's Watch's existing cloth.

The castle base already has eight violet banner panels in one mesh. This adds UVs
to those vertices and embeds the supplied emblem composited onto an opaque
violet textile field in the existing fabric material. The exact supplied PNG
stays beside the model as the source; its alpha cannot make holes in the cloth.
No plane, plaque, medallion, or other geometry is added. The original castle
POSITION, NORMAL, and index bytes remain untouched.

Run from any directory::

    python3 scripts/assets/texture-hegemony-banners.py

The content-hash filename printed by this script is the asset to reference from
the menu. It uses only the Python standard library.
"""

from __future__ import annotations

import hashlib
import json
import struct
import zlib
from pathlib import Path


REPOSITORY = Path(__file__).resolve().parents[2]
BASE = REPOSITORY / "docs/reference/menu/2026-09-27-warplet-castle/warplet-castle-base-v2-18428728949eea8b.glb"
OUTPUT_DIR = REPOSITORY / "public/models/menu"
EMBLEM = REPOSITORY / "public/images/menu/hegemony-emblem-26e8664b1db0acf3.png"
BASE_SHA256 = "18428728949eea8b593e2920240f467609c925cf78a28eceb60a929aebc6e7c6"
EMBLEM_SHA256 = "26e8664b1db0acf3e6db443caf46ef13e45fe9de794749e431b7c2e3d6fb8774"
VERTICES_PER_BANNER = 48
BANNER_COUNT = 8
FABRIC_SRGB = (105, 69, 142)


def padded(data: bytes, fill: bytes) -> bytes:
    return data + fill * ((-len(data)) % 4)


def png_chunk(name: bytes, payload: bytes) -> bytes:
    checksum = zlib.crc32(name + payload) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + name + payload + struct.pack(">I", checksum)


def paeth(left: int, above: int, upper_left: int) -> int:
    estimate = left + above - upper_left
    distances = (abs(estimate - left), abs(estimate - above), abs(estimate - upper_left))
    return (left, above, upper_left)[distances.index(min(distances))]


def opaque_fabric_png(source: bytes) -> bytes:
    """Composite an exact 8-bit RGBA source onto the original violet cloth.

    A baseColorTexture with alphaMode BLEND would turn all transparent logo
    pixels into holes in the castle's single cloth surface. Flattening here
    makes one opaque fabric texture while retaining anti-aliased emblem edges.
    """
    if source[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Emblem must be a PNG")
    cursor = 8
    compressed = bytearray()
    dimensions = None
    while cursor < len(source):
        chunk_size = struct.unpack_from(">I", source, cursor)[0]
        name = source[cursor + 4 : cursor + 8]
        payload = source[cursor + 8 : cursor + 8 + chunk_size]
        expected_crc = struct.unpack_from(">I", source, cursor + 8 + chunk_size)[0]
        if zlib.crc32(name + payload) & 0xFFFFFFFF != expected_crc:
            raise ValueError(f"Corrupt PNG chunk {name!r}")
        cursor += 12 + chunk_size
        if name == b"IHDR":
            width, height, depth, color, compression, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if (width, height, depth, color, compression, filtering, interlace) != (
                1254, 1254, 8, 6, 0, 0, 0
            ):
                raise ValueError("Expected supplied 1254-square, 8-bit RGBA noninterlaced PNG")
            dimensions = (width, height)
        elif name == b"IDAT":
            compressed.extend(payload)
        elif name == b"IEND":
            break
    if dimensions is None or not compressed:
        raise ValueError("Missing emblem image data")
    width, height = dimensions
    stride = width * 4
    decoded = zlib.decompress(compressed)
    if len(decoded) != height * (stride + 1):
        raise ValueError("Unexpected emblem image data length")
    previous = bytearray(stride)
    flattened = bytearray()
    cursor = 0
    for _row in range(height):
        filter_type = decoded[cursor]
        row = bytearray(decoded[cursor + 1 : cursor + 1 + stride])
        cursor += stride + 1
        if filter_type not in range(5):
            raise ValueError(f"Unsupported PNG row filter {filter_type}")
        for index in range(stride):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            upper_left = previous[index - 4] if index >= 4 else 0
            prediction = (0, left, above, (left + above) // 2, paeth(left, above, upper_left))[filter_type]
            row[index] = (row[index] + prediction) & 255
        flattened.append(0)  # Unfiltered RGB scanline.
        for index in range(0, stride, 4):
            alpha = row[index + 3]
            if alpha == 255:
                flattened.extend(row[index : index + 3])
            elif alpha == 0:
                flattened.extend(FABRIC_SRGB)
            else:
                flattened.extend(
                    (row[index + channel] * alpha + FABRIC_SRGB[channel] * (255 - alpha) + 127) // 255
                    for channel in range(3)
                )
        previous = row
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + png_chunk(b"IHDR", header)
        + png_chunk(b"IDAT", zlib.compress(bytes(flattened), level=9))
        + png_chunk(b"IEND", b"")
    )


def read_verified(path: Path, expected_sha256: str) -> bytes:
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != expected_sha256:
        raise ValueError(f"Unexpected source bytes: {path}")
    return data


def read_glb(data: bytes) -> tuple[dict, bytearray]:
    if len(data) < 28:
        raise ValueError("GLB is too short")
    magic, version, length = struct.unpack_from("<III", data)
    if (magic, version, length) != (0x46546C67, 2, len(data)):
        raise ValueError("Invalid GLB header")
    json_length, json_type = struct.unpack_from("<II", data, 12)
    if json_type != 0x4E4F534A:
        raise ValueError("GLB must begin with JSON chunk")
    document = json.loads(data[20 : 20 + json_length])
    bin_header = 20 + json_length
    bin_length, bin_type = struct.unpack_from("<II", data, bin_header)
    if bin_type != 0x004E4942 or bin_header + 8 + bin_length != len(data):
        raise ValueError("GLB must end with one BIN chunk")
    return document, bytearray(data[bin_header + 8 :])


def banner_positions(document: dict, binary: bytearray, position_accessor: int) -> list[tuple[float, float, float]]:
    accessor = document["accessors"][position_accessor]
    if (accessor["componentType"], accessor["type"], accessor["count"]) != (
        5126, "VEC3", VERTICES_PER_BANNER * BANNER_COUNT
    ):
        raise ValueError("The violet mesh no longer has the expected eight cloth panels")
    view = document["bufferViews"][accessor["bufferView"]]
    offset = view.get("byteOffset", 0) + accessor.get("byteOffset", 0)
    return [
        struct.unpack_from("<fff", binary, offset + 12 * vertex)
        for vertex in range(accessor["count"])
    ]


def banner_uvs(positions: list[tuple[float, float, float]]) -> bytes:
    """Map a square, undistorted crest into each tapered, slightly curved banner.

    The supplied emblem spans about 86% of its transparent square. A square
    1.14 times each panel's width fills the fabric without cutting off the
    gilded wings. Vertical UVs can extend beyond 0..1 onto the top hem and
    pointed tip; the sampler clamps these areas to the opaque violet cloth.
    Rear
    banners reverse U, leaving the sword upright and unmirrored from outside.
    """
    packed = bytearray()
    for banner in range(BANNER_COUNT):
        vertices = positions[
            banner * VERTICES_PER_BANNER : (banner + 1) * VERTICES_PER_BANNER
        ]
        left, right = min(p[0] for p in vertices), max(p[0] for p in vertices)
        bottom, top = min(p[1] for p in vertices), max(p[1] for p in vertices)
        z_center = sum(p[2] for p in vertices) / len(vertices)
        if right - left < 0.8 or top - bottom < 1.6:
            raise ValueError(f"Banner {banner} has changed shape")
        square_size = (right - left) * 1.14
        x_center = (left + right) / 2
        y_center = (bottom + top) / 2
        outward = 1 if z_center > 0 else -1
        for x, y, _z in vertices:
            u = 0.5 + outward * (x - x_center) / square_size
            v = 0.5 + (y_center - y) / square_size
            packed.extend(struct.pack("<ff", u, v))
    return bytes(packed)


def weave_emblem(document: dict, binary: bytearray, source_png: bytes) -> bytes:
    mesh = document["meshes"][8]
    if mesh.get("name") != "Castle / Violet" or len(mesh["primitives"]) != 1:
        raise ValueError("Unexpected castle banner mesh")
    primitive = mesh["primitives"][0]
    if set(primitive["attributes"]) != {"POSITION", "NORMAL", "COLOR_0"}:
        raise ValueError("Unexpected castle banner attributes")
    if document["materials"][primitive["material"]].get("name") != "Castle Violet":
        raise ValueError("Unexpected castle banner material")
    if document.get("textures") or document.get("images") or document.get("samplers"):
        raise ValueError("Expected untextured castle base")

    positions = banner_positions(document, binary, primitive["attributes"]["POSITION"])
    uv_bytes = banner_uvs(positions)
    uv_offset = len(binary)
    binary.extend(uv_bytes)
    document["bufferViews"].append({
        "buffer": 0,
        "byteOffset": uv_offset,
        "byteLength": len(uv_bytes),
        "target": 34962,
    })
    document["accessors"].append({
        "bufferView": len(document["bufferViews"]) - 1,
        "componentType": 5126,
        "count": len(positions),
        "type": "VEC2",
    })
    primitive["attributes"]["TEXCOORD_0"] = len(document["accessors"]) - 1
    # Vertex purple would multiply the PNG's gold into near-black. The exact
    # base COLOR_0 accessor remains in the GLB but is no longer bound to cloth.
    del primitive["attributes"]["COLOR_0"]

    png = opaque_fabric_png(source_png)
    binary.extend(b"\0" * ((-len(binary)) % 4))
    png_offset = len(binary)
    binary.extend(png)
    binary.extend(b"\0" * ((-len(binary)) % 4))
    document["bufferViews"].append({
        "buffer": 0,
        "byteOffset": png_offset,
        "byteLength": len(png),
    })
    document["images"] = [{
        "name": "Hegemony emblem printed into opaque violet banners",
        "bufferView": len(document["bufferViews"]) - 1,
        "mimeType": "image/png",
    }]
    document["samplers"] = [{
        "magFilter": 9729,
        "minFilter": 9987,
        "wrapS": 33071,
        "wrapT": 33071,
    }]
    document["textures"] = [{"sampler": 0, "source": 0}]
    material = document["materials"][primitive["material"]]
    material["pbrMetallicRoughness"]["baseColorTexture"] = {"index": 0, "texCoord": 0}
    document["buffers"][0]["byteLength"] = len(binary)
    document["scenes"][0]["name"] = "Warplet's Watch castle with woven Hegemony banners"

    json_chunk = padded(json.dumps(document, separators=(",", ":"), ensure_ascii=False).encode("utf-8"), b" ")
    bin_chunk = padded(bytes(binary), b"\0")
    return (
        struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(json_chunk) + 8 + len(bin_chunk))
        + struct.pack("<II", len(json_chunk), 0x4E4F534A)
        + json_chunk
        + struct.pack("<II", len(bin_chunk), 0x004E4942)
        + bin_chunk
    )


def main() -> None:
    base = read_verified(BASE, BASE_SHA256)
    emblem = read_verified(EMBLEM, EMBLEM_SHA256)
    document, binary = read_glb(base)
    output = weave_emblem(document, binary, emblem)
    digest = hashlib.sha256(output).hexdigest()
    destination = OUTPUT_DIR / f"warplet-castle-hegemony-v2-{digest[:16]}.glb"
    destination.write_bytes(output)
    print(f"{destination.relative_to(REPOSITORY)}: {len(output)} bytes sha256={digest}")


if __name__ == "__main__":
    main()
