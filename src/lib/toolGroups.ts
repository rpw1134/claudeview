import type { TranscriptItem } from '@/types/session'

export type ToolItem = Extract<TranscriptItem, { kind: 'tool' }>

/**
 * A transcript row as rendered, after consecutive tool calls have been folded
 * together.
 *
 * Grouping happens here — at render time, over the lane's items — rather than in
 * the store. The store's job is to be a faithful log of what the session did;
 * `tool-end` patches an item in place by `toolUseId` and `agent-start` links a
 * spawned lane to its call, and both of those get much harder if the items are
 * nested inside group objects. Presentation folding belongs to the presenter.
 */
export type TranscriptRun =
  | { kind: 'item'; id: string; item: TranscriptItem }
  | { kind: 'tool-group'; id: string; items: ToolItem[] }

/**
 * Fold adjacent tool calls into one run.
 *
 * A run of exactly one call stays a plain item: an accordion around a single row
 * is pure ceremony, and the collapsed group's whole justification — one evolving
 * line standing in for a wall of cards — has nothing to stand in for.
 *
 * Pure and array-in/array-out so the caller can memoize on the items reference;
 * see `Transcript`.
 */
export function groupTranscriptItems(items: TranscriptItem[]): TranscriptRun[] {
  const runs: TranscriptRun[] = []
  let pending: ToolItem[] = []

  const flush = (): void => {
    if (pending.length === 0) return
    if (pending.length === 1) {
      const only = pending[0]!
      runs.push({ kind: 'item', id: only.id, item: only })
    } else {
      runs.push({ kind: 'tool-group', id: pending[0]!.id, items: pending })
    }
    pending = []
  }

  for (const item of items) {
    if (item.kind === 'tool') {
      pending.push(item)
      continue
    }
    flush()
    runs.push({ kind: 'item', id: item.id, item })
  }
  flush()

  return runs
}

export type ToolGroupSummary = {
  /** True while the group's most recent call is still in flight. */
  running: boolean
  total: number
  ok: number
  failed: number
  /** The live label while running: the call happening now, plus what it's on. */
  current: string
}

export function summarizeToolGroup(items: ToolItem[]): ToolGroupSummary {
  const last = items[items.length - 1]
  let ok = 0
  let failed = 0
  for (const item of items) {
    if (item.status === 'ok') ok += 1
    else if (item.status === 'error') failed += 1
  }

  return {
    running: last?.status === 'running',
    total: items.length,
    ok,
    failed,
    current: last ? describeToolCall(last) : '',
  }
}

/**
 * A group opens itself when hiding it would hide something you need.
 *
 * Two cases: a failure (the reason you're watching at all), and a call that
 * spawned a subagent (its "Open" affordance is the only route into that lane, and
 * a collapsed label has nowhere to put it).
 */
export function shouldAutoExpand(items: ToolItem[]): boolean {
  return items.some((item) => item.status === 'error' || item.spawnedLaneId !== undefined)
}

/** `Edit · streamBuffers.ts` — the tool and, when there is one, its target. */
export function describeToolCall(item: ToolItem): string {
  const target = toolTarget(item)
  return target ? `${item.name} · ${target}` : item.name
}

/**
 * The one word that says *what* this call is on.
 *
 * Deliberately not `summarizeInput`'s hundred characters: that string is for the
 * expanded card, where a whole shell command is worth reading. Here it shares a
 * line with an animating mark and changes several times a second, so it has to be
 * short enough to be read in a glance it doesn't get.
 */
function toolTarget(item: ToolItem): string {
  const input = item.input
  if (!input || typeof input !== 'object') return ''
  const record = input as Record<string, unknown>

  const path = firstString(record, ['file_path', 'notebook_path'])
  if (path) return basename(path)

  if (item.name === 'Bash') {
    const command = firstString(record, ['command'])
    // The executable, not the arguments — `npm` beats forty characters of flags.
    if (command) return command.trim().split(/\s+/)[0] ?? ''
  }

  return ''
}

function firstString(record: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function basename(path: string): string {
  const parts = path.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}
