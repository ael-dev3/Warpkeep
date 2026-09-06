import { request as httpsRequest } from 'node:https';

function rejected(errorCode, cause) {
  return Object.assign(
    new Error(errorCode, cause === undefined ? undefined : { cause }),
    { code: errorCode },
  );
}

function validInput(url, options) {
  return url instanceof URL
    && url.protocol === 'https:'
    && url.hostname === 'registry.npmjs.org'
    && url.port === ''
    && url.username === ''
    && url.password === ''
    && url.hash === ''
    && url.search === ''
    && options !== null
    && typeof options === 'object'
    && Number.isSafeInteger(options.maximumBytes)
    && options.maximumBytes > 0
    && Number.isSafeInteger(options.deadlineMs)
    && options.deadlineMs > 0
    && typeof options.errorCode === 'string'
    && /^[A-Z][A-Z0-9_]+$/u.test(options.errorCode);
}

export function downloadLocalPreparationArchive(url, options) {
  const fallbackCode = typeof options?.errorCode === 'string'
    && /^[A-Z][A-Z0-9_]+$/u.test(options.errorCode)
    ? options.errorCode : 'LOCAL_PREPARATION_ARCHIVE_FETCH_REJECTED';
  if (!validInput(url, options)) return Promise.reject(rejected(fallbackCode));

  const { maximumBytes, deadlineMs, errorCode } = options;
  return new Promise((resolvePromise, rejectPromise) => {
    let settled = false;
    let request;
    let response;
    let deadline;
    let ended = false;
    const chunks = [];
    let total = 0;

    const eraseChunks = () => {
      for (const chunk of chunks) chunk.fill(0);
      chunks.length = 0;
      total = 0;
    };
    const settle = (callback, value, cancel) => {
      if (settled) return;
      settled = true;
      if (deadline !== undefined) clearTimeout(deadline);
      if (cancel) {
        eraseChunks();
        try { response?.destroy(); } catch {}
        try { request?.destroy(); } catch {}
      }
      callback(value);
    };
    const rejectFetch = cause => settle(rejectPromise, rejected(errorCode, cause), true);

    deadline = setTimeout(() => rejectFetch(), deadlineMs);
    try {
      request = httpsRequest(url, {
        method: 'GET',
        headers: { accept: 'application/octet-stream', 'accept-encoding': 'identity' },
        timeout: deadlineMs,
        agent: false,
      }, incoming => {
        if (settled) {
          try { incoming.destroy(); } catch {}
          return;
        }
        response = incoming;
        const lengthHeader = incoming.headers['content-length'];
        const canonicalLength = typeof lengthHeader === 'string'
          && /^(?:0|[1-9][0-9]*)$/u.test(lengthHeader)
          && Number.isSafeInteger(Number(lengthHeader));
        const declaredLength = lengthHeader === undefined ? undefined : Number(lengthHeader);
        if (incoming.statusCode !== 200
            || incoming.headers.location !== undefined
            || incoming.headers['content-encoding'] !== undefined
            || (lengthHeader !== undefined
              && (!canonicalLength || declaredLength > maximumBytes))) {
          rejectFetch();
          return;
        }
        incoming.on('data', chunk => {
          if (settled) return;
          if (!Buffer.isBuffer(chunk)) {
            rejectFetch();
            return;
          }
          total += chunk.length;
          if (!Number.isSafeInteger(total) || total > maximumBytes
              || (declaredLength !== undefined && total > declaredLength)) {
            rejectFetch();
            return;
          }
          chunks.push(chunk);
        });
        incoming.on('end', () => {
          if (settled) return;
          ended = true;
          if (declaredLength !== undefined && total !== declaredLength) {
            rejectFetch();
            return;
          }
          const body = Buffer.concat(chunks, total);
          eraseChunks();
          settle(resolvePromise, body, false);
        });
        incoming.on('aborted', () => rejectFetch());
        incoming.on('error', error => rejectFetch(error));
        incoming.on('close', () => {
          if (!ended && !settled) rejectFetch();
        });
      });
      request.on('timeout', () => rejectFetch());
      request.on('error', error => rejectFetch(error));
      request.end();
    } catch (error) {
      rejectFetch(error);
    }
  });
}
