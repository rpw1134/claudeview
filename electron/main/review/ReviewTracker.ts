import type { WebContents } from 'electron'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ReviewEnvelope, ReviewFile, ReviewLineMark, StreamEvent } from '../../../shared/ipc'
import { REVIEW_CHANNEL } from '../../../shared/ipc'
import { lineDiff } from '../../../shared/lineDiff'
import { isGitRepo, showHead, statusPorcelain } from './git'

/** Tools whose input names a file they are about to write. */
const WRITING_TOOLS = new Map<string, 'file_path' | 'notebook_path'>([
  ['Edit', 'file_path'],
  ['Write', 'file_path'],
  ['MultiEdit', 'file_path'],
  ['NotebookEdit', 'notebook_path'],
])

/** Above this, a file is reported as `tooLarge` instead of shipped to the renderer. */
const MAX_REVIEW_BYTES = 2 * 1024 * 1024

/** Path segments that are never interesting to review. */
const IGNORED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'dist-electron', '.test-dist'])
const IGNORED_NAMES = new Set(['.DS_Store'])

const POLL_INTERVAL_MS = 5_000

type Entry = {
  file: ReviewFile
  /** Contents at first touch. `null` means the file did not exist — it was created. */
  baseline: string | null
  /**
   * False when the baseline could not be captured (too large to hold, or an
   * unreadable file). Marks are suppressed rather than guessed: showing a whole
   * file as "added" because we failed to read its previous state is worse than
   * showing it with no gutter at all.
   */
  baselineKnown: boolean
  size: number
  mtimeMs: number
}

/**
 * The set of files agents have changed, with a snapshot of each file as it was
 * *before* the first edit.
 *
 * ## Why snapshot at tool-start
 *
 * `tool-start` is emitted when the model's `tool_use` block arrives, which is
 * strictly before the tool runs. That is the only moment at which the true "before"
 * state is still on disk, and it is why this tracker taps the session stream rather
 * than diffing against git: git can only tell you how a file differs from the last
 * *commit*, so a file the agent edited twice, or one that was already dirty when the
 * turn began, would report the user's own uncommitted work as the agent's.
 *
 * The baseline read is deliberately **synchronous**. An `await` between the event
 * and the read is a window in which the tool completes and the snapshot captures
 * the post-edit contents — a silent, timing-dependent wrong answer. A single
 * blocking read of a source file is a price worth paying to close it.
 *
 * ## Why git polling as well
 *
 * Tool events only cover edits this app can see. Bash `sed`, a subagent whose lane
 * we didn't parse, a script the agent ran — none produce an Edit tool event. The
 * 5s poll is the backstop, and its baselines come from HEAD because that is the
 * only "before" still available by the time the poll notices.
 *
 * ## Lifetime
 *
 * The set outlives its session — you review after the agent stops — but not the
 * app. Persisting baselines across restarts would mean owning a cache whose
 * entries silently go stale against a moving working tree; a restart is a clean,
 * comprehensible reset.
 */
export class ReviewTracker {
  private readonly entries = new Map<string, Entry>()
  /** Memoized `isGitRepo` per root; the answer doesn't change under us. */
  private readonly repoChecks = new Map<string, Promise<boolean>>()
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private seq = 0

  constructor(
    private readonly getWebContents: () => WebContents | null,
    /** Distinct cwds of live sessions. Empty means there is nothing to poll. */
    private readonly liveRoots: () => string[],
  ) {}

