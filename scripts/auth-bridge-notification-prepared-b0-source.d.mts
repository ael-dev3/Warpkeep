export const AUTH_BRIDGE_NOTIFICATION_PREPARED_B0_SOURCE_AUTHORITY: Readonly<{
  sourceDigest: string;
  entrypoint: string;
  modules: readonly Readonly<{
    field: string;
    name: string;
    contentType: string;
    size: number;
    sha256: string;
  }>[];
}>;
