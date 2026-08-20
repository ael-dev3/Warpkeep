// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'

import {
  prepareAndWriteAuthBridgeNotificationB0Receipt,
} from '../scripts/auth-bridge-notification-b0-deploy-adapter.mjs'
import {
  prepareAndWriteAuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs'

const ADMIN_TOKEN = 'owner-private-test-admin-token-value'
const SOURCE_COMMIT = 'c'.repeat(40)
const NOW = new Date('2026-08-21T00:00:00.000Z')

describe('private bridge PRE-attestation diagnostics', () => {
  it('propagates an auth rejection through B0 before deploy or journal entry', async () => {
    const deploy = vi.fn(async () => undefined)
    const publication = vi.fn(async () => undefined)
    const withPublicationJournal = publication as unknown as NonNullable<
      Parameters<typeof prepareAndWriteAuthBridgeNotificationB0Receipt>[0]
    >['withPublicationJournal']

    await expect(prepareAndWriteAuthBridgeNotificationB0Receipt({
      adminToken: ADMIN_TOKEN,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch,
      clock: () => NOW,
      repositoryRoot: process.cwd(),
      deploy,
      withPublicationJournal,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_AUTH_REJECTED',
    })
    expect(deploy).not.toHaveBeenCalled()
    expect(publication).not.toHaveBeenCalled()
  })

  it('propagates rate limiting through prepared before deploy or receipt write', async () => {
    const deploy = vi.fn(async () => undefined)

    await expect(prepareAndWriteAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: vi.fn(async () => new Response(null, { status: 429 })) as typeof fetch,
      clock: () => NOW,
      repositoryRoot: process.cwd(),
      deploy,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_RATE_LIMITED',
    })
    expect(deploy).not.toHaveBeenCalled()
  })
})
