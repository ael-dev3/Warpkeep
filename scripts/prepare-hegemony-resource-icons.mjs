import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  assertNoStaleAtomicFamilyTransactions,
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const outputDirectory = resolve(root, 'public/images/resources');
const SOURCE_PIXELS = 1_254 * 1_254;
const OUTPUT_SIZE = 64;

const expectedToolchain = Object.freeze({
  sharp: '0.35.3',
  vips: '8.18.3',
  png: '1.6.58',
  webp: '1.6.0'
});

const sources = Object.freeze([
  Object.freeze({
    name: 'food',
    path: 'docs/reference/resources/2026-07-17-hegemony-food-icon/hegemony-food-reference.png',
    bytes: 1_849_831,
    sha256: 'd1e295299f710be2b04249d6a96e0abd53ccc6d2bd74560428ee0964f5fff474',
    decodedRgbaSha256: '029d36e311df75a2c54509991aff6184e9febcb7da27137cd5b5b4751d888735',
    alpha: Object.freeze({ transparentPixels: 892_401, partiallyTransparentPixels: 6_426, opaquePixels: 673_689 }),
    output: Object.freeze({
      decodedRgbaSha256: 'c80fc693e2b3bf56836fe7f235e4ee457f8e7203892b72139f3c98b7ee05fcad',
      alpha: Object.freeze({ transparentPixels: 1_989, partiallyTransparentPixels: 723, opaquePixels: 1_384 }),
      visibleBoundsAlpha16: Object.freeze({ minX: 5, minY: 7, maxX: 59, maxY: 55 }),
      png: Object.freeze({ filename: 'hegemony-food-c2034046ead78f5f.png', bytes: 7_567, sha256: 'c2034046ead78f5f23a79ae2fb742352c8c353586d0761e63bf725054bf5d3a4' }),
      webp: Object.freeze({ filename: 'hegemony-food-5c012a7e939f8796.webp', bytes: 6_314, sha256: '5c012a7e939f879698921bfb2d17a1007d5635cf6bfbaa8477205cef2375c509' })
    })
  }),
  Object.freeze({
    name: 'gold',
    path: 'docs/reference/resources/2026-07-17-hegemony-gold-icon/hegemony-gold-reference.png',
    bytes: 1_142_819,
    sha256: '87dddaa91a23f630e86da35da8b5b7300c0ecce9fb850060c0c18b0f2de72f26',
    decodedRgbaSha256: '3842b0b9aaf9882ebbcda84bf3a68d49dff889efcdcf7e8dd200e187de369d52',
    alpha: Object.freeze({ transparentPixels: 963_696, partiallyTransparentPixels: 10_171, opaquePixels: 598_649 }),
    output: Object.freeze({
      decodedRgbaSha256: 'fc8afe04499adf8c0f0e1cb8c95e2cadb302365d9acca4e41ca595aff2caf256',
      alpha: Object.freeze({ transparentPixels: 2_214, partiallyTransparentPixels: 620, opaquePixels: 1_262 }),
      visibleBoundsAlpha16: Object.freeze({ minX: 7, minY: 7, maxX: 58, maxY: 53 }),
      png: Object.freeze({ filename: 'hegemony-gold-3d087ebe1ba2beaf.png', bytes: 6_578, sha256: '3d087ebe1ba2beaf5590b93fcccde998546c4eb1c5e3c124a694a85683241d9a' }),
      webp: Object.freeze({ filename: 'hegemony-gold-522eb5b1f40b5d51.webp', bytes: 5_704, sha256: '522eb5b1f40b5d51395301a9f85b99e9f96008140e6c24d33c38b795546b9689' })
    })
  }),
  Object.freeze({
    name: 'stone',
    path: 'docs/reference/resources/2026-07-17-hegemony-stone-icon/hegemony-stone-reference.png',
    bytes: 1_107_308,
    sha256: 'dcf32bfe714b82c81a9db0d13bff0f176689ff35ff6c0554c3f7c0c8f24fa6e0',
    decodedRgbaSha256: '9ad294ab7d1d95247429041f531e78cec365029fd33f967c73e520ff7cb5f170',
    alpha: Object.freeze({ transparentPixels: 1_009_294, partiallyTransparentPixels: 3_406, opaquePixels: 559_816 }),
    output: Object.freeze({
      decodedRgbaSha256: '97f48ef84d6f768f4e1b2242ae90eaa80e1aeba92de75c8c85b5843b854c0278',
      alpha: Object.freeze({ transparentPixels: 2_360, partiallyTransparentPixels: 555, opaquePixels: 1_181 }),
      visibleBoundsAlpha16: Object.freeze({ minX: 6, minY: 8, maxX: 57, maxY: 55 }),
      png: Object.freeze({ filename: 'hegemony-stone-e23ed963027579c7.png', bytes: 6_149, sha256: 'e23ed963027579c7dd6e465414e3a171aba622d25009af9d4d1077f568fa7f7b' }),
      webp: Object.freeze({ filename: 'hegemony-stone-ac50a538fc202d15.webp', bytes: 4_366, sha256: 'ac50a538fc202d15b378649f4778c88d1a312bced1dd8f3f7cdbb829a50841de' })
    })
  }),
  Object.freeze({
    name: 'wood',
    path: 'docs/reference/resources/2026-07-17-hegemony-wood-icon/hegemony-wood-reference.png',
    bytes: 1_190_014,
    sha256: 'e8b586724afd1082c38c89f86de6d854b86234696b3978633be96152bc17c93a',
    decodedRgbaSha256: 'aeba154e90205840dd0de56fd79c454a09517971ed4064a0a3349e686cb5741c',
    alpha: Object.freeze({ transparentPixels: 1_036_567, partiallyTransparentPixels: 3_018, opaquePixels: 532_931 }),
    output: Object.freeze({
      decodedRgbaSha256: '3686140686a8801ca17fb10a12ed22368a0ad1fab5fc76a2d2b0b73cdb0d8479',
      alpha: Object.freeze({ transparentPixels: 2_450, partiallyTransparentPixels: 510, opaquePixels: 1_136 }),
      visibleBoundsAlpha16: Object.freeze({ minX: 8, minY: 9, maxX: 57, maxY: 52 }),
      png: Object.freeze({ filename: 'hegemony-wood-d992823f7a7f2999.png', bytes: 5_729, sha256: 'd992823f7a7f2999eff03c77f68ab0c24a952ba6018bab4ee86ccd8f2dd3f689' }),
      webp: Object.freeze({ filename: 'hegemony-wood-add35506da245240.webp', bytes: 4_386, sha256: 'add35506da245240c245c8605433108b188b03c94eadab400b2cb9bab956c92c' })
    })
  })
]);

