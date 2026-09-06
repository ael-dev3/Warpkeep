export function downloadLocalPreparationArchive(
  url: URL,
  options: Readonly<{
    maximumBytes: number;
    deadlineMs: number;
    errorCode: string;
  }>,
): Promise<Buffer>;
