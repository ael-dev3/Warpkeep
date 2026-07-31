import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';

// @ts-expect-error Repository JavaScript release contracts expose named test seams.
import { FARCASTER_MINI_APP_CONFIG, FARCASTER_MINI_APP_DOMAIN, FARCASTER_MINI_APP_EMBED, FARCASTER_MINI_APP_IMAGES, FARCASTER_MINI_APP_ORIGIN, FARCASTER_MINI_APP_OWNER_FID, FARCASTER_MINI_APP_SPLASH_FILE, WARPKEEP_SITE_ICONS, exactJsonValue, inspectFarcasterAccountAssociation, inspectPng } from '../scripts/farcaster-miniapp-contract.mjs';
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
  encoding = 'base64url',
  legacy = false,
  payload = { domain: FARCASTER_MINI_APP_DOMAIN },
  type = 'custody',
  fid = FARCASTER_MINI_APP_OWNER_FID,
}: {
  encoding?: 'base64' | 'base64url';
  legacy?: boolean;
  payload?: Record<string, unknown>;
  type?: string;
  fid?: number;
} = {}) {
  const header = encodeJson({
    fid,
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
    ).toString(encoding),
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

  it.each([
    {
      encoding: 'base64url' as const,
      label: 'unpadded Base64URL',
      legacy: false,
    },
    {
      encoding: 'base64' as const,
      label: 'padded Base64',
      legacy: false,
    },
    {
      encoding: 'base64url' as const,
      label: 'legacy hex-text Base64URL',
      legacy: true,
    },
  ])(
    'accepts a canonical $label custody association with valid signature integrity',
    async ({ encoding, legacy }) => {
      const association = await signedAssociation({ encoding, legacy });
      const inspected = inspectFarcasterAccountAssociation(association);
      expect(inspected.header).toEqual({
        fid: FARCASTER_MINI_APP_OWNER_FID,
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

  it('rejects extra payload authority, unsupported key types, noncanonical encoding, and bad signatures', async () => {
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
    await expect(
      verifyFarcasterAccountAssociationSignature(
        await signedAssociation({ fid: 1 }),
      ),
    ).rejects.toThrow(/reviewed owner FID/i);

    const association = await signedAssociation();
    association.signature = `${
      association.signature.startsWith('A') ? 'B' : 'A'
    }${association.signature.slice(1)}`;
    await expect(
      verifyFarcasterAccountAssociationSignature(association),
    ).rejects.toThrow(/signature does not match/i);

    const noncanonical = await signedAssociation({ encoding: 'base64' });
    noncanonical.signature = `${noncanonical.signature}=`;
    expect(() => inspectFarcasterAccountAssociation(noncanonical))
      .toThrow(/canonical unpadded Base64URL or padded Base64/i);
  });

  it('pins exact geometry, opacity, and identity for current crest artwork', () => {
    const iconBytes = readFileSync(
      resolve(
        process.cwd(),
        'public/images/miniapp/warpkeep-icon-1024-d1b42d20f03c2905.png',
      ),
    );
    expect(inspectPng(iconBytes)).toEqual({
      width: 1024,
      height: 1024,
      hasAlpha: false,
    });

    const splashBytes = readFileSync(
      resolve(process.cwd(), 'public/images/miniapp', FARCASTER_MINI_APP_SPLASH_FILE),
    );
    expect(inspectPng(splashBytes)).toEqual({
      width: 200,
      height: 200,
      hasAlpha: false,
    });
    expect(createHash('sha256').update(splashBytes).digest('hex')).toBe(
      '117256827545daa14673847c3f20ead2aaebe6ca6c66691eda416336da599a6b',
    );
  });

  it('verifies the exact live embed, manifest, and reviewed release images', async () => {
    const manifest = {
      accountAssociation: await signedAssociation(),
      miniapp: FARCASTER_MINI_APP_CONFIG,
    };
    const html = `<!doctype html><link rel="icon" href="/favicon-64-7b82ca973fe757f5.png" type="image/png" sizes="64x64"><link rel="apple-touch-icon" href="/apple-touch-icon-180-fe27e8dc1c97cc36.png" sizes="180x180"><meta name="fc:miniapp" content='${
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
      const image = [
        ...FARCASTER_MINI_APP_IMAGES,
        ...WARPKEEP_SITE_ICONS,
      ].find(
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
    expect(fetchCalls).toHaveLength(
      FARCASTER_MINI_APP_IMAGES.length + WARPKEEP_SITE_ICONS.length + 1,
    );
  });

  it('fails live verification closed on manifest redirects', async () => {
    const manifest = {
      accountAssociation: await signedAssociation(),
      miniapp: FARCASTER_MINI_APP_CONFIG,
    };
    const html = `<!doctype html><link rel="icon" href="/favicon-64-7b82ca973fe757f5.png" type="image/png" sizes="64x64"><link rel="apple-touch-icon" href="/apple-touch-icon-180-fe27e8dc1c97cc36.png" sizes="180x180"><meta name="fc:miniapp" content='${
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
