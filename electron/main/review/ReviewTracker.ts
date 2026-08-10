import { app } from 'electron'
import type { WebContents } from 'electron'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { ReviewEnvelope, ReviewFile, ReviewLineMark, StreamEvent } from '../../../shared/ipc'
import { REVIEW_CHANNEL } from '../../../shared/ipc'
import { lineDiff } from '../../../shared/lineDiff'
import { isGitRepo, showHead, statusPorcelain } from './git'

/**
 * Where the review set survives a restart.
 *
 * `state.json` holds everything small and structured; baseline *contents* do
 * not belong in it (they can be megabytes and there can be hundreds of them),
 * so each gets its own file under `baselines/`, named by a hash of the
 * absolute path so renames of the JSON never orphan a blob silently.
 */
const REVIEW_DIR = path.join(app.getPath('userData'), 'review')
const STATE_FILE = path.join(REVIEW_DIR, 'state.json')
const BASELINES_DIR = path.join(REVIEW_DIR, 'baselines')

/** Debounce window between a mutation and the write that persists it. */
const SAVE_DEBOUNCE_MS = 500

function baselineFilePath(target: string): string {
  const hash = crypto.createHash('sha1').update(target).digest('hex')
  return path.join(BASELINES_DIR, `${hash}.baseline`)
}

/**
 * On-disk shape of one entry. Deliberately not `Entry` itself: `baseline`
 * collapses to a tag rather than carrying content (that lives in its own
 * file), and `deleted`/`size`/`mtimeMs` are plain data with no class behind
 * them once they cross to JSON.
 */
type PersistedEntry = {
  path: string
  relPath: string
  root: string
  tabId?: string
  firstTouchedAt: number
  lastChangedAt: number
  deleted: boolean
  /**
   * 'none' — the file didn't exist at first touch (it was created); there is
   * no baseline file to read.
   * 'stored' — baseline content lives in `baselines/`.
   * 'unknown' — capture failed (too large / unreadable) and marks were
   * already suppressed for this file before the restart.
   */
  baseline: 'none' | 'stored' | 'unknown'
  size: number
  mtimeMs: number
}

type PersistedState = {
  version: 1
  entries: PersistedEntry[]
}

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
 * The set outlives its session — you review after the agent stops — and, since
 * a restart mid-review would otherwise empty the queue out from under you, it
 * now outlives the app too. The risk of a persisted cache going stale against
 * a moving working tree is handled the same way `read()` already handles a
 * live file going stale: staleness is detected on demand (marks are diffed
 * against the current disk contents every time, and a missing file is caught
 * on load), never assumed correct just because it was loaded from disk.
 */
