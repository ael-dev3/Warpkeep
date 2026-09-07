import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const { zipSync } = createRequire(new URL('../../services/release-recovery/package.json', import.meta.url))('fflate') as {
  zipSync(files: Record<string, Uint8Array>, options: { level: number; mtime: Date }): Uint8Array;
};
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function tarFile(path: string, body: Buffer): Buffer {
  const header = Buffer.alloc(512);
  header.write(path);
  for (const [offset, length, value] of [[100, 8, 0o644], [108, 8, 0], [116, 8, 0], [124, 12, body.length],
    [136, 12, 0], [329, 8, 0], [337, 8, 0]]) header.write(`${value!.toString(8).padStart(length! - 1, '0')}\0`, offset!);
  header.fill(32, 148, 156); header[156] = 48; header.write('ustar\0', 257); header.write('00', 263);
  header.write(`${header.reduce((sum, byte) => sum + byte, 0).toString(8).padStart(6, '0')}\0 `, 148);
  return Buffer.concat([header, body, Buffer.alloc((512 - body.length % 512) % 512)]);
}
/** Synthetic archive only; never release evidence or a production attestation. */
export function recoveryArtifactNativeFixture() {
  const identity = { candidateCommit: 'a'.repeat(40), candidateTree: 'b'.repeat(40), recoveryAuthorizationCoreSha256: '1'.repeat(64),
    sourceClosureProfile: 'warpkeep-0.4.0-recovery-source-closure-v1', sourceClosureSha256: '2'.repeat(64) };
  const html = Buffer.from('<!doctype html><title>Test fixture only</title>');
  const manifest = Buffer.from(JSON.stringify([{ path: 'index.html', byteLength: html.length, sha256: hash(html) }]));
  const attestation = Buffer.from(JSON.stringify({ schemaVersion: 1, profile: 'warpkeep-deployment-attestation-v1', ...identity,
    releaseVersion: '0.4.0', canonicalOrigin: 'https://warpkeep.com', contentManifestSha256: hash(manifest) }));
  const tar = Buffer.concat([tarFile('index.html', html), tarFile('.well-known/warpkeep-deployment-v1.json', attestation), Buffer.alloc(1024)]);
  const zip = Buffer.from(zipSync({ 'artifact.tar': tar }, { level: 6, mtime: new Date('2026-01-01T00:00:00Z') }));
  // Match the pinned upload action's Unix creator and regular-file attributes,
  // as in the archive parser's existing fflate compatibility fixtures.
  const central = zip.readUInt32LE(zip.length - 22 + 16);
  zip.writeUInt16LE(0x032d, central + 4); zip.writeUInt32LE(0x81a40020, central + 38);
  const metadata = { pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
    candidateCommit: identity.candidateCommit, artifactId: '789', artifactName: 'github-pages-recovery-123-1',
    artifactSize: zip.length, advertisedArchiveSha256: hash(zip), artifactEtag: 'test-etag' };
  return { identity, metadata, zip, expected: { githubArtifactArchiveSha256: hash(zip), innerArtifactTarSha256: hash(tar),
    contentManifestSha256: hash(manifest), deploymentAttestationSha256: hash(attestation) } };
}
