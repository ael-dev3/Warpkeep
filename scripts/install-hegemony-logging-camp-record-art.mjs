import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const sourcePath = process.env.WARPKEEP_LOGGING_CAMP_RECORD_ART_SOURCE
  ? resolve(process.env.WARPKEEP_LOGGING_CAMP_RECORD_ART_SOURCE)
  : undefined;

// The project retains no source artwork. This is the reviewed, locally-derived
// alpha PNG whose separate provenance record identifies the supplied RGB
// checkerboard source and the narrow visual-use authorization.
const SOURCE = Object.freeze({
  bytes: 1_102_387,
  sha256: 'c714884f676b42dbc376e677b2f70293cc5d663bea96ddff4e37a63504a42c20',
  width: 1_254,
  height: 1_254
});

const RUNTIME_ASSET = Object.freeze({
  directory: 'public/images/realm',
  filename: 'hegemony-logging-camp-record.webp',
  bytes: 177_622,
  sha256: 'fb9d171e423a7bd4bfcce1e68cd3faecb38b4904bc528f720e4283522fca1293',
  width: SOURCE.width,
  height: SOURCE.height,
  decodedRgbaSha256: '5975fb38a6f33e1feb19a0637cb8b3ce100721ce8d8909e426170fa18a95a1ad'
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceBytes(path) {
  const before = lstatSync(path, { throwIfNoEntry: false });
  if (!before?.isFile() || before.isSymbolicLink()) {
    throw new Error('Logging Camp record-art source must be a regular non-symbolic file.');
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
  ) throw new Error('Logging Camp record-art source changed while it was read.');
  return bytes;
}

if (!sourcePath) {
  throw new Error(
    'Set WARPKEEP_LOGGING_CAMP_RECORD_ART_SOURCE to the exact approved alpha-matte PNG.'
  );
}

const input = sourceBytes(sourcePath);
if (input.byteLength !== SOURCE.bytes || sha256(input) !== SOURCE.sha256) {
  throw new Error('Logging Camp record-art source does not match the approved alpha-matte input.');
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
) throw new Error('Logging Camp record-art source no longer has the approved alpha PNG contract.');

const output = await sharp(input, {
  failOn: 'warning',
  limitInputPixels: SOURCE.width * SOURCE.height
})
  .webp({ alphaQuality: 100, effort: 6, quality: 92, smartSubsample: true })
  .toBuffer();

if (output.byteLength !== RUNTIME_ASSET.bytes || sha256(output) !== RUNTIME_ASSET.sha256) {
  throw new Error('Logging Camp record-art WebP does not match the pinned deterministic runtime output.');
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
) throw new Error('Logging Camp record-art WebP decoded pixels do not match the reviewed runtime output.');

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: RUNTIME_ASSET.directory,
  label: 'Logging Camp record-art runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: [{
    bytes: output,
    label: 'Logging Camp record-art runtime asset',
    relativePath: RUNTIME_ASSET.filename
  }]
});

console.log(
  `Installed ${RUNTIME_ASSET.filename}: ${output.byteLength} bytes, sha256 ${sha256(output)}`
);
