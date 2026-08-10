import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, MessageSquare, Trash2, X } from 'lucide-react'
import type { ReviewFile } from '@shared/ipc'
import { excerptFrom, useReviewStore, type ReviewComment } from '@/stores/reviewStore'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { CodeLine } from './CodeLine'
import { CommentComposer } from './CommentComposer'
import { CommentRow } from './CommentRow'
import { highlightFile, MAX_LINES } from './highlight'
import { countMarks, markMap, useReviewFile } from './useReviewFile'

/**
 * The file under review: header, then line-numbered read-only code.
 *
 * Read-only is a design position, not a missing feature. The agent makes the
 * changes; this surface exists to say *which lines matter* and to attach words to
 * them. An editable pane would put a second author on the file and make "who wrote
 * this line" a question the review set can't answer.
 */
export function ReviewCodePane({
  file,
  sessionTitle,
  comments,
  onAddComment,
  onToggleResolved,
  onDeleteComment,
  onDismiss,
}: {
  file: ReviewFile
  /** Title of the session that last touched it, when that tab is still open. */
  sessionTitle?: string
  comments: ReviewComment[]
  onAddComment: (input: { startLine: number; endLine: number; excerpt: string; text: string }) => void
  onToggleResolved: (id: string) => void
  onDeleteComment: (id: string) => void
  onDismiss: () => void
}) {
  const { body, loading, missing } = useReviewFile(file.path, file.lastChangedAt)
  const [selection, setSelection] = useState<{ anchor: number; head: number } | null>(null)
  const dragging = useRef(false)

  /*
   * The global show/hide, and the per-line overrides it doesn't erase.
   *
   * `commentsVisible` is the master switch: off, no comment rows render anywhere
   * in the pane, though the gutter markers stay so you know they exist. On, every
   * line with comments defaults to expanded — `collapsedLines` only records the
   * lines a click has *removed* from that default, so a line you collapsed stays
   * collapsed if you flip the master switch off and back on, but nothing needs an
   * entry just to be shown. Both are pane-local: `ReviewCodePane` remounts per
   * file (see `ReviewView`), so switching files resets both for free.
   */
  const [commentsVisible, setCommentsVisible] = useState(() =>
    comments.some((comment) => !comment.resolved),
  )
  const [collapsedLines, setCollapsedLines] = useState<Set<number>>(() => new Set())

  const onToggleLineComments = useCallback((line: number) => {
    setCollapsedLines((current) => {
      const next = new Set(current)
      if (next.has(line)) next.delete(line)
      else next.add(line)
      return next
    })
  }, [])

  /*
   * Has this user ever written a comment, anywhere?
   *
   * The one-line hint below the header teaches the gutter click, which nobody was
   * finding on their own. It is scoped to *ever*, not to this file: once you have
   * written a single comment you know how, and a permanent instruction you have
   * already followed is noise sitting on top of the code. Selecting the boolean
   * rather than the array keeps this from re-rendering the pane on every keystroke
   * that lands in the store.
   */
  const neverCommented = useReviewStore((state) => state.comments.length === 0)

  // A drag can end anywhere — over the header, outside the window — so the
  // release is watched globally rather than on the rows it started in.
  useEffect(() => {
    const stop = () => {
      dragging.current = false
    }
    window.addEventListener('mouseup', stop)
    return () => window.removeEventListener('mouseup', stop)
  }, [])

  /*
   * Stable handlers, so `CodeLine`'s memo actually holds.
   *
   * Dragging down the gutter changes selection on every line crossed. With inline
   * arrows here every one of those updates would hand all five thousand rows new
   * props and re-render the entire file per line; with these, only the rows whose
   * `selected` changed do any work. Both close over nothing but the setters.
   */
  const onGutterMouseDown = useCallback((line: number, shiftKey: boolean) => {
    dragging.current = true
    setSelection((current) =>
      shiftKey && current ? { ...current, head: line } : { anchor: line, head: line },
    )
  }, [])

  const onGutterMouseEnter = useCallback((line: number) => {
    if (!dragging.current) return
    setSelection((current) => (current ? { ...current, head: line } : current))
  }, [])

  const content = body?.content ?? ''
  const highlighted = useMemo(
    () => (content ? highlightFile(file.path, content) : null),
    [file.path, content],
  )
  const lineKinds = useMemo(() => markMap(body?.marks ?? []), [body])
  const counts = countMarks(body?.marks ?? [])

  const commentsByLine = useMemo(() => {
    const byLine = new Map<number, ReviewComment[]>()
    for (const comment of comments) {
      const bucket = byLine.get(comment.endLine)
      if (bucket) bucket.push(comment)
      else byLine.set(comment.endLine, [comment])
    }
    return byLine
  }, [comments])

  const range = selection
    ? {
        start: Math.min(selection.anchor, selection.head),
        end: Math.max(selection.anchor, selection.head),
      }
    : null

  const header = (
    <PaneHeader
      file={file}
      sessionTitle={sessionTitle}
      counts={counts}
      commentCount={comments.length}
      commentsVisible={commentsVisible}
      onToggleCommentsVisible={() => setCommentsVisible((visible) => !visible)}
      onDismiss={onDismiss}
    />
  )

  if (file.deleted || missing) {
    return (
      <Pane header={header}>
        <Notice>
          <p className="text-sm text-text-muted">This file was deleted.</p>
          <Button size="sm" variant="subtle" onClick={onDismiss}>
            Dismiss it
          </Button>
        </Notice>
      </Pane>
    )
  }

  if (body?.tooLarge) {
    return (
      <Pane header={header}>
        <Notice>
          <p className="text-sm text-text-muted">This file is too large to review here.</p>
          <p className="text-xs text-text-faint">
            Files over 2MB aren’t sent to the renderer. Open it in an editor instead.
          </p>
        </Notice>
      </Pane>
    )
  }

  if (loading || !highlighted) {
    return (
      <Pane header={header}>
        <Notice>
          <p className="text-sm text-text-faint">{loading ? 'Reading…' : 'This file is empty.'}</p>
        </Notice>
      </Pane>
    )
  }

  /*
   * Comments whose line no longer exists.
   *
   * A comment records the file as it was when you wrote it, and the agent may have
   * since deleted those lines — or the line may be past the 5000-line cap. Anchoring
   * them to a line that isn't rendered would hide them while still sending them,
   * which is the worst of both. They collect at the bottom instead, labelled.
   */
  const orphans = comments.filter((comment) => comment.endLine > highlighted.lines.length)

  return (
    <Pane header={header}>
      {/*
        The one piece of instruction on this surface, and it retires itself.
        Commenting is a gutter click, which is the convention everywhere code is
        reviewed and is still invisible until you try it — the hover `+` shows the
        target, this names the gesture. Faint, one line, above the code rather than
        floating over it.
      */}
      {neverCommented ? (
        <p className="shrink-0 border-b border-line px-4 py-1 text-xs text-text-faint">
          Click a line number to comment — drag for a range.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto py-2">
        {highlighted.lines.map((html, index) => {
          const number = index + 1
          const lineComments = commentsByLine.get(number)
          const composing = range?.end === number
          // A line defaults open the moment its comments become visible; a click
          // on its marker is the only thing that can remove it from that default.
          const lineExpanded = !collapsedLines.has(number)
          const showRows = commentsVisible && lineExpanded && !!lineComments

          return (
            <Fragment key={number}>
              <CodeLine
                number={number}
                html={html}
                kind={lineKinds.get(number)}
                selected={range !== null && number >= range.start && number <= range.end}
                commentCount={lineComments?.length ?? 0}
                hasUnresolved={lineComments?.some((comment) => !comment.resolved) ?? false}
                commentsExpanded={showRows}
                onGutterMouseDown={onGutterMouseDown}
                onGutterMouseEnter={onGutterMouseEnter}
                onToggleComments={onToggleLineComments}
              />

              {showRows || composing ? (
                // `sticky left-0`: code rows are as wide as their longest line, so
                // a horizontally scrolled file would otherwise carry its comments
                // off to the left with the origin. The single hairline sits at the
                // gutter edge (`pl-14` on the outer, `pl-3` inside it, matching
                // `CodeLine`'s own gutter-to-text offset) rather than a drawn box.
                <div className="sticky left-0 min-w-0 pl-14 pr-4">
                  <div className="space-y-1 border-l border-line py-1 pl-3">
                    {showRows
                      ? lineComments?.map((comment) => (
                          <CommentRow
                            key={comment.id}
                            comment={comment}
                            onToggleResolved={() => onToggleResolved(comment.id)}
                            onDelete={() => onDeleteComment(comment.id)}
                          />
                        ))
                      : null}
                    {composing && range ? (
                      <CommentComposer
                        startLine={range.start}
                        endLine={range.end}
                        onCancel={() => setSelection(null)}
                        onSubmit={(text) => {
                          onAddComment({
                            startLine: range.start,
                            endLine: range.end,
                            excerpt: excerptFrom(content.split('\n')[range.start - 1]),
                            text,
                          })
                          /*
                           * Writing a comment is the strongest possible signal
                           * you want to see comments. Without this, a file whose
                           * first comment you just wrote (visibility initialized
                           * false) swallowed it on Enter — written, saved, and
                           * instantly invisible.
                           */
                          setCommentsVisible(true)
                          setCollapsedLines((current) => {
                            if (!current.has(range.end)) return current
                            const next = new Set(current)
                            next.delete(range.end)
                            return next
                          })
                          setSelection(null)
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              ) : null}
            </Fragment>
          )
        })}

        {commentsVisible && orphans.length > 0 ? (
          <div className="space-y-1 px-4 py-3">
            <p className="text-xs text-text-faint">Comments on lines that no longer exist</p>
            {orphans.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                onToggleResolved={() => onToggleResolved(comment.id)}
                onDelete={() => onDeleteComment(comment.id)}
                showMeta
              />
            ))}
          </div>
        ) : null}

        {highlighted.truncated ? (
          <p className="px-4 py-3 text-xs text-text-faint">
            Showing the first {MAX_LINES.toLocaleString()} lines of{' '}
            {highlighted.totalLines.toLocaleString()}.
          </p>
        ) : null}
      </div>
    </Pane>
  )
}

function Pane({ header, children }: { header: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {header}
      {children}
    </div>
  )
}

/**
 * A change count, tinted to match the gutter bar it counts.
 *
 * The sigil is inside the pill, not replaced by it: `+` and `~` carry the meaning
 * on their own, so the tint is reinforcement rather than the only signal. The
 * `title` spells it out for anyone who hasn't met the shorthand.
 */
function CountPill({
  className,
  label,
  children,
}: {
  className: string
  label: string
  children: React.ReactNode
}) {
  return (
    <span
      title={label}
      className={cn(
        'hand-sm-1 px-1.5 py-0.5 font-mono text-xs tabular-nums',
        className,
      )}
    >
      {children}
    </span>
  )
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      {children}
    </div>
  )
}

/**
 * Path, owner, change summary, dismiss.
 *
 * The filename is the title of this view and now reads like one — `text-sm`,
 * medium weight. It was set at the same size and weight as the timestamps beside
 * it, which left the pane with no first thing to look at.
 *
 * The change summary is two tinted pills rather than a run of `+9 · ~8` grey
 * monospace. Same two numbers, but the fill puts them in the same visual family as
 * the gutter bars they are counting, so the header and the code agree about what
 * green and ochre mean here.
 *
 * Dismissal confirms **in place**: the trash icon swaps into a "Dismiss? ✓ ✕" row
 * for three seconds. A modal for this would be heavier than the action — it drops
 * one file from a list and the next edit brings it back — but it still deserves a
 * second beat, because the thing it silently discards is your place in the review.
 *
 * The comments toggle only appears once the file has any — nothing to show or hide
 * otherwise. `aria-pressed` and the title (`Show comments — N`) carry the state;
 * the accent tint on the icon is reinforcement, not the only signal.
 */
function PaneHeader({
  file,
  sessionTitle,
  counts,
  commentCount,
  commentsVisible,
  onToggleCommentsVisible,
  onDismiss,
}: {
  file: ReviewFile
  sessionTitle?: string
  counts: { added: number; modified: number }
  commentCount: number
  commentsVisible: boolean
  onToggleCommentsVisible: () => void
  onDismiss: () => void
}) {
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (!confirming) return
    const timer = setTimeout(() => setConfirming(false), 3000)
    return () => clearTimeout(timer)
  }, [confirming])

  return (
    <div className="flex h-11 shrink-0 items-center gap-3 border-b border-line px-4">
      <span
        className={cn(
          'min-w-0 truncate font-mono text-sm font-medium',
          file.deleted ? 'text-danger' : 'text-text',
        )}
        title={file.path}
      >
        {file.relPath}
      </span>

      {sessionTitle ? (
        <span className="min-w-0 shrink truncate text-xs text-text-faint">{sessionTitle}</span>
      ) : null}

      <span className="ml-auto flex shrink-0 items-center gap-1">
        {counts.added > 0 ? (
          <CountPill
            className="bg-success/15 text-text"
            label={`${counts.added} line${counts.added === 1 ? '' : 's'} added`}
          >
            +{counts.added}
          </CountPill>
        ) : null}
        {counts.modified > 0 ? (
          <CountPill
            className="bg-accent-wash text-text"
            label={`${counts.modified} line${counts.modified === 1 ? '' : 's'} modified`}
          >
            ~{counts.modified}
          </CountPill>
        ) : null}
      </span>

      {commentCount > 0 ? (
        <Button
          size="icon"
          variant="ghost"
          aria-pressed={commentsVisible}
          aria-label={commentsVisible ? 'Hide comments' : 'Show comments'}
          title={`Show comments — ${commentCount}`}
          onClick={onToggleCommentsVisible}
          className={commentsVisible ? 'text-accent hover:text-accent' : undefined}
        >
          <MessageSquare size={13} />
        </Button>
      ) : null}

      {confirming ? (
        <span className="flex shrink-0 items-center gap-1">
          <span className="text-xs text-text-muted">Dismiss?</span>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Confirm dismiss"
            onClick={() => {
              setConfirming(false)
              onDismiss()
            }}
          >
            <Check size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Keep this file"
            onClick={() => setConfirming(false)}
          >
            <X size={13} />
          </Button>
        </span>
      ) : (
        <Button
          size="icon"
          variant="ghost"
          aria-label="Dismiss this file"
          title="Dismiss this file"
          onClick={() => setConfirming(true)}
        >
          <Trash2 size={13} />
        </Button>
      )}
    </div>
  )
}
