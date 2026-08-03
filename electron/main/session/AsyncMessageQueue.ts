/**
 * A push-based async iterable.
 *
 * `query()` accepts `prompt` as either a string (one-shot) or an
 * `AsyncIterable<SDKUserMessage>` (streaming input). We always use the latter: a
 * string prompt ends the session after one turn, whereas an async iterable keeps
 * one long-lived CLI subprocess alive for the whole conversation. That is the
 * difference between "respawn a process per message" and "a real session".
 *
 * The catch is that an async iterable is *pull*-based while a UI is *push*-based.
 * This class bridges the two: `push()` is called from an IPC handler whenever the
 * user hits send, and the generator parked in `query()` wakes up.
 *
 * ## Termination is the whole point
 *
 * If this iterator never returns, the CLI subprocess never exits, and closing a
 * tab leaks a process. `close()` resolves any parked consumer with `done: true`,
 * which lets the SDK shut the subprocess down cleanly. Every teardown path in
 * SessionRunner calls it.
 */
export class AsyncMessageQueue<T> implements AsyncIterable<T> {
  /** Items pushed but not yet consumed. */
  private readonly buffer: T[] = []
  /** A consumer parked in `next()` waiting for an item. At most one. */
  private waiting: ((result: IteratorResult<T>) => void) | null = null
  private closed = false

  /** Enqueue an item. No-op once closed, so a late send can't resurrect a session. */
  push(item: T): void {
    if (this.closed) return

    const waiter = this.waiting
    if (waiter) {
      // Hand off directly; never touch the buffer when someone is parked.
      this.waiting = null
      waiter({ value: item, done: false })
      return
    }
    this.buffer.push(item)
  }

  /**
   * Signal end-of-input. Idempotent, and safe to call while a consumer is parked.
   * Buffered-but-unconsumed items are intentionally dropped: close means "stop",
   * and draining them would send messages the user has already navigated away from.
   */
  close(): void {
    if (this.closed) return
    this.closed = true
    this.buffer.length = 0

    const waiter = this.waiting
    if (waiter) {
      this.waiting = null
      waiter({ value: undefined, done: true })
    }
  }

  get isClosed(): boolean {
    return this.closed
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    while (true) {
      const buffered = this.buffer.shift()
      if (buffered !== undefined) {
        yield buffered
        continue
      }
      if (this.closed) return

      const next = await new Promise<IteratorResult<T>>((resolve) => {
        this.waiting = resolve
      })
      if (next.done) return
      yield next.value
    }
  }
}