  /** Begin the git backstop poll. Idempotent. */
  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS)
    // Never hold the process open on account of a polling timer.
    this.timer.unref?.()
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.entries.clear()
    this.repoChecks.clear()
  }

  /**
   * Inspect one tab's event batch. Called from `SessionManager`'s emit choke point,
   * so it sees exactly what the renderer sees and nothing more.
   */
  observe(tabId: string, root: string, events: StreamEvent[]): void {
    let changed = false
    let turnEnded = false

    for (const event of events) {
      if (event.kind === 'result') turnEnded = true
      if (event.kind !== 'tool-start') continue

      const key = WRITING_TOOLS.get(event.name)
      if (!key) continue

      const named = resolveTarget(event.input, key)
      if (!named) continue

      // The model may name a relative path; the set is keyed by absolute paths so
      // the same file edited from two tabs is one entry, not two.
      const target = path.resolve(root, named)
      if (isIgnored(target)) continue
      changed = this.touch(target, root, tabId) || changed
    }

    if (changed) this.push()
    // Restat after the turn: the marks are computed lazily, but "when did this
    // last change" must reflect the writes that happened during the turn.
    if (turnEnded) void this.refresh(root)
  }

  list(): ReviewFile[] {
    return [...this.entries.values()]
      .map((entry) => entry.file)
      .sort((a, b) => b.lastChangedAt - a.lastChangedAt)
  }

  /**
   * Current contents plus marks for one tracked file.
   *
   * Only tracked paths are readable. The renderer displays model-authored HTML, so
   * handing it a general "read any file" call would turn a rendering escape into
   * arbitrary disk access; restricting to the review set costs nothing because
   * that is the only thing the review UI ever asks for.
   */
  async read(
    target: string,
  ): Promise<{ content: string; marks: ReviewLineMark[]; tooLarge: boolean } | null> {
    const entry = this.entries.get(target)
    if (!entry) return null

    let stat: fs.Stats
    try {
      stat = await fsp.stat(target)
    } catch {
      if (!entry.file.deleted) {
        entry.file.deleted = true
        entry.file.lastChangedAt = Date.now()
        this.push()
      }
      return null
    }

    if (!stat.isFile()) return null
    if (stat.size > MAX_REVIEW_BYTES) return { content: '', marks: [], tooLarge: true }

    const content = await fsp.readFile(target, 'utf8')
    const marks = entry.baselineKnown ? lineDiff(entry.baseline, content) : []
    return { content, marks, tooLarge: false }
  }

  /**
   * Drop paths from the set, baselines included.
   *
   * Losing the baseline *is* the re-baseline: the next edit to a dismissed file
   * snapshots it afresh, so "reviewed and accepted" means the next diff starts
   * from what you accepted rather than replaying changes you already read.
   */
  dismiss(paths: string[]): void {
    let changed = false
    for (const target of paths) changed = this.entries.delete(target) || changed
    if (changed) this.push()
  }

  dismissAll(): void {
    if (this.entries.size === 0) return
    this.entries.clear()
    this.push()
  }

  /**
   * Record a touch, capturing the baseline on first sight.
   *
   * Returns whether the set changed in a way worth pushing.
   */
  private touch(target: string, root: string, tabId?: string): boolean {
    const existing = this.entries.get(target)
    if (existing) {
      existing.file.lastChangedAt = Date.now()
      if (tabId) existing.file.tabId = tabId
      return true
    }

    const snapshot = readSnapshot(target)
    const now = Date.now()
    this.entries.set(target, {
      file: {
        path: target,
        relPath: path.relative(root, target) || path.basename(target),
        root,
        tabId,
        firstTouchedAt: now,
        lastChangedAt: now,
        deleted: false,
      },
      baseline: snapshot.content,
      baselineKnown: snapshot.known,
      size: snapshot.size,
      mtimeMs: snapshot.mtimeMs,
    })
    return true
  }

  /** Restat tracked files under a root, bumping the ones that actually moved. */
  private async refresh(root: string): Promise<void> {
    let changed = false

    for (const entry of this.entries.values()) {
      if (entry.file.root !== root) continue
      try {
        const stat = await fsp.stat(entry.file.path)
        if (stat.size === entry.size && stat.mtimeMs === entry.mtimeMs) continue
        entry.size = stat.size
        entry.mtimeMs = stat.mtimeMs
        entry.file.deleted = false
        entry.file.lastChangedAt = Date.now()
        changed = true
      } catch {
        // Gone. A file that never existed at baseline and is now absent was
        // created and removed within the turn; it has nothing left to review.
        if (entry.baseline === null) {
          this.entries.delete(entry.file.path)
          changed = true
        } else if (!entry.file.deleted) {
          entry.file.deleted = true
          entry.file.lastChangedAt = Date.now()
          changed = true
        }
      }
    }

    if (changed) this.push()
  }

  /** One sweep of the git backstop across every live session root. */
  private async poll(): Promise<void> {
    if (this.polling) return
    const roots = [...new Set(this.liveRoots())]
    if (roots.length === 0) return

    this.polling = true
    try {
      let changed = false
      for (const root of roots) {
        if (!(await this.isRepo(root))) continue
        changed = (await this.pollRoot(root)) || changed
      }
      if (changed) this.push()
    } finally {
      this.polling = false
    }
  }

  private async pollRoot(root: string): Promise<boolean> {
    let changed = false

    for (const change of await statusPorcelain(root)) {
      const target = path.resolve(root, change.relPath)
      if (isIgnored(target) || this.entries.has(target)) continue

      // Untracked files have no HEAD blob, so their baseline is "did not exist".
      const baseline = change.code.includes('?')
        ? null
        : await showHead(root, change.relPath)

      this.adopt(target, root, baseline)
      changed = true
    }

    return changed
  }

  /** Add a git-discovered file. No `tabId`: nothing here identifies the author. */
  private adopt(target: string, root: string, baseline: string | null): void {
    const stat = statOrNull(target)
    const now = Date.now()
    this.entries.set(target, {
      file: {
        path: target,
        relPath: path.relative(root, target) || path.basename(target),
        root,
        firstTouchedAt: now,
        lastChangedAt: now,
        deleted: stat === null,
      },
      baseline,
      baselineKnown: true,
      size: stat?.size ?? 0,
      mtimeMs: stat?.mtimeMs ?? 0,
    })
  }

  private isRepo(root: string): Promise<boolean> {
    let check = this.repoChecks.get(root)
    if (!check) {
      check = isGitRepo(root)
      this.repoChecks.set(root, check)
    }
    return check
  }

  /**
   * Push the whole set. Guarded the same way session pushes are: teardown is
   * async, and a poll can land after the window is gone.
   */
  private push(): void {
    const contents = this.getWebContents()
    if (!contents || contents.isDestroyed()) return
    this.seq += 1
    const envelope: ReviewEnvelope = { seq: this.seq, files: this.list() }
    contents.send(REVIEW_CHANNEL, envelope)
  }
}

