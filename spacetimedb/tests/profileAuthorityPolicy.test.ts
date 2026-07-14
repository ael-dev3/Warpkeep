import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FARCASTER_WALLET_POLICY_VERSION,
  normalizeTrustedPublicProfile,
  normalizeTrustedWalletAttribution,
  trustedProfilesEqual,
} from '../src/profileAuthorityPolicy';

test('trusted public profile snapshots are normalized, bounded, and HTTPS-only', () => {
  const normalized = normalizeTrustedPublicProfile({
    canonicalUsername: '  Keeper.ETH  ',
    displayName: '  Keeper\u0000   <b>Prime</b>  ',
    pfpUrl: 'https://images.example.test/avatar.png#tracking',
    publicBio: `<script>discard()</script>${'x'.repeat(400)}`,
  });
  assert.equal(normalized.canonicalUsername, 'keeper.eth');
  assert.equal(normalized.displayName, 'Keeper Prime');
  assert.equal(normalized.pfpUrl, 'https://images.example.test/avatar.png');
  assert.equal([...normalized.publicBio!].length, 320);
  assert.equal(normalized.publicBio!.includes('<'), false);
  assert.equal(trustedProfilesEqual(normalized, { ...normalized }), true);

  assert.throws(
    () => normalizeTrustedPublicProfile({ pfpUrl: 'javascript:alert(1)' }),
    /PROFILE_PFP_URL_INVALID/,
  );
  assert.throws(
    () => normalizeTrustedPublicProfile({ canonicalUsername: 'invalid username' }),
    /PROFILE_USERNAME_INVALID/,
  );
});

test('public labels strip bidi, isolate, and zero-width spoofing controls but retain Unicode', () => {
  const normalized = normalizeTrustedPublicProfile({
    displayName: 'Sir\u202eabc\u202c 🏰 Željko\u200b',
    publicBio: 'مرحبا\u061c\u2066spoof\u2069 — 世界\ufeff',
  });
  assert.equal(normalized.displayName, 'Sir abc 🏰 Željko');
  assert.equal(normalized.publicBio, 'مرحبا spoof — 世界');
  assert.doesNotMatch(
    `${normalized.displayName}${normalized.publicBio}`,
    /[\u061c\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/,
  );
});

test('private wallet snapshots pin key shape, address class, source, and policy', () => {
  const normalized = normalizeTrustedWalletAttribution({
    attributionKey: 'ab'.repeat(32),
    address: `0x${'CD'.repeat(20)}`,
    addressType: 'verified_evm',
    source: 'snapchain_verification',
    attributionPolicyVersion: FARCASTER_WALLET_POLICY_VERSION,
    active: true,
  });
  assert.equal(normalized.address, `0x${'cd'.repeat(20)}`);
  assert.equal(normalized.active, true);

  assert.throws(
    () => normalizeTrustedWalletAttribution({ ...normalized, addressType: 'browser' }),
    /WALLET_ADDRESS_TYPE_INVALID/,
  );
  assert.throws(
    () => normalizeTrustedWalletAttribution({ ...normalized, attributionPolicyVersion: 'latest' }),
    /WALLET_POLICY_MISMATCH/,
  );
});
