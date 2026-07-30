import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

// @ts-expect-error Repository JavaScript release contracts expose named test seams.
import { FARCASTER_MINI_APP_CONFIG, FARCASTER_MINI_APP_DOMAIN, FARCASTER_MINI_APP_EMBED, FARCASTER_MINI_APP_IMAGES, FARCASTER_MINI_APP_ORIGIN, exactJsonValue, inspectFarcasterAccountAssociation, inspectPng } from '../scripts/farcaster-miniapp-contract.mjs';
// @ts-expect-error Repository JavaScript release verifier exposes a named test seam.
import { verifyFarcasterAccountAssociationSignature } from '../scripts/verify-farcaster-miniapp.mjs';
// @ts-expect-error Repository JavaScript production verifier exposes a named test seam.
import { verifyLiveFarcasterMiniApp } from '../scripts/verify-alpha-production.mjs';

const testAccount = privateKeyToAccount(
  '0x8b3a350cf5c34c9194ca3a545d9e8b58ec38e3a6c3b96fbe2b436b674799e4f0',
);

function encodeJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

async function signedAssociation({
  legacy = false,
  payload = { domain: FARCASTER_MINI_APP_DOMAIN },
  type = 'custody',
}: {
  legacy?: boolean;
  payload?: Record<string, unknown>;
  type?: string;
} = {}) {
  const header = encodeJson({
    fid: 1,
    type,
    key: testAccount.address,
  });
  const encodedPayload = encodeJson(payload);
  const signature = await testAccount.signMessage({
    message: `${header}.${encodedPayload}`,
  });
  return {
    header,
    payload: encodedPayload,
    signature: Buffer.from(
      legacy ? signature : signature.slice(2),
      legacy ? 'utf8' : 'hex',
    ).toString('base64url'),
  };
}

describe('Farcaster Mini App release contract', () => {
  it('compares reviewed JSON values without making property order authoritative', () => {
    expect(exactJsonValue(
      { nested: { second: 2, first: 1 }, enabled: true },
      { enabled: true, nested: { first: 1, second: 2 } },
    )).toBe(true);
    expect(exactJsonValue(
      { enabled: true, extra: true },
      { enabled: true },
    )).toBe(false);
  });

  it.each([false, true])(
    'accepts a canonical %s legacy-encoding custody association with valid signature integrity',
    async (legacy) => {
      const association = await signedAssociation({ legacy });
      const inspected = inspectFarcasterAccountAssociation(association);
      expect(inspected.header).toEqual({
        fid: 1,
        type: 'custody',
        key: testAccount.address,
      });
      expect(inspected.payload).toEqual({
        domain: FARCASTER_MINI_APP_DOMAIN,
      });
      expect(inspected.legacySignatureEncoding).toBe(legacy);
      await expect(
        verifyFarcasterAccountAssociationSignature(association),
      ).resolves.toMatchObject({ signingInput: expect.any(String) });
    },
  );

  it('rejects extra payload authority, unsupported key types, and bad signatures', async () => {
    await expect(
      verifyFarcasterAccountAssociationSignature(
        await signedAssociation({
          payload: {
            domain: FARCASTER_MINI_APP_DOMAIN,
            fid: 1,
          },
        }),
      ),
    ).rejects.toThrow(/payload must contain only domain/i);
    await expect(
      verifyFarcasterAccountAssociationSignature(
        await signedAssociation({ type: 'app_key' }),
      ),
    ).rejects.toThrow(/type must be custody or auth/i);

    const association = await signedAssociation();
    association.signature = `${
      association.signature.startsWith('A') ? 'B' : 'A'
    }${association.signature.slice(1)}`;
    await expect(
      verifyFarcasterAccountAssociationSignature(association),
    ).rejects.toThrow(/signature does not match/i);
  });

  it('reads exact PNG geometry and opacity from release artwork', () => {
    const bytes = readFileSync(
      resolve(
        process.cwd(),
        'public/images/miniapp/warpkeep-icon-1024.png',
      ),
    );
    expect(inspectPng(bytes)).toEqual({
      width: 1024,
      height: 1024,
      hasAlpha: false,
    });
  });

  it('verifies the exact live embed, manifest, and reviewed release images', async () => {
    const manifest = {
      accountAssociation: await signedAssociation(),
      miniapp: FARCASTER_MINI_APP_CONFIG,
    };
    const html = `<!doctype html><meta name="fc:miniapp" content='${
      JSON.stringify(FARCASTER_MINI_APP_EMBED)
    }'>`;
    const fetchCalls: string[] = [];
    const fetchImpl = async (input: string | URL | Request) => {
      const url = String(input);
      fetchCalls.push(url);
      if (url.endsWith('/.well-known/farcaster.json')) {
        return new Response(JSON.stringify(manifest), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
      const image = FARCASTER_MINI_APP_IMAGES.find(
        (candidate: { url: string }) => candidate.url === url,
      );
      if (!image) return new Response(null, { status: 404 });
      const bytes = readFileSync(resolve(process.cwd(), 'public', image.path));
      return new Response(bytes, {
        status: 200,
        headers: {
          'content-length': String(bytes.byteLength),
          'content-type': 'image/png',
        },
      });
    };

    await expect(
      verifyLiveFarcasterMiniApp(
        FARCASTER_MINI_APP_ORIGIN,
        html,
        manifest,
        fetchImpl,
      ),
    ).resolves.toBeUndefined();
    expect(fetchCalls).toHaveLength(FARCASTER_MINI_APP_IMAGES.length + 1);
  });

  it('fails live verification closed on manifest redirects', async () => {
    const manifest = {
      accountAssociation: await signedAssociation(),
      miniapp: FARCASTER_MINI_APP_CONFIG,
    };
    const html = `<!doctype html><meta name="fc:miniapp" content='${
      JSON.stringify(FARCASTER_MINI_APP_EMBED)
    }'>`;
    const redirectedFetch = async () => new Response(null, {
      status: 307,
      headers: {
        location: 'https://api.farcaster.xyz/miniapps/hosted-manifest/other',
      },
    });

    await expect(
      verifyLiveFarcasterMiniApp(
        FARCASTER_MINI_APP_ORIGIN,
        html,
        manifest,
        redirectedFetch,
      ),
    ).rejects.toThrow(/manifest returned HTTP 307/i);
  });
});
