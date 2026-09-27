import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import sharp from 'sharp';

const root = resolve(import.meta.dirname, '../..');
const sourcePath = resolve(root, 'public/images/menu/hegemony-emblem-26e8664b1db0acf3.png');
const sourceHash = '26e8664b1db0acf3e6db443caf46ef13e45fe9de794749e431b7c2e3d6fb8774';
const outputSize = 256;
const expectedOutputHash = '4b5b747efcc13f34499058e1f21cd9958b56eb821d5d676809a6e8296019942a';
const expectedVersions = { sharp: '0.35.4', vips: '8.18.6', png: '1.6.58' };

for (const [name, version] of Object.entries(expectedVersions)) {
  if (sharp.versions[name] !== version) {
    throw new Error(`Menu emblem derivative requires ${name} ${version}.`);
  }
}

sharp.cache(false);
sharp.concurrency(1);
sharp.simd(false);

const source = await readFile(sourcePath);
const actualSourceHash = createHash('sha256').update(source).digest('hex');
if (actualSourceHash !== sourceHash) throw new Error('Menu emblem source changed.');
const metadata = await sharp(source).metadata();
if (metadata.format !== 'png' || metadata.width !== 1254 || metadata.height !== 1254 || !metadata.hasAlpha) {
  throw new Error('Menu emblem source dimensions or transparency changed.');
}

const output = await sharp(source)
  .resize(outputSize, outputSize, { kernel: 'lanczos3' })
  .png({ compressionLevel: 9, palette: false, effort: 10 })
  .toBuffer();
const outputHash = createHash('sha256').update(output).digest('hex');
if (outputHash !== expectedOutputHash) throw new Error('Menu heading emblem derivative changed.');
const outputPath = resolve(root, `public/images/menu/hegemony-emblem-heading-256-${outputHash.slice(0, 16)}.png`);

if (process.argv.includes('--check')) {
  const installed = await readFile(outputPath);
  if (!installed.equals(output)) throw new Error('Menu heading emblem derivative differs from the reviewed output.');
} else {
  try {
    const installed = await readFile(outputPath);
    if (!installed.equals(output)) throw new Error('Installed menu heading emblem differs from the reviewed output.');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
    await writeFile(outputPath, output, { flag: 'wx' });
  }
}

console.log(`Menu heading emblem: ${outputSize}x${outputSize}, ${output.byteLength} bytes, SHA-256 ${outputHash}`);
