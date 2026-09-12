import { pathToFileURL } from 'node:url';

export class Genesis001LocalNodeBootstrapError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'Genesis001LocalNodeBootstrapError';
    this.code = code;
  }
}

function fail(code, cause) {
  throw new Genesis001LocalNodeBootstrapError(
    code,
    cause === undefined ? undefined : { cause },
  );
}

export async function bootstrapGenesis001LocalNode(...arguments_) {
  if (arguments_.length !== 0) {
    fail('GENESIS001_LOCAL_NODE_BOOTSTRAP_ARGUMENTS_INVALID');
  }
  try {
    const { runGenesis001LocalNodeBootstrap } = await import(
      './bootstrap-genesis001-local-node-core.mjs'
    );
    return await runGenesis001LocalNodeBootstrap();
  } catch (error) {
    if (error instanceof Genesis001LocalNodeBootstrapError) throw error;
    const code = typeof error?.code === 'string'
      && /^GENESIS001_LOCAL_NODE_BOOTSTRAP_[A-Z0-9_]+$/u.test(error.code)
      ? error.code
      : 'GENESIS001_LOCAL_NODE_BOOTSTRAP_FAILED';
    fail(code, error);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) {
    process.stderr.write('GENESIS001_LOCAL_NODE_BOOTSTRAP_ARGUMENTS_INVALID\n');
    process.exitCode = 1;
  } else {
    bootstrapGenesis001LocalNode().then(result => {
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }).catch(error => {
      process.stderr.write(`${error.code ?? 'GENESIS001_LOCAL_NODE_BOOTSTRAP_FAILED'}\n`);
      process.exitCode = 1;
    });
  }
}
