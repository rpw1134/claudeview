import { Check, RotateCcw, X } from 'lucide-react'
import type { ReviewComment } from '@/stores/reviewStore'
import { cn } from '@/lib/utils'

/**
 * One written comment, under the last line it covers.
 *
 * ## It's a note, not a table cell
 *
 * The card is the app's drawn object: uneven corners, a `surface` fill, and a 2px
 * spine down its left edge. The spine is what makes it read as *written* rather
 * than as a grey slab — it's the margin rule you'd draw beside a note, it lines the
 * card up under the code above it, and its colour says whether the note is still
 * live: accent while it's waiting on someone, ink once it has been sent.
 *
 * Inside, the hierarchy is your words first (full-contrast, at reading size) and
 * the line reference and quoted source beneath in faint mono. That's the order you
 * read it in — you know which line you're on, you're re-reading what you said.
 *
 * ## The actions wait to be asked for
 *
 * Resolve and delete are ghost icons that appear on hover of the card (and on
 * keyboard focus — they stay in the tab order and keep their labels, so hiding them
 * is a visual quiet, not a removal). A column of tick-and-cross pairs down a file
 * of comments is four glyphs of chrome per sentence of content.
 *
 * ## Resolved collapses; it does not vanish
 *
 * Disappearing would be the same signal as deleting, and the two mean different
 * things: resolved is a record that you looked at it, and the record is the point —
 * otherwise the way to find out what you'd already dealt with is to remember.
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
      <div className="group hand-sm-1 flex items-center gap-2 border-l-2 border-line px-3 py-1">
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
    <div
      className={cn(
        'group hand-sm-1 border-l-2 bg-surface px-3 py-2',
        // Sent is the quieter state: still open, but no longer the thing this
        // surface is waiting for you to do something about.
        comment.sentAt ? 'border-ink' : 'border-accent',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-text" data-selectable>
            {comment.text}
          </p>
          {/* The quoted line sits under the note the way a citation does — mono,
              faint, truncated. It's a reminder of *which* line, never a copy of it. */}
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

/**
 * A quiet icon action: invisible until the card is hovered or the button itself is
 * focused, then the same no-fill-until-hover treatment as every other row control.
 * `opacity` rather than conditional rendering, so nothing reflows on hover and the
 * button never leaves the tab order.
 */
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
        'opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100',
        'hover:bg-raised hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
