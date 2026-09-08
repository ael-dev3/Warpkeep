const CODE = 'SEALED_REALMS_RECOVERY_PREPARATION_TRANSPORT_INVALID';
const fail = () => { throw Error(CODE); };
const CONTEXT = Object.freeze({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_JOB: 'operate',
  GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' });
const ENDPOINT = 'https://release-auth.warpkeep.com/v1/recovery/prepare';
const AUDIENCE = 'https://release-auth.warpkeep.com/preparation';
async function request(target, init, key, milliseconds) {
  const buffer = Buffer.alloc(32768), controller = new AbortController();
  let timer, response, reader;
  try {
    const deadline = performance.now() + milliseconds;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error(CODE)); }, milliseconds);
    });
    const bounded = async operation => {
      const value = await Promise.race([operation, timeout]);
      if (performance.now() >= deadline) fail();
      return value;
    };
    response = await bounded(fetch(target, { ...init, redirect: 'error', cache: 'no-store', credentials: 'omit', signal: controller.signal }));
    if (response.status !== 200 || response.url !== target || response.redirected || response.body === null
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
      || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(?:0|[1-9][0-9]{0,5})$/u.test(declared) || Number(declared) > buffer.length)) fail();
    reader = response.body.getReader();
    let length = 0;
    for (;;) {
      const part = await bounded(reader.read());
      if (part.done) break;
      try {
        if (!(part.value instanceof Uint8Array) || part.value.length > buffer.length - length) fail();
        buffer.set(part.value, length); length += part.value.length;
      } finally { if (part.value instanceof Uint8Array) part.value.fill(0); }
    }
    if (declared !== null && Number(declared) !== length) fail();
    const raw = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, length));
    // Both fixed APIs return exactly one string member. This grammar rejects duplicate keys before JSON.parse.
    const match = /^[ \t\r\n]*\{[ \t\r\n]*"(value|preparationReceiptJws)"[ \t\r\n]*:[ \t\r\n]*("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")[ \t\r\n]*\}[ \t\r\n]*$/u.exec(raw);
    if (match === null || match[1] !== key) fail();
    const compact = JSON.parse(match[2]);
    if (typeof compact !== 'string' || compact.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(compact)) fail();
    return compact;
  } finally {
    clearTimeout(timer); controller.abort(); buffer.fill(0);
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* redacted cleanup */ }
  }
}
/** Fixed transport only. The private owner authenticates the returned service signature and source binding. */
export async function requestSealedRealmsProductionRecoveryPreparation(preparationCommit, beforeSend = () => {}) {
  let credential, oidcToken;
  try {
    if (arguments.length < 1 || arguments.length > 2 || typeof beforeSend !== 'function' || typeof preparationCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(preparationCommit)
      || Object.entries(CONTEXT).some(([key, value]) => process.env[key] !== value)
      || process.env.GITHUB_SHA !== preparationCommit
      || !/^[1-9][0-9]{0,19}$/u.test(process.env.GITHUB_RUN_ID ?? '')
      || !/^[1-9][0-9]{0,19}$/u.test(process.env.GITHUB_RUN_ATTEMPT ?? '')) fail();
    const source = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    credential = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (typeof source !== 'string' || source.length > 4096 || /[\x00-\x20\x7f]/u.test(source)
      || typeof credential !== 'string' || credential.length > 16384 || !/^[\x21-\x7e]+$/u.test(credential)) fail();
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+actions\.githubusercontent\.com$/u.test(url.hostname)
      || url.searchParams.has('audience')) fail();
    url.searchParams.append('audience', AUDIENCE);
    oidcToken = await request(url.href, { method: 'GET', headers: { authorization: `Bearer ${credential}`,
      accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store' } }, 'value', 30000);
    credential = undefined;
    // Supplied by the private owner, not the workflow constructor's caller.
    if (beforeSend() !== undefined) fail();
    return await request(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json',
      accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store' },
    body: JSON.stringify({ oidcToken, preparationCommit }) }, 'preparationReceiptJws', 110000);
  } catch { fail(); }
  finally { credential = undefined; oidcToken = undefined; }
}
