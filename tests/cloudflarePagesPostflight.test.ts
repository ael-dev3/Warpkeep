// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  canonicalRoute,
  verifyCloudflarePagesPostflight,
// @ts-expect-error Standalone release utility exposes named test seams.
} from '../scripts/verify-cloudflare-pages-postflight.mjs';
// @ts-expect-error Standalone release utility exposes the generated Pages headers.
import { PUBLIC_PAGES_LEGAL_HEADERS_PATH, PUBLIC_PAGES_LEGAL_PLAIN_PATHS, publicPagesLegalHeadersBytes } from '../scripts/verify-public-pages-mirror-plan.mjs';

const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const ORIGIN = 'https://warpkeep.pages.dev';

const files: Record<string, string> = {
  'index.html': '<!doctype html>alpha',
  '404.html': '<!doctype html>alpha',
  CNAME: 'warpkeep.com\n',
  'ptr/index.html': '<!doctype html>ptr',
  'ptr/404.html': '<!doctype html>ptr',
  'ptr/assets/index-a1.js': 'console.log("ptr")',
};

function planBytes(overrides: Record<string, unknown> = {}) {
  const targetEntries = Object.entries(files).map(([path, body]) => ({
    path, byteLength: Buffer.byteLength(body), sha256: sha(body), origin: 'generated',
  }));
  const plan = {
    schemaVersion: 2,
    profile: 'warpkeep-public-pages-ptr-mirror-plan-v1',
    publicationPath: '/ptr/',
    sourceCommit: 'a'.repeat(40),
    publicParentCommit: 'b'.repeat(40),
    targetFileCount: targetEntries.length,
    targetEntries,
    ...overrides,
  };
  const bytes = Buffer.from(`${JSON.stringify(plan)}\n`);
  return { bytes, digest: sha(bytes) };
}

/** A Cloudflare-Pages-shaped server: pretty URLs, nearest-404 fallback, 308 for `.html`. */
function pagesServer(served: Record<string, string> = files) {
  const routes = new Map(Object.entries(served).map(([path, body]) => [canonicalRoute(path), body]));
  const requested: string[] = [];
  const fetchImpl = async (url: string, init: { redirect?: string }) => {
    expect(init.redirect).toBe('manual');
    const route = new URL(url).pathname;
    requested.push(route);
    if (routes.has(route)) return new Response(routes.get(route), { status: 200 });
    if (route.endsWith('.html')) return new Response(null, { status: 308, headers: { location: route.slice(0, -5) } });
    const fallback = route.startsWith('/ptr/') ? served['ptr/404.html'] : served['404.html'];
    return new Response(fallback, { status: 404 });
  };
  return { fetchImpl, requested };
}

