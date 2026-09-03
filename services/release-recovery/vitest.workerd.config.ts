import { cloudflareTest } from '@cloudflare/vitest-pool-workers'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const TEST_RECONCILIATION_PROOF_FAKE = fileURLToPath(
  new URL('./test-workerd/reconciliationProof.fake.ts', import.meta.url),
)
const LEDGER_DURABLE_OBJECT_IMPORTER = /(?:^|\/)src\/ledgerDurableObject\.ts(?:\?.*)?$/u
const RECONCILIATION_PROOF_IMPORT = /(?:^|\/)reconciliationProof\.js(?:\?.*)?$/u

export default defineConfig({
  plugins: [
    {
      name: 'warpkeep-test-reconciliation-proof-fake',
      enforce: 'pre',
      resolveId(source, importer) {
        const normalizedSource = source.replaceAll('\\', '/')
        const normalizedImporter = importer?.replaceAll('\\', '/')
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
    testTimeout: 30_000,
  },
})
