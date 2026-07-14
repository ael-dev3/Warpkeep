import { describe, expect, it } from 'vitest';

import {
  buildTrustedPublicFarcasterProfile,
  mergeWithLastKnownGood,
  privacySafePublicProfileSummary,
} from '../scripts/profiles/farcaster-profile-policy';

const FID = 123n;

function response(type: string, value: string, timestamp = 10, fid = FID) {
  return {
    data: {
      type: 'MESSAGE_TYPE_USER_DATA_ADD',
      fid: Number(fid),
      timestamp,
      network: 'FARCASTER_NETWORK_MAINNET',
      userDataBody: { type, value },
    },
  };
}

describe('public-only trusted Farcaster profile policy', () => {
  it('parses the official typed userDataByFid envelope and sanitizes presentation', () => {
    const profile = buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: {
        USER_DATA_TYPE_USERNAME: response('USER_DATA_TYPE_USERNAME', 'FoundER.eth'),
        USER_DATA_TYPE_DISPLAY: response('USER_DATA_TYPE_DISPLAY', ' Founder <b>One</b> '),
        USER_DATA_TYPE_BIO: response('USER_DATA_TYPE_BIO', 'Builds <script>bad()</script> worlds.'),
        USER_DATA_TYPE_PFP: response('USER_DATA_TYPE_PFP', 'https://images.example/pfp.png#tracking'),
      },
    });

    expect(profile).toEqual({
      fid: FID,
      canonicalUsername: 'founder.eth',
      displayName: 'Founder One',
      publicBio: 'Builds worlds.',
      pfpUrl: 'https://images.example/pfp.png',
      farcasterProfileUrl: 'https://farcaster.xyz/founder.eth',
    });
    expect(profile).not.toHaveProperty('address');
    expect(privacySafePublicProfileSummary(profile)).toEqual({
      resolved: true,
      hasUsername: true,
      hasDisplayName: true,
      hasPfp: true,
      hasBio: true,
    });
  });

  it('validates a complete current-user envelope while ignoring non-presentation fields', () => {
    const envelope = {
      messages: [
        response('USER_DATA_TYPE_USERNAME', 'keeper.eth'),
        response('USER_DATA_TYPE_DISPLAY', 'Keeper'),
        response('USER_DATA_TYPE_PFP', 'https://images.example/keeper.png'),
        response('USER_DATA_PRIMARY_ADDRESS_ETHEREUM', '0x0000000000000000000000000000000000000001'),
      ],
      nextPageToken: '',
    };
    const profile = buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: Object.fromEntries([
        'USER_DATA_TYPE_USERNAME',
        'USER_DATA_TYPE_DISPLAY',
        'USER_DATA_TYPE_BIO',
        'USER_DATA_TYPE_PFP',
      ].map(type => [type, envelope])),
    });
    expect(profile).toEqual({
      fid: FID,
      canonicalUsername: 'keeper.eth',
      displayName: 'Keeper',
      pfpUrl: 'https://images.example/keeper.png',
      publicBio: undefined,
      farcasterProfileUrl: 'https://farcaster.xyz/keeper.eth',
    });
    expect(profile).not.toHaveProperty('address');
  });

  it('preserves every last-known-good field omitted by a later source response', () => {
    const partial = buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: {
        USER_DATA_TYPE_DISPLAY: response('USER_DATA_TYPE_DISPLAY', 'Fresh Display'),
      },
    });
    expect(mergeWithLastKnownGood(partial, {
      canonicalUsername: 'stable.eth',
      displayName: 'Old Display',
      pfpUrl: 'https://images.example/stable.png',
      publicBio: 'Stable bio',
    })).toEqual({
      fid: FID,
      canonicalUsername: 'stable.eth',
      displayName: 'Fresh Display',
      pfpUrl: 'https://images.example/stable.png',
      publicBio: 'Stable bio',
      farcasterProfileUrl: 'https://farcaster.xyz/stable.eth',
    });
  });

  it('honors fields cleared by a successful complete current envelope', () => {
    const envelope = {
      messages: [response('USER_DATA_TYPE_USERNAME', 'stable.eth')],
      nextPageToken: '',
    };
    const current = buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: Object.fromEntries([
        'USER_DATA_TYPE_USERNAME',
        'USER_DATA_TYPE_DISPLAY',
        'USER_DATA_TYPE_BIO',
        'USER_DATA_TYPE_PFP',
      ].map(type => [type, envelope])),
    });

    expect(mergeWithLastKnownGood(current, {
      canonicalUsername: 'stable.eth',
      displayName: 'Old Display',
      pfpUrl: 'https://images.example/stable.png',
      publicBio: 'Old bio',
    })).toEqual({
      fid: FID,
      canonicalUsername: 'stable.eth',
      displayName: undefined,
      pfpUrl: undefined,
      publicBio: undefined,
      farcasterProfileUrl: 'https://farcaster.xyz/stable.eth',
    });
  });

  it.each([
    'http://images.example/pfp.png',
    'https://localhost/pfp.png',
    'https://127.0.0.1/pfp.png',
    'https://192.168.1.2/pfp.png',
    'https://192.0.2.1/pfp.png',
    'https://198.18.0.1/pfp.png',
    'https://203.0.113.1/pfp.png',
    'https://8.8.8.8/pfp.png',
    'https://[::1]/pfp.png',
    'https://[fc00::1]/pfp.png',
    'https://[fe80::1]/pfp.png',
    'https://[ff02::1]/pfp.png',
    'https://[::ffff:127.0.0.1]/pfp.png',
    'https://[2606:4700:4700::1111]/pfp.png',
    'https://user:pass@images.example/pfp.png',
    'javascript:alert(1)',
  ])('rejects unsafe PFP delivery URL %s', (pfpUrl) => {
    expect(() => buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: {
        USER_DATA_TYPE_PFP: response('USER_DATA_TYPE_PFP', pfpUrl),
      },
    })).toThrow('FARCASTER_PROFILE_PFP_INVALID');
  });

  it('re-sanitizes last-known-good presentation before preserving it', () => {
    const partial = buildTrustedPublicFarcasterProfile({ fid: FID, responses: {} });
    expect(mergeWithLastKnownGood(partial, {
      canonicalUsername: '@invalid',
      displayName: '<b>Stable</b>',
      pfpUrl: 'https://[::1]/private.png',
      publicBio: '<script>hidden()</script>Public bio',
    })).toEqual({
      fid: FID,
      canonicalUsername: undefined,
      displayName: 'Stable',
      pfpUrl: undefined,
      publicBio: 'Public bio',
      farcasterProfileUrl: undefined,
    });
  });

  it('fails closed on a wrong FID, network, or typed response contract', () => {
    expect(() => buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: {
        USER_DATA_TYPE_USERNAME: response('USER_DATA_TYPE_USERNAME', 'safe.eth', 10, 999n),
      },
    })).toThrow('FARCASTER_PROFILE_FID_MISMATCH');

    const wrongNetwork = response('USER_DATA_TYPE_DISPLAY', 'Name');
    wrongNetwork.data.network = 'FARCASTER_NETWORK_TESTNET';
    expect(() => buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: { USER_DATA_TYPE_DISPLAY: wrongNetwork },
    })).toThrow('FARCASTER_PROFILE_CONTRACT_MISMATCH');

    const malformedType = response('USER_DATA_TYPE_DISPLAY', 'Name');
    malformedType.data.userDataBody.type = 2 as unknown as string;
    expect(() => buildTrustedPublicFarcasterProfile({
      fid: FID,
      responses: { USER_DATA_TYPE_DISPLAY: malformedType },
    })).toThrow('FARCASTER_PROFILE_CONTRACT_MISMATCH');
  });
});
