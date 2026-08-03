import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useSessionStore } from '@/stores/sessionStore'

/**
 * Highest envelope sequence already applied.
 *
 * Module-level, so it survives component remounts and hot updates. Any envelope at
 * or below this has already been folded into the store and must be ignored —
 * applying a batch twice appends every text delta twice, which renders the whole
 * transcript doubled.
 */
let lastAppliedSeq = 0

/** Guards against more than one live subscription to the stream channel. */
let subscribed = false

/**
 * Wires the main-process event stream into the session store.
 *
 * Mounted **once**, at the app root. `onStreamEvent` registers an
 * `ipcRenderer.on` listener, and subscribing per-tab or per-component would add one
 * per mount — Electron warns at 10 and the rest pile up silently.
 *
 * Two defences against duplicate delivery, because the failure mode is nasty
 * (visibly doubled output) and the causes are easy to reintroduce:
 *
 *  1. **`subscribed`** — a module-level flag, so a second mount cannot add a second
 *     listener. React StrictMode's mount/unmount/mount cycle and Vite hot updates
 *     both re-run this effect, and a listener that outlives its cleanup is the
 *     classic way to end up with two.
 *  2. **`lastAppliedSeq`** — even if a duplicate listener somehow exists, each
 *     envelope carries a process-wide monotonic `seq`, and anything already applied
 *     is dropped. Correctness no longer depends on subscription bookkeeping.
 */
export function useStreamBridge(): void {
  useEffect(() => {
    if (subscribed) return
    subscribed = true

    const applyEvents = useSessionStore.getState().applyEvents

    const unsubscribe = api.onStreamEvent(({ tabId, events, seq }) => {
      if (seq <= lastAppliedSeq) return
      lastAppliedSeq = seq
      applyEvents(tabId, events)
    })

    return () => {
      subscribed = false
      unsubscribe()
    }
  }, [])
}
