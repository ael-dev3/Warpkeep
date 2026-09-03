import {
  MAX_GITHUB_JSON_BYTES,
  RecoveryGitHubError,
  githubFail,
} from './config.js'

export type GitHubJsonValue =
  | null
  | boolean
  | string
  | number
  | GitHubJsonArray
  | GitHubJsonObject

export interface GitHubJsonArray extends ReadonlyArray<GitHubJsonValue> {}
export interface GitHubJsonObject {
  readonly [key: string]: GitHubJsonValue
}

export type GitHubJsonResponse = Readonly<{
  value: GitHubJsonObject
  bytes: Uint8Array
  etag: string | null
  link: string | null
}>

const JSON_MEDIA_TYPE = /^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?$/iu
const JSON_WHITESPACE = new Set([' ', '\t', '\n', '\r'])
const MAX_JSON_DEPTH = 64
const DEFAULT_TIMEOUT_MS = 10_000
const utf8 = new TextDecoder('utf-8', { fatal: true })

function hasUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index)
    if (codePoint >= 0xd800 && codePoint <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (next < 0xdc00 || next > 0xdfff) return true
      index += 1
    } else if (codePoint >= 0xdc00 && codePoint <= 0xdfff) {
      return true
    }
  }
  return false
}

class StrictGitHubJsonParser {
  #index = 0

  constructor(
    private readonly source: string,
    private readonly integerFields: ReadonlySet<string>,
    private readonly code: string,
  ) {}

