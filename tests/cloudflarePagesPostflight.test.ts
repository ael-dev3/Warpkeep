// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import {
  canonicalRoute,
  verifyCloudflarePagesPostflight,
// @ts-expect-error Standalone release utility exposes named test seams.
} from '../scripts/verify-cloudflare-pages-postflight.mjs';

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
