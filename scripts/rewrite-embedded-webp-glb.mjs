import { createHash } from 'node:crypto';

import sharp from 'sharp';

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const SUPPORTED_REQUIRED_EXTENSIONS = new Set([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);
const SHARP_TOOLCHAIN = Object.freeze({
  sharp: '0.35.3',
  vips: '8.18.3',
  webp: '1.6.0'
});

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function align4(value) {
  return (value + 3) & ~3;
}

function asBuffer(input, label) {
  if (!Buffer.isBuffer(input) && !(ArrayBuffer.isView(input) && input.BYTES_PER_ELEMENT === 1)) {
    fail(label, 'input must be a Uint8Array.');
  }
  return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
}

function exactUnsignedInteger(value, label, detail, allowZero = true) {
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    fail(label, `${detail} must be a safe ${allowZero ? 'non-negative' : 'positive'} integer.`);
  }
  return value;
}

function rangeKey(offset, length) {
  return `${offset}:${length}`;
}

function validateRange(offset, length, bufferLength, label, detail) {
  exactUnsignedInteger(offset, label, `${detail} byteOffset`);
  exactUnsignedInteger(length, label, `${detail} byteLength`, false);
  if (offset + length > bufferLength) {
    fail(label, `${detail} exceeds the physical GLB buffer.`);
  }
}

