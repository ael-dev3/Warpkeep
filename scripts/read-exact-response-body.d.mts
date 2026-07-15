export function readExactResponseBody(
  response: Response,
  expectedBytes: number,
  label: string
): Promise<Buffer>;
