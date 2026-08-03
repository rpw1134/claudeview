import type { StreamEvent } from '../../../shared/ipc'

/**
 * Coalesces `StreamEvent`s into at most one IPC message per frame.
 *
 * Without this, a single fast turn produces thousands of `text-delta` events and
 * therefore thousands of `webContents.send()` calls, each with its own
 * structured-clone serialization and its own renderer task. That measurably jams
 * the renderer's event loop and produces *choppier* output than batching does —
 * pushing harder makes the UI slower.
 *
 * Two flush triggers:
 *
 *  - **Time.** A ~1-frame timer, so latency stays imperceptible.
 *  - **Size.** A hard cap, so a burst can't grow the pending array without bound
 *    if the timer is starved.
 *
 * Adjacent `text-delta`s for the same block are merged into one event on flush.
 * A 400-token turn typically arrives as ~6 merged events instead of ~400.
 */
export class EventBatcher {
  private pending: StreamEvent[] = []
  private timer: NodeJS.Timeout | null = null
  private disposed = false

  private static readonly FLUSH_INTERVAL_MS = 16
  private static readonly MAX_BATCH = 512

  constructor(private readonly emit: (events: StreamEvent[]) => void) {}

  add(events: StreamEvent[]): void {
    if (this.disposed || events.length === 0) return

    this.pending.push(...events)

    if (this.pending.length >= EventBatcher.MAX_BATCH) {
      this.flush()
      return
    }
    this.timer ??= setTimeout(() => this.flush(), EventBatcher.FLUSH_INTERVAL_MS)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.disposed || this.pending.length === 0) return

    const batch = EventBatcher.coalesce(this.pending)
    this.pending = []
    this.emit(batch)
  }

  /** Flush anything pending, then refuse all further work. Idempotent. */
  dispose(): void {
    this.flush()
    this.disposed = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    this.pending = []
  }

  /**
   * Merge runs of same-block text/thinking deltas, and collapse repeated status
   * events down to the last one in the batch (only the final status is current).
   */
  private static coalesce(events: StreamEvent[]): StreamEvent[] {
    const out: StreamEvent[] = []

    for (const event of events) {
      const previous = out[out.length - 1]

      if (
        previous &&
        (event.kind === 'text-delta' || event.kind === 'thinking-delta') &&
        previous.kind === event.kind &&
        previous.blockId === event.blockId
      ) {
        // Replace rather than mutate: `previous` may be shared with a prior batch.
        out[out.length - 1] = { ...previous, text: previous.text + event.text }
        continue
      }

      if (event.kind === 'status' && previous?.kind === 'status') {
        out[out.length - 1] = event
        continue
      }

      out.push(event)
    }

    return out
  }
}
