import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, Trash2, X } from 'lucide-react'
import type { ReviewFile } from '@shared/ipc'
import { excerptFrom, type ReviewComment } from '@/stores/reviewStore'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { CodeLine } from './CodeLine'
import { CommentComposer } from './CommentComposer'
import { CommentRow } from './CommentRow'
import { highlightFile, MAX_LINES } from './highlight'
import { markMap, summarizeMarks, useReviewFile } from './useReviewFile'

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
  const summary = summarizeMarks(body?.marks ?? [])

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
      summary={summary}
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
      <div className="min-h-0 flex-1 overflow-auto py-2">
        {highlighted.lines.map((html, index) => {
          const number = index + 1
          const lineComments = commentsByLine.get(number)
          const composing = range?.end === number

          return (
            <Fragment key={number}>
              <CodeLine
                number={number}
                html={html}
                kind={lineKinds.get(number)}
                selected={range !== null && number >= range.start && number <= range.end}
                onGutterMouseDown={onGutterMouseDown}
                onGutterMouseEnter={onGutterMouseEnter}
              />

              {lineComments || composing ? (
                // `sticky left-0`: code rows are as wide as their longest line, so
                // a horizontally scrolled file would otherwise carry its comments
                // off to the left with the origin.
                <div className="sticky left-0 min-w-0 space-y-1 py-1 pl-14 pr-4">
                  {lineComments?.map((comment) => (
                    <CommentRow
                      key={comment.id}
                      comment={comment}
                      onToggleResolved={() => onToggleResolved(comment.id)}
                      onDelete={() => onDeleteComment(comment.id)}
                    />
                  ))}
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
                        setSelection(null)
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
            </Fragment>
          )
        })}

        {orphans.length > 0 ? (
          <div className="space-y-1 px-4 py-3">
            <p className="text-xs text-text-faint">Comments on lines that no longer exist</p>
            {orphans.map((comment) => (
              <CommentRow
                key={comment.id}
                comment={comment}
                onToggleResolved={() => onToggleResolved(comment.id)}
                onDelete={() => onDeleteComment(comment.id)}
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
 * Dismissal confirms **in place**: the trash icon swaps into a "Dismiss? ✓ ✕" row
 * for three seconds. A modal for this would be heavier than the action — it drops
 * one file from a list and the next edit brings it back — but it still deserves a
 * second beat, because the thing it silently discards is your place in the review.
 */
function PaneHeader({
  file,
  sessionTitle,
  summary,
  onDismiss,
}: {
  file: ReviewFile
  sessionTitle?: string
  summary: string
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
          'min-w-0 truncate font-mono text-xs',
          file.deleted ? 'text-danger' : 'text-text',
        )}
        title={file.path}
      >
        {file.relPath}
      </span>

      {sessionTitle ? (
        <span className="min-w-0 shrink truncate text-xs text-text-faint">{sessionTitle}</span>
      ) : null}

      <span className="ml-auto shrink-0 font-mono text-xs tabular-nums text-text-faint">
        {summary}
      </span>

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
