import { deriveLocalBindingSourceGraph } from '../../scripts/local-binding-runtime-core.mjs';

try {
  const graph = deriveLocalBindingSourceGraph(process.argv[2]);
  process.stdout.write(`${JSON.stringify({ modules: graph.modules.map(record => record.path) })}\n`);
} catch (error) {
  process.stderr.write(`${error?.code ?? error?.message ?? 'LOCAL_BINDING_SOURCE_GRAPH_FIXTURE_FAILED'}\n`);
  process.exitCode = 1;
}
