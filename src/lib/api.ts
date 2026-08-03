import type { Api } from '@shared/ipc'

declare global {
  interface Window {
    claudeview: Api
  }
}

/**
 * The preload bridge, typed.
 *
 * Every renderer -> main call goes through here so there is exactly one place that
 * touches `window`. If the preload script failed to load (a packaging mistake), we
 * want a clear error at first use rather than a confusing `undefined is not a
 * function` from deep inside a component.
 */
function getApi(): Api {
  const bridge = window.claudeview
  if (!bridge) {
    throw new Error(
      'The preload bridge is missing. `window.claudeview` was not exposed — check that ' +
        'dist-electron/preload/index.cjs exists and matches the `preload` path in the ' +
        'BrowserWindow webPreferences.',
    )
  }
  return bridge
}

export const api: Api = new Proxy({} as Api, {
  get: (_target, property: string) => getApi()[property as keyof Api],
})
