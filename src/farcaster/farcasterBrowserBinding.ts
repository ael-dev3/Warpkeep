import type {
  FarcasterBrowserBinding,
  FarcasterBrowserBindingFactory
} from './farcasterAuthTypes';

export const FARCASTER_BROWSER_BINDING_METHOD = 'S256' as const;
export const FARCASTER_BROWSER_BINDING_VALUE_LENGTH = 43;
const BINDING_RANDOM_BYTES = 32;
const CANONICAL_BINDING_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BINDING_UNAVAILABLE_MESSAGE = 'Farcaster browser binding is unavailable.';

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/=+$/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function decodeBase64Url32(value: string): Uint8Array | undefined {
  try {
    const binary = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}=`);
    if (binary.length !== BINDING_RANDOM_BYTES) {
      return undefined;
    }
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

export function isCanonicalFarcasterBrowserBindingValue(
  value: unknown
): value is string {
  if (typeof value !== 'string' || !CANONICAL_BINDING_PATTERN.test(value)) {
    return false;
  }
  const decoded = decodeBase64Url32(value);
  if (!decoded) {
    return false;
  }
  try {
    return encodeBase64Url(decoded) === value;
  } finally {
    decoded.fill(0);
  }
}

export async function deriveFarcasterBrowserBindingChallenge(
  verifier: string
): Promise<string> {
  if (!isCanonicalFarcasterBrowserBindingValue(verifier)) {
    throw new Error(BINDING_UNAVAILABLE_MESSAGE);
  }

  const verifierBytes = new TextEncoder().encode(verifier);
  try {
    const digest = await crypto.subtle.digest('SHA-256', verifierBytes);
    const challenge = encodeBase64Url(new Uint8Array(digest));
    if (!isCanonicalFarcasterBrowserBindingValue(challenge)) {
      throw new Error(BINDING_UNAVAILABLE_MESSAGE);
    }
    return challenge;
  } catch {
    throw new Error(BINDING_UNAVAILABLE_MESSAGE);
  } finally {
    verifierBytes.fill(0);
  }
}

export const createFarcasterBrowserBinding: FarcasterBrowserBindingFactory = async () => {
  const randomBytes = new Uint8Array(BINDING_RANDOM_BYTES);
  let verifier: string;
  try {
    crypto.getRandomValues(randomBytes);
    verifier = encodeBase64Url(randomBytes);
  } catch {
    throw new Error(BINDING_UNAVAILABLE_MESSAGE);
  } finally {
    randomBytes.fill(0);
  }

  const challenge = await deriveFarcasterBrowserBindingChallenge(verifier);
  const binding: FarcasterBrowserBinding = Object.freeze({
    verifier,
    challenge,
    method: FARCASTER_BROWSER_BINDING_METHOD
  });
  return binding;
};
