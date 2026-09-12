// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalizePtrRawV10,
  describePtrArtifact,
} from '../scripts/ptr-artifact-description.mjs';
const bytes = readFileSync(
  new URL(
    './fixtures/ptr-artifact-description-2.6.1/first.json',
    import.meta.url,
  ),
);
const second = readFileSync(
  new URL(
    './fixtures/ptr-artifact-description-2.6.1/second.json',
    import.meta.url,
  ),
);
const fixture = () => JSON.parse(bytes.toString());
const section = (v: any, name: string) =>
  v.V10.sections.find((s: any) => name in s)[name];
const canon = (v: any) => canonicalizePtrRawV10(Buffer.from(JSON.stringify(v)));
describe('complete artifact RawV10 description', () => {
  it('normalizes actual independently extracted schemas without changing ordered types', () => {
    const a = canonicalizePtrRawV10(bytes),
      b = canonicalizePtrRawV10(second);
    expect(a).toEqual(b);
    expect(a.definition.sections.find((s: any) => 'Typespace' in s)).toEqual(
      fixture().V10.sections[0],
    );
    expect(Object.isFrozen(a.definition.sections)).toBe(true);
  });
  it.each(['Types', 'Tables', 'Procedures', 'Schedules', 'ExplicitNames'])(
    'rejects duplicate %s identities',
    (name) => {
      const v = fixture();
      const values =
        name === 'ExplicitNames' ? section(v, name).entries : section(v, name);
      values.push(structuredClone(values[0]));
      expect(() => canon(v)).toThrow();
    },
  );
  it.each(['columns', 'variants', 'typespace', 'reducers', 'procedures'])(
    'preserves semantic %s order',
    (kind) => {
      const v = fixture();
      const types = section(v, 'Typespace').types;
      if (kind === 'columns') types[0].Product.elements.reverse();
      if (kind === 'variants')
        types[2].Product.elements
          .find((e: any) => e.algebraic_type.Sum)
          .algebraic_type.Sum.variants.reverse();
      if (kind === 'typespace')
        [types[types.length - 1], types[types.length - 2]] = [
          types[types.length - 2],
          types[types.length - 1],
        ];
      if (kind === 'reducers') section(v, 'Reducers').reverse();
      if (kind === 'procedures') section(v, 'Procedures').reverse();
      expect(canon(v).digest).not.toBe(canonicalizePtrRawV10(bytes).digest);
    },
  );
  it.each([
    'unknownSection',
    'unknownField',
    'duplicateSection',
    'invalidRef',
    'view',
    'rls',
    'http',
    'default',
  ])('rejects unsupported or malformed %s', (kind) => {
    const v = fixture();
    if (kind === 'unknownSection') v.V10.sections.push({ FutureSection: [] });
    if (kind === 'unknownField') section(v, 'Tables')[0].future = true;
    if (kind === 'duplicateSection') v.V10.sections.push(v.V10.sections[0]);
    if (kind === 'invalidRef')
      section(v, 'Tables')[0].product_type_ref = 999999;
    if (kind === 'view') v.V10.sections.push({ Views: [{}] });
    if (kind === 'rls') v.V10.sections.push({ RowLevelSecurity: [{}] });
    if (kind === 'http') v.V10.sections.push({ HttpHandlers: [{}] });
    if (kind === 'default') section(v, 'Tables')[0].default_values.push({});
    expect(() => canon(v)).toThrow();
  });
  it.each(['indexes', 'constraints', 'sequences'])(
    'rejects duplicate table %s identities',
    (name) => {
      const v = fixture();
      const table = section(v, 'Tables').find((t: any) => t[name].length);
      table[name].push(structuredClone(table[name][0]));
      expect(() => canon(v)).toThrow();
    },
  );
  it('rejects duplicate JSON keys and unsafe integer precision', () => {
    expect(() =>
      canonicalizePtrRawV10(Buffer.from('{"V10":{},"V10":{}}')),
    ).toThrow();
    expect(() =>
      canonicalizePtrRawV10(
        Buffer.from(
          bytes
            .toString()
            .replace('"increment":1', '"increment":9007199254740993'),
        ),
      ),
    ).toThrow();
  });
  it('runs only attested standalone against owned fd and binds source bytes', () => {
    const calls: any[] = [];
    let verifies = 0;
    let checks = 0;
    const result = describePtrArtifact({
      artifactDescriptor: 9,
      artifactSha256: 'a'.repeat(64),
      assertArtifact: () => {
        checks++;
      },
      cli: {
        directory: '/private/cli',
        provenance: { standaloneExecutableSha256: 'b'.repeat(64) },
        verify: () => {
          verifies++;
        },
      },
      spawn: (...args: any[]) => {
        calls.push(args);
        return { status: 0, stdout: bytes, stderr: Buffer.alloc(0) };
      },
    });
    expect(result.artifactSha256).toBe('a'.repeat(64));
    expect(result.standaloneExecutableSha256).toBe('b'.repeat(64));
    expect(verifies).toBe(2);
    expect(checks).toBe(2);
    expect(calls[0][0]).toBe(join('/private/cli', 'spacetimedb-standalone'));
    expect(calls[0][1]).toEqual([
      'extract-schema',
      '/dev/fd/3',
      '--host-type',
      'js',
    ]);
    expect(calls[0][2].stdio).toEqual(['ignore', 'pipe', 'pipe', 9]);
    expect(calls[0][2].killSignal).toBe('SIGKILL');
    expect(calls[0][2].env).not.toHaveProperty('SPACETIME_TOKEN');
    expect(result.descriptionSha256).toBe(canonicalizePtrRawV10(bytes).digest);
  });
  it.each([
    { status: 1 },
    { status: 0, error: new Error('timeout') },
    { status: 0, signal: 'SIGKILL' },
    { status: 0, stdout: Buffer.from('{}'), stderr: Buffer.alloc(0) },
  ])('rejects failed extraction without a description', (outcome) => {
    expect(() =>
      describePtrArtifact({
        artifactDescriptor: 9,
        artifactSha256: 'a'.repeat(64),
        assertArtifact: () => {},
        cli: {
          directory: '/private/cli',
          provenance: { standaloneExecutableSha256: 'b'.repeat(64) },
          verify: () => {},
        },
        spawn: () => outcome,
      }),
    ).toThrow();
  });
});
