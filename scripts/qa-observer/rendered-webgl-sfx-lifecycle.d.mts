export type RenderedWebglSfxSession = Readonly<{
  command: (
    method: string,
    params?: Readonly<Record<string, unknown>>,
  ) => Promise<unknown>;
}>;

export type RenderedWebglSfxSnapshot = Readonly<{
  acceptedLogicalVoiceCount: number;
  activeVoices: number;
  contextCreated: boolean;
  contextState: 'unavailable' | 'running' | 'suspended' | 'closed' | 'interrupted';
  hidden: boolean;
  keepAmbienceActive: boolean;
  muted: boolean;
  voiceCap: 16;
  waterAmbienceActive: boolean;
  waterAmbienceRegime: 'none' | 'river' | 'ocean';
}>;

export function parseRenderedWebglSfxSnapshot(
  value: unknown
): RenderedWebglSfxSnapshot;

export type RenderedWebglSfxEvidence = Readonly<{
  exactLogicalVoice: true;
  hiddenSuspended: true;
  hiddenSuppressed: true;
  mutedSuppressed: true;
  offlineCorpusRendered: true;
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
