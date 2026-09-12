// Wrangler Data modules retain the exact bytes captured by the fixed generator.
declare module '*.json' {
  const bytes: ArrayBuffer
  export default bytes
}
