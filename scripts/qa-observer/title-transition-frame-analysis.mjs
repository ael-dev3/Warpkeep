import { inflateSync } from 'node:zlib';

export const TITLE_TRANSITION_FRAME_MAXIMUM_BYTES = 16 * 1_024 * 1_024;
const TITLE_TRANSITION_FRAME_MAXIMUM_CHUNKS = 4_096;
const TITLE_TRANSITION_FRAME_MAXIMUM_PIXELS = 20_000_000;

function paethPredictor(left, above, upperLeft) {
  const prediction = left + above - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const aboveDistance = Math.abs(prediction - above);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  return aboveDistance <= upperLeftDistance ? above : upperLeft;
}

function exactViewport(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Number.isSafeInteger(value.width)
    || !Number.isSafeInteger(value.height)
    || value.width < 320
    || value.height < 320
    || value.width > 1_920
    || value.height > 1_200
  ) throw new TypeError('Invalid title transition screenshot viewport.');
  return value;
}

function exactClientPoint(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !Number.isFinite(value.x)
    || !Number.isFinite(value.y)
  ) throw new TypeError('Invalid title transition client point.');
  return value;
}

export function readTitleTransitionPngDimensions(value) {
  if (
    !Buffer.isBuffer(value)
    || value.byteLength < 64
    || value.byteLength > TITLE_TRANSITION_FRAME_MAXIMUM_BYTES
    || !Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
      .equals(value.subarray(0, 8))
    || value.toString('ascii', 12, 16) !== 'IHDR'
  ) throw new TypeError('Invalid title transition screenshot.');
  const width = value.readUInt32BE(16);
  const height = value.readUInt32BE(20);
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width * height > TITLE_TRANSITION_FRAME_MAXIMUM_PIXELS
  ) throw new TypeError('Invalid title transition screenshot.');
  return Object.freeze({ width, height });
}

