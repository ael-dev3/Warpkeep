import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import {
  CASTLE_LOD_VISUAL_EVIDENCE_PROFILE_COUNT,
  CASTLE_LOD_VISUAL_EVIDENCE_ROUTE,
  CASTLE_LOD_VISUAL_EVIDENCE_SOURCE_ROUTE,
  assertCastleLodVisualEvidenceLoopbackBoundary,
  castleLodVisualEvidenceSourceVitePlugin,
  castleLodVisualEvidenceUrl,
  parseCastleLodVisualEvidence,
  runCastleLodVisualEvidenceBrowserCase
} from '../scripts/qa-observer/castle-lod-visual-browser-probe.mjs';

const URL = 'http://127.0.0.1:41733/dev/castle-lod-visual-evidence.html';

const PASSING_OBSERVATION = Object.freeze({
  href: URL,
  profiles: Object.freeze({
    high: Object.freeze({
      coverageDeltaBasisPoints: 184,
      meanColorDelta: 5,
      silhouetteIouBasisPoints: 8_970
    }),
    balanced: Object.freeze({
      coverageDeltaBasisPoints: 131,
      meanColorDelta: 5,
      silhouetteIouBasisPoints: 8_938
    }),
    compact: Object.freeze({
      coverageDeltaBasisPoints: 71,
      meanColorDelta: 4,
      silhouetteIouBasisPoints: 8_923
    })
  }),
  renderer: 'webgl',
  status: 'ready',
  targetPixels: 384
});

