import { lstat } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { isAbsolute, join, resolve } from 'node:path';

import {
  attestStableHeadlessChromeExecutable,
  cleanupRenderedWebglProbeResources,
  exactChromeExecutableIdentity,
  readReviewedChromeExecutableIdentity,
  spawnHeadlessChromeProbe,
  terminateHeadlessChromeProcessGroup,
} from './rendered-webgl-browser-probe.mjs';

export { cleanupRenderedWebglProbeResources, exactChromeExecutableIdentity };

const WINDOWS_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const WINDOWS_TASKKILL = 'C:/Windows/System32/taskkill.exe';
const REPOSITORY_ROOT = resolve(process.cwd());
const WINDOWS_TERMINATION_TIMEOUT_MILLISECONDS = 15_000;
const WINDOWS_TERMINATION_POLL_MILLISECONDS = 50;

function isWindows() {
  return process.platform === 'win32';
}

function windowsIdentity(metadata) {
  return Object.freeze({
    ctimeNs: metadata.ctimeNs.toString(),
    dev: metadata.dev.toString(),
    gid: metadata.gid.toString(),
    ino: metadata.ino.toString(),
    mode: metadata.mode.toString(),
    mtimeNs: metadata.mtimeNs.toString(),
    nlink: metadata.nlink.toString(),
    size: metadata.size.toString(),
    uid: metadata.uid.toString(),
  });
}

export async function readReviewedFullstackChromeIdentity() {
  if (!isWindows()) return readReviewedChromeExecutableIdentity();
  const metadata = await lstat(WINDOWS_CHROME, { bigint: true });
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || metadata.nlink !== 1n
  ) throw new Error('The reviewed Google Chrome executable is unavailable.');
  return windowsIdentity(metadata);
}

export async function attestStableFullstackChromeIdentity(expectedIdentity) {
  if (!isWindows()) {
    return attestStableHeadlessChromeExecutable(expectedIdentity);
  }
  const before = await readReviewedFullstackChromeIdentity();
  if (expectedIdentity && !exactChromeExecutableIdentity(before, expectedIdentity)) {
    throw new Error('The reviewed Google Chrome executable changed before launch.');
  }
  const after = await readReviewedFullstackChromeIdentity();
  if (!exactChromeExecutableIdentity(before, after)) {
    throw new Error('The reviewed Google Chrome executable changed during attestation.');
  }
  return after;
}

function windowsChromeContract(profileDirectory) {
  const profile = resolve(String(profileDirectory));
  if (!isAbsolute(profile) || profile !== String(profileDirectory)) {
    throw new Error('The disposable Windows Chrome profile path was not canonical.');
  }
  const profileMetadata = lstatSync(profile, { bigint: true });
  if (!profileMetadata.isDirectory() || profileMetadata.isSymbolicLink()) {
    throw new Error('The disposable Windows Chrome profile path was unsafe.');
  }
  const localAppData = join(profile, 'AppData', 'Local');
  const appData = join(profile, 'AppData', 'Roaming');
  const systemRoot = process.env.SystemRoot ?? 'C:/Windows';
  const path = process.env.PATH ?? `${systemRoot}/System32`;
  return Object.freeze({
    executable: WINDOWS_CHROME,
    args: Object.freeze([
      '--headless=new',
      '--remote-debugging-pipe',
      `--user-data-dir=${profile}`,
      '--disable-background-networking',
      '--disable-breakpad',
      '--disable-crash-reporter',
      `--crash-dumps-dir=${join(profile, 'crash-dumps')}`,
      '--disable-client-side-phishing-detection',
      '--disable-component-extensions-with-background-pages',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-domain-reliability',
      '--disable-extensions',
      '--disable-field-trial-config',
      '--disable-features=AutofillServerCommunication,CertificateTransparencyComponentUpdater,InterestFeedContentSuggestions,MediaRouter,OptimizationHints,Translate',
      '--disable-search-engine-choice-screen',
      '--disable-sync',
      '--metrics-recording-only',
      '--mute-audio',
      '--no-default-browser-check',
      '--no-first-run',
      '--no-proxy-server',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
      '--password-store=basic',
      '--safebrowsing-disable-auto-update',
      '--window-size=1440,900',
      'about:blank',
    ]),
    options: Object.freeze({
      cwd: REPOSITORY_ROOT,
      detached: true,
      env: Object.freeze({
        APPDATA: appData,
        LOCALAPPDATA: localAppData,
        PATH: path,
        SystemRoot: systemRoot,
        TEMP: profile,
        TMP: profile,
        USERPROFILE: profile,
        WINDIR: process.env.WINDIR ?? systemRoot,
      }),
      shell: false,
      stdio: Object.freeze(['ignore', 'ignore', 'ignore', 'pipe', 'pipe']),
      windowsHide: true,
    }),
  });
}

export function spawnFullstackChrome(profileDirectory, options = {}) {
  if (!isWindows()) return spawnHeadlessChromeProbe(profileDirectory, options);
  const contract = windowsChromeContract(profileDirectory);
  const spawnProcess = options.spawnProcess ?? spawn;
  return spawnProcess(contract.executable, [...contract.args], { ...contract.options });
}

function processExists(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code !== 'ESRCH';
  }
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function terminateFullstackChrome(child) {
  if (!child?.pid) return;
  if (!isWindows()) return terminateHeadlessChromeProcessGroup(child);
  if (!processExists(child.pid)) return;
  const killer = spawn(WINDOWS_TASKKILL, ['/PID', String(child.pid), '/T', '/F'], {
    windowsHide: true,
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  await new Promise((resolve) => {
    killer.once('error', resolve);
    killer.once('close', resolve);
  });
  const deadline = Date.now() + WINDOWS_TERMINATION_TIMEOUT_MILLISECONDS;
  while (processExists(child.pid) && Date.now() < deadline) {
    await delay(WINDOWS_TERMINATION_POLL_MILLISECONDS);
  }
  if (processExists(child.pid)) {
    throw new Error('The disposable Windows Chrome process did not terminate.');
  }
}
