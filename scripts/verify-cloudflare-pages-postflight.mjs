import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  PUBLIC_PAGES_LEGAL_HEADERS_PATH,
  PUBLIC_PAGES_LEGAL_PLAIN_PATHS,
  publicPagesLegalHeadersBytes,
} from './verify-public-pages-mirror-plan.mjs';

/**
 * Live postflight for the Cloudflare Pages delivery lane (owner direction,
 * 3 October 2026: no GitHub Actions). It fetches every served file of a reviewed
 * `/ptr/` mirror plan from one HTTPS origin and requires byte-identical bodies,
 * plus the SPA fallback routes. The root `_headers` file is Pages metadata and
 * is not fetched; when the plan publishes an extensionless reviewed legal
 * file, that route must answer `text/plain; charset=utf-8`. It reads public
 * URLs only: it needs no credential and changes nothing. A pass describes the
 * served bytes at the time of the run; it is not owner sign-in, realm
 * readiness or device acceptance.
 */

export const CLOUDFLARE_PAGES_PROJECT = 'warpkeep';
const PLAN_PROFILE = 'warpkeep-public-pages-ptr-mirror-plan-v1';
const ORIGIN = /^https:\/\/(?:warpkeep\.com|www\.warpkeep\.com|(?:[a-f0-9]{8}\.)?warpkeep\.pages\.dev)$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/u;
const MAX_PLAN_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MISSING_PROBE = '__warpkeep-postflight-missing__';
const LEGAL_PLAIN_TYPE = /^text\/plain;\s*charset=utf-8$/iu;

export class CloudflarePagesPostflightError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CloudflarePagesPostflightError';
    this.code = code;
  }
}

function fail(code) { throw new CloudflarePagesPostflightError(`CLOUDFLARE_PAGES_POSTFLIGHT_${code}`); }

function sha256(bytes) { return createHash('sha256').update(bytes).digest('hex'); }

function safePath(path) {
  return typeof path === 'string' && path.length > 0 && path.length <= 1024
    && path.split('/').every(part => part !== '.' && part !== '..' && SAFE_SEGMENT.test(part));
}

/** Strict reader for the canonical plan written by `verify-public-pages-mirror-plan.mjs --write-plan`. */
export function parseReviewedPlan(bytes, expectedSha256) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 3 || bytes.length > MAX_PLAN_BYTES
    || !DIGEST.test(expectedSha256 ?? '') || sha256(bytes) !== expectedSha256) fail('PLAN_INVALID');
  let plan;
  try { plan = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { fail('PLAN_INVALID'); }
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)
    || !Buffer.from(`${JSON.stringify(plan)}\n`).equals(bytes)
    || plan.schemaVersion !== 2 || plan.profile !== PLAN_PROFILE || plan.publicationPath !== '/ptr/'
    || !COMMIT.test(plan.sourceCommit ?? '') || !COMMIT.test(plan.publicParentCommit ?? '')
    || !Array.isArray(plan.targetEntries) || plan.targetEntries.length === 0
    || plan.targetEntries.length > MAX_ENTRIES || plan.targetEntries.length !== plan.targetFileCount) {
    fail('PLAN_INVALID');
  }
  const entries = new Map();
  for (const entry of plan.targetEntries) {
    if (!entry || typeof entry !== 'object' || !safePath(entry.path) || entries.has(entry.path)
      || !Number.isSafeInteger(entry.byteLength) || entry.byteLength < 0 || entry.byteLength > MAX_FILE_BYTES
      || !DIGEST.test(entry.sha256 ?? '')) fail('PLAN_INVALID');
    entries.set(entry.path, Object.freeze({ path: entry.path, byteLength: entry.byteLength, sha256: entry.sha256 }));
  }
  for (const required of ['index.html', '404.html', 'ptr/index.html', 'ptr/404.html']) {
    if (!entries.has(required)) fail('PLAN_INVALID');
  }
  return Object.freeze({ plan, entries });
}

/** Cloudflare Pages serves `x.html` at `x` and `dir/index.html` at `dir/` (others redirect with 308). */
export function canonicalRoute(path) {
  if (path === 'index.html') return '/';
  if (path.endsWith('/index.html')) return `/${path.slice(0, -'index.html'.length)}`;
  if (path.endsWith('.html')) return `/${path.slice(0, -'.html'.length)}`;
  return `/${path}`;
}

/**
 * One bounded request: a per-request deadline covers headers and body, the body is
 * read as a stream and cancelled as soon as it exceeds `maximumBytes`, and every
 * transport, abort or read failure maps to a fixed code. A bad CDN response
 * therefore ends the check predictably instead of buffering or waiting forever.
 */
async function fetchExact(fetchImpl, url, maximumBytes, timeoutMs, runSignal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  // Retiring the whole run also aborts this request and its body read.
  const retire = () => controller.abort();
  if (runSignal?.aborted) controller.abort(); else runSignal?.addEventListener('abort', retire, { once: true });
  const failure = () => fail(controller.signal.aborted ? 'TIMEOUT' : 'TRANSPORT_FAILED');
  try {
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: 'manual', cache: 'no-store', signal: controller.signal,
        headers: { 'user-agent': 'warpkeep-cloudflare-postflight/1' },
      });
    } catch { failure(); }
    const chunks = []; let length = 0;
    const reader = response.body?.getReader();
    if (reader) {
      // Some stream sources ignore abort; the deadline still settles every read.
      const aborted = new Promise((_, reject) => {
        if (controller.signal.aborted) reject(new Error('aborted'));
        controller.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
      aborted.catch(() => undefined);
      try {
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), aborted]);
          if (done) break;
          length += value.byteLength;
          if (length > maximumBytes) {
            reader.cancel().catch(() => undefined);
            fail('BODY_TOO_LARGE');
          }
          chunks.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
        }
      } catch (error) {
        if (error instanceof CloudflarePagesPostflightError) throw error;
        reader.cancel().catch(() => undefined);
        failure();
      }
    }
    return {
      status: response.status,
      contentType: response.headers?.get?.('content-type') ?? null,
      body: Buffer.concat(chunks, length),
    };
  } finally {
    clearTimeout(timer);
    runSignal?.removeEventListener('abort', retire);
  }
}

