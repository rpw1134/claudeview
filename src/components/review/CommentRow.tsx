import { Check, RotateCcw, X } from 'lucide-react'
import type { ReviewComment } from '@/stores/reviewStore'
import { cn } from '@/lib/utils'

/**
 * One written comment, under the last line it covers.
 *
 * Resolved comments collapse to a single struck-through line rather than
 * disappearing. Disappearing would be the same signal as deleting, and the two mean
 * different things: resolved is a record that you looked at it, and the record is
 * the point — otherwise the way to find out what you'd already dealt with is to
 * remember.
 */
export function CommentRow({
  comment,
  onToggleResolved,
  onDelete,
}: {
  comment: ReviewComment
  onToggleResolved: () => void
  onDelete: () => void
}) {
  const range =
    comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}–L${comment.endLine}`

  if (comment.resolved) {
    return (
      <div className="flex items-center gap-2 px-3 py-1">
        <span className="min-w-0 flex-1 truncate text-xs text-text-faint line-through">
          {range} {comment.text}
        </span>
        <IconAction label="Reopen this comment" onClick={onToggleResolved}>
          <RotateCcw size={12} />
        </IconAction>
        <IconAction label="Delete this comment" onClick={onDelete}>
          <X size={12} />
        </IconAction>
      </div>
    )
  }

  return (
    <div className="hand-sm-1 bg-surface px-3 py-2">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text" data-selectable>
            {comment.text}
          </p>
          <p className="mt-1 truncate font-mono text-xs text-text-faint">
            {range}
            {comment.excerpt ? ` · ${comment.excerpt}` : ''}
          </p>
        </div>

        {comment.sentAt ? (
          <span className="hand-sm-1 shrink-0 bg-raised px-1.5 py-0.5 text-xs text-text-faint">
            sent
          </span>
        ) : null}

        <IconAction label="Mark this comment resolved" onClick={onToggleResolved}>
          <Check size={13} />
        </IconAction>
        <IconAction label="Delete this comment" onClick={onDelete}>
          <X size={13} />
        </IconAction>
      </div>
    </div>
  )
}

/** A quiet icon action: no fill until hover, same as every other row control. */
function IconAction({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'hand-sm-1 flex h-6 w-6 shrink-0 items-center justify-center text-text-faint',
        'transition-colors hover:bg-raised hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
