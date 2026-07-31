import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

import sharp from 'sharp';

import {
  FARCASTER_MINI_APP_EMBED_SOURCE,
  FARCASTER_MINI_APP_ICON_SOURCE,
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

function shieldMarkup(x, y, size) {
  const scale = size / 64;
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <path d="M8 9h48v35L32 59 8 44Z"
        fill="url(#shieldStone)" stroke="#d2a65c" stroke-width="3"/>
      <path d="M17 16h8l4 22 3-13 3 13 4-22h8l-7 32h-8l-3-11-3 11h-8Z"
        fill="url(#shieldGold)"/>
      <path d="M14 9V4h9v5m18 0V4h9v5"
        fill="none" stroke="#efd28e" stroke-width="3"/>
    </g>`;
}

function sharedDefinitions() {
  return `
    <defs>
      <radialGradient id="night" cx="50%" cy="38%" r="72%">
        <stop offset="0" stop-color="#30213d"/>
        <stop offset="0.45" stop-color="#100b17"/>
        <stop offset="1" stop-color="#010207"/>
      </radialGradient>
      <linearGradient id="shieldStone" x1="8" y1="4" x2="56" y2="60"
        gradientUnits="userSpaceOnUse">
        <stop stop-color="#35233f"/>
        <stop offset="1" stop-color="#08070a"/>
      </linearGradient>
      <linearGradient id="shieldGold" x1="18" y1="14" x2="46" y2="50"
        gradientUnits="userSpaceOnUse">
        <stop stop-color="#f4d99a"/>
        <stop offset="1" stop-color="#a86d30"/>
      </linearGradient>
      <linearGradient id="river" x1="0" y1="0" x2="1" y2="1">
        <stop stop-color="#51356c"/>
        <stop offset="0.5" stop-color="#765190"/>
        <stop offset="1" stop-color="#241a38"/>
      </linearGradient>
      <filter id="softGlow" x="-80%" y="-80%" width="260%" height="260%">
        <feGaussianBlur stdDeviation="18"/>
      </filter>
    </defs>`;
}

function hexGrid(width, height, opacity = 0.12) {
  const radius = 58;
  const stepX = radius * 1.5;
  const stepY = Math.sqrt(3) * radius;
  const paths = [];
  for (let column = -1; column <= Math.ceil(width / stepX) + 1; column += 1) {
    for (let row = -1; row <= Math.ceil(height / stepY) + 1; row += 1) {
      const cx = column * stepX;
      const cy = row * stepY + (column % 2 === 0 ? 0 : stepY / 2);
      const points = Array.from({ length: 6 }, (_, index) => {
        const angle = Math.PI / 180 * (60 * index);
        return `${(cx + radius * Math.cos(angle)).toFixed(2)},${(
          cy + radius * Math.sin(angle)
        ).toFixed(2)}`;
      }).join(' ');
      paths.push(`<polygon points="${points}"/>`);
    }
  }
  return `<g fill="none" stroke="#b58bcb" stroke-width="1.2" opacity="${opacity}">${paths.join('')}</g>`;
}

function castleMarkup(x, y, scale = 1) {
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <ellipse cx="0" cy="70" rx="105" ry="35" fill="#000" opacity=".45"/>
      <path d="M-85 55V-25h28V-70h35v45h44v-45h35v45h28v80Z"
        fill="#09080d" stroke="#8d6a9b" stroke-width="3"/>
      <path d="M-66-70v-22h9v9h11v-9h9v22m79 0v-22h9v9h11v-9h9v22"
        fill="#0d0b12" stroke="#bc8d63" stroke-width="3"/>
      <path d="M-22-25v-38h11v10h22v-10h11v38"
        fill="#121019" stroke="#bc8d63" stroke-width="3"/>
      <path d="M-13 55V18c0-12 6-20 13-20s13 8 13 20v37Z"
        fill="#3b2449" stroke="#cf9e55" stroke-width="3"/>
      <circle cx="-55" cy="8" r="7" fill="#d5a15e"/>
      <circle cx="55" cy="8" r="7" fill="#d5a15e"/>
    </g>`;
}

function squareArtwork(size) {
  const markSize = Math.round(size * 0.56);
  const markOffset = Math.round((size - markSize) / 2);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
      viewBox="0 0 ${size} ${size}">
      ${sharedDefinitions()}
      <rect width="${size}" height="${size}" fill="#010207"/>
      <rect width="${size}" height="${size}" fill="url(#night)"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.33}"
        fill="#7a4e95" opacity=".24" filter="url(#softGlow)"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${size * 0.37}"
        fill="none" stroke="#a879bd" stroke-width="${Math.max(1, size / 250)}"
        opacity=".22"/>
      ${shieldMarkup(markOffset, markOffset, markSize)}
    </svg>
  `);
}

function landscapeArtwork(width, height, variant) {
  const tall = variant === 'embed';
  const horizon = Math.round(height * (tall ? 0.58 : 0.66));
  const shieldSize = tall ? 190 : 160;
  const titleY = tall ? 215 : 170;
  const subtitleY = titleY + (tall ? 78 : 66);
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
      viewBox="0 0 ${width} ${height}">
      ${sharedDefinitions()}
      <rect width="${width}" height="${height}" fill="#010207"/>
      <rect width="${width}" height="${height}" fill="url(#night)"/>
      <circle cx="600" cy="${Math.round(height * .43)}" r="310"
        fill="#72458b" opacity=".16" filter="url(#softGlow)"/>
      ${hexGrid(width, height, tall ? 0.12 : 0.1)}
      <path d="M-100 ${horizon + 55}
        C180 ${horizon - 90} 345 ${horizon + 120} 575 ${horizon + 15}
        S940 ${horizon - 105} 1300 ${horizon + 45}
        L1300 ${height + 80} L-100 ${height + 80}Z"
        fill="#0b1111" opacity=".96"/>
      <path d="M-80 ${horizon + 78}
        C185 ${horizon - 55} 370 ${horizon + 155} 590 ${horizon + 45}
        S960 ${horizon - 70} 1280 ${horizon + 80}"
        fill="none" stroke="url(#river)" stroke-width="${tall ? 58 : 46}"
        opacity=".8"/>
      ${castleMarkup(250, horizon - 16, tall ? .72 : .62)}
      ${castleMarkup(950, horizon + 5, tall ? .62 : .52)}
      ${castleMarkup(600, horizon + 35, tall ? 1.1 : .92)}
      <g opacity=".98">${shieldMarkup(600 - shieldSize / 2, 26, shieldSize)}</g>
      <text x="600" y="${titleY}" text-anchor="middle"
        fill="#f0d59a" font-family="Georgia, 'Times New Roman', serif"
        font-size="${tall ? 86 : 76}" font-weight="700" letter-spacing="10">
        WARPKEEP
      </text>
      <text x="600" y="${subtitleY}" text-anchor="middle"
        fill="#d8c8e2" font-family="Arial, Helvetica, sans-serif"
        font-size="${tall ? 28 : 24}" letter-spacing="7">
        GENESIS 001 · THE REALM IN HAND
      </text>
      <rect x="0" y="${height - 5}" width="${width}" height="5"
        fill="#b27b47" opacity=".65"/>
    </svg>
  `);
}