function fail(message) {
  throw new Error(`Hegemony resource icon preparation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactObject(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} changed: ${JSON.stringify(actual)}`);
}

function readPngHeader(bytes, label) {
  assert(bytes.byteLength >= 33, `${label} is too small to be a PNG`);
  assert(bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `${label} has no PNG signature`);
  assert(bytes.readUInt32BE(8) === 13, `${label} has a malformed IHDR length`);
  assert(bytes.subarray(12, 16).toString('ascii') === 'IHDR', `${label} does not begin with IHDR`);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bitDepth: bytes[24],
    colorType: bytes[25],
    compression: bytes[26],
    filter: bytes[27],
    interlace: bytes[28]
  };
}

function alphaProfile(raw) {
  const profile = { transparentPixels: 0, partiallyTransparentPixels: 0, opaquePixels: 0 };
  for (let index = 3; index < raw.length; index += 4) {
    if (raw[index] === 0) profile.transparentPixels += 1;
    else if (raw[index] === 255) profile.opaquePixels += 1;
    else profile.partiallyTransparentPixels += 1;
  }
  return profile;
}

function visibleBounds(raw, width, height, alphaThreshold = 16) {
  const bounds = { minX: width, minY: height, maxX: -1, maxY: -1 };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (raw[(y * width + x) * 4 + 3] < alphaThreshold) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function sourcePipeline(sourceBytes) {
  return sharp(sourceBytes, { failOn: 'warning', limitInputPixels: SOURCE_PIXELS })
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false
    })
    .ensureAlpha();
}

async function verifyDecodedImage(bytes, format, expected, label) {
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: OUTPUT_SIZE ** 2 });
  const metadata = await image.metadata();
  assert(
    metadata.format === format
      && metadata.width === OUTPUT_SIZE
      && metadata.height === OUTPUT_SIZE
      && metadata.channels === 4
      && metadata.depth === 'uchar'
      && metadata.hasAlpha === true
      && (format !== 'png' || metadata.bitsPerSample === 8),
    `${label} decoder metadata changed: ${JSON.stringify(metadata)}`
  );
  const raw = await image.ensureAlpha().raw().toBuffer();
  assert(sha256(raw) === expected.decodedRgbaSha256, `${label} decoded RGBA pixels changed`);
  exactObject(alphaProfile(raw), expected.alpha, `${label} alpha profile`);
  exactObject(
    visibleBounds(raw, OUTPUT_SIZE, OUTPUT_SIZE),
    expected.visibleBoundsAlpha16,
    `${label} visible bounds`
  );
  return raw;
}

