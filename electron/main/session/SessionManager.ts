import type { WebContents } from 'electron'
import type { CreateSessionRequest, StreamEvent } from '../../../shared/ipc'
import { STREAM_CHANNEL } from '../../../shared/ipc'
import { SessionRunner } from './SessionRunner'

/**
 * The "dict of running processes" — the registry of live sessions, keyed by tab id.
 *
 * Owning this centrally (rather than letting each IPC handler hold its own runner)
 * gives us one place that guarantees:
 *
 *  - a tab id maps to at most one subprocess, so a double-create can't orphan one,
 *  - every runner is disposed on window close via `disposeAll()`,
 *  - nothing is ever sent to a destroyed WebContents.
 *
 * ## Tab id vs session id
 *
 * They are deliberately different. The **tab id** is a UI handle the renderer mints
 * and owns for the lifetime of a tab. The **session id** is assigned by the SDK and
 * identifies the durable conversation on disk. Keying by tab id means a tab can
 * exist before its session id is known (still starting), and can outlive one
 * session id if the user resumes or forks into another — without the registry ever
 * losing track of which subprocess belongs to which tab.
 */
export class SessionManager {
  private readonly runners = new Map<string, SessionRunner>()
  /** Latest known session id per tab, for persistence and the resume picker. */
  private readonly sessionIds = new Map<string, string>()
  /**
   * Monotonic batch counter. Stamped on every envelope so the renderer can drop
   * duplicates; see `StreamEnvelope.seq`. Process-wide rather than per-tab so a
   * single counter in the renderer is enough.
   */
  private seq = 0

  constructor(private readonly getWebContents: () => WebContents | null) {}

  async create(request: CreateSessionRequest): Promise<void> {
    // Replacing a tab's session must dispose the old one first, or its subprocess
    // is orphaned with no remaining reference to shut it down.
    await this.close(request.tabId)

    const runner = new SessionRunner(request, {
      emit: (events) => this.emit(request.tabId, events),
      onSessionId: (sessionId) => this.sessionIds.set(request.tabId, sessionId),
    })

    this.runners.set(request.tabId, runner)
    runner.start()
  }

  get(tabId: string): SessionRunner | undefined {
    return this.runners.get(tabId)
  }

  sessionIdFor(tabId: string): string | undefined {
    return this.sessionIds.get(tabId)
  }

  async close(tabId: string): Promise<void> {
    const runner = this.runners.get(tabId)
    if (!runner) return

    // Remove from the map before awaiting: disposal is async, and leaving the entry
    // in place would let a concurrent create() find a dying runner.
    this.runners.delete(tabId)
    this.sessionIds.delete(tabId)
    await runner.dispose()
  }

  /** Tear down every session. Called on window close and before app quit. */
  async disposeAll(): Promise<void> {
    const runners = [...this.runners.values()]
    this.runners.clear()
    this.sessionIds.clear()
    await Promise.allSettled(runners.map((runner) => runner.dispose()))
  }

  get size(): number {
    return this.runners.size
  }

  /**
   * The single choke point for main -> renderer pushes.
   *
   * The `isDestroyed()` guard is not optional: session teardown is async, so a
   * runner can flush a final batch after the window is gone. Sending to a destroyed
   * WebContents throws and would surface as an unhandled rejection on quit.
   */
  private emit(tabId: string, events: StreamEvent[]): void {
    const contents = this.getWebContents()
    if (!contents || contents.isDestroyed()) return
    this.seq += 1
    contents.send(STREAM_CHANNEL, { tabId, events, seq: this.seq })
  }
}
