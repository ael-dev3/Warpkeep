import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const TEST_RECONCILIATION_PROOF_FAKE = fileURLToPath(
  new URL('./test-workerd/reconciliationProof.fake.ts', import.meta.url),
)
const LEDGER_DURABLE_OBJECT_IMPORTER = /(?:^|\/)src\/ledgerDurableObject\.ts(?:\?.*)?$/u
const RECONCILIATION_PROOF_IMPORT = /(?:^|\/)reconciliationProof\.js(?:\?.*)?$/u
const PREPARATION_INERT_DATA = fileURLToPath(new URL('./test-workerd/preparationInertData.fake.ts', import.meta.url))

export default defineConfig({
  define: { __WARPKEEP_PREPARATION_TEST_RESET_TIMEOUT__: process.platform === 'win32' ? '30000' : '10000' },
  plugins: [
    {
      name: 'warpkeep-test-reconciliation-proof-fake',
      enforce: 'pre',
      resolveId(source, importer) {
        const normalizedSource = source.replaceAll('\\', '/')
        const normalizedImporter = importer?.replaceAll('\\', '/')
        if (normalizedImporter?.endsWith('/src/index-signer.ts')
          && /^\.\.\/fixtures\/spacetime\/(?:manifest|g001\.raw-module-def-v10|g002\.raw-module-def-v10|ptr\.raw-module-def-v10)\.json$/u.test(normalizedSource)) {
          return PREPARATION_INERT_DATA
        }
        if (
          LEDGER_DURABLE_OBJECT_IMPORTER.test(normalizedImporter ?? '')
          && RECONCILIATION_PROOF_IMPORT.test(normalizedSource)
        ) return TEST_RECONCILIATION_PROOF_FAKE
      },
    },
    cloudflareTest({
      wrangler: { configPath: './wrangler.workerd.toml' },
    }),
  ],
  test: {
    include: ['test-workerd/**/*.test.ts'],
    // Both suites use the pool's global reset helper. Running their files in
    // parallel can reset the other namespace while an RPC is still in flight.
    fileParallelism: false,
    testTimeout: 30_000,
  },
})
