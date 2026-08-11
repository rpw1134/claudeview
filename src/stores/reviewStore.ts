import { create } from 'zustand'
import type { ReviewFile } from '@shared/ipc'
import { api } from '@/lib/api'
import { useSessionStore } from './sessionStore'
// One-directional: workspaceStore never imports from here.
import { useWorkspaceStore } from './workspaceStore'

const PERSIST_KEY = 'claudeview.review.comments.v1'
const VIEWED_KEY = 'claudeview.review.viewed.v1'
/** Excerpts are a reminder of *which* line, not a copy of it. */
const EXCERPT_MAX = 80

/**
 * A note attached to a line range of a file.
 *
 * Comments are keyed by absolute path rather than by review-set entry, and they
 * deliberately **survive dismissal of their file**. Dismissing means "I've read
 * this"; the file comes back the moment an agent touches it again, and losing the
 * note you'd written about it in between would be a silent data loss for the one
 * piece of state in this surface the user actually authored.
 *
 * `sentAt` is a stamp, not a lifecycle: a sent comment stays in the list so you can
 * see what you already asked for, and can be resolved or deleted afterwards.
 */
export type ReviewComment = {
  id: string
  /** Absolute path, matching `ReviewFile.path`. */
  path: string
  /** 1-indexed, inclusive, on the content as it was when the comment was written. */
  startLine: number
  endLine: number
  /** First selected line, trimmed — enough to recognise the range later. */
  excerpt: string
  text: string
  resolved: boolean
  sentAt?: number
  createdAt: number
}

type ReviewState = {
  files: ReviewFile[]
  activePath: string | null
  comments: ReviewComment[]
  /** False until the first `review:list` lands, so the empty state isn't a flash. */
  loaded: boolean
  /**
   * When each file was last looked at, keyed by absolute path. A file whose
   * `lastChangedAt` is newer than its stamp is *unviewed* — the signal that
   * feeds the tree dots and the toolbar badge. Persisted, because "which of
   * these have I already read" is exactly the state a restart must not reset.
   */
  viewedAt: Record<string, number>

  /** Apply one push (or the initial list). The whole set, never a delta. */
  setFiles: (files: ReviewFile[]) => void
  setActivePath: (path: string) => void

  addComment: (input: {
    path: string
    startLine: number
    endLine: number
    excerpt: string
    text: string
  }) => void
  removeComment: (id: string) => void
  toggleResolved: (id: string) => void

  dismiss: (paths: string[]) => Promise<void>
  dismissAll: () => Promise<void>

  /**
   * Send the unresolved comments on `paths` to one session.
   *
   * Session-scoped rather than global: changes belong to the session that made
   * them, so feedback goes back to that session — there is no "pick a target"
   * step, because the target is a fact about the files, not a choice.
   */
  sendCommentsFor: (tabId: string, paths: string[]) => Promise<number>
}

function persist(comments: ReviewComment[]): ReviewComment[] {
  try {
    localStorage.setItem(PERSIST_KEY, JSON.stringify(comments))
  } catch {
    // A full or disabled localStorage must not take the app down.
  }
  return comments
}

function persistViewed(viewedAt: Record<string, number>): Record<string, number> {
  try {
    localStorage.setItem(VIEWED_KEY, JSON.stringify(viewedAt))
  } catch {
    // Same policy as comments: viewing state is never worth an exception.
  }
  return viewedAt
}

function loadViewed(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {}
  } catch {
    return {}
  }
}

export const isUnviewed = (file: ReviewFile, viewedAt: Record<string, number>): boolean =>
  file.lastChangedAt > (viewedAt[file.path] ?? 0)

function loadPersisted(): ReviewComment[] {
  try {
    const raw = localStorage.getItem(PERSIST_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ReviewComment[]) : []
  } catch {
    return []
  }
}

/**
 * Keep the open file open.
 *
 * The set re-sorts on every push (most-recently-changed first), so following the
 * first entry would yank you off whatever you were reading the instant an agent
 * saved something else. The active file only moves when it leaves the set.
 */
function resolveActive(files: ReviewFile[], current: string | null): string | null {
  if (current && files.some((file) => file.path === current)) return current
  return files[0]?.path ?? null
}

export function excerptFrom(line: string | undefined): string {
  const trimmed = (line ?? '').trim()
  return trimmed.length > EXCERPT_MAX ? `${trimmed.slice(0, EXCERPT_MAX - 1)}…` : trimmed
}

/**
 * Compose the batch message.
 *
 * One message for every comment rather than one per comment: a review is a single
 * unit of feedback, and ten separate turns would have the agent re-planning after
 * each one. Grouped by file and ordered by line, because that is the order it will
 * work through them in.
 *
 * Files are named by `relPath` where the entry is still in the set, and by absolute
 * path where it isn't — a comment outlives its file's dismissal, and an unlabelled
 * heading would leave the agent guessing.
 */
