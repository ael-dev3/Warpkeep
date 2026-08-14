export const PRODUCTION_PLAYER_CANARY_BROWSER_LAUNCHER_PROFILE:
  'warpkeep-production-player-canary-browser-launcher-v1';

export type ProductionPlayerCanaryBrowserLaunchPacket = Readonly<{
  evidenceNonce: string;
  reviewedAdmissionPlanDigest: string;
  routeSetCommitment: string;
}>;

export class ProductionPlayerCanaryBrowserLauncherError extends Error {
  readonly code: string;
}

export function encodeProductionPlayerCanaryBrowserLaunchPacket(
  value: ProductionPlayerCanaryBrowserLaunchPacket,
): Buffer;

export function writeProductionPlayerCanaryBrowserLaunchPacket(input: Readonly<{
  destination: string;
  packet: ProductionPlayerCanaryBrowserLaunchPacket;
}>): ProductionPlayerCanaryBrowserLaunchPacket;

export function inspectProductionPlayerCanaryBrowserLaunchPacket(input: Readonly<{
  path: string;
}>): ProductionPlayerCanaryBrowserLaunchPacket;

export function runProductionPlayerCanaryBrowserLauncherCli(
  arguments_?: readonly string[],
): Promise<void>;
