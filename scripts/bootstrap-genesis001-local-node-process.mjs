import { spawn } from 'node:child_process';

const MAX_CONFIRMATION_MS = 2_000;
const CONFIRMATION_INTERVAL_MS = 10;

export class Genesis001LocalNodeProcessError extends Error {
  constructor(code, options) {
    super(code, options);
    this.name = 'Genesis001LocalNodeProcessError';
    this.code = code;
  }
}

function processError(code, cause) {
  return new Genesis001LocalNodeProcessError(
    code,
    cause === undefined ? undefined : { cause },
  );
}

function exactEnvironment(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.entries(value).every(([key, entry]) => key.length > 0 && typeof entry === 'string');
}

function validate(executable, arguments_, options) {
  if (process.platform !== 'linux' || typeof executable !== 'string' || executable[0] !== '/'
      || !Array.isArray(arguments_) || arguments_.some(value => typeof value !== 'string')
      || options === null || typeof options !== 'object' || Array.isArray(options)
      || typeof options.cwd !== 'string' || options.cwd[0] !== '/'
      || !exactEnvironment(options.env)
      || !Number.isSafeInteger(options.timeout) || options.timeout < 1 || options.timeout > 60_000
      || !Number.isSafeInteger(options.maxStdout) || options.maxStdout < 0
      || !Number.isSafeInteger(options.maxStderr) || options.maxStderr < 0) {
    throw processError('GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_INPUT_INVALID');
  }
}

function groupAlive(pid) {
  try {
    process.kill(-pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    throw error;
  }
}

function killGroup(child) {
  if (!Number.isSafeInteger(child.pid) || child.pid < 1) {
    try { child.kill('SIGKILL'); } catch {}
    return;
  }
  try { process.kill(-child.pid, 'SIGKILL'); } catch (error) {
    if (error?.code !== 'ESRCH') {
      try { child.kill('SIGKILL'); } catch {}
    }
  }
}

async function confirmGroupGone(child) {
  if (!Number.isSafeInteger(child.pid) || child.pid < 1) return;
  const deadline = Date.now() + MAX_CONFIRMATION_MS;
  while (groupAlive(child.pid)) {
    killGroup(child);
    if (Date.now() >= deadline) {
      throw processError('GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_DESCENDANT_FAILED');
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, CONFIRMATION_INTERVAL_MS));
  }
}

export function runGenesis001NodeBoundedProcess(executable, arguments_, options) {
  validate(executable, arguments_, options);
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(executable, arguments_, {
      cwd: options.cwd,
      env: options.env,
      shell: false,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const chunks = { stdout: [], stderr: [] };
    const totals = { stdout: 0, stderr: 0 };
    let failure;
    let finalized = false;
    const zero = () => {
      for (const name of ['stdout', 'stderr']) {
        for (const chunk of chunks[name]) chunk.fill(0);
        chunks[name].length = 0;
        totals[name] = 0;
      }
    };
    const fail = error => {
      if (failure === undefined) failure = error;
      killGroup(child);
    };
    const timer = setTimeout(() => fail(processError(
      'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_TIMEOUT',
    )), options.timeout);
    for (const name of ['stdout', 'stderr']) {
      child[name].on('data', value => {
        const chunk = Buffer.from(value);
        if (failure !== undefined) { chunk.fill(0); return; }
        totals[name] += chunk.length;
        if (totals[name] > options[`max${name[0].toUpperCase()}${name.slice(1)}`]) {
          chunk.fill(0);
          fail(processError(`GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_${name.toUpperCase()}_LIMIT`));
        } else chunks[name].push(chunk);
      });
      child[name].on('error', error => fail(processError(
        'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_FAILED', error,
      )));
    }
    child.on('error', error => fail(processError(
      'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_FAILED', error,
    )));
    child.on('exit', (code, signal) => {
      if (code !== 0 || signal !== null) fail(failure ?? processError(
        signal === 'SIGKILL'
          ? 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_FAILED'
          : 'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_FAILED',
      ));
    });
    child.on('close', async (code, signal) => {
      if (finalized) return;
      finalized = true;
      clearTimeout(timer);
      if (code !== 0 || signal !== null) failure ??= processError(
        'GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_FAILED',
      );
      try {
        if (failure !== undefined || groupAlive(child.pid)) {
          failure ??= processError('GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_DESCENDANT_FAILED');
          killGroup(child);
          await confirmGroupGone(child);
        }
      } catch (error) {
        failure = processError('GENESIS001_LOCAL_NODE_BOOTSTRAP_PROCESS_DESCENDANT_FAILED',
          failure === undefined ? error : new AggregateError([failure, error]));
      }
      if (failure !== undefined) {
        zero();
        rejectPromise(failure);
        return;
      }
      resolvePromise(Object.freeze({
        stdout: Buffer.concat(chunks.stdout, totals.stdout),
        stderr: Buffer.concat(chunks.stderr, totals.stderr),
      }));
      zero();
    });
  });
}