export class ReviewTracker {
  private readonly entries = new Map<string, Entry>()
  /** Memoized `isGitRepo` per root; the answer doesn't change under us. */
  private readonly repoChecks = new Map<string, Promise<boolean>>()
  /**
   * Ambient dirt, per root: what `git status` already reported before any
   * session-era change — the user's own uncommitted work.
   *
   * The poll's first sweep of a root *indexes* instead of adopting: every dirty
   * path is recorded here with its stat, and adoption only happens when a path
   * is missing from the index or its stat has moved since. Without this, opening
   * a session in a repo with uncommitted work instantly "reviewed" all of it —
   * files no agent had touched. Dismissing a git-detected file writes its
   * current stat back into the index, which is what makes dismissal stick: the
   * file is still dirty in git's eyes, but review now considers that state
   * ambient until it changes again.
   *
   * `null` stat means "dirty but unstatable" (deleted while dirty).
   */
  private readonly ambientDirt = new Map<
    string,
    Map<string, { size: number; mtimeMs: number } | null>
  >()
  private timer: NodeJS.Timeout | null = null
  private polling = false
  private seq = 0
  private saveTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly getWebContents: () => WebContents | null,
    /** Distinct cwds of live sessions. Empty means there is nothing to poll. */
    private readonly liveRoots: () => string[],
  ) {
    // Fire-and-forget: `list()`/`read()` simply see an empty set until this
    // resolves, same as any other cold start. `push()` at the end is what lets
    // the renderer (which mounts after main, so it's always listening by then)
    // pick up whatever survived the restart.
    void this.load().then(() => this.push())
  }

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
    // Drop the pending debounce rather than let it fire later: by the time
    // dispose() runs, `entries` is about to be cleared, and a save landing
    // after that would overwrite good on-disk state with an empty set.
    // `flush()` is what's expected to have run first if the caller wants the
    // current set persisted (see index.ts's before-quit handler).
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    this.entries.clear()
    this.repoChecks.clear()
    this.ambientDirt.clear()
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
   *
   * The dismissed file's current stat is also written into the ambient index —
   * to git it's still dirty, and without this the very next poll would re-adopt
   * what the user just dismissed, five seconds after they dismissed it.
   */
  dismiss(paths: string[]): void {
    let changed = false
    for (const target of paths) {
      const entry = this.entries.get(target)
      if (!this.entries.delete(target)) continue
      changed = true
      removeBaselineFile(target)
      if (entry) this.recordAmbient(entry.file.root, target)
    }
    if (changed) this.push()
  }

  dismissAll(): void {
    if (this.entries.size === 0) return
    for (const [target, entry] of this.entries) {
      removeBaselineFile(target)
      this.recordAmbient(entry.file.root, target)
    }
    this.entries.clear()
    this.push()
  }

  /** Mark a path's current on-disk state as ambient — reviewed, or never ours. */
  private recordAmbient(root: string, target: string): void {
    const ambient = this.ambientDirt.get(root)
    if (!ambient) return
    const stat = statOrNull(target)
    ambient.set(target, stat ? { size: stat.size, mtimeMs: stat.mtimeMs } : null)
  }

  /**
   * Write the current set to disk right now, bypassing the debounce.
   *
   * Called from index.ts's shutdown path. Sync rather than the usual
   * `fsp`-based save: `before-quit` gives no guarantee an in-flight promise
   * gets to finish before the process exits, and losing the review set on
   * every quit is exactly the bug this class exists to fix.
   */
  flush(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    writeStateSync([...this.entries.values()])
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
    // Content is already in hand from the sync read above, so persisting it is
    // just a write, not a second read racing the edit — safe to do here rather
    // than deferring to the debounced save.
    if (snapshot.known && snapshot.content !== null) writeBaselineFileSync(target, snapshot.content)
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

    // A root that stopped being live loses its ambient index: by the time it's
    // live again, the user may have edited freely in between, and that work is
    // new ambient dirt to re-index — not agent changes to adopt. Pruned here,
    // before the early return, so it happens on the tick after liveness ends.
    for (const key of this.ambientDirt.keys()) {
      if (!roots.includes(key)) this.ambientDirt.delete(key)
    }
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
    const status = await statusPorcelain(root)

    /*
     * First sweep for this root: index, don't adopt. Everything git reports
     * dirty right now predates any change this session era could have made —
     * it's the user's own uncommitted work, and putting it in front of them as
     * "the agent changed this" was exactly wrong.
     */
    let ambient = this.ambientDirt.get(root)
    if (!ambient) {
      ambient = new Map()
      for (const change of status) {
        const target = path.resolve(root, change.relPath)
        if (isIgnored(target) || this.entries.has(target)) continue
        const stat = statOrNull(target)
        ambient.set(target, stat ? { size: stat.size, mtimeMs: stat.mtimeMs } : null)
      }
      this.ambientDirt.set(root, ambient)
      return false
    }

    let changed = false
    for (const change of status) {
      const target = path.resolve(root, change.relPath)
      if (isIgnored(target) || this.entries.has(target)) continue

      // Known ambient dirt that hasn't moved is still the user's, not review's.
      const recorded = ambient.get(target)
      if (recorded !== undefined) {
        const stat = statOrNull(target)
        const unchanged =
          recorded === null
            ? stat === null
            : stat !== null && stat.size === recorded.size && stat.mtimeMs === recorded.mtimeMs
        if (unchanged) continue
        // It moved during the session era — it's a real change now. Drop the
        // ambient record so future polls treat it like any tracked file.
        ambient.delete(target)
      }

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
    if (baseline !== null) writeBaselineFileSync(target, baseline)
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
   *
   * Every call site that mutates `entries` calls this, which makes it the one
   * place to also schedule a save — there is no separate list of "the events
   * that need persisting" to keep in sync with reality.
   */
  private push(): void {
    this.scheduleSave()
    const contents = this.getWebContents()
    if (!contents || contents.isDestroyed()) return
    this.seq += 1
    const envelope: ReviewEnvelope = { seq: this.seq, files: this.list() }
    contents.send(REVIEW_CHANNEL, envelope)
  }

  /** Debounce writes so a burst of touches (a multi-file edit turn) is one save. */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      void writeState([...this.entries.values()])
    }, SAVE_DEBOUNCE_MS)
    this.saveTimer.unref?.()
  }

  /**
   * Rebuild `entries` from disk. Every failure — missing dir, corrupt JSON, a
   * `state.json` entry whose baseline file is gone — drops just that entry (or
   * the whole file) rather than throwing: a partially-recovered review set is
   * fine, a startup crash over a stale cache file is not.
   */
  private async load(): Promise<void> {
    let raw: string
    try {
      raw = await fsp.readFile(STATE_FILE, 'utf8')
    } catch {
      return
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object') return
    const record = parsed as Record<string, unknown>
    if (!Array.isArray(record.entries)) return

    for (const raw of record.entries as unknown[]) {
      const entry = await reviveEntry(raw)
      if (entry) this.entries.set(entry.file.path, entry)
    }
  }
}

