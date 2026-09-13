// @vitest-environment node
import { expect, it, vi } from 'vitest';
import * as publisher from '../scripts/genesis002-production-publisher.mjs';

it.each(['object', 'copy', 'proxy', 'null'] as const)('rejects an unowned G002 artifact (%s) before accessing caller code', kind => {
  const attest = vi.fn();
  const object = Object.freeze({ assertSourceAndArtifact: attest });
  const value = kind === 'null' ? null : kind === 'proxy'
    ? new Proxy(object, { get: () => { attest(); throw new Error('caller property accessed'); } })
    : kind === 'copy' ? { ...object } : object;
  expect(() => publisher.assertGenesis002SourceBuiltArtifact(value)).toThrow('GENESIS_002_ARTIFACT_CAPABILITY_INVALID');
  expect(attest).not.toHaveBeenCalled();
});
