import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyOperationBundleMaterializedGraph } from '../../scripts/local-operation-bundle-runtime-core.mjs';

const root = mkdtempSync(join(tmpdir(), 'warpkeep-operation-owner-check-'));
try {
  mkdirSync(join(root, 'scripts'));
  const path = join(root, 'scripts/entry.mjs');
  const body = 'export const value = 1;\n';
  writeFileSync(path, body);
  const manifest = [{ path: 'scripts/entry.mjs', byteLength: Buffer.byteLength(body), sha256: createHash('sha256').update(body).digest('hex') }];
  const uid = statSync(path).uid;
  if (process.platform === 'win32' || uid === 1000) {
    assert.doesNotThrow(() => verifyOperationBundleMaterializedGraph(root, manifest));
    writeFileSync(path, 'export const value = 2;\n');
    assert.throws(() => verifyOperationBundleMaterializedGraph(root, manifest), /OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED/);
    process.stdout.write(JSON.stringify({ platform: process.platform, uid, acceptedOwner: true, mutationRejected: true }) + '\n');
  } else {
    assert.throws(() => verifyOperationBundleMaterializedGraph(root, manifest), /OPERATION_BUNDLE_RUNTIME_SOURCE_CHANGED/);
    process.stdout.write(JSON.stringify({ platform: process.platform, uid, acceptedOwner: false }) + '\n');
  }
} finally { rmSync(root, { recursive: true }); }
