import assert from 'node:assert/strict';
import test from 'node:test';

import {
  FARCASTER_WALLET_POLICY_VERSION,
  admissionProfileIsComplete,
  normalizeAdmissionReadyTrustedProfile,
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

test('profile image validation is deterministic in the server runtime and rejects non-public authorities', () => {
  assert.equal(
    normalizeTrustedPublicProfile({
      pfpUrl: 'https://imagedelivery.net/account/profile/public#tracking',
    }).pfpUrl,
    'https://imagedelivery.net/account/profile/public',
  );
  assert.equal(
    normalizeTrustedPublicProfile({
      pfpUrl: 'https://CDN.EXAMPLE.COM/profile.png?size=320&fit=cover',
    }).pfpUrl,
    'https://cdn.example.com/profile.png?size=320&fit=cover',
  );
  assert.equal(
    normalizeTrustedPublicProfile({ pfpUrl: 'https://cdn.example.com' }).pfpUrl,
    'https://cdn.example.com/',
  );
  for (const pfpUrl of [
    'http://images.example.com/profile.png',
    'https://user:pass@images.example.com/profile.png',
    'https://localhost/profile.png',
    'https://assets.internal/profile.png',
    'https://127.0.0.1/profile.png',
    'https://127.1/profile.png',
    'https://0177.0.0.1/profile.png',
    'https://0x7f000001/profile.png',
    'https://2130706433/profile.png',
    'https://[::1]/profile.png',
    'https://images.example.com:443/profile.png',
    'https://images.example.com:8443/profile.png',
    'https://images.example.com:70000/profile.png',
    'https://images.example.com\\profile.png',
    'https://images.example.com/profile image.png',
    'https://images.example.com/a/../profile.png',
    'https://images.example.com/%2e%2e/profile.png',
    "https://images.example.com/profile.png?label=keeper's",
    'https://images.example.com/%zz/profile.png',
  ]) {
    assert.throws(
      () => normalizeTrustedPublicProfile({ pfpUrl }),
      /PROFILE_PFP_URL_INVALID/,
    );
  }
});

test('admission-ready profiles require a normalized username and public HTTPS portrait', () => {
  const normalized = normalizeAdmissionReadyTrustedProfile({
    canonicalUsername: '  Keeper.ETH  ',
    displayName: ' Keeper Prime ',
    pfpUrl: 'https://images.example.test/avatar.png#tracking',
  });

  assert.deepEqual(normalized, {
    canonicalUsername: 'keeper.eth',
    displayName: 'Keeper Prime',
    pfpUrl: 'https://images.example.test/avatar.png',
    publicBio: undefined,
  });
  assert.equal(admissionProfileIsComplete(normalized), true);
});

test('admission-ready profile policy fails closed on missing required presentation', () => {
  assert.throws(
    () => normalizeAdmissionReadyTrustedProfile({
      pfpUrl: 'https://images.example.test/avatar.png',
    }),
    /PROFILE_ADMISSION_USERNAME_REQUIRED/,
  );
  assert.throws(
    () => normalizeAdmissionReadyTrustedProfile({
      canonicalUsername: '\u200b',
      pfpUrl: 'https://images.example.test/avatar.png',
    }),
    /PROFILE_ADMISSION_USERNAME_REQUIRED/,
  );
  assert.throws(
    () => normalizeAdmissionReadyTrustedProfile({ canonicalUsername: 'keeper.eth' }),
    /PROFILE_ADMISSION_PFP_REQUIRED/,
  );
  assert.throws(
    () => normalizeAdmissionReadyTrustedProfile({
      canonicalUsername: 'keeper.eth',
      pfpUrl: 'http://images.example.test/avatar.png',
    }),
    /PROFILE_PFP_URL_INVALID/,
  );
});

test('admission profile completeness rejects merely present noncanonical fields', () => {
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'https://images.example.test/avatar.png',
  }), true);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'Keeper.ETH',
    pfpUrl: 'https://images.example.test/avatar.png',
  }), false);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'https://images.example.test/avatar.png#tracking',
  }), false);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'https://IMAGES.EXAMPLE.TEST/avatar.png',
  }), false);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'https://images.example.test:8443/avatar.png',
  }), false);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'https://images.example.test/a/../avatar.png',
  }), false);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'https://images.example.test',
  }), false);
  assert.equal(admissionProfileIsComplete({
    canonicalUsername: 'keeper.eth',
    pfpUrl: 'http://images.example.test/avatar.png',
  }), false);
  assert.equal(admissionProfileIsComplete({ canonicalUsername: 'keeper.eth' }), false);
  assert.equal(admissionProfileIsComplete({
    pfpUrl: 'https://images.example.test/avatar.png',
  }), false);
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