describe('Cloudflare Pages postflight', () => {
  it('maps planned files to the routes Cloudflare Pages serves without redirecting', () => {
    expect(canonicalRoute('index.html')).toBe('/');
    expect(canonicalRoute('ptr/index.html')).toBe('/ptr/');
    expect(canonicalRoute('404.html')).toBe('/404');
    expect(canonicalRoute('ptr/assets/index-a1.js')).toBe('/ptr/assets/index-a1.js');
    expect(canonicalRoute('.well-known/farcaster.json')).toBe('/.well-known/farcaster.json');
  });

  it('verifies every planned file and both SPA fallbacks from one origin', async () => {
    const { bytes, digest } = planBytes();
    const server = pagesServer();
    const result = await verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl: server.fetchImpl,
    });
    expect(result).toMatchObject({ origin: ORIGIN, verifiedFileCount: 6, verifiedFallbackRoutes: 2, sourceCommit: 'a'.repeat(40) });
    expect(server.requested).toContain('/ptr/__warpkeep-postflight-missing__');
  });

  it('requires text/plain for extensionless legal files and does not fetch _headers', async () => {
    const headers = publicPagesLegalHeadersBytes();
    const legal = Object.fromEntries(
      (PUBLIC_PAGES_LEGAL_PLAIN_PATHS as readonly string[]).map(path => [path, `reviewed ${path}\n`]),
    );
    const planned: Record<string, string> = {
      ...files, ...legal, [PUBLIC_PAGES_LEGAL_HEADERS_PATH]: headers.toString('utf8'),
    };
    const targetEntries = Object.entries(planned).map(([path, body]) => ({
      path, byteLength: Buffer.byteLength(body), sha256: sha(body), origin: 'generated',
    }));
    const { bytes, digest } = planBytes({ targetEntries, targetFileCount: targetEntries.length });
    const server = pagesServer({ ...files, ...legal });
    const requested: string[] = [];
    const typed = (contentType: string) => async (url: string, init: { redirect?: string }) => {
      const route = new URL(url).pathname;
      requested.push(route);
      const legalPath = route.slice(1);
      if (Object.hasOwn(legal, legalPath)) {
        return new Response(legal[legalPath], {
          status: 200, headers: { 'content-type': contentType },
        });
      }
      return server.fetchImpl(url, init);
    };
    const result = await verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest,
      fetchImpl: typed('text/plain; charset=utf-8'),
    });
    expect(result).toMatchObject({
      verifiedLegalPlainTextRoutes: PUBLIC_PAGES_LEGAL_PLAIN_PATHS.length,
      verifiedFileCount: targetEntries.length,
    });
    expect(requested).not.toContain('/_headers');
    requested.length = 0;
    for (const contentType of ['application/octet-stream', 'text/plain']) {
      await expect(verifyCloudflarePagesPostflight({
        origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest,
        fetchImpl: typed(contentType),
      })).rejects.toMatchObject({
        code: 'CLOUDFLARE_PAGES_POSTFLIGHT_CONTENT_TYPE_INVALID',
        paths: [...PUBLIC_PAGES_LEGAL_PLAIN_PATHS].sort(),
      });
      expect(requested).not.toContain('/_headers');
      requested.length = 0;
    }
    const withoutHeaders = targetEntries.filter(entry => entry.path !== PUBLIC_PAGES_LEGAL_HEADERS_PATH);
    const missing = planBytes({ targetEntries: withoutHeaders, targetFileCount: withoutHeaders.length });
    await expect(verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: missing.bytes, expectedReviewedPlanSha256: missing.digest,
      fetchImpl: typed('text/plain; charset=utf-8'),
    })).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_PLAN_INVALID' });
  });

  it('names the paths whose served bytes differ', async () => {
    const { bytes, digest } = planBytes();
    const server = pagesServer({ ...files, 'ptr/assets/index-a1.js': 'tampered' });
    await expect(verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl: server.fetchImpl,
    })).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_CONTENT_MISMATCH', paths: ['ptr/assets/index-a1.js'] });
  });

  it('rejects a fallback that serves the wrong page or status', async () => {
    const { bytes, digest } = planBytes();
    const server = pagesServer();
    const fetchImpl = async (url: string, init: { redirect?: string }) => (
      url.endsWith('__warpkeep-postflight-missing__') ? new Response(files['index.html'], { status: 200 }) : server.fetchImpl(url, init)
    );
    await expect(verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl,
    })).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_FALLBACK_INVALID' });
  });

  it('accepts only the production domain and the project preview hosts', async () => {
    const { bytes, digest } = planBytes();
    const { fetchImpl } = pagesServer();
    for (const origin of ['https://warpkeep.com', 'https://www.warpkeep.com', 'https://68e9ebfd.warpkeep.pages.dev']) {
      await expect(verifyCloudflarePagesPostflight({ origin, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl }))
        .resolves.toMatchObject({ origin });
    }
    for (const origin of ['http://warpkeep.com', 'https://evil.pages.dev', 'https://warpkeep.com/', 'https://x.warpkeep.pages.dev.evil.com']) {
      await expect(verifyCloudflarePagesPostflight({ origin, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl }))
        .rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_ORIGIN_INVALID' });
    }
  });

  it('stops reading an oversized body at its bound and cancels it', async () => {
    const { bytes, digest } = planBytes();
    const server = pagesServer();
    let pulled = 0; let cancelled = false;
    const fetchImpl = async (url: string, init: { redirect?: string }) => {
      if (!url.endsWith('/ptr/assets/index-a1.js')) return server.fetchImpl(url, init);
      // An endless body: it must be cut off at the planned size, never buffered whole.
      return new Response(new ReadableStream<Uint8Array>({
        pull(controller) { pulled++; controller.enqueue(new Uint8Array(64 * 1024)); },
        cancel() { cancelled = true; },
      }), { status: 200 });
    };
    await expect(verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl, concurrency: 1,
    })).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_BODY_TOO_LARGE' });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThanOrEqual(3);
  });

  it('ends a stalled response or body at its deadline, even when the stream ignores abort', async () => {
    const { bytes, digest } = planBytes();
    const server = pagesServer();
    const stalledHeaders = async (url: string, init: { redirect?: string; signal?: AbortSignal }) => (
      url.endsWith('/ptr/') ? new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted'))))
        : server.fetchImpl(url, init)
    );
    const stalledBody = async (url: string, init: { redirect?: string; signal?: AbortSignal }) => (
      url.endsWith('/ptr/') ? new Response(new ReadableStream<Uint8Array>({ start() { /* never enqueues, ignores abort */ } }), { status: 200 })
        : server.fetchImpl(url, init)
    );
    for (const fetchImpl of [stalledHeaders, stalledBody]) {
      const started = Date.now();
      await expect(verifyCloudflarePagesPostflight({
        origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl, timeoutMs: 50,
      })).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_TIMEOUT' });
      expect(Date.now() - started).toBeLessThan(5_000);
    }
  });

  it('retires every worker after the first request failure, without starting more requests', async () => {
    // Forty filler assets plus the required pages; the failing path is popped first.
    const many: Record<string, string> = { ...files };
    for (let i = 0; i < 40; i++) many[`ptr/assets/filler-${i}.js`] = `filler ${i}`;
    many['ptr/assets/zz-fails.js'] = 'fails';
    const targetEntries = Object.entries(many).map(([path, body]) => ({ path, byteLength: Buffer.byteLength(body), sha256: sha(body), origin: 'generated' }));
    targetEntries.sort((a, b) => (a.path === 'ptr/assets/zz-fails.js' ? 1 : b.path === 'ptr/assets/zz-fails.js' ? -1 : 0));
    const { bytes, digest } = planBytes({ targetEntries, targetFileCount: targetEntries.length });
    let started = 0; let settled = 0; let startedAfterFailure = 0; let failed = false;
    const fetchImpl = (url: string, init: { signal?: AbortSignal }) => {
      started++;
      if (failed) startedAfterFailure++;
      if (url.endsWith('/ptr/assets/zz-fails.js')) return new Promise<Response>((_, reject) => setTimeout(() => { failed = true; settled++; reject(new TypeError('connection reset')); }, 10));
      // Every other request stalls until the run retires it.
      return new Promise<Response>((_, reject) => init.signal?.addEventListener('abort', () => { settled++; reject(new Error('aborted')); }));
    };
    const outcome = await verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl, concurrency: 4, timeoutMs: 60_000,
    }).then(() => 'resolved', (error: { code?: string }) => error.code);
    expect(outcome).toBe('CLOUDFLARE_PAGES_POSTFLIGHT_TRANSPORT_FAILED');
    // Only the first wave started; each stalled request was aborted and settled before the rejection.
    expect(started).toBe(4);
    expect(startedAfterFailure).toBe(0);
    expect(settled).toBe(started);
  });

  it('maps transport and body read failures to one fixed code', async () => {
    const { bytes, digest } = planBytes();
    const server = pagesServer();
    const thrown = async () => { throw new TypeError('network down'); };
    const brokenBody = async (url: string, init: { redirect?: string }) => (
      url.endsWith('/ptr/') ? new Response(new ReadableStream<Uint8Array>({ pull(controller) { controller.error(new Error('reset')); } }), { status: 200 })
        : server.fetchImpl(url, init)
    );
    for (const fetchImpl of [thrown, brokenBody]) {
      await expect(verifyCloudflarePagesPostflight({
        origin: ORIGIN, reviewedPlanBytes: bytes, expectedReviewedPlanSha256: digest, fetchImpl,
      })).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_TRANSPORT_FAILED' });
    }
  });

  it('rejects a plan whose digest, canonical form or required pages drift', async () => {
    const { fetchImpl } = pagesServer();
    const { bytes, digest } = planBytes();
    const run = (reviewedPlanBytes: Buffer, expectedReviewedPlanSha256: string) => verifyCloudflarePagesPostflight({
      origin: ORIGIN, reviewedPlanBytes, expectedReviewedPlanSha256, fetchImpl,
    });
    await expect(run(bytes, '0'.repeat(64))).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_PLAN_INVALID' });
    const pretty = Buffer.from(JSON.stringify(JSON.parse(bytes.toString()), null, 2));
    await expect(run(pretty, sha(pretty))).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_PLAN_INVALID' });
    const traversal = planBytes({ targetEntries: [{ path: '../secret', byteLength: 1, sha256: sha('x'), origin: 'generated' }], targetFileCount: 1 });
    await expect(run(traversal.bytes, traversal.digest)).rejects.toMatchObject({ code: 'CLOUDFLARE_PAGES_POSTFLIGHT_PLAN_INVALID' });
    await expect(run(bytes, digest)).resolves.toMatchObject({ verifiedFileCount: 6 });
  });
});
