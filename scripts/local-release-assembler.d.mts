import type { PreparedLinuxReleaseSource, recoverPreparedLinuxReleaseSource } from './local-release-assembler-core.mjs';

/** Only the fixed prepare command or an opaque check/recover handle is accepted. */
export function runLocalReleaseAssembler(args: readonly string[]): Promise<
  PreparedLinuxReleaseSource | ReturnType<typeof recoverPreparedLinuxReleaseSource>
>;
