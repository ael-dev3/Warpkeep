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
