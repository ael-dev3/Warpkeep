import { inflateSync } from 'node:zlib';

const SCREENSHOT_MAXIMUM_CHUNKS = 4_096;
const SCREENSHOT_MAXIMUM_BYTES = 8 * 1_024 * 1_024;

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

/**
 * Decodes only the strict PNG shape emitted by the reviewed Chrome screenshot
 * command. Pixels stay in memory for the duration of this call and are reduced
 * immediately to non-identifying aggregate colour evidence.
 */
export function analyzeRenderedWebglPngScreenshot(value, viewport) {
  if (!Buffer.isBuffer(value) || value.byteLength < 64 || value.byteLength > SCREENSHOT_MAXIMUM_BYTES) {
    throw new TypeError('Invalid rendered WebGL screenshot.');
  }
  if (!Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).equals(value.subarray(0, 8))) {
    throw new TypeError('Invalid rendered WebGL screenshot.');
  }
  if (
    !viewport
    || !Number.isSafeInteger(viewport.width)
    || !Number.isSafeInteger(viewport.height)
    || viewport.width < 320
    || viewport.height < 320
    || viewport.width > 1_920
    || viewport.height > 1_080
  ) throw new TypeError('Invalid rendered WebGL screenshot viewport.');

  let cursor = 8;
  let chunkCount = 0;
  let header;
  let ended = false;
  const compressed = [];
  let compressedBytes = 0;
  while (cursor < value.byteLength) {
    if (cursor + 12 > value.byteLength || chunkCount >= SCREENSHOT_MAXIMUM_CHUNKS) {
      throw new TypeError('Invalid rendered WebGL screenshot.');
    }
    const length = value.readUInt32BE(cursor);
    const type = value.toString('ascii', cursor + 4, cursor + 8);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4;
    if (length > SCREENSHOT_MAXIMUM_BYTES || next > value.byteLength) {
      throw new TypeError('Invalid rendered WebGL screenshot.');
    }
    chunkCount += 1;
    if (type === 'IHDR') {
      if (header || length !== 13) throw new TypeError('Invalid rendered WebGL screenshot.');
      header = {
        width: value.readUInt32BE(dataStart),
        height: value.readUInt32BE(dataStart + 4),
        bitDepth: value[dataStart + 8],
        colorType: value[dataStart + 9],
        compression: value[dataStart + 10],
        filter: value[dataStart + 11],
        interlace: value[dataStart + 12],
      };
    } else if (type === 'IDAT') {
      if (!header || ended) throw new TypeError('Invalid rendered WebGL screenshot.');
      compressedBytes += length;
      if (compressedBytes > SCREENSHOT_MAXIMUM_BYTES) {
        throw new TypeError('Invalid rendered WebGL screenshot.');
      }
      compressed.push(value.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (!header || length !== 0 || ended) throw new TypeError('Invalid rendered WebGL screenshot.');
      ended = true;
      cursor = next;
      break;
    }
    cursor = next;
  }
  if (
    !header
    || !ended
    || cursor !== value.byteLength
    || compressed.length === 0
    || header.width !== viewport.width
    || header.height !== viewport.height
    || header.bitDepth !== 8
    || ![2, 6].includes(header.colorType)
    || header.compression !== 0
    || header.filter !== 0
    || header.interlace !== 0
  ) throw new TypeError('Invalid rendered WebGL screenshot.');

  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const stride = header.width * bytesPerPixel;
  const expectedInflatedBytes = (stride + 1) * header.height;
  const inflated = inflateSync(Buffer.concat(compressed, compressedBytes), {
    maxOutputLength: expectedInflatedBytes,
  });
  if (inflated.byteLength !== expectedInflatedBytes) {
    throw new TypeError('Invalid rendered WebGL screenshot.');
  }
  const pixels = Buffer.allocUnsafe(stride * header.height);
  let sourceOffset = 0;
  for (let y = 0; y < header.height; y += 1) {
    const filterType = inflated[sourceOffset++];
    if (filterType > 4) throw new TypeError('Invalid rendered WebGL screenshot.');
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const left = x >= bytesPerPixel ? pixels[rowOffset + x - bytesPerPixel] : 0;
      const above = y > 0 ? pixels[rowOffset + x - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? pixels[rowOffset + x - stride - bytesPerPixel]
        : 0;
      const prediction = filterType === 0 ? 0
        : filterType === 1 ? left
          : filterType === 2 ? above
            : filterType === 3 ? Math.floor((left + above) / 2)
              : paethPredictor(left, above, upperLeft);
      pixels[rowOffset + x] = (inflated[sourceOffset++] + prediction) & 0xff;
    }
  }

  const colours = new Set();
  let minimumLuminance = 255;
  let maximumLuminance = 0;
  let opaqueSamples = 0;
  let sampleCount = 0;
  for (let yStep = 1; yStep <= 9; yStep += 1) {
    const y = Math.floor(header.height * (0.16 + (0.68 * yStep) / 10));
    for (let xStep = 1; xStep <= 13; xStep += 1) {
      const x = Math.floor(header.width * (0.12 + (0.76 * xStep) / 14));
      const offset = y * stride + x * bytesPerPixel;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const alpha = bytesPerPixel === 4 ? pixels[offset + 3] : 255;
      const luminance = Math.round(0.2126 * red + 0.7152 * green + 0.0722 * blue);
      colours.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
      minimumLuminance = Math.min(minimumLuminance, luminance);
      maximumLuminance = Math.max(maximumLuminance, luminance);
      if (alpha >= 250) opaqueSamples += 1;
      sampleCount += 1;
    }
  }
  const result = Object.freeze({
    distinctColourBuckets: colours.size,
    luminanceRange: maximumLuminance - minimumLuminance,
    opaqueSamples,
    sampleCount,
  });
  pixels.fill(0);
  inflated.fill(0);
  if (
    result.sampleCount < 100
    || result.opaqueSamples !== result.sampleCount
    || result.distinctColourBuckets < 8
    || result.luminanceRange < 28
  ) throw new TypeError('Rendered WebGL screenshot did not contain credible visual output.');
  return result;
}
