const PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS = 5_000;
const RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS = 10_000;
const RENDERED_WEBGL_QA_SFX_BRIDGE_KEY = '__warpkeepRenderedWebglSfxLifecycleV1';
const RENDERED_WEBGL_QA_SFX_POLL_INTERVAL_MILLISECONDS = 40;

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(message);
  return value;
}

function exactKeys(value, allowed) {
  const keys = Object.keys(value);
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function parseRenderedWebglSfxPointerTarget(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL SFX pointer target.');
  if (
    !exactKeys(candidate, new Set(['x', 'y']))
    || !Number.isFinite(candidate.x)
    || !Number.isFinite(candidate.y)
    || candidate.x < 0
    || candidate.y < 0
    || candidate.x > RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS
    || candidate.y > RENDERED_WEBGL_QA_MAX_POINTER_COORDINATE_PIXELS
  ) throw new TypeError('Invalid rendered WebGL SFX pointer target.');
  return Object.freeze({ x: candidate.x, y: candidate.y });
}

export function parseRenderedWebglSfxEvidence(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL SFX evidence.');
  const keys = [
    'exactLogicalVoice',
    'hiddenSuspended',
    'hiddenSuppressed',
    'mutedSuppressed',
    'offlineCorpusRendered',
    'pregestureAbsent',
    'restoredTrustedResume',
    'trustedActivation',
  ];
  if (
    !exactKeys(candidate, new Set(keys))
    || keys.some((key) => candidate[key] !== true)
  ) throw new TypeError('Invalid rendered WebGL SFX evidence.');
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, true])));
}

function parseRenderedWebglSfxSnapshot(value) {
  const candidate = exactRecord(value, 'Invalid rendered WebGL SFX snapshot.');
  const keys = [
    'acceptedLogicalVoiceCount',
    'activeVoices',
    'contextCreated',
    'contextState',
    'hidden',
    'muted',
    'voiceCap',
    'waterAmbienceActive',
    'waterAmbienceRegime',
  ];
  if (
    !exactKeys(candidate, new Set(keys))
    || !Number.isSafeInteger(candidate.acceptedLogicalVoiceCount)
    || candidate.acceptedLogicalVoiceCount < 0
    || !Number.isSafeInteger(candidate.activeVoices)
    || candidate.activeVoices < 0
    || candidate.activeVoices > 16
    || typeof candidate.contextCreated !== 'boolean'
    || !['unavailable', 'running', 'suspended', 'closed', 'interrupted']
      .includes(candidate.contextState)
    || typeof candidate.hidden !== 'boolean'
    || typeof candidate.muted !== 'boolean'
    || candidate.voiceCap !== 16
    || typeof candidate.waterAmbienceActive !== 'boolean'
    || !['none', 'river', 'ocean'].includes(candidate.waterAmbienceRegime)
  ) throw new TypeError('Invalid rendered WebGL SFX snapshot.');
  return Object.freeze({ ...candidate });
}

async function clickRenderedWebglSfxControl(session, selector) {
  let evaluation;
  try {
    evaluation = await session.command('Runtime.evaluate', {
      expression: `(() => {
        const control = document.querySelector(${JSON.stringify(selector)});
        if (!(control instanceof HTMLElement)) return null;
        const bounds = control.getBoundingClientRect();
        const target = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
        const hit = document.elementFromPoint(target.x, target.y);
        return bounds.width > 0 && bounds.height > 0
          && (hit === control || control.contains(hit)) ? target : null;
      })()`,
      returnByValue: true,
    });
  } catch (error) {
    throw new Error('Rendered WebGL SFX control hit test failed.', { cause: error });
  }
  if (evaluation?.exceptionDetails || evaluation?.result?.type !== 'object') {
    throw new Error(`Rendered WebGL SFX control was unavailable: ${selector}`);
  }
  const target = parseRenderedWebglSfxPointerTarget(evaluation.result.value);
  for (const [type, buttons] of [
    ['mouseMoved', 0],
    ['mousePressed', 1],
    ['mouseReleased', 0],
  ]) {
    await session.command('Input.dispatchMouseEvent', {
      type,
      x: target.x,
      y: target.y,
      button: type === 'mouseMoved' ? 'none' : 'left',
      buttons,
      clickCount: type === 'mouseMoved' ? 0 : 1,
      pointerType: 'mouse',
    });
  }
}

function renderedWebglSfxBridgeExpression(expression) {
  return `(() => {
    const bridge = globalThis[${JSON.stringify(RENDERED_WEBGL_QA_SFX_BRIDGE_KEY)}];
    if (!bridge) return null;
    return ${expression};
  })()`;
}

