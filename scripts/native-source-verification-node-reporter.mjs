// Pure Node --test-reporter adapter. Importing this file starts no process or file write.
import { createHash } from 'node:crypto';

export const NODE_EVENT_SCHEMA = 'warpkeep-node-test-events-v1';
export const MAX_EVENT_BYTES = 1024 * 1024;

function errorProperties(_key, value) {
  if (!(value instanceof Error)) return value;
  const result = { name: value.name, message: value.message };
  for (const key of Object.getOwnPropertyNames(value)) result[key] = value[key];
  return result;
}

export default async function* reportNodeEvents(source) {
  yield JSON.stringify({ schema: NODE_EVENT_SCHEMA, boundary: 'start', nodeVersion: process.versions.node }) + '\n';
  let sequence = 0;
  const digest = createHash('sha256');
  for await (const event of source) {
    if (!event || typeof event.type !== 'string' || !event.type.startsWith('test:')) throw Error('Unsupported Node reporter event');
    const line = JSON.stringify({ sequence, type: event.type, data: event.data }, errorProperties) + '\n';
    if (Buffer.byteLength(line) > MAX_EVENT_BYTES) throw Error('Node reporter event exceeds bound');
    digest.update(line);
    yield line;
    sequence++;
  }
  // This proves the actual reporter iterator ended, not that the tests passed.
  yield JSON.stringify({ schema: NODE_EVENT_SCHEMA, boundary: 'end', events: sequence, sha256: digest.digest('hex') }) + '\n';
}