function decodeTitleTransitionPng(value, viewportValue) {
  const viewport = exactViewport(viewportValue);
  const dimensions = readTitleTransitionPngDimensions(value);
  const scaleX = dimensions.width / viewport.width;
  const scaleY = dimensions.height / viewport.height;
  if (
    scaleX < 0.5
    || scaleX > 4
    || scaleY < 0.5
    || scaleY > 4
    || Math.abs(scaleX - scaleY) > 0.03
  ) throw new TypeError('Title transition screenshot scale mismatched.');

  let cursor = 8;
  let chunkCount = 0;
  let header;
  let ended = false;
  const compressed = [];
  let compressedBytes = 0;
  while (cursor < value.byteLength) {
    if (
      cursor + 12 > value.byteLength
      || chunkCount >= TITLE_TRANSITION_FRAME_MAXIMUM_CHUNKS
    ) throw new TypeError('Invalid title transition screenshot.');
    const length = value.readUInt32BE(cursor);
    const type = value.toString('ascii', cursor + 4, cursor + 8);
    const dataStart = cursor + 8;
    const dataEnd = dataStart + length;
    const next = dataEnd + 4;
    if (
      length > TITLE_TRANSITION_FRAME_MAXIMUM_BYTES
      || next > value.byteLength
    ) throw new TypeError('Invalid title transition screenshot.');
    chunkCount += 1;
    if (type === 'IHDR') {
      if (header || length !== 13) {
        throw new TypeError('Invalid title transition screenshot.');
      }
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
      if (!header || ended) throw new TypeError('Invalid title transition screenshot.');
      compressedBytes += length;
      if (compressedBytes > TITLE_TRANSITION_FRAME_MAXIMUM_BYTES) {
        throw new TypeError('Invalid title transition screenshot.');
      }
      compressed.push(value.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      if (!header || length !== 0 || ended) {
        throw new TypeError('Invalid title transition screenshot.');
      }
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
    || header.width !== dimensions.width
    || header.height !== dimensions.height
    || header.bitDepth !== 8
    || ![2, 6].includes(header.colorType)
    || header.compression !== 0
    || header.filter !== 0
    || header.interlace !== 0
  ) throw new TypeError('Invalid title transition screenshot.');

  const bytesPerPixel = header.colorType === 6 ? 4 : 3;
  const stride = header.width * bytesPerPixel;
  const expectedInflatedBytes = (stride + 1) * header.height;
  const inflated = inflateSync(Buffer.concat(compressed, compressedBytes), {
    maxOutputLength: expectedInflatedBytes,
  });
  if (inflated.byteLength !== expectedInflatedBytes) {
    inflated.fill(0);
    throw new TypeError('Invalid title transition screenshot.');
  }
  const pixels = Buffer.allocUnsafe(stride * header.height);
  let sourceOffset = 0;
  try {
    for (let y = 0; y < header.height; y += 1) {
      const filterType = inflated[sourceOffset++];
      if (filterType > 4) throw new TypeError('Invalid title transition screenshot.');
      const rowOffset = y * stride;
      for (let x = 0; x < stride; x += 1) {
        const left = x >= bytesPerPixel
          ? pixels[rowOffset + x - bytesPerPixel]
          : 0;
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
  } catch (error) {
    pixels.fill(0);
    throw error;
  } finally {
    inflated.fill(0);
  }
  return {
    bytesPerPixel,
    height: header.height,
    pixels,
    scale: (scaleX + scaleY) / 2,
    stride,
    width: header.width,
  };
}

function colourAt(decoded, x, y) {
  const selectedX = Math.max(0, Math.min(decoded.width - 1, Math.round(x)));
  const selectedY = Math.max(0, Math.min(decoded.height - 1, Math.round(y)));
  const offset = selectedY * decoded.stride + selectedX * decoded.bytesPerPixel;
  return [
    decoded.pixels[offset],
    decoded.pixels[offset + 1],
    decoded.pixels[offset + 2],
  ];
}

function colourDifference(left, right, x, y) {
  const leftColour = colourAt(left, x, y);
  const rightColour = colourAt(right, x, y);
  return Math.abs(leftColour[0] - rightColour[0])
    + Math.abs(leftColour[1] - rightColour[1])
    + Math.abs(leftColour[2] - rightColour[2]);
}

function median(values) {
  if (values.length === 0) return Number.NaN;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
}

/**
 * Reduces a last-active title frame to a non-identifying visual gateway
 * centroid. The browser geometry supplies only the bounded search region; the
 * returned point is calculated from the screenshot's dark-violet annulus.
 */
export function analyzeTitleGatewayVisualFrame(
  screenshot,
  viewportValue,
  expectedClientPointValue,
) {
  const viewport = exactViewport(viewportValue);
  const expectedClientPoint = exactClientPoint(expectedClientPointValue);
  if (
    expectedClientPoint.x < 0
    || expectedClientPoint.x > viewport.width
    || expectedClientPoint.y < 0
    || expectedClientPoint.y > viewport.height
  ) throw new TypeError('Title gateway visual point was outside the viewport.');
  const decoded = decodeTitleTransitionPng(screenshot, viewport);
  try {
    const expectedX = expectedClientPoint.x * decoded.scale;
    const expectedY = expectedClientPoint.y * decoded.scale;
    const innerRadius = 7 * decoded.scale;
    const outerRadius = 86 * decoded.scale;
    const minimumX = Math.max(0, Math.floor(expectedX - outerRadius));
    const maximumX = Math.min(decoded.width - 1, Math.ceil(expectedX + outerRadius));
    const minimumY = Math.max(0, Math.floor(expectedY - outerRadius));
    const maximumY = Math.min(decoded.height - 1, Math.ceil(expectedY + outerRadius));
    let weightTotal = 0;
    let weightedX = 0;
    let weightedY = 0;
    let violetSamples = 0;
    let angularMask = 0;
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let x = minimumX; x <= maximumX; x += 1) {
        const dx = x - expectedX;
        const dy = y - expectedY;
        const radius = Math.hypot(dx, dy);
        if (radius < innerRadius || radius > outerRadius) continue;
        const [red, green, blue] = colourAt(decoded, x, y);
        const violet = Math.min(red, blue) - green;
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        if (violet < 7 || luminance < 9 || luminance > 210) continue;
        const radialWeight = Math.max(
          0.15,
          1 - Math.abs(radius - 36 * decoded.scale) / (60 * decoded.scale),
        );
        const weight = violet * radialWeight;
        weightTotal += weight;
        weightedX += x * weight;
        weightedY += y * weight;
        violetSamples += 1;
        const angle = Math.atan2(dy, dx) + Math.PI;
        angularMask |= 1 << Math.min(15, Math.floor(angle / (Math.PI * 2) * 16));
      }
    }
    const angularBins = (angularMask >>> 0)
      .toString(2)
      .replaceAll('0', '')
      .length;
    if (
      violetSamples < Math.max(80, Math.round(30 * decoded.scale ** 2))
      || weightTotal <= 0
      || angularBins < 8
    ) throw new TypeError('Title gateway screenshot lacked visual annulus evidence.');
    const pixelX = weightedX / weightTotal;
    const pixelY = weightedY / weightTotal;
    const deltaPhysicalPixels = Math.hypot(
      pixelX - expectedX,
      pixelY - expectedY,
    );
    return Object.freeze({
      angularBins,
      clientX: pixelX / decoded.scale,
      clientY: pixelY / decoded.scale,
      deltaPhysicalPixels,
      pixelX,
      pixelY,
      screenshotScale: decoded.scale,
      violetSamples,
    });
  } finally {
    decoded.pixels.fill(0);
  }
}

/**
 * Locates the first compositor-visible veil pixels inside the gateway core.
 * This is the strict physical-pixel assertion; the wider boundary fit below
 * supplies complementary shape evidence but is intentionally less sensitive
 * to asymmetric animated scene content.
 */
export function analyzeTitleTransitionFirstVisibleFrame(
  lastActiveScreenshot,
  firstVisibleScreenshot,
  viewportValue,
  expectedClientPointValue,
) {
  const viewport = exactViewport(viewportValue);
  const expectedClientPoint = exactClientPoint(expectedClientPointValue);
  const before = decodeTitleTransitionPng(lastActiveScreenshot, viewport);
  const after = decodeTitleTransitionPng(firstVisibleScreenshot, viewport);
  try {
    if (
      before.width !== after.width
      || before.height !== after.height
      || before.bytesPerPixel !== after.bytesPerPixel
      || Math.abs(before.scale - after.scale) > 0.001
    ) throw new TypeError('Title transition first-visible frame pair mismatched.');
    const expectedX = expectedClientPoint.x * after.scale;
    const expectedY = expectedClientPoint.y * after.scale;
    const searchRadius = 14 * after.scale;
    const minimumX = Math.max(0, Math.floor(expectedX - searchRadius));
    const maximumX = Math.min(after.width - 1, Math.ceil(expectedX + searchRadius));
    const minimumY = Math.max(0, Math.floor(expectedY - searchRadius));
    const maximumY = Math.min(after.height - 1, Math.ceil(expectedY + searchRadius));
    let sampleCount = 0;
    let weightTotal = 0;
    let weightedX = 0;
    let weightedY = 0;
    for (let y = minimumY; y <= maximumY; y += 1) {
      for (let x = minimumX; x <= maximumX; x += 1) {
        if (Math.hypot(x - expectedX, y - expectedY) > searchRadius) continue;
        const [red, green, blue] = colourAt(after, x, y);
        const violet = Math.min(red, blue) - green;
        const difference = colourDifference(before, after, x, y);
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
        if (
          violet < 8
          || difference < 36
          || luminance < 18
          || luminance > 210
        ) continue;
        const weight = difference + violet * 2;
        sampleCount += 1;
        weightTotal += weight;
        weightedX += x * weight;
        weightedY += y * weight;
      }
    }
    if (
      sampleCount < Math.max(8, Math.round(6 * after.scale ** 2))
      || weightTotal <= 0
    ) throw new TypeError(
      'Title transition screenshot lacked first-visible pixel evidence.',
    );
    const pixelX = weightedX / weightTotal;
    const pixelY = weightedY / weightTotal;
    return Object.freeze({
      clientX: pixelX / after.scale,
      clientY: pixelY / after.scale,
      deltaPhysicalPixels: Math.hypot(
        pixelX - expectedX,
        pixelY - expectedY,
      ),
      pixelX,
      pixelY,
      sampleCount,
      screenshotScale: after.scale,
    });
  } finally {
    before.pixels.fill(0);
    after.pixels.fill(0);
  }
}

function radialBoundary(decodedBefore, decodedAfter, centerX, centerY, angle) {
  const scale = decodedAfter.scale;
  const maximumRadius = Math.min(180 * scale, Math.hypot(
    decodedAfter.width,
    decodedAfter.height,
  ));
  const step = Math.max(1, scale);
  let runStart = 0;
  let runLength = 0;
  let bestStart = 0;
  let bestLength = 0;
  let bestEnd = 0;
  for (let radius = 3 * scale; radius <= maximumRadius; radius += step) {
    const x = centerX + Math.cos(angle) * radius;
    const y = centerY + Math.sin(angle) * radius;
    if (
      x < 1
      || x >= decodedAfter.width - 1
      || y < 1
      || y >= decodedAfter.height - 1
    ) break;
    let difference = 0;
    for (let offset = -1; offset <= 1; offset += 1) {
      difference += colourDifference(
        decodedBefore,
        decodedAfter,
        x - Math.sin(angle) * offset,
        y + Math.cos(angle) * offset,
      );
    }
    const changed = difference / 3 >= 68;
    if (changed) {
      if (runLength === 0) runStart = radius;
      runLength += step;
      if (runLength > bestLength) {
        bestStart = runStart;
        bestLength = runLength;
        bestEnd = radius;
      }
    } else {
      runLength = 0;
    }
  }
  return bestLength >= 4 * scale && bestEnd >= 9 * scale
    ? { end: bestEnd, length: bestLength, start: bestStart }
    : undefined;
}

/**
 * Finds the independently rendered veil boundary between two early animation
 * screenshots. Search is intentionally bounded near the measured gateway:
 * the historical half-scale origin cannot pass by contributing unrelated
 * pixels hundreds of CSS pixels away.
 */
export function analyzeTitleTransitionFramePair(
  earlyScreenshot,
  expandedScreenshot,
  viewportValue,
  expectedClientPointValue,
) {
  const viewport = exactViewport(viewportValue);
  const expectedClientPoint = exactClientPoint(expectedClientPointValue);
  const before = decodeTitleTransitionPng(earlyScreenshot, viewport);
  const after = decodeTitleTransitionPng(expandedScreenshot, viewport);
  try {
    if (
      before.width !== after.width
      || before.height !== after.height
      || before.bytesPerPixel !== after.bytesPerPixel
      || Math.abs(before.scale - after.scale) > 0.001
    ) throw new TypeError('Title transition frame pair mismatched.');
    const expectedX = expectedClientPoint.x * after.scale;
    const expectedY = expectedClientPoint.y * after.scale;
    const directionCount = 32;
    let best;
    const searchRadius = Math.max(3, Math.ceil(5 * after.scale));
    for (let yOffset = -searchRadius; yOffset <= searchRadius; yOffset += 1) {
      for (let xOffset = -searchRadius; xOffset <= searchRadius; xOffset += 1) {
        const centerX = expectedX + xOffset;
        const centerY = expectedY + yOffset;
        const boundaries = [];
        for (let index = 0; index < directionCount; index += 1) {
          boundaries.push(radialBoundary(
            before,
            after,
            centerX,
            centerY,
            index / directionCount * Math.PI * 2,
          ));
        }
        const accepted = boundaries.filter(Boolean);
        if (accepted.length < 24) continue;
        const ends = accepted.map((boundary) => boundary.end);
        const medianRadius = median(ends);
        let oppositeError = 0;
        let oppositePairs = 0;
        for (let index = 0; index < directionCount / 2; index += 1) {
          const left = boundaries[index];
          const right = boundaries[index + directionCount / 2];
          if (!left || !right) continue;
          oppositeError += Math.abs(left.end - right.end);
          oppositePairs += 1;
        }
        if (oppositePairs < 10) continue;
        const spread = median(ends.map((radius) => Math.abs(radius - medianRadius)));
        const score = oppositeError / oppositePairs + spread
          + Math.hypot(xOffset, yOffset) * 0.02;
        if (!best || score < best.score) {
          best = {
            acceptedDirections: accepted.length,
            centerX,
            centerY,
            medianRadius,
            oppositeError: oppositeError / oppositePairs,
            score,
            spread,
          };
        }
      }
    }
    if (!best || best.medianRadius < 9 * after.scale) {
      throw new TypeError('Title transition screenshots lacked a coherent veil boundary.');
    }
    const deltaPhysicalPixels = Math.hypot(
      best.centerX - expectedX,
      best.centerY - expectedY,
    );
    return Object.freeze({
      acceptedDirections: best.acceptedDirections,
      boundaryRadiusCssPixels: best.medianRadius / after.scale,
      boundarySpreadPhysicalPixels: best.spread,
      clientX: best.centerX / after.scale,
      clientY: best.centerY / after.scale,
      deltaPhysicalPixels,
      oppositeBoundaryErrorPhysicalPixels: best.oppositeError,
      pixelX: best.centerX,
      pixelY: best.centerY,
      screenshotScale: after.scale,
    });
  } finally {
    before.pixels.fill(0);
    after.pixels.fill(0);
  }
}
