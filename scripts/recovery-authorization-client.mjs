const ISSUE = ['requestId', 'candidateCommit', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId', 'oidcToken'];
const CONTRACTS = Object.freeze({
  status: [[], 'statusJws', 30000], issue: [ISSUE, 'authorizationJws', 405000],
  claim: [[...ISSUE, 'authorizationJws'], 'claimReceiptJws', 105000],
  complete: [[...ISSUE, 'claimReceiptJws'], 'terminalJws', 30000],
  reconcile: [[...ISSUE, 'claimReceiptJws'], 'terminalJws', 30000],
  terminal: [['requestId'], 'terminalJws', 30000],
});
const fail = () => { throw new Error('RECOVERY_CLIENT_INVALID'); };
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
const opaque = value => typeof value === 'string' && value.length > 0 && value.length <= 16384 && /^[\x21-\x7e]+$/u.test(value);

/** Fixed-host transport only. The workflow owns fresh OIDC, signed-object verification and erasure. */
export async function requestRecovery(...args) {
  let timer, reader, response;
  const controller = new AbortController();
  const bytes = Buffer.alloc(32768);
  let body;
  try {
    const [endpoint, requestSource] = args;
    if (args.length !== 2 || typeof endpoint !== 'string' || !Object.hasOwn(CONTRACTS, endpoint)
      || typeof requestSource !== 'string' || Buffer.byteLength(requestSource) > 32768) fail();
    const [keys, responseKey, duration] = CONTRACTS[endpoint];
    const request = JSON.parse(requestSource);
    if (request === null || typeof request !== 'object' || Array.isArray(request)
      || Object.keys(request).join(',') !== keys.join(',') || JSON.stringify(request) !== requestSource
      || keys.some(key => typeof request[key] !== 'string')) fail();
    for (const key of keys) {
      const value = request[key];
      if (key === 'requestId' ? !uuid(value)
        : key === 'candidateCommit' ? !/^[a-f0-9]{40}$/u.test(value)
          : ['sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'].includes(key) ? !/^[1-9][0-9]*$/u.test(value)
            : !opaque(value)) fail();
    }
    const url = `https://release-auth.warpkeep.com/v1/recovery/${endpoint === 'terminal' ? `requests/${request.requestId}` : endpoint}`;
    const get = endpoint === 'status' || endpoint === 'terminal';
    body = get ? undefined : requestSource;
    const deadline = performance.now() + duration;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('RECOVERY_CLIENT_INVALID')); }, duration);
    });
    const bounded = async operation => {
      const result = await Promise.race([operation, timeout]);
      if (performance.now() >= deadline) fail();
      return result;
    };
    response = await bounded(fetch(url, {
      method: get ? 'GET' : 'POST', redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: { accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store', ...(get ? {} : { 'content-type': 'application/json' }) },
      body, signal: controller.signal,
    }));
    body = undefined;
    if (response.status !== 200 || response.url !== url || response.redirected
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
      || response.headers.get('cache-control') !== 'no-store' || response.body === null
      || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader !== null && (!/^(?:0|[1-9][0-9]{0,5})$/u.test(lengthHeader) || Number(lengthHeader) > bytes.length)) fail();
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
    if (lengthHeader !== null && Number(lengthHeader) !== length) fail();
    const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    // Exactly one JSON string member; this rejects duplicate keys before JSON.parse.
    const pattern = new RegExp(`^[ \\t\\r\\n]*\\{[ \\t\\r\\n]*"${responseKey}"[ \\t\\r\\n]*:[ \\t\\r\\n]*("(?:[^"\\\\\\u0000-\\u001f]|\\\\(?:["\\\\/bfnrt]|u[0-9a-fA-F]{4}))*")[ \\t\\r\\n]*\\}[ \\t\\r\\n]*$`, 'u');
    const match = pattern.exec(source);
    if (!match) fail();
    const signed = JSON.parse(match[1]);
    if (!opaque(signed)) fail();
    return Object.freeze({ [responseKey]: signed });
  } catch { fail(); }
  finally {
    clearTimeout(timer); controller.abort(); body = undefined; bytes.fill(0);
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* redacted cleanup */ }
  }
}
