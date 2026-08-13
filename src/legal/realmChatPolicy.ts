/**
 * Review-only Realm Chat policy contract.
 *
 * This file does not grant client or server authority. The entry point must
 * remain disabled until the owner/legal gate, server authority, moderation
 * operations, release verification, and a separate activation record exist.
 */
export const WARPKEEP_REALM_CHAT_POLICY_VERSION =
  '2026-08-03-realm-chat-policy-v1';

export const WARPKEEP_REALM_CHAT_CHANNEL_KEY = 'realm:genesis-001';

export const WARPKEEP_REALM_CHAT_CLIENT_ENTRY_ENABLED = false;

export const WARPKEEP_REALM_CHAT_REVIEW_STATUS =
  'pending-owner-and-qualified-legal-review';
