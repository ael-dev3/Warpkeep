export const DEFAULT_OPERATOR_TIMEOUT_MS = 8_000;
export const DEFAULT_OPERATOR_RESPONSE_BYTES = 8 * 1024 * 1024;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
const HEX_QUANTITY_PATTERN = /^0x(?:0|[1-9a-f][0-9a-f]*)$/i;

export class MarksTransportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'MarksTransportError';
  }
}

export type PrivateEndpoint = Readonly<{
  url: string;
  authorization?: string;
}>;

export type RpcBlock = Readonly<{
  number: bigint;
  hash: string;
}>;

export type RpcLog = Readonly<{
  address: string;
  topics: readonly string[];
  data: string;
  blockNumber: string;
  blockHash: string;
  transactionHash: string;
  logIndex: string;
  removed?: boolean;
}>;

export interface EthereumReadProvider {
  getChainId(): Promise<bigint>;
  getFinalizedHead(): Promise<RpcBlock>;
  getBlock(blockNumber: bigint): Promise<RpcBlock>;
  getStorageAt(address: string, slot: string, blockNumber: bigint): Promise<string>;
  getCode(address: string, blockNumber: bigint): Promise<string>;
  call(address: string, data: string, blockNumber: bigint): Promise<string>;
  getLogs(input: Readonly<{
    address: string;
    topic0: string;
    fromBlock: bigint;
    toBlock: bigint;
  }>): Promise<readonly RpcLog[]>;
}

type FetchLike = typeof fetch;

function parseEndpoint(endpoint: PrivateEndpoint): URL {
  let parsed: URL;
  try {
    parsed = new URL(endpoint.url);
  } catch {
    throw new MarksTransportError('MARKS_ENDPOINT_INVALID');
  }
  const isSecure = parsed.protocol === 'https:';
  const isLoopback = parsed.protocol === 'http:' && LOOPBACK_HOSTS.has(parsed.hostname);
  if (
    (!isSecure && !isLoopback)
    || parsed.username
    || parsed.password
    || parsed.search
    || parsed.hash
    || !parsed.hostname
  ) {
    throw new MarksTransportError('MARKS_ENDPOINT_INVALID');
  }
  if (
    endpoint.authorization !== undefined
    && (endpoint.authorization.length < 1 || endpoint.authorization.length > 8_192 || /[\r\n]/.test(endpoint.authorization))
  ) {
    throw new MarksTransportError('MARKS_AUTHORIZATION_INVALID');
  }
  return parsed;
}

export function assertIndependentProviderEndpoints(endpoints: readonly PrivateEndpoint[]): void {
  if (endpoints.length !== 2) throw new MarksTransportError('MARKS_TWO_PROVIDERS_REQUIRED');
  const origins = endpoints.map(endpoint => parseEndpoint(endpoint).origin.toLowerCase());
  if (origins[0] === origins[1]) {
    throw new MarksTransportError('MARKS_INDEPENDENT_PROVIDERS_REQUIRED');
  }
}

function hexQuantity(value: bigint): string {
  if (value < 0n) throw new MarksTransportError('MARKS_RPC_QUANTITY_INVALID');
  return `0x${value.toString(16)}`;
}

function parseQuantity(value: unknown): bigint {
  if (typeof value !== 'string' || !HEX_QUANTITY_PATTERN.test(value)) {
    throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
  }
  return BigInt(value);
}

function parseBlock(value: unknown): RpcBlock {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
  }
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(candidate.hash)) {
    throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
  }
  return Object.freeze({
    number: parseQuantity(candidate.number),
    hash: candidate.hash.toLowerCase(),
  });
}

async function boundedText(response: Response, maximumBytes: number): Promise<string> {
  const announcedLength = response.headers.get('content-length');
  if (
    announcedLength !== null
    && (!/^(?:0|[1-9][0-9]*)$/.test(announcedLength) || Number(announcedLength) > maximumBytes)
  ) {
    await response.body?.cancel();
    throw new MarksTransportError('MARKS_RESPONSE_TOO_LARGE');
  }
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new MarksTransportError('MARKS_RESPONSE_TOO_LARGE');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(joined);
  } catch {
    throw new MarksTransportError('MARKS_REMOTE_RESPONSE_INVALID');
  }
}

async function requestWithRetry(input: Readonly<{
  endpoint: PrivateEndpoint;
  init: RequestInit;
  fetchImpl: FetchLike;
  timeoutMs: number;
  maximumBytes: number;
}>): Promise<unknown> {
  const endpoint = parseEndpoint(input.endpoint);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await input.fetchImpl(endpoint, { ...input.init, signal: controller.signal });
      if (!response.ok) {
        if (attempt === 0 && (response.status === 429 || response.status >= 500)) {
          await response.body?.cancel();
          continue;
        }
        await response.body?.cancel();
        throw new MarksTransportError('MARKS_REMOTE_REQUEST_FAILED');
      }
      const body = await boundedText(response, input.maximumBytes);
      try {
        return JSON.parse(body) as unknown;
      } catch {
        throw new MarksTransportError('MARKS_REMOTE_RESPONSE_INVALID');
      }
    } catch (error) {
      if (error instanceof MarksTransportError) throw error;
      if (attempt === 0) continue;
      throw new MarksTransportError('MARKS_REMOTE_REQUEST_FAILED');
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new MarksTransportError('MARKS_REMOTE_REQUEST_FAILED');
}