async function prepareSource(source) {
  const sourceBytes = readContainedRegularFile({
    root,
    relativePath: source.path,
    label: `${source.name} resource reference master`,
    expectedBytes: source.bytes
  });
  assert(sha256(sourceBytes) === source.sha256, `${source.name} source SHA-256 changed`);
  exactObject(readPngHeader(sourceBytes, `${source.name} source`), {
    width: 1_254,
    height: 1_254,
    bitDepth: 8,
    colorType: 6,
    compression: 0,
    filter: 0,
    interlace: 0
  }, `${source.name} source PNG/IHDR`);

  const sourceImage = sharp(sourceBytes, { failOn: 'warning', limitInputPixels: SOURCE_PIXELS });
  const sourceMetadata = await sourceImage.metadata();
  assert(
    sourceMetadata.format === 'png'
      && sourceMetadata.width === 1_254
      && sourceMetadata.height === 1_254
      && sourceMetadata.channels === 4
      && sourceMetadata.bitsPerSample === 8
      && sourceMetadata.hasAlpha === true
      && sourceMetadata.isProgressive === false,
    `${source.name} source decoder metadata changed: ${JSON.stringify(sourceMetadata)}`
  );
  const sourceRaw = await sourceImage.ensureAlpha().raw().toBuffer();
  assert(sha256(sourceRaw) === source.decodedRgbaSha256, `${source.name} source decoded RGBA pixels changed`);
  exactObject(alphaProfile(sourceRaw), source.alpha, `${source.name} source alpha profile`);

  const [png, webp] = await Promise.all([
    sourcePipeline(sourceBytes).png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
      effort: 10,
      progressive: false
    }).toBuffer(),
    sourcePipeline(sourceBytes).webp({
      lossless: true,
      quality: 100,
      alphaQuality: 100,
      effort: 6,
      preset: 'icon',
      smartSubsample: false,
      exact: true
    }).toBuffer()
  ]);

  const variants = [['png', png], ['webp', webp]];
  const decoded = [];
  for (const [format, bytes] of variants) {
    const expected = source.output[format];
    assert(bytes.byteLength === expected.bytes, `${expected.filename} byte length changed: ${bytes.byteLength}`);
    const outputHash = sha256(bytes);
    assert(outputHash === expected.sha256, `${expected.filename} SHA-256 changed: ${outputHash}`);
    assert(
      expected.filename === `hegemony-${source.name}-${outputHash.slice(0, 16)}.${format}`,
      `${expected.filename} does not carry its output SHA-256 prefix`
    );
    if (format === 'png') {
      exactObject(readPngHeader(bytes, expected.filename), {
        width: OUTPUT_SIZE,
        height: OUTPUT_SIZE,
        bitDepth: 8,
        colorType: 6,
        compression: 0,
        filter: 0,
        interlace: 0
      }, `${expected.filename} PNG/IHDR`);
    }
    decoded.push(await verifyDecodedImage(bytes, format, source.output, expected.filename));
  }
  assert(decoded[0].equals(decoded[1]), `${source.name} PNG and lossless WebP decoded pixels differ`);

  return variants.map(([format, bytes]) => ({
    relativePath: source.output[format].filename,
    bytes,
    label: `${source.name} 64 px ${format.toUpperCase()} runtime icon`
  }));
}

for (const [name, version] of Object.entries(expectedToolchain)) {
  assert(sharp.versions[name] === version, `${name} version must be ${version}, received ${sharp.versions[name]}`);
}
sharp.cache(false);
sharp.concurrency(1);
sharp.simd(false);

const entries = (await Promise.all(sources.map(prepareSource))).flat();
ensureContainedDirectory({
  root,
  relativePath: 'public/images/resources',
  label: 'Hegemony resource runtime directory'
});
assertNoStaleAtomicFamilyTransactions(outputDirectory, 'Hegemony resource runtime directory');

const expectedNames = new Set(entries.map((entry) => entry.relativePath));
const unexpectedEntries = readdirSync(outputDirectory, { withFileTypes: true })
  .filter((entry) => !expectedNames.has(entry.name) || !entry.isFile())
  .map((entry) => entry.name)
  .sort();
assert(unexpectedEntries.length === 0, `runtime directory contains unexpected entries: ${unexpectedEntries.join(', ')}`);

for (const entry of readdirSync(outputDirectory, { withFileTypes: true })) {
  const path = resolve(outputDirectory, entry.name);
  const stat = lstatSync(path);
  assert(stat.isFile() && !stat.isSymbolicLink(), `${entry.name} must be a regular non-symbolic runtime file`);
}

installAtomicFileFamily({ destinationRoot: outputDirectory, entries });

for (const entry of entries) {
  const installed = readContainedRegularFile({
    root: outputDirectory,
    relativePath: entry.relativePath,
    label: `${entry.label} installed output`,
    expectedBytes: entry.bytes.byteLength
  });
  assert(installed.equals(entry.bytes), `${entry.relativePath} changed after atomic installation`);
  console.log(`${entry.relativePath}: ${installed.byteLength} bytes, sha256 ${sha256(installed)}`);
}
console.log('Prepared 8 exact Hegemony resource runtime derivatives from 4 checked-in authorized masters.');
