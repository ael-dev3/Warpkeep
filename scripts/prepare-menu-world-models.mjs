import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';

import { installAtomicFileFamily } from './atomic-install-file-family.mjs';
import {
  resolveGltfpackBinaryPath,
  resolveGltfpackToolSpec
} from './gltfpack-tool-config.mjs';

const root = resolve(import.meta.dirname, '..');
const sourceDirectory = resolve(root, 'docs/reference/menu/2026-09-27-warplet-castle');
const outputDirectory = resolve(root, 'public/models/menu');
const toolSpec = resolveGltfpackToolSpec();
const binary = resolveGltfpackBinaryPath(root, toolSpec);

const models = Object.freeze([
  Object.freeze({
    source: 'warplet-castle-hegemony-source-v2-c55f2c6c610e4aac.glb',
    sourceBytes: 4_977_796,
    sourceSha256: 'c55f2c6c610e4aacddde58e485156c85629dd0a2eab88fad65652c317ae59088',
    output: 'warplet-castle-hegemony-v2-meshopt-webp-181a847fe386859f.glb',
    outputBytes: 801_300,
    outputSha256: '181a847fe386859f5facc1fa7c2b420a8b4bc4b8434d25ea4ec200c5408062ef',
    args: ['-cc', '-kn', '-km', '-ke', '-tw', '-tq', '10']
  }),
  Object.freeze({
    source: 'warplet-guardian-source-v2-e934a81ae2a210e4.glb',
    sourceBytes: 1_836_344,
    sourceSha256: 'e934a81ae2a210e495675aff99293aebc60cebb1a42603c9d99351db43d9e602',
    output: 'warplet-guardian-v2-meshopt-b959ee1e17e96f00.glb',
    outputBytes: 235_112,
    outputSha256: 'b959ee1e17e96f0088d6d8dbdd1944cb02266b2219f6db6e167138ef30746fe5',
    args: ['-cc', '-kn', '-km', '-ke', '-af', '30']
  })
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExact(bytes, expectedBytes, expectedHash, label) {
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`${label} byte length changed: ${bytes.byteLength}.`);
  }
  const hash = sha256(bytes);
  if (hash !== expectedHash) throw new Error(`${label} hash changed: ${hash}.`);
}

function assertGlb(bytes, label) {
  if (
    bytes.byteLength < 20
    || bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
    || bytes.readUInt32LE(16) !== 0x4e4f534a
  ) throw new Error(`${label} is not an intact glTF 2.0 binary.`);
}

const toolMetadata = lstatSync(binary, { throwIfNoEntry: false });
if (!toolMetadata?.isFile() || toolMetadata.isSymbolicLink()) {
  throw new Error(`Missing regular pinned gltfpack executable at ${binary}. Run "npm run tools:fetch:gltfpack".`);
}
const toolBytes = readFileSync(binary);
assertExact(toolBytes, toolSpec.binaryBytes, toolSpec.binarySha256, `gltfpack ${toolSpec.key}`);

const temporaryDirectory = mkdtempSync(join(tmpdir(), 'warpkeep-menu-models-'));
try {
  const prepared = [];
  for (const model of models) {
    const sourcePath = resolve(sourceDirectory, model.source);
    const sourceStat = lstatSync(sourcePath, { throwIfNoEntry: false });
    if (!sourceStat?.isFile() || sourceStat.isSymbolicLink()) {
      throw new Error(`${model.source} must be a regular non-symbolic source file.`);
    }
    const source = readFileSync(sourcePath);
    assertExact(source, model.sourceBytes, model.sourceSha256, model.source);
    assertGlb(source, model.source);

    const outputPath = join(temporaryDirectory, model.output);
    const result = spawnSync(binary, [
      ...model.args,
      '-i', sourcePath,
      '-o', outputPath
    ], {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
      windowsHide: true
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(`gltfpack failed for ${model.source}: ${String(result.stderr).trim()}`);
    }

    const output = readFileSync(outputPath);
    assertExact(output, model.outputBytes, model.outputSha256, model.output);
    assertGlb(output, model.output);
    prepared.push({ model, output });
  }

  const toInstall = [];
  for (const { model, output } of prepared) {
    const destination = resolve(outputDirectory, model.output);
    const existing = lstatSync(destination, { throwIfNoEntry: false });
    if (existing) {
      if (!existing.isFile() || existing.isSymbolicLink()) {
        throw new Error(`${model.output} exists but is not a regular file.`);
      }
      const current = readFileSync(destination);
      assertExact(current, model.outputBytes, model.outputSha256, `${model.output} existing immutable output`);
      continue;
    }
    toInstall.push({ model, output });
  }

  if (toInstall.length > 0) {
    installAtomicFileFamily({
      destinationRoot: outputDirectory,
      entries: toInstall.map(({ model, output }) => ({
        bytes: output,
        label: `${model.output} immutable menu runtime`,
        relativePath: basename(model.output)
      }))
    });
  }

  for (const { model } of prepared) {
    const installed = readFileSync(resolve(outputDirectory, model.output));
    assertExact(installed, model.outputBytes, model.outputSha256, `${model.output} installed output`);
    console.log(`${model.output}: ${model.outputBytes} bytes, sha256 ${model.outputSha256}`);
  }
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
