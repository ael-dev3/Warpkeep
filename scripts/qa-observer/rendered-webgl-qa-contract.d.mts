export const RENDERED_WEBGL_QA_ROUTE: '/dev/realm-rendered-webgl-qa.html';
export const RENDERED_WEBGL_QA_FIXTURE_ID: 'synthetic-canonical-100';
export const RENDERED_WEBGL_QA_CASTLE_COUNT: 100;
export const RENDERED_WEBGL_QA_MAX_READY_MILLISECONDS: 120000;

export type RenderedWebglQaQuality = 'high' | 'balanced' | 'reduced';

export type RenderedWebglQaObservation = Readonly<{
  version: 1;
  fixture: 'synthetic-canonical-100';
  renderer: 'webgl';
  quality: RenderedWebglQaQuality;
  castleCount: 100;
  readyAfterMilliseconds: number;
}>;

export function renderedWebglQaUrl(options?: Readonly<{
  quality?: RenderedWebglQaQuality;
  port?: number;
}>): string;

export function parseRenderedWebglQaObservation(value: unknown): RenderedWebglQaObservation;
