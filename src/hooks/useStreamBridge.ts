import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useSessionStore } from '@/stores/sessionStore'

/**
 * Wires the main-process event stream into the session store.
 *
 * Mounted **once**, at the app root. This is deliberate: `onStreamEvent` registers
 * an `ipcRenderer.on` listener, and subscribing per-tab or per-component would add
 * a listener for every mount. Electron warns at 10 listeners on a channel and the
 * rest silently pile up — a textbook leak in a window that stays open for hours.
 * One subscription, dispatching by `tabId`, avoids the whole class of bug.
 *
 * The returned unsubscribe runs on unmount, which also covers React 18+ StrictMode
 * double-invoking effects in development.
 */
export function useStreamBridge(): void {
  useEffect(() => {
    const applyEvents = useSessionStore.getState().applyEvents

    const unsubscribe = api.onStreamEvent(({ tabId, events }) => {
      applyEvents(tabId, events)
    })

    return unsubscribe
  }, [])
}
