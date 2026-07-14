import { createHash } from 'node:crypto';
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  stat
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const sourcePath = process.env.WARPKEEP_MARK_SOURCE
  ? resolve(process.env.WARPKEEP_MARK_SOURCE)
  : undefined;
const outputDirectory = process.env.WARPKEEP_MARK_OUTPUT
  ? resolve(process.env.WARPKEEP_MARK_OUTPUT)
  : resolve(root, 'public/images/factions/hegemony/marks');

const expectedToolchain = Object.freeze({
  sharp: '0.35.3',
  vips: '8.18.3',
  png: '1.6.58',
  webp: '1.6.0'
});

const expectedSource = Object.freeze({
  repository: 'ael-dev3/Warpkeep-Assets',
  tag: 'hegemony-mark-2026-07-13',
  attachment: 'hegemony-mark-main-currency-transparent.png',
  bytes: 407_560,
  sha256: '059a61fb40d9e04fdaf27327a921ed5a3174ec48c1549512a71fbbb71aeb2b86',
  width: 500,
  height: 500,
  rawSha256: 'df83c3c55710a395be87e4e7887b7eaf9a108f57afbbd11625b0f53500da2c69',
  alpha: Object.freeze({ transparent: 102_633, partial: 3_333, opaque: 144_034 })
});

const profiles = Object.freeze([
  Object.freeze({
    size: 32,
    rawSha256: '99d72e10d0789a0b48555042bf8be247769747eae0c8f2b211e2a2a788c17c44',
    alpha: Object.freeze({ transparent: 283, partial: 276, opaque: 465 }),
    visibleBounds: Object.freeze({ minX: 2, minY: 1, maxX: 29, maxY: 29 }),
    png: Object.freeze({
      filename: 'hegemony-mark-32.png',
      bytes: 2_508,
      sha256: '5a11e27123b287a663d316c2b307e5be6549cee206383dc17c741762df69363e'
    }),
    webp: Object.freeze({
      filename: 'hegemony-mark-32.webp',
      bytes: 2_060,
      sha256: '1ad2faaea36b80bfdd2140ea9d401a49d96766a4bf2d7a439a8dbaac814c1449'
    })
  }),
  Object.freeze({
    size: 64,
    rawSha256: 'a3c512d665111621a588d2dd6d23e455ffc7d9151d24e5a2f57f3f4dc11e0e47',
    alpha: Object.freeze({ transparent: 1_429, partial: 558, opaque: 2_109 }),
    visibleBounds: Object.freeze({ minX: 5, minY: 3, maxX: 58, maxY: 59 }),
    png: Object.freeze({
      filename: 'hegemony-mark-64.png',
      bytes: 8_122,
      sha256: '773cdd9cae90a5030182d50689a3e6322cb628b8732a528d2a3563c9468b2bbb'
    }),
    webp: Object.freeze({
      filename: 'hegemony-mark-64.webp',
      bytes: 6_230,
      sha256: 'f99a96695ed7bf7278b5273d8d6362df70e4b7d2112cdddd22adb1912a08289a'
    })
  }),
  Object.freeze({
    size: 128,
    rawSha256: '2244a7aa823aceaf8ac6aa1f12b1fdc2150c13e843dd9072ae0d4285e0a50012',
    alpha: Object.freeze({ transparent: 6_268, partial: 1_146, opaque: 8_970 }),
    visibleBounds: Object.freeze({ minX: 10, minY: 6, maxX: 117, maxY: 119 }),
    png: Object.freeze({
      filename: 'hegemony-mark-128.png',
      bytes: 28_910,
      sha256: 'e694e586f9fa061c2ebcfe0a852f53f20a9b90794c3bbf5fd31d514a83bf5728'
    }),
    webp: Object.freeze({
      filename: 'hegemony-mark-128.webp',
      bytes: 20_364,
      sha256: '3cbae6967d54a709efb2e9a455040fdb89b5fb1e682ebeddbfda71d39b0b260e'
    })
  }),
  Object.freeze({
    size: 256,
    rawSha256: '9854653d8b357ba08d1ce2a8537885d75f6c869d117be8ac1b71427e9c665a5a',
    alpha: Object.freeze({ transparent: 26_138, partial: 2_368, opaque: 37_030 }),
    visibleBounds: Object.freeze({ minX: 20, minY: 13, maxX: 235, maxY: 239 }),
    png: Object.freeze({
      filename: 'hegemony-mark-256.png',
      bytes: 104_050,
      sha256: '8515b544c231a78f41f80731b74caeeca1cd93dbad6313a424f95fe669a25852'
    }),
    webp: Object.freeze({
      filename: 'hegemony-mark-256.webp',
      bytes: 67_172,
      sha256: '55814b1b150f268426b1a49bffea5a377ca7a62adad526d2e09c48966428dc86'
    })
  })
]);

