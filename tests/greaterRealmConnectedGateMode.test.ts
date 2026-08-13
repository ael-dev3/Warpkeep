import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION,
  GREATER_REALM_ACTIVATION_GATE_TRUE_DECLARATION,
  GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES,
  GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
  GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION,
  assertGreaterRealmConnectedDisposableGateMode,
  normalizeGreaterRealmConnectedDisposableGateMode,
  parseGreaterRealmConnectedProductionGateMode,
  type GreaterRealmConnectedGateMode,
} from '../scripts/greater-realm-connected-gate-mode';

function policy(mode: GreaterRealmConnectedGateMode): string {
  return [
    '// exact connected gate fixture',
    mode[0] === 'T'
      ? GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION
      : GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
    'export const UNRELATED_POLICY_BYTE = 17;',
    mode[1] === 'T'
      ? GREATER_REALM_ACTIVATION_GATE_TRUE_DECLARATION
      : GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION,
    '',
  ].join('\n');
}

describe('Greater Realm connected production gate-mode parser', () => {
  it('accepts exactly the reviewed FF, TF, and FT protected-main modes', () => {
    expect(GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES).toEqual(['FF', 'TF', 'FT']);
    for (const mode of GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES) {
      expect(parseGreaterRealmConnectedProductionGateMode(policy(mode))).toEqual({
        mode,
        importMutationsAllowed: mode[0] === 'T',
        activationMutationsAllowed: mode[1] === 'T',
      });
    }
  });

  it('rejects TT plus missing, duplicated, nonliteral, and disguised declarations', () => {
    expect(() => parseGreaterRealmConnectedProductionGateMode(policy('TT')))
      .toThrow(/both open/i);
    const exact = policy('FF');
    for (const malformed of [
      exact.replace(`${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}\n`, ''),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        `${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}\n${GREATER_REALM_IMPORT_GATE_TRUE_DECLARATION}`,
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = Boolean(false);',
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        `// ${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}`,
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        `/*\n${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}\n*/`,
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        `const disguised = '${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}';`,
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        ` ${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}`,
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        `${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION} void 0;`,
      ),
      exact.replace(
        GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION,
        `if (false) {\n${GREATER_REALM_IMPORT_GATE_FALSE_DECLARATION}\n}`,
      ),
      exact.replace(
        GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION,
        `// GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED\n${GREATER_REALM_ACTIVATION_GATE_FALSE_DECLARATION}`,
      ),
    ]) {
      expect(() => parseGreaterRealmConnectedProductionGateMode(malformed))
        .toThrow(/missing, duplicated, or malformed/i);
    }
  });

  it('normalizes every reviewed mode to TF or TT without changing other bytes', () => {
    for (const initialMode of GREATER_REALM_CONNECTED_PRODUCTION_GATE_MODES) {
      for (const targetMode of ['TF', 'TT'] as const) {
        const source = policy(initialMode);
        const normalized = normalizeGreaterRealmConnectedDisposableGateMode(
          source,
          targetMode,
        );
        expect(normalized).toBe(policy(targetMode));
        expect(source).toBe(policy(initialMode));
        expect(() => assertGreaterRealmConnectedDisposableGateMode(
          normalized,
          targetMode,
        )).not.toThrow();
      }
    }
  });

  it('will not normalize unreviewed or malformed production input', () => {
    expect(() => normalizeGreaterRealmConnectedDisposableGateMode(policy('TT'), 'TF'))
      .toThrow(/both open/i);
    expect(() => normalizeGreaterRealmConnectedDisposableGateMode(
      policy('FF').replace(' = false;', ' = 0;'),
      'TT',
    )).toThrow(/missing, duplicated, or malformed/i);
    expect(() => assertGreaterRealmConnectedDisposableGateMode(policy('TF'), 'TT'))
      .toThrow(/expected TT/i);
    expect(() => normalizeGreaterRealmConnectedDisposableGateMode(
      policy('FF'),
      'FF' as never,
    )).toThrow(/target gate mode was invalid/i);
    expect(() => assertGreaterRealmConnectedDisposableGateMode(
      policy('TF'),
      'FT' as never,
    )).toThrow(/expected gate mode was invalid/i);
  });
});
