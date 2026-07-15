export type EmbeddedWebpImageRecord = Readonly<{
  index: number;
  name?: string;
  role: 'normal' | 'baseColor' | 'mixed' | 'generic';
  bytes: number;
  sha256: string;
  width: number;
  height: number;
}>;

export type EmbeddedWebpGlbInspection = Readonly<{
  images: readonly EmbeddedWebpImageRecord[];
}>;

export type EmbeddedWebpGlbRewrite = Readonly<{
  bytes: Buffer;
  originalImages: readonly EmbeddedWebpImageRecord[];
  images: readonly EmbeddedWebpImageRecord[];
  preservedRanges: readonly Readonly<{
    originalOffset: number;
    outputOffset: number;
    bytes: number;
    sha256: string;
  }>[];
  toolchain: Readonly<{
    sharp: '0.35.3';
    vips: '8.18.3';
    webp: '1.6.0';
  }>;
}>;

export function inspectEmbeddedWebpGlb(
  input: Uint8Array,
  options?: Readonly<{ label?: string }>
): Promise<EmbeddedWebpGlbInspection>;

export function rewriteEmbeddedWebpGlb(
  input: Uint8Array,
  options: Readonly<{ targetSize: number; label?: string }>
): Promise<EmbeddedWebpGlbRewrite>;

export const SHARP_TOOLCHAIN: Readonly<{
  sharp: '0.35.3';
  vips: '8.18.3';
  webp: '1.6.0';
}>;