/** Shared shape between the async and sync save paths. */
function toPersisted(entry: Entry): PersistedEntry {
  return {
    path: entry.file.path,
    relPath: entry.file.relPath,
    root: entry.file.root,
    tabId: entry.file.tabId,
    firstTouchedAt: entry.file.firstTouchedAt,
    lastChangedAt: entry.file.lastChangedAt,
    deleted: entry.file.deleted,
    baseline: entry.baseline === null ? 'none' : entry.baselineKnown ? 'stored' : 'unknown',
    size: entry.size,
    mtimeMs: entry.mtimeMs,
  }
}

/**
 * Write `state.json` for the debounced path. Temp-then-rename so a crash or a
 * quit racing this write never leaves a half-written, unparseable file behind
 * — `load()` would otherwise drop the *entire* set over one torn write.
 */
async function writeState(entries: Entry[]): Promise<void> {
  const payload: PersistedState = { version: 1, entries: entries.map(toPersisted) }
  try {
    await fsp.mkdir(REVIEW_DIR, { recursive: true })
    const tmp = `${STATE_FILE}.tmp`
    await fsp.writeFile(tmp, JSON.stringify(payload), 'utf8')
    await fsp.rename(tmp, STATE_FILE)
  } catch {
    // Best-effort: a failed save just means a restart replays fewer files,
    // never worth crashing or surfacing to the user over.
  }
}

/** Same contract as {@link writeState}, blocking, for the quit path. */
function writeStateSync(entries: Entry[]): void {
  const payload: PersistedState = { version: 1, entries: entries.map(toPersisted) }
  try {
    fs.mkdirSync(REVIEW_DIR, { recursive: true })
    const tmp = `${STATE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(payload), 'utf8')
    fs.renameSync(tmp, STATE_FILE)
  } catch {
    // Same tolerance as writeState — quit must never hang or throw over this.
  }
}

/** Blocking baseline write. See `readSnapshot`: the content is already in hand. */
function writeBaselineFileSync(target: string, content: string): void {
  try {
    fs.mkdirSync(BASELINES_DIR, { recursive: true })
    fs.writeFileSync(baselineFilePath(target), content, 'utf8')
  } catch {
    // Best-effort. The in-memory baseline still serves this session either way.
  }
}

function removeBaselineFile(target: string): void {
  try {
    fs.unlinkSync(baselineFilePath(target))
  } catch {
    // Already gone, or never written (e.g. a `baseline: null` entry) — fine.
  }
}

/**
 * Reconstruct one `Entry` from its persisted form, or `null` to drop it.
 *
 * A dropped entry isn't a bug report: the next time the agent (or a manual
 * poll) touches that path it gets re-added with a fresh baseline, same as any
 * other new file. Silently losing a stale entry is strictly better than
 * showing a diff that can no longer be trusted.
 */
async function reviveEntry(raw: unknown): Promise<Entry | null> {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>

  if (typeof r.path !== 'string' || typeof r.relPath !== 'string' || typeof r.root !== 'string') {
    return null
  }
  if (typeof r.firstTouchedAt !== 'number' || typeof r.lastChangedAt !== 'number') return null
  if (r.baseline !== 'none' && r.baseline !== 'stored' && r.baseline !== 'unknown') return null

  let baseline: string | null = null
  let baselineKnown = false
  if (r.baseline === 'none') {
    baselineKnown = true
  } else if (r.baseline === 'stored') {
    try {
      baseline = await fsp.readFile(baselineFilePath(r.path), 'utf8')
      baselineKnown = true
    } catch {
      // Promised on disk, not actually there — drop the entry rather than
      // show marks (or no marks) that don't reflect a real baseline.
      return null
    }
  }
  // else 'unknown': baselineKnown stays false, matching the pre-restart state
  // where capture had already failed and marks were suppressed.

  // Requirement is existence only, not a full restat: `deleted` flips false ->
  // true for a file that vanished while the app was closed, but a file that's
  // merely changed is left alone — the next `review:file` / poll recomputes
  // marks and mtimes on its own schedule, not eagerly here.
  const gone = statOrNull(r.path) === null
  const tabId = typeof r.tabId === 'string' ? r.tabId : undefined
  const size = typeof r.size === 'number' ? r.size : 0
  const mtimeMs = typeof r.mtimeMs === 'number' ? r.mtimeMs : 0

  return {
    file: {
      path: r.path,
      relPath: r.relPath,
      root: r.root,
      tabId,
      firstTouchedAt: r.firstTouchedAt,
      lastChangedAt: r.lastChangedAt,
      deleted: gone ? true : Boolean(r.deleted),
    },
    baseline,
    baselineKnown,
    size,
    mtimeMs,
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
