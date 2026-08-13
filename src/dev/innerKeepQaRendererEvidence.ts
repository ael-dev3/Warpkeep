export type InnerKeepQaRendererEvidence = Readonly<{
  drawCalls: number;
  triangles: number;
}>;

type RendererInfoSource = Readonly<{
  info: Readonly<{
    render: Readonly<{
      calls: number;
      triangles: number;
    }>;
  }>;
}>;

function nonNegativeInteger(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

/** Values from the most recently completed WebGLRenderer.render() call. */
export function readInnerKeepQaRendererEvidence(
  renderer: RendererInfoSource | null,
): InnerKeepQaRendererEvidence {
  return Object.freeze({
    drawCalls: nonNegativeInteger(renderer?.info.render.calls),
    triangles: nonNegativeInteger(renderer?.info.render.triangles),
  });
}