/**
 * Pull the target path out of a `tool-start` input.
 *
 * Large inputs are replaced upstream by `{ __truncated: true, preview }`, where
 * the preview is the head of the JSON. That still usually contains the path — a
 * MultiEdit is huge because of its *edits*, not its filename — so it's worth one
 * regex before giving up. Giving up is fine: the git poll is the backstop.
 */
function resolveTarget(input: unknown, key: string): string | null {
  if (!input || typeof input !== 'object') return null
  const record = input as Record<string, unknown>

  const direct = record[key]
  if (typeof direct === 'string' && direct.length > 0) return direct

  if (record.__truncated === true && typeof record.preview === 'string') {
    const match = new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(record.preview)
    if (match) {
      try {
        return JSON.parse(`"${match[1]}"`) as string
      } catch {
        return null
      }
    }
  }

  return null
}

function isIgnored(target: string): boolean {
  const segments = target.split(path.sep)
  if (IGNORED_NAMES.has(segments[segments.length - 1] ?? '')) return true
  return segments.some((segment) => IGNORED_SEGMENTS.has(segment))
}

/** Blocking baseline capture. See the class comment for why this may not await. */
function readSnapshot(target: string): {
  content: string | null
  known: boolean
  size: number
  mtimeMs: number
} {
  let stat: fs.Stats
  try {
    stat = fs.statSync(target)
  } catch {
    // Missing is the common, meaningful case: the agent is creating this file.
    return { content: null, known: true, size: 0, mtimeMs: 0 }
  }

  if (!stat.isFile() || stat.size > MAX_REVIEW_BYTES) {
    return { content: null, known: false, size: stat.size, mtimeMs: stat.mtimeMs }
  }

  try {
    return {
      content: fs.readFileSync(target, 'utf8'),
      known: true,
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    }
  } catch {
    return { content: null, known: false, size: stat.size, mtimeMs: stat.mtimeMs }
  }
}

function statOrNull(target: string): fs.Stats | null {
  try {
    return fs.statSync(target)
  } catch {
    return null
  }
}