describe('local castle LOD visual evidence contract', () => {
  it('pins one private loopback source route and one fixed visual evidence page', () => {
    expect(CASTLE_LOD_VISUAL_EVIDENCE_ROUTE).toBe('/dev/castle-lod-visual-evidence.html');
    expect(CASTLE_LOD_VISUAL_EVIDENCE_SOURCE_ROUTE)
      .toBe('/_warpkeep-local-qa/hegemony-main-castle-source.glb');
    expect(CASTLE_LOD_VISUAL_EVIDENCE_PROFILE_COUNT).toBe(3);
    expect(castleLodVisualEvidenceUrl(41_733)).toBe(URL);
    expect(() => castleLodVisualEvidenceUrl(0)).toThrow(/port/i);
  });

  it('uses one-shot closed HEAD sockets for the loopback boundary checks', async () => {
    const connectionHeaders: Array<string | undefined> = [];
    const server = createServer((request, response) => {
      connectionHeaders.push(request.headers.connection);
      if (request.url === CASTLE_LOD_VISUAL_EVIDENCE_SOURCE_ROUTE) {
        response.writeHead(200, {
          'cache-control': 'no-store',
          'content-length': '2233564',
          'content-type': 'model/gltf-binary',
          'cross-origin-resource-policy': 'same-origin'
        });
      } else if (request.url?.startsWith('/@fs')) {
        response.writeHead(403, { 'content-length': '0' });
      } else {
        response.writeHead(404, {
          'content-length': '0',
          'content-type': 'text/html; charset=utf-8'
        });
      }
      response.end();
    });
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen);
      server.listen({ host: '127.0.0.1', port: 0 }, () => resolveListen());
    });
    const address = server.address();
    if (address === null || typeof address === 'string') {
      server.close();
      throw new Error('Synthetic loopback test server did not expose a port.');
    }
    try {
      await expect(assertCastleLodVisualEvidenceLoopbackBoundary(address.port)).resolves.toEqual({
        archiveStatus: 403,
        exactStatus: 200,
        queryStatus: 404
      });
      expect(connectionHeaders).toEqual(['close', 'close', 'close']);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    }
  });

  it('accepts only bounded aggregate source-versus-runtime visual metrics', () => {
    expect(parseCastleLodVisualEvidence(PASSING_OBSERVATION, URL)).toEqual({
      renderer: 'webgl',
      targetPixels: 384,
      profiles: PASSING_OBSERVATION.profiles
    });
    expect(() => parseCastleLodVisualEvidence({
      ...PASSING_OBSERVATION,
      rawPixels: 'must-not-survive'
    }, URL)).toThrow(/shape/i);
    expect(() => parseCastleLodVisualEvidence({
      ...PASSING_OBSERVATION,
      profiles: {
        ...PASSING_OBSERVATION.profiles,
        high: {
          ...PASSING_OBSERVATION.profiles.high,
          silhouetteIouBasisPoints: 8_799
        }
      }
    }, URL)).toThrow(/high fidelity/i);
    expect(() => parseCastleLodVisualEvidence({
      ...PASSING_OBSERVATION,
      profiles: {
        ...PASSING_OBSERVATION.profiles,
        compact: {
          ...PASSING_OBSERVATION.profiles.compact,
          coverageDeltaBasisPoints: 1_101
        }
      }
    }, URL)).toThrow(/compact fidelity/i);
  });

  it('fails a complete out-of-floor observation immediately instead of timing out', async () => {
    const observation = {
      ...PASSING_OBSERVATION,
      profiles: {
        ...PASSING_OBSERVATION.profiles,
        high: {
          ...PASSING_OBSERVATION.profiles.high,
          silhouetteIouBasisPoints: 8_799
        }
      }
    };
    const command = vi.fn(async (method: string) => (
      method === 'Runtime.evaluate'
        ? { result: { type: 'object', value: observation } }
        : {}
    ));

    await expect(runCastleLodVisualEvidenceBrowserCase(
      { command },
      { port: 41_733, state: { violation: '' } }
    )).rejects.toThrow(/outside its reviewed floors/i);
    expect(command).toHaveBeenCalledTimes(3);
  });

  it('keeps the source in-memory, no-store, and exact-route-only', () => {
    const source = readFileSync(resolve(
      process.cwd(),
      'scripts/qa-observer/castle-lod-visual-browser-probe.mjs'
    ), 'utf8');
    expect(source).toContain("const SOURCE_ROUTE = '/_warpkeep-local-qa/hegemony-main-castle-source.glb'");
    expect(source).toContain("request.url !== SOURCE_ROUTE");
    expect(source).toContain("'cache-control': 'no-store'");
    expect(source).toContain("'cross-origin-resource-policy': 'same-origin'");
    expect(source).toContain('source.fill(0)');
    expect(source).toContain('assertCastleLodVisualEvidenceLoopbackBoundary');
    expect(source).toContain('agent: false');
    expect(source).toContain("connection: 'close'");
    expect(source).toContain('clearTimeout(deadline);');
    expect(source).toContain('request deadline exceeded');
    expect(source).toContain('response?.destroy();');
    expect(source).toContain('request?.destroy();');
    expect(source).toContain('Settling immediately');
    expect(source).not.toContain("response.once('end'");
    expect(source).not.toContain('response.resume();');
    expect(source).toContain("boundaryHead('exact', SOURCE_ROUTE)");
    expect(source).toContain("boundaryHead('archive', archiveFsPath)");
    expect(source).toContain("boundaryHead('query', `${SOURCE_ROUTE}?probe=1`)");
    expect(source).toContain('archive.statusCode !== 403');
    expect(source).toContain("query.headers['content-type']) === 'model/gltf-binary'\n    ||");
    expect(source).toContain('resolveAttestedSystemUnzip()');
    expect(source).not.toMatch(/https:\/\//u);
    expect(source).not.toMatch(/(?:WebSocket|XMLHttpRequest|EventSource)/u);
  });

  it('rejects a same-size source buffer unless its exact member hash matches', () => {
    expect(() => castleLodVisualEvidenceSourceVitePlugin(Buffer.alloc(2_233_564)))
      .toThrow(/source bytes/i);
  });

  it('uses the shared production castle preparation path before visual rendering', () => {
    const main = readFileSync(resolve(
      process.cwd(),
      'src/dev/castleLodVisualEvidenceMain.ts'
    ), 'utf8');
    expect(main).toContain("prepareHegemonyKeepScene(source, preparation)");
    expect(main).toContain("prepareHegemonyKeepScene(high, preparation)");
    expect(main).toContain("prepareHegemonyKeepScene(balanced, preparation)");
    expect(main).toContain("prepareHegemonyKeepScene(compact, preparation)");
    expect(main).toContain('renderer.capabilities.getMaxAnisotropy()');
    expect(main).toContain('renderer.readRenderTargetPixels');
    expect(main).not.toMatch(/(?:localStorage|sessionStorage|document\.cookie)/u);
  });
});
