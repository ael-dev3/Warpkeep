import { readFileSync } from 'node:fs'
const fixture = JSON.parse(
  readFileSync(new URL('./recoverySourceClosureZip.json', import.meta.url), 'utf8'),
) as { base64: string }
// Preserve the pinned uploader's exact envelope, replacing only the payload,
// CRC and length coordinates for each synthetic transport scenario.
export function sourceClosureZip(body: Uint8Array): Uint8Array {
  const original = Uint8Array.from(Buffer.from(fixture.base64, 'base64'))
  const old = new DataView(original.buffer)
  const start = 30 + old.getUint16(26, true)
  const oldCentral = old.getUint32(original.length - 6, true)
  const out = new Uint8Array(original.length - 3 + body.length)
  out.set(original.subarray(0, start))
  out.set(body, start)
  out.set(original.subarray(oldCentral - 16), start + body.length)
  const central = start + body.length + 16
  const v = new DataView(out.buffer)
  let crc = 0xffffffff
  for (const byte of body) {
    crc ^= byte
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
  }
  crc = (crc ^ 0xffffffff) >>> 0
  v.setUint32(central - 12, crc, true)
  v.setUint32(central - 8, body.length, true)
  v.setUint32(central - 4, body.length, true)
  v.setUint32(central + 16, crc, true)
  v.setUint32(central + 20, body.length, true)
  v.setUint32(central + 24, body.length, true)
  v.setUint32(out.length - 6, central, true)
  return out
}
