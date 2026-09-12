import { SenderError, t } from 'spacetimedb/server';

import { inspectGreaterRealmV17 } from './atlasAuthority';
import { requirePtrAdmin, requirePtrOwner } from './auth';
import {
  PTR_MODULE_IDENTITY,
  PTR_OWNER_SINGLETON_KEY,
  PTR_REALM_ID,
  PTR_RELEASE_VERSION,
} from './contract';
import {
  ptrPopulationSnapshot,
  requirePtrPopulationEmpty,
  type PtrContext,
} from './context';
import {
  PtrOwnerPolicyError,
  planPtrOwnerProvision,
  planPtrOwnerSuspension,
  requirePtrOwnerProvisionBinding,
} from './ownerPolicy';
import ptr from './schema';

type SharedGreaterRealmContext = Parameters<typeof inspectGreaterRealmV17>[0];

function sharedGreaterRealmContext(ctx: PtrContext): SharedGreaterRealmContext {
  return ctx as unknown as SharedGreaterRealmContext;
}

function fail(error: unknown, fallback: string): never {
  if (error instanceof PtrOwnerPolicyError) throw new SenderError(error.code);
  if (error instanceof SenderError) throw error;
  throw new SenderError(fallback);
}

function audit(
  ctx: PtrContext,
  actorSubject: string,
  action: string,
  targetFid: bigint,
): void {
  ctx.db.adminAudit.insert({
    id: 0n,
    action,
    targetFid,
    actorSubject,
    createdAt: ctx.timestamp,
    note: `realm=${PTR_REALM_ID};module=${PTR_MODULE_IDENTITY}`,
  });
}

const ptrOwnerStatusV1 = t.object('PtrOwnerStatusV1', {
  realmId: t.string(),
  releaseVersion: t.string(),
  moduleIdentity: t.string(),
  ownerFid: t.u64(),
  authEpoch: t.u32(),
  accessGranted: t.bool(),
  atlasReady: t.bool(),
  sessionExpiresAt: t.u64(),
});

/** Create the only PTR owner anchor. A repeat never becomes an upsert. */
export const adminProvisionPtrOwnerV1 = ptr.reducer(
  { name: 'admin_provision_ptr_owner_v1' },
  { ownerFid: t.u64(), authEpoch: t.u32() },
  (ctx, { ownerFid, authEpoch }) => {
    try {
      const admin = requirePtrAdmin(ctx);
      requirePtrOwnerProvisionBinding(admin, ownerFid, authEpoch);
      requirePtrPopulationEmpty(ctx);
      const atlas = inspectGreaterRealmV17(sharedGreaterRealmContext(ctx));
      if (!atlas.ready || !atlas.importsExact) {
        throw new SenderError('PTR_OWNER_ATLAS_NOT_SEALED');
      }
      const existing = ctx.db.ptrOwnerAnchorV1.singletonKey.find(
        PTR_OWNER_SINGLETON_KEY,
      );
      const plan = planPtrOwnerProvision(
        ctx.db.ptrOwnerAnchorV1.count(),
        existing,
        ownerFid,
        authEpoch,
      );
      ctx.db.ptrOwnerAnchorV1.insert({
        ...plan,
        provisionedAt: ctx.timestamp,
        provisionedBy: admin.subject,
        suspendedAt: undefined,
        suspendedBy: undefined,
      });
      audit(ctx, admin.subject, 'ptr_owner_provisioned_v1', ownerFid);
      requirePtrPopulationEmpty(ctx);
    } catch (error) {
      return fail(error, 'PTR_OWNER_PROVISION_FAILED');
    }
  },
);

/** Disable the retained owner anchor permanently; no inverse reducer exists. */
export const adminSuspendPtrOwnerV1 = ptr.reducer(
  { name: 'admin_suspend_ptr_owner_v1' },
  (ctx) => {
    try {
      const admin = requirePtrAdmin(ctx);
      requirePtrPopulationEmpty(ctx);
      const existing = ctx.db.ptrOwnerAnchorV1.singletonKey.find(
        PTR_OWNER_SINGLETON_KEY,
      );
      if (existing === null) {
        throw new PtrOwnerPolicyError('PTR_OWNER_CARDINALITY_INVALID');
      }
      const suspended = planPtrOwnerSuspension(
        existing,
        ctx.db.ptrOwnerAnchorV1.count(),
      );
      ctx.db.ptrOwnerAnchorV1.singletonKey.update({
        ...suspended,
        suspendedAt: ctx.timestamp,
        suspendedBy: admin.subject,
      });
      audit(ctx, admin.subject, 'ptr_owner_suspended_v1', existing.ownerFid);
      requirePtrPopulationEmpty(ctx);
    } catch (error) {
      return fail(error, 'PTR_OWNER_SUSPEND_FAILED');
    }
  },
);

/** Owner-only private status; a suspended anchor cannot call it. */
export const getPtrOwnerStatusV1 = ptr.procedure(
  { name: 'get_ptr_owner_status_v1' },
  ptrOwnerStatusV1,
  ctx => ctx.withTx(tx => {
    try {
      const { claims, anchor } = requirePtrOwner(tx);
      requirePtrPopulationEmpty(tx);
      const atlas = inspectGreaterRealmV17(sharedGreaterRealmContext(tx));
      if (ptrPopulationSnapshot(tx).castles !== 0n) {
        throw new SenderError('PTR_POPULATION_NOT_EMPTY');
      }
      return {
        realmId: PTR_REALM_ID,
        releaseVersion: PTR_RELEASE_VERSION,
        moduleIdentity: PTR_MODULE_IDENTITY,
        ownerFid: anchor.ownerFid,
        authEpoch: anchor.authEpoch,
        accessGranted: anchor.enabled,
        atlasReady: atlas.ready,
        sessionExpiresAt: BigInt(claims.sessionExpiresAt),
      };
    } catch (error) {
      return fail(error, 'PTR_OWNER_STATUS_FAILED');
    }
  }),
);