async function evaluateRenderedWebglSfxValue(
  session,
  expression,
  phase,
  awaitPromise = false
) {
  let evaluation;
  try {
    evaluation = await session.command('Runtime.evaluate', {
      expression,
      ...(awaitPromise ? { awaitPromise: true } : {}),
      returnByValue: true,
    });
  } catch (error) {
    throw new Error(`Rendered WebGL SFX ${phase} failed.`, { cause: error });
  }
  if (
    evaluation?.exceptionDetails
    || !evaluation?.result
    || !Object.prototype.hasOwnProperty.call(evaluation.result, 'value')
  ) throw new Error(`Rendered WebGL SFX ${phase} evaluation failed.`);
  return evaluation.result.value;
}

async function readRenderedWebglSfxSnapshot(session) {
  const value = await evaluateRenderedWebglSfxValue(
    session,
    renderedWebglSfxBridgeExpression('bridge.snapshot()'),
    'snapshot'
  );
  return parseRenderedWebglSfxSnapshot(value);
}

async function waitForRenderedWebglSfxSnapshot(session, accepted, phase) {
  const deadline = Date.now() + PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS;
  let lastSnapshot;
  while (Date.now() <= deadline) {
    lastSnapshot = await readRenderedWebglSfxSnapshot(session);
    if (accepted(lastSnapshot)) return lastSnapshot;
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await delay(Math.min(RENDERED_WEBGL_QA_SFX_POLL_INTERVAL_MILLISECONDS, remaining));
    }
  }
  const state = lastSnapshot
    ? [
        `created=${String(lastSnapshot.contextCreated)}`,
        `state=${lastSnapshot.contextState}`,
        `hidden=${String(lastSnapshot.hidden)}`,
        `muted=${String(lastSnapshot.muted)}`,
        `voices=${String(lastSnapshot.activeVoices)}`,
        `accepted=${String(lastSnapshot.acceptedLogicalVoiceCount)}`,
      ].join(',')
    : 'no-snapshot';
  throw new Error(`Rendered WebGL SFX ${phase} did not settle (${state}).`);
}

async function readRenderedWebglSfxBoolean(session, method, phase) {
  const value = await evaluateRenderedWebglSfxValue(
    session,
    renderedWebglSfxBridgeExpression(`bridge.${method}()`),
    phase
  );
  if (typeof value !== 'boolean') {
    throw new Error(`Rendered WebGL SFX ${phase} returned an invalid result.`);
  }
  return value;
}

async function readRenderedWebglSfxPromiseBoolean(session, method, phase) {
  const value = await evaluateRenderedWebglSfxValue(
    session,
    renderedWebglSfxBridgeExpression(`bridge.${method}()`),
    phase,
    true
  );
  if (typeof value !== 'boolean') {
    throw new Error(`Rendered WebGL SFX ${phase} returned an invalid result.`);
  }
  return value;
}

async function requireRenderedWebglSfxAction(session, method, phase) {
  if (!await readRenderedWebglSfxBoolean(session, method, phase)) {
    throw new Error(`Rendered WebGL SFX ${phase} was unavailable.`);
  }
}

async function waitForRenderedWebglSfxBoolean(session, method, phase) {
  const deadline = Date.now() + PRESENTATION_SETTLE_TIMEOUT_MILLISECONDS;
  while (Date.now() <= deadline) {
    if (await readRenderedWebglSfxBoolean(session, method, phase)) return;
    const remaining = deadline - Date.now();
    if (remaining > 0) {
      await delay(Math.min(RENDERED_WEBGL_QA_SFX_POLL_INTERVAL_MILLISECONDS, remaining));
    }
  }
  throw new Error(`Rendered WebGL SFX ${phase} did not settle.`);
}

