import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import sharp from 'sharp';

import {
  FARCASTER_MINI_APP_EMBED_FILE,
  FARCASTER_MINI_APP_EMBED_SOURCE,
  FARCASTER_MINI_APP_ICON_SOURCE,
  FARCASTER_MINI_APP_REALM_CARD_FILE,
  FARCASTER_MINI_APP_SPLASH_FILE,
} from './farcaster-miniapp-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const publicDirectory = resolve(root, 'public');
const outputDirectory = resolve(root, 'public/images/miniapp');
const stagingDirectory = resolve(
  root,
  `.tmp-miniapp-assets-${process.pid}`,
);
const embedSourcePath = resolve(
  root,
  FARCASTER_MINI_APP_EMBED_SOURCE.path,
);
const iconSourcePath = resolve(
  root,
  FARCASTER_MINI_APP_ICON_SOURCE.path,
);

sharp.cache(false);
sharp.concurrency(1);

async function writeBrandPng(source, destination, width, height) {
  await sharp(source, {
    failOn: 'warning',
    limitInputPixels:
      FARCASTER_MINI_APP_ICON_SOURCE.width
      * FARCASTER_MINI_APP_ICON_SOURCE.height,
  })
    .resize(width, height, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
    })
    .flatten({ background: '#010207' })
    .removeAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: true,
      quality: 100,
      effort: 10,
      progressive: false,
    })
    .toFile(destination);
}

async function readIconSource() {
  const source = await readFile(iconSourcePath);
  const sourceDigest = createHash('sha256').update(source).digest('hex');
  if (sourceDigest !== FARCASTER_MINI_APP_ICON_SOURCE.sha256) {
    throw new Error('Mini App icon source digest does not match its provenance record.');
  }
  const metadata = await sharp(source, {
    failOn: 'warning',
    limitInputPixels:
      FARCASTER_MINI_APP_ICON_SOURCE.width
      * FARCASTER_MINI_APP_ICON_SOURCE.height,
  }).metadata();
  if (
    metadata.format !== 'png'
    || metadata.width !== FARCASTER_MINI_APP_ICON_SOURCE.width
    || metadata.height !== FARCASTER_MINI_APP_ICON_SOURCE.height
    || metadata.hasAlpha
  ) {
    throw new Error('Mini App icon source must be the reviewed 1254x1254 opaque PNG.');
  }
  return source;
}

async function readEmbedSource() {
  const source = await readFile(embedSourcePath);
  const sourceDigest = createHash('sha256').update(source).digest('hex');
  if (sourceDigest !== FARCASTER_MINI_APP_EMBED_SOURCE.sha256) {
    throw new Error('Mini App embed source digest does not match its provenance record.');
  }
  const metadata = await sharp(source, {
    failOn: 'warning',
    limitInputPixels:
      FARCASTER_MINI_APP_EMBED_SOURCE.width
      * FARCASTER_MINI_APP_EMBED_SOURCE.height,
  }).metadata();
  if (
    metadata.format !== 'png'
    || metadata.width !== FARCASTER_MINI_APP_EMBED_SOURCE.width
    || metadata.height !== FARCASTER_MINI_APP_EMBED_SOURCE.height
    || metadata.hasAlpha
  ) {
    throw new Error(
      `Mini App embed source must be the reviewed ${FARCASTER_MINI_APP_EMBED_SOURCE.width}x${FARCASTER_MINI_APP_EMBED_SOURCE.height} opaque PNG.`,
    );
  }
  return source;
}

async function writeEmbedPng(source, destination) {
  await sharp(source, {
    failOn: 'warning',
    limitInputPixels:
      FARCASTER_MINI_APP_EMBED_SOURCE.width
      * FARCASTER_MINI_APP_EMBED_SOURCE.height,
  })
    .resize(1200, 800, {
      fit: 'cover',
      position: 'centre',
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
    })
    .flatten({ background: '#010207' })
    .removeAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
      progressive: false,
    })
    .toFile(destination);
}

async function writeRealmCardPng(source, destination) {
  await sharp(source, {
    failOn: 'warning',
    limitInputPixels:
      FARCASTER_MINI_APP_EMBED_SOURCE.width
      * FARCASTER_MINI_APP_EMBED_SOURCE.height,
  })
    .resize(1200, 800, {
      fit: 'fill',
      kernel: sharp.kernel.lanczos3,
      fastShrinkOnLoad: false,
    })
    // Preserve every authored player label while filling Farcaster's 1.91:1
    // directory/Open Graph frame. The small top inset keeps the highest label
    // inside a practical card safe area without hiding the lower keeps.
    .extract({ left: 0, top: 30, width: 1200, height: 630 })
    .flatten({ background: '#010207' })
    .removeAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: true,
      palette: false,
      progressive: false,
    })
    .toFile(destination);
}

async function digest(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  const brandOutputs = [
    {
      file: FARCASTER_MINI_APP_SPLASH_FILE,
      width: 200,
      height: 200,
      destinationDirectory: outputDirectory,
    },
    {
      file: 'warpkeep-icon-1024-d1b42d20f03c2905.png',
      width: 1024,
      height: 1024,
      destinationDirectory: outputDirectory,
    },
    {
      file: 'favicon-64-7b82ca973fe757f5.png',
      width: 64,
      height: 64,
      destinationDirectory: publicDirectory,
    },
    {
      file: 'apple-touch-icon-180-fe27e8dc1c97cc36.png',
      width: 180,
      height: 180,
      destinationDirectory: publicDirectory,
    },
  ];
  const embedOutput = FARCASTER_MINI_APP_EMBED_FILE;
  const outputFiles = [
    ...brandOutputs,
    {
      file: embedOutput,
      destinationDirectory: outputDirectory,
    },
    {
      file: FARCASTER_MINI_APP_REALM_CARD_FILE,
      destinationDirectory: outputDirectory,
    },
  ];
  try {
    const iconSource = await readIconSource();
    for (const { file, width, height } of brandOutputs) {
      await writeBrandPng(
        iconSource,
        resolve(stagingDirectory, file),
        width,
        height,
      );
    }
    const embedSource = await readEmbedSource();
    await writeEmbedPng(embedSource, resolve(stagingDirectory, embedOutput));
    await writeRealmCardPng(
      embedSource,
      resolve(stagingDirectory, FARCASTER_MINI_APP_REALM_CARD_FILE),
    );
    for (const { file, destinationDirectory } of outputFiles) {
      await mkdir(destinationDirectory, { recursive: true });
      const staged = resolve(stagingDirectory, file);
      const destination = resolve(destinationDirectory, file);
      await rename(staged, destination);
      const fileStat = await stat(destination);
      process.stdout.write(
        `${basename(destination)} ${fileStat.size} bytes sha256 ${await digest(destination)}\n`,
      );
    }
  } finally {
    await rm(stagingDirectory, { recursive: true, force: true });
  }
}

await main().catch(async (error) => {
  await rm(stagingDirectory, { recursive: true, force: true });
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Mini App asset generation failed.'}\n`,
  );
  process.exitCode = 1;
});
