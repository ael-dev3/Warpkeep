// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { parsePtrNativeBridgeResponseEnvelope } from '../scripts/ptr-auth-bridge-native-operator';
import { PTR_BRIDGE_ACCOUNT, PTR_BRIDGE_WORKER, PTR_BRIDGE_LATEST_UPLOAD_PATH, assertNativeBridgeLatestUpload } from '../scripts/ptr-auth-bridge-native-core.mjs';

const domains = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/domains?service=${PTR_BRIDGE_WORKER}`;
const base = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts/${PTR_BRIDGE_WORKER}`;
const inventory = (page: number | string) => `${base}/versions?deployable=true&page=${page}&per_page=100`;
const envelope = () => ({ success: true, errors: [] as unknown, messages: [] as unknown,
  result: [{ service: PTR_BRIDGE_WORKER }], result_info: { total_count: 1 } });

describe('fixed Cloudflare observed GET response representations', () => {
  test('accepts the actual observed paired null lists on only the fixed domains GET', () => {
    // Actual HTTP200 shape observed 2026-10-03T17:58:19.656Z; retained metadata SHA256
    // b64a1058db4a6eaa618fcf6406f675b24217cb067c0e091b8abc7e43264c8c0d.
    // This parser regression is not provider permission, domain validity or deployment proof.
    const value = { ...envelope(), errors: null, messages: null };
    expect(parsePtrNativeBridgeResponseEnvelope(value, domains, 'GET'))
      .toEqual({ result: value.result, resultInfo: value.result_info });
    expect(value.errors).toBeNull(); expect(value.messages).toBeNull();
  });
  test('accepts paired null lists on the actual exact latest-upload GET and preserves the version inventory', () => {
    // Actual authenticated HTTP200 shape: metadata-only receipt
    // october-release-existing-admin-envelope-readonly-v1.json SHA256
    // 75b6988fe48764816c2db804b516d05d2fb7c77647be7a3ad0435d141fb86225.
    const versionId = '11111111-1111-4111-8111-111111111111';
    const result = { items: [{ id: versionId, number: 42 }] };
    const resultInfo = { count: 1, page: 1, per_page: 1, total_count: 3, total_pages: 3 };
    const value = { success: true, errors: null, messages: null, result, result_info: resultInfo };
    const parsed = parsePtrNativeBridgeResponseEnvelope(value, PTR_BRIDGE_LATEST_UPLOAD_PATH, 'GET');
    expect(parsed.result).toBe(result); expect(parsed.resultInfo).toBe(resultInfo);
    expect(() => assertNativeBridgeLatestUpload(parsed.result, parsed.resultInfo, versionId, 42)).not.toThrow();
    expect(() => assertNativeBridgeLatestUpload(parsed.result, parsed.resultInfo, versionId, 43))
      .toThrow('PTR_NATIVE_BRIDGE_LATEST_UPLOAD_CHANGED');
    const wrongInventory = parsePtrNativeBridgeResponseEnvelope({ ...value, result: { items: [] } }, PTR_BRIDGE_LATEST_UPLOAD_PATH, 'GET');
    expect(() => assertNativeBridgeLatestUpload(wrongInventory.result, wrongInventory.resultInfo, versionId, 42))
      .toThrow('PTR_NATIVE_BRIDGE_LATEST_UPLOAD_CHANGED');
  });
  test.each([1, 100])('accepts paired null lists on only canonical inventory page %s without rewriting its result', page => {
    // Authenticated page-1 HTTP200 shape is retained in the metadata-only
    // october-release-native-bridge-version-inventory-envelope-v1.json receipt,
    // SHA256 86b4c3138ee080aed969e7c65e20f3630a95e8020f6bcc08d775ec44f381723a.
    const result = { items: [{ id: '11111111-1111-4111-8111-111111111111', annotations: { 'workers/tag': 'test-candidate' } }] };
    const resultInfo = { page, per_page: 100 };
    const value = { success: true, errors: null, messages: null, result, result_info: resultInfo };
    const parsed = parsePtrNativeBridgeResponseEnvelope(value, inventory(page), 'GET');
    expect(parsed.result).toBe(result); expect(parsed.resultInfo).toBe(resultInfo);
    expect(value.errors).toBeNull(); expect(value.messages).toBeNull();
  });
  test.each([0, 101, '01', '001', '+1', '1.0', '1e0', '-1', '1 ', ' 1', '1\n'])('refuses noncanonical or out-of-bound inventory page %s', page => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, inventory(page), 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test.each([
    inventory(1).replace('deployable=true', 'deployable=false'), inventory(1).replace('deployable=true&', ''),
    inventory(1).replace('page=1&per_page=100', 'per_page=100&page=1'),
    inventory(1).replace('per_page=100', 'per_page=99'), `${inventory(1)}&extra=true`, `${inventory(1)}\n`,
    inventory(1).replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)), inventory(1).replace(PTR_BRIDGE_WORKER, 'other-worker'),
  ])('refuses wrong inventory filter, query shape or fixed target: %s', path => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, path, 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test('preserves normal empty array envelopes and their result without coercion', () => {
    const value = envelope();
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100), `${base}/deployments`, `${base}/subdomain`, `${base}/script-settings`,
      `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts`, `${base}/versions/11111111-1111-4111-8111-111111111111`,
      `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/services/${PTR_BRIDGE_WORKER}/environments/production/routes?show_zonename=true`]) {
      const result = parsePtrNativeBridgeResponseEnvelope(value, path, 'GET');
      expect(result.result).toBe(value.result); expect(result.resultInfo).toBe(value.result_info);
    }
    expect(parsePtrNativeBridgeResponseEnvelope(value, `${base}/versions?bindings_inherit=strict`, 'POST').result).toBe(value.result);
  });
  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'get'])('refuses null lists on %s regardless of the fixed path', method => {
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100)]) {
      expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, path, method))
        .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
    }
  });
  test.each([`${base}/deployments`, `${base}/versions?bindings_inherit=strict`, `${base}/subdomain`,
    domains.replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)), domains.replace(PTR_BRIDGE_WORKER, 'other-worker'),
    `${domains}&page=1`, domains.split('?')[0]!, `${base}/versions`,
    `${base}/versions?page=2&per_page=1`, `${base}/versions?page=1&per_page=2`,
    `${base}/versions?per_page=1&page=1`, `${base}/versions?deployable=true&page=1&per_page=1`,
    `${PTR_BRIDGE_LATEST_UPLOAD_PATH}&extra=true`,
    PTR_BRIDGE_LATEST_UPLOAD_PATH.replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)),
    PTR_BRIDGE_LATEST_UPLOAD_PATH.replace(PTR_BRIDGE_WORKER, 'other-worker')])('refuses null lists on every other endpoint: %s', path => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, path, 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test.each([
    { errors: null, messages: [] }, { errors: [], messages: null },
    { errors: undefined, messages: null }, { errors: null, messages: undefined },
    { errors: {}, messages: null }, { errors: null, messages: {} },
    { errors: 'none', messages: null }, { errors: null, messages: false },
    { errors: [{ code: 1 }], messages: [] }, { errors: [], messages: ['warning'] },
  ])('rejects missing, mixed, nonempty or arbitrary error/message fields', fields => {
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100)]) {
      expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), ...fields }, path, 'GET'))
        .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
    }
  });
  test('does not waive success or own-result guards on any observed fixed GET', () => {
    const value = { ...envelope(), errors: null, messages: null };
    for (const path of [domains, PTR_BRIDGE_LATEST_UPLOAD_PATH, inventory(1), inventory(100)]) {
      for (const success of [false, null, undefined, 1, 'true']) {
        expect(() => parsePtrNativeBridgeResponseEnvelope({ ...value, success }, path, 'GET'))
          .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
      }
      const { result: _discarded, ...missing } = value;
      expect(() => parsePtrNativeBridgeResponseEnvelope(missing, path, 'GET')).toThrow();
      expect(() => parsePtrNativeBridgeResponseEnvelope(Object.assign(Object.create({ result: [] }), missing), path, 'GET')).toThrow();
    }
  });
  test('still requires explicit success true and an own result', () => {
    for (const success of [false, null, undefined, 1, 'true']) {
      expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null, success }, domains, 'GET')).toThrow();
    }
    const { result: _discarded, ...missing } = { ...envelope(), errors: null, messages: null };
    expect(() => parsePtrNativeBridgeResponseEnvelope(missing, domains, 'GET')).toThrow();
    const inherited = Object.assign(Object.create({ result: [] }), missing);
    expect(() => parsePtrNativeBridgeResponseEnvelope(inherited, domains, 'GET')).toThrow();
    for (const value of [null, [], 'ok', 1]) expect(() => parsePtrNativeBridgeResponseEnvelope(value, domains, 'GET')).toThrow();
  });
});
