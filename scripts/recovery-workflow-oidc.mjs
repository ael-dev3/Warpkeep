const fail = () => { throw new Error('RECOVERY_OIDC_REQUEST_INVALID'); };
const CONTEXT = Object.freeze({ GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_run', GITHUB_JOB: 'deploy-recovery',
  GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main' });

/** Environment checks are guardrails, not identity proof. The signer verifies the returned JWT. */
export async function requestFreshRecoveryOidc(...args) {
  const bytes = Buffer.alloc(32768);
  const controller = new AbortController();
  let timer, response, reader, credential;
  try {
    if (args.length !== 0 || Object.entries(CONTEXT).some(([key, value]) => process.env[key] !== value)) fail();
    const source = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
    credential = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
    if (typeof source !== 'string' || source.length > 4096 || /[\x00-\x20\x7f]/u.test(source)
      || typeof credential !== 'string' || credential.length > 16384 || !/^[\x21-\x7e]+$/u.test(credential)) fail();
    const url = new URL(source);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash
      || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+actions\.githubusercontent\.com$/u.test(url.hostname)
      || url.searchParams.has('audience')) fail();
    url.searchParams.append('audience', 'warpkeep-release-recovery');
    const target = url.href;
    const deadline = performance.now() + 30000;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('RECOVERY_OIDC_REQUEST_INVALID')); }, 30000);
    });
    const bounded = async operation => {
      const value = await Promise.race([operation, timeout]);
      if (performance.now() >= deadline) fail();
      return value;
    };
    response = await bounded(fetch(target, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
      headers: { authorization: `Bearer ${credential}`, accept: 'application/json', 'accept-encoding': 'identity', 'cache-control': 'no-store' },
      signal: controller.signal }));
    credential = undefined;
    if (response.status !== 200 || response.url !== target || response.redirected || response.body === null
      || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
      || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^(?:0|[1-9][0-9]{0,5})$/u.test(declared) || Number(declared) > bytes.length)) fail();
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
    if (declared !== null && Number(declared) !== length) fail();
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length));
    const match = /^[ \t\r\n]*\{[ \t\r\n]*"value"[ \t\r\n]*:[ \t\r\n]*("(?:[^"\\\u0000-\u001f]|\\(?:["\\/bfnrt]|u[0-9a-fA-F]{4}))*")[ \t\r\n]*\}[ \t\r\n]*$/u.exec(json);
    if (!match) fail();
    const token = JSON.parse(match[1]);
    if (typeof token !== 'string' || token.length > 16384 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) fail();
    return token;
  } catch { fail(); }
  finally {
    clearTimeout(timer); controller.abort(); credential = undefined; bytes.fill(0);
    try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* redacted cleanup */ }
  }
}
