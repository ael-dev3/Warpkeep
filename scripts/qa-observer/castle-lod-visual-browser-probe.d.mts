export const CASTLE_LOD_VISUAL_EVIDENCE_ROUTE: '/dev/castle-lod-visual-evidence.html';
export const CASTLE_LOD_VISUAL_EVIDENCE_SOURCE_ROUTE: '/_warpkeep-local-qa/hegemony-main-castle-source.glb';
export const CASTLE_LOD_VISUAL_EVIDENCE_PROFILE_COUNT: 3;

export function loadCastleLodVisualEvidenceSource(): Buffer;
export function disposeCastleLodVisualEvidenceSource(source: Buffer | unknown): void;
export function castleLodVisualEvidenceSourceVitePlugin(source: Buffer): Readonly<{
  name: string;
  configureServer(server: unknown): void;
}>;
/** Actual numeric-loopback HEAD boundary probe; it retains no source bytes. */
export function assertCastleLodVisualEvidenceLoopbackBoundary(port: number): Promise<Readonly<{
  exactStatus: number;
  archiveStatus: number;
  queryStatus: number;
}>>;
export function castleLodVisualEvidenceUrl(port: number): string;
export function parseCastleLodVisualEvidence(
  value: unknown,
  expectedUrl: string
): Readonly<{
  renderer: 'webgl';
  targetPixels: 384;
  profiles: Readonly<Record<'high' | 'balanced' | 'compact', Readonly<{
    coverageDeltaBasisPoints: number;
    meanColorDelta: number;
    silhouetteIouBasisPoints: number;
  }>>>;
}>;
export function runCastleLodVisualEvidenceBrowserCase(
  session: unknown,
  options: Readonly<{ port: number; state: { violation: string } }>
): Promise<ReturnType<typeof parseCastleLodVisualEvidence>>;