export function composeReviewMessage(comments: ReviewComment[], files: ReviewFile[]): string {
  const labels = new Map(files.map((file) => [file.path, file.relPath]))

  const byPath = new Map<string, ReviewComment[]>()
  for (const comment of comments) {
    const bucket = byPath.get(comment.path)
    if (bucket) bucket.push(comment)
    else byPath.set(comment.path, [comment])
  }

  const sections: string[] = []
  for (const [path, bucket] of byPath) {
    const lines = [...bucket]
      .sort((a, b) => a.startLine - b.startLine)
      .map((comment) => {
        const range =
          comment.startLine === comment.endLine
            ? `L${comment.startLine}`
            : `L${comment.startLine}–L${comment.endLine}`
        const excerpt = comment.excerpt ? ` (\`${comment.excerpt}\`)` : ''
        return `- **${range}**${excerpt}: ${comment.text.trim()}`
      })
    sections.push(`## ${labels.get(path) ?? path}\n${lines.join('\n')}`)
  }

  const count = comments.length
  return (
    `Code review feedback (${count} comment${count === 1 ? '' : 's'}):\n\n` +
    `${sections.join('\n\n')}\n\n` +
    'Please address each point and reply with what you changed per comment.'
  )
}

/**
 * Reap a closed session's review files.
 *
 * A session that closes takes its uncommented files out of the review set —
 * "review it later" stops meaning anything once the conversation that made the
 * changes is gone, and the Review tab lingering over a dead queue read as a
 * bug. The exception is deliberate and matches the standing rule that authored
 * state never silently vanishes: a file carrying an UNRESOLVED comment stays,
 * because the note on it is yours, not the session's.
 *
 * Module-level watcher rather than logic inside closeTab: the session store
 * shouldn't know review exists, and this fires on every path a tab dies by —
 * explicit close, panel close, restore-pruning.
 */
let watchedTabIds: Set<string> | null = null
useSessionStore.subscribe((state) => {
  const current = new Set(state.tabs.map((tab) => tab.id))
  const previous = watchedTabIds
  watchedTabIds = current
  if (!previous) return

  const removed = [...previous].filter((tabId) => !current.has(tabId))
  if (removed.length === 0) return

  const gone = new Set(removed)
  const { files, comments } = useReviewStore.getState()
  const keepPaths = new Set(
    comments.filter((comment) => !comment.resolved).map((comment) => comment.path),
  )
  const reap = files
    .filter((file) => file.tabId && gone.has(file.tabId) && !keepPaths.has(file.path))
    .map((file) => file.path)
  if (reap.length > 0) void useReviewStore.getState().dismiss(reap)
})

export const useReviewStore = create<ReviewState>()((setState, getState) => ({
  files: [],
  activePath: null,
  comments: loadPersisted(),
  loaded: false,
  viewedAt: loadViewed(),

  setFiles: (files) =>
    setState((state) => {
      const activePath = resolveActive(files, state.activePath)
      /*
       * A push that lands while the active file is on screen counts as viewing
       * it — you're literally watching the change arrive. But only when review
       * mode is actually showing: in panels mode the surface is hidden, and
       * stamping there would silently mark files read that nobody has seen.
       */
      const reviewing = useWorkspaceStore.getState().mode === 'review'
      const viewedAt =
        reviewing && activePath
          ? persistViewed({ ...state.viewedAt, [activePath]: Date.now() })
          : state.viewedAt
      return { files, loaded: true, activePath, viewedAt }
    }),

  setActivePath: (path) =>
    setState((state) => ({
      activePath: path,
      viewedAt: persistViewed({ ...state.viewedAt, [path]: Date.now() }),
    })),

  addComment: (input) =>
    setState((state) => ({
      comments: persist([
        ...state.comments,
        {
          id: crypto.randomUUID(),
          ...input,
          text: input.text.trim(),
          resolved: false,
          createdAt: Date.now(),
        },
      ]),
    })),

  removeComment: (id) =>
    setState((state) => ({
      comments: persist(state.comments.filter((comment) => comment.id !== id)),
    })),

  toggleResolved: (id) =>
    setState((state) => ({
      comments: persist(
        state.comments.map((comment) =>
          comment.id === id ? { ...comment, resolved: !comment.resolved } : comment,
        ),
      ),
    })),

  /**
   * Drop paths locally, then tell main.
   *
   * Optimistic because dismissal is the one action here with no result to wait
   * for — the authoritative push follows within a frame or two and would only
   * confirm what the user already did. Comments are untouched, deliberately.
   */
  dismiss: async (paths) => {
    if (paths.length === 0) return
    const dropped = new Set(paths)
    setState((state) => {
      const files = state.files.filter((file) => !dropped.has(file.path))
      return { files, activePath: resolveActive(files, state.activePath) }
    })
    await api['review:dismiss']({ paths })
  },

  dismissAll: async () => {
    setState({ files: [], activePath: null })
    await api['review:dismiss-all']()
  },

  sendCommentsFor: async (tabId, paths) => {
    const { comments, files } = getState()
    const included = new Set(paths)
    const pending = comments.filter(
      (comment) => !comment.resolved && included.has(comment.path),
    )
    if (pending.length === 0) return 0

    await useSessionStore.getState().send(tabId, composeReviewMessage(pending, files))

    // Stamped after the send resolves, so a failed send doesn't leave comments
    // claiming to have been delivered.
    const sentAt = Date.now()
    const sent = new Set(pending.map((comment) => comment.id))
    setState((state) => ({
      comments: persist(
        state.comments.map((comment) =>
          sent.has(comment.id) ? { ...comment, sentAt } : comment,
        ),
      ),
    }))
    return pending.length
  },
}))
