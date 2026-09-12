/** Small dependency-free SHA-256 for deterministic server-side import proofs. */

const INITIAL = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const ROUND = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, count: number): number {
  return (value >>> count) | (value << (32 - count));
}

function hex(bytes: Uint8Array): string {
  let output = '';
  for (const byte of bytes) output += byte.toString(16).padStart(2, '0');
  return output;
}

function fromHex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/.test(value)) throw new Error('SHA256_STATE_INVALID');
  const output = new Uint8Array(value.length / 2);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return output;
}

export class Sha256 {
  readonly #state: Uint32Array;
  readonly #buffer: Uint8Array;
  #bufferLength: number;
  #bytesHashed: bigint;
  #finished: boolean;

  constructor(state?: Readonly<{
    words: readonly number[];
    buffer: Uint8Array;
    bytesHashed: bigint;
  }>) {
    this.#state = new Uint32Array(state?.words ?? INITIAL);
    this.#buffer = new Uint8Array(64);
    this.#bufferLength = state?.buffer.length ?? 0;
    if (state !== undefined) this.#buffer.set(state.buffer);
    this.#bytesHashed = state?.bytesHashed ?? 0n;
    this.#finished = false;
    if (
      this.#state.length !== 8
      || this.#bufferLength > 63
      || this.#bytesHashed < BigInt(this.#bufferLength)
      || Number(this.#bytesHashed % 64n) !== this.#bufferLength
    ) throw new Error('SHA256_STATE_INVALID');
  }

  update(input: Uint8Array | string): this {
    if (this.#finished) throw new Error('SHA256_ALREADY_FINISHED');
    const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
    this.#bytesHashed += BigInt(bytes.length);
    let offset = 0;
    while (offset < bytes.length) {
      const take = Math.min(64 - this.#bufferLength, bytes.length - offset);
      this.#buffer.set(bytes.subarray(offset, offset + take), this.#bufferLength);
      this.#bufferLength += take;
      offset += take;
      if (this.#bufferLength === 64) {
        this.#compress(this.#buffer);
        this.#buffer.fill(0);
        this.#bufferLength = 0;
      }
    }
    return this;
  }

  #compress(block: Uint8Array): void {
    const words = new Uint32Array(64);
    for (let index = 0; index < 16; index += 1) {
      const offset = index * 4;
      words[index] = (
        (block[offset]! << 24)
        | (block[offset + 1]! << 16)
        | (block[offset + 2]! << 8)
        | block[offset + 3]!
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15]!;
      const right = words[index - 2]!;
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (
        words[index - 16]! + sigma0 + words[index - 7]! + sigma1
      ) >>> 0;
    }
    let a = this.#state[0]!;
    let b = this.#state[1]!;
    let c = this.#state[2]!;
    let d = this.#state[3]!;
    let e = this.#state[4]!;
    let f = this.#state[5]!;
    let g = this.#state[6]!;
    let h = this.#state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + ROUND[index]! + words[index]!) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    this.#state[0] = (this.#state[0]! + a) >>> 0;
    this.#state[1] = (this.#state[1]! + b) >>> 0;
    this.#state[2] = (this.#state[2]! + c) >>> 0;
    this.#state[3] = (this.#state[3]! + d) >>> 0;
    this.#state[4] = (this.#state[4]! + e) >>> 0;
    this.#state[5] = (this.#state[5]! + f) >>> 0;
    this.#state[6] = (this.#state[6]! + g) >>> 0;
    this.#state[7] = (this.#state[7]! + h) >>> 0;
    words.fill(0);
  }

  digest(): Uint8Array {
    if (this.#finished) throw new Error('SHA256_ALREADY_FINISHED');
    const bitLength = BigInt.asUintN(64, this.#bytesHashed * 8n);
    this.#buffer[this.#bufferLength] = 0x80;
    this.#bufferLength += 1;
    if (this.#bufferLength > 56) {
      this.#buffer.fill(0, this.#bufferLength);
      this.#compress(this.#buffer);
      this.#buffer.fill(0);
      this.#bufferLength = 0;
    }
    this.#buffer.fill(0, this.#bufferLength, 56);
    for (let index = 0; index < 8; index += 1) {
      this.#buffer[63 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
    }
    this.#compress(this.#buffer);
    this.#buffer.fill(0);
    this.#bufferLength = 0;
    this.#finished = true;
    const output = new Uint8Array(32);
    for (let index = 0; index < 8; index += 1) {
      const word = this.#state[index]!;
      output[index * 4] = word >>> 24;
      output[index * 4 + 1] = word >>> 16;
      output[index * 4 + 2] = word >>> 8;
      output[index * 4 + 3] = word;
    }
    return output;
  }

  digestHex(): string {
    return hex(this.digest());
  }

  serialize(): string {
    if (this.#finished) throw new Error('SHA256_ALREADY_FINISHED');
    const words = [...this.#state].map(word => word.toString(16).padStart(8, '0')).join('');
    return `sha256-v1:${words}:${this.#bytesHashed.toString(16)}:${hex(this.#buffer.subarray(0, this.#bufferLength))}`;
  }

  static deserialize(value: string): Sha256 {
    const match = /^sha256-v1:([0-9a-f]{64}):([0-9a-f]+):([0-9a-f]*)$/.exec(value);
    if (match === null) throw new Error('SHA256_STATE_INVALID');
    const words = Array.from({ length: 8 }, (_unused, index) => (
      Number.parseInt(match[1]!.slice(index * 8, index * 8 + 8), 16)
    ));
    return new Sha256({ words, bytesHashed: BigInt(`0x${match[2]!}`), buffer: fromHex(match[3]!) });
  }
}

export function sha256Hex(input: Uint8Array | string): string {
  return new Sha256().update(input).digestHex();
}

export function uint64BigEndian(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) throw new Error('SHA256_FRAME_LENGTH_INVALID');
  const output = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) {
    output[7 - index] = Number((value >> BigInt(index * 8)) & 0xffn);
  }
  return output;
}

export function updateLengthFramedSha256(hash: Sha256, frame: Uint8Array): Sha256 {
  return hash.update(uint64BigEndian(BigInt(frame.byteLength))).update(frame);
}
