/**
 * The frontend buffer layer that makes streaming look smooth.
 *
 * ## The problem
 *
 * Model output does not arrive at a constant rate. It comes in bursts: nothing for
 * 300ms while a request is in flight, then a dozen deltas in one tick, then a pause
 * during a tool call. Rendering each delta the instant it lands faithfully
 * reproduces that jitter, and the result reads as *lurching* — the exact thing
 * that makes terminal output unpleasant to watch.
 *
 * ## The fix: decouple arrival from display
 *
 * Every block gets two cursors:
 *
 *   full   — everything received so far (authoritative, grows in bursts)
 *   shown  — how much the UI has revealed (advances smoothly, once per frame)
 *
 * IPC writes to `full`. A single rAF loop advances `shown` toward it at a rate
 * chosen to drain the backlog over a fixed window. Bursts become an increase in
 * *reveal speed* rather than a visible jump, and gaps are covered by whatever
 * backlog remains. The text still finishes when the model finishes — this adds
 * smoothing, not lag.
 *
 * ## Why this lives outside React
 *
 * Per-frame text updates through a React store would re-render on every frame and
 * fight the reconciler for the frame budget. Instead this is a plain observable
 * keyed by block id: only the one component displaying an actively streaming block
 * subscribes, and only that component re-renders. The rest of the transcript is
 * untouched. React state holds the *structure* of the conversation; this holds the
 * *in-flight characters*.
 */

type Buffer = {
  /** Everything received from the model for this block. */
  full: string
  /** How much has been revealed to the UI. */
  shown: number
  /** True once the model reported the block complete. */
  complete: boolean
}

/** One frame at 60Hz; the cadence the reveal loop assumes. */
const FRAME_MS = 16
/** Target window to drain a backlog over. Long enough to smooth, short enough to feel live. */
const DRAIN_WINDOW_MS = 220
/** Always reveal at least this much per frame, so slow trickles still move. */
const MIN_CHARS_PER_FRAME = 2
/**
 * Above this backlog we stop pacing and jump. Hit when resuming a session or when
 * a burst dwarfs the window — nobody wants to watch 40KB typewriter in.
 */
const INSTANT_THRESHOLD = 4000

class StreamBufferStore {
  private readonly buffers = new Map<string, Buffer>()
  private readonly listeners = new Map<string, Set<() => void>>()
  private frame: number | null = null

  /** Append newly arrived text. Called from the IPC batch handler. */
  append(blockId: string, text: string): void {
    const buffer = this.buffers.get(blockId)
    if (buffer) {
      buffer.full += text
    } else {
      this.buffers.set(blockId, { full: text, shown: 0, complete: false })
    }
    this.ensureFrameLoop()
  }

  /**
   * Mark a block finished. Any remaining backlog still animates out; the loop stops
   * once `shown` catches up, so the tail never gets truncated by the end of stream.
   */
  finish(blockId: string): void {
    const buffer = this.buffers.get(blockId)
    if (!buffer) return
    buffer.complete = true
    this.ensureFrameLoop()
  }

  /**
   * Mark every block belonging to one tab complete.
   *
   * Called when a turn ends. A block only clears its caret on `block-end`, and the
   * CLI doesn't always send one for a block the model abandoned mid-turn — so a
   * finished answer could be left with a blinking caret stranded under it,
   * suggesting output that was never coming. When the turn is over, by definition
   * nothing is still streaming.
   */
  finishAllFor(prefix: string): void {
    for (const [blockId, buffer] of this.buffers) {
      if (!buffer.complete && blockId.startsWith(prefix)) {
        buffer.complete = true
        this.notify(blockId)
      }
    }
  }

  /** Reveal everything immediately — used when a view is hidden or on jump-to-end. */
  revealAll(blockId: string): void {
    const buffer = this.buffers.get(blockId)
    if (!buffer || buffer.shown === buffer.full.length) return
    buffer.shown = buffer.full.length
    this.notify(blockId)
  }

  /** The currently visible prefix. This is what components render. */
  read(blockId: string): string {
    const buffer = this.buffers.get(blockId)
    if (!buffer) return ''
    return buffer.shown === buffer.full.length ? buffer.full : buffer.full.slice(0, buffer.shown)
  }

  /** Full received text regardless of reveal progress — for copy-to-clipboard. */
  readFull(blockId: string): string {
    return this.buffers.get(blockId)?.full ?? ''
  }

  /** True while there is still backlog to reveal, i.e. a caret should show. */
  isStreaming(blockId: string): boolean {
    const buffer = this.buffers.get(blockId)
    if (!buffer) return false
    return !buffer.complete || buffer.shown < buffer.full.length
  }

  subscribe(blockId: string, listener: () => void): () => void {
    let set = this.listeners.get(blockId)
    if (!set) {
      set = new Set()
      this.listeners.set(blockId, set)
    }
    set.add(listener)

    return () => {
      const current = this.listeners.get(blockId)
      if (!current) return
      current.delete(listener)
      // Drop the empty Set: without this, a long session accumulates one Map entry
      // per block forever, which is a slow leak in a long-lived window.
      if (current.size === 0) this.listeners.delete(blockId)
    }
  }

  /**
   * Release buffers for blocks that no longer exist (tab closed, transcript
   * cleared). Buffers hold the full text of every block, so a long-lived window
   * that never released them would grow without bound.
   */
  release(blockIds: Iterable<string>): void {
    for (const blockId of blockIds) {
      this.buffers.delete(blockId)
      this.listeners.delete(blockId)
    }
  }

  private ensureFrameLoop(): void {
    if (this.frame !== null) return
    this.frame = requestAnimationFrame(() => this.tick())
  }

  /**
   * Advance every buffer one frame's worth. Runs only while work exists, so an idle
   * app schedules no frames at all.
   */
  private tick(): void {
    this.frame = null
    let workRemaining = false

    for (const [blockId, buffer] of this.buffers) {
      const backlog = buffer.full.length - buffer.shown
      if (backlog <= 0) continue

      if (backlog > INSTANT_THRESHOLD) {
        buffer.shown = buffer.full.length
      } else {
        // Pace to drain the current backlog over DRAIN_WINDOW_MS. Because the rate
        // is recomputed from the live backlog each frame, a burst speeds the reveal
        // up automatically instead of queueing behind a fixed rate.
        const framesInWindow = DRAIN_WINDOW_MS / FRAME_MS
        const step = Math.max(MIN_CHARS_PER_FRAME, Math.ceil(backlog / framesInWindow))
        buffer.shown = Math.min(buffer.full.length, buffer.shown + step)
      }

      this.notify(blockId)
      if (buffer.shown < buffer.full.length) workRemaining = true
    }

    if (workRemaining) this.ensureFrameLoop()
  }

  private notify(blockId: string): void {
    const listeners = this.listeners.get(blockId)
    if (!listeners) return
    for (const listener of listeners) listener()
  }
}

export const streamBuffers = new StreamBufferStore()
