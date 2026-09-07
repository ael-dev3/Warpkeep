import { createHash } from 'node:crypto';
import { readRecoveryWorkflowCurrentContext } from './recovery-workflow-current-context.mjs';
const URL = 'https://warpkeep.com/.well-known/warpkeep-deployment-v1.json';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_LIVE_POSTFLIGHT_INVALID'); };

/** Read-only current-job check. Exact public bytes must match independently
 * verified local content and signed claim history; never deployment authority. */
export async function verifyRecoveryWorkflowLivePostflight(...args) {
  const bytes = new Uint8Array(16384);
  const controller = new AbortController();
  let timer, reader, response;
  try {
    if (args.length !== 0) fail();
    const context = await readRecoveryWorkflowCurrentContext();
    const expected = JSON.parse(context.contextSource).deploymentAttestationSha256;
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)) fail();
    const deadline = performance.now() + 10000;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('RECOVERY_WORKFLOW_LIVE_POSTFLIGHT_INVALID')); }, 10000);
    });
    const bounded = async promise => {
      const value = await Promise.race([promise, timeout]);
      if (performance.now() >= deadline) fail();
      return value;
    };
    response = await bounded(fetch(URL, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: { accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store' }, signal: controller.signal }));
    if (response.status !== 200 || response.url !== URL || response.redirected || response.body === null
        || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
        || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^[1-9][0-9]{0,4}$/u.test(declared) || Number(declared) > bytes.length)) fail();
    reader = response.body.getReader();
    let length = 0;
    for (;;) {
      const part = await bounded(reader.read());
      if (part.done) break;
      try {
        if (!(part.value instanceof Uint8Array) || part.value.length > bytes.length - length) fail();
        bytes.set(part.value, length); length += part.value.length;
      } finally { if (part.value instanceof Uint8Array) part.value.fill(0); }
    }
    if (length === 0 || (declared !== null && Number(declared) !== length)
        || createHash('sha256').update(bytes.subarray(0, length)).digest('hex') !== expected) fail();
    clearTimeout(timer);
    // A mutable local checkout, claim or artifact cannot be accepted across the wait.
    const current = await readRecoveryWorkflowCurrentContext();
    if (current.privateRoot !== context.privateRoot || current.bindingSource !== context.bindingSource
        || current.contextSource !== context.contextSource) fail();
    return Object.freeze({ liveAttestationVerified: true, deploymentAttestationSha256: expected });
  } catch { fail(); }
  finally {
    clearTimeout(timer); controller.abort(); bytes.fill(0);
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* fixed errors only */ }
  }
}