export async function fetchBoundedJson(
  endpoint: PrivateEndpoint,
  options: Readonly<{
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    maximumBytes?: number;
  }> = {},
): Promise<unknown> {
  return requestWithRetry({
    endpoint,
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_OPERATOR_TIMEOUT_MS,
    maximumBytes: options.maximumBytes ?? DEFAULT_OPERATOR_RESPONSE_BYTES,
    init: {
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
      headers: endpoint.authorization ? { authorization: endpoint.authorization } : undefined,
    },
  });
}

export class BoundedEthereumRpcProvider implements EthereumReadProvider {
  readonly #endpoint: PrivateEndpoint;
  readonly #fetchImpl: FetchLike;
  readonly #timeoutMs: number;
  readonly #maximumBytes: number;
  #requestId = 0;

  constructor(
    endpoint: PrivateEndpoint,
    options: Readonly<{
      fetchImpl?: FetchLike;
      timeoutMs?: number;
      maximumBytes?: number;
    }> = {},
  ) {
    parseEndpoint(endpoint);
    this.#endpoint = endpoint;
    this.#fetchImpl = options.fetchImpl ?? fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_OPERATOR_TIMEOUT_MS;
    this.#maximumBytes = options.maximumBytes ?? DEFAULT_OPERATOR_RESPONSE_BYTES;
  }

  async #rpc(method: string, params: readonly unknown[]): Promise<unknown> {
    this.#requestId += 1;
    const requestId = this.#requestId;
    const response = await requestWithRetry({
      endpoint: this.#endpoint,
      fetchImpl: this.#fetchImpl,
      timeoutMs: this.#timeoutMs,
      maximumBytes: this.#maximumBytes,
      init: {
        method: 'POST',
        cache: 'no-store',
        redirect: 'error',
        headers: {
          'content-type': 'application/json',
          ...(this.#endpoint.authorization ? { authorization: this.#endpoint.authorization } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }),
      },
    });
    if (response === null || typeof response !== 'object' || Array.isArray(response)) {
      throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
    }
    const envelope = response as Record<string, unknown>;
    if (
      envelope.jsonrpc !== '2.0'
      || envelope.id !== requestId
      || 'error' in envelope
      || !('result' in envelope)
    ) {
      throw new MarksTransportError('MARKS_RPC_REQUEST_FAILED');
    }
    return envelope.result;
  }

  async getFinalizedHead(): Promise<RpcBlock> {
    return parseBlock(await this.#rpc('eth_getBlockByNumber', ['finalized', false]));
  }

  async getChainId(): Promise<bigint> {
    return parseQuantity(await this.#rpc('eth_chainId', []));
  }

  async getBlock(blockNumber: bigint): Promise<RpcBlock> {
    return parseBlock(await this.#rpc('eth_getBlockByNumber', [hexQuantity(blockNumber), false]));
  }

  async getStorageAt(address: string, slot: string, blockNumber: bigint): Promise<string> {
    const value = await this.#rpc('eth_getStorageAt', [address, slot, hexQuantity(blockNumber)]);
    if (typeof value !== 'string' || !/^0x[0-9a-f]{64}$/i.test(value)) {
      throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
    }
    return value.toLowerCase();
  }

  async getCode(address: string, blockNumber: bigint): Promise<string> {
    const value = await this.#rpc('eth_getCode', [address, hexQuantity(blockNumber)]);
    if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(value)) {
      throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
    }
    return value.toLowerCase();
  }

  async call(address: string, data: string, blockNumber: bigint): Promise<string> {
    const value = await this.#rpc('eth_call', [{ to: address, data }, hexQuantity(blockNumber)]);
    if (typeof value !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(value)) {
      throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
    }
    return value.toLowerCase();
  }

  async getLogs(input: Readonly<{
    address: string;
    topic0: string;
    fromBlock: bigint;
    toBlock: bigint;
  }>): Promise<readonly RpcLog[]> {
    if (input.toBlock < input.fromBlock || input.toBlock - input.fromBlock + 1n > 2_000n) {
      throw new MarksTransportError('MARKS_LOG_RANGE_INVALID');
    }
    const value = await this.#rpc('eth_getLogs', [{
      address: input.address,
      topics: [input.topic0],
      fromBlock: hexQuantity(input.fromBlock),
      toBlock: hexQuantity(input.toBlock),
    }]);
    if (!Array.isArray(value) || value.length > 50_000) {
      throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
    }
    return Object.freeze(value.map(entry => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
      }
      const log = entry as Record<string, unknown>;
      if (
        typeof log.address !== 'string'
        || !Array.isArray(log.topics)
        || log.topics.some(topic => typeof topic !== 'string')
        || typeof log.data !== 'string'
        || typeof log.blockNumber !== 'string'
        || typeof log.blockHash !== 'string'
        || typeof log.transactionHash !== 'string'
        || typeof log.logIndex !== 'string'
        || (log.removed !== undefined && typeof log.removed !== 'boolean')
      ) {
        throw new MarksTransportError('MARKS_RPC_RESPONSE_INVALID');
      }
      return Object.freeze({
        address: log.address,
        topics: Object.freeze([...(log.topics as string[])]),
        data: log.data,
        blockNumber: log.blockNumber,
        blockHash: log.blockHash,
        transactionHash: log.transactionHash,
        logIndex: log.logIndex,
        removed: log.removed as boolean | undefined,
      });
    }));
  }
}
