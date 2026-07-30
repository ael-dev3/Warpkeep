import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  domainManifestSchema,
  safeParseMiniAppEmbed,
} from '@farcaster/miniapp-core';
import sharp from 'sharp';
import { verifyMessage } from 'viem';

import {
  FARCASTER_MINI_APP_CONFIG,
  FARCASTER_MINI_APP_CORE_IMAGES,
  FARCASTER_MINI_APP_EMBED,
  FARCASTER_MINI_APP_HOME_URL,
  FARCASTER_MINI_APP_MANIFEST_PATH,
  FARCASTER_MINI_APP_ORIGIN,
  FARCASTER_MINI_APP_SCREENSHOTS,
  exactJsonValue,
  inspectFarcasterAccountAssociation,
} from './farcaster-miniapp-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const requireManifest = process.argv.includes('--require-manifest');
const unknownArguments = process.argv.slice(2).filter(
  (argument) => argument !== '--require-manifest',
);

const MANIFEST_PATH = resolve(dist, FARCASTER_MINI_APP_MANIFEST_PATH);

function fail(message) {
  throw new Error(`Farcaster Mini App verification failed: ${message}`);
}

function htmlAttribute(tag, name) {
  const pattern = new RegExp(
    `(?:^|\\s)${name.replace(':', '\\:')}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    'i',
  );
  return pattern.exec(tag)?.[2];
}

function metaTags(html, name) {
  return [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map((match) => match[0])
    .filter((tag) => htmlAttribute(tag, 'name')?.toLowerCase() === name);
}

async function verifyImage(specification) {
  const path = resolve(dist, specification.path);
  let file;
  try {
    file = await stat(path);
  } catch {
    fail(`missing built image ${specification.file}`);
  }
  if (
    specification.maximumBytes !== undefined
    && file.size >= specification.maximumBytes
  ) {
    fail(`${specification.file} exceeds its byte budget`);
  }
  const metadata = await sharp(path, {
    failOn: 'warning',
    limitInputPixels: 1284 * 2778,
  }).metadata();
  if (
    metadata.format !== 'png'
    || metadata.width !== specification.width
    || metadata.height !== specification.height
  ) {
    fail(
      `${specification.file} must be an exact ${specification.width}x${specification.height} PNG`,
    );
  }
  if (specification.opaque && metadata.hasAlpha) {
    fail(`${specification.file} must not have an alpha channel`);
  }
}

export async function verifyFarcasterAccountAssociationSignature(
  accountAssociation,
) {
  let inspected;
  try {
    inspected = inspectFarcasterAccountAssociation(accountAssociation);
  } catch (error) {
    fail(error instanceof Error ? error.message : 'invalid account association');
  }
  let verified = false;
  try {
    verified = await verifyMessage({
      address: inspected.header.key,
      message: inspected.signingInput,
      signature: inspected.signatureHex,
    });
  } catch {
    verified = false;
  }
  if (!verified) {
    fail('account-association signature does not match its declared signing key');
  }
  return inspected;
}

async function verifyManifest() {
  let source;
  try {
    source = await readFile(MANIFEST_PATH, 'utf8');
  } catch (error) {
    if (
      !requireManifest
      && error
      && typeof error === 'object'
      && 'code' in error
      && error.code === 'ENOENT'
    ) {
      return false;
    }
    fail('the production manifest is missing');
  }

  let manifest;
  try {
    manifest = JSON.parse(source);
  } catch {
    fail('the production manifest is not valid JSON');
  }
  if (
    !manifest
    || typeof manifest !== 'object'
    || Array.isArray(manifest)
    || !exactJsonValue(
      Object.keys(manifest).sort(),
      ['accountAssociation', 'miniapp'],
    )
  ) {
    fail('manifest must contain only accountAssociation and miniapp');
  }
  const serializedAssociation = JSON.stringify(manifest.accountAssociation);
  if (/[<>]|OWNER|PLACEHOLDER|TODO/i.test(serializedAssociation)) {
    fail('manifest contains an account-association placeholder');
  }
  const parsed = domainManifestSchema.safeParse(manifest);
  if (!parsed.success) {
    fail(`manifest schema mismatch: ${parsed.error.issues[0]?.message ?? 'invalid manifest'}`);
  }
  if (!exactJsonValue(manifest.miniapp, FARCASTER_MINI_APP_CONFIG)) {
    fail('manifest Mini App configuration drifted from the reviewed release contract');
  }
  await verifyFarcasterAccountAssociationSignature(
    manifest.accountAssociation,
  );
  return true;
}

async function main() {
  if (unknownArguments.length > 0) {
    fail(`unknown argument ${unknownArguments[0]}`);
  }
  const html = await readFile(resolve(dist, 'index.html'), 'utf8');
  const miniAppTags = metaTags(html, 'fc:miniapp');
  if (miniAppTags.length !== 1 || metaTags(html, 'fc:frame').length !== 0) {
    fail('built HTML must contain one fc:miniapp meta and no fc:frame meta');
  }
  const content = htmlAttribute(miniAppTags[0], 'content');
  let embed;
  try {
    embed = JSON.parse(content);
  } catch {
    fail('fc:miniapp content is not compact valid JSON');
  }
  const parsedEmbed = safeParseMiniAppEmbed(embed);
  if (
    !parsedEmbed.success
    || !exactJsonValue(embed, FARCASTER_MINI_APP_EMBED)
  ) {
    fail('fc:miniapp metadata drifted from the reviewed launch contract');
  }
  if (
    new URL(embed.imageUrl).origin !== FARCASTER_MINI_APP_ORIGIN
    || new URL(embed.button.action.url).origin
      !== FARCASTER_MINI_APP_ORIGIN
    || embed.button.action.url !== FARCASTER_MINI_APP_HOME_URL
  ) {
    fail('embed URLs are not exact production Warpkeep URLs');
  }

  for (const image of FARCASTER_MINI_APP_CORE_IMAGES) {
    await verifyImage(image);
  }
  for (const screenshot of FARCASTER_MINI_APP_SCREENSHOTS) {
    await verifyImage(screenshot);
  }
  const manifestPresent = await verifyManifest();
  process.stdout.write(
    `Farcaster Mini App ${manifestPresent
      ? 'embed, assets, manifest domain, and signature integrity'
      : 'embed and pre-association assets'} verified.\n`,
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  await main();
}