async function installRenderedWebglSfxBridge(session) {
  return evaluateRenderedWebglSfxValue(
    session,
    `Promise.all([
      import('/src/dev/RenderedWebglQaHarness.tsx'),
    ]).then(([harness]) => {
      const bridgeKey = ${JSON.stringify(RENDERED_WEBGL_QA_SFX_BRIDGE_KEY)};
      const previous = globalThis[bridgeKey];
      try {
        previous?.destroy?.();
      } finally {
        Reflect.deleteProperty(globalThis, bridgeKey);
      }
      const ownHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
      let hiddenOverridden = false;
      let hiddenValue = document.hidden;
      const ensureVisibilityOverride = () => {
        if (hiddenOverridden) return;
        Object.defineProperty(document, 'hidden', {
          configurable: true,
          get: () => hiddenValue,
        });
        hiddenOverridden = true;
      };
      const audioSwitch = () => document.querySelector(
        '.warpkeep-settings__choices--audio input[role="switch"]'
      );
      const bridge = Object.freeze({
        snapshot: () => harness.readRenderedWebglQaSfxSnapshot(),
        emitProbeVoice: () => {
          harness.emitRenderedWebglQaProbeSfx();
          return true;
        },
        renderOfflineCorpus: () => (
          harness.proveRenderedWebglQaOfflineSfxCorpus()
        ),
        openSettings: () => {
          const settings = [...document.querySelectorAll(
            '.realm-profile-menu button[data-command-intent="secondary"]'
          )].find((button) => (
            button instanceof HTMLButtonElement
            && (button.querySelector('strong')?.textContent ?? '').trim()
              === 'SETTINGS'
          ));
          if (!(settings instanceof HTMLButtonElement) || settings.disabled) return false;
          settings.click();
          return true;
        },
        hasAudioSwitch: () => audioSwitch() instanceof HTMLInputElement,
        toggleAudio: () => {
          const control = audioSwitch();
          if (!(control instanceof HTMLInputElement) || control.disabled) return false;
          control.click();
          return true;
        },
        hideVisibility: () => {
          ensureVisibilityOverride();
          hiddenValue = true;
          document.dispatchEvent(new Event('visibilitychange'));
          return document.hidden === true;
        },
        restoreVisibility: () => {
          if (hiddenOverridden) {
            hiddenValue = false;
            document.dispatchEvent(new Event('visibilitychange'));
          }
          return document.hidden === false;
        },
        settingsClosed: () => (
          document.querySelector('.warpkeep-settings') === null
          && document.querySelector('.realm-map-screen') instanceof HTMLElement
        ),
        closeProfileMenuIfPresent: () => {
          const menu = document.querySelector('.realm-profile-menu');
          if (menu === null) return true;
          const close = menu.querySelector('button[aria-label="Close Realm menu"]');
          if (!(close instanceof HTMLButtonElement) || close.disabled) return false;
          close.click();
          return true;
        },
        profileMenuClosed: () => document.querySelector('.realm-profile-menu') === null,
        destroy: () => {
          bridge.restoreVisibility();
          if (hiddenOverridden) {
            if (ownHidden) Object.defineProperty(document, 'hidden', ownHidden);
            else Reflect.deleteProperty(document, 'hidden');
            hiddenOverridden = false;
          }
          return Reflect.deleteProperty(globalThis, bridgeKey);
        },
      });
      Object.defineProperty(globalThis, bridgeKey, {
        configurable: true,
        enumerable: false,
        value: bridge,
        writable: false,
      });
      return bridge.snapshot();
    })`,
    'bridge installation',
    true
  );
}

