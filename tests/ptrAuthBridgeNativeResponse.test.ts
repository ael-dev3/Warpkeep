// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { parsePtrNativeBridgeResponseEnvelope } from '../scripts/ptr-auth-bridge-native-operator';
import { PTR_BRIDGE_ACCOUNT, PTR_BRIDGE_WORKER } from '../scripts/ptr-auth-bridge-native-core.mjs';

const domains = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/domains?service=${PTR_BRIDGE_WORKER}`;
const base = `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts/${PTR_BRIDGE_WORKER}`;
const envelope = () => ({ success: true, errors: [] as unknown, messages: [] as unknown,
  result: [{ service: PTR_BRIDGE_WORKER }], result_info: { total_count: 1 } });

describe('fixed Cloudflare domains GET response representation', () => {
  test('accepts the actual observed paired null lists on only the fixed domains GET', () => {
    // Actual HTTP200 shape observed 2026-10-03T17:58:19.656Z; retained metadata SHA256
    // b64a1058db4a6eaa618fcf6406f675b24217cb067c0e091b8abc7e43264c8c0d.
    // This parser regression is not provider permission, domain validity or deployment proof.
    const value = { ...envelope(), errors: null, messages: null };
    expect(parsePtrNativeBridgeResponseEnvelope(value, domains, 'GET'))
      .toEqual({ result: value.result, resultInfo: value.result_info });
    expect(value.errors).toBeNull(); expect(value.messages).toBeNull();
  });
  test('preserves normal empty array envelopes and their result without coercion', () => {
    const value = envelope();
    for (const path of [domains, `${base}/deployments`, `${base}/subdomain`, `${base}/script-settings`,
      `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/scripts`, `${base}/versions/11111111-1111-4111-8111-111111111111`,
      `/accounts/${PTR_BRIDGE_ACCOUNT}/workers/services/${PTR_BRIDGE_WORKER}/environments/production/routes?show_zonename=true`]) {
      const result = parsePtrNativeBridgeResponseEnvelope(value, path, 'GET');
      expect(result.result).toBe(value.result); expect(result.resultInfo).toBe(value.result_info);
    }
    expect(parsePtrNativeBridgeResponseEnvelope(value, `${base}/versions?bindings_inherit=strict`, 'POST').result).toBe(value.result);
  });
  test.each(['POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'get'])('refuses null lists on %s regardless of the fixed path', method => {
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), errors: null, messages: null }, domains, method))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
  });
  test.each([`${base}/deployments`, `${base}/versions?bindings_inherit=strict`, `${base}/subdomain`,
    domains.replace(PTR_BRIDGE_ACCOUNT, '0'.repeat(32)), domains.replace(PTR_BRIDGE_WORKER, 'other-worker'),
    `${domains}&page=1`, domains.split('?')[0]!])('refuses null lists on every other endpoint: %s', path => {
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
    expect(() => parsePtrNativeBridgeResponseEnvelope({ ...envelope(), ...fields }, domains, 'GET'))
      .toThrow('PTR_NATIVE_BRIDGE_RESPONSE_ENVELOPE');
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
