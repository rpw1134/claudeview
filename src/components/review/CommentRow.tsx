import { Check, RotateCcw, X } from 'lucide-react'
import type { ReviewComment } from '@/stores/reviewStore'
import { cn } from '@/lib/utils'

/**
 * One written comment, quiet by default.
 *
 * ## No card
 *
 * No fill, no spine, no rounded box — the note is a row of text inside the
 * hairline block `ReviewCodePane` draws under the line it belongs to. That
 * block is what says "this is a comment", so the row itself carries none of
 * that signal on its own; it only needs to read as one line among others.
 *
 * `showMeta` draws the line reference and the quoted excerpt beneath the text.
 * Inline (the default) that's redundant — the row already sits directly under
 * the line it's about — so it's off. Orphaned comments (`ReviewCodePane`'s
 * "no longer exist" section) turn it on: there's no code above them to anchor
 * to, so the line number and excerpt are the only way to tell which line they
 * meant.
 *
 * ## The actions wait to be asked for
 *
 * Resolve and delete are ghost icons that appear on hover of the row (and on
 * keyboard focus — they stay in the tab order and keep their labels, so hiding
 * them is a visual quiet, not a removal).
 *
 * ## Resolved collapses; it does not vanish
 *
 * Disappearing would be the same signal as deleting, and the two mean different
 * things: resolved is a record that you looked at it, and the record is the
 * point — otherwise the way to find out what you'd already dealt with is to
 * remember.
 */
export function CommentRow({
  comment,
  onToggleResolved,
  onDelete,
  showMeta = false,
}: {
  comment: ReviewComment
  onToggleResolved: () => void
  onDelete: () => void
  /** Show the line reference and quoted excerpt beneath the text. */
  showMeta?: boolean
}) {
  const range =
    comment.startLine === comment.endLine
      ? `L${comment.startLine}`
      : `L${comment.startLine}–L${comment.endLine}`

  if (comment.resolved) {
    return (
      <div className="group flex items-center gap-2 py-1">
        <span className="min-w-0 flex-1 truncate text-xs text-text-faint line-through">
          {showMeta ? `${range} ` : ''}
          {comment.text}
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
    <div className="group flex items-start gap-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="whitespace-pre-wrap text-sm text-text" data-selectable>
          {comment.text}
        </p>
        {showMeta ? (
          <p className="mt-0.5 truncate font-mono text-xs text-text-faint">
            {range}
            {comment.excerpt ? ` · ${comment.excerpt}` : ''}
          </p>
        ) : null}
      </div>

      {comment.sentAt ? <span className="shrink-0 text-xs text-text-faint">sent</span> : null}

      <IconAction label="Mark this comment resolved" onClick={onToggleResolved}>
        <Check size={13} />
      </IconAction>
      <IconAction label="Delete this comment" onClick={onDelete}>
        <X size={13} />
      </IconAction>
    </div>
  )
}

/**
 * A quiet icon action: invisible until the row is hovered or the button itself is
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
        'flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-text-faint',
        'opacity-0 transition-all duration-150 group-hover:opacity-100 focus-visible:opacity-100',
        'hover:bg-raised hover:text-text',
      )}
    >
      {children}
    </button>
  )
}
