import { createHash } from 'node:crypto';
import { types } from 'node:util';

const BASELINE = '2ae51984e1fa6ce5b0028c1a250359fed79d819b';
const FROZEN_TREE = '90deebb5faf4129282f5c35999244f540001b27d';
const fail = () => { throw new Error('LOCAL_PROGRAM_ARTIFACT_INVALID'); };

// Data retention only. The fixed native runtime owns build/source authentication;
// this helper does not turn caller-provided bytes into recovery authority.
export function retainLocalProgramArtifact(input, keccak256) {
  if (types.isProxy(input) || !input || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) fail();
  const keys = ['realm', 'sourceCommit', 'sourceTree', 'moduleTreeId',
    'dependencyClosureDigest', 'bundle', 'bundleSha256'];
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Reflect.ownKeys(descriptors).length !== keys.length) fail();
  const value = Object.fromEntries(keys.map(key => {
    const descriptor = descriptors[key];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
    return [key, descriptor.value];
  }));
  if (!['genesis001', 'genesis002'].includes(value.realm)
      || ![value.sourceCommit, value.sourceTree, value.moduleTreeId].every(x => typeof x === 'string' && /^[a-f0-9]{40}$/.test(x))
      || ![value.dependencyClosureDigest, value.bundleSha256].every(x => typeof x === 'string' && /^[a-f0-9]{64}$/.test(x))
      || types.isProxy(value.bundle) || !types.isUint8Array(value.bundle)
      || value.bundle.byteLength < 1 || value.bundle.byteLength > 32 * 1024 * 1024
      || typeof keccak256 !== 'function'
      || (value.realm === 'genesis001' && value.moduleTreeId !== FROZEN_TREE)) fail();
  const bytes = Buffer.from(value.bundle);
  try {
    if (createHash('sha256').update(bytes).digest('hex') !== value.bundleSha256) fail();
    const digest = keccak256(bytes);
    if (!types.isUint8Array(digest) || digest.byteLength !== 32
        || createHash('sha256').update(bytes).digest('hex') !== value.bundleSha256) fail();
    return Object.freeze({
      profile: 'warpkeep-local-program-artifact-v1', realm: value.realm,
      sourceCommit: value.sourceCommit, sourceTree: value.sourceTree,
      moduleSourceCommit: value.realm === 'genesis001' ? BASELINE : value.sourceCommit,
      moduleTreeId: value.moduleTreeId, dependencyClosureDigest: value.dependencyClosureDigest,
      nodeVersion: value.realm === 'genesis001' ? '24.19.0' : '22.22.3',
      programArtifactSha256: value.bundleSha256, programHashAlgorithm: 'keccak-256',
      programKeccak256: Buffer.from(digest).toString('hex'),
      artifactBytes: bytes.length, artifactBase64: bytes.toString('base64'),
    });
  } finally { bytes.fill(0); }
}