function fail(message) {
  throw new Error(`Hegemony Mark preparation failed: ${message}`);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
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
  const profile = { transparent: 0, partial: 0, opaque: 0 };
  for (let index = 3; index < raw.length; index += 4) {
    if (raw[index] === 0) profile.transparent += 1;
    else if (raw[index] === 255) profile.opaque += 1;
    else profile.partial += 1;
  }
  return profile;
}

function visibleBounds(raw, size, alphaThreshold = 16) {
  const bounds = { minX: size, minY: size, maxX: -1, maxY: -1 };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (raw[(y * size + x) * 4 + 3] < alphaThreshold) continue;
      bounds.minX = Math.min(bounds.minX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
  }
  return bounds;
}

function exactObject(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} changed: ${JSON.stringify(actual)}`);
}

function sourcePipeline(size) {
  return sharp(sourcePath, { failOn: 'warning', limitInputPixels: 250_000 })
    .resize(size, size, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false
    })
    .ensureAlpha();
}

async function compositeDifference(path, size, background) {
  const [runtime, reference] = await Promise.all([
    sharp(path).flatten({ background }).removeAlpha().raw().toBuffer(),
    sharp(sourcePath, { failOn: 'warning', limitInputPixels: 250_000 })
      .flatten({ background })
      .resize(size, size, {
        fit: 'fill',
        kernel: sharp.kernel.lanczos3,
        fastShrinkOnLoad: false
      })
      .removeAlpha()
      .raw()
      .toBuffer()
  ]);
  let total = 0;
  let maximum = 0;
  for (let index = 0; index < runtime.length; index += 1) {
    const difference = Math.abs(runtime[index] - reference[index]);
    total += difference;
    maximum = Math.max(maximum, difference);
  }
  return { mean: total / runtime.length, maximum };
}

async function verifySource() {
  assert(sourcePath, 'set WARPKEEP_MARK_SOURCE to the private exact release attachment');
  let sourceStat;
  try {
    sourceStat = await stat(sourcePath);
  } catch {
    fail(`source attachment is missing: ${sourcePath}`);
  }
  assert(sourceStat.isFile(), 'source attachment must be an ordinary file');
  const sourceBytes = await readFile(sourcePath);
  assert(sourceBytes.byteLength === expectedSource.bytes, `source byte length changed: ${sourceBytes.byteLength}`);
  assert(sha256(sourceBytes) === expectedSource.sha256, `source SHA-256 changed: ${sha256(sourceBytes)}`);
  exactObject(readPngHeader(sourceBytes, 'source attachment'), {
    width: 500,
    height: 500,
    bitDepth: 8,
    colorType: 6,
    compression: 0,
    filter: 0,
    interlace: 0
  }, 'source PNG/IHDR');

  const source = sharp(sourcePath, { failOn: 'warning', limitInputPixels: 250_000 });
  const metadata = await source.metadata();
  assert(
    metadata.format === 'png'
      && metadata.width === expectedSource.width
      && metadata.height === expectedSource.height
      && metadata.channels === 4
      && metadata.bitsPerSample === 8
      && metadata.hasAlpha === true
      && metadata.isProgressive === false,
    `source decoder metadata changed: ${JSON.stringify(metadata)}`
  );
  const raw = await source.ensureAlpha().raw().toBuffer();
  assert(sha256(raw) === expectedSource.rawSha256, 'source decoded pixels changed');
  exactObject(alphaProfile(raw), expectedSource.alpha, 'source alpha profile');
}

async function verifyVariant(path, format, profile, expected) {
  const bytes = await readFile(path);
  assert(bytes.byteLength === expected.bytes, `${expected.filename} byte length changed: ${bytes.byteLength}`);
  assert(sha256(bytes) === expected.sha256, `${expected.filename} SHA-256 changed: ${sha256(bytes)}`);
  if (format === 'png') {
    exactObject(readPngHeader(bytes, expected.filename), {
      width: profile.size,
      height: profile.size,
      bitDepth: 8,
      colorType: 6,
      compression: 0,
      filter: 0,
      interlace: 0
    }, `${expected.filename} PNG/IHDR`);
  } else {
    assert(bytes.subarray(0, 4).toString('ascii') === 'RIFF', `${expected.filename} has no RIFF signature`);
    assert(bytes.subarray(8, 12).toString('ascii') === 'WEBP', `${expected.filename} has no WEBP signature`);
  }
  const image = sharp(path, { failOn: 'warning', limitInputPixels: profile.size ** 2 });
  const metadata = await image.metadata();
  assert(
    metadata.format === format
      && metadata.width === profile.size
      && metadata.height === profile.size
      && metadata.channels === 4
      && metadata.depth === 'uchar'
      && (format !== 'png' || metadata.bitsPerSample === 8)
      && metadata.hasAlpha === true,
    `${expected.filename} decoder metadata changed: ${JSON.stringify(metadata)}`
  );
  const raw = await image.ensureAlpha().raw().toBuffer();
  assert(sha256(raw) === profile.rawSha256, `${expected.filename} decoded pixels changed`);
  exactObject(alphaProfile(raw), profile.alpha, `${expected.filename} alpha profile`);
  exactObject(visibleBounds(raw, profile.size), profile.visibleBounds, `${expected.filename} visible bounds`);
  return raw;
}

for (const [name, version] of Object.entries(expectedToolchain)) {
  assert(sharp.versions[name] === version, `${name} version must be ${version}, received ${sharp.versions[name]}`);
}
sharp.cache(false);
sharp.concurrency(1);
sharp.simd(false);

await verifySource();
const workspace = await mkdtemp(join(tmpdir(), 'warpkeep-mark-'));
try {
  const prepared = [];
  for (const profile of profiles) {
    const pngPath = join(workspace, profile.png.filename);
    const webpPath = join(workspace, profile.webp.filename);
    await sourcePipeline(profile.size)
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        palette: false,
        effort: 10,
        progressive: false
      })
      .toFile(pngPath);
    await sourcePipeline(profile.size)
      .webp({
        lossless: true,
        quality: 100,
        alphaQuality: 100,
        effort: 6,
        preset: 'icon',
        smartSubsample: false,
        exact: true
      })
      .toFile(webpPath);

    const [pngRaw, webpRaw] = await Promise.all([
      verifyVariant(pngPath, 'png', profile, profile.png),
      verifyVariant(webpPath, 'webp', profile, profile.webp)
    ]);
    assert(pngRaw.equals(webpRaw), `${profile.size}px PNG and lossless WebP pixels differ`);
    for (const background of ['#f4efe5', '#0b0d16']) {
      const difference = await compositeDifference(pngPath, profile.size, background);
      assert(
        difference.mean <= 1.6 && difference.maximum <= 20,
        `${profile.size}px alpha-edge composite changed on ${background}: ${JSON.stringify(difference)}`
      );
    }
    prepared.push([pngPath, profile.png], [webpPath, profile.webp]);
  }

  await mkdir(outputDirectory, { recursive: true });
  for (const [path, expected] of prepared) {
    await copyFile(path, join(outputDirectory, expected.filename));
    console.log(`${expected.filename}: ${expected.bytes} bytes, sha256 ${expected.sha256}`);
  }
  console.log(`Prepared ${prepared.length} Hegemony Mark runtime derivatives without retaining the source attachment.`);
} finally {
  await rm(workspace, { recursive: true, force: true });
}
