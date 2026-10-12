import ptr from './schema';
import { requirePtrConnection } from './auth';
import { requirePtrPopulationEmpty, type PtrContext } from './context';

// Authenticated provider metadata reviewed on 3 October 2026. These public
// identities admit maintenance connections; they grant no PTR procedure role.
const PTR_MAINTENANCE_DATABASE = 'c200df57bee179af512f05b3c7c328e3d4d7a6074ccc4ed976de84f94fb56d6e';
const PTR_PROVIDER_OWNER = 'c200431f50cf410304546489e2600c8446408f1aa727c91d86bc00aef6724d15';

function isProviderMaintenanceConnection(ctx: PtrContext): boolean {
  return ctx.connectionId !== null
    && ctx.senderAuth.isInternal === false
    && ctx.senderAuth.hasJWT === true
    && ctx.senderAuth.jwt !== null
    && ctx.databaseIdentity.toHexString() === PTR_MAINTENANCE_DATABASE
    && ctx.sender.toHexString() === PTR_PROVIDER_OWNER
    && ctx.senderAuth.jwt.identity.toHexString() === PTR_PROVIDER_OWNER;
}

/** Provider maintenance and the unchanged fresh PTR administrator/owner gates. */
export const onConnect = ptr.clientConnected(ctx => {
  // Owner SQL also invokes OnConnect. Do not hide unexpected existing rows
  // behind the ordinary empty-population gate during maintenance inspection.
  if (isProviderMaintenanceConnection(ctx)) return;
  requirePtrConnection(ctx);
  requirePtrPopulationEmpty(ctx);
});
