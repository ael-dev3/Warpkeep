import { spawn } from 'node:child_process';

export class LocalBindingRuntimeProcessError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'LocalBindingRuntimeProcessError';
    this.code = code;
  }
}

const TERMINATION_TIMEOUT = 5_000;
const TERMINATION_POLL = 20;

export function runLocalBindingBoundedProcess(executable, args, options) {
  return new Promise((resolvePromise, reject) => {
    if (options.inheritedFd4 !== undefined
      && (!Number.isSafeInteger(options.inheritedFd4) || options.inheritedFd4 < 3)) {
      reject(new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_DESCRIPTOR_INVALID'));
      return;
    }
    const containProcessGroup = options.containProcessGroup === true && process.platform !== 'win32';
    const child = spawn(executable, args, {
      cwd: options.cwd, env: options.env, shell: false,
      detached: containProcessGroup,
      stdio: options.inheritedFd4 !== undefined
        ? ['ignore', 'pipe', 'pipe', options.fd3 === undefined ? 'ignore' : 'pipe', options.inheritedFd4]
        : options.fd3 === undefined ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe', 'pipe'],
    });
    const output = { stdout: [], stderr: [], stdoutBytes: 0, stderrBytes: 0 };
    let settled = false;
    let operationTimer;
    let terminationTimer;
    let fd3Complete = options.fd3 === undefined;
    let requestedError;
    let terminationDeadline;
    let unexpectedSurvivor = false;
    let killError;
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(operationTimer);
      clearTimeout(terminationTimer);
      if (error) reject(error);
      else resolvePromise({
        stdout: Buffer.concat(output.stdout).toString('utf8'),
        stderr: Buffer.concat(output.stderr).toString('utf8'),
      });
    };
    const ownedProcessExists = () => {
      if (!Number.isSafeInteger(child.pid) || child.pid < 2) return false;
      try { process.kill(containProcessGroup ? -child.pid : child.pid, 0); return true; } catch (error) {
        if (error?.code === 'ESRCH') return false;
        throw error;
      }
    };
    const killOwned = () => {
      try {
        if (containProcessGroup && Number.isSafeInteger(child.pid) && child.pid >= 2) {
          process.kill(-child.pid, 'SIGKILL');
        } else if (child.kill('SIGKILL') === false) {
          killError ??= new Error('LOCAL_BINDING_RUNTIME_PROCESS_KILL_FAILED');
        }
      } catch (error) {
        if (error?.code !== 'ESRCH') killError ??= error;
      }
    };
    const containmentFailure = cause => new LocalBindingRuntimeProcessError(
      'LOCAL_BINDING_RUNTIME_PROCESS_CONTAINMENT_FAILED',
      cause === undefined ? undefined : { cause },
    );
    const pollTermination = () => {
      if (settled || terminationDeadline === undefined) return;
      let alive;
      try { alive = ownedProcessExists(); } catch (error) {
        finish(containmentFailure(requestedError ?? error));
        return;
      }
      if (!alive) {
        finish(unexpectedSurvivor ? containmentFailure(requestedError ?? killError) : requestedError);
        return;
      }
      if (Date.now() >= terminationDeadline) {
        killOwned();
        try { alive = ownedProcessExists(); } catch (error) {
          finish(containmentFailure(requestedError ?? error));
          return;
        }
        finish(alive || unexpectedSurvivor
          ? containmentFailure(requestedError ?? killError)
          : requestedError);
        return;
      }
      terminationTimer = setTimeout(pollTermination, TERMINATION_POLL);
    };
    const beginTermination = (error, survivorIsFailure = false) => {
      if (settled) return;
      requestedError ??= error;
      unexpectedSurvivor ||= survivorIsFailure;
      clearTimeout(operationTimer);
      if (terminationDeadline !== undefined) return;
      terminationDeadline = Date.now() + TERMINATION_TIMEOUT;
      killOwned();
      terminationTimer = setTimeout(pollTermination, 0);
    };
    const stop = error => beginTermination(error);
    const closed = (code, signal) => {
      if (settled) return;
      clearTimeout(operationTimer);
      const error = requestedError ?? ((code !== 0 || signal !== null || !fd3Complete)
        ? new LocalBindingRuntimeProcessError('LOCAL_BINDING_RUNTIME_PROCESS_FAILED')
        : undefined);
      if (terminationDeadline !== undefined) {
        requestedError ??= error;
        pollTermination();
        return;
      }
      if (!containProcessGroup) {
        finish(error);
        return;
      }
      let alive;
      try { alive = ownedProcessExists(); } catch (caught) {
        finish(containmentFailure(error ?? caught));
        return;
      }
      if (alive) beginTermination(error, error === undefined);
      else finish(error);
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
    child.on('close', closed);
    operationTimer = setTimeout(() => {
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