  parseObjectDocument(): GitHubJsonObject {
    this.skipWhitespace()
    const value = this.parseValue(0, [])
    this.skipWhitespace()
    if (this.#index !== this.source.length || !this.isObject(value)) this.fail()
    return value
  }

  private parseValue(depth: number, path: readonly string[]): GitHubJsonValue {
    if (depth > MAX_JSON_DEPTH) this.fail()
    this.skipWhitespace()
    const character = this.source[this.#index]
    if (character === '{') return this.parseObject(depth + 1, path)
    if (character === '[') return this.parseArray(depth + 1, path)
    if (character === '"') return this.parseString()
    if (this.consume('true')) return true
    if (this.consume('false')) return false
    if (this.consume('null')) return null
    return this.parseSafeNumber()
  }

  private parseObject(depth: number, path: readonly string[]): GitHubJsonObject {
    this.#index += 1
    this.skipWhitespace()
    const result: Record<string, GitHubJsonValue> = Object.create(null)
    const names = new Set<string>()
    if (this.source[this.#index] === '}') {
      this.#index += 1
      return Object.freeze(result)
    }
    while (true) {
      if (this.source[this.#index] !== '"') this.fail()
      const name = this.parseString()
      if (names.has(name)) this.fail()
      names.add(name)
      this.skipWhitespace()
      if (this.source[this.#index] !== ':') this.fail()
      this.#index += 1
      this.skipWhitespace()
      const valuePath = [...path, name]
      result[name] = this.isIntegerField(name, valuePath)
        ? this.parsePositiveIntegerLexeme()
        : this.parseValue(depth, valuePath)
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === '}') {
        this.#index += 1
        return Object.freeze(result)
      }
      if (separator !== ',') this.fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private parseArray(depth: number, path: readonly string[]): readonly GitHubJsonValue[] {
    this.#index += 1
    this.skipWhitespace()
    const result: GitHubJsonValue[] = []
    if (this.source[this.#index] === ']') {
      this.#index += 1
      return Object.freeze(result)
    }
    while (true) {
      result.push(this.parseValue(depth, [...path, '*']))
      this.skipWhitespace()
      const separator = this.source[this.#index]
      if (separator === ']') {
        this.#index += 1
        return Object.freeze(result)
      }
      if (separator !== ',') this.fail()
      this.#index += 1
      this.skipWhitespace()
    }
  }

  private parseString(): string {
    this.#index += 1
    let result = ''
    while (this.#index < this.source.length) {
      const character = this.source[this.#index]
      this.#index += 1
      if (character === '"') {
        if (hasUnpairedSurrogate(result)) this.fail()
        return result
      }
      if (character === '\\') {
        const escaped = this.source[this.#index]
        this.#index += 1
        if (escaped === '"' || escaped === '\\' || escaped === '/') {
          result += escaped
          continue
        }
        const controls: Readonly<Record<string, string>> = {
          b: '\b',
          f: '\f',
          n: '\n',
          r: '\r',
          t: '\t',
        }
        if (escaped !== undefined && Object.hasOwn(controls, escaped)) {
          result += controls[escaped]
          continue
        }
        if (escaped === 'u') {
          const hex = this.source.slice(this.#index, this.#index + 4)
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) this.fail()
          result += String.fromCharCode(Number.parseInt(hex, 16))
          this.#index += 4
          continue
        }
        this.fail()
      }
      if (character === undefined || character < ' ') this.fail()
      result += character
    }
    this.fail()
  }

  private parsePositiveIntegerLexeme(): string {
    const match = /^[1-9][0-9]*/u.exec(this.source.slice(this.#index))
    if (match === null) this.fail()
    this.#index += match[0].length
    if (!this.atValueBoundary()) this.fail()
    return match[0]
  }

  private parseSafeNumber(): number {
    const match = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/u.exec(
      this.source.slice(this.#index),
    )
    if (match === null) this.fail()
    this.#index += match[0].length
    if (!this.atValueBoundary()) this.fail()
    const value = Number(match[0])
    if (!Number.isSafeInteger(value)) this.fail()
    return value
  }

  private atValueBoundary(): boolean {
    const character = this.source[this.#index]
    return character === undefined
      || character === ','
      || character === '}'
      || character === ']'
      || JSON_WHITESPACE.has(character)
  }

  private skipWhitespace(): void {
    while (JSON_WHITESPACE.has(this.source[this.#index] ?? '')) this.#index += 1
  }

  private consume(value: string): boolean {
    if (this.source.slice(this.#index, this.#index + value.length) !== value) return false
    this.#index += value.length
    return true
  }

  private isObject(value: GitHubJsonValue): value is GitHubJsonObject {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
  }

  private isIntegerField(name: string, path: readonly string[]): boolean {
    if (this.integerFields.has(name)) return true
    return this.integerFields.has(`/${path.join('/')}`)
  }

  private fail(): never {
    githubFail(this.code)
  }
}

export function parseGitHubJsonObject(
  bytes: Uint8Array,
  code: string,
  integerFields: readonly string[],
): GitHubJsonObject {
  try {
    if (
      new Set(integerFields).size !== integerFields.length
      || integerFields.some(field => typeof field !== 'string' || field.length === 0)
    ) githubFail(code)
    const source = utf8.decode(bytes)
    return new StrictGitHubJsonParser(source, new Set(integerFields), code)
      .parseObjectDocument()
  } catch (error) {
    if (error instanceof RecoveryGitHubError && error.code === code) throw error
    githubFail(code)
  }
}

async function readBeforeDeadline<T>(
  operation: Promise<T>,
  remainingMilliseconds: number,
  code: string,
): Promise<T> {
  if (remainingMilliseconds <= 0) githubFail(code)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new RecoveryGitHubError(code)), remainingMilliseconds)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

export async function bounded(
  response: Response,
  limit: number,
  code: string,
  timeoutMilliseconds = DEFAULT_TIMEOUT_MS,
): Promise<Uint8Array> {
  if (
    !Number.isSafeInteger(limit)
    || limit < 0
    || !Number.isSafeInteger(timeoutMilliseconds)
    || timeoutMilliseconds < 1
  ) githubFail(code)

  let body: ReadableStream<Uint8Array> | null
  let declaredLength: bigint | undefined
  try {
    body = response.body
    if (body === null) githubFail(code)
    const lengthHeader = response.headers.get('content-length')
    if (lengthHeader !== null) {
      if (!/^(?:0|[1-9][0-9]*)$/u.test(lengthHeader)) githubFail(code)
      declaredLength = BigInt(lengthHeader)
      if (declaredLength > BigInt(limit)) githubFail(code)
    }
  } catch (error) {
    if (error instanceof RecoveryGitHubError && error.code === code) throw error
    githubFail(code)
  }

  const reader = body.getReader()
  const deadline = Date.now() + timeoutMilliseconds
  const chunks: Uint8Array[] = []
  let length = 0
  try {
    for (;;) {
      const part = await readBeforeDeadline(reader.read(), deadline - Date.now(), code)
      if (part.done) break
      if (!(part.value instanceof Uint8Array)) githubFail(code)
      if (part.value.byteLength > limit - length) githubFail(code)
      length += part.value.byteLength
      if (declaredLength !== undefined && BigInt(length) > declaredLength) githubFail(code)
      chunks.push(Uint8Array.from(part.value))
    }
  } catch (error) {
    if (error instanceof RecoveryGitHubError && error.code === code) throw error
    githubFail(code)
  } finally {
    try {
      const cancellation = reader.cancel()
      void cancellation.catch(() => undefined)
    } catch {
      // The stable caller code was already selected before cleanup.
    }
  }

  if (declaredLength !== undefined && BigInt(length) !== declaredLength) githubFail(code)
  const result = new Uint8Array(length)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.byteLength
  }
  return result
}

function boundedHeader(response: Response, name: string, code: string): string | null {
  try {
    const value = response.headers.get(name)
    if (value !== null && (value.length > 4_096 || /[\0\r\n]/u.test(value))) githubFail(code)
    return value
  } catch (error) {
    if (error instanceof RecoveryGitHubError && error.code === code) throw error
    githubFail(code)
  }
}

export async function jsonWithMetadata(
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  init: RequestInit = {},
  code = 'RECOVERY_GITHUB_HTTP_INVALID',
  expectedStatus = 200,
  integerFields: readonly string[] = [],
): Promise<GitHubJsonResponse> {
  let response: Response
  try {
    response = await fetchImplementation(url, {
      ...init,
      redirect: 'manual',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch {
    githubFail(code)
  }

  try {
    if (
      response.status !== expectedStatus
      || response.type === 'opaqueredirect'
      || response.url !== url
    ) githubFail(code)
    const contentType = boundedHeader(response, 'content-type', code)
    if (contentType === null || !JSON_MEDIA_TYPE.test(contentType)) githubFail(code)
  } catch (error) {
    if (error instanceof RecoveryGitHubError && error.code === code) throw error
    githubFail(code)
  }

  const bytes = await bounded(response, MAX_GITHUB_JSON_BYTES, code)
  return Object.freeze({
    value: parseGitHubJsonObject(bytes, code, integerFields),
    bytes: Uint8Array.from(bytes),
    etag: boundedHeader(response, 'etag', code),
    link: boundedHeader(response, 'link', code),
  })
}

export async function json(
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  init: RequestInit = {},
  code = 'RECOVERY_GITHUB_HTTP_INVALID',
  expectedStatus = 200,
  integerFields: readonly string[] = [],
): Promise<GitHubJsonObject> {
  return (await jsonWithMetadata(
    fetchImplementation,
    url,
    init,
    code,
    expectedStatus,
    integerFields,
  )).value
}

function safeRedirectTarget(url: URL): boolean {
  const hostname = url.hostname.toLowerCase()
  return url.protocol === 'https:'
    && url.username === ''
    && url.password === ''
    && url.port === ''
    && url.hash === ''
    && hostname !== 'localhost'
    && !hostname.endsWith('.localhost')
    && !hostname.includes(':')
    && !/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname)
    && !/^(?:10|127|169\.254|192\.168|172\.(?:1[6-9]|2[0-9]|3[0-1]))\./u.test(hostname)
}

export async function githubRedirect(
  fetchImplementation: typeof globalThis.fetch,
  url: string,
  authorization: string,
): Promise<Response> {
  let redirect: Response
  try {
    redirect = await fetchImplementation(url, {
      headers: { accept: 'application/vnd.github+json', authorization },
      redirect: 'manual',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch {
    githubFail('RECOVERY_GITHUB_ARCHIVE_INVALID')
  }
  if (redirect.status !== 302 || redirect.url !== url) {
    githubFail('RECOVERY_GITHUB_ARCHIVE_INVALID')
  }
  const location = redirect.headers.get('location')
  try {
    const cancellation = redirect.body?.cancel()
    void cancellation?.catch(() => undefined)
  } catch {
    // Redirect bodies are never used.
  }

  let target: URL
  try {
    target = new URL(location ?? '')
  } catch {
    githubFail('RECOVERY_GITHUB_ARCHIVE_INVALID')
  }
  if (!safeRedirectTarget(target)) githubFail('RECOVERY_GITHUB_ARCHIVE_INVALID')

  let archive: Response
  try {
    archive = await fetchImplementation(target, {
      redirect: 'manual',
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    })
  } catch {
    githubFail('RECOVERY_GITHUB_ARCHIVE_INVALID')
  }
  if (
    archive.status !== 200
    || archive.url !== target.href
    || (archive.status >= 300 && archive.status < 400)
  ) {
    try {
      const cancellation = archive.body?.cancel()
      void cancellation?.catch(() => undefined)
    } catch {
      // The stable archive code is returned below.
    }
    githubFail('RECOVERY_GITHUB_ARCHIVE_INVALID')
  }
  return archive
}
