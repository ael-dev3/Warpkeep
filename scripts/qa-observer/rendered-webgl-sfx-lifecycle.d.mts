export type RenderedWebglSfxSession = Readonly<{
  command: (
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
}>;

export type RenderedWebglSfxEvidence = Readonly<{
  exactLogicalVoice: true;
  hiddenSuspended: true;
  hiddenSuppressed: true;
  mutedSuppressed: true;
  pregestureAbsent: true;
  restoredTrustedResume: true;
  trustedActivation: true;
}>;

export function parseRenderedWebglSfxEvidence(
  value: unknown
): RenderedWebglSfxEvidence;

export function applyRenderedWebglSfxInteraction(
  session: RenderedWebglSfxSession
): Promise<RenderedWebglSfxEvidence>;
