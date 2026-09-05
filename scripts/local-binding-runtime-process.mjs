import { spawn } from 'node:child_process';

export class LocalBindingRuntimeProcessError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'LocalBindingRuntimeProcessError';
    this.code = code;
  }
}

export function runLocalBindingBoundedProcess(executable, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd: options.cwd, env: options.env, shell: false,
      stdio: options.fd3 === undefined ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0 };
    let settled = false;
    let timer;
    let fd3Complete = options.fd3 === undefined;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolvePromise({
        stdout: Buffer.concat(output.stdout).toString('utf8'),
        stderr: Buffer.concat(output.stderr).toString('utf8'),
      });
    };
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      output[`${name}Bytes`] += chunk.length;
      if (output[`${name}Bytes`] > options.maxOutput) {
        child.kill('SIGKILL');
        finish(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_OUTPUT_LIMIT'));
      } else output[name].push(chunk);
    });
    child.on('error', error => finish(new LocalBindingRuntimeProcessError(
      'LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error },
    )));
    child.on('close', (code, signal) => {
      if (code !== 0 || signal !== null || !fd3Complete) finish(new LocalBindingRuntimeProcessError(
        signal === 'SIGKILL'
          ? 'LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT' : 'LOCAL_BINDING_RUNTIME_PROCESS_FAILED',
      ));
      else finish();
    });
    timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'));
    }, options.timeout);
    if (options.fd3 !== undefined) {
      const control = child.stdio[3];
      if (control === null || control === undefined) {
        child.kill('SIGKILL');
        finish(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED'));
      } else {
        control.on('error', error => {
          child.kill('SIGKILL');
          finish(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error }));
        });
        try { control.end(options.fd3, () => { fd3Complete = true; }); }
        catch (error) {
          child.kill('SIGKILL');
          finish(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error }));
        }
      }
    }
  });
}
