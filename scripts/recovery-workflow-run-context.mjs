import { isAbsolute } from 'node:path';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
const API = 'https://api.github.com/repos/ael-dev3/Warpkeep';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_RUN_CONTEXT_INVALID'); };
const decimal = value => typeof value === 'string' && /^[1-9][0-9]{0,15}$/u.test(value);
const id = value => Number.isSafeInteger(value) && value > 0 ? String(value) : fail();
const repo = value => value?.id === 1273513252 && value.full_name === 'ael-dev3/Warpkeep' && value.owner?.id === 183124839;
const guards = { GITHUB_ACTIONS: 'true', GITHUB_REPOSITORY: 'ael-dev3/Warpkeep',
  GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'workflow_run', GITHUB_JOB: 'deploy-recovery',
  GITHUB_WORKFLOW_REF: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main' };

/** Read-only GitHub run provenance, not OIDC identity or artifact/deployment authority. */
export async function readRecoveryWorkflowRunContext(...args) {
  let token, eventBytes;
  try {
    if (args.length !== 0 || Object.entries(guards).some(([key, value]) => process.env[key] !== value)) fail();
    const pagesRunId = process.env.GITHUB_RUN_ID, pagesRunAttempt = process.env.GITHUB_RUN_ATTEMPT;
    if (!decimal(pagesRunId) || !decimal(pagesRunAttempt)) fail();
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (typeof eventPath !== 'string' || !isAbsolute(eventPath)) fail();
    eventBytes = readLocalBindingBoundedFile(eventPath, { maximumBytes: 2 * 1024 * 1024 }).body;
    const event = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(eventBytes));
    eventBytes.fill(0); eventBytes = undefined;
    const source = event.workflow_run;
    if (event.action !== 'completed' || !repo(event.repository) || !repo(source?.repository)
        || !repo(source.head_repository) || source.name !== 'Verify' || source.event !== 'push'
        || source.head_branch !== 'main' || source.status !== 'completed' || source.conclusion !== 'success'
        || typeof source.head_sha !== 'string' || !/^[a-f0-9]{40}$/u.test(source.head_sha)) fail();
    const sourceVerifyRunId = id(source.id), sourceVerifyRunAttempt = id(source.run_attempt);
    const candidateCommit = source.head_sha;
    if (sourceVerifyRunId === pagesRunId || process.env.GITHUB_SHA !== candidateCommit) fail();
    token = process.env.GITHUB_TOKEN;
    if (typeof token !== 'string' || !/^[\x21-\x7e]{1,16384}$/u.test(token)) fail();
    async function get(path) {
      const controller = new AbortController();
      let timer, response, reader;
      const bytes = Buffer.alloc(512 * 1024);
      try {
        const deadline = performance.now() + 10000;
        const timeout = new Promise((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error('TIMEOUT')); }, 10000); });
        const bounded = async promise => {
          const value = await Promise.race([promise, timeout]);
          if (performance.now() >= deadline) fail();
          return value;
        };
        const url = `${API}${path}`;
        response = await bounded(fetch(url, { method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
          signal: controller.signal, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json',
            'x-github-api-version': '2022-11-28', 'accept-encoding': 'identity', 'cache-control': 'no-store' } }));
        if (response.status !== 200 || response.url !== url || response.redirected || !response.body
            || !/^application\/json(?:\s*;\s*charset=utf-8)?$/iu.test(response.headers.get('content-type') ?? '')
            || ![null, 'identity'].includes(response.headers.get('content-encoding'))) fail();
        const declared = response.headers.get('content-length');
        if (declared !== null && (!/^(?:0|[1-9][0-9]{0,6})$/u.test(declared) || Number(declared) > bytes.length)) fail();
        reader = response.body.getReader(); let length = 0;
        for (;;) {
          const part = await bounded(reader.read());
          if (part.done) break;
          if (!(part.value instanceof Uint8Array) || part.value.length > bytes.length - length) fail();
          bytes.set(part.value, length); length += part.value.length;
        }
        if (declared !== null && Number(declared) !== length) fail();
        return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes.subarray(0, length)));
      } finally {
        clearTimeout(timer); controller.abort(); bytes.fill(0);
        try { void (reader ? reader.cancel() : response?.body?.cancel())?.catch(() => {}); } catch { /* fixed public error */ }
      }
    }
    const verifyMain = async () => {
      const main = await get('/branches/main');
      if (main?.name !== 'main' || main.protected !== true || main.commit?.sha !== candidateCommit) fail();
    };
    await verifyMain();
    const verified = await get(`/actions/runs/${sourceVerifyRunId}/attempts/${sourceVerifyRunAttempt}`);
    if (id(verified.id) !== sourceVerifyRunId || id(verified.run_attempt) !== sourceVerifyRunAttempt
        || !repo(verified.repository) || !repo(verified.head_repository) || verified.name !== 'Verify'
        || !['.github/workflows/verify.yml', '.github/workflows/verify.yml@main'].includes(verified.path)
        || verified.event !== 'push' || verified.head_branch !== 'main' || verified.head_sha !== candidateCommit
        || verified.status !== 'completed' || verified.conclusion !== 'success') fail();
    const pages = await get(`/actions/runs/${pagesRunId}/attempts/${pagesRunAttempt}`);
    if (id(pages.id) !== pagesRunId || id(pages.run_attempt) !== pagesRunAttempt || !repo(pages.repository)
        || !repo(pages.head_repository) || pages.name !== 'Deploy GitHub Pages'
        || !['.github/workflows/deploy-pages.yml', '.github/workflows/deploy-pages.yml@main'].includes(pages.path)
        || pages.event !== 'workflow_run' || pages.head_branch !== 'main' || pages.head_sha !== candidateCommit
        || pages.status !== 'in_progress' || pages.conclusion !== null) fail();
    await verifyMain();
    return Object.freeze({ pagesRunId, pagesRunAttempt, sourceVerifyRunId, sourceVerifyRunAttempt, candidateCommit });
  } catch { fail(); }
  finally { token = undefined; eventBytes?.fill(0); }
}
