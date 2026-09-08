// @vitest-environment node
import { createHash } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3';
import { describe, expect, it } from 'vitest';
import { retainLocalProgramArtifact } from '../scripts/local-program-artifact.mjs';

const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const input = () => {
  const bundle = Buffer.from('abc');
  return { realm: 'genesis002' as const, sourceCommit: 'a'.repeat(40), sourceTree: 'b'.repeat(40),
    moduleTreeId: 'c'.repeat(40), dependencyClosureDigest: 'd'.repeat(64), bundle,
    bundleSha256: hash(bundle) };
};
describe('retained native program artifact', () => {
  it('hashes exact bytes with Keccak256, retains them independently, and preserves provenance', () => {
    const value = input();
    const result = retainLocalProgramArtifact(value, keccak_256);
    value.bundle.fill(0);
    expect(result.programKeccak256).toBe('4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45');
    expect(result.programKeccak256).not.toBe(createHash('sha3-256').update('abc').digest('hex'));
    expect(Buffer.from(result.artifactBase64, 'base64').toString()).toBe('abc');
    expect(result.moduleSourceCommit).toBe(value.sourceCommit);
    expect(result.moduleTreeId).toBe(value.moduleTreeId);
    expect(Object.isFrozen(result)).toBe(true);
  });
  it('selects the fixed frozen G001 source, never current-root diagnostic code', () => {
    const result = retainLocalProgramArtifact({ ...input(), realm: 'genesis001',
      moduleTreeId: '90deebb5faf4129282f5c35999244f540001b27d' }, keccak_256);
    expect(result.moduleSourceCommit).toBe('2ae51984e1fa6ce5b0028c1a250359fed79d819b');
    expect(result.nodeVersion).toBe('24.19.0');
    expect(() => retainLocalProgramArtifact({ ...input(), realm: 'genesis001-current' }, keccak_256)).toThrow();
  });
  it('rejects changed artifact bytes and malformed digest output', () => {
    expect(() => retainLocalProgramArtifact({ ...input(), bundleSha256: '0'.repeat(64) }, keccak_256)).toThrow();
    expect(() => retainLocalProgramArtifact(input(), () => new Uint8Array(31))).toThrow();
  });
});
