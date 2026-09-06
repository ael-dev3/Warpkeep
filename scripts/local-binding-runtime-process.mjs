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
    const containProcessGroup = options.containProcessGroup === true && process.platform !== 'win32';
    const child = spawn(executable, args, {
      cwd: options.cwd, env: options.env, shell: false,
      detached: containProcessGroup,
      stdio: options.fd3 === undefined ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0 };
    let settled = false;
    let timer;
    let fd3Complete = options.fd3 === undefined;
    let requestedError;
    let finalizing = false;
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
    const processGroupExists = () => {
      if (!containProcessGroup || !Number.isSafeInteger(child.pid) || child.pid < 2) return false;
      try { process.kill(-child.pid, 0); return true; } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
      }
    };
    const killOwned = () => {
      try {
        if (containProcessGroup && Number.isSafeInteger(child.pid) && child.pid >= 2) {
          process.kill(-child.pid, 'SIGKILL');
        } else child.kill('SIGKILL');
      } catch (error) {
        if (error?.code !== 'ESRCH') {
          requestedError = new LocalBindingRuntimeProcessError(
            'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED', { cause: error },
          );
        }
      }
    };
    const stop = error => {
      if (settled) return;
      requestedError ??= error;
      clearTimeout(timer);
      killOwned();
    };
    const finalize = async (code, signal) => {
      if (settled || finalizing) return;
      finalizing = true;
      clearTimeout(timer);
      let error = requestedError;
      if (error === undefined && (code !== 0 || signal !== null || !fd3Complete)) {
        error = new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED');
      }
      if (containProcessGroup) {
        let alive;
        try { alive = processGroupExists(); } catch (caught) {
          error = new LocalBindingRuntimeProcessError(
            'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED', { cause: caught },
          );
          alive = true;
        }
        if (alive) {
          if (error === undefined) {
            error = new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED');
          }
          killOwned();
          const deadline = Date.now() + 5_000;
          while (Date.now() < deadline) {
            try { if (!processGroupExists()) break; } catch (caught) {
              error = new LocalBindingRuntimeProcessError(
                'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED', { cause: caught },
              );
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          try {
            if (processGroupExists()) {
              error = new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED');
            }
          } catch (caught) {
            error = new LocalBindingRuntimeProcessError(
              'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED', { cause: caught },
            );
          }
        }
      }
      finish(error);
    };
    for (const name of ['stdout', 'stderr']) child[name].on('data', chunk => {
      output[`${name}Bytes`] += chunk.length;
      if (output[`${name}Bytes`] > options.maxOutput) {
        stop(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_OUTPUT_LIMIT'));
      } else output[name].push(chunk);
    });
    child.on('error', error => stop(new LocalBindingRuntimeProcessError(
      'LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error },
    )));
    child.on('close', (code, signal) => {
      void finalize(code, signal);
    });
    timer = setTimeout(() => {
      stop(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_TIMEOUT'));
    }, options.timeout);
    if (options.fd3 !== undefined) {
      const control = child.stdio[3];
      if (control === null || control === undefined) {
        stop(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED'));
      } else {
        control.on('error', error => {
          stop(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error }));
        });
        try { control.end(options.fd3, () => { fd3Complete = true; }); }
        catch (error) {
          stop(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED', { cause: error }));
        }
      }
    }
  });
}
