import { vi } from 'vitest'

// Test-only transport for the fixed Windows operator's public source files.
// Files, descriptors, contents and identity checks are real; only their host
// path spelling is translated. No private-root access or operator execution.
export async function withFixedWindowsHostEmulation<T>(run: () => Promise<T>): Promise<T> {
  const path = await vi.importActual<typeof import('node:path')>('node:path')
  const url = await vi.importActual<typeof import('node:url')>('node:url')
  const fs = await vi.importActual<typeof import('node:fs')>('node:fs')
  const realRoot = url.fileURLToPath(new URL('../../..', import.meta.url)).replace(/[\\/]+$/u, '')
  const hostUrl = new URL('../scripts/release-recovery-fixture-host.mjs', import.meta.url).href
  const syntheticRoot = String.raw`C:\synthetic\warpkeep-recovery-host`
  const windowsPath = (values: string[]) => values.some(value => /^[A-Za-z]:[\\/]/u.test(value))
  const nativePath = (value: unknown): unknown => {
    if (typeof value !== 'string') return value
    if (value === syntheticRoot) return realRoot
    if (!value.startsWith(`${syntheticRoot}\\`)) return value
    const suffix = path.win32.relative(syntheticRoot, value)
    if (suffix === '..' || suffix.startsWith('..\\') || path.win32.isAbsolute(suffix)) {
      throw new Error('test host path escaped its public source fixture')
    }
    return path.join(realRoot, ...suffix.split('\\'))
  }
  const hostPath = (value: string): string => {
    const suffix = path.relative(realRoot, value)
    if (suffix === '..' || suffix.startsWith(`..${path.sep}`) || path.isAbsolute(suffix)) return value
    return path.win32.join(syntheticRoot, ...suffix.split(path.sep))
  }
  const platformDescriptor = Object.getOwnPropertyDescriptor(process, 'platform')!
  vi.resetModules()
  vi.doMock('node:path', () => ({
    ...path,
    sep: path.win32.sep,
    dirname: (value: string) => (windowsPath([value]) ? path.win32 : path).dirname(value),
    resolve: (...values: string[]) => (windowsPath(values) ? path.win32 : path).resolve(...values),
    relative: (from: string, to: string) => (windowsPath([from, to]) ? path.win32 : path).relative(from, to),
    join: (...values: string[]) => (windowsPath(values) ? path.win32 : path).join(...values),
    isAbsolute: (value: string) => path.win32.isAbsolute(value) || path.isAbsolute(value),
  }))
  vi.doMock('node:url', () => ({
    ...url,
    fileURLToPath: ((value: URL | string, ...rest: unknown[]) => (
      String(value) === hostUrl
        ? path.win32.join(syntheticRoot, 'services/release-recovery/scripts/release-recovery-fixture-host.mjs')
        : Reflect.apply(url.fileURLToPath, undefined, [value, ...rest])
    )) as typeof url.fileURLToPath,
  }))
  vi.doMock('node:fs', () => {
    const mapped = (fn: (...args: any[]) => any) => (value: unknown, ...rest: unknown[]) => (
      fn(nativePath(value), ...rest)
    )
    const realpathSync = Object.assign(mapped(fs.realpathSync), {
      native: (value: string) => {
        const result = fs.realpathSync.native(nativePath(value) as string)
        return value === syntheticRoot || value.startsWith(`${syntheticRoot}\\`) ? hostPath(result) : result
      },
    })
    return {
      ...fs,
      lstatSync: mapped(fs.lstatSync),
      statSync: mapped(fs.statSync),
      openSync: mapped(fs.openSync),
      readFileSync: mapped(fs.readFileSync),
      realpathSync,
    }
  })
  Object.defineProperty(process, 'platform', { ...platformDescriptor, value: 'win32' })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', platformDescriptor)
    for (const name of ['node:path', 'node:url', 'node:fs']) vi.doUnmock(name)
    vi.resetModules()
  }
}
