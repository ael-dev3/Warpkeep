import { describe, expect, it } from 'vitest';

import {
  FarcasterProfilePolicyError,
  buildTrustedFarcasterSnapshot,
  privacySafeProfileSummary,
} from '../scripts/marks/farcaster-profile-policy';

const FID = 123n;

function userData(type: string, value: string, timestamp = 10) {
  return {
    data: {
      type: 'MESSAGE_TYPE_USER_DATA_ADD',
      fid: Number(FID),
      timestamp,
      network: 'FARCASTER_NETWORK_MAINNET',
      userDataBody: { type, value },
    },
  };
}

function input() {
  return {
    fid: FID,
    userDataResponse: {
      messages: [
        userData('USER_DATA_TYPE_USERNAME', 'FoundER.eth'),
        userData('USER_DATA_TYPE_DISPLAY', '  Founder\u0000 <b>One</b>  '),
        userData('USER_DATA_TYPE_BIO', 'Builds <script>alert(1)</script> persistent worlds.'),
        userData('USER_DATA_TYPE_PFP', 'https://images.example/profile.png#tracking'),
      ],
    },
    custodyEventsResponse: {
      events: [
        {
          type: 'EVENT_TYPE_ID_REGISTER',
          fid: Number(FID),
          blockNumber: 100,
          logIndex: 1,
          idRegisterEventBody: { to: '0x1111111111111111111111111111111111111111' },
        },
      ],
    },
    verificationsResponse: {
      messages: [
        {
          data: {
            type: 'MESSAGE_TYPE_VERIFICATION_ADD_ETH_ADDRESS',
            fid: Number(FID),
            timestamp: 12,
            network: 'FARCASTER_NETWORK_MAINNET',
            verificationAddEthAddressBody: {
              address: '0x2222222222222222222222222222222222222222',
            },
          },
        },
      ],
    },
  };
}

describe('trusted Farcaster profile snapshots', () => {
  it('separates sanitized public presentation from private wallet attribution', () => {
    const snapshot = buildTrustedFarcasterSnapshot(input());
    expect(snapshot.publicProfile).toEqual({
      fid: FID,
      canonicalUsername: 'founder.eth',
      displayName: 'Founder One',
      publicBio: 'Builds persistent worlds.',
      pfpUrl: 'https://images.example/profile.png',
      farcasterProfileUrl: 'https://farcaster.xyz/founder.eth',
    });
    expect(snapshot.publicProfile).not.toHaveProperty('address');
    expect(snapshot.privateWallets).toEqual([
      {
        fid: FID,
        address: '0x1111111111111111111111111111111111111111',
        addressType: 'custody',
        source: 'snapchain_id_registry',
        active: true,
      },
      {
        fid: FID,
        address: '0x2222222222222222222222222222222222222222',
        addressType: 'verified_evm',
        source: 'snapchain_verification',
        active: true,
      },
    ]);
    expect(privacySafeProfileSummary(snapshot)).toEqual({
      resolved: true,
      hasUsername: true,
      hasDisplayName: true,
      hasPfp: true,
      hasBio: true,
      privateWalletCount: 2,
    });
  });

  it('uses the newest user-data value and latest custody event', () => {
    const value = input();
    value.userDataResponse.messages.push(userData('USER_DATA_TYPE_DISPLAY', 'New Name', 11));
    value.custodyEventsResponse.events.push({
      type: 'EVENT_TYPE_ID_REGISTER',
      fid: Number(FID),
      blockNumber: 101,
      logIndex: 0,
      idRegisterEventBody: { to: '0x3333333333333333333333333333333333333333' },
    });
    const snapshot = buildTrustedFarcasterSnapshot(value);
    expect(snapshot.publicProfile.displayName).toBe('New Name');
    expect(snapshot.privateWallets[0].address).toBe('0x3333333333333333333333333333333333333333');
  });

  it('drops unsafe PFP schemes and malformed usernames', () => {
    const value = input();
    value.userDataResponse.messages = [
      userData('USER_DATA_TYPE_USERNAME', '../unsafe'),
      userData('USER_DATA_TYPE_PFP', 'javascript:alert(1)'),
    ];
    const snapshot = buildTrustedFarcasterSnapshot(value);
    expect(snapshot.publicProfile.canonicalUsername).toBeUndefined();
    expect(snapshot.publicProfile.pfpUrl).toBeUndefined();
    expect(snapshot.publicProfile.farcasterProfileUrl).toBeUndefined();
  });

  it('strips bidi formatting and zero-width controls before publication', () => {
    const value = input();
    const controls = '\u061c\u200b\u200c\u200d\u200e\u200f\u202a\u202b\u202c\u202d\u202e\u2060\u2066\u2067\u2068\u2069\ufeff';
    value.userDataResponse.messages = [
      userData('USER_DATA_TYPE_DISPLAY', `Keep${controls}er`),
      userData('USER_DATA_TYPE_BIO', `Persistent${controls} realm`),
    ];
    const snapshot = buildTrustedFarcasterSnapshot(value);
    expect(snapshot.publicProfile.displayName).toBe('Keeper');
    expect(snapshot.publicProfile.publicBio).toBe('Persistent realm');
  });

  it('fails closed on FID, network, or message-contract mismatch', () => {
    const wrongFid = input();
    wrongFid.userDataResponse.messages[0].data.fid = 999;
    expect(() => buildTrustedFarcasterSnapshot(wrongFid)).toThrow('FARCASTER_PROFILE_FID_MISMATCH');

    const wrongNetwork = input();
    wrongNetwork.verificationsResponse.messages[0].data.network = 'FARCASTER_NETWORK_TESTNET';
    expect(() => buildTrustedFarcasterSnapshot(wrongNetwork))
      .toThrow('FARCASTER_VERIFICATION_CONTRACT_MISMATCH');
  });

  it('uses generic typed failures without echoing untrusted payloads', () => {
    try {
      buildTrustedFarcasterSnapshot({ ...input(), fid: 0n });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(FarcasterProfilePolicyError);
      expect((error as FarcasterProfilePolicyError).code).toBe('FARCASTER_PROFILE_FID_INVALID');
    }
  });
});
