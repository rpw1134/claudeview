import { createRequire } from 'node:module'
import os from 'node:os'
import type { WebContents } from 'electron'
import { TERMINAL_CHANNEL, type TerminalEnvelope } from '../../../shared/ipc'

/**
 * `TerminalEnvelope` minus `seq`, distributed over the union.
 *
 * A bare `Omit<TerminalEnvelope, 'seq'>` collapses the discriminated union into a
 * single object type, which loses the per-variant fields (`data`, `exitCode`).
 * The conditional type distributes so each variant keeps its own shape.
 */
type UnsequencedTerminalEvent =
  TerminalEnvelope extends infer T ? (T extends TerminalEnvelope ? Omit<T, 'seq'> : never) : never

/**
 * `node-pty` is a native module, so it is loaded the same way as the Agent SDK:
 * through `createRequire`, and kept external from the bundle. Its `.node` binary
 * is compiled against Electron's ABI by `npm run rebuild:native`.
 */
const nodeRequire = createRequire(import.meta.url)

type PtyProcess = {
  pid: number
  onData: (cb: (data: string) => void) => void
  onExit: (cb: (event: { exitCode: number; signal?: number }) => void) => void
  write: (data: string) => void
  resize: (cols: number, rows: number) => void
  kill: (signal?: string) => void
}

type PtyModule = {
  spawn: (
    file: string,
    args: string[],
    options: {
      name: string
      cols: number
      rows: number
      cwd: string
      env: Record<string, string | undefined>
    },
  ) => PtyProcess
}

const pty: PtyModule = nodeRequire('node-pty')

/** One frame; matches the session EventBatcher so both streams behave alike. */
const FLUSH_INTERVAL_MS = 16
/**
 * Scrollback retained per terminal, in characters.
 *
 * Panels unmount and remount whenever the layout changes, and an xterm instance
 * that is recreated starts blank. Replaying this buffer restores what was on
 * screen, so rearranging panels doesn't look like it wiped your terminals.
 */
const SCROLLBACK_LIMIT = 200_000

type Terminal = {
  id: string
  process: PtyProcess
  /** Output retained for replay into a remounted panel. */
  scrollback: string
  /** Seq of the most recent event emitted for this terminal. */
  lastSeq: number
  /** Pending output, flushed once per frame. */
  pending: string
  timer: NodeJS.Timeout | null
  exited: boolean
}

/**
 * Owns the PTY processes backing terminal panels.
 *
 * Deliberately mirrors `SessionManager`: a registry keyed by id, output coalesced
 * per frame before crossing IPC, and a disposal path that guarantees no process
 * outlives its panel. A shell is just as much a real subprocess as a `claude`
 * session, and leaking one is just as bad.
 */
export class TerminalManager {
  private readonly terminals = new Map<string, Terminal>()
  private seq = 0

  constructor(private readonly getWebContents: () => WebContents | null) {}

  /**
   * Start a shell for `id`, or do nothing if one is already running.
   *
   * **Idempotent by design.** A panel's id *is* its terminal's identity, and the
   * component that calls this remounts more often than you'd think — React
   * StrictMode double-invokes effects in development, and any hot update can do the
   * same. Killing and respawning on the second call produced exactly that bug:
   * a spurious "[process exited with code 0]", two emulators briefly writing to one
   * PTY, and interleaved keystrokes (`c aecho ...`).
   *
   * A terminal that has *exited* is replaced, so a panel whose shell you closed can
   * be revived by remounting it.
   */
  create(id: string, options: { cwd?: string; cols?: number; rows?: number }): void {
    const existing = this.terminals.get(id)
    if (existing && !existing.exited) {
      // Adopt the caller's size; the remounted panel may be a different shape.
      if (options.cols && options.rows) this.resize(id, options.cols, options.rows)
      return
    }
    this.close(id)

    const shell = process.env.SHELL || (process.platform === 'win32' ? 'powershell.exe' : '/bin/zsh')

    const child = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: options.cols ?? 80,
      rows: options.rows ?? 24,
      cwd: options.cwd || os.homedir(),
      env: {
        ...process.env,
        // Tell the shell what it's talking to. Without TERM, anything using
        // curses or colour renders as escape-code soup.
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        // Electron injects these and they confuse tools that check for a Node
        // parent process (notably nvm and version managers).
        ELECTRON_RUN_AS_NODE: undefined,
        NODE_OPTIONS: undefined,
      },
    })

    const terminal: Terminal = {
      id,
      process: child,
      scrollback: '',
      lastSeq: 0,
      pending: '',
      timer: null,
      exited: false,
    }
    this.terminals.set(id, terminal)

    child.onData((data) => this.enqueue(terminal, data))
    child.onExit(({ exitCode }) => {
      terminal.exited = true
      this.flush(terminal)
      this.send({ kind: 'exit', id, exitCode })
    })
  }

  write(id: string, data: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.exited) return
    terminal.process.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id)
    if (!terminal || terminal.exited) return
    try {
      terminal.process.resize(Math.max(1, cols), Math.max(1, rows))
    } catch {
      // A resize racing process exit throws; the exit handler already cleans up.
    }
  }

  /**
   * Retained output plus the sequence number it covers.
   *
   * The seq matters: a mounting panel subscribes to live output *and* replays this
   * buffer, so without a watermark the output produced between spawn and replay
   * lands twice (a shell's greeting appearing twice was the visible symptom). The
   * caller ignores any live event at or below `seq`.
   */
  snapshot(id: string): { scrollback: string; seq: number } {
    const terminal = this.terminals.get(id)
    if (!terminal) return { scrollback: '', seq: 0 }
    // Flush first so the snapshot includes everything already produced, rather
    // than leaving a frame's worth to arrive live and land before the replay.
    this.flush(terminal)
    return { scrollback: terminal.scrollback, seq: terminal.lastSeq }
  }

  has(id: string): boolean {
    return this.terminals.has(id)
  }

  close(id: string): void {
    const terminal = this.terminals.get(id)
    if (!terminal) return

    this.terminals.delete(id)
    if (terminal.timer) clearTimeout(terminal.timer)

    if (!terminal.exited) {
      try {
        terminal.process.kill()
      } catch {
        // Already gone.
      }
    }
  }

  disposeAll(): void {
    for (const id of [...this.terminals.keys()]) this.close(id)
  }

  get size(): number {
    return this.terminals.size
  }

  /** Coalesce PTY output to at most one IPC message per frame per terminal. */
  private enqueue(terminal: Terminal, data: string): void {
    terminal.pending += data

    terminal.scrollback += data
    if (terminal.scrollback.length > SCROLLBACK_LIMIT) {
      terminal.scrollback = terminal.scrollback.slice(-SCROLLBACK_LIMIT)
    }

    terminal.timer ??= setTimeout(() => this.flush(terminal), FLUSH_INTERVAL_MS)
  }

  private flush(terminal: Terminal): void {
    if (terminal.timer) {
      clearTimeout(terminal.timer)
      terminal.timer = null
    }
    if (!terminal.pending) return

    const data = terminal.pending
    terminal.pending = ''
    terminal.lastSeq = this.send({ kind: 'data', id: terminal.id, data })
  }

  /** Returns the seq stamped on the emitted event. */
  private send(payload: UnsequencedTerminalEvent): number {
    this.seq += 1
    const contents = this.getWebContents()
    if (contents && !contents.isDestroyed()) {
      contents.send(TERMINAL_CHANNEL, { ...payload, seq: this.seq })
    }
    return this.seq
  }
}
