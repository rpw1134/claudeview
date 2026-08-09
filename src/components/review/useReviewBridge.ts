import { useEffect } from 'react'
import { api } from '@/lib/api'
import { useReviewStore } from '@/stores/reviewStore'

/** Highest review envelope already applied. See `useStreamBridge` for the full why. */
let lastAppliedSeq = 0

/** Guards against more than one live subscription to the review channel. */
let subscribed = false

/**
 * Wires the main-process review pushes into the review store.
 *
 * Same two defences as the session stream, for the same reasons: a module-level
 * `subscribed` flag so StrictMode's mount/unmount/mount and Vite hot updates can't
 * stack listeners, and a monotonic `seq` so correctness doesn't depend on that flag
 * being right. A review envelope carries the whole set rather than a delta, so a
 * duplicate is merely wasteful rather than corrupting — but the guard costs two
 * lines and removes the need to reason about it at all.
 *
 * Mounted from `ReviewView`, which is always mounted (App keeps it alive and
 * hidden), so the set stays current while you're in a session and review is a
 * switch rather than a load.
 */
export function useReviewBridge(): void {
  useEffect(() => {
    if (subscribed) return
    subscribed = true

    const { setFiles } = useReviewStore.getState()

    const unsubscribe = api.onReviewEvent(({ seq, files }) => {
      if (seq <= lastAppliedSeq) return
      lastAppliedSeq = seq
      setFiles(files)
    })

    // Pushes only fire on change, so the set as it stands has to be asked for
    // once — otherwise a review opened after a turn finished shows nothing. If a
    // push lands while that call is in flight it is the newer answer, and the
    // reply to this one is dropped rather than rewinding the set.
    const seqAtRequest = lastAppliedSeq
    void api['review:list']().then((files) => {
      if (lastAppliedSeq === seqAtRequest) setFiles(files)
    })

    return () => {
      subscribed = false
      unsubscribe()
    }
  }, [])
}