function parseGlb(input, label) {
  const bytes = asBuffer(input, label);
  if (bytes.byteLength < 20) fail(label, 'container is too short for a GLB.');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) fail(label, 'magic is not glTF.');
  if (bytes.readUInt32LE(4) !== GLB_VERSION) fail(label, 'version is not glTF 2.0.');
  if (bytes.readUInt32LE(8) !== bytes.byteLength) {
    fail(label, 'declared GLB length does not match the input length.');
  }

  const chunks = [];
  let cursor = 12;
  while (cursor < bytes.byteLength) {
    if (cursor + 8 > bytes.byteLength) fail(label, 'truncated GLB chunk header.');
    const length = bytes.readUInt32LE(cursor);
    const type = bytes.readUInt32LE(cursor + 4);
    if (length % 4 !== 0) fail(label, 'GLB chunk length is not four-byte aligned.');
    const start = cursor + 8;
    const end = start + length;
    if (end > bytes.byteLength) fail(label, 'GLB chunk exceeds the declared container.');
    chunks.push({ type, start, end, length });
    cursor = end;
  }
  if (cursor !== bytes.byteLength) fail(label, 'GLB chunks do not exactly fill the container.');
  if (
    chunks.length !== 2
    || chunks[0].type !== JSON_CHUNK_TYPE
    || chunks[1].type !== BIN_CHUNK_TYPE
  ) {
    fail(label, 'expected exactly one JSON chunk followed by one BIN chunk.');
  }

  const jsonText = bytes
    .subarray(chunks[0].start, chunks[0].end)
    .toString('utf8')
    .replace(/[\u0000\u0020\t\r\n]+$/u, '');
  let json;
  try {
    json = JSON.parse(jsonText);
  } catch (error) {
    fail(label, `JSON chunk is invalid (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    fail(label, 'JSON chunk root must be an object.');
  }

  const requiredExtensions = json.extensionsRequired ?? [];
  if (!Array.isArray(requiredExtensions)) fail(label, 'extensionsRequired must be an array.');
  for (const extension of requiredExtensions) {
    if (!SUPPORTED_REQUIRED_EXTENSIONS.has(extension)) {
      fail(label, `unsupported required extension ${JSON.stringify(extension)} could hide physical-buffer references.`);
    }
  }

  if (!Array.isArray(json.buffers) || !json.buffers[0]) {
    fail(label, 'physical buffer 0 is missing.');
  }
  const physicalLength = exactUnsignedInteger(
    json.buffers[0].byteLength,
    label,
    'buffers[0].byteLength',
    false
  );
  const binaryChunk = bytes.subarray(chunks[1].start, chunks[1].end);
  if (physicalLength > binaryChunk.byteLength || binaryChunk.byteLength - physicalLength > 3) {
    fail(label, 'physical buffer length does not match the BIN chunk and legal padding.');
  }
  if (binaryChunk.subarray(physicalLength).some((byte) => byte !== 0)) {
    fail(label, 'BIN chunk padding is not zero-filled.');
  }
  return { bytes, json, binaryChunk: binaryChunk.subarray(0, physicalLength) };
}

function resolveTextureImageIndex(json, textureInfo) {
  const textureIndex = textureInfo?.index;
  if (!Number.isSafeInteger(textureIndex) || textureIndex < 0) return undefined;
  const texture = json.textures?.[textureIndex];
  const imageIndex = texture?.extensions?.EXT_texture_webp?.source ?? texture?.source;
  return Number.isSafeInteger(imageIndex) && imageIndex >= 0 ? imageIndex : undefined;
}

function imageRoles(json) {
  const roles = new Map();
  const add = (imageIndex, role) => {
    if (imageIndex === undefined) return;
    const current = roles.get(imageIndex);
    if (current && current !== role) roles.set(imageIndex, 'mixed');
    else roles.set(imageIndex, role);
  };
  for (const material of json.materials ?? []) {
    add(resolveTextureImageIndex(json, material?.normalTexture), 'normal');
    add(resolveTextureImageIndex(json, material?.pbrMetallicRoughness?.baseColorTexture), 'baseColor');
  }
  for (const [index, image] of (json.images ?? []).entries()) {
    if (!roles.has(index) && /normal/iu.test(String(image?.name ?? ''))) roles.set(index, 'normal');
    if (!roles.has(index) && /base.?color|albedo|diffuse/iu.test(String(image?.name ?? ''))) {
      roles.set(index, 'baseColor');
    }
  }
  return roles;
}

function collectPhysicalRanges(parsed, label) {
  const { json, binaryChunk } = parsed;
  if (!Array.isArray(json.bufferViews)) fail(label, 'bufferViews must be an array.');
  const ranges = new Map();
  const addRange = (offset, length, reference) => {
    validateRange(offset, length, binaryChunk.byteLength, label, reference.detail);
    const key = rangeKey(offset, length);
    const existing = ranges.get(key);
    if (existing) existing.references.push(reference);
    else ranges.set(key, { key, originalOffset: offset, originalLength: length, references: [reference] });
  };

  for (const [viewIndex, view] of json.bufferViews.entries()) {
    if (!view || typeof view !== 'object') fail(label, `bufferViews[${viewIndex}] is invalid.`);
    const extensionNames = Object.keys(view.extensions ?? {});
    if (extensionNames.some((name) => name !== 'EXT_meshopt_compression')) {
      fail(label, `bufferViews[${viewIndex}] has an unsupported extension.`);
    }
    if (view.buffer === 0) {
      addRange(view.byteOffset ?? 0, view.byteLength, {
        kind: 'bufferView',
        index: viewIndex,
        detail: `bufferViews[${viewIndex}]`
      });
    }
    const meshopt = view.extensions?.EXT_meshopt_compression;
    if (meshopt?.buffer === 0) {
      addRange(meshopt.byteOffset ?? 0, meshopt.byteLength, {
        kind: 'meshopt',
        index: viewIndex,
        detail: `bufferViews[${viewIndex}].extensions.EXT_meshopt_compression`
      });
    }
  }

  const sorted = [...ranges.values()].sort((left, right) => left.originalOffset - right.originalOffset);
  let previousEnd = 0;
  for (const range of sorted) {
    if (range.originalOffset < previousEnd) {
      fail(label, `physical ranges overlap near byte ${range.originalOffset}.`);
    }
    const gap = binaryChunk.subarray(previousEnd, range.originalOffset);
    if (gap.some((byte) => byte !== 0)) {
      fail(label, `unreferenced physical-buffer bytes near byte ${previousEnd} are not zero padding.`);
    }
    previousEnd = range.originalOffset + range.originalLength;
  }
  if (binaryChunk.subarray(previousEnd).some((byte) => byte !== 0)) {
    fail(label, `unreferenced physical-buffer bytes near byte ${previousEnd} are not zero padding.`);
  }
  return { ranges, sorted };
}

function collectEmbeddedWebp(parsed, physicalRanges, label) {
  const { json, binaryChunk } = parsed;
  if (!Array.isArray(json.images) || json.images.length === 0) {
    fail(label, 'no embedded images were found.');
  }
  const roles = imageRoles(json);
  const images = [];
  for (const [imageIndex, image] of json.images.entries()) {
    if (image?.mimeType !== 'image/webp' || !Number.isSafeInteger(image.bufferView)) {
      fail(label, `images[${imageIndex}] must be an embedded image/webp bufferView.`);
    }
    const view = json.bufferViews[image.bufferView];
    if (!view || view.buffer !== 0) {
      fail(label, `images[${imageIndex}] is not stored directly in physical buffer 0.`);
    }
    const offset = view.byteOffset ?? 0;
    const length = view.byteLength;
    const key = rangeKey(offset, length);
    const range = physicalRanges.ranges.get(key);
    if (!range) fail(label, `images[${imageIndex}] physical range is missing.`);
    if (range.references.some((reference) => reference.kind !== 'bufferView')) {
      fail(label, `images[${imageIndex}] overlaps a compressed geometry payload.`);
    }
    const bytes = binaryChunk.subarray(offset, offset + length);
    if (
      bytes.byteLength < 16
      || bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
      || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
    ) {
      fail(label, `images[${imageIndex}] is not an intact WebP payload.`);
    }
    images.push({
      index: imageIndex,
      name: typeof image.name === 'string' ? image.name : undefined,
      role: roles.get(imageIndex) ?? 'generic',
      bufferView: image.bufferView,
      range,
      bytes
    });
  }
  return images;
}

async function inspectImage(image, label) {
  let metadata;
  try {
    metadata = await sharp(image.bytes, { failOn: 'error', limitInputPixels: 64 * 1024 * 1024 }).metadata();
  } catch (error) {
    fail(label, `images[${image.index}] cannot be decoded (${error instanceof Error ? error.message : String(error)}).`);
  }
  if (
    metadata.format !== 'webp'
    || !Number.isSafeInteger(metadata.width)
    || !Number.isSafeInteger(metadata.height)
  ) {
    fail(label, `images[${image.index}] does not decode as a bounded WebP image.`);
  }
  return Object.freeze({
    index: image.index,
    name: image.name,
    role: image.role,
    bytes: image.bytes.byteLength,
    sha256: sha256(image.bytes),
    width: metadata.width,
    height: metadata.height
  });
}

function assertSharpToolchain(label) {
  for (const [dependency, expected] of Object.entries(SHARP_TOOLCHAIN)) {
    if (sharp.versions[dependency] !== expected) {
      fail(label, `expected ${dependency} ${expected}, received ${String(sharp.versions[dependency])}.`);
    }
  }
}

export async function inspectEmbeddedWebpGlb(input, options = {}) {
  const label = options.label ?? 'embedded WebP GLB';
  const parsed = parseGlb(input, label);
  const physicalRanges = collectPhysicalRanges(parsed, label);
  const images = collectEmbeddedWebp(parsed, physicalRanges, label);
  return Object.freeze({
    images: Object.freeze(await Promise.all(images.map((image) => inspectImage(image, label))))
  });
}

export async function rewriteEmbeddedWebpGlb(input, options) {
  const label = options?.label ?? 'embedded WebP GLB rewrite';
  const targetSize = exactUnsignedInteger(options?.targetSize, label, 'targetSize', false);
  if (targetSize > 8_192) fail(label, 'targetSize exceeds the 8192-pixel preparation cap.');
  assertSharpToolchain(label);

  const parsed = parseGlb(input, label);
  const physicalRanges = collectPhysicalRanges(parsed, label);
  const images = collectEmbeddedWebp(parsed, physicalRanges, label);
  const replacements = new Map();
  const originalImages = [];

  for (const image of images) {
    const inspected = await inspectImage(image, label);
    originalImages.push(inspected);
    if (inspected.width !== inspected.height) {
      fail(label, `images[${image.index}] must be a square atlas.`);
    }
    if (inspected.width < targetSize) {
      fail(label, `images[${image.index}] would require an unsafe upscale to ${targetSize}px.`);
    }
    let replacement = image.bytes;
    if (inspected.width !== targetSize) {
      const pipeline = sharp(image.bytes, {
        failOn: 'error',
        limitInputPixels: 64 * 1024 * 1024
      }).resize(targetSize, targetSize, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3
      });
      replacement = image.role === 'normal'
        ? await pipeline.webp({ lossless: true, effort: 6 }).toBuffer()
        : await pipeline.webp({ quality: 90, effort: 6, smartSubsample: true }).toBuffer();
    }
    replacements.set(image.range.key, replacement);
  }

  const outputSegments = [];
  const outputRangeByKey = new Map();
  let outputLength = 0;
  for (const range of physicalRanges.sorted) {
    outputLength = align4(outputLength);
    const source = parsed.binaryChunk.subarray(
      range.originalOffset,
      range.originalOffset + range.originalLength
    );
    const replacement = replacements.get(range.key) ?? source;
    const outputRange = {
      outputOffset: outputLength,
      outputLength: replacement.byteLength,
      replacement
    };
    outputRangeByKey.set(range.key, outputRange);
    outputSegments.push(outputRange);
    outputLength += replacement.byteLength;
  }
  outputLength = align4(outputLength);
  const outputBinary = Buffer.alloc(outputLength);
  for (const segment of outputSegments) segment.replacement.copy(outputBinary, segment.outputOffset);

  for (const range of physicalRanges.sorted) {
    const outputRange = outputRangeByKey.get(range.key);
    for (const reference of range.references) {
      const view = parsed.json.bufferViews[reference.index];
      if (reference.kind === 'bufferView') {
        view.byteOffset = outputRange.outputOffset;
        view.byteLength = outputRange.outputLength;
      } else {
        const meshopt = view.extensions.EXT_meshopt_compression;
        meshopt.byteOffset = outputRange.outputOffset;
        meshopt.byteLength = outputRange.outputLength;
      }
    }
  }
  parsed.json.buffers[0].byteLength = outputBinary.byteLength;
  for (const material of parsed.json.materials ?? []) {
    if (Number.isFinite(material?.extras?.wk_atlas_size)) {
      material.extras.wk_atlas_size = targetSize;
    }
  }

  const jsonPayload = Buffer.from(JSON.stringify(parsed.json), 'utf8');
  const paddedJson = Buffer.alloc(align4(jsonPayload.byteLength), 0x20);
  jsonPayload.copy(paddedJson);
  const totalLength = 12 + 8 + paddedJson.byteLength + 8 + outputBinary.byteLength;
  const output = Buffer.alloc(totalLength);
  output.writeUInt32LE(GLB_MAGIC, 0);
  output.writeUInt32LE(GLB_VERSION, 4);
  output.writeUInt32LE(totalLength, 8);
  output.writeUInt32LE(paddedJson.byteLength, 12);
  output.writeUInt32LE(JSON_CHUNK_TYPE, 16);
  paddedJson.copy(output, 20);
  const binHeader = 20 + paddedJson.byteLength;
  output.writeUInt32LE(outputBinary.byteLength, binHeader);
  output.writeUInt32LE(BIN_CHUNK_TYPE, binHeader + 4);
  outputBinary.copy(output, binHeader + 8);

  const inspectedOutput = await inspectEmbeddedWebpGlb(output, { label: `${label} output` });
  for (const image of inspectedOutput.images) {
    if (image.width !== targetSize || image.height !== targetSize) {
      fail(label, `images[${image.index}] output is not exactly ${targetSize}x${targetSize}.`);
    }
  }
  const preservedRanges = physicalRanges.sorted
    .filter((range) => !replacements.has(range.key))
    .map((range) => {
      const outputRange = outputRangeByKey.get(range.key);
      const original = parsed.binaryChunk.subarray(
        range.originalOffset,
        range.originalOffset + range.originalLength
      );
      const rewritten = outputBinary.subarray(
        outputRange.outputOffset,
        outputRange.outputOffset + outputRange.outputLength
      );
      const originalHash = sha256(original);
      const outputHash = sha256(rewritten);
      if (originalHash !== outputHash || original.byteLength !== rewritten.byteLength) {
        fail(label, `non-image physical range at ${range.originalOffset} changed.`);
      }
      return Object.freeze({
        originalOffset: range.originalOffset,
        outputOffset: outputRange.outputOffset,
        bytes: original.byteLength,
        sha256: originalHash
      });
    });

  return Object.freeze({
    bytes: output,
    originalImages: Object.freeze(originalImages),
    images: inspectedOutput.images,
    preservedRanges: Object.freeze(preservedRanges),
    toolchain: SHARP_TOOLCHAIN
  });
}

export { SHARP_TOOLCHAIN };