async function writePng(svg, destination, width, height) {
  await sharp(svg, {
    density: 72,
    failOn: 'warning',
    limitInputPixels: width * height,
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
      palette: false,
      progressive: false,
    })
    .toFile(destination);
}

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
    throw new Error('Mini App embed source must be the reviewed 1402x1122 opaque PNG.');
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

async function digest(path) {
  const bytes = await readFile(path);
  return createHash('sha256').update(bytes).digest('hex');
}

async function main() {
  await rm(stagingDirectory, { recursive: true, force: true });
  await mkdir(stagingDirectory, { recursive: true });
  const generatedOutputs = [
    ['warpkeep-splash-200.png', squareArtwork(200), 200, 200],
    [
      'warpkeep-hero-1200x630.png',
      landscapeArtwork(1200, 630, 'hero'),
      1200,
      630,
    ],
    [
      'warpkeep-og-1200x630.png',
      landscapeArtwork(1200, 630, 'hero'),
      1200,
      630,
    ],
  ];
  const brandOutputs = [
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
  const embedOutput = 'warpkeep-embed-1200x800.png';
  const outputFiles = [
    ...generatedOutputs.map(([file]) => ({
      file,
      destinationDirectory: outputDirectory,
    })),
    ...brandOutputs,
    {
      file: embedOutput,
      destinationDirectory: outputDirectory,
    },
  ];
  try {
    for (const [file, svg, width, height] of generatedOutputs) {
      await writePng(svg, resolve(stagingDirectory, file), width, height);
    }
    const iconSource = await readIconSource();
    for (const { file, width, height } of brandOutputs) {
      await writeBrandPng(
        iconSource,
        resolve(stagingDirectory, file),
        width,
        height,
      );
    }
    await writeEmbedPng(
      await readEmbedSource(),
      resolve(stagingDirectory, embedOutput),
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