export async function verifyCloudflarePagesPostflight({
  origin, reviewedPlanBytes, expectedReviewedPlanSha256, fetchImpl = globalThis.fetch, concurrency = 8,
  timeoutMs = 30_000,
}) {
  if (typeof origin !== 'string' || !ORIGIN.test(origin)) fail('ORIGIN_INVALID');
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 32
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 600_000) {
    fail('ARGUMENT_INVALID');
  }
  const { plan, entries } = parseReviewedPlan(reviewedPlanBytes, expectedReviewedPlanSha256);
  const headersEntry = entries.get(PUBLIC_PAGES_LEGAL_HEADERS_PATH);
  if (headersEntry || PUBLIC_PAGES_LEGAL_PLAIN_PATHS.some(path => entries.has(path))) {
    const expectedHeaders = publicPagesLegalHeadersBytes();
    if (!headersEntry || headersEntry.byteLength !== expectedHeaders.length
      || headersEntry.sha256 !== sha256(expectedHeaders)) fail('PLAN_INVALID');
  }
  const queue = [...entries.values()];
  const mismatched = [];
  const mistyped = [];
  // The first request failure stops the shared queue and aborts in-flight
  // requests; every worker settles before the failure is reported.
  const run = new AbortController();
  let firstFailure = null;
  async function worker() {
    for (let entry = queue.pop(); entry !== undefined && !run.signal.aborted; entry = queue.pop()) {
      if (entry.path === PUBLIC_PAGES_LEGAL_HEADERS_PATH) continue;
      try {
        const { status, body, contentType } = await fetchExact(fetchImpl, `${origin}${canonicalRoute(entry.path)}`, entry.byteLength + 1, timeoutMs, run.signal);
        if (status !== 200 || body.length !== entry.byteLength || sha256(body) !== entry.sha256) mismatched.push(entry.path);
        else if (PUBLIC_PAGES_LEGAL_PLAIN_PATHS.includes(entry.path) && !LEGAL_PLAIN_TYPE.test(contentType ?? '')) {
          mistyped.push(entry.path);
        }
      } catch (error) {
        if (firstFailure === null) firstFailure = error;
        run.abort();
      }
    }
  }
  await Promise.allSettled(Array.from({ length: concurrency }, worker));
  if (firstFailure !== null) throw firstFailure;
  if (mismatched.length > 0) {
    throw Object.assign(new CloudflarePagesPostflightError('CLOUDFLARE_PAGES_POSTFLIGHT_CONTENT_MISMATCH'), {
      paths: Object.freeze(mismatched.sort().slice(0, 20)),
    });
  }
  if (mistyped.length > 0) {
    throw Object.assign(new CloudflarePagesPostflightError('CLOUDFLARE_PAGES_POSTFLIGHT_CONTENT_TYPE_INVALID'), {
      paths: Object.freeze(mistyped.sort()),
    });
  }
  // Unknown paths must fall back to the nearest SPA 404 page with a 404 status.
  for (const [route, fallback] of [[`/${MISSING_PROBE}`, '404.html'], [`/ptr/${MISSING_PROBE}`, 'ptr/404.html']]) {
    const expected = entries.get(fallback);
    const { status, body } = await fetchExact(fetchImpl, `${origin}${route}`, expected.byteLength + 1, timeoutMs);
    if (status !== 404 || sha256(body) !== expected.sha256) fail('FALLBACK_INVALID');
  }
  return Object.freeze({
    profile: 'warpkeep-cloudflare-pages-postflight-v1',
    origin,
    reviewedPlanSha256: expectedReviewedPlanSha256,
    sourceCommit: plan.sourceCommit,
    publicParentCommit: plan.publicParentCommit,
    verifiedFileCount: entries.size,
    verifiedFallbackRoutes: 2,
    verifiedLegalPlainTextRoutes: PUBLIC_PAGES_LEGAL_PLAIN_PATHS.filter(path => entries.has(path)).length,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const labels = ['--origin', '--plan', '--plan-sha256'];
    if (process.argv.length !== 2 + labels.length * 2
      || labels.some((label, index) => process.argv[2 + index * 2] !== label)) fail('ARGUMENT_INVALID');
    const planBytes = readFileSync(process.argv[5]);
    const result = await verifyCloudflarePagesPostflight({
      origin: process.argv[3], reviewedPlanBytes: planBytes, expectedReviewedPlanSha256: process.argv[7],
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof CloudflarePagesPostflightError ? error.code : 'CLOUDFLARE_PAGES_POSTFLIGHT_INVALID'}\n`);
    if (error?.paths) process.stderr.write(`${error.paths.join('\n')}\n`);
    process.exitCode = 1;
  }
}
