import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import sharp from 'sharp';

import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const sourcePath = process.env.WARPKEEP_WORKER_RECORD_ART_SOURCE
  ? resolve(process.env.WARPKEEP_WORKER_RECORD_ART_SOURCE)
  : undefined;

const SOURCE = Object.freeze({
  bytes: 478_174,
  sha256: 'f6ae700affb5ce981074c7952bc81f90b60e2dab947b94867c5394d3e23b4d6d',
  width: 1_024,
  height: 1_024
});

const RUNTIME_ASSET = Object.freeze({
  directory: 'public/images/realm',
  filename: 'hegemony-worker-record.webp',
  bytes: 86_984,
  sha256: 'ff758ecbf520b05ccf0a2fa490bcafa6c564514de5ee56ef5a720fd6da24193e',
  width: 1_024,
  height: 1_024,
  decodedRgbaSha256: '2e77492f76801576adcc9cfe660fa15494123bc43fcd767e005cd5ad95d8b047'
});

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function sourceBytes(path) {
  const before = lstatSync(path, { throwIfNoEntry: false });
  if (!before?.isFile() || before.isSymbolicLink()) {
    throw new Error('Worker record-art source must be a regular non-symbolic file.');
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
  ) throw new Error('Worker record-art source changed while it was read.');
  return bytes;
}

if (!sourcePath) {
  throw new Error(
    'Set WARPKEEP_WORKER_RECORD_ART_SOURCE to the exact owner-supplied transparent PNG.'
  );
}

const input = sourceBytes(sourcePath);
if (input.byteLength !== SOURCE.bytes || sha256(input) !== SOURCE.sha256) {
  throw new Error('Worker record-art source does not match the pinned owner-supplied input.');
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
) throw new Error('Worker record-art source no longer has the transparent PNG contract.');

const output = await sharp(input, {
  failOn: 'warning',
  limitInputPixels: SOURCE.width * SOURCE.height
})
  .webp({ alphaQuality: 100, effort: 6, quality: 92, smartSubsample: true })
  .toBuffer();

if (output.byteLength !== RUNTIME_ASSET.bytes || sha256(output) !== RUNTIME_ASSET.sha256) {
  throw new Error('Worker record-art WebP does not match the pinned deterministic output.');
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
) throw new Error('Worker record-art WebP decoded pixels do not match the reviewed output.');

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: RUNTIME_ASSET.directory,
  label: 'Worker record-art runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: [{
    bytes: output,
    label: 'Worker record-art runtime asset',
    relativePath: RUNTIME_ASSET.filename
  }]
});

console.log(
  `Installed ${RUNTIME_ASSET.filename}: ${RUNTIME_ASSET.bytes} bytes, sha256 ${RUNTIME_ASSET.sha256}`
);
