import { readSync } from 'node:fs';

import { validateLocalBindingWorkerRequest } from './local-binding-runtime-core.mjs';

const MAX_REQUEST_BYTES = 1024 * 1024;

function fail() {
  const error = new Error('LOCAL_BINDING_WORKER_REQUEST_INVALID');
  error.code = 'LOCAL_BINDING_WORKER_REQUEST_INVALID';
  throw error;
}

export function readLocalBindingWorkerRequest() {
  const descriptor = 3;
  const chunks = [];
  let total = 0;
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, MAX_REQUEST_BYTES + 1 - total));
    const count = readSync(descriptor, chunk, 0, chunk.length, null);
    if (count === 0) break;
    total += count;
    if (total > MAX_REQUEST_BYTES) fail();
    chunks.push(chunk.subarray(0, count));
  }
  const source = Buffer.concat(chunks).toString('utf8');
  if (!source.endsWith('\n')) fail();
  let value;
  try { value = JSON.parse(source); } catch { fail(); }
  if (`${JSON.stringify(value)}\n` !== source) fail();
  return validateLocalBindingWorkerRequest(value);
}