async function cleanupRenderedWebglSfxBridge(session) {
  const errors = [];
  for (const [method, phase] of [
    ['restoreVisibility', 'final visibility restoration'],
    ['destroy', 'bridge teardown'],
  ]) {
    try {
      await requireRenderedWebglSfxAction(session, method, phase);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(
      errors,
      `Rendered WebGL SFX cleanup failed: ${errors.map((error) => (
        error instanceof Error ? error.message : 'unknown cleanup failure'
      )).join('; ')}`
    );
  }
}

/**
 * Proves the real lazy WebAudio graph in signed headless Chrome. Only anonymous
 * lifecycle booleans cross the local DevTools boundary; no event payload does.
 */
export async function applyRenderedWebglSfxInteraction(session) {
  let bridgeInstalled = false;
  let interactionFailure;
  try {
    const pregestureValue = await installRenderedWebglSfxBridge(session);
    bridgeInstalled = true;
    const pregesture = parseRenderedWebglSfxSnapshot(pregestureValue);
    const offlineCorpusRendered = await readRenderedWebglSfxPromiseBoolean(
      session,
      'renderOfflineCorpus',
      'offline corpus render'
    );
    if (!offlineCorpusRendered) {
      throw new Error('Rendered WebGL SFX offline corpus proof failed.');
    }
    const afterOfflineCorpus = await readRenderedWebglSfxSnapshot(session);
    const pregestureAbsent = pregesture.contextCreated === false
      && pregesture.contextState === 'unavailable'
      && pregesture.acceptedLogicalVoiceCount === 0
      && pregesture.hidden === false
      && pregesture.muted === false
      && afterOfflineCorpus.contextCreated === false
      && afterOfflineCorpus.contextState === 'unavailable'
      && afterOfflineCorpus.acceptedLogicalVoiceCount === 0;

    await clickRenderedWebglSfxControl(session, '.realm-profile-trigger');
    const activated = await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => snapshot.contextCreated && snapshot.contextState === 'running',
      'trusted activation'
    );
    const beforeVoice = activated.acceptedLogicalVoiceCount;
    await requireRenderedWebglSfxAction(
      session,
      'emitProbeVoice',
      'logical voice emission'
    );
    const voiced = await readRenderedWebglSfxSnapshot(session);
    const exactLogicalVoice = voiced.acceptedLogicalVoiceCount === beforeVoice + 1;

    await requireRenderedWebglSfxAction(session, 'openSettings', 'settings activation');
    await waitForRenderedWebglSfxBoolean(
      session,
      'hasAudioSwitch',
      'audio switch presentation'
    );
    await requireRenderedWebglSfxAction(session, 'toggleAudio', 'mute activation');
    const muted = await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => snapshot.muted === true,
      'mute state'
    );
    await requireRenderedWebglSfxAction(
      session,
      'emitProbeVoice',
      'muted logical voice emission'
    );
    const mutedAfterEmission = await readRenderedWebglSfxSnapshot(session);
    const mutedSuppressed = mutedAfterEmission.acceptedLogicalVoiceCount
      === muted.acceptedLogicalVoiceCount;
    await requireRenderedWebglSfxAction(session, 'toggleAudio', 'unmute activation');
    await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => snapshot.muted === false,
      'unmuted state'
    );

    await requireRenderedWebglSfxAction(session, 'hideVisibility', 'hidden transition');
    const hidden = await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => snapshot.hidden === true && snapshot.activeVoices === 0,
      'hidden suppression gate'
    );
    await requireRenderedWebglSfxAction(
      session,
      'emitProbeVoice',
      'hidden logical voice emission'
    );
    const hiddenAfterEmission = await readRenderedWebglSfxSnapshot(session);
    const hiddenSuppressed = hiddenAfterEmission.acceptedLogicalVoiceCount
      === hidden.acceptedLogicalVoiceCount;
    const suspended = await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => (
        snapshot.hidden === true
        && snapshot.contextState === 'suspended'
      ),
      'hidden context suspension'
    );

    await requireRenderedWebglSfxAction(
      session,
      'restoreVisibility',
      'visibility restoration'
    );
    await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => (
        snapshot.hidden === false
        && snapshot.contextState === 'suspended'
      ),
      'restored suspended state'
    );

    // Production deliberately does not resume WebAudio merely because the tab
    // becomes visible. A second independent trusted pointer gesture owns that
    // edge and closes Settings through the ordinary in-page control.
    await clickRenderedWebglSfxControl(
      session,
      '.warpkeep-settings__actions button:last-child'
    );
    const resumed = await waitForRenderedWebglSfxSnapshot(
      session,
      (snapshot) => (
        snapshot.hidden === false
        && snapshot.contextState === 'running'
      ),
      'trusted recovery'
    );
    await waitForRenderedWebglSfxBoolean(
      session,
      'settingsClosed',
      'settings closure'
    );
    await requireRenderedWebglSfxAction(
      session,
      'closeProfileMenuIfPresent',
      'profile menu cleanup'
    );
    await waitForRenderedWebglSfxBoolean(
      session,
      'profileMenuClosed',
      'Realm UI recovery'
    );

    return parseRenderedWebglSfxEvidence({
      exactLogicalVoice,
      hiddenSuppressed,
      hiddenSuspended: suspended.contextState === 'suspended',
      mutedSuppressed,
      offlineCorpusRendered,
      pregestureAbsent,
      restoredTrustedResume: resumed.contextState === 'running',
      trustedActivation: activated.contextState === 'running',
    });
  } catch (error) {
    interactionFailure = error;
    throw error;
  } finally {
    if (bridgeInstalled) {
      // Restoration is host-owned, so a failed hidden-page assertion cannot
      // strand the remaining rendered cases behind a spoofed visibility gate.
      try {
        await cleanupRenderedWebglSfxBridge(session);
      } catch (cleanupFailure) {
        if (interactionFailure) {
          throw new AggregateError(
            [interactionFailure, cleanupFailure],
            'Rendered WebGL SFX interaction and cleanup failed.',
            { cause: interactionFailure }
          );
        }
        throw cleanupFailure;
      }
    }
  }
}
