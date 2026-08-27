// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  ADMISSION_REQUEST_SUSPENSION_PROFILE,
  verifyAdmissionRequestSuspensionLive,
} from '../scripts/verify-admission-request-suspension.mjs';

const BRIDGE = 'https://auth.warpkeep.com';
const SUSPENDED_BODY = JSON.stringify({
  error: {
    code: 'admission_requests_suspended',
    message: 'New admission requests are temporarily suspended.',
  },
});

function suspensionResponse(overrides: ResponseInit = {}) {
  return new Response(SUSPENDED_BODY, {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': 'https://warpkeep.com',
      ...overrides.headers,
    },
    ...overrides,
  });
}

describe('live admission-request suspension probe', () => {
  it('requires exact POST and OPTIONS refusals while status preflight stays available', async () => {
    const observedRequests: Request[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const request = input instanceof Request ? input : new Request(input);
      observedRequests.push(request.clone());
      const url = new URL(request.url);
      expect(request.redirect).toBe('manual');
      expect(url.origin).toBe(BRIDGE);
      if (url.pathname === '/v2/access/request') {
        expect(['POST', 'OPTIONS']).toContain(request.method);
        return suspensionResponse();
      }
      expect(url.pathname).toBe('/v2/access/status');
      expect(request.method).toBe('OPTIONS');
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': 'https://warpkeep.com',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
      });
    });

    const result = await verifyAdmissionRequestSuspensionLive({
      bridgeOrigin: BRIDGE,
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(observedRequests.map(request => (
      `${new URL(request.url).pathname}:${request.method}`
    ))).toEqual([
      '/v2/access/request:OPTIONS',
      '/v2/access/request:POST',
      '/v2/access/status:OPTIONS',
    ]);
    expect(await observedRequests[0]?.text()).toBe('');
    expect(await observedRequests[1]?.text()).toBe('{}');
    expect(await observedRequests[2]?.text()).toBe('');
    expect(result.receipt).toEqual({
      schemaVersion: 1,
      profile: ADMISSION_REQUEST_SUSPENSION_PROFILE,
      bridgeOrigin: BRIDGE,
      requestPath: '/v2/access/request',
      postStatus: 503,
      optionsStatus: 503,
      errorCode: 'admission_requests_suspended',
      errorMessage: 'New admission requests are temporarily suspended.',
      statusPath: '/v2/access/status',
      statusOptionsStatus: 204,
      requestSubmissionsSuspended: true,
      readOnlyStatusAvailable: true,
    });
    expect(result.receiptSha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('does not send POST when the non-mutating request preflight is not sealed', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => new Response(null, {
      status: 403,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'access-control-allow-origin': 'https://warpkeep.com',
      },
    }));

    await expect(verifyAdmissionRequestSuspensionLive({
      bridgeOrigin: BRIDGE,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = fetchImpl.mock.calls[0]?.[0];
    expect(request).toBeInstanceOf(Request);
    if (!(request instanceof Request)) {
      throw new TypeError('Expected the suspension probe to issue a Request.');
    }
    expect(request.method).toBe('OPTIONS');
  });

  it.each([
    ['redirect', () => new Response(null, {
      status: 302,
      headers: { location: 'https://elsewhere.example/' },
    })],
    ['wrong code', () => new Response(JSON.stringify({
      error: { code: 'public_auth_paused', message: 'paused' },
    }), { status: 503, headers: { 'content-type': 'application/json' } })],
    ['extra field', () => new Response(JSON.stringify({
      error: {
        code: 'admission_requests_suspended',
        message: 'New admission requests are temporarily suspended.',
        detail: 'unexpected',
      },
    }), { status: 503, headers: { 'content-type': 'application/json' } })],
  ])('fails closed on a %s response', async (_label, response) => {
    await expect(verifyAdmissionRequestSuspensionLive({
      bridgeOrigin: BRIDGE,
      fetchImpl: vi.fn(async () => response()),
    })).rejects.toMatchObject({
      code: 'ADMISSION_REQUEST_SUSPENSION_RESPONSE_INVALID',
    });
  });

  it('rejects a suspended or missing status surface', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL) => (
      fetchImpl.mock.calls.length < 3
        ? suspensionResponse()
        : suspensionResponse()
    ));
    await expect(verifyAdmissionRequestSuspensionLive({
      bridgeOrigin: BRIDGE,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'ADMISSION_REQUEST_STATUS_SURFACE_UNAVAILABLE',
    });
  });
});
