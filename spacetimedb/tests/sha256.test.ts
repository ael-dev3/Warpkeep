import assert from 'node:assert/strict';
import test from 'node:test';

import {
  Sha256,
  sha256Hex,
  uint64BigEndian,
  updateLengthFramedSha256,
} from '../src/sha256';

test('SHA-256 matches the published standard vectors', () => {
  assert.equal(
    sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  );
  assert.equal(
    sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
  );
  assert.equal(
    sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'),
    '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
  );
});

test('serialized SHA-256 state resumes identically across arbitrary batches', () => {
  const input = 'warpkeep greater realm canonical verification stream';
  const oneShot = new Sha256().update(input).digestHex();

  let resumed = new Sha256().update(input.slice(0, 7));
  resumed = Sha256.deserialize(resumed.serialize()).update(input.slice(7, 19));
  resumed = Sha256.deserialize(resumed.serialize()).update(input.slice(19));

  assert.equal(resumed.digestHex(), oneShot);
  assert.throws(() => Sha256.deserialize('sha256-v1:not-a-state'));
});

test('length-framed streams detect tampering and reordering', () => {
  const bytes = (value: string) => new TextEncoder().encode(value);
  const digest = (frames: readonly string[]) => {
    const hash = new Sha256().update('warpkeep.test.domain\n');
    for (const frame of frames) updateLengthFramedSha256(hash, bytes(frame));
    return hash.digestHex();
  };

  assert.notEqual(digest(['alpha', 'beta']), digest(['beta', 'alpha']));
  assert.notEqual(digest(['alpha', 'beta']), digest(['alpha', 'betA']));
  assert.deepEqual(
    [...uint64BigEndian(0x0102_0304_0506_0708n)],
    [1, 2, 3, 4, 5, 6, 7, 8],
  );
});

test('server framing matches the exporter cross-language UTF-8/u64-BE vector', () => {
  const encoder = new TextEncoder();
  const domain = 'warpkeep.greater-realm.framing-compatibility.v1\n';
  const frames = [
    '{"schema":"wkgr-framing-vector-v1","label":"Lowlands Δ","ordinal":7,"active":false}\n',
    '["T1_LOWLANDS",100,500]\n',
  ];
  const bytes = frames.map(frame => encoder.encode(frame));
  assert.deepEqual(bytes.map(frame => frame.byteLength), [85, 24]);
  assert.deepEqual(
    [...uint64BigEndian(BigInt(bytes[0]!.byteLength))],
    [0, 0, 0, 0, 0, 0, 0, 0x55],
  );
  const hash = new Sha256().update(domain);
  for (const frame of bytes) updateLengthFramedSha256(hash, frame);
  assert.equal(
    hash.digestHex(),
    '68512713b3db4d97f3702f8491d88c23b04f472f6a29f1fe100fe5ce3e58992e',
  );
});

test('server pins the exporter synthetic release header, component, and release vector', () => {
  const header = '{"schema":"warpkeep.greater-realm.runtime-import-manifest.v1","classification":"declassified-tier-i-runtime-import","atlasId":"GENESIS_001_GREATER_REALM","publicReleaseId":"GRR-PF5K4CFVYJXJW4YGI34J53GSR4","publicApprovalReceiptId":"GRA-KWZC3J3XFIVCDQUVY5ZZRC5DCE","sourceCommit":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","generatorVersion":"greater-realm-v2-natural-continent-pr-a.16","sourceFormatVersion":"wkgr-runtime-source-v1","livingWorldVersion":"greater-realm-private-living-world-v4","runtimePartitionVersion":"axial-bin-15-tier-one-filter-v1","rendererContractVersion":"greater-realm-renderer-v1","visibleTierMax":1,"totals":{"regionCount":6,"componentCount":8,"chunkCount":208,"cellCount":16475,"castleSlotCount":600,"resourceNodeCount":12000},"legacyLowlandsBridge":{"mappedCellCount":10000,"mappedCastleSlotCount":100,"mappedResourceCatalogCounts":{"food":96,"wood":96,"stone":96,"gold":24},"worldGenerationDigest":"4c111ec1f5e127c7cfd8f42f87c4085f94a4bc46bdacbdc9779866dfdb3edab6","castleSlotDigest":"d770a084b7c8f59abbc505239a026a98e17bd55d3507c204cd1517858db017ed","goldSiteDigest":"84ea3eed9ff5cd3eb7e4704aee6fb562ef3f969c490e95d3bf88645abded7d7d","foodSiteDigest":"10756337e27138b536a250ad6bf704c603a8c3946c72a1f0d3a041630610ce72","woodSiteDigest":"3f0ae99d2052c32b7fec9aec6126e86f53031c13d619fcef12dd42a02b4063d6","stoneSiteDigest":"22c902d5bfb033e7faf3eaa303e89228d9aad0cff712853618dc34b994d28467"}}\n';
  const vector = Object.freeze({
    headerSha256: 'b36165d389cf860e9fefc37ae52a805ea9d561ec2ba89e05e8f47cb949ff7045',
    firstComponentSha256: '31955d3985dd9f906fe881990e4a051d7df3bfb5d24e3aa555870044a0f0a732',
    releaseSha256: 'c7b6743fa207d24efb03d9b793f9c82e548d4c13a342e78b1bf6d3db256be596',
  });
  assert.equal(new TextEncoder().encode(header).byteLength, 1_421);
  assert.equal(sha256Hex(header), vector.headerSha256);
  for (const digest of Object.values(vector)) assert.match(digest, /^[0-9a-f]{64}$/);
  assert.equal(new Set(Object.values(vector)).size, 3);
});
