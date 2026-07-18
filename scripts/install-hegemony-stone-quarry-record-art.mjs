import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const sourcePath = process.env.WARPKEEP_STONE_QUARRY_RECORD_ART_SOURCE
  ? resolve(process.env.WARPKEEP_STONE_QUARRY_RECORD_ART_SOURCE)
  : undefined;

const SOURCE = Object.freeze({
  bytes: 971_515,
  sha256: '4890c895a39d7b00945cf909d78b47a748c0858febbb15314bd224e280b1b956',
  width: 1_254,
  height: 1_254
});

const RUNTIME_ASSET = Object.freeze({
  directory: 'public/images/realm',
  filename: 'hegemony-stone-quarry-record.webp',
  bytes: 134_508,
  sha256: '58725387db6218ccd5f47aea46a22db80161b232e6bb4de6f60c21068efe40fd',
  width: 1_254,
  height: 1_254,
  decodedRgbaSha256: 'dabda3c540e5dff8ab5727c6c13ee4c77f4e188b6c9a2f5bc77c36b56caae019'
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceBytes(path) {
  const before = lstatSync(path, { throwIfNoEntry: false });
  if (!before?.isFile() || before.isSymbolicLink()) {
    throw new Error('Stone Quarry record-art source must be a regular non-symbolic file.');
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path, { throwIfNoEntry: false });
  if (
    !after?.isFile()
    || after.isSymbolicLink()
    || before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || bytes.byteLength !== after.size
  ) throw new Error('Stone Quarry record-art source changed while it was read.');
  return bytes;
}

if (!sourcePath) {
  throw new Error(
    'Set WARPKEEP_STONE_QUARRY_RECORD_ART_SOURCE to the exact chroma-matted alpha PNG.'
  );
}

const input = sourceBytes(sourcePath);
if (input.byteLength !== SOURCE.bytes || sha256(input) !== SOURCE.sha256) {
  throw new Error('Stone Quarry record-art source does not match the approved alpha-matte input.');
}

const inputMetadata = await sharp(input, {
  failOn: 'warning',
  limitInputPixels: SOURCE.width * SOURCE.height
}).metadata();
if (
  inputMetadata.format !== 'png'
  || inputMetadata.width !== SOURCE.width
  || inputMetadata.height !== SOURCE.height
  || inputMetadata.channels !== 4
  || inputMetadata.hasAlpha !== true
) throw new Error('Stone Quarry record-art source no longer has the approved alpha PNG contract.');

const output = await sharp(input, {
  failOn: 'warning',
  limitInputPixels: SOURCE.width * SOURCE.height
})
  .webp({ alphaQuality: 100, effort: 6, quality: 92, smartSubsample: true })
  .toBuffer();

if (output.byteLength !== RUNTIME_ASSET.bytes || sha256(output) !== RUNTIME_ASSET.sha256) {
  throw new Error('Stone Quarry record-art WebP does not match the pinned deterministic runtime output.');
}

const decoded = await sharp(output, {
  failOn: 'warning',
  limitInputPixels: RUNTIME_ASSET.width * RUNTIME_ASSET.height
}).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
if (
  decoded.info.width !== RUNTIME_ASSET.width
  || decoded.info.height !== RUNTIME_ASSET.height
  || decoded.info.channels !== 4
  || sha256(decoded.data) !== RUNTIME_ASSET.decodedRgbaSha256
) throw new Error('Stone Quarry record-art WebP decoded pixels do not match the reviewed runtime output.');

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: RUNTIME_ASSET.directory,
  label: 'Stone Quarry record-art runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: [{
    bytes: output,
    label: 'Stone Quarry record-art runtime asset',
    relativePath: RUNTIME_ASSET.filename
  }]
});

console.log(
  `Installed ${RUNTIME_ASSET.filename}: ${RUNTIME_ASSET.bytes} bytes, sha256 ${RUNTIME_ASSET.sha256}`
);
