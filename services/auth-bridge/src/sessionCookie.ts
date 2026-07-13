import { randomId } from './jwt'

export const SESSION_COOKIE_NAME = '__Host-warpkeep_session'
const COOKIE_VERSION = 'v1'
const FAMILY_ID_PATTERN = /^[A-Za-z0-9_-]{32}$/
const MAC_PATTERN = /^[A-Za-z0-9_-]{43}$/
const MAX_GENERATION = 0xffff_ffff
const encoder = new TextEncoder()

export type SessionCookieReference = Readonly<{
  familyId: string
  generation: number
}>

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!MAC_PATTERN.test(value)) return null
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(`${normalized}${'='.repeat((4 - normalized.length % 4) % 4)}`)
    const bytes = new Uint8Array(new ArrayBuffer(binary.length))
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
    return bytes
  } catch {
    return null
  }
}

function isGeneration(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_GENERATION
}

function unsignedValue(familyId: string, generation: number): string {
  return `${COOKIE_VERSION}.${familyId}.${generation}`
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  const secretBytes = encoder.encode(secret)
  try {
    return await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign', 'verify'],
    )
  } finally {
    secretBytes.fill(0)
  }
}

async function signMac(secret: string, value: string): Promise<string> {
  const input = encoder.encode(value)
  try {
    const signature = await crypto.subtle.sign('HMAC', await importHmacKey(secret), input)
    return base64Url(new Uint8Array(signature))
  } finally {
    input.fill(0)
  }
}

export function createSessionFamilyId(): string {
  return randomId(24)
}

export async function createSessionCookieValue(
  secret: string,
  familyId: string,
  generation: number,
): Promise<string> {
  if (!FAMILY_ID_PATTERN.test(familyId) || !isGeneration(generation)) {
    throw new Error('Invalid session cookie reference.')
  }
  const unsigned = unsignedValue(familyId, generation)
  return `${unsigned}.${await signMac(secret, unsigned)}`
}

function readCookieValue(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header || header.length > 16_384) return null
  let found: string | null = null
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator < 1) continue
    const name = part.slice(0, separator).trim()
    if (name !== SESSION_COOKIE_NAME) continue
    if (found !== null) return null
    const value = part.slice(separator + 1).trim()
    if (!value || value.length > 256) return null
    found = value
  }
  return found
}

export async function readVerifiedSessionCookie(
  request: Request,
  secret: string,
): Promise<SessionCookieReference | null> {
  const value = readCookieValue(request)
  if (!value) return null
  const parts = value.split('.')
  if (parts.length !== 4 || parts[0] !== COOKIE_VERSION || !FAMILY_ID_PATTERN.test(parts[1])) return null
  if (!/^[1-9]\d{0,9}$/.test(parts[2])) return null
  const generation = Number(parts[2])
  if (!isGeneration(generation)) return null
  const signature = decodeBase64Url(parts[3])
  if (!signature) return null
  const input = encoder.encode(unsignedValue(parts[1], generation))
  try {
    const valid = await crypto.subtle.verify('HMAC', await importHmacKey(secret), signature, input)
    return valid ? Object.freeze({ familyId: parts[1], generation }) : null
  } finally {
    input.fill(0)
    signature.fill(0)
  }
}

export function sessionSetCookie(value: string, rememberDevice: boolean, maxAgeSeconds: number): string {
  const persistent = rememberDevice ? `; Max-Age=${maxAgeSeconds}` : ''
  return `${SESSION_COOKIE_NAME}=${value}; Path=/; Secure; HttpOnly; SameSite=Strict${persistent}`
}

export function expiredSessionSetCookie(): string {
  return `${SESSION_COOKIE_NAME}=; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=0`
}
